// 22-handoff-view.js
// Overdragelsen mellem stole gjort synlig: en diskret forbindelse mellem stolene (rundt og kompakt) eller et led mellem rækkerne
// (liste), en kort animation når en overdragelse sker, og et resumé man kan åbne. Bruger kun eksisterende data:
// hændelsen handoff.built (fra, til, fuld/struktureret, tegn) og beskedens meta.handoff. Ingen nye modelkald.
// Overdragelserne sker én ad gangen, så animationen viser aldrig to samtidige.

  var handoffAnim = null; // { fromId, toId, start, dur }
  var handoffTimer = null;
  var HANDOFF_ANIM_MS = 1000;

  // Overdragelser i denne session, så visningen ikke venter på, at hændelsen er gemt og hentet tilbage.
  var handoffMemory = [];

  // Gemte hændelser (handoff.built) + dem fra denne session, der endnu ikke er hentet tilbage, ældste først.
  function handoffEvents() {
    var saved = (currentBoard().events || []).filter(function (e) {
      return e.type === "handoff.built" && e.data && e.data.fromSeatId;
    });
    var mine = handoffMemory.filter(function (r) {
      return r.boardId === store.activeBoardId;
    });
    var extra = mine.filter(function (r) {
      return !saved.some(function (e) {
        return e.seatId === r.seatId && e.data.fromSeatId === r.data.fromSeatId && Math.abs(Date.parse(e.at) - Date.parse(r.at)) < 5000;
      });
    });
    return saved.concat(extra).sort(function (a, b) {
      return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    });
  }

  // Seneste overdragelse til/fra et par af stole, og den allersidste.
  function lastHandoffEvent() {
    var list = handoffEvents();
    return list[list.length - 1] || null;
  }

  function handoffEventFor(fromId, toId) {
    var list = handoffEvents().filter(function (e) {
      return e.data.fromSeatId === fromId && e.seatId === toId;
    });
    return list[list.length - 1] || null;
  }

  // Forbindelserne: stolenes rækkefølge (planlagt), de overdragelser der er sket (færdig), og den der sker nu (live).
  function handoffEdges(order, posById) {
    var edges = [];
    var seen = {};
    // state: planned (endnu ikke), seq (rækkefølgen, kørslen er nået forbi, men ingen overdragelse er logget), done (logget), live (sker nu)
    // manual: den seneste overdragelse var en manuel videresendelse og tegnes som en genvej
    // shortcut: overdragelsen gik et andet sted hen end rækkefølgen siger (fx et dynamisk valg af næste stol). Den tegnes som en mærket genvej, så en stol ikke ser ud til at have to planlagte pile.
    function add(a, b, state, manual, shortcut) {
      if (!posById[a] || !posById[b] || a === b) return;
      var key = a + ">" + b;
      if (seen[key]) {
        if (state === "live" || (state === "done" && (seen[key].state === "planned" || seen[key].state === "seq"))) seen[key].state = state;
        if (manual) seen[key].manual = true;
        return;
      }
      seen[key] = { from: a, to: b, state: state, manual: Boolean(manual), shortcut: Boolean(shortcut) };
      edges.push(seen[key]);
    }
    var idx = typeof runView === "object" && runView ? runView.index : -1;
    var finished = typeof runView === "object" && runView && runView.finished;
    // En overdragelse tæller som gennemført, hvis den er sket i den seneste opgave (eller kørsel).
    var taskAt = "";
    (currentBoard().events || []).forEach(function (e) {
      if (e.type === "task.started" && e.at > taskAt) taskAt = e.at;
    });
    var inOrder = {};
    for (var i = 0; i < order.length - 1; i++) {
      inOrder[order[i].id + ">" + order[i + 1].id] = true;
      var pair = handoffEventFor(order[i].id, order[i + 1].id);
      var logged = Boolean(pair && pair.at >= taskAt);
      add(order[i].id, order[i + 1].id, logged ? "done" : finished || i < idx ? "seq" : "planned");
    }
    var last = lastHandoffEvent();
    if (last) add(last.data.fromSeatId, last.seatId, "done", last.data.via === "manual", !inOrder[last.data.fromSeatId + ">" + last.seatId]);
    if (handoffAnim) add(handoffAnim.fromId, handoffAnim.toId, "live", false, !inOrder[handoffAnim.fromId + ">" + handoffAnim.toId]);
    return annotateEdgeQuestions(edges);
  }

  function edgePath(a, b) {
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var qx = 50 + (mx - 50) * 0.45;
    var qy = 50 + (my - 50) * 0.45;
    return "M" + a.x + "," + a.y + " Q" + qx + "," + qy + " " + b.x + "," + b.y;
  }

  // SVG-laget over bordet. Koordinater i procent af bordet (samme som stolenes placering).
  function handoffLinksSvg(edges, posById) {
    var html = '<svg class="handoff-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="false" role="group" aria-label="' + escapeHtml(t("handoffLinksLabel")) + '">';
    edges.forEach(function (e, n) {
      var d = edgePath(posById[e.from], posById[e.to]);
      var fromName = (seatById(e.from) || {}).name || "";
      var toName = (seatById(e.to) || {}).name || "";
      html +=
        '<path id="hoEdge' + n + '" class="handoff-edge ho-' + e.state + (e.manual ? " ho-manual" : "") + (e.shortcut ? " ho-shortcut" : "") + (e.q && e.q.state !== "none" ? " ho-q-" + e.q.state : "") + '" d="' + d + '" vector-effect="non-scaling-stroke"/>' +
        '<path class="handoff-hit" data-from="' + e.from + '" data-to="' + e.to + '" d="' + d + '" vector-effect="non-scaling-stroke"><title>' +
        escapeHtml(t("handoffEdgeTitle", { from: fromName, to: toName })) + "</title></path>";
    });
    html += '<circle id="hoPacket" class="handoff-packet" r="1.6" cx="-10" cy="-10"/></svg>';
    return html;
  }

  // Retningsmærket midt på hver forbindelse: en lille pil, der viser vejen informationen sendes (fra → til). Stedet er midten af kurven
  // (kvartvejs mellem endepunkterne og styrepunktet); retningen er fra → til. w og h er bordets bredde og højde i px, så vinklen passer.
  function handoffChipsHtml(edges, posById, w, h) {
    return edges
      .map(function (e) {
        var a = posById[e.from];
        var b = posById[e.to];
        var q = { x: 50 + ((a.x + b.x) / 2 - 50) * 0.45, y: 50 + ((a.y + b.y) / 2 - 50) * 0.45 };
        // Mærket sidder tættere på modtageren (70 % af vejen) end midt på kurven, så det ikke havner oven på bordets centerkort.
        var s = 0.7;
        var x = (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * q.x + s * s * b.x;
        var y = (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * q.y + s * s * b.y;
        var tx = 2 * (1 - s) * (q.x - a.x) + 2 * s * (b.x - q.x);
        var ty = 2 * (1 - s) * (q.y - a.y) + 2 * s * (b.y - q.y);
        var ang = Math.round((Math.atan2(ty * (h || 1), tx * (w || 1)) * 180) / Math.PI);
        var fromName = (seatById(e.from) || {}).name || "";
        var toName = (seatById(e.to) || {}).name || "";
        var ev = handoffEventFor(e.from, e.to);
        var label =
          e.state === "live" ? t("handoffRowLive", { name: toName })
          : e.manual ? t("handoffManualTitle", { from: fromName, to: toName })
          : e.shortcut ? t("handoffShortcutTitle", { from: fromName, to: toName })
          : e.state === "seq" ? t("handoffSeqTitle", { from: fromName, to: toName })
          : e.state === "done" && ev ? t("handoffRowDone", { name: toName })
          : t("handoffRowPlanned", { name: toName });
        var qTitle = edgeQTitle(e.q);
        if (qTitle) label += " · " + qTitle;
        var hasEnv = edgeHasEnvelope(e);
        if (hasEnv) label += " · " + t("envelopeArrowTitle");
        var hasPause = edgePauseOn(e);
        if (hasPause) label += " · " + t("edgePauseArrowTitle", { next: toName });
        return (
          '<button type="button" class="handoff-chip ho-' + e.state + (e.manual ? " ho-manual" : "") + (e.shortcut ? " ho-shortcut" : "") + (e.q && e.q.state !== "none" ? " ho-q-" + e.q.state : "") + (hasEnv ? " ho-env" : "") + (hasPause ? " ho-edge-pause" : "") + '" data-from="' + e.from + '" data-to="' + e.to + '" style="left:' + x.toFixed(2) + "%;top:" + y.toFixed(2) +
          '%" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"><svg viewBox="0 0 10 10" aria-hidden="true" style="transform:rotate(' + ang +
          'deg)"><path d="M1.5 5h7M5.8 2.2 8.6 5 5.8 7.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' + (hasEnv ? '<span class="ho-q-badge ho-q-blocking" aria-hidden="true">✉</span>' : edgeQBadgeHtml(e.q) || (hasPause ? '<span class="ho-q-badge ho-q-pause" aria-hidden="true">⏸</span>' : "")) + "</button>"
        );
      })
      .join("");
  }

  // Forklaring til linjerne, så man kan se, hvad de betyder: planlagt rækkefølge, overdragelse der er sket, og en mærket genvej uden for rækkefølgen (kun hvis der er en).
  function handoffLegendHtml(edges) {
    if (!edges.length) return "";
    var hasShortcut = edges.some(function (e) {
      return e.shortcut || e.manual;
    });
    function item(dash, labelKey) {
      return '<span><svg viewBox="0 0 22 6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + ' stroke-linecap="round"/></svg>' + escapeHtml(t(labelKey)) + "</span>";
    }
    return (
      '<div class="handoff-legend" role="note">' +
      item("3 4", "handoffLegendPlanned") +
      item("", "handoffLegendDone") +
      (hasShortcut ? item("8 3 1 3", "handoffLegendShortcut") : "") +
      "</div>"
    );
  }

  function bindHandoffLinks(box) {
    Array.prototype.forEach.call(box.querySelectorAll(".handoff-hit, .handoff-chip"), function (el) {
      el.addEventListener("click", function () {
        openHandoffPanel({ fromId: el.getAttribute("data-from"), toId: el.getAttribute("data-to") });
      });
    });
    if (!handoffAnim) return;
    var live = box.querySelector(".handoff-edge.ho-live");
    var pk = box.querySelector("#hoPacket");
    if (!live || !pk || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pk.classList.add("on");
    var len = live.getTotalLength();
    var p = Math.min(1, (performance.now() - handoffAnim.start) / handoffAnim.dur);
    var pt = live.getPointAtLength(len * p);
    pk.setAttribute("cx", pt.x);
    pk.setAttribute("cy", pt.y);
  }

  // Led mellem rækkerne i listevisningen: kun pilen (teksten står i svævetip og skærmlæserens navn) og, når den er sket, hvordan den blev sendt.
  function handoffLinkRowHtml(fromSeat, toSeat) {
    var ev = handoffEventFor(fromSeat.id, toSeat.id);
    var q = edgeQuestionInfo(fromSeat.id);
    var live = handoffAnim && handoffAnim.fromId === fromSeat.id && handoffAnim.toId === toSeat.id;
    var state = live ? "live" : ev ? "done" : "planned";
    var label = live ? t("handoffRowLive", { name: toSeat.name }) : ev ? t("handoffRowDone", { name: toSeat.name }) : t("handoffRowPlanned", { name: toSeat.name });
    if (edgeQTitle(q)) label += " · " + edgeQTitle(q);
    var chip = ev ? '<span class="ho-mode">' + escapeHtml(ev.data.mode === "structured" ? t("handoffModeStructuredShort") : ev.data.mode === "anchor" ? t("handoffModeAnchorShort") : t("handoffModeFullShort")) + "</span>" : "";
    return (
      '<div class="handoff-row ho-' + state + '">' +
      (ev || q.state !== "none"
        ? '<button type="button" class="handoff-row-btn" data-from="' + fromSeat.id + '" data-to="' + toSeat.id + '" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"><span class="ho-arrow" aria-hidden="true">↓</span>' + edgeQBadgeHtml(q) + "</button>"
        : '<span class="ho-arrow" role="img" title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '">↓</span>') +
      chip + "</div>"
    );
  }

  function bindHandoffRows(box) {
    Array.prototype.forEach.call(box.querySelectorAll(".handoff-row-btn"), function (btn) {
      btn.addEventListener("click", function () {
        openHandoffPanel({ fromId: btn.getAttribute("data-from"), toId: btn.getAttribute("data-to") });
      });
    });
  }

  // Kaldes, når en overdragelse er bygget (manuel videresendelse eller kørsel).
  function showHandoff(fromId, toId, info) {
    if (!fromId || !toId) return;
    info = info || {};
    handoffMemory.push({
      boardId: store.activeBoardId,
      type: "handoff.built",
      seatId: toId,
      at: new Date().toISOString(),
      data: { fromSeatId: fromId, mode: info.mode || "full", charsFull: info.charsFull || 0, charsSent: info.charsSent || 0, fallbackReason: info.fallbackReason || null, forcedFull: Boolean(info.forcedFull) },
    });
    if (handoffMemory.length > 50) handoffMemory.shift();
    handoffAnim = { fromId: fromId, toId: toId, start: performance.now(), dur: HANDOFF_ANIM_MS };
    clearInterval(handoffTimer);
    renderSeats();
    handoffTimer = setInterval(function () {
      var box = document.getElementById("tableBox");
      var pk = box && box.querySelector("#hoPacket");
      var live = box && box.querySelector(".handoff-edge.ho-live");
      var p = (performance.now() - handoffAnim.start) / handoffAnim.dur;
      if (p >= 1) {
        clearInterval(handoffTimer);
        handoffAnim = null;
        renderSeats();
        return;
      }
      if (pk && live && pk.classList.contains("on")) {
        var pt = live.getPointAtLength(live.getTotalLength() * p);
        pk.setAttribute("cx", pt.x);
        pk.setAttribute("cy", pt.y);
      }
    }, 30);
  }

  // ---- Resumé ----
  var HANDOFF_REASONS = {
    mode_full: "handoffReasonModeFull",
    no_handoff: "handoffReasonNoHandoff",
    no_needs_block: "handoffReasonNoNeeds",
  };

  // Den besked, overdragelsen handlede om: forrige stols seneste svar, før overdragelsen skete.
  function handoffSourceMessage(ev) {
    var msgs = (currentBoard().messages || []).filter(function (m) {
      return m.role === "assistant" && m.seatId === ev.data.fromSeatId && (!ev.at || m.at <= ev.at);
    });
    return msgs[msgs.length - 1] || null;
  }

  function handoffSectionHtml(titleKey, items) {
    if (!items || !items.length) return "";
    return (
      '<h3 class="ho-h">' + escapeHtml(t(titleKey)) + "</h3><ul>" +
      items
        .map(function (x) {
          return "<li>" + shieldHtml(x) + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function openHandoffPanel(spec) {
    var ev = spec.eventAt ? null : handoffEventFor(spec.fromId, spec.toId);
    var fromSeat = seatById(spec.fromId);
    var toSeat = seatById(spec.toId);
    var body = document.getElementById("handoffBody");
    document.getElementById("handoffTitle").textContent = t("handoffPanelTitle", { from: fromSeat ? fromSeat.name : "?", to: toSeat ? toSeat.name : "?" });
    var html = envelopePendingSectionHtml(spec) + edgeQuestionsSectionHtml(spec.fromId) + edgeSettingsSectionHtml(spec);
    if (!ev) {
      html += '<p class="note">' + escapeHtml(t("handoffNone")) + "</p>";
    } else {
      var structured = ev.data.mode === "structured";
      var src = handoffSourceMessage(ev);
      var hand = src && src.meta && src.meta.handoff;
      html += '<p><span class="ho-mode ' + (structured ? "ho-mode-str" : "") + '">' + escapeHtml(structured ? t("handoffModeStructured") : ev.data.mode === "anchor" ? t("handoffModeAnchor") : t("handoffModeFull")) + "</span> ";
      html += '<span class="note">' + escapeHtml(t("handoffChars", { sent: ev.data.charsSent, full: ev.data.charsFull })) + "</span></p>";
      if (structured && hand) {
        html += handoffSectionHtml("relayHandoffFacts", hand.facts);
        html += handoffSectionHtml("relayHandoffDecisions", hand.decisions);
        html += handoffSectionHtml("relayHandoffQuestions", hand.openQuestions);
        html += handoffSectionHtml("relayHandoffWarnings", hand.warnings);
        html += handoffSectionHtml("relayHandoffExpected", hand.expected);
      } else if (ev.data.mode === "anchor") {
        html += '<p class="note">' + escapeHtml(t("handoffAnchorNote")) + "</p>";
      } else {
        var why = ev.data.forcedFull ? "handoffReasonChecker" : HANDOFF_REASONS[ev.data.fallbackReason] || "handoffReasonModeFull";
        html += '<p class="note">' + escapeHtml(t("handoffFullNote")) + " " + escapeHtml(t(why)) + "</p>";
      }
    }
    body.innerHTML = html;
    bindEdgeQuestions(spec);
    bindEnvelopeGo();
    bindEdgeSettings(spec);
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "talkPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.getElementById("handoffPanel").hidden = false;
  }

  // Fra den fulde samtale: resumé af netop dette svars overdragelse (hvis den er sket).
  function openHandoffForMessage(messageId) {
    var m = (currentBoard().messages || []).filter(function (x) {
      return x.id === messageId;
    })[0];
    if (!m) return;
    var ev = handoffEvents().filter(function (e) {
      return e.data.fromSeatId === m.seatId && (!e.at || e.at >= m.at);
    })[0];
    if (ev) return openHandoffPanel({ fromId: ev.data.fromSeatId, toId: ev.seatId });
    document.getElementById("handoffTitle").textContent = t("handoffPanelTitleOne", { seat: (seatById(m.seatId) || {}).name || "?" });
    var hand = m.meta && m.meta.handoff;
    document.getElementById("handoffBody").innerHTML =
      '<p class="note">' + escapeHtml(t("handoffNotSentYet")) + "</p>" +
      (hand
        ? handoffSectionHtml("relayHandoffFacts", hand.facts) + handoffSectionHtml("relayHandoffDecisions", hand.decisions) +
          handoffSectionHtml("relayHandoffQuestions", hand.openQuestions) + handoffSectionHtml("relayHandoffWarnings", hand.warnings) +
          handoffSectionHtml("relayHandoffExpected", hand.expected)
        : "");
    document.getElementById("handoffPanel").hidden = false;
  }
