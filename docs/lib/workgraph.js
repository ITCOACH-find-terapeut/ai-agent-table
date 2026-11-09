// Arbejdsgrafen: hvad der faktisk skete i den seneste kørsel, udledt af bordets hændelser (hvem svarede, hvem fik arbejdet videre, hvad blev
// sendt tilbage). Og en sammenligning med den valgte strategi, med regler og uden modelkald. Resultatet kan vises som tegning og gives til
// Tredje øje som kort kontekst. Ren logik; window.RundbordWorkGraph i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordWorkGraph = factory();
})(typeof window !== "undefined" ? window : this, function () {
  function byTime(a, b) {
    return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0;
  }

  // Hvilken kørsel: den seneste med run.started (ellers den seneste opgave). → { runId, taskId } eller null
  function latestScope(events) {
    var list = (events || []).slice().sort(byTime);
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].type === "run.started") return { runId: list[i].runId || null, taskId: list[i].taskId || null, since: list[i].at };
    }
    for (var j = list.length - 1; j >= 0; j--) {
      if (list[j].type === "task.started") return { runId: null, taskId: list[j].taskId || null, since: list[j].at };
    }
    return null;
  }

  // board: { seats, events } → { scope, nodes, edges, path }
  //  nodes: [{ id, name, visits, failed, checkPass, checkFail }]  (kun stole, der var med)
  //  edges: [{ from, to, count, kind: "handoff"|"sequence"|"rework" }]  (sequence = svarene kom efter hinanden uden en logget overdragelse)
  //  path: stolenes id i den rækkefølge, de svarede
  function derive(board) {
    var seats = (board && board.seats) || [];
    var events = ((board && board.events) || []).slice().sort(byTime);
    var scope = latestScope(events);
    var out = { scope: scope, nodes: [], edges: [], path: [] };
    if (!scope) return out;
    var inScope = events.filter(function (e) {
      if (scope.runId) return e.runId === scope.runId;
      if (scope.taskId) return e.taskId === scope.taskId;
      return e.at >= scope.since;
    });
    var stats = {};
    function node(id) {
      if (!id) return null;
      if (!stats[id]) stats[id] = { id: id, name: "", visits: 0, failed: 0, checkPass: 0, checkFail: 0 };
      return stats[id];
    }
    var edgeMap = {};
    function edge(from, to, kind) {
      if (!from || !to || (from === to && kind !== "rework")) return;
      var key = kind + "|" + from + ">" + to;
      if (!edgeMap[key]) edgeMap[key] = { from: from, to: to, count: 0, kind: kind };
      edgeMap[key].count += 1;
    }
    inScope.forEach(function (e) {
      var d = e.data || {};
      if (e.type === "call.completed" && e.seatId) {
        node(e.seatId).visits += 1;
        out.path.push(e.seatId);
      } else if (e.type === "call.failed" && e.seatId) {
        node(e.seatId).failed += 1;
      } else if (e.type === "check.passed" && e.seatId) {
        node(e.seatId).checkPass += 1;
      } else if (e.type === "check.failed" && e.seatId) {
        node(e.seatId).checkFail += 1;
      } else if (e.type === "handoff.built" && e.seatId && d.fromSeatId) {
        node(d.fromSeatId);
        node(e.seatId);
        edge(d.fromSeatId, e.seatId, "handoff");
      } else if (e.type === "route.rework" && e.seatId && d.targetSeatId) {
        node(e.seatId);
        node(d.targetSeatId);
        edge(e.seatId, d.targetSeatId, "rework");
      }
    });
    // Rækkefølgen af svar giver også forbindelser, hvor ingen overdragelse blev logget (fx fordi svaret ikke havde en 🔭-blok).
    for (var k = 1; k < out.path.length; k++) {
      var pa = out.path[k - 1];
      var pb = out.path[k];
      if (pa === pb) continue;
      if (!edgeMap["handoff|" + pa + ">" + pb] && !edgeMap["rework|" + pa + ">" + pb]) edge(pa, pb, "sequence");
    }
    Object.keys(stats).forEach(function (id) {
      var seat = seats.filter(function (s) { return s.id === id; })[0];
      stats[id].name = seat ? seat.name : "?";
      out.nodes.push(stats[id]);
    });
    out.edges = Object.keys(edgeMap).map(function (k) { return edgeMap[k]; });
    return out;
  }

  // Sammenligning: strategi (parsed) + kobling til stole (mapToSeats) + den faktiske graf.
  // → [{ kind, names, count?, severity: "info"|"warn" }]
  //   unmapped   roller i strategien uden en stol med det navn
  //   missing    stole fra strategien, der ikke var med
  //   unplanned  stole, der var med, men ikke står i strategien
  //   order      stolene blev første gang taget i en anden rækkefølge end i strategien
  //   edge       en overdragelse, strategien ikke har (fra → til)
  //   loop       tilbagesendelser (info, hvis strategien har en vej tilbage; ellers advarsel)
  //   repeat     en stol, der svarede tre gange eller mere
  function compare(parsed, mapping, graph, seats) {
    var out = [];
    var nameOf = {};
    (seats || []).forEach(function (s) { nameOf[s.id] = s.name; });
    var mappedIds = {};
    var nodeOfSeat = {};
    mapping.forEach(function (m) {
      if (m.seatId) {
        mappedIds[m.seatId] = true;
        nodeOfSeat[m.seatId] = m.node;
      }
    });
    var unmapped = mapping.filter(function (m) { return !m.seatId; }).map(function (m) { return m.node; });
    if (unmapped.length) out.push({ kind: "unmapped", names: unmapped, severity: "warn" });
    var visited = {};
    graph.path.forEach(function (id) { visited[id] = true; });
    if (!graph.path.length) return out;
    var missing = mapping.filter(function (m) { return m.seatId && !visited[m.seatId]; }).map(function (m) { return m.node; });
    if (missing.length) out.push({ kind: "missing", names: missing, severity: "warn" });
    var unplanned = [];
    Object.keys(visited).forEach(function (id) { if (!mappedIds[id]) unplanned.push(nameOf[id] || "?"); });
    if (unplanned.length) out.push({ kind: "unplanned", names: unplanned, severity: "warn" });
    // første gang hver stol blev taget, mod strategiens rækkefølge
    var first = [];
    graph.path.forEach(function (id) { if (mappedIds[id] && first.indexOf(id) < 0) first.push(id); });
    var actual = first.map(function (id) { return nodeOfSeat[id]; });
    var planned = (parsed.nodes || []).filter(function (n) { return actual.indexOf(n) >= 0; });
    if (actual.join("|") !== planned.join("|")) out.push({ kind: "order", names: actual, expected: planned, severity: "warn" });
    // overdragelser mod strategiens kanter
    var allowed = {};
    (parsed.edges || []).forEach(function (e) { allowed[e.from + ">" + e.to] = true; });
    var badEdges = [];
    graph.edges.forEach(function (e) {
      if (e.kind !== "handoff" && e.kind !== "sequence") return;
      var a = nodeOfSeat[e.from];
      var b = nodeOfSeat[e.to];
      if (a && b && !allowed[a + ">" + b]) badEdges.push(a + " → " + b);
    });
    if (badEdges.length) out.push({ kind: "edge", names: badEdges, severity: "warn" });
    // tilbagesendelser
    var reworks = graph.edges.filter(function (e) { return e.kind === "rework"; }).reduce(function (n, e) { return n + e.count; }, 0);
    if (reworks) {
      var index = {};
      (parsed.nodes || []).forEach(function (n, i) { index[n] = i; });
      var hasBack = (parsed.edges || []).some(function (e) { return index[e.to] <= index[e.from]; });
      out.push({ kind: "loop", names: [], count: reworks, severity: hasBack ? "info" : "warn" });
    }
    graph.nodes.forEach(function (n) {
      if (n.visits >= 3) out.push({ kind: "repeat", names: [n.name], count: n.visits, severity: "info" });
    });
    return out;
  }

  var TEXT = {
    da: {
      header: "ARBEJDSGRAF OG STRATEGI (udledt af bordets egne hændelser; regler, ikke en vurdering)",
      strategy: "Valgt strategi: {name}",
      steps: "Strategiens veje:",
      path: "Det, der skete i den seneste kørsel (hvem svarede, i rækkefølge): {path}",
      visits: "Antal svar pr. stol: {visits}",
      reworks: "Tilbagesendelser efter kontrol: {count}",
      none: "Ingen kørsel at udlede en graf af.",
      deviations: "Afvigelser fra strategien:",
      noDeviations: "Ingen afvigelser fundet af reglerne.",
      "dev.unmapped": "Der er ingen stol med navnet: {names}",
      "dev.missing": "Disse stole fra strategien var ikke med: {names}",
      "dev.unplanned": "Disse stole var med, men står ikke i strategien: {names}",
      "dev.order": "Stolene blev første gang taget i rækkefølgen {names}; strategien har {expected}",
      "dev.edge": "Overdragelser, strategien ikke har: {names}",
      "dev.loop.info": "{count} tilbagesendelse(r), og strategien har en vej tilbage",
      "dev.loop.warn": "{count} tilbagesendelse(r), men strategien har ingen vej tilbage",
      "dev.repeat": "{names} svarede {count} gange",
      instruction: "Brug kun denne graf til at pege på, hvor forløbet afveg fra den valgte strategi, og hvorfor det kan have betydning. Opdigt ikke noget, grafen ikke viser. En afvigelse er ikke i sig selv en fejl.",
    },
    en: {
      header: "WORK GRAPH AND STRATEGY (derived from the table's own events; rules, not a judgement)",
      strategy: "Chosen strategy: {name}",
      steps: "The strategy's paths:",
      path: "What happened in the latest run (who answered, in order): {path}",
      visits: "Replies per seat: {visits}",
      reworks: "Sent back after a check: {count}",
      none: "No run to derive a graph from.",
      deviations: "Deviations from the strategy:",
      noDeviations: "No deviations found by the rules.",
      "dev.unmapped": "There is no seat named: {names}",
      "dev.missing": "These seats from the strategy were not part of it: {names}",
      "dev.unplanned": "These seats took part but are not in the strategy: {names}",
      "dev.order": "The seats were first taken in the order {names}; the strategy has {expected}",
      "dev.edge": "Handoffs the strategy does not have: {names}",
      "dev.loop.info": "{count} sent back, and the strategy has a way back",
      "dev.loop.warn": "{count} sent back, but the strategy has no way back",
      "dev.repeat": "{names} answered {count} times",
      instruction: "Use this graph only to point out where the run deviated from the chosen strategy, and why that may matter. Do not invent anything the graph does not show. A deviation is not in itself a mistake.",
    },
  };

  function fill(text, vars) {
    var out = String(text);
    Object.keys(vars || {}).forEach(function (k) { out = out.split("{" + k + "}").join(String(vars[k])); });
    return out;
  }

  function deviationText(dev, locale) {
    var T = TEXT[locale === "en" ? "en" : "da"];
    var key = "dev." + dev.kind + (dev.kind === "loop" ? "." + dev.severity : "");
    return fill(T[key] || dev.kind, { names: (dev.names || []).join(", "), expected: (dev.expected || []).join(", "), count: dev.count || 0 });
  }

  // Kort tekst til Tredje øje (højst ca. 1500 tegn). Tom, når der ikke er valgt en strategi.
  function contextText(opts) {
    opts = opts || {};
    var T = TEXT[opts.locale === "en" ? "en" : "da"];
    if (!opts.strategy) return "";
    var graph = opts.graph || { path: [], nodes: [], edges: [] };
    var lines = [T.header, fill(T.strategy, { name: opts.strategy.name }), T.steps];
    String(opts.strategy.text || "").split("\n").forEach(function (l) {
      if (l.trim()) lines.push("  " + l.trim());
    });
    if (!graph.path.length) {
      lines.push(T.none);
    } else {
      var nameOf = {};
      graph.nodes.forEach(function (n) { nameOf[n.id] = n.name; });
      var path = graph.path.map(function (id) { return nameOf[id] || "?"; });
      if (path.length > 24) path = path.slice(0, 24).concat(["…"]);
      lines.push(fill(T.path, { path: path.join(" → ") }));
      lines.push(fill(T.visits, { visits: graph.nodes.map(function (n) { return n.name + " " + n.visits; }).join(", ") }));
      var reworks = graph.edges.filter(function (e) { return e.kind === "rework"; }).reduce(function (n, e) { return n + e.count; }, 0);
      if (reworks) lines.push(fill(T.reworks, { count: reworks }));
      var devs = opts.deviations || [];
      lines.push(devs.length ? T.deviations : T.noDeviations);
      devs.forEach(function (d) { lines.push("- " + deviationText(d, opts.locale)); });
    }
    lines.push(T.instruction);
    return lines.join("\n").slice(0, 1800);
  }

  return { derive: derive, compare: compare, contextText: contextText, deviationText: deviationText, latestScope: latestScope };
});
