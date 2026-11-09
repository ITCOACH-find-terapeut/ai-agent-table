// Tredje øje 2.0: regler på hændelseslogen. Ingen modelkald. Hvert fund peger på de hændelser, der udløste det,
// så det kan efterprøves. Ren logik uden DOM/Electron: window.RundbordObserver i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordObserver = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_TASKS = 5; // kun de seneste opgaver observeres

  function byTask(events) {
    var tasks = {};
    (events || []).forEach(function (e) {
      if (!e || !e.taskId) return;
      var t = tasks[e.taskId] || (tasks[e.taskId] = { id: e.taskId, events: [], last: "" });
      t.events.push(e);
      if (String(e.at || "") > t.last) t.last = String(e.at || "");
    });
    return Object.keys(tasks)
      .map(function (k) {
        return tasks[k];
      })
      .sort(function (a, b) {
        return b.last.localeCompare(a.last);
      })
      .slice(0, MAX_TASKS);
  }

  function ids(list) {
    return list.map(function (e) {
      return e.id;
    });
  }

  function ofType(list, type) {
    return list.filter(function (e) {
      return e.type === type;
    });
  }

  // → [{ key, kind, severity: "high"|"medium"|"low", taskId, seatId, evidence: [eventId], data }]
  function findings(events, opts) {
    opts = opts || {};
    var dismissed = {};
    ofType(events || [], "finding.dismissed").forEach(function (e) {
      if (e.data && e.data.key) dismissed[e.data.key] = true;
    });
    var out = [];
    function add(kind, severity, task, evidenceEvents, data, seatId) {
      var key = kind + ":" + task.id + (seatId ? ":" + seatId : "");
      if (dismissed[key]) return;
      out.push({ key: key, kind: kind, severity: severity, taskId: task.id, seatId: seatId || null, evidence: ids(evidenceEvents), data: data || {} });
    }

    byTask(events).forEach(function (task) {
      var ev = task.events;

      // 1. Samme behov rejses igen og igen (peger på samme rolle)
      var byRole = {};
      ofType(ev, "need.raised").forEach(function (e) {
        var role = String((e.data && e.data.role) || "").toLowerCase().trim();
        if (!role) return;
        (byRole[role] = byRole[role] || []).push(e);
      });
      Object.keys(byRole).forEach(function (role) {
        if (byRole[role].length >= 3) add("need_repeated", "medium", task, byRole[role], { role: role, count: byRole[role].length });
      });

      // 2. Kontrollen består gentagne gange ikke
      var bad = ofType(ev, "check.failed").concat(ofType(ev, "check.unclear"), ofType(ev, "check.unproven"));
      if (bad.length >= 3) add("check_failing", "high", task, bad, { count: bad.length });

      // 3. Tilbagesendelserne er opbrugt
      var reworks = ofType(ev, "route.rework");
      if (reworks.length >= (opts.maxReworks || 2)) add("rework_limit", "high", task, reworks, { count: reworks.length });

      // 4. Mange fejlede kald i forhold til antal kald
      var done = ofType(ev, "call.completed");
      var failed = ofType(ev, "call.failed");
      var total = done.length + failed.length;
      if (total >= 3 && failed.length / total >= 0.4) add("failing_calls", "high", task, failed, { failed: failed.length, total: total });

      // 5. Samme stol kaldt uforholdsvis mange gange
      var perSeat = {};
      done.forEach(function (e) {
        if (e.seatId) (perSeat[e.seatId] = perSeat[e.seatId] || []).push(e);
      });
      Object.keys(perSeat).forEach(function (sid) {
        if (perSeat[sid].length >= 6) add("busy_seat", "low", task, perSeat[sid], { count: perSeat[sid].length }, sid);
      });

      // 6. Overdragelsen falder gang på gang tilbage til fuld tekst
      var fallbacks = ev.filter(function (e) {
        return e.type === "handoff.built" && e.data && e.data.fallback;
      });
      if (fallbacks.length >= 2) add("handoff_fallback", "medium", task, fallbacks, { count: fallbacks.length });

      // 7. Kørslen blev stoppet af prisgrænsen
      var budget = ev.filter(function (e) {
        return e.type === "run.stopped" && e.data && e.data.reason === "budget";
      });
      if (budget.length) add("budget_stop", "high", task, budget, {});

      // 8. Brugeren har overstyret en kontrol (kun til orientering)
      var overrides = ofType(ev, "check.overridden");
      if (overrides.length) add("check_overridden", "low", task, overrides, { count: overrides.length });
    });

    var order = { high: 0, medium: 1, low: 2 };
    return out.sort(function (a, b) {
      return order[a.severity] - order[b.severity];
    });
  }

  return { findings: findings };
});
