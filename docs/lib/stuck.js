// "Jeg sidder fast": en statusbesked, brugeren selv ser og selv sender, når noget ikke giver mening.
// Beskeden indeholder kun fakta om, hvor man var og hvad der skete: version, hvilke paneler der stod åbne, hvilke knapper der blev trykket på
// (kun deres id, aldrig deres tekst), de seneste hændelser (tal og faste ord), fejl i selve siden og brugerens egen valgfri sætning.
// Den indeholder aldrig beskeder, bud, opgavetekster, filnavne, stolenes navne, instruktioner, adresser eller nøgler.
// Samme tankegang som en senere, anonym "varmekort"-måling af brug: trin og tællere, aldrig tekst.
// Ren logik uden DOM, netværk og Electron. window.RundbordStuck i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordStuck = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var FORMAT = 1;
  var MAX_STEPS = 80;
  var MAX_EVENTS = 40;
  var MAX_ERRORS = 5;
  var MAX_NOTE = 600;

  // Et panel uden en eneste synlig, aktiv knap er en blindgyde: man kan hverken gå videre eller lukke det.
  // panels: [{ id, visible, controls: [{ visible, enabled }] }] → id'er på de synlige paneler uden en brugbar knap.
  function deadEnds(panels) {
    return (Array.isArray(panels) ? panels : [])
      .filter(function (p) {
        if (!p || !p.visible) return false;
        return !(p.controls || []).some(function (c) {
          return c && c.visible && c.enabled;
        });
      })
      .map(function (p) {
        return String(p.id || "?");
      });
  }

  // Siden står "stille", når der ingen synlige paneler er, kørslen ikke arbejder, og beskedfeltet ikke kan bruges.
  // view: { running, panelsOpen, inputUsable }
  function frozen(view) {
    view = view || {};
    return !view.running && !view.panelsOpen && !view.inputUsable;
  }

  // Fra en hændelse må kun tal og sandt/falsk med, og korte faste ord fra felter, hvis navn er på listen (valg, årsag, udbyder, modelnavn og lignende).
  // Alt andet udelades, også navne på stole og roller, som brugeren selv kan have skrevet, og alle felter med fri tekst.
  var SAFE_WORD = /^[A-Za-z0-9_.:\/\-]{1,48}$/;
  var WORD_KEYS = /^(choice|via|purpose|errorKind|reason|level|state|mode|provider|model|modelId|card|type|source|dial|pick|action|scope|preset|option|handoff|code|roleMatch|by|kind)$/;
  function safeData(data) {
    var out = [];
    Object.keys(data && typeof data === "object" ? data : {}).forEach(function (k) {
      var v = data[k];
      if (typeof v === "number" && isFinite(v)) out.push(k + "=" + v);
      else if (typeof v === "boolean") out.push(k + "=" + v);
      else if (typeof v === "string" && WORD_KEYS.test(k) && SAFE_WORD.test(v)) out.push(k + "=" + v);
    });
    return out.join(" ");
  }

  // En fejltekst fra siden kan nævne en værdi; indholdet af citationstegn og lange tal fjernes, og teksten klippes.
  function scrubError(msg) {
    return String(msg || "")
      .replace(/"[^"]*"/g, '"…"')
      .replace(/'[^']*'/g, "'…'")
      .replace(/`[^`]*`/g, "`…`")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  // Alt, der kommer fra skærmen eller fra brugerens opsætning (id'er, modelnavne), skal være et kort fast ord; ellers står der et mærke i stedet.
  function word(v, fallback) {
    v = String(v == null ? "" : v);
    return SAFE_WORD.test(v) ? v : fallback || "(andet)";
  }

  function words(list) {
    return (Array.isArray(list) ? list : []).map(function (v) {
      return word(v);
    });
  }

  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 90) return s + "s";
    return Math.round(s / 60) + "min";
  }

  function line(label, value) {
    return label + ": " + value;
  }

  // input: {
  //   now (ms),
  //   app: { version, revision, platform, locale, uiLevel },
  //   where: { panels: [id], dead: [id], running, inputUsable, frozen },
  //   board: { seats: [{ provider, model, hasKey }], messages, tasks, welcomeSeen },
  //   steps: [{ at (ms), kind: "click"|"open"|"close"|"change", id }],
  //   events: [{ at (iso), type, data }],
  //   errors: [{ at (ms), msg, where }],
  //   note
  // }
  function build(input) {
    input = input || {};
    var now = typeof input.now === "number" ? input.now : Date.now();
    var app = input.app || {};
    var where = input.where || {};
    var board = input.board || {};
    var out = [];
    out.push("RUNDBORDET STATUSBESKED (format " + FORMAT + ")");
    out.push("Lavet af appen på brugerens computer. Ingen tekst fra bordet, ingen nøgler, ingen filnavne.");
    out.push("");
    out.push(line("Version", (app.version || "?") + (app.revision ? " (revision " + app.revision + ")" : "")));
    out.push(line("System", String(app.platform || "?")));
    out.push(line("Sprog", String(app.locale || "?")) + " · " + line("Niveau", String(app.uiLevel || "?")));
    out.push(line("Tidspunkt", new Date(now).toISOString()));
    out.push("");
    out.push("## Hvor var brugeren");
    out.push(line("Åbne paneler", words(where.panels).join(", ") || "ingen"));
    out.push(line("Kørsel i gang", where.running ? "ja" : "nej"));
    out.push(line("Beskedfeltet kan bruges", where.inputUsable ? "ja" : "nej"));
    out.push(line("Paneler uden brugbar knap (blindgyde)", words(where.dead).join(", ") || "ingen"));
    out.push(line("Siden står stille", where.frozen ? "JA" : "nej"));
    out.push("");
    out.push("## Bordet (kun tal og modelnavne)");
    var seats = board.seats || [];
    out.push(line("Stole", String(seats.length)));
    seats.forEach(function (s, i) {
      out.push("- stol " + (i + 1) + ": " + word(s.provider, "?") + " / " + (s.model ? word(s.model, "(eget navn)") : "ingen model") + " · nøgle " + (s.hasKey ? "sat" : "mangler"));
    });
    out.push(line("Beskeder", String(board.messages == null ? "?" : board.messages)) + " · " + line("Opgaver", String(board.tasks == null ? "?" : board.tasks)));
    out.push(line("Velkomst set", board.welcomeSeen === false ? "nej (ny installation)" : "ja"));
    out.push("");
    var steps = (input.steps || []).slice(-MAX_STEPS);
    out.push("## Seneste trin (ældst først; kun knappernes id)");
    if (!steps.length) out.push("ingen");
    steps.forEach(function (s) {
      out.push("- for " + ago(now - s.at) + " siden: " + word(s.kind, "?") + " " + word(s.id));
    });
    out.push("");
    var events = (input.events || []).slice(-MAX_EVENTS);
    out.push("## Seneste hændelser fra bordets logbog (ældst først)");
    if (!events.length) out.push("ingen");
    events.forEach(function (e) {
      var t = Date.parse(e.at);
      var extra = safeData(e.data);
      out.push("- " + (isNaN(t) ? "?" : "for " + ago(now - t) + " siden") + ": " + String(e.type || "?").slice(0, 60) + (extra ? " " + extra : ""));
    });
    out.push("");
    var errors = (input.errors || []).slice(-MAX_ERRORS);
    out.push("## Fejl i siden");
    if (!errors.length) out.push("ingen");
    errors.forEach(function (e) {
      out.push("- for " + ago(now - e.at) + " siden: " + scrubError(e.msg) + (e.where ? " (" + String(e.where).replace(/^.*\//, "").slice(0, 60) + ")" : ""));
    });
    out.push("");
    var note = String(input.note || "").trim().slice(0, MAX_NOTE);
    out.push("## Brugerens egne ord");
    out.push(note || "(ikke skrevet)");
    return out.join("\n");
  }

  return { FORMAT: FORMAT, MAX_STEPS: MAX_STEPS, deadEnds: deadEnds, frozen: frozen, safeData: safeData, scrubError: scrubError, build: build };
});
