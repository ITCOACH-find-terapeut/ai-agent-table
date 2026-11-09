// 35-diffview.js
// Uenighedsvisning: to svar ved siden af hinanden (helst fra to forskellige modeller), og efter dit valg et kald, hvor en model peger på, hvor de er enige og
// uenige. Svaret er en model-vurdering og kan tage fejl. Hver uenighed kan du tage stilling til; din afgørelse kommer i beslutningsregistret.
// Teksterne sendes kun til den model, du vælger, og går gennem Beskyttelse, hvis den er slået til. Hændelserne har kun antal, aldrig tekst.

  var diffState = { running: false, result: null };

  function diffEligibleMessages() {
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var seats = currentBoard().seats || [];
    return (currentBoard().messages || []).filter(function (m) {
      return m.role === "assistant" && !(m.meta && m.meta.talk) && seats.some(function (s) { return s.id === m.seatId; }) && (!since || m.at >= since);
    });
  }

  function diffMessageLabel(m) {
    var seat = seatById(m.seatId) || {};
    var time = new Date(m.at);
    var hhmm = isNaN(time.getTime()) ? "" : String(time.getHours()).padStart(2, "0") + ":" + String(time.getMinutes()).padStart(2, "0");
    return (seat.name || "?") + " · " + (seat.model || seat.provider || "") + (hhmm ? " · " + hhmm : "");
  }

  function diffMessageById(id) {
    return diffEligibleMessages().filter(function (m) { return m.id === id; })[0] || null;
  }

  function diffBodyText(m) {
    return shieldRestoreText(stripNeedsSummary(m.text || "")).trim();
  }

  function diffTaskText() {
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var tasks = (currentBoard().messages || []).filter(function (m) { return m.meta && m.meta.isTask && (!since || m.at >= since); });
    return tasks.length ? tasks[tasks.length - 1].text : "";
  }

  function renderDiffTexts() {
    var a = diffMessageById(document.getElementById("diffASelect").value);
    var b = diffMessageById(document.getElementById("diffBSelect").value);
    document.getElementById("diffAText").textContent = a ? diffBodyText(a) : "";
    document.getElementById("diffBText").textContent = b ? diffBodyText(b) : "";
    var sa = a ? seatById(a.seatId) : null;
    var sb = b ? seatById(b.seatId) : null;
    document.getElementById("diffSame").hidden = !(sa && sb && window.RundbordDiffView.modelKey(sa) === window.RundbordDiffView.modelKey(sb));
    document.getElementById("diffRunBtn").disabled = !(a && b && a.id !== b.id) || diffState.running;
  }

  function fillDiffSelects() {
    var msgs = diffEligibleMessages();
    var def = window.RundbordDiffView.defaults(msgs, currentBoard().seats, "");
    ["diffASelect", "diffBSelect"].forEach(function (id, i) {
      var sel = document.getElementById(id);
      sel.innerHTML = msgs.map(function (m) { return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(diffMessageLabel(m)) + "</option>"; }).join("");
      if (def) sel.value = i === 0 ? def.a.id : def.b.id;
    });
  }

  function fillDiffJudge() {
    var sel = document.getElementById("diffJudgeSelect");
    var seats = (currentBoard().seats || []).filter(function (s) { return s.apiKey; });
    sel.innerHTML = seats.map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name + " · " + (s.model || s.provider)) + "</option>"; }).join("");
    var a = diffMessageById(document.getElementById("diffASelect").value);
    var b = diffMessageById(document.getElementById("diffBSelect").value);
    var pick = window.RundbordDiffView.pickJudge(currentBoard().seats, a ? seatById(a.seatId) : null, b ? seatById(b.seatId) : null);
    if (pick) sel.value = pick.id;
    updateDiffCost();
  }

  function updateDiffCost() {
    var seat = seatById(document.getElementById("diffJudgeSelect").value);
    document.getElementById("diffCost").textContent = seat ? t("diffCost", { seat: seat.name, model: seat.model || seat.provider }) : t("diffNoJudge");
  }

  function openDiffPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "reflectPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    diffState.result = null;
    document.getElementById("diffResult").innerHTML = "";
    document.getElementById("diffStatus").textContent = "";
    var enough = diffEligibleMessages().length >= 2;
    document.getElementById("diffNeed").hidden = enough;
    document.getElementById("diffBody").hidden = !enough;
    if (enough) {
      fillDiffSelects();
      fillDiffJudge();
      renderDiffTexts();
    }
    emitEvent("diff.opened", null, runCtx, { replies: diffEligibleMessages().length });
    var panel = document.getElementById("diffPanel");
    panel.hidden = false;
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function clip(text, n) {
    return text.length > n ? text.slice(0, n) + "…" : text;
  }

  function renderDiffResult(parsed, rawText, judge) {
    var box = document.getElementById("diffResult");
    var b = diffMessageById(document.getElementById("diffBSelect").value);
    if (!parsed.ok) {
      box.innerHTML = '<p class="note">' + escapeHtml(t("diffUnreadable")) + '</p><div class="compare-text">' + escapeHtml(clip(String(rawText || ""), 2000)) + "</div>";
      return;
    }
    var html = '<p class="note">' + escapeHtml(t("diffModelNote", { seat: judge.name, model: judge.model || judge.provider })) + "</p>";
    if (parsed.agree.length) html += '<h3 class="ho-h">' + escapeHtml(t("diffAgree")) + "</h3><ul>" + parsed.agree.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>";
    if (parsed.differ.length) {
      html += '<h3 class="ho-h">' + escapeHtml(t("diffDiffer")) + "</h3>";
      parsed.differ.forEach(function (d, i) {
        html += '<div class="diff-item" data-i="' + i + '"><p><strong>' + escapeHtml(d.point) + "</strong></p>" +
          '<p class="note">A: ' + escapeHtml(d.a) + "<br>B: " + escapeHtml(d.b) + "</p>" +
          '<div class="row"><input type="text" class="diff-answer" data-i="' + i + '" placeholder="' + escapeHtml(t("diffAnswerPlaceholder")) + '">' +
          '<button type="button" class="btn diff-save" data-i="' + i + '">' + escapeHtml(t("diffSaveBtn")) + '</button></div><p class="note diff-saved" data-i="' + i + '" hidden>' + escapeHtml(t("diffSaved")) + "</p></div>";
      });
    }
    if (parsed.unclear.length) html += '<h3 class="ho-h">' + escapeHtml(t("diffUnclear")) + "</h3><ul>" + parsed.unclear.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>";
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".diff-save"), function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-i"));
        var input = box.querySelector('.diff-answer[data-i="' + i + '"]');
        var text = input ? input.value.trim() : "";
        if (!text || !b) {
          if (input) input.focus();
          return;
        }
        var ctx = { taskId: (b.meta && b.meta.taskId) || null, runId: (b.meta && b.meta.runId) || null };
        recordDecision(b.id, t("diffQuestionPrefix") + " " + parsed.differ[i].point, { answer: text }).then(function () {
          emitEvent("question.answered", b.seatId, ctx, { via: "diff" }, b.id);
          btn.disabled = true;
          if (input) input.disabled = true;
          box.querySelector('.diff-saved[data-i="' + i + '"]').hidden = false;
        });
      });
    });
  }

  function runDiff() {
    var a = diffMessageById(document.getElementById("diffASelect").value);
    var b = diffMessageById(document.getElementById("diffBSelect").value);
    var judge = seatById(document.getElementById("diffJudgeSelect").value);
    var status = document.getElementById("diffStatus");
    if (!a || !b || a.id === b.id || diffState.running) return;
    if (!judge || !judge.apiKey) {
      status.textContent = t("diffNoJudge");
      return;
    }
    diffState.running = true;
    document.getElementById("diffRunBtn").disabled = true;
    status.textContent = t("diffRunning", { seat: judge.name });
    var task = diffTaskText();
    var content = (task ? t("diffTaskHeader") + "\n" + clip(task, 1500) + "\n\n" : "") +
      t("diffAnswerHeader", { letter: "A", seat: (seatById(a.seatId) || {}).name || "?" }) + "\n" + clip(diffBodyText(a), 6000) + "\n\n" +
      t("diffAnswerHeader", { letter: "B", seat: (seatById(b.seatId) || {}).name || "?" }) + "\n" + clip(diffBodyText(b), 6000);
    var sink = document.createElement("p");
    streamReplyInto(judge, [{ role: "user", content: content }], t("diffInstruction"), sink, function () {}).then(function (res) {
      diffState.running = false;
      recordCall(judge, res, "diff", {});
      renderDiffTexts();
      if (!res.ok) {
        status.textContent = t("diffFailed") + " " + (res.message || "");
        return;
      }
      status.textContent = "";
      var parsed = window.RundbordDiffView.parse(res.reply || "");
      var same = window.RundbordDiffView.modelKey(seatById(a.seatId)) === window.RundbordDiffView.modelKey(seatById(b.seatId));
      emitEvent("diff.analysed", judge.id, runCtx, { ok: parsed.ok, agree: parsed.agree.length, differ: parsed.differ.length, unclear: parsed.unclear.length, sameModel: same });
      diffState.result = parsed;
      renderDiffResult(parsed, res.reply, judge);
    });
  }

  function bindDiffView() {
    document.getElementById("diffBtn").addEventListener("click", openDiffPanel);
    document.getElementById("closeDiffBtn").addEventListener("click", function () {
      document.getElementById("diffPanel").hidden = true;
    });
    document.getElementById("diffASelect").addEventListener("change", function () { renderDiffTexts(); fillDiffJudge(); });
    document.getElementById("diffBSelect").addEventListener("change", function () { renderDiffTexts(); fillDiffJudge(); });
    document.getElementById("diffJudgeSelect").addEventListener("change", updateDiffCost);
    document.getElementById("diffRunBtn").addEventListener("click", runDiff);
  }
