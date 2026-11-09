// 30-edge-questions.js
// Pilen mellem to stole viser det åbne: spørgsmål til brugeren (VURDERING) fra stolen, pilen går ud fra. Et klik åbner dem i pilens panel,
// hvor de besvares eller bevidst udelades. Beslutningen gemmes på stolens svar (meta.decisions, lib/decisions.js), så pilen, Næste skridt og
// pausekortet viser det samme. Alle afgørelser og åbne spørgsmål i opgaven samles i beslutningsregistret, der følger med i hver overdragelse
// (collectRegister/registerNote), og afslutningstjekket efter en kørsel tæller de åbne. Ingen tekst i hændelserne.

  // Stolens seneste svar i den seneste opgave.
  function latestReplyOf(seatId) {
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var list = (currentBoard().messages || []).filter(function (m) {
      return m.role === "assistant" && m.seatId === seatId && !(m.meta && m.meta.talk) && (!since || m.at >= since);
    });
    return list[list.length - 1] || null;
  }

  // Spørgsmålet til brugeren i et svar (højst ét; samme regler som mandatet som stop), ellers null.
  function questionOfMessage(m) {
    var summary = parseNeedsSummary(m.text);
    if (!summary || isEmptyNeed(summary.need)) return null;
    var roleIsSeat = Boolean(window.RundbordSeatRef.resolve(summary.role, currentBoard().seats).seat);
    var qs = window.RundbordMandate.humanQuestions({ need: summary.need, type: summary.needType, empty: false }, roleIsSeat);
    return qs.length ? qs[0].text : null;
  }

  // Det, pilen ud fra en stol viser: { state, open, decided, item }, item = { message, question, decision, blocking }
  function edgeQuestionInfo(fromId) {
    var none = { state: "none", open: 0, decided: 0, item: null };
    var m = latestReplyOf(fromId);
    if (!m) return none;
    var q = questionOfMessage(m);
    if (!q) return none;
    var decision = window.RundbordDecisions.find(m.meta && m.meta.decisions, q);
    var resolved = Boolean(m.meta && m.meta.needResolved);
    var open = !decision && !resolved;
    var blocking = open && typeof runView === "object" && runView && runView.pauseSeatId === fromId;
    var st = window.RundbordDecisions.edgeState({ open: open ? 1 : 0, decided: decision ? 1 : 0, blocking: blocking });
    return { state: st.state, open: st.open, decided: st.decided, item: { message: m, question: q, decision: decision, blocking: blocking } };
  }

  // Spørgsmålene hører til den første forbindelse ud fra hver stol (en genvej til en anden stol viser dem ikke igen).
  function annotateEdgeQuestions(edges) {
    var seen = {};
    edges.forEach(function (e) {
      if (seen[e.from]) return;
      seen[e.from] = true;
      e.q = edgeQuestionInfo(e.from);
    });
    return edges;
  }

  function edgeQBadgeHtml(q) {
    if (!q || q.state === "none") return "";
    return '<span class="ho-q-badge ho-q-' + q.state + '" aria-hidden="true">' + (q.state === "clear" ? "✓" : q.open) + "</span>";
  }

  function edgeQTitle(q) {
    if (!q || q.state === "none") return "";
    return t(q.state === "clear" ? "edgeQTitleClear" : q.state === "blocking" ? "edgeQTitleBlocking" : "edgeQTitleOpen", { n: q.open });
  }

  // Gem en beslutning på svaret. Returnerer et løfte.
  function recordDecision(messageId, question, d) {
    var m = (currentBoard().messages || []).filter(function (x) {
      return x.id === messageId;
    })[0];
    if (!m) return Promise.resolve();
    var list = window.RundbordDecisions.record(m.meta && m.meta.decisions, Object.assign({ question: question }, d), new Date().toISOString());
    return window.rundbord.setMessageMeta(store.activeBoardId, messageId, { decisions: list }).then(function (s) {
      store = s;
    });
  }

  // Beslutningsregistret for den seneste opgave: afgørelser og åbne spørgsmål.
  function collectRegister() {
    return window.RundbordDecisions.collect({
      messages: currentBoard().messages || [],
      seats: currentBoard().seats || [],
      since: typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "",
      questionOf: questionOfMessage,
    });
  }

  // Teksten, der følger med i hver overdragelse (tom, hvis der ikke er noget i registret).
  function registerNote() {
    return window.RundbordDecisions.registerText(t, collectRegister());
  }

  // Sektionen "Spørgsmål til dig" øverst i pilens panel.
  function edgeQuestionsSectionHtml(fromId) {
    var q = edgeQuestionInfo(fromId);
    if (q.state === "none") return "";
    var it = q.item;
    var html = '<h3 class="ho-h">' + escapeHtml(t("edgeQHeading")) + '</h3><div class="ho-q" data-from="' + escapeHtml(fromId) + '" data-msg="' + escapeHtml(it.message.id) + '">';
    html += '<p class="pause-q">' + escapeHtml(shieldRestoreText(it.question)) + "</p>";
    if (it.decision) {
      html += '<p class="note">' + escapeHtml(it.decision.skipped ? t("edgeQSkipped") : t("edgeQAnswered", { answer: shieldRestoreText(it.decision.answer) })) + "</p>";
      html += '<p class="note">' + escapeHtml(t("edgeQRegister")) + "</p>";
    } else if (it.blocking) {
      html += '<p class="note">' + escapeHtml(t("edgeQPaused")) + '</p><div class="row"><button type="button" class="btn primary" id="edgeQGoPauseBtn">' + escapeHtml(t("edgeQGoPause")) + "</button></div>";
    } else {
      html += '<textarea class="pause-a" id="edgeQAnswer" rows="2" placeholder="' + escapeHtml(t("edgeQPlaceholder")) + '"></textarea>';
      html += '<div class="row"><button type="button" class="btn primary" id="edgeQAnswerBtn">' + escapeHtml(t("edgeQAnswerBtn")) + '</button><button type="button" class="btn" id="edgeQSkipBtn">' + escapeHtml(t("pauseSkipBtn")) + "</button></div>";
      html += '<p class="note">' + escapeHtml(t("edgeQRegister")) + "</p>";
    }
    return html + "</div>";
  }

  function bindEdgeQuestions(spec) {
    var box = document.querySelector("#handoffBody .ho-q");
    if (!box) return;
    var msgId = box.getAttribute("data-msg");
    var go = document.getElementById("edgeQGoPauseBtn");
    if (go) {
      go.addEventListener("click", function () {
        var pp = document.getElementById("pausePanel");
        document.getElementById("handoffPanel").hidden = true;
        if (pp) pp.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
    function decide(skipped) {
      var q = edgeQuestionInfo(spec.fromId);
      if (!q.item || q.item.decision) return;
      var field = document.getElementById("edgeQAnswer");
      var text = field ? field.value.trim() : "";
      if (!skipped && !text) {
        if (field) field.focus();
        return;
      }
      var m = q.item.message;
      var ctx = { taskId: (m.meta && m.meta.taskId) || null, runId: (m.meta && m.meta.runId) || null };
      recordDecision(m.id, q.item.question, skipped ? { skipped: true } : { answer: text }).then(function () {
        emitEvent(skipped ? "question.skipped" : "question.answered", spec.fromId, ctx, { via: "edge" }, m.id);
        render();
        openHandoffPanel(spec);
      });
    }
    var a = document.getElementById("edgeQAnswerBtn");
    var s = document.getElementById("edgeQSkipBtn");
    if (a) a.addEventListener("click", function () { decide(false); });
    if (s) s.addEventListener("click", function () { decide(true); });
  }
