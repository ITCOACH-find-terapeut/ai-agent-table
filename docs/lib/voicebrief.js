// Stemmens brief: stemmen læser aldrig et helt svar (ofte mange linjer kode), men siger kort, hvad der er sendt, og hvorfor
// det er værd at kigge på. Ren logik, ingen modelkald, og ingen af svarets ord forlader appen (undtagen ved meget korte,
// rene tekster, der læses som de er). window.RundbordVoiceBrief i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordVoiceBrief = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // Antal formuleringer pr. slags; teksterne ligger i locales/*.js som brief<Slags><n>.
  var VARIANTS = { Code: 4, Options: 3, Question: 3, Need: 3, Long: 4, Medium: 3, Plan: 3, Assessment: 3, Reply: 3 };
  var SHORT_MAX = 140;

  function analyze(text, ctx) {
    ctx = ctx || {};
    var raw = String(text == null ? "" : text).trim();
    var fenceCount = (raw.match(/```/g) || []).length;
    var blocks = Math.floor(fenceCount / 2) + (fenceCount % 2);
    var lines = raw.split("\n");
    var inCode = false;
    var codeLines = 0;
    lines.forEach(function (l) {
      if (/^\s*```/.test(l)) inCode = !inCode;
      else if (inCode) codeLines += 1;
    });
    var paragraphs = raw.split(/\n\s*\n/).filter(function (p) {
      return p.trim();
    });
    var last = (paragraphs[paragraphs.length - 1] || "").trim();
    var bullets = lines.filter(function (l) {
      return /^\s*([-*•]|\d+[.)])\s+\S/.test(l);
    }).length;
    return {
      chars: raw.length,
      lines: lines.length,
      blocks: blocks,
      codeLines: codeLines,
      endsWithQuestion: /[?？]\s*$/.test(last) && last.length <= 400,
      bullets: bullets,
      hasHeadings: /^#{1,6}\s/m.test(raw),
    };
  }

  // Ren tekst til oplæsning, når teksten er kort nok til at blive læst som den er.
  function plainForSpeech(text) {
    return String(text || "")
      .replace(/`+/g, "")
      .replace(/[*_#>]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ctx: { thirdEye, options (antal valg), needRole, seed }. Returnerer { kind, key, params } eller { kind: "verbatim", text }.
  function brief(text, ctx) {
    ctx = ctx || {};
    var a = analyze(text, ctx);
    var kind;
    if (ctx.thirdEye) kind = ctx.options > 0 ? "Options" : "Assessment";
    else if (a.blocks > 0 || a.codeLines >= 4) kind = "Code";
    else if (ctx.needRole) kind = "Need";
    else if (a.endsWithQuestion) kind = "Question";
    else if (a.chars > 700 || a.lines > 12) kind = "Long";
    else if (a.bullets >= 4 || a.hasHeadings) kind = "Plan";
    else if (a.chars <= SHORT_MAX && a.lines <= 2) return { kind: "verbatim", text: plainForSpeech(text) };
    else kind = ctx.thirdEye ? "Assessment" : "Medium";
    var n = VARIANTS[kind];
    var seed = Math.max(0, Math.floor(Number(ctx.seed) || 0));
    return { kind: kind, key: "brief" + kind + ((seed % n) + 1), params: { role: ctx.needRole || "" } };
  }

  // Lydbeskeden må højst vare ca. 10 sekunder: ca. 25 ord. Modellens forslag renses og kortes, aldrig længere.
  var BRIEF_MAX_WORDS = 28;

  function limitBrief(text) {
    var t = String(text == null ? "" : text)
      .replace(/```[\s\S]*?(```|$)/g, " ")
      .replace(/<<[A-Z]+>>[\s\S]*$/, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^\s*(lydbesked|audio message|besked)\s*[:\-]\s*/i, "");
    t = plainForSpeech(t).replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
    if (!t) return null;
    var words = t.split(" ");
    if (words.length <= BRIEF_MAX_WORDS) return t;
    var head = words.slice(0, BRIEF_MAX_WORDS).join(" ");
    var m = /^([\s\S]*[.!?])(?=\s|$)/.exec(head);
    if (m && m[1].split(" ").length >= 6) return m[1];
    return words.slice(0, 25).join(" ").replace(/[,;:\s]+$/, "") + ".";
  }

  return { limitBrief: limitBrief, BRIEF_MAX_WORDS: BRIEF_MAX_WORDS, analyze: analyze, brief: brief, plainForSpeech: plainForSpeech, VARIANTS: VARIANTS, SHORT_MAX: SHORT_MAX };
});
