// 50-result.js
// Resultatkortet (lib/resultcard.js): efter en kørsel (og når som helst fra «Resultat») samles opgavens leverance ét sted: bordets seneste svar ordret,
// dine beslutninger og de spørgsmål, der stadig er åbne. Kopiér, Gem som fil og «Brug bordet igen» (samme opsætning, nyt og rent bord).
// Intet nyt modelkald og intet opdigtet: samtalen og de enkelte svar kan stadig åbnes som før.

  function resultEl(id) {
    return document.getElementById(id);
  }

  function resultCardNow() {
    var board = currentBoard();
    var res = latestResultMessage();
    if (!board || !res) return null;
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var firstUser = (board.messages || []).filter(function (m) {
      return m.role === "user" && !(m.meta && m.meta.talk) && (!since || m.at >= since);
    })[0];
    return window.RundbordResultCard.build({
      task: firstUser ? firstUser.text : "",
      result: { text: stripNeedsSummary(res.text), seat: (seatById(res.seatId) || {}).name || "" },
      register: collectRegister(),
      clean: shieldRestoreText,
    });
  }

  function resultLabels() {
    return { title: t("resultTitle"), task: t("resultTaskLabel"), conclusion: t("resultConclusion"), from: t("resultFrom", { seat: "{seat}" }), decisions: t("resultDecisions"), skipped: t("resultSkipped"), open: t("resultOpen") };
  }

  function resultTextNow() {
    return window.RundbordResultCard.toText(resultCardNow(), resultLabels(), (currentBoard() || {}).projectName || "");
  }

  function resultListFill(listId, boxId, items) {
    var ul = resultEl(listId);
    ul.innerHTML = "";
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
    resultEl(boxId).hidden = !items.length;
  }

  // «Resultat» ved beskedfeltet vises, så snart der er et svar at samle
  function updateResultBtn() {
    var btn = resultEl("openResultBtn");
    if (btn) btn.hidden = !(currentBoard() && latestResultMessage());
  }

  function openResultPanel() {
    var card = resultCardNow();
    if (!card) return;
    resultEl("resultTask").textContent = card.task ? t("resultTaskLine", { task: card.task }) : "";
    resultEl("resultTask").hidden = !card.task;
    resultEl("resultFrom").textContent = card.conclusion.seat ? t("resultFrom", { seat: card.conclusion.seat }) : "";
    resultEl("resultFrom").hidden = !card.conclusion.seat;
    resultEl("resultText").textContent = card.conclusion.text;
    resultListFill("resultDecisions", "resultDecisionsBox", card.decided.map(function (d) {
      return d.question + " → " + (d.skipped ? t("resultSkipped") : d.answer);
    }));
    resultListFill("resultOpenList", "resultOpenBox", card.open.map(function (x) {
      return x.question + (x.seat ? " (" + x.seat + ")" : "");
    }));
    resultEl("resultStatus").textContent = "";
    resultEl("resultReuse").hidden = true;
    resultEl("resultPanel").hidden = false;
    if (resultEl("resultPanel").scrollIntoView) resultEl("resultPanel").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function closeResultPanel() {
    resultEl("resultPanel").hidden = true;
  }

  // Efter en gennemført kørsel åbnes kortet af sig selv, medmindre dit eget bud ligger til sammenligning
  function openResultPanelAfterRun() {
    if (!resultEl("comparePanel").hidden) return;
    openResultPanel();
  }

  function resultSay(text, isError) {
    var el = resultEl("resultStatus");
    el.className = isError ? "note error-text" : "note";
    el.textContent = text;
  }

  function copyResult() {
    var text = resultTextNow();
    if (!text) return;
    var done = function () {
      resultSay(t("resultCopied"), false);
    };
    var fallback = function () {
      var box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(box);
      if (ok) done();
      else resultSay(t("resultCopyFailed"), true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function saveResult() {
    var text = resultTextNow();
    if (!text) return;
    window.rundbord.saveTextFile(window.RundbordResultCard.fileName((currentBoard() || {}).projectName) + ".md", text, "md").then(function (res) {
      if (res && res.ok) resultSay(t("resultSaved", { path: res.path || "" }), false);
      else if (!res || !res.canceled) resultSay(t("resultSaveFailed"), true);
    });
  }

  // «Brug bordet igen»: først en forklaring af, hvad der følger med, så et nyt, rent bord med samme opsætning (lib/boardcopy.js). Intet sendes til nogen model.
  function reuseResultOpen() {
    resultEl("resultReuse").hidden = false;
    resultEl("resultReuseGoBtn").focus();
  }

  function reuseResultGo() {
    var btn = resultEl("resultReuseGoBtn");
    if (btn.disabled) return;
    btn.disabled = true;
    window.rundbord
      .duplicateBoard(store.activeBoardId)
      .then(function (s) {
        store = s;
        closeResultPanel();
        render();
        var name = (currentBoard() || {}).projectName || "";
        if (typeof updateRunUI === "function") updateRunUI(t("resultReuseDone", { name: name }));
        document.getElementById("msgInput").focus();
      })
      .catch(function () {
        resultSay(t("resultReuseFailed"), true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function bindResult() {
    resultEl("openResultBtn").addEventListener("click", openResultPanel);
    resultEl("resultCloseBtn").addEventListener("click", closeResultPanel);
    resultEl("resultCopyBtn").addEventListener("click", copyResult);
    resultEl("resultSaveBtn").addEventListener("click", saveResult);
    resultEl("resultReuseBtn").addEventListener("click", reuseResultOpen);
    resultEl("resultReuseGoBtn").addEventListener("click", reuseResultGo);
    resultEl("resultReuseCancelBtn").addEventListener("click", function () {
      resultEl("resultReuse").hidden = true;
    });
  }
