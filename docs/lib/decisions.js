// Beslutninger om spørgsmål til brugeren (VURDERING), gemt på stolens svar, beslutningsregistret (alle afgørelser og åbne spørgsmål i en opgave) og hvad
// pilen mellem to stole viser om dem. Ren logik uden DOM/Electron.
//   decisions: [{ question, answer? | skipped: true, at }] på beskeden (meta.decisions)
// window.RundbordDecisions i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordDecisions = factory();
})(typeof window !== "undefined" ? window : this, function () {
  function norm(q) {
    return String(q == null ? "" : q).replace(/\s+/g, " ").trim();
  }

  function find(decisions, question) {
    var q = norm(question);
    return (decisions || []).filter(function (d) {
      return norm(d.question) === q;
    })[0] || null;
  }

  // Ny liste med beslutningen (en tidligere om samme spørgsmål erstattes). d: { question, answer } eller { question, skipped: true }
  function record(decisions, d, at) {
    var q = norm(d.question);
    var rest = (decisions || []).filter(function (x) {
      return norm(x.question) !== q;
    });
    var entry = { question: q, at: at || "" };
    if (d.skipped) entry.skipped = true;
    else entry.answer = String(d.answer == null ? "" : d.answer).trim();
    if (!d.skipped && !entry.answer) return rest;
    rest.push(entry);
    return rest;
  }

  // Beslutningsregistret for en opgave: alle afgørelser (på tværs af stolenes svar) og de spørgsmål, der stadig er åbne (hver stols seneste svar).
  // o: { messages, seats, since, questionOf(message) → spørgsmålets tekst eller null }
  // → { decided: [{ seat, question, decision }], open: [{ seat, question, messageId }] }
  function collect(o) {
    var msgs = (o.messages || []).filter(function (m) {
      return m.role === "assistant" && !(m.meta && m.meta.talk) && (!o.since || m.at >= o.since);
    });
    var nameOf = {};
    (o.seats || []).forEach(function (st) {
      nameOf[st.id] = st.name;
    });
    var decided = [];
    msgs.forEach(function (m) {
      ((m.meta && m.meta.decisions) || []).forEach(function (d) {
        var q = norm(d.question);
        decided = decided.filter(function (x) {
          return norm(x.question) !== q;
        });
        decided.push({ seat: nameOf[m.seatId] || "", question: d.question, decision: d });
      });
    });
    var open = [];
    (o.seats || []).forEach(function (st) {
      var mine = msgs.filter(function (m) {
        return m.seatId === st.id;
      });
      var last = mine[mine.length - 1];
      if (!last) return;
      var q = o.questionOf(last);
      if (!q || (last.meta && last.meta.needResolved)) return;
      var settled = decided.some(function (x) {
        return norm(x.question) === norm(q);
      });
      if (!settled) open.push({ seat: st.name, question: q, messageId: last.id });
    });
    return { decided: decided, open: open };
  }

  // Teksten, der følger med i hver overdragelse til en stol: afgørelser og åbne spørgsmål. Tom, hvis der hverken er det ene eller det andet.
  function registerText(t, reg) {
    if (!reg || (!reg.decided.length && !reg.open.length)) return "";
    var lines = [t("registerHeader")];
    reg.decided.forEach(function (x) {
      lines.push(x.decision.skipped ? t("registerSkipped", { question: x.question }) : t("registerAnswer", { question: x.question, answer: x.decision.answer }));
    });
    if (reg.open.length) {
      lines.push(t("registerOpenHeader"));
      reg.open.forEach(function (x) {
        lines.push(t("registerOpenItem", { question: x.question, seat: x.seat }));
      });
    }
    return lines.join("\n");
  }

  // Afslutningstjek (regler, ingen model): hvor mange spørgsmål er stadig åbne, og hvilke
  function closingCheck(reg) {
    return { open: reg ? reg.open.length : 0, decided: reg ? reg.decided.length : 0, items: reg ? reg.open : [] };
  }

  // Pilens tilstand ud fra spørgsmålene på stolen, pilen går ud fra.
  //   open: åbne spørgsmål (ikke afgjort); decided: afgjorte; blocking: bordet holder pause og venter på svaret lige nu
  // → { state: "none" | "open" | "blocking" | "clear", open, decided }
  function edgeState(o) {
    var open = (o && o.open) || 0;
    var decided = (o && o.decided) || 0;
    var state = open > 0 ? (o.blocking ? "blocking" : "open") : decided > 0 ? "clear" : "none";
    return { state: state, open: open, decided: decided };
  }

  return { find: find, record: record, collect: collect, registerText: registerText, closingCheck: closingCheck, edgeState: edgeState };
});
