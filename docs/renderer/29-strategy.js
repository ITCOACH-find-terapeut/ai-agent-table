// 29-strategy.js
// Strategibibliotek og arbejdsgraf. Arbejdsgrafen er udledt af bordets egne hændelser (lib/workgraph.js) og sammenlignes med den valgte strategi
// (lib/strategy.js) efter regler. Den gives kun til Tredje øje, når der er valgt en strategi; ellers er Tredje øjes opførsel uændret.

  var strategyEditingId = null; // id på den strategi, der redigeres ("" = ny)

  function strategyLocale() {
    return store.locale === "da" ? "da" : "en";
  }

  function allStrategies() {
    return window.RundbordStrategy.starters(strategyLocale()).concat(store.strategies || []);
  }

  function strategyById(id) {
    return allStrategies().filter(function (s) {
      return s.id === id;
    })[0] || null;
  }

  function currentStrategy() {
    return strategyById(currentBoard().strategyId || "");
  }

  // Alt, grafen og Tredje øje skal bruge: den faktiske graf, strategien og afvigelserne
  function workGraphData() {
    var board = currentBoard();
    var graph = window.RundbordWorkGraph.derive(board);
    var strategy = currentStrategy();
    var out = { graph: graph, strategy: strategy, parsed: null, mapping: [], deviations: [] };
    if (strategy) {
      var v = window.RundbordStrategy.validate(strategy);
      if (v.ok) {
        out.parsed = v.parsed;
        out.mapping = window.RundbordStrategy.mapToSeats(v.parsed, board.seats);
        out.deviations = window.RundbordWorkGraph.compare(v.parsed, out.mapping, graph, board.seats);
      }
    }
    return out;
  }

  // Tilføjes til Tredje øjes kontekst. Tom uden en valgt strategi, så intet ændres for dem, der ikke bruger den.
  function strategyContextSection() {
    var d = workGraphData();
    if (!d.strategy || !d.parsed) return "";
    return "\n\n" + window.RundbordWorkGraph.contextText({ strategy: d.strategy, graph: d.graph, deviations: d.deviations, locale: strategyLocale() });
  }

  // ---- Valg af strategi i Indstillinger → Dette bord ----
  function renderStrategySelect() {
    var sel = document.getElementById("strategySelect");
    if (!sel) return;
    var current = currentBoard().strategyId || "";
    var html = '<option value="">' + escapeHtml(t("strategyNone")) + "</option>";
    allStrategies().forEach(function (s) {
      html += '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name + (s.builtin ? t("strategyBuiltinSuffix") : "")) + "</option>";
    });
    sel.innerHTML = html;
    sel.value = strategyById(current) ? current : "";
  }

  // ---- Tegningen ----
  function svgText(x, y, cls, text, anchor) {
    return '<text x="' + x + '" y="' + y + '" class="' + cls + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + escapeHtml(text) + "</text>";
  }

  function renderWorkGraph() {
    var d = workGraphData();
    var graph = d.graph;
    var box = document.getElementById("workGraph");
    var notes = document.getElementById("workGraphNotes");
    var board = currentBoard();
    var nodes = [];
    var edges = [];
    var keyOfNode = {};
    var nodeStat = {};
    graph.nodes.forEach(function (n) {
      nodeStat[n.id] = n;
    });
    if (d.parsed) {
      d.mapping.forEach(function (m) {
        var key = m.seatId || "node:" + m.node;
        keyOfNode[m.node] = key;
        var st = m.seatId ? nodeStat[m.seatId] : null;
        nodes.push({
          key: key, label: m.node, state: !m.seatId ? "nomatch" : st && st.visits ? "visited" : "idle",
          sub: !m.seatId ? t("wgUnmatched") : st && st.visits ? t("wgVisits", { n: st.visits }) + (st.checkFail ? " · " + t("wgCheckFail", { n: st.checkFail }) : "") : t("wgIdle"),
        });
      });
      graph.nodes.forEach(function (n) {
        if (nodes.some(function (x) { return x.key === n.id; })) return;
        nodes.push({ key: n.id, label: n.name, state: "unplanned", sub: t("wgVisits", { n: n.visits }) + " · " + t("wgUnplanned") });
      });
      d.parsed.edges.forEach(function (e) {
        edges.push({ from: keyOfNode[e.from], to: keyOfNode[e.to], kind: "plan", label: "" });
      });
    } else {
      graph.nodes.forEach(function (n) {
        nodes.push({ key: n.id, label: n.name, state: "visited", sub: t("wgVisits", { n: n.visits }) + (n.checkFail ? " · " + t("wgCheckFail", { n: n.checkFail }) : "") });
      });
    }
    graph.edges.forEach(function (e) {
      edges.push({ from: e.from, to: e.to, kind: e.kind, label: (e.kind === "rework" ? "↩ " : "") + (e.count > 1 || e.kind === "rework" ? String(e.count) : "") });
    });
    if (!nodes.length) {
      box.innerHTML = '<p class="note">' + escapeHtml(t("strategyNoRun")) + "</p>";
      notes.innerHTML = "";
      return;
    }
    var L = window.RundbordGraphLayout.layout(nodes, edges);
    var svg =
      '<svg class="wg-svg" viewBox="0 0 ' + L.width + " " + L.height + '" role="img" aria-label="' + escapeHtml(t("wgAriaLabel")) + '">' +
      '<defs><marker id="wgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="wg-arrow"/></marker></defs>';
    L.edges.forEach(function (e) {
      svg += '<path class="wg-edge wg-' + e.kind + '" d="' + e.d + '" marker-end="url(#wgArrow)"/>';
      if (e.label) svg += svgText(e.lx, e.ly - 3, "wg-elabel wg-elabel-" + e.kind, e.label, "middle");
    });
    L.nodes.forEach(function (n) {
      svg +=
        '<g class="wg-node wg-' + n.state + '"><title>' + escapeHtml(n.label + " · " + n.sub) + "</title>" +
        '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="9"/>' +
        svgText(n.x + n.w / 2, n.y + 20, "wg-name", n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label, "middle") +
        n.sub.split(" · ").slice(0, 2).map(function (line, i) {
          return svgText(n.x + n.w / 2, n.y + 33 + i * 12, "wg-sub", line.length > 22 ? line.slice(0, 21) + "…" : line, "middle");
        }).join("") + "</g>";
    });
    svg += "</svg>";
    box.innerHTML = svg;
    var html = '<p class="note">' + escapeHtml(t("wgLegend")) + "</p>";
    if (graph.scope && graph.scope.since) html += '<p class="note">' + escapeHtml(t("strategyLastRun", { time: new Date(graph.scope.since).toLocaleString(dateLocaleCode()) })) + "</p>";
    if (d.strategy) {
      html += '<h3 class="eyebrow">' + escapeHtml(t("strategyDeviations")) + "</h3>";
      if (!graph.path.length) html += '<p class="note">' + escapeHtml(t("strategyNoRun")) + "</p>";
      else if (!d.deviations.length) html += '<p class="note">' + escapeHtml(t("strategyNoDeviations")) + "</p>";
      else {
        html += '<ul class="wg-devs">' + d.deviations.map(function (dev) {
          return '<li class="wg-dev wg-dev-' + dev.severity + '">' + escapeHtml(window.RundbordWorkGraph.deviationText(dev, strategyLocale())) + "</li>";
        }).join("") + "</ul>";
      }
    } else {
      html += '<p class="note">' + escapeHtml(t("strategyChooseHint")) + "</p>";
    }
    notes.innerHTML = html;
    void board;
  }

  // ---- Biblioteket ----
  function renderStrategyList() {
    var box = document.getElementById("strategyList");
    var chosen = currentBoard().strategyId || "";
    box.innerHTML = allStrategies()
      .map(function (s) {
        var on = s.id === chosen;
        return (
          '<div class="strategy-item' + (on ? " on" : "") + '" data-id="' + escapeHtml(s.id) + '">' +
          '<div class="strategy-head"><strong>' + escapeHtml(s.name) + "</strong>" + (s.builtin ? '<span class="io-file-badge">' + escapeHtml(t("strategyBuiltinBadge")) + "</span>" : "") + (on ? '<span class="io-file-badge on">' + escapeHtml(t("strategyInUse")) + "</span>" : "") + "</div>" +
          (s.description ? '<p class="note">' + escapeHtml(s.description) + "</p>" : "") +
          '<pre class="strategy-text">' + escapeHtml(s.text) + "</pre>" +
          '<div class="row">' +
          (on ? "" : '<button type="button" class="btn btn-small strategy-use">' + escapeHtml(t("strategyUse")) + "</button>") +
          (s.builtin ? '<button type="button" class="btn btn-small strategy-copy">' + escapeHtml(t("strategyCopy")) + "</button>" : '<button type="button" class="btn btn-small strategy-edit">' + escapeHtml(t("strategyEdit")) + '</button><button type="button" class="btn btn-small btn-danger strategy-delete">' + escapeHtml(t("strategyDelete")) + "</button>") +
          "</div></div>"
        );
      })
      .join("");
  }

  function strategyErrorText(v) {
    if (v.error === "noName") return t("strategyErr_noName");
    return (v.errors || []).map(function (e) {
      return t("strategyErr_" + e.code, { line: e.line });
    }).join(" ");
  }

  function openStrategyEditor(strategy, asCopy) {
    strategyEditingId = strategy && !asCopy ? strategy.id : "";
    document.getElementById("strategyNameInput").value = strategy ? strategy.name + (asCopy ? t("strategyCopySuffix") : "") : "";
    document.getElementById("strategyDescInput").value = strategy ? strategy.description : "";
    document.getElementById("strategyTextInput").value = strategy ? strategy.text : "Clarifier -> Builder -> Reviewer\nReviewer -> Builder [" + t("strategyExampleLabel") + "]";
    document.getElementById("strategyEditorError").hidden = true;
    document.getElementById("strategyEditor").hidden = false;
    document.getElementById("strategyNameInput").focus();
  }

  function closeStrategyEditor() {
    document.getElementById("strategyEditor").hidden = true;
    strategyEditingId = null;
  }

  function saveStrategyFromEditor() {
    var v = window.RundbordStrategy.validate({
      id: strategyEditingId || "",
      name: document.getElementById("strategyNameInput").value,
      description: document.getElementById("strategyDescInput").value,
      text: document.getElementById("strategyTextInput").value,
    });
    var err = document.getElementById("strategyEditorError");
    if (!v.ok) {
      err.hidden = false;
      err.textContent = strategyErrorText(v);
      return;
    }
    err.hidden = true;
    window.rundbord.saveStrategy(v.strategy).then(function (s) {
      store = s;
      closeStrategyEditor();
      refreshStrategyViews();
    });
  }

  function chooseStrategy(id) {
    window.rundbord.updateBoard(store.activeBoardId, { strategyId: id }).then(function (s) {
      store = s;
      refreshStrategyViews();
    });
  }

  function refreshStrategyViews() {
    renderStrategySelect();
    if (!document.getElementById("strategyPanel").hidden) {
      renderWorkGraph();
      renderStrategyList();
    }
  }

  function openStrategyPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "talkPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    closeStrategyEditor();
    document.getElementById("strategyPanel").hidden = false;
    renderWorkGraph();
    renderStrategyList();
  }

  function initStrategy() {
    document.getElementById("openStrategyBtn").addEventListener("click", openStrategyPanel);
    document.getElementById("strategyCloseBtn").addEventListener("click", function () {
      closeStrategyEditor();
      document.getElementById("strategyPanel").hidden = true;
    });
    document.getElementById("strategyNewBtn").addEventListener("click", function () {
      openStrategyEditor(null, false);
    });
    document.getElementById("strategySaveBtn").addEventListener("click", saveStrategyFromEditor);
    document.getElementById("strategyCancelBtn").addEventListener("click", closeStrategyEditor);
    document.getElementById("strategyAskEyeBtn").addEventListener("click", function () {
      openTalkPanel();
      document.getElementById("talkInput").value = t("strategyAskPrefill");
    });
    document.getElementById("strategyList").addEventListener("click", function (e) {
      var item = e.target.closest && e.target.closest(".strategy-item");
      if (!item) return;
      var s = strategyById(item.getAttribute("data-id"));
      if (!s) return;
      if (e.target.closest(".strategy-use")) chooseStrategy(s.id);
      else if (e.target.closest(".strategy-copy")) openStrategyEditor(s, true);
      else if (e.target.closest(".strategy-edit")) openStrategyEditor(s, false);
      else if (e.target.closest(".strategy-delete")) {
        if (!window.confirm(t("strategyDeleteConfirm", { name: s.name }))) return;
        window.rundbord.deleteStrategy(s.id).then(function (st) {
          store = st;
          refreshStrategyViews();
        });
      }
    });
  }
