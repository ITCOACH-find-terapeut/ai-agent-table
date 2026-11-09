// 23-routing.js
// Hvem tager næste: forslag, godkendelse og autopilot. Logikken ligger i lib/routing.js; her er panelet og forbindelsen til kørslen.

  var pendingRoute = null; // (beslutning) => void, mens panelet venter på dit valg
  var routeProposal = null; // forslaget, panelet viser lige nu

  function routingSettings() {
    return window.RundbordRouting.normalizeSettings(currentBoard().routing);
  }

  function routingIsDynamic() {
    return routingSettings().mode === "suggest";
  }

  function routingSeatsForLogic(seats) {
    return seats.map(function (s) {
      return { id: s.id, name: s.name, checks: Boolean(s.checks), hasKey: Boolean(s.apiKey) };
    });
  }

  function routingReasonText(proposal, seats) {
    var parts = [];
    if (proposal.kind === "end") {
      parts.push(proposal.note === "none" ? t("routeEndSeat", { seat: proposal.fromName }) : t("routeEndLast"));
      return { why: parts.join(" "), src: "" };
    }
    var why = proposal.reason ? t("routeReason", { reason: shieldRestoreText(proposal.reason).slice(0, 200) }) : "";
    var src =
      proposal.source === "stol"
        ? t("routeSrcSeat", { seat: proposal.fromName })
        : t("routeSrcFixed", { why: proposal.note ? t("routeNote" + proposal.note.charAt(0).toUpperCase() + proposal.note.slice(1)) : t("routeNoteNosuggestion") });
    return { why: why, src: src };
  }

  function routeEstimateText(seat) {
    var est = window.RundbordRouting.estimate(currentBoard().events, seat.id, 5);
    if (!est) return t("routeEstimateNone", { seat: seat.name });
    var cost = est.costUsd == null ? t("routeCostUnknown") : "ca. " + usdText(est.costUsd);
    var secs = est.durationMs == null ? "" : Math.max(1, Math.round(est.durationMs / 1000)) + " s";
    return t("routeEstimate", { seat: seat.name, cost: cost, secs: secs || "–", n: est.n });
  }

  function routePauseText(code, seat, maxSteps) {
    switch (code) {
      case "end": return t("routePauseEnd");
      case "notExact": return t("routePauseNotExact");
      case "visits": return t("routePauseVisits", { seat: seat ? seat.name : "" });
      case "maxSteps": return t("routePauseMaxSteps", { max: maxSteps });
      case "ring": return t("routePauseRing");
      case "flip": return t("routePauseFlip", { seat: seat ? seat.name : "" });
      default: return "";
    }
  }

  function closeRoutePanel() {
    document.getElementById("routePanel").hidden = true;
    runView.routePendingId = null;
  }

  // Viser panelet og venter på dit valg. Resultat: { idx } | { end: true } | { stop: true }, plus hvad du gjorde ('approve'|'choose'|'end').
  function askRoute(o, proposal, seats, pauseCode) {
    var from = seats[o.idx];
    var target = proposal.kind === "seat" ? seats[proposal.idx] : null;
    var texts = routingReasonText(Object.assign({ fromName: from.name }, proposal), seats);
    document.getElementById("routeTitle").textContent = target ? t("routeProposeSeat", { seat: target.name }) : t("routeTitleEnd");
    document.getElementById("routeWhy").innerHTML =
      escapeHtml(texts.why) + (texts.src ? '<span class="route-src">' + escapeHtml(texts.src) + "</span>" : "");
    var pauseEl = document.getElementById("routePause");
    var pauseTxt = pauseCode ? routePauseText(pauseCode, target, window.RundbordRouting.maxStepsFor(seats.length)) : "";
    pauseEl.hidden = !pauseTxt;
    pauseEl.textContent = pauseTxt;
    document.getElementById("routeEstimate").textContent = target ? routeEstimateText(target) : "";
    var approve = document.getElementById("routeApproveBtn");
    approve.textContent = target ? t("routeApproveBtn", { seat: target.name }) : t("routeApproveEnd");
    var select = document.getElementById("routeSeatSelect");
    select.setAttribute("aria-label", t("routeChoosePlaceholder"));
    select.innerHTML =
      '<option value="">' + escapeHtml(t("routeChoosePlaceholder")) + "</option>" +
      seats
        .map(function (s, i) {
          return i === o.idx || (target && i === proposal.idx) ? "" : '<option value="' + i + '">' + escapeHtml(s.name) + "</option>";
        })
        .join("");
    document.getElementById("routeChooseBtn").disabled = true;
    document.getElementById("routeEndBtn").hidden = !target; // ved "Færdig?" er hovedknappen selv at afslutte
    var offer = document.getElementById("routeOffer");
    var showOffer = window.RundbordRouting.shouldOfferAutopilot(routingSettings());
    offer.hidden = !showOffer;
    if (showOffer) document.getElementById("routeOfferText").textContent = t("routeOfferText", { n: routingSettings().approvals });
    routeProposal = proposal;
    runView.routePendingId = from.id;
    runView.nextId = target ? target.id : null;
    document.getElementById("routePanel").hidden = false;
    renderSeats();
    updateRunUI(t("centreStateChoose"));
    return new Promise(function (resolve) {
      pendingRoute = function (decision) {
        pendingRoute = null;
        closeRoutePanel();
        resolve(decision);
      };
    });
  }

  // Kaldes af orkestratoren efter hvert vellykket svar, når bordet er sat til "foreslået".
  function chooseNextSeat(o, seats, taskText) {
    var settings = routingSettings();
    var logicSeats = routingSeatsForLogic(seats);
    var needs = parseNeedsSummary(o.reply);
    var proposal = window.RundbordRouting.propose({ seats: logicSeats, current: o.idx, needs: needs ? { need: needs.need, role: needs.role } : null });
    var stats = runView.routeStats;
    var from = seats[o.idx];
    var maxSteps = window.RundbordRouting.maxStepsFor(seats.length);
    emitEvent("route.suggested", from.id, runCtx, {
      targetSeatId: proposal.kind === "seat" ? seats[proposal.idx].id : null,
      source: proposal.source,
      how: proposal.how,
      note: proposal.note || "",
      end: proposal.kind === "end",
    });
    var verdict = settings.autopilot
      ? window.RundbordRouting.autopilot(proposal, { seats: logicSeats, steps: o.steps, history: o.history, visits: o.visits, maxSteps: maxSteps, lastNone: runView.lastNone, fromRework: o.fromRework })
      : { go: false, code: "" };
    function done(decision, how) {
      var target = decision.idx != null ? seats[decision.idx] : null;
      if (target) runView.handedTo[from.id] = target.name;
      runView.nextId = target ? target.id : null;
      return decision;
    }
    if (verdict.go) {
      var tgt = seats[proposal.idx];
      stats.auto += 1;
      emitEvent("route.auto", from.id, runCtx, { targetSeatId: tgt.id });
      return systemNote(t("routeAutoNote", { from: from.name, to: tgt.name, reason: shieldRestoreText(proposal.reason || "").slice(0, 160) })).then(function () {
        return done({ idx: proposal.idx }, "auto");
      });
    }
    if (settings.autopilot) emitEvent("route.paused", from.id, runCtx, { code: verdict.code });
    return askRoute(o, proposal, seats, settings.autopilot ? verdict.code : "").then(function (d) {
      if (d.stop) return d;
      if (d.end) {
        stats.ended = true;
        emitEvent("route.ended", from.id, runCtx, { by: "user", steps: o.steps });
        return systemNote(t("routeEndedNote", { n: o.steps })).then(function () {
          return done({ end: true });
        });
      }
      var chosen = seats[d.idx];
      var same = proposal.kind === "seat" && d.idx === proposal.idx;
      if (same) {
        stats.accepted += 1;
        emitEvent("route.accepted", from.id, runCtx, { targetSeatId: chosen.id, source: proposal.source });
        bumpApprovals(settings, true);
        return systemNote(t("routeApprovedNote", { from: from.name, to: chosen.name })).then(function () {
          return done({ idx: d.idx });
        });
      }
      stats.overridden += 1;
      emitEvent("route.overridden", from.id, runCtx, { targetSeatId: chosen.id, proposedSeatId: proposal.kind === "seat" ? seats[proposal.idx].id : null });
      bumpApprovals(settings, false);
      var proposedName = proposal.kind === "seat" ? seats[proposal.idx].name : t("routeTitleEnd");
      return systemNote(t("routeOverriddenNote", { to: chosen.name, proposed: proposedName })).then(function () {
        return done({ idx: d.idx });
      });
    });
  }

  // Tæller godkendelser i træk (til tilbuddet om autopilot); en ændring af dig nulstiller tælleren.
  function bumpApprovals(settings, approved) {
    var next = approved ? settings.approvals + 1 : 0;
    if (next === settings.approvals) return;
    window.rundbord.updateBoard(store.activeBoardId, { routing: { approvals: next } }).then(function (s) {
      store = s;
    });
  }

  function routeSummaryNote(seats) {
    var s = runView.routeStats;
    if (!runView.dynamic || !runView.path.length) return Promise.resolve();
    var path = runView.path
      .map(function (id) {
        var seat = seats.filter(function (x) { return x.id === id; })[0];
        return seat ? seat.name : "?";
      })
      .join(" → ");
    return systemNote(t("routeSummary", { path: path, steps: runView.path.length, accepted: s.accepted, overridden: s.overridden, auto: s.auto }));
  }

  function bindRoutingPanel() {
    var select = document.getElementById("routeSeatSelect");
    select.addEventListener("change", function () {
      document.getElementById("routeChooseBtn").disabled = !select.value;
    });
    document.getElementById("routeApproveBtn").addEventListener("click", function () {
      if (!pendingRoute) return;
      var target = routeProposal;
      pendingRoute(target.kind === "seat" ? { idx: target.idx } : { end: true });
    });
    document.getElementById("routeChooseBtn").addEventListener("click", function () {
      if (pendingRoute && select.value !== "") pendingRoute({ idx: Number(select.value) });
    });
    document.getElementById("routeEndBtn").addEventListener("click", function () {
      if (pendingRoute) pendingRoute({ end: true });
    });
    document.getElementById("routeStopBtn").addEventListener("click", function () {
      if (pendingRoute) pendingRoute({ stop: true });
    });
    document.getElementById("routeOfferOnBtn").addEventListener("click", function () {
      window.rundbord.updateBoard(store.activeBoardId, { routing: { autopilot: true } }).then(function (s) {
        store = s;
        document.getElementById("routeOffer").hidden = true;
        renderBoardPanelRouting();
      });
    });
    document.getElementById("routeOfferNoBtn").addEventListener("click", function () {
      window.rundbord.updateBoard(store.activeBoardId, { routing: { offerDismissed: true } }).then(function (s) {
        store = s;
        document.getElementById("routeOffer").hidden = true;
      });
    });
  }

  function renderBoardPanelRouting() {
    var r = routingSettings();
    var sel = document.getElementById("routingModeSelect");
    if (!sel) return;
    sel.value = r.mode;
    var box = document.getElementById("autopilotCheckbox");
    box.checked = r.autopilot;
    box.disabled = r.mode !== "suggest";
  }
