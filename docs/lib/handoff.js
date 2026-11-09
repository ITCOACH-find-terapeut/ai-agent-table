// Struktureret overlevering mellem stole (specifikationens §27). Ren logik uden
// DOM/Electron: window.RundbordHandoff i appen, require() i node-tests.
//
// En stol kan afslutte sit svar med fem valgfrie linjer efter 🔭/👉/🎚-blokken
// (📋 fakta · ✔ beslutninger · ❓ åbne spørgsmål · ⚠ advarsler · 📦 forventet
// output). Parseren er — ligesom NEEDS_SUMMARY_RE — forankret på emoji og
// kolon-position, så label-ordet kan stå på hvilket som helst sprog, med eller
// uden fed skrift. Kan blokken ikke bruges, returneres null, og relæet falder
// tilbage til at sende hele svaret (som før).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordHandoff = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var FIELD_BY_EMOJI = {
    "📋": "facts",
    "✔": "decisions",
    "✅": "decisions",
    "❓": "openQuestions",
    "⚠": "warnings",
    "📦": "expected",
  };
  var FIELDS = ["facts", "decisions", "openQuestions", "warnings", "expected"];

  function emptyValue(v) {
    return /^(-|–|—|ingen|intet|none|n\/a|nej)\.?$/i.test(v.trim());
  }

  function items(value) {
    return String(value || "")
      .split(/\s*;\s*/)
      .map(function (x) {
        return x.replace(/\*\*/g, "").trim();
      })
      .filter(function (x) {
        return x && !emptyValue(x);
      });
  }

  // Kun teksten EFTER 🔭-blokkens start tages i betragtning, så almindelige
  // ⚠-/❓-linjer i selve svaret aldrig forveksles med overleveringen.
  function parse(text) {
    var str = String(text || "");
    var start = str.search(/---[ \t]*\n(?:[ \t]*\n)*[ \t]*🔭/);
    if (start < 0) return null;
    var tail = str.slice(start);
    var result = { facts: [], decisions: [], openQuestions: [], warnings: [], expected: [] };
    var seen = 0;
    tail.split("\n").forEach(function (line) {
      var m = /^[ \t]*(?:\*\*)?(📋|✔|✅|❓|⚠|📦)️?[^\n:]*:\*{0,2}[ \t]*(.*)$/.exec(line);
      if (!m) return;
      var field = FIELD_BY_EMOJI[m[1]];
      result[field] = result[field].concat(items(m[2]));
      seen += 1;
    });
    if (!seen) return null;
    var any = FIELDS.some(function (f) {
      return result[f].length;
    });
    return any ? result : null;
  }

  function bulletList(arr) {
    return arr
      .map(function (x) {
        return "- " + x;
      })
      .join("\n");
  }

  // Bygger teksten næste stol får. opts:
  //  t(key, vars)  — oversættelse (fra appen)
  //  originalTask  — brugerens oprindelige opgave (eller null)
  //  sourceName    — forrige stols navn
  //  summary       — { need, adjust } fra 🔭/🎚-blokken (eller null)
  //  body          — forrige stols svar UDEN blokken (stripNeedsSummary)
  //  readback      — forrige stols første sætning
  //  handoff       — parse()-resultat (eller null)
  //  mode          — "structured" | "full" | "anchor" (kun opgaven og brugerens afgørelser, ikke forrige stols svar; kræver originalTask)
  // Returnerer { text, mode, fallbackReason, charsFull, charsSent }.
  function buildRelayText(opts) {
    var t = opts.t;
    var summary = opts.summary;
    if (opts.mode === "anchor" && opts.originalTask) {
      var anchor = t("relayOriginalTaskHeader") + "\n" + String(opts.originalTask).trim() + "\n\n" + t("relayAnchorOnlyNote", { seat: opts.sourceName });
      return { text: anchor, mode: "anchor", fallbackReason: null, charsFull: String(opts.body || "").length, charsSent: anchor.length };
    }
    if (!summary) {
      // Ingen behovsblok → ingen kontekst at bygge; send svaret som det er.
      return { text: opts.body, mode: "full", fallbackReason: "no_needs_block", charsFull: opts.body.length, charsSent: opts.body.length };
    }

    var head =
      (opts.originalTask
        ? t("relayOriginalTaskHeader") + "\n" + String(opts.originalTask).trim() + "\n\n" + t("relayPreviousNeedHeader") + "\n"
        : "") +
      t("relayPreviousNeedLine", { seat: opts.sourceName, need: summary.need }) + "\n" +
      (summary.adjust ? t("relaySuggestedAdjustLine", { adjust: summary.adjust }) + "\n" : "");
    var tail = opts.originalTask ? "\n\n" + t("relayImportantBlock") : "";

    var full = head + "\n" + t("relayUseAsBasisNote") + "\n\n---\n\n" + opts.body + tail;

    var handoff = opts.handoff;
    if (opts.mode !== "structured") {
      return { text: full, mode: "full", fallbackReason: "mode_full", charsFull: full.length, charsSent: full.length };
    }
    if (!handoff) {
      return { text: full, mode: "full", fallbackReason: "no_handoff", charsFull: full.length, charsSent: full.length };
    }

    var parts = [];
    if (opts.readback) parts.push(t("relayHandoffSummary") + " " + opts.readback);
    [
      ["facts", "relayHandoffFacts"],
      ["decisions", "relayHandoffDecisions"],
      ["openQuestions", "relayHandoffQuestions"],
      ["warnings", "relayHandoffWarnings"],
      ["expected", "relayHandoffExpected"],
    ].forEach(function (pair) {
      if (handoff[pair[0]].length) parts.push(t(pair[1]) + "\n" + bulletList(handoff[pair[0]]));
    });
    var structured =
      head + "\n" + parts.join("\n\n") + "\n\n" + t("relayHandoffNote") + "\n\n" + t("relayUseAsBasisNote") + tail;
    return { text: structured, mode: "structured", fallbackReason: null, charsFull: full.length, charsSent: structured.length };
  }

  return { parse: parse, buildRelayText: buildRelayText };
});
