// Resultatkortet: det samlede resultat af en opgave, samlet af det, der allerede findes (bordets seneste svar ordret, dine registrerede beslutninger og de
// spørgsmål, der stadig er åbne). Ingen modelkald, intet opdigtet: mangler en del, udelades den. Ren logik uden DOM og Electron.
// window.RundbordResultCard i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordResultCard = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_TASK = 300;

  function str(v) {
    return String(v == null ? "" : v).trim();
  }

  // o: { task, result: { text, seat } | null, register: { decided: [{ question, decision: { answer?, skipped? } }], open: [{ seat, question }] } | null, clean: tekst → tekst (fx gendan Beskyttelsen) }
  // → null, hvis der intet resultat er. Ellers { task, conclusion: { seat, text }, decided: [{ question, answer, skipped }], open: [{ seat, question }] }
  function build(o) {
    var opts = o || {};
    var clean = typeof opts.clean === "function" ? opts.clean : function (x) { return x; };
    var result = opts.result;
    if (!result || !str(result.text)) return null;
    var reg = opts.register || { decided: [], open: [] };
    var task = clean(str(opts.task)).replace(/\s+/g, " ");
    if (task.length > MAX_TASK) task = task.slice(0, MAX_TASK - 1).trim() + "…";
    return {
      task: task,
      conclusion: { seat: str(result.seat), text: clean(str(result.text)) },
      decided: (reg.decided || []).map(function (x) {
        var d = x.decision || {};
        return { question: clean(str(x.question)), answer: d.skipped ? "" : clean(str(d.answer)), skipped: Boolean(d.skipped) };
      }),
      open: (reg.open || []).map(function (x) {
        return { seat: str(x.seat), question: clean(str(x.question)) };
      }),
    };
  }

  // Resultatet som ren tekst (Markdown) til Kopiér og Gem. L: tekster { title, task, conclusion, from, decisions, skipped, open, project, projectLabel }
  function toText(card, L, project) {
    if (!card) return "";
    var lines = ["# " + (L.title || "") + (project ? ": " + project : "")];
    if (card.task) lines.push("", "**" + L.task + "** " + card.task);
    lines.push("", "## " + L.conclusion, "");
    if (card.conclusion.seat) lines.push("_" + L.from.replace("{seat}", card.conclusion.seat) + "_", "");
    lines.push(card.conclusion.text);
    if (card.decided.length) {
      lines.push("", "## " + L.decisions, "");
      card.decided.forEach(function (d) {
        lines.push("- " + d.question + " → " + (d.skipped ? L.skipped : d.answer));
      });
    }
    if (card.open.length) {
      lines.push("", "## " + L.open, "");
      card.open.forEach(function (x) {
        lines.push("- " + x.question + (x.seat ? " (" + x.seat + ")" : ""));
      });
    }
    return lines.join("\n") + "\n";
  }

  // Et filnavn, der virker på alle systemer
  function fileName(project) {
    var base = str(project).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "Resultat";
    return base + " - resultat";
  }

  return { build: build, toText: toText, fileName: fileName };
});
