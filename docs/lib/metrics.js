// Ren aggregering af målings-logbogen (board.events). Ingen DOM, ingen Electron —
// indlæses som almindeligt <script> i appen (window.RundbordMetrics) og kan
// require'es direkte i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordMetrics = factory();
})(typeof window !== "undefined" ? window : this, function () {
  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }

  function emptySeatRow(seatId, name) {
    return { seatId: seatId, name: name, calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, costKnownCalls: 0, durationMs: 0, timedCalls: 0 };
  }

  function summarize(events, seats) {
    events = Array.isArray(events) ? events : [];
    seats = Array.isArray(seats) ? seats : [];
    var seatName = {};
    seats.forEach(function (s) {
      seatName[s.id] = s.name;
    });

    var totals = { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, costKnownCalls: 0, durationMs: 0, timedCalls: 0 };
    var bySeat = {};
    var byTask = {};
    var handoff = { built: 0, fallbacks: 0, charsFull: 0, charsSent: 0 };
    var errors = {};
    var verify = { passed: 0, failed: 0, unclear: 0, unproven: 0, reworks: 0, overridden: 0, stopped: 0, retries: 0 };
    // Din deltagelse: pauser, spørgsmål til dig, afslutningstjek og eget bud. Kun tal; aldrig tekst.
    var human = {
      pauses: 0, pausesQuestion: 0, pausesAlways: 0, pausesEdge: 0, questionsShown: 0,
      answered: 0, skipped: 0, answeredOnEdge: 0, skippedOnEdge: 0, comments: 0,
      closingChecks: 0, openAtEnd: 0,
      ownWritten: 0, ownSkipped: 0, ownCompared: 0, ownKept: 0, ownAdjusted: 0, ownSwitched: 0,
      envOpened: 0, envSent: 0, envEdited: 0, envCancelled: 0, reflections: 0, diffs: 0,
    };
    var user = { needResolved: 0, dialApplied: 0, proposalFlagged: 0, proposalApproved: 0, proposalDismissed: 0, variantChosen: 0, seatReconfigured: 0 };

    function seatRow(id) {
      var key = id || "—";
      if (!bySeat[key]) bySeat[key] = emptySeatRow(id, seatName[id] || (id ? "?" : "—"));
      return bySeat[key];
    }
    function taskRow(id) {
      if (!id) return null;
      if (!byTask[id]) byTask[id] = { taskId: id, text: "", startedAt: null, calls: 0, failed: 0, tokens: 0, costUsd: 0, durationMs: 0, handoffs: 0 };
      return byTask[id];
    }

    events.forEach(function (e) {
      var d = e.data || {};
      var task = taskRow(e.taskId);
      if (e.type === "call.completed") {
        var row = seatRow(e.seatId);
        [totals, row].forEach(function (t) {
          t.calls += 1;
          t.inputTokens += num(d.inputTokens);
          t.outputTokens += num(d.outputTokens);
          t.cachedTokens += num(d.cachedTokens);
          if (typeof d.costUsd === "number") {
            t.costUsd += d.costUsd;
            t.costKnownCalls += 1;
          }
          if (typeof d.durationMs === "number") {
            t.durationMs += d.durationMs;
            t.timedCalls += 1;
          }
        });
        if (task) {
          task.calls += 1;
          task.tokens += num(d.inputTokens) + num(d.outputTokens);
          task.costUsd += num(d.costUsd);
          task.durationMs += num(d.durationMs);
        }
      } else if (e.type === "call.failed") {
        totals.failed += 1;
        seatRow(e.seatId).failed += 1;
        if (task) task.failed += 1;
        var kind = d.errorKind || "other";
        errors[kind] = (errors[kind] || 0) + 1;
      } else if (e.type === "task.started") {
        if (task) {
          task.text = d.text || task.text;
          task.startedAt = e.at;
        }
      } else if (e.type === "handoff.built") {
        handoff.built += 1;
        if (d.fallback) handoff.fallbacks += 1;
        handoff.charsFull += num(d.charsFull);
        handoff.charsSent += num(d.charsSent);
        if (task) task.handoffs += 1;
      } else if (e.type === "check.passed") verify.passed += 1;
      else if (e.type === "check.failed") verify.failed += 1;
      else if (e.type === "check.unclear") verify.unclear += 1;
      else if (e.type === "check.unproven") verify.unproven += 1;
      else if (e.type === "route.rework") verify.reworks += 1;
      else if (e.type === "check.overridden") verify.overridden += 1;
      else if (e.type === "route.stopped") verify.stopped += 1;
      else if (e.type === "call.retried") verify.retries += 1;
      else if (e.type === "need.resolved") user.needResolved += 1;
      else if (e.type === "dial.applied") user.dialApplied += 1;
      else if (e.type === "proposal.flagged") user.proposalFlagged += 1;
      else if (e.type === "proposal.approved") user.proposalApproved += 1;
      else if (e.type === "proposal.dismissed") user.proposalDismissed += 1;
      else if (e.type === "variant.chosen") user.variantChosen += 1;
      else if (e.type === "seat.reconfigured") user.seatReconfigured += 1;
      else if (e.type === "run.paused") {
        human.pauses += 1;
        if (d.reason === "always") human.pausesAlways += 1;
        else if (d.reason === "edge") human.pausesEdge += 1;
        else human.pausesQuestion += 1;
        human.questionsShown += num(d.questions);
      } else if (e.type === "question.answered") {
        human.answered += 1;
        if (d.via === "edge") human.answeredOnEdge += 1;
      } else if (e.type === "question.skipped") {
        human.skipped += 1;
        if (d.via === "edge") human.skippedOnEdge += 1;
      } else if (e.type === "pause.commented") human.comments += 1;
      else if (e.type === "run.closingcheck") {
        human.closingChecks += 1;
        human.openAtEnd += num(d.open);
      } else if (e.type === "envelope.opened") human.envOpened += 1;
      else if (e.type === "reflection.scheduled") human.reflections += 1;
      else if (e.type === "diff.analysed") human.diffs += 1;
      else if (e.type === "envelope.sent") human.envSent += 1;
      else if (e.type === "envelope.edited") human.envEdited += 1;
      else if (e.type === "envelope.cancelled") human.envCancelled += 1;
      else if (e.type === "owntake.written") human.ownWritten += 1;
      else if (e.type === "owntake.skipped") human.ownSkipped += 1;
      else if (e.type === "owntake.compared") {
        human.ownCompared += 1;
        if (d.choice === "kept") human.ownKept += 1;
        else if (d.choice === "adjusted") human.ownAdjusted += 1;
        else if (d.choice === "switched") human.ownSwitched += 1;
      }
    });

    function withAvg(row) {
      row.avgDurationMs = row.timedCalls ? Math.round(row.durationMs / row.timedCalls) : null;
      return row;
    }

    human.decided = human.answered + human.skipped;
    human.skippedPct = human.decided ? Math.round((human.skipped / human.decided) * 100) : null;
    human.any = human.pauses + human.decided + human.comments + human.closingChecks + human.ownWritten + human.ownSkipped + human.ownCompared + human.envOpened + human.reflections + human.diffs > 0;

    handoff.savedPct = handoff.charsFull > 0 ? Math.round((1 - handoff.charsSent / handoff.charsFull) * 100) : null;

    return {
      totals: withAvg(totals),
      bySeat: Object.keys(bySeat)
        .map(function (k) {
          return withAvg(bySeat[k]);
        })
        .sort(function (a, b) {
          return b.calls - a.calls;
        }),
      byTask: Object.keys(byTask)
        .map(function (k) {
          return byTask[k];
        })
        .filter(function (t) {
          return t.calls || t.failed || t.text;
        })
        .sort(function (a, b) {
          return String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
        }),
      handoff: handoff,
      errors: errors,
      user: user,
      human: human,
      verify: verify,
    };
  }

  return { summarize: summarize };
});
