// 12-spend-metrics.js
// Forbrug/pris-opsummering og Målinger-panelet.

  function formatTokens(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function formatUsd(n) {
    if (n < 0.01) return "< $0.01";
    return "$" + n.toFixed(2);
  }

  // Sum tokens/cost across a seat's call ledger. Each priced call keeps the
  // price that was in effect when it happened, so this never drifts when
  // the price table changes later — only new calls see new prices.
  function summarizeCalls(calls) {
    var inputTokens = 0,
      outputTokens = 0,
      cachedTokens = 0,
      cost = 0,
      pendingCalls = 0,
      pricedCalls = 0;
    (calls || []).forEach(function (c) {
      inputTokens += c.inputTokens || 0;
      outputTokens += c.outputTokens || 0;
      cachedTokens += c.cachedTokens || 0;
      if (c.pricePending || !c.price) {
        pendingCalls++;
      } else {
        pricedCalls++;
        cost += (c.inputTokens / 1e6) * c.price.priceInPerM + (c.outputTokens / 1e6) * c.price.priceOutPerM;
      }
    });
    return {
      calls: (calls || []).length,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cachedTokens: cachedTokens,
      cost: cost,
      pendingCalls: pendingCalls,
      pricedCalls: pricedCalls,
    };
  }

  function usageLineText(summary) {
    var text = t("usageCallsAndTokens", {
      calls: summary.calls,
      tokens: formatTokens(summary.inputTokens + summary.outputTokens),
    });
    if (summary.pricedCalls > 0) text += " · " + formatUsd(summary.cost);
    if (summary.pendingCalls > 0) {
      text += summary.pricedCalls > 0
        ? t("usagePendingWithPriced", { pending: summary.pendingCalls })
        : t("usagePendingNoPriced");
    }
    return text;
  }

  // Alle kald på et bord: stolenes og Tredje øjes egne (Tredje øje har sin egen Modelprofil API og ingen stol).
  function boardCallsOf(board) {
    var calls = [];
    (board.seats || []).forEach(function (seat) {
      calls = calls.concat(seat.calls || []);
    });
    return calls.concat(board.thirdEyeCalls || []);
  }

  function renderBoardSpend() {
    var el = document.getElementById("boardSpend");
    var allCalls = boardCallsOf(currentBoard());
    // Kort figur i selve project-baren — det fulde regnskab (pr. kald,
    // pr. stol) står i popover'en, se renderSpendPopover().
    var summary = summarizeCalls(allCalls);
    el.textContent = summary.pricedCalls > 0 ? formatUsd(summary.cost) : "$0.00";
    var popover = document.getElementById("spendPopover");
    if (!popover.hidden) renderSpendPopover();
    renderPlaque();
  }

  // Klik på $-knappen i project-baren åbner denne — samme per-stol-data som
  // altid har været beregnet, bare ikke tidligere vist samlet ét sted.
  // --- Målinger-panel (læser board.events via lib/metrics.js) ---
  function fmtMs(ms) {
    return ms == null ? "–" : (ms / 1000).toFixed(1) + " s";
  }

  function renderMetricsPanel() {
    var body = document.getElementById("metricsBody");
    document.getElementById("metricsStatus").textContent = "";
    window.rundbord.getEvents(store.activeBoardId).then(function (events) {
      var r = window.RundbordMetrics.summarize(events, currentBoard().seats);
      if (!events.length) {
        body.innerHTML = '<p class="note">' + escapeHtml(t("metricsEmpty")) + "</p>";
        return;
      }
      var tt = r.totals;
      var cost = tt.costKnownCalls ? formatUsd(tt.costUsd) : "–";
      var html = '<p class="metrics-line">' + escapeHtml(t("metricsTotalsLine", {
        calls: tt.calls, tokens: formatTokens(tt.inputTokens + tt.outputTokens), cost: cost, avg: fmtMs(tt.avgDurationMs), failed: tt.failed,
      })) + "</p>";
      var errKinds = Object.keys(r.errors);
      if (errKinds.length) {
        html += '<p class="metrics-line">' + escapeHtml(t("metricsErrorsLine", {
          list: errKinds.map(function (k) { return k + " ×" + r.errors[k]; }).join(", "),
        })) + "</p>";
      }
      html += '<h3 class="eyebrow">' + escapeHtml(t("metricsSeatsHeading")) + '</h3><div class="metrics-scroll"><table class="metrics-table"><tr>' +
        ["metricsColSeat", "metricsColCalls", "metricsColIn", "metricsColOut", "metricsColAvg", "metricsColFails", "metricsColCost"]
          .map(function (k) { return "<th>" + escapeHtml(t(k)) + "</th>"; }).join("") + "</tr>" +
        r.bySeat.map(function (row) {
          return "<tr><td>" + escapeHtml(row.name) + "</td><td>" + row.calls + "</td><td>" + formatTokens(row.inputTokens) + "</td><td>" +
            formatTokens(row.outputTokens) + "</td><td>" + fmtMs(row.avgDurationMs) + "</td><td>" + row.failed + "</td><td>" +
            (row.costKnownCalls ? formatUsd(row.costUsd) : "–") + "</td></tr>";
        }).join("") + "</table></div>";
      if (r.byTask.length) {
        html += '<h3 class="eyebrow">' + escapeHtml(t("metricsTasksHeading")) + '</h3><div class="metrics-scroll"><table class="metrics-table"><tr>' +
          ["metricsColTask", "metricsColCalls", "metricsColTokens", "metricsColCost", "metricsColTime", "metricsColFails"]
            .map(function (k) { return "<th>" + escapeHtml(t(k)) + "</th>"; }).join("") + "</tr>" +
          r.byTask.slice(0, 12).map(function (row) {
            return "<tr><td>" + escapeHtml(row.text || "—") + "</td><td>" + row.calls + "</td><td>" + formatTokens(row.tokens) + "</td><td>" +
              (row.costUsd ? formatUsd(row.costUsd) : "–") + "</td><td>" + fmtMs(row.durationMs || null) + "</td><td>" + row.failed + "</td></tr>";
          }).join("") + "</table></div>";
      }
      if (r.handoff.built) {
        html += '<p class="metrics-line">' + escapeHtml(t("metricsHandoffLine", {
          built: r.handoff.built, fallbacks: r.handoff.fallbacks, sent: r.handoff.charsSent, full: r.handoff.charsFull,
          saved: r.handoff.savedPct == null ? "–" : r.handoff.savedPct + " %",
        })) + "</p>";
      }
      var u = r.user;
      html += '<p class="metrics-line">' + escapeHtml(t("metricsUserLine", {
        resolved: u.needResolved, dials: u.dialApplied, flagged: u.proposalFlagged, approved: u.proposalApproved, dismissed: u.proposalDismissed, variants: u.variantChosen,
      })) + "</p>";
      var hm = r.human;
      if (hm && hm.any) {
        html += '<h3 class="eyebrow">' + escapeHtml(t("metricsHumanHeading")) + "</h3>";
        var hl = [];
        if (hm.pauses) hl.push(t("metricsHumanPauses", { pauses: hm.pauses, question: hm.pausesQuestion, always: hm.pausesAlways, edge: hm.pausesEdge, shown: hm.questionsShown }));
        if (hm.decided || hm.comments) {
          hl.push(t("metricsHumanQuestions", {
            answered: hm.answered, skipped: hm.skipped, pct: hm.skippedPct == null ? "–" : hm.skippedPct + " %", edge: hm.answeredOnEdge + hm.skippedOnEdge, comments: hm.comments,
          }));
        }
        if (hm.closingChecks) hl.push(t("metricsHumanClosing", { runs: hm.closingChecks, open: hm.openAtEnd }));
        if (hm.diffs) hl.push(t("metricsHumanDiffs", { n: hm.diffs }));
        if (hm.reflections) hl.push(t("metricsHumanReflections", { n: hm.reflections }));
        if (hm.envOpened) hl.push(t("metricsHumanEnvelopes", { opened: hm.envOpened, sent: hm.envSent, edited: hm.envEdited, cancelled: hm.envCancelled }));
        if (hm.ownWritten || hm.ownSkipped) {
          hl.push(t("metricsHumanOwn", { written: hm.ownWritten, skipped: hm.ownSkipped, compared: hm.ownCompared, kept: hm.ownKept, adjusted: hm.ownAdjusted, switched: hm.ownSwitched }));
        }
        hl.forEach(function (line) {
          html += '<p class="metrics-line">' + escapeHtml(line) + "</p>";
        });
        html += '<p class="note">' + escapeHtml(t("metricsHumanNote")) + "</p>";
      }
      var vf = r.verify;
      if (vf && (vf.passed || vf.failed || vf.unclear || vf.unproven || vf.retries)) {
        html += '<p class="metrics-line">' + escapeHtml(t("metricsVerifyLine", {
          passed: vf.passed, failed: vf.failed, unclear: vf.unclear, reworks: vf.reworks, overridden: vf.overridden, retries: vf.retries,
        })) + "</p>";
        if (vf.unproven) html += '<p class="metrics-line">' + escapeHtml(t("metricsUnprovenLine", { n: vf.unproven })) + "</p>";
      }
      body.innerHTML = html;
    });
  }

  function openMetricsPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      document.getElementById(id).hidden = true;
    });
    renderMetricsPanel();
    document.getElementById("metricsPanel").hidden = false;
  }

  // Forbruget i den seneste kørsel (eller opgave), taget fra bordets hændelser. Regningen i alt er bordets samlede forbrug siden oprettelsen.
  function lastRunSummary(events) {
    var scope = window.RundbordWorkGraph.latestScope(events || []);
    if (!scope) return null;
    var s = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, pricedCalls: 0, pendingCalls: 0 };
    (events || []).forEach(function (e) {
      if (e.type !== "call.completed") return;
      var inScope = scope.runId ? e.runId === scope.runId : scope.taskId ? e.taskId === scope.taskId : e.at >= scope.since;
      if (!inScope) return;
      var d = e.data || {};
      s.calls += 1;
      s.inputTokens += d.inputTokens || 0;
      s.outputTokens += d.outputTokens || 0;
      if (typeof d.costUsd === "number") {
        s.cost += d.costUsd;
        s.pricedCalls += 1;
      } else s.pendingCalls += 1;
    });
    return s.calls ? s : null;
  }

  function renderSpendPopover() {
    var el = document.getElementById("spendPopover");
    var allCalls = boardCallsOf(currentBoard());
    var lines = currentBoard().seats.map(function (seat) {
      return '<p class="usage-line"><strong>' + escapeHtml(seat.name) + "</strong> — " +
        escapeHtml(usageLineText(summarizeCalls(seat.calls || []))) + "</p>";
    });
    var eyeCalls = currentBoard().thirdEyeCalls || [];
    if (eyeCalls.length) {
      lines.push('<p class="usage-line"><strong>' + escapeHtml(t("spendThirdEye")) + "</strong> — " + escapeHtml(usageLineText(summarizeCalls(eyeCalls))) + "</p>");
    }
    var totalLine = '<p class="usage-line">' +
      escapeHtml(allCalls.length ? t("spendPrefix") + usageLineText(summarizeCalls(allCalls)) : t("spendNone")) +
      "</p>";
    el.innerHTML = totalLine + lines.join("");
    // Seneste kørsel hentes frisk fra hændelserne (den lokale kopi kan være et skridt bagud)
    var boardId = store.activeBoardId;
    window.rundbord.getEvents(boardId).then(function (events) {
      var last = lastRunSummary(events);
      if (!last || boardId !== store.activeBoardId) return;
      el.insertAdjacentHTML("afterbegin", "");
      var p = document.createElement("p");
      p.className = "usage-line usage-last";
      p.textContent = t("spendLastRun") + usageLineText(last);
      var first = el.querySelector(".usage-line");
      if (first && first.nextSibling) el.insertBefore(p, first.nextSibling);
      else el.appendChild(p);
    });
  }

  function renderBoardBar() {
    var select = document.getElementById("boardSelect");
    select.innerHTML = "";
    Object.keys(store.boards).forEach(function (id) {
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = store.boards[id].projectName || t("unnamedBoard");
      opt.selected = id === store.activeBoardId;
      select.appendChild(opt);
    });
  }

  var appInfo = null;

  function renderAppVersion() {
    var el = document.getElementById("appVersionLine");
    if (!el || !appInfo) return;
    el.textContent = t("appVersionLine", { version: appInfo.version, revision: appInfo.revision });
    var uv = document.getElementById("updateVersionLine");
    if (uv && !uv.textContent) uv.textContent = t("updateVersionLine", { version: appInfo.version });
    var warn = document.getElementById("secretsWarning");
    if (warn) warn.hidden = appInfo.secretsEncrypted !== false;
  }

