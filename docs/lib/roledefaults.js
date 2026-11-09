// Rollernes startindstillinger: hvad en stol får af tænkning, egne instruktioner, kontrol og læsning af IN, når den får et begreb (fx Reviewer).
// Begrebet er ellers kun en etiket; her får det et indhold, som du kan se, rette og gendanne. Intet anvendes uden dit valg: appen viser først, hvad der ændres
// (konsekvensgennemgang), og du vælger at bruge det, beholde stolens egne indstillinger eller fortryde.
// Rollerne rører kun de syv dials om tænkning og kritisk vurdering (Selvstændighed, regler og omkostning er dine egne valg), plus egne instruktioner,
// kontrolstol og læs IN. Ren logik uden DOM og Electron. window.RundbordRoleDefaults i appen, require() i main.js og node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordRoleDefaults = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // De dials en rolle kan sætte, med de tilstande og den styrke, kataloget har (renderer/01-catalog.js).
  var SPECS = {
    reason: { states: ["off", "on", "auto"], hasStrength: true },
    challenge: { states: ["off", "on", "auto"], hasStrength: true },
    curiosity: { states: ["off", "on", "auto"], hasStrength: true },
    risk: { states: ["off", "on", "auto"], hasStrength: true },
    selfCheck: { states: ["off", "on"], hasStrength: false },
    humanImpact: { states: ["off", "on", "auto"], hasStrength: false },
    uncertainty: { states: ["off", "on"], hasStrength: false },
  };
  var DIAL_KEYS = ["reason", "challenge", "curiosity", "risk", "selfCheck", "humanImpact", "uncertainty"];
  var MAX_LINES = 8;
  var MAX_LINE = 200;

  // Forslag til de vigtigste roller. Korte, konkrete opgaver (hvad stolen skal aflevere og være varsom med), ikke «du er en erfaren …».
  // checks/readsIn: null = uændret. Ændrer en rolle kontrol eller læsning af IN, siger konsekvensgennemgangen, at det kan koste mere.
  var BUILTIN = {
    Orchestrator: {
      dials: { reason: { state: "on", strength: 6 }, uncertainty: { state: "on" } },
      additions: {
        da: ["Del opgaven i klare delopgaver, og sig, hvilken stol der skal tage hver.", "Løs ikke delopgaverne selv: hold overblikket, og saml resultaterne."],
        en: ["Split the task into clear subtasks and say which seat should take each.", "Do not solve the subtasks yourself: keep the overview and collect the results."],
      },
      checks: null, readsIn: null,
    },
    Clarifier: {
      dials: { curiosity: { state: "on", strength: 7 }, uncertainty: { state: "on" } },
      additions: {
        da: ["Stil højst tre afklarende spørgsmål, før noget bygges, og spørg efter det, der mangler. Gæt ikke."],
        en: ["Ask at most three clarifying questions before anything is built, and ask for what is missing. Do not guess."],
      },
      checks: null, readsIn: null,
    },
    Researcher: {
      dials: { reason: { state: "on", strength: 6 }, curiosity: { state: "on", strength: 6 }, selfCheck: { state: "on" }, uncertainty: { state: "on" } },
      additions: {
        da: ["Skriv, hvad der er belagt, og hvad der er et gæt. Nævn kilden til hver påstand, og skriv «ukendt», når du ikke ved det."],
        en: ["Write what is supported and what is a guess. Name the source of each claim, and write \"unknown\" when you do not know."],
      },
      checks: null, readsIn: true,
    },
    Builder: {
      dials: { reason: { state: "on", strength: 6 }, selfCheck: { state: "on" } },
      additions: {
        da: ["Lav én ting ad gangen, og sig kort, hvad du ændrede, og hvorfor.", "Opfind ikke krav: spørg, hvis noget er uklart."],
        en: ["Do one thing at a time, and say briefly what you changed and why.", "Do not invent requirements: ask if something is unclear."],
      },
      checks: null, readsIn: null,
    },
    Tester: {
      dials: { challenge: { state: "on", strength: 7 }, risk: { state: "on", strength: 6 }, selfCheck: { state: "on" }, uncertainty: { state: "on" } },
      additions: {
        da: ["Find, hvad der kan gå galt: grænsetilfælde, tomme værdier og fejl. Skriv hvert fund med, hvordan det gentages."],
        en: ["Find what can go wrong: edge cases, empty values and errors. Write each finding with how to reproduce it."],
      },
      checks: null, readsIn: null,
    },
    Reviewer: {
      dials: { challenge: { state: "on", strength: 7 }, reason: { state: "on", strength: 6 }, risk: { state: "on", strength: 6 }, selfCheck: { state: "on" }, uncertainty: { state: "on" } },
      additions: {
        da: ["Gennemgå det forrige svar kritisk: hvad er forkert, mangler eller kan misforstås? Peg på det konkrete sted."],
        en: ["Review the previous answer critically: what is wrong, missing or easy to misunderstand? Point to the exact place."],
      },
      checks: null, readsIn: null,
    },
    Documenter: {
      dials: { reason: { state: "off" }, selfCheck: { state: "on" } },
      additions: {
        da: ["Skriv kort og i almindeligt sprog. Tag kun det med, der er sagt ved bordet, og opfind intet."],
        en: ["Write briefly and in plain language. Include only what was said at the table, and invent nothing."],
      },
      checks: null, readsIn: null,
    },
    "OUT Writer": {
      dials: { selfCheck: { state: "on" }, uncertainty: { state: "on" } },
      additions: {
        da: ["Skriv kun filens indhold, og tilføj intet, der ikke er sagt ved bordet."],
        en: ["Write only the content of the file, and add nothing that was not said at the table."],
      },
      checks: null, readsIn: null,
    },
  };

  function clone(x) {
    return JSON.parse(JSON.stringify(x == null ? null : x));
  }

  function lines(text) {
    return String(text == null ? "" : text)
      .split("\n")
      .map(function (l) { return l.replace(/\s+/g, " ").trim(); })
      .filter(Boolean);
  }

  function bool3(v) {
    return v === true ? true : v === false ? false : null;
  }

  // En rolles indstillinger gjort ren: kun kendte dials, gyldige tilstande og styrker 1–10, højst otte korte linjer, kontrol/læs IN som sand, falsk eller uændret.
  function normalizeOne(p) {
    var src = p && typeof p === "object" ? p : {};
    var dials = {};
    DIAL_KEYS.forEach(function (k) {
      var d = src.dials && src.dials[k];
      if (!d || SPECS[k].states.indexOf(d.state) < 0) return;
      var out = { state: d.state };
      if (SPECS[k].hasStrength && d.state !== "off") {
        var n = Math.round(Number(d.strength));
        out.strength = isFinite(n) && n >= 1 && n <= 10 ? n : 6;
      }
      dials[k] = out;
    });
    var add = Array.isArray(src.additions) ? src.additions : lines(src.additions);
    return {
      dials: dials,
      additions: lines(add.join("\n")).map(function (l) { return l.slice(0, MAX_LINE); }).slice(0, MAX_LINES),
      checks: bool3(src.checks),
      readsIn: bool3(src.readsIn),
    };
  }

  // De egne indstillinger, brugeren har gemt: { begreb: indstillinger }. Kun strenge som nøgle og ryddede indstillinger.
  function normalize(map) {
    var out = {};
    if (!map || typeof map !== "object") return out;
    Object.keys(map).slice(0, 60).forEach(function (k) {
      var key = String(k).slice(0, 40);
      if (key && map[k] && typeof map[k] === "object") out[key] = normalizeOne(map[k]);
    });
    return out;
  }

  function builtin(concept, locale) {
    var b = Object.prototype.hasOwnProperty.call(BUILTIN, concept) ? BUILTIN[concept] : null;
    if (!b) return null;
    var loc = locale === "en" ? "en" : "da";
    return normalizeOne({ dials: b.dials, additions: b.additions[loc], checks: b.checks, readsIn: b.readsIn });
  }

  // Det, en rolle sætter nu: dine egne indstillinger, ellers forslaget (hvis der er et), ellers null (intet at sætte). source: "own" | "builtin" | "none".
  function effective(concept, overrides, locale) {
    var c = String(concept || "");
    var own = overrides && Object.prototype.hasOwnProperty.call(overrides, c) ? overrides[c] : null;
    if (own) return { preset: normalizeOne(own), source: "own" };
    var b = builtin(c, locale);
    return b ? { preset: b, source: "builtin" } : { preset: null, source: "none" };
  }

  // draft: { dials, customInstruction (tekst, én linje pr. tilføjelse), checks, readsIn }. oldPreset: den forrige rolles indstillinger (dens egne linjer fjernes).
  // → en ny kladde; kun det, rollen nævner, ændres. Intet rører ikoner, mandat, Selvstændighed, regler eller omkostning.
  function apply(draft, preset, oldPreset) {
    var out = clone(draft) || {};
    out.dials = out.dials || {};
    if (!preset) return out;
    DIAL_KEYS.forEach(function (k) {
      var want = preset.dials && preset.dials[k];
      if (!want) return;
      var cur = out.dials[k] || {};
      var next = { state: want.state, note: cur.note || "" };
      if (SPECS[k].hasStrength) next.strength = want.strength || cur.strength || 6;
      out.dials[k] = next;
    });
    var gone = oldPreset && oldPreset.additions ? oldPreset.additions : [];
    var kept = lines(out.customInstruction).filter(function (l) { return gone.indexOf(l) < 0; });
    (preset.additions || []).forEach(function (l) {
      if (kept.indexOf(l) < 0) kept.push(l);
    });
    out.customInstruction = kept.join("\n");
    if (preset.checks !== null && preset.checks !== undefined) out.checks = preset.checks === true;
    if (preset.readsIn !== null && preset.readsIn !== undefined) out.readsIn = preset.readsIn === true;
    return out;
  }

  // Konsekvensgennemgang: hvad i en liste af ændringer (fra RundbordSeatHistory.diff) rører Selvstændighed, regler eller omkostning?
  // → { autonomy, rules, cost } (sand/falsk). Kontrolstol og læs IN koster flere eller større kald.
  function flags(changes) {
    var out = { autonomy: false, rules: false, cost: false };
    (changes || []).forEach(function (c) {
      if (c.field === "mandate" || (c.field === "dial" && c.key === "action")) out.autonomy = true;
      if (c.field === "dial" && c.key === "modifyRules") out.rules = true;
      if ((c.field === "dial" && c.key === "cost") || c.field === "checks" || c.field === "readsIn") out.cost = true;
    });
    return out;
  }

  // Det, der sendes til Tredje øje, hvis brugeren beder om et forslag til en rolle: rollens navn, de otte dials rollen må røre og stolens egne instruktionslinjer.
  // Hverken bordets opgave, historik eller nøgler sendes. additions: stolens egne linjer nu. → { system, user }
  function buildProposalRequest(concept, additions, locale) {
    var da = locale !== "en";
    var keys = DIAL_KEYS.map(function (k) {
      return k + " (" + SPECS[k].states.join("/") + (SPECS[k].hasStrength ? ", styrke 1-10" : "") + ")";
    }).join(", ");
    var role = String(concept == null ? "" : concept).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 40);
    var have = lines((additions || []).join("\n")).slice(0, MAX_LINES).map(function (l) { return "- " + l.slice(0, MAX_LINE); }).join("\n");
    var system = da
      ? "RUNDBORD-ROLLEFORSLAG. Du foreslår startindstillinger til en stol i et bord af AI-stole, ud fra stolens rolle. Svar KUN med ét JSON-objekt og ingen anden tekst.\n" +
        'Form: {"dials":{"<nøgle>":{"state":"on|off|auto","strength":1-10}},"additions":["<kort instruktion>"],"why":"<én kort sætning>"}\n' +
        "Tilladte dials: " + keys + ". Brug kun de dials, rollen har brug for. Højst " + MAX_LINES + " instruktioner, hver højst " + MAX_LINE + " tegn, korte og konkrete (hvad stolen skal aflevere og være varsom med). " +
        "Foreslå aldrig selvstændighed, regler eller omkostning. why højst 160 tegn."
      : "RUNDBORD-ROLLEFORSLAG. You suggest starting settings for a seat at a table of AI seats, based on the seat's role. Answer ONLY with one JSON object and no other text.\n" +
        'Form: {"dials":{"<key>":{"state":"on|off|auto","strength":1-10}},"additions":["<short instruction>"],"why":"<one short sentence>"}\n' +
        "Allowed dials: " + keys + ". Use only the dials the role needs. At most " + MAX_LINES + " instructions, each at most " + MAX_LINE + " characters, short and concrete (what the seat should deliver and be careful about). " +
        "Never suggest autonomy, rules or cost. why at most 160 characters.";
    var user = (da ? "Rolle: " : "Role: ") + role + "\n" + (have ? (da ? "Stolens egne instruktioner nu:\n" : "The seat's own instructions now:\n") + have : da ? "Stolen har ingen egne instruktioner endnu." : "The seat has no own instructions yet.");
    return { system: system, user: user };
  }

  // Tredje øjes svar → { preset, why } eller null. Kun kendte dials, gyldige tilstande og linjer godtages (samme rensning som egne indstillinger); intet ud over dem kan sættes.
  // Et svar uden nogen dial eller instruktion er ubrugeligt.
  function parseProposal(text) {
    var raw = String(text || "");
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    var obj;
    try {
      obj = JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
      return null;
    }
    if (!obj || typeof obj !== "object") return null;
    var preset = normalizeOne({ dials: obj.dials, additions: obj.additions });
    if (!Object.keys(preset.dials).length && !preset.additions.length) return null;
    var why = String(obj.why == null ? "" : obj.why).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    return { preset: preset, why: why };
  }

  return {
    DIAL_KEYS: DIAL_KEYS, SPECS: SPECS, BUILTIN_CONCEPTS: Object.keys(BUILTIN),
    normalizeOne: normalizeOne, normalize: normalize, builtin: builtin, effective: effective, apply: apply, flags: flags,
    buildProposalRequest: buildProposalRequest, parseProposal: parseProposal,
  };
});
