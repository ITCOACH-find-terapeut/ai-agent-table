// Beskyttelse af følsomme oplysninger: find dem lokalt, erstat dem med stabile pladsholdere
// FØR noget forlader computeren, og gendan dem lokalt i svaret. Ren logik, ingen netværk.
// window.RundbordShield i appen, require() i main.js og i node-tests.
//
// Princip: original → beskyttet tekst → model → lokalt gendannet svar. Kortlægningen
// (pladsholder → rigtig værdi) sendes aldrig til en model.
//
// To slags fund:
//   protect  sikre fund (regler + dine egne ord + allerede kendte værdier) → erstattes uden at spørge
//   review   MULIGE navne (efternavne på -sen) → et menneske afgør: skjul eller tillad
//
// Det her er pseudonymisering, ikke anonymisering, og reglerne finder identifikatorer — ikke
// beskrivelser (helbred, private forhold). "Ingen fund" betyder ikke "ingen følsomme oplysninger".
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordShield = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var KINDS = ["PERSON", "EMAIL", "CPR", "TELEFON", "IBAN", "ADRESSE", "ORG", "STED", "ANDET"];
  var TERM_KINDS = ["PERSON", "ORG", "STED", "ANDET"];
  var MAX_TERMS = 300;
  var PLACEHOLDER_RE = /\[([A-ZÆØÅ]+)_(\d{2,})\]/g;
  // Ord på -sen, der oftest er almindelige navneord og ikke efternavne.
  var NOT_SURNAMES = ["prisen", "kassen", "rosen", "basen", "posen", "fasen", "brisen", "massen", "pausen", "tasen", "gassen"];

  var WORD_BEFORE = "(?<![\\p{L}\\p{N}_])";
  var WORD_AFTER = "(?![\\p{L}\\p{N}_])";

  function norm(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // Sikre regler. Rækkefølgen er prioritet ved overlap sammen med længde (længste fund vinder).
  var RULES = [
    { kind: "EMAIL", re: /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[\p{L}]{2,}/gu },
    // CPR: ddmmyy[-]xxxx med en rimelig dato. 1900-/2000-tal skelnes ikke, kun dag/måned tjekkes.
    { kind: "CPR", re: /(?<![\d])(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}[- ]?\d{4}(?![\d])/g },
    { kind: "IBAN", re: /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?![\p{L}\p{N}])/gu },
    { kind: "TELEFON", re: /(?<![\d])(?:\+45[ -]?)?(?:\d{2}[ -]?){3}\d{2}(?![\d])/g },
    {
      kind: "ADRESSE",
      re: /(?<![\p{L}\p{N}_])[\p{Lu}][\p{L}.\-]*(?:vej|gade|allé|alle|plads|stræde|boulevard|torv|vænge|park)[ ]+\d{1,3}[A-Za-z]?(?:,?[ ]+(?:\d{1,2}\.[ ]*)?(?:st|\d{1,2})\.?[ ]*(?:th|tv|mf)\.?)?(?:,?[ ]+\d{4}[ ]+[\p{Lu}][\p{L}]+)?/gu,
    },
  ];

  // Mulige efternavne (med ét forudgående stort ord, som typisk er fornavnet).
  var CANDIDATE_RE = new RegExp(WORD_BEFORE + "(?:[\\p{Lu}][\\p{Ll}]+[ \\t]+)?[\\p{Lu}][\\p{Ll}]{2,}sen" + WORD_AFTER, "gu");

  function normalizeTerms(terms) {
    var seen = {};
    var out = [];
    (Array.isArray(terms) ? terms : []).forEach(function (t) {
      var value = String((t && t.value) || "").replace(/\s+/g, " ").trim().slice(0, 120);
      var kind = TERM_KINDS.indexOf(t && t.kind) >= 0 ? t.kind : "PERSON";
      var key = norm(value);
      if (!value || seen[key]) return;
      seen[key] = true;
      out.push({ value: value, kind: kind });
    });
    return out.slice(-MAX_TERMS);
  }

  function normalizeAllow(allow) {
    var seen = {};
    var out = [];
    (Array.isArray(allow) ? allow : []).forEach(function (v) {
      var value = String(v || "").replace(/\s+/g, " ").trim().slice(0, 120);
      var key = norm(value);
      if (!value || seen[key]) return;
      seen[key] = true;
      out.push(value);
    });
    return out.slice(-MAX_TERMS);
  }

  // Tilstand for én afsendelse: kortlægning (kan vokse), omvendt opslag og tællere pr. type.
  function newState(shield) {
    var sh = shield || {};
    var mapping = {};
    var rev = {};
    var counters = {};
    var src = sh.mapping && typeof sh.mapping === "object" ? sh.mapping : {};
    Object.keys(src).forEach(function (key) {
      var m = /^\[([A-ZÆØÅ]+)_(\d{2,})\]$/.exec(key);
      if (!m || typeof src[key] !== "string" || !src[key]) return;
      mapping[key] = src[key];
      rev[norm(src[key])] = key;
      counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    });
    var allowSet = {};
    normalizeAllow(sh.allow).forEach(function (v) {
      allowSet[norm(v)] = true;
    });
    return { mapping: mapping, rev: rev, counters: counters, terms: normalizeTerms(sh.terms), allow: allowSet, startSize: Object.keys(mapping).length };
  }

  function placeholderFor(state, kind, value) {
    var key = norm(value);
    if (state.rev[key]) return state.rev[key];
    var n = (state.counters[kind] || 0) + 1;
    state.counters[kind] = n;
    var ph = "[" + kind + "_" + pad2(n) + "]";
    state.mapping[ph] = String(value).replace(/\s+/g, " ").trim();
    state.rev[key] = ph;
    return ph;
  }

  function changed(state) {
    return Object.keys(state.mapping).length !== state.startSize;
  }

  // Skjuler eksisterende pladsholdere, så ingen regel finder noget inde i dem.
  function mask(text) {
    return text.replace(PLACEHOLDER_RE, function (m) {
      return " ".repeat(m.length);
    });
  }

  function termRegex(value) {
    var body = escapeRe(value).replace(/\\? /g, "\\s+").replace(/(?:\\s\+)+/g, "\\s+");
    return new RegExp(WORD_BEFORE + body + "(?=s?" + WORD_AFTER + ")", "giu");
  }

  function pushAll(list, text, re, kind, source) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text))) {
      if (!m[0]) {
        re.lastIndex += 1;
        continue;
      }
      list.push({ start: m.index, end: m.index + m[0].length, kind: kind, value: m[0], source: source });
    }
  }

  // Længste fund først; ved samme start vinder det længste; overlappende fund droppes.
  function resolveOverlaps(list) {
    var sorted = list.slice().sort(function (a, b) {
      return a.start - b.start || b.end - b.start - (a.end - a.start);
    });
    var out = [];
    var lastEnd = -1;
    sorted.forEach(function (f) {
      if (f.start >= lastEnd) {
        out.push(f);
        lastEnd = f.end;
      }
    });
    return out;
  }

  // → { protect: [fund der erstattes], review: [mulige navne, som et menneske skal afgøre] }
  function detect(text, state) {
    var str = String(text == null ? "" : text);
    var masked = mask(str);
    var sure = [];
    // Dine egne ord og allerede kendte værdier (længste først, så "Anne Jensen" slår "Anne").
    var known = state.terms.map(function (t) {
      return { value: t.value, kind: t.kind, source: "term" };
    });
    Object.keys(state.mapping).forEach(function (ph) {
      var kind = /^\[([A-ZÆØÅ]+)_/.exec(ph)[1];
      known.push({ value: state.mapping[ph], kind: kind, source: "mapping" });
    });
    known
      .sort(function (a, b) {
        return b.value.length - a.value.length;
      })
      .forEach(function (k) {
        pushAll(sure, masked, termRegex(k.value), k.kind, k.source);
      });
    RULES.forEach(function (rule) {
      pushAll(sure, masked, rule.re, rule.kind, "rule");
    });
    var protect = resolveOverlaps(sure);

    var cand = [];
    pushAll(cand, masked, CANDIDATE_RE, "PERSON", "candidate");
    var taken = protect;
    var review = cand.filter(function (c) {
      var last = c.value.split(/\s+/).pop().toLowerCase();
      if (NOT_SURNAMES.indexOf(last) >= 0) return false;
      if (state.allow[norm(c.value)] || state.allow[norm(last)]) return false;
      return !taken.some(function (f) {
        return c.start < f.end && f.start < c.end;
      });
    });
    return { protect: protect, review: resolveOverlaps(review) };
  }

  // Erstatter sikre fund. Kortlægningen i state vokser. → { text, found:[{kind, placeholder}], review:[…] }
  function protect(text, state) {
    var str = String(text == null ? "" : text);
    var found = detect(str, state);
    // Pladsholdere gives i læserækkefølge; selve udskiftningen sker bagfra, så positionerne holder.
    var phs = found.protect.map(function (f) {
      return placeholderFor(state, f.kind, f.value);
    });
    var out = str;
    var info = [];
    for (var i = found.protect.length - 1; i >= 0; i--) {
      var f = found.protect[i];
      out = out.slice(0, f.start) + phs[i] + out.slice(f.end);
    }
    found.protect.forEach(function (f, idx) {
      info.push({ kind: f.kind, placeholder: phs[idx] });
    });
    return { text: out, found: info, review: found.review };
  }

  // Er der noget i teksten, der stadig burde have været skjult? Bruges som sikkerhedsnet
  // lige før afsendelse. Mulige navne tæller med: er de ikke afgjort, må teksten ikke afsted.
  function leaks(text, state) {
    var found = detect(text, state);
    return found.protect.concat(found.review);
  }

  // Gendanner kendte pladsholdere. Ukendte (ikke i kortlægningen) og ændrede (fx "PERSON 01"
  // uden kantede parenteser) bevares og meldes — der gættes aldrig.
  function restore(text, mapping) {
    var str = String(text == null ? "" : text);
    var map = mapping && typeof mapping === "object" ? mapping : {};
    var unknown = [];
    var restored = 0;
    var out = str.replace(PLACEHOLDER_RE, function (m) {
      if (Object.prototype.hasOwnProperty.call(map, m) && map[m]) {
        restored += 1;
        return map[m];
      }
      unknown.push(m);
      return m;
    });
    var altered = [];
    var altRe = new RegExp("(?<![\\[\\p{L}\\p{N}_])(" + KINDS.join("|") + ")[ _-]0?(\\d{1,2})(?![\\p{L}\\p{N}_\\]])", "gu");
    str.replace(altRe, function (m) {
      altered.push(m);
      return m;
    });
    return { text: out, restored: restored, unknown: unknown, altered: altered };
  }

  // Til visning: [{text}|{placeholder, value}] — så skærmen kan understrege gendannede værdier.
  function restoreParts(text, mapping) {
    var str = String(text == null ? "" : text);
    var map = mapping && typeof mapping === "object" ? mapping : {};
    var parts = [];
    var last = 0;
    var re = new RegExp(PLACEHOLDER_RE.source, "g");
    var m;
    while ((m = re.exec(str))) {
      if (m.index > last) parts.push({ text: str.slice(last, m.index) });
      if (Object.prototype.hasOwnProperty.call(map, m[0]) && map[m[0]]) parts.push({ placeholder: m[0], value: map[m[0]] });
      else parts.push({ text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push({ text: str.slice(last) });
    return parts;
  }

  // Tilføjer afgørelser fra et menneske: skjul (→ egne ord) eller tillad. Returnerer nye lister.
  function applyDecisions(shield, hideValues, allowValues) {
    var terms = normalizeTerms(shield && shield.terms);
    var allow = normalizeAllow(shield && shield.allow);
    (hideValues || []).forEach(function (v) {
      terms.push({ value: v, kind: "PERSON" });
      var words = String(v).split(/\s+/);
      var surname = words[words.length - 1];
      if (words.length > 1 && surname.length >= 4) terms.push({ value: surname, kind: "PERSON" });
    });
    (allowValues || []).forEach(function (v) {
      allow.push(v);
    });
    return { terms: normalizeTerms(terms), allow: normalizeAllow(allow) };
  }

  // Hvad ville en afsendelse indeholde af følsomme oplysninger? Rører intet (kortlægningen ændres ikke).
  // Tæller forskellige værdier pr. type, så en historik der sendes igen og igen ikke tæller dobbelt.
  // → { kinds: { EMAIL: 2, … }, possible: antal mulige navne, total: sum af kinds }
  function assess(texts, shield) {
    var state = newState(shield);
    var kinds = {};
    var seen = {};
    var possibleSeen = {};
    var possible = 0;
    var total = 0;
    (texts || []).forEach(function (text) {
      var d = detect(text, state);
      d.protect.forEach(function (f) {
        var key = f.kind + "|" + norm(f.value);
        if (seen[key]) return;
        seen[key] = true;
        kinds[f.kind] = (kinds[f.kind] || 0) + 1;
        total += 1;
      });
      d.review.forEach(function (c) {
        var key = norm(c.value);
        if (possibleSeen[key]) return;
        possibleSeen[key] = true;
        possible += 1;
      });
    });
    return { kinds: kinds, possible: possible, total: total };
  }

  return {
    KINDS: KINDS,
    assess: assess,
    TERM_KINDS: TERM_KINDS,
    newState: newState,
    detect: detect,
    protect: protect,
    leaks: leaks,
    restore: restore,
    restoreParts: restoreParts,
    changed: changed,
    normalizeTerms: normalizeTerms,
    normalizeAllow: normalizeAllow,
    applyDecisions: applyDecisions,
    PLACEHOLDER_RE: PLACEHOLDER_RE,
  };
});
