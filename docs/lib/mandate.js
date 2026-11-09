// Mandat som stop: hvornår bordet holder pause efter en stol, og hvilke spørgsmål der er til brugeren. Ren logik uden DOM/Electron.
//   ✓ (kan)       kør videre uden mig
//   ? (foreslaa)  stop, når stolen har et spørgsmål, som kun brugeren kan afgøre
//   ⏸ (ikke)      stop altid efter denne stol, så brugeren selv ser resultatet
// Gælder kun, når bordets indstilling "mandatet styrer forløbet" er slået til. Kontrolstole har deres egen beslutning og stoppes ikke herfra.
// window.RundbordMandate i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordMandate = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_SHOWN = 2;

  // Et behov kan begynde med VURDERING: (kun brugeren kan afgøre det: værdier, prioritering, konsekvenser) eller FAKTA: (en stol eller en fil kan svare).
  // → { type: "judgement" | "fact" | null, text: behovet uden mærket }
  function parseNeedTag(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var m = /^\*{0,2}\s*(VURDERING|JUDGE?MENT|FAKTA|FACT)\s*\*{0,2}\s*[:\-–—]\s*\*{0,2}\s*([\s\S]*)$/i.exec(s);
    if (!m) return { type: null, text: s };
    var word = m[1].toUpperCase();
    return { type: word === "FAKTA" || word === "FACT" ? "fact" : "judgement", text: m[2].trim() };
  }

  // needs: { need, role } fra stolens 🔭/👉-blok (need uden mærke), type fra parseNeedTag; roleIsSeat: peger 👉 ROLLE på en stol ved bordet?
  // → [{ text, type }]: spørgsmål til brugeren. Tomt, hvis behovet er "intet", en FAKTA, eller en stol kan tage det.
  function humanQuestions(needs, roleIsSeat) {
    if (!needs || !String(needs.need || "").trim() || needs.empty) return [];
    var type = needs.type || (roleIsSeat ? "fact" : "judgement");
    if (type === "fact") return [];
    return [{ text: String(needs.need).trim(), type: "judgement" }];
  }

  // opts: { gate, mandate: "kan"|"foreslaa"|"ikke", checks, isLast, questions }
  // → null (kør videre) eller { pause: true, reason: "always" | "question", questions }
  function gateFor(opts) {
    opts = opts || {};
    if (!opts.gate || opts.checks || opts.isLast) return null;
    var questions = opts.questions || [];
    if (opts.mandate === "ikke") return { pause: true, reason: "always", questions: questions.slice(0, MAX_SHOWN) };
    if (opts.mandate === "foreslaa" && questions.length) return { pause: true, reason: "question", questions: questions.slice(0, MAX_SHOWN) };
    return null;
  }

  // Det, næste stol får at vide om brugerens svar (eller at brugeren bevidst lod være).
  function humanNoteText(t, answered) {
    var parts = [];
    (answered || []).forEach(function (a) {
      if (a.comment) parts.push(t("humanNoteComment", { text: String(a.comment).trim() }));
      else if (a.skipped) parts.push(t("humanNoteSkipped", { question: a.question }));
      else if (String(a.answer || "").trim()) parts.push(t("humanNoteAnswer", { question: a.question, answer: String(a.answer).trim() }));
    });
    return parts.length ? t("humanNoteHeader") + "\n" + parts.join("\n") : "";
  }

  return { parseNeedTag: parseNeedTag, humanQuestions: humanQuestions, gateFor: gateFor, humanNoteText: humanNoteText, MAX_SHOWN: MAX_SHOWN };
});
