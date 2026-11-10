// 13-board-seats.js
// Selve bordet: stolene, projekt-panelet, stol-panelet (rediger/test/slet).

  function renderGithubStatus() {
    var el = document.getElementById("ghStatus");
    var connected = Boolean(currentBoard().githubUrl);
    el.textContent = connected ? t("ghStatusConnected") : t("ghStatusNotConnected");
    el.classList.toggle("connected", connected);
  }

  // Fakta til projektets centrum (se centreView i lib/viewstate.js).
  function centreContext(board) {
    if (runView.boardId !== store.activeBoardId) resetRunView();
    var order = runView.order.length ? runView.order : board.seats;
    var dynamicRun = runView.dynamic && (runActive || runView.finished);
    var summary = summarizeCalls(boardCallsOf(board));
    return {
      runActive: runActive,
      runFinished: runView.finished,
      pendingCheck: Boolean(runView.checkSeatId || runView.pauseSeatId),
      pendingKind: runView.pauseSeatId && !runView.checkSeatId ? "pause" : "check",
      runIndex: runView.dynamic ? Math.max(0, runView.path.length - 1) : runView.index,
      runTotal: dynamicRun ? null : order.length,
      routePending: Boolean(runView.routePendingId),
      runSeatName: dynamicRun
        ? ((board.seats.filter(function (s) { return s.id === (runView.routePendingId || runView.currentId); })[0] || {}).name || "")
        : order[runView.index] ? order[runView.index].name : "",
      spentUsd: summary.pricedCalls > 0 ? summary.cost : null,
      limitUsd: typeof board.maxRunCostUsd === "number" ? board.maxRunCostUsd : null,
      shield: shieldOn(),
    };
  }

  function centreStateText(state) {
    if (state.key === "running") {
      return state.total ? t("centreStateRunning", { current: state.current, total: state.total, seat: state.seat }) : t("centreStateRunningNoTotal", { seat: state.seat });
    }
    return t({ empty: "centreStateEmpty", ready: "centreStateReady", pause: "centreStatePause", "pause-you": "centreStatePauseYou", finished: "centreStateFinished", choose: "centreStateChoose" }[state.key]);
  }

  function renderPlaque() {
    var board = currentBoard();
    var plaque = document.getElementById("plaque");
    var v = window.RundbordViewState.centreView(
      { projectName: board.projectName, githubUrl: board.githubUrl, seatCount: board.seats.length },
      centreContext(board)
    );
    plaque.innerHTML = "";
    var h1 = document.createElement("h1");
    h1.textContent = v.name || "Intelligo Lab";
    plaque.appendChild(h1);
    var status = document.createElement("p");
    status.className = "centre-status state-" + v.state.key;
    status.textContent = centreStateText(v.state);
    plaque.appendChild(status);
    if (v.spend) {
      var spend = document.createElement("p");
      spend.className = "centre-spend";
      spend.textContent = v.spend.limitUsd != null
        ? t("centreSpendLimit", { usd: formatUsd(v.spend.usd), limit: formatUsd(v.spend.limitUsd) })
        : t("centreSpend", { usd: formatUsd(v.spend.usd) });
      plaque.appendChild(spend);
    }
    var gh = document.createElement("p");
    if (v.github.connected) {
      gh.className = "gh connected";
      gh.textContent = t("centreGithubOn", { repo: v.github.repo });
    } else {
      gh.className = "hint gh-off";
      gh.textContent = t("centreGithubOff") + " · " + t("clickToSetGithubRepo");
    }
    plaque.appendChild(gh);
    if (v.shield) {
      var sh = document.createElement("p");
      sh.className = "centre-shield";
      sh.textContent = t("centreShield");
      plaque.appendChild(sh);
    }
    plaque.onclick = openBoardPanel;
  }

  // isAuto: ikonet lyser, fordi dialen står på "Efter behov" (modellen vælger selv), ikke "Til". Vises som en kontur i stedet for fuldt tændt.
  function iconBtnHtml(group, key, icon, label, isActive, isAuto) {
    var shown = isAuto ? label + t("iconAutoSuffix") : label;
    return (
      '<button type="button" class="icon-btn' + (isActive ? " active" : "") + (isAuto ? " auto" : "") + '" data-group="' + group +
      '" data-key="' + key + '" data-tip="' + escapeHtml(shown) + '" aria-label="' + escapeHtml(shown) +
      '" aria-pressed="' + (isAuto ? "mixed" : isActive ? "true" : "false") + '"><span aria-hidden="true">' + icon + "</span></button>"
    );
  }

  function iconRowHtml(seat) {
    // Ikonerne vises ud fra de ryddede indstillinger (lib/seatsync.js), så de aldrig står anderledes end dialerne
    var synced = window.RundbordSeatSync.reconcile(null, seat);
    var icons = synced.icons;
    var autoOf = function (dialKey) {
      return Boolean(synced.dials && synced.dials[dialKey] && synced.dials[dialKey].state === "auto");
    };
    var mandateHtml = MANDATE_ICONS.map(function (m) {
      return iconBtnHtml("mandate", m.key, m.icon, iconTitle(m), icons.mandate === m.key, m.key === "kan" && icons.mandate === "kan" && autoOf("action"));
    }).join("");
    var workHtml = WORK_ICONS.map(function (w) {
      var on = Boolean(icons.work && icons.work[w.key]);
      return iconBtnHtml("work", w.key, w.icon, iconTitle(w), on, on && autoOf(window.RundbordSeatSync.WORK[w.key]));
    }).join("");
    var infoHtml = INFO_ICONS.map(function (n) {
      return iconBtnHtml("info", n.key, n.icon, iconTitle(n), Boolean(icons.info && icons.info[n.key]));
    }).join("");
    return (
      '<div class="seat-icons" role="group" aria-label="' + escapeHtml(t("seatIconsAriaLabel", { seat: seat.name })) + '">' +
      mandateHtml + '<span class="icon-sep"></span>' + workHtml +
      '<span class="icon-sep"></span>' + infoHtml + "</div>"
    );
  }

  function bindIconRow(el, seat) {
    var buttons = el.querySelectorAll(".icon-btn");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var group = btn.getAttribute("data-group");
        var key = btn.getAttribute("data-key");
        // Både ikoner og dials afledes af den stol, der vises (se lib/seatsync.js), så et klik altid ændrer det, man ser.
        var next = window.RundbordSeatSync.clickIcon(seat, group, key);
        seat.icons = next.icons;
        seat.dials = next.dials;
        window.rundbord.saveSeat(store.activeBoardId, seat).then(function (s) {
          store = s;
          renderSeats();
        });
      });
    });
  }

  // Lader brugeren trække en stol væk fra den faste cirkel-placering, via et
  // lille greb i hjørnet af coasteren — position gemmes pr. stol i procent
  // af bordfladen, så det er uafhængigt af vinduesstørrelse. Dobbeltklik på
  // grebet nulstiller til den automatiske cirkel-position.
  function bindSeatDrag(el, seat) {
    var handle = el.querySelector(".seat-drag-handle");
    if (!handle) return;
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var box = document.getElementById("tableBox");
      var rect = box.getBoundingClientRect();
      var startX = e.clientX;
      var startY = e.clientY;
      var latest = null;
      var moved = false;
      function onMove(ev) {
        if (!moved && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
          moved = true;
        }
        var x = ((ev.clientX - rect.left) / rect.width) * 100;
        var y = ((ev.clientY - rect.top) / rect.height) * 100;
        x = Math.max(6, Math.min(94, x));
        y = Math.max(6, Math.min(94, y));
        el.style.left = x + "%";
        el.style.top = y + "%";
        latest = { x: x, y: y };
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          // Musen slipper typisk oven på coasteren igen, efter den har fulgt
          // markøren under trækket — det udløser ellers en "click" bagefter,
          // som åbner "Rediger stol". Denne ene, engangs-lyttede click
          // sluges derfor, så et træk aldrig utilsigtet åbner panelet.
          var coaster = el.querySelector(".coaster");
          if (coaster) {
            coaster.addEventListener(
              "click",
              function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
              },
              { capture: true, once: true }
            );
          }
        }
        if (!latest) return;
        seat.pos = latest;
        window.rundbord.saveSeat(store.activeBoardId, seat).then(function (s) {
          store = s;
          renderSeats();
        });
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    handle.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      delete seat.pos;
      window.rundbord.saveSeat(store.activeBoardId, seat).then(function (s) {
        store = s;
        renderSeats();
      });
    });
  }

  // Menneskeligt statusord i stedet for tekniske states — "har turen" er i
  // praksis altid ensbetydende med "genererer lige nu" (turen sættes altid
  // umiddelbart før modelkaldet, se sendTextToSeat()/runStep()), så det er
  // nok til at afgøre "Arbejder" uden en separat live-tracking-mekanisme.
  // Fase F: nøglen bruges BÅDE til at slå oversættelsen op OG til at vælge
  // statusfarve (.status-working/.status-needs-input/.status-waiting i CSS)
  // — samme underliggende tilstand styrer tekst og farve, aldrig to steder
  // der kan komme ud af trit med hinanden.
  var SEAT_VIEW_WORD_KEYS = {
    working: "seatStatusWorking",
    choosing: "seatStatusChoosing",
    unused: "seatStatusUnused",
    turn: "seatStatusTurn",
    next: "seatStatusNext",
    waiting: "seatStatusWaiting",
    done: "seatStatusDone",
    "check-failed": "seatStatusCheckFailed",
    "pause-ask": "seatStatusPauseAsk",
    need: "seatStatusNeed",
    paused: "seatStatusPaused",
    failed: "seatStatusFailed",
    handing: "seatStatusHanding",
    receiving: "seatStatusReceiving",
  };

  // Kørslens tilstand til visningen. Nulstilles, når man skifter bord, eller når en ny kørsel starter.
  function newRunView(boardId) {
    return {
      boardId: boardId, order: [], index: -1, finished: false, checkSeatId: null, pauseSeatId: null, budgetStopped: false, handoff: null,
      // dynamisk valg af næste ("foreslået"): se renderer/23-routing.js
      dynamic: false, currentId: null, visitedIds: [], path: [], handedTo: {}, nextId: null, routePendingId: null, lastNone: {}, steps: 0,
      routeStats: { accepted: 0, overridden: 0, auto: 0, ended: false },
    };
  }
  var runView = newRunView(null);

  function resetRunView() {
    runView = newRunView(store.activeBoardId);
  }

  // Samler det, lib/viewstate.js skal bruge: kun fakta, appen allerede har (kørslens trin, kontrol, behov, kronen).
  function seatViewContext(board, openNeeds) {
    if (runView.boardId !== store.activeBoardId) resetRunView();
    var running = runActive || runView.finished || Boolean(runView.checkSeatId) || Boolean(runView.pauseSeatId);
    var order = (running && runView.order.length ? runView.order : board.seats).map(function (s) {
      return { id: s.id, name: s.name };
    });
    var needSeatIds = [];
    var needText = {};
    openNeeds.forEach(function (item) {
      if (item.suggestedSeat) {
        needSeatIds.push(item.suggestedSeat.id);
        if (!needText[item.suggestedSeat.id]) needText[item.suggestedSeat.id] = item.needsSummary.need;
      }
    });
    return {
      dynamic: runView.dynamic,
      currentId: runView.currentId,
      visitedIds: runView.visitedIds,
      handedTo: runView.handedTo,
      nextId: runView.nextId,
      routePendingId: runView.routePendingId,
      order: order,
      runActive: runActive,
      runIndex: runView.index,
      runFinished: runView.finished,
      failedIds: running
        ? runFailedIndexes
            .map(function (i) {
              return order[i] && order[i].id;
            })
            .filter(Boolean)
        : [],
      pendingCheckId: runView.checkSeatId || runView.pauseSeatId,
      pendingKind: runView.pauseSeatId && !runView.checkSeatId ? "pause" : "check",
      turnSeatId: board.turn && board.turn.seatId,
      handoff: runView.handoff,
      needSeatIds: needSeatIds,
      needText: needText,
    };
  }

  function seatActivityText(v, seat) {
    var a = v.activity;
    switch (a.kind) {
      case "calling":
        return t("seatActCalling", { model: seat.model || seat.provider || "" });
      case "waitingFor":
        return a.name ? t("seatActWaiting", { name: a.name }) : t("seatActReady");
      case "choosing":
        return t("seatActChoosing");
      case "proposed":
        return t("seatActProposed");
      case "handedOver":
        return t("seatActHanded", { name: a.to });
      case "finished":
        return t("seatActFinished");
      case "checkFailed":
        return t("seatActCheckFailed");
      case "pauseAsk":
        return t("seatActPauseAsk");
      case "need":
        return a.text ? "“" + shieldRestoreText(a.text).slice(0, 70) + "”" : t("seatActNeed");
      case "idle":
        return t("seatActIdle");
      case "failed":
        return t("seatActFailed");
      case "handing":
        return t("seatActHanding", { name: a.to });
      case "receiving":
        return t("seatActReceiving", { name: a.from });
      default:
        return "";
    }
  }

  // Sekundær information: åbnes ved hover/fokus. ALLE ti dials og alle ikoner står her (også dem, der er slået fra), så du kan se,
  // præcis hvordan stolen er sat. Alt står også i stolens panel.
  function seatDetailHtml(seat) {
    var synced = window.RundbordSeatSync.reconcile(null, seat);
    var view = { dials: synced.dials };
    var icons = synced.icons;
    var mandate = MANDATE_ICONS.filter(function (m) {
      return m.key === icons.mandate;
    })[0];
    var work = WORK_ICONS.filter(function (w) {
      return icons.work && icons.work[w.key];
    }).map(function (w) {
      return iconTitle(w).split(" (")[0];
    });
    var info = INFO_ICONS.filter(function (n) {
      return icons.info && icons.info[n.key];
    }).map(function (n) {
      return iconTitle(n).split(" — ")[0];
    });
    var additions = String(seat.customInstruction || "").split("\n").filter(function (l) {
      return l.trim();
    }).length;
    var rows = [
      [t("seatDetailModel"), '<span class="sd-mono">' + escapeHtml((seat.model || "?") + " · " + (seat.provider || "")) + "</span>"],
      mandate ? [t("seatDetailMandate"), escapeHtml(iconTitle(mandate))] : null,
      [t("seatDetailWork"), work.length ? escapeHtml(work.join(", ")) : '<span class="sd-off">' + escapeHtml(t("seatDetailNone")) + "</span>"],
      info.length ? [t("seatDetailInfo"), escapeHtml(info.join(", "))] : null,
    ].filter(Boolean);
    var groups = DIAL_GROUPS.map(function (g) {
      var parts = g.dials.map(function (key) {
        var dial = dialByKey(key);
        var on = dialIsOn(view, dial);
        return '<span class="' + (on ? "sd-on" : "sd-off") + '">' + escapeHtml(dialLabel(dial) + " " + dialStateText(view, dial).toLowerCase()) + "</span>";
      });
      return '<p><span class="sd-k">' + escapeHtml(t(g.titleKey)) + "</span> " + parts.join(" · ") + "</p>";
    }).join("");
    var tail = [
      seat.checks ? [t("seatDetailRole"), escapeHtml(t("seatDetailChecks"))] : null,
      seat.readsIn ? [t("seatDetailIn"), escapeHtml(t("seatDetailReadsIn"))] : null,
      additions ? [t("seatDetailAdditions"), String(additions)] : null,
    ].filter(Boolean);
    return (
      '<div class="seat-detail" role="group" aria-label="' + escapeHtml(t("seatDetailLabel", { seat: seat.name })) + '">' +
      rows.map(function (r) {
        return '<p><span class="sd-k">' + escapeHtml(r[0]) + "</span> " + r[1] + "</p>";
      }).join("") +
      groups +
      tail.map(function (r) {
        return '<p><span class="sd-k">' + escapeHtml(r[0]) + "</span> " + r[1] + "</p>";
      }).join("") +
      "</div>"
    );
  }


  // Tegner stolene i den valgte visning (se renderer/21-tableview.js): rundt, kompakt eller liste.
  // Rundt er som før (frie positioner, træk, hover-symboler). Kompakt og liste bruger de samme data og de samme klik.
  function renderSeats() {
    var board = currentBoard();
    renderPlaque(); // projektets centrum følger kørslens tilstand
    if (typeof renderEye === "function") renderEye();
    var box = document.getElementById("tableBox");
    var mode = tableViewMode();
    box.setAttribute("data-view", mode);
    var existing = box.querySelectorAll(".seat");
    existing.forEach(function (el) {
      el.remove();
    });
    var seats = board.seats.slice(0, SLOTS);
    var full = seats.length >= SLOTS;
    document.getElementById("fullNote").hidden = !full;
    var openNeeds = computeOpenNeeds();
    var viewCtx = seatViewContext(board, openNeeds);
    var posById = {};
    // Overdragelsernes mærker fjernes ved hver tegning (også rækkerne fra listevisningen), så intet står tilbage ved skift af visning.
    Array.prototype.forEach.call(box.querySelectorAll(".handoff-links, .handoff-chip, .handoff-row"), function (el) {
      el.remove();
    });

    seats.forEach(function (seat, i) {
      // Brugerens egne placeringer gælder kun i det runde bord; kompakt bruger de faste pladser.
      var custom = mode === "round" && seat.pos && typeof seat.pos.x === "number" && typeof seat.pos.y === "number";
      var pos = custom ? seat.pos : slotPosition(i);
      posById[seat.id] = pos;
      var el = document.createElement("div");
      el.className = "seat" + (mode === "compact" ? " seat-compact" : mode === "list" ? " seat-row" : "");
      if (mode !== "list") {
        el.style.left = pos.x + "%";
        el.style.top = pos.y + "%";
      }
      var keyDot = status[seat.id] === "ok" ? "ok" : status[seat.id] === "fail" ? "fail" : "";
      var keyDotHtml = keyDot ? '<span class="status-dot ' + keyDot + '" title="' + escapeHtml(t(keyDot === "ok" ? "seatKeyDotOk" : "seatKeyDotFail")) + '"></span>' : "";
      var hasTurn = board.turn && board.turn.seatId === seat.id;
      var sv = window.RundbordViewState.seatView(seat, viewCtx);
      var statusKey = sv.key;
      var statusWord = t(SEAT_VIEW_WORD_KEYS[statusKey]);
      var activity = seatActivityText(sv, seat);
      var hoverTitle = t("seatHoverTitle", { seat: seat.name, provider: seat.provider, model: seat.model || "" });
      var stateClass = " sv-" + statusKey + (sv.decide ? " sv-decide" : "");
      var aria = escapeHtml(seat.name + ": " + statusWord + (activity ? ", " + activity : ""));
      var crown = sv.turn ? '<span class="crown-badge" title="' + escapeHtml(t("hasTurnTitle")) + '">👑</span>' : "";
      var detail = seatDetailHtml(seat);
      if (mode === "compact") {
        var glyph = { working: "●", handing: "●", receiving: "●", "check-failed": "!", "pause-ask": "!", need: "!", failed: "✕", done: "✓", next: "→" }[statusKey] || "…";
        el.innerHTML =
          crown +
          '<div class="coaster' + stateClass + '" style="--seat-color:' + seatColorVar(seat.color) + '" aria-label="' + aria + '">' +
          '<p class="role">' + escapeHtml(seat.name) + "</p>" +
          '<span class="cglyph st-' + statusKey + '" aria-hidden="true">' + glyph + "</span></div>" +
          detail + iconRowHtml(seat);
      } else if (mode === "list") {
        el.innerHTML =
          '<div class="coaster' + stateClass + '" style="--seat-color:' + seatColorVar(seat.color) + '" aria-label="' + aria + '">' +
          keyDotHtml +
          '<span class="row-no">' + (i + 1) + "</span>" +
          '<span class="row-main"><p class="role">' + crown + escapeHtml(seat.name) + "</p>" +
          '<p class="status-word st-' + statusKey + '">' + escapeHtml(statusWord) + "</p>" +
          (activity ? '<p class="seat-activity">' + escapeHtml(activity) + "</p>" : "") + "</span>" +
          '<span class="row-model">' + escapeHtml(seat.model || seat.provider || "") + "</span></div>" +
          detail + iconRowHtml(seat);
      } else {
        el.innerHTML =
          crown +
          '<div class="coaster' + stateClass + '" style="--seat-color:' + seatColorVar(seat.color) + '" aria-label="' + aria + '">' +
          keyDotHtml +
          '<p class="role">' + escapeHtml(seat.name) + "</p>" +
          '<p class="status-word st-' + statusKey + '">' + escapeHtml(statusWord) + "</p>" +
          (activity ? '<p class="seat-activity">' + escapeHtml(activity) + "</p>" : "") +
          '<span class="seat-drag-handle" title="' + escapeHtml(t("dragHandleTitle")) + '"></span>' +
          "</div>" +
          detail + iconRowHtml(seat);
      }
      el.querySelector(".coaster").addEventListener("click", function () {
        openSeatPanel(seat);
      });
      if (el.querySelector(".crown-badge")) {
        el.querySelector(".crown-badge").addEventListener("click", function (e) {
          e.stopPropagation();
          openTurnPanel();
        });
      }
      bindIconRow(el, seat);
      if (mode === "round") bindSeatDrag(el, seat);
      box.appendChild(el);
    });

    if (!full) {
      var epos = slotPosition(seats.length);
      var wrap = document.createElement("div");
      wrap.className = "seat";
      if (mode !== "list") {
        wrap.style.left = epos.x + "%";
        wrap.style.top = epos.y + "%";
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat-empty";
      btn.setAttribute("aria-label", t("addSeatAriaLabel"));
      btn.textContent = mode === "list" ? "+ " + t("addSeatAriaLabel") : "+";
      btn.addEventListener("click", function () {
        openAddSeatPanel();
      });
      wrap.appendChild(btn);
      box.appendChild(wrap);
    }

    // Overdragelserne: forbindelser mellem stolene (rundt/kompakt) eller led mellem rækkerne (liste)
    if (mode === "list") {
      var rows = box.querySelectorAll(".seat-row");
      Array.prototype.forEach.call(rows, function (row, i) {
        if (i < seats.length - 1) row.insertAdjacentHTML("afterend", handoffLinkRowHtml(seats[i], seats[i + 1]));
      });
      bindHandoffRows(box);
    } else if (seats.length > 1) {
      var order = (runView.boardId === store.activeBoardId && (runActive || runView.finished) && runView.order.length ? runView.order : seats).filter(function (s) {
        return posById[s.id];
      });
      var edgeList = handoffEdges(order, posById);
      box.insertAdjacentHTML("beforeend", handoffLinksSvg(edgeList, posById) + handoffChipsHtml(edgeList, posById, box.clientWidth, box.clientHeight) + handoffLegendHtml(edgeList));
      bindHandoffLinks(box);
    }
    if (typeof renderOpenNeedsPanel === "function") renderOpenNeedsPanel();
  }

  function openBoardPanel() {
    openSettings("board");
    document.getElementById("projectNameInput").focus();
  }
  function closeBoardPanel() {
    closeSettings();
  }

  function buildSwatches() {
    var wrap = document.getElementById("swatches");
    wrap.innerHTML = "";
    SWATCHES.forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.style.background = "var(--seat-" + key + ")";
      b.setAttribute("aria-label", t("color" + key.charAt(0).toUpperCase() + key.slice(1)));
      b.setAttribute("aria-pressed", String(key === selectedColor));
      b.addEventListener("click", function () {
        selectedColor = key;
        Array.prototype.forEach.call(wrap.children, function (c, i) {
          c.setAttribute("aria-pressed", String(SWATCHES[i] === key));
        });
      });
      wrap.appendChild(b);
    });
  }

  function renderSeatUsage(seat) {
    var usageLine = document.getElementById("seatUsageLine");
    var priceHint = document.getElementById("seatPriceHint");
    var calls = (seat && seat.calls) || [];
    if (!calls.length) {
      usageLine.hidden = true;
      priceHint.hidden = true;
      return;
    }
    var summary = summarizeCalls(calls);
    usageLine.hidden = false;
    usageLine.textContent = t("usagePrefix") + usageLineText(summary);
    if (summary.pendingCalls > 0) {
      priceHint.hidden = false;
      priceHint.textContent = t("priceHintUnknown");
    } else {
      priceHint.hidden = true;
    }
  }

  function knownRoleNames() {
    var names = [];
    ROLE_CATALOG.forEach(function (section) {
      names = names.concat(section.roles);
    });
    return names;
  }

  // presetRoleName lader "+"-picker'en (openAddSeatPanel) sende den rolle
  // brugeren rent faktisk valgte direkte med ind — uden den faldt en ny
  // stol altid tilbage til "Builder", uanset hvad man havde tænkt sig.
  // "__custom" som presetRoleName åbner det brugerdefinerede navnefelt.
  // En ny stol foreslået af Tredje øje (Næste skridt): { text, keyFromSeatId } — se renderer/18-nextsteps.js.
  var pendingNewSeat = null;
  var editingAdditions = [];

  function renderSeatAdditions() {
    var wrap = document.getElementById("seatAdditionsList");
    wrap.innerHTML = editingAdditions.length
      ? editingAdditions
          .map(function (line, i) {
            return (
              '<div class="memory-item"><span class="addition-text">' + escapeHtml(line) +
              '</span><button type="button" class="btn addition-del-btn" data-i="' + i + '">' + escapeHtml(t("shieldDeleteBtn")) + "</button></div>"
            );
          })
          .join("")
      : '<p class="shield-hint">' + escapeHtml(t("seatAdditionsEmpty")) + "</p>";
    Array.prototype.forEach.call(wrap.querySelectorAll(".addition-del-btn"), function (btn) {
      btn.addEventListener("click", function () {
        editingAdditions.splice(Number(btn.getAttribute("data-i")), 1);
        renderSeatAdditions();
        updateInstructionPreview();
      });
    });
  }

  // ---- Historik: hvad er ændret på stolens opførsel, af hvad, og tilbage igen ----
  function historyOnOff(v) {
    return t(v ? "histOn" : "histOff");
  }

  function historyDialState(dial, v) {
    var label = dial ? dialStateLabel(dial, v.state) || v.state : v.state;
    return label + (dial && dial.hasStrength && v.strength && v.state !== "off" ? t("dialSetToStrengthSuffix", { strength: v.strength }) : "");
  }

  function historyChangeText(c) {
    if (c.field === "dial") {
      var dial = DIALS.filter(function (d) {
        return d.key === c.key;
      })[0];
      return t("histDial", { dial: dial ? dialLabel(dial) : c.key, from: historyDialState(dial, c.from), to: historyDialState(dial, c.to) });
    }
    if (c.field === "mandate") {
      var find = function (key) {
        var m = MANDATE_ICONS.filter(function (i) {
          return i.key === key;
        })[0];
        return m ? iconTitle(m) : key;
      };
      return t("histMandate", { from: find(c.from), to: find(c.to) });
    }
    if (c.field === "icon") {
      var list = c.group === "work" ? WORK_ICONS : INFO_ICONS;
      var ic = list.filter(function (i) {
        return i.key === c.key;
      })[0];
      return t(c.to ? "histIconOn" : "histIconOff", { icon: ic ? iconTitle(ic) : c.key });
    }
    if (c.field === "addition") return t(c.change === "added" ? "histAdded" : "histRemoved", { text: c.text });
    if (c.field === "checks") return t("histChecks", { to: historyOnOff(c.to) });
    if (c.field === "readsIn") return t("histReadsIn", { to: historyOnOff(c.to) });
    if (c.field === "role") return t("histRole", { from: c.from || t("rolesNoConcept"), to: c.to || t("rolesNoConcept") });
    return c.field;
  }

  function renderSeatHistory(seat) {
    var details = document.getElementById("seatHistoryDetails");
    var wrap = document.getElementById("seatHistoryList");
    details.hidden = !seat;
    if (!seat) return;
    var entries = (Array.isArray(seat.history) ? seat.history : []).slice().reverse();
    if (!entries.length) {
      wrap.innerHTML = '<p class="shield-hint">' + escapeHtml(t("histEmpty")) + "</p>";
      return;
    }
    wrap.innerHTML = entries
      .map(function (h) {
        var when = "";
        try {
          when = new Date(h.at).toLocaleString(dateLocaleCode(), { dateStyle: "short", timeStyle: "short" });
        } catch (e) {}
        return (
          '<div class="history-entry"><div class="history-head"><span>' + escapeHtml(when) + " · " + escapeHtml(t("histSource_" + h.source)) +
          '</span><button type="button" class="btn history-restore-btn" data-entry="' + escapeHtml(h.id) + '">' + escapeHtml(t("histRestore")) + "</button></div><ul>" +
          h.changes
            .map(function (c) {
              return "<li>" + shieldHtml(historyChangeText(c)) + "</li>";
            })
            .join("") +
          "</ul></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(wrap.querySelectorAll(".history-restore-btn"), function (btn) {
      btn.addEventListener("click", function () {
        restoreSeatBehavior(seat.id, btn.getAttribute("data-entry"));
      });
    });
  }

  // Tilbagerulning er selv en ændring i historikken, så den kan fortrydes igen.
  function restoreSeatBehavior(seatId, entryId) {
    var seat = seatById(seatId);
    var entry = seat && (seat.history || []).filter(function (h) {
      return h.id === entryId;
    })[0];
    if (!entry) return;
    var restored = window.RundbordSeatHistory.restore(seat, entry.before);
    window.rundbord.saveSeat(store.activeBoardId, restored, { source: "rollback" }).then(function (s) {
      store = s;
      render();
      var fresh = seatById(seatId);
      if (fresh) openSeatPanel(fresh);
    });
  }

  function openSeatPanel(seat, presetRoleName, pending) {
    pendingNewSeat = !seat && pending ? pending : null;
    editingAdditions = seat
      ? String(seat.customInstruction || "").split("\n").filter(function (l) { return l.trim(); })
      : pendingNewSeat && pendingNewSeat.text
      ? [pendingNewSeat.text]
      : [];
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("pricePanel").hidden = true;
    document.getElementById("turnPanel").hidden = true;
    document.getElementById("proposalsPanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = true;
    document.getElementById("startConfirmPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    editingSeatId = seat ? seat.id : null;
    renderSeatOrderField();
    document.getElementById("readsInCheckbox").checked = Boolean(seat && seat.readsIn);
    document.getElementById("checksCheckbox").checked = Boolean(seat && seat.checks);
    populateVoiceSelect(seat && seat.voiceId);
    document.getElementById("seatPanelTitle").textContent = seat ? t("seatPanelTitleEdit") : t("seatPanelTitleNew");
    // Rolle = et begreb (valgt på listen) og et valgfrit rollenavn, som er tomt som standard. Skrives et navn, bruges det i stedet for begrebet overalt på bordet.
    var roleSelect = document.getElementById("roleSelect");
    var roleCustomInput = document.getElementById("roleCustomInput");
    buildRoleSelect();
    if (seat) {
      var shown = window.RundbordRoles.split(seat, knownRoleNames());
      roleSelect.value = shown.concept;
      roleCustomInput.value = shown.name;
    } else if (presetRoleName && presetRoleName.indexOf("lib:") === 0) {
      roleSelect.value = "Builder";
      roleCustomInput.value = "";
      applyLibraryRole(presetRoleName.slice(4));
    } else {
      // Begrebslisten vises kun under Avanceret. Uden den vælges intet begreb i det skjulte, så en ny stol får det navn, brugeren skriver (eller det begreb, en knap eller et forslag udtrykkeligt gav).
      roleSelect.value = presetRoleName || "__custom";
      roleCustomInput.value = "";
    }
    document.getElementById("roleCustomLabel").textContent = t("roleNameLabel");
    // Begrebet ligger i en sammenfoldet gruppe; den står åben, når stolen har et begreb (ikke bare et navn).
    document.getElementById("roleConceptDetails").open = roleSelect.value !== "__custom";
    document.getElementById("roleError").hidden = true;
    document.getElementById("roleSaveLibNote").textContent = "";
    var keySeat = pendingNewSeat && pendingNewSeat.keyFromSeatId ? seatById(pendingNewSeat.keyFromSeatId) : null;
    // Nøglen ligger kun i en Modelprofil API. En ny stol foreslået af Tredje øje får samme profil som den stol, den lånte fra; findes der kun én profil, vælges den.
    var defaultProfile = window.RundbordModels.defaultProfile(store);
    var profileId = seat ? seat.modelId : keySeat ? keySeat.modelId : defaultProfile ? defaultProfile.id : modelProfiles().length === 1 ? modelProfiles()[0].id : "";
    fillSeatModelSelect(null, profileId);
    var chosen = seatModelProfile();
    document.getElementById("modelInput").value = seat ? seat.model : keySeat ? keySeat.model : chosen ? chosen.model || DEFAULT_MODEL[chosen.provider] || "" : "";
    document.getElementById("apiKeyInput").value = "";
    renderSeatAdditions();
    renderSeatHistory(seat);
    // Har stolen tilføjelser (eller kommer en fra Tredje øje), står de åbne, så de ikke overses
    document.getElementById("seatChangesDetails").open = editingAdditions.length > 0;
    selectedColor = seat ? seat.color : SWATCHES[currentBoard().seats.length % SWATCHES.length];
    buildSwatches();
    resetModelNote();
    editingDials = JSON.parse(JSON.stringify((seat && seat.dials) || defaultDials()));
    renderDials();
    updateInstructionPreview();
    renderSeatUsage(seat);
    document.getElementById("testResult").hidden = true;
    document.getElementById("deleteSeatBtn").hidden = !seat;
    document.getElementById("seatPanel").hidden = false;
    if (!seat && (!presetRoleName || presetRoleName === "__custom")) {
      document.getElementById("roleCustomInput").focus();
    } else {
      document.getElementById("roleSelect").focus();
    }
    rolePresetOnOpen(seat);
  }
  function closeSeatPanel() {
    document.getElementById("seatPanel").hidden = true;
    editingSeatId = null;
    pendingNewSeat = null;
  }

  function resetModelNote() {
    var note = document.getElementById("modelNote");
    note.textContent = "";
    note.className = "note";
  }

  function fetchModels() {
    var draft = currentSeatDraft();
    var note = document.getElementById("modelNote");
    if (!draft.apiKey) {
      note.textContent = t("fillApiKeyFirst");
      note.className = "note error-text";
      return;
    }
    if (draft.provider === "custom" && !draft.baseUrl) {
      note.textContent = t("fillBaseUrlFirst");
      note.className = "note error-text";
      return;
    }
    note.textContent = t("fetchingModels");
    note.className = "note";
    window.rundbord.listModels(draft).then(function (res) {
      if (!res.ok) {
        note.textContent = t("fetchModelsFailedPrefix") + res.message;
        note.className = "note error-text";
        return;
      }
      if (!res.models.length) {
        note.textContent = t("noModelsReturned");
        note.className = "note error-text";
        return;
      }
      setModelOptions(res.models);
      note.textContent = t("modelsFetchedCount", { count: res.models.length });
      note.className = "note";
    }).catch(function (err) {
      note.textContent = t("unexpectedErrorPrefix") + String((err && err.message) || err);
      note.className = "note error-text";
    });
  }

  // Det navn, stolen får: rollenavnet, hvis der er skrevet et, ellers begrebet.
  function selectedRoleName() {
    return window.RundbordRoles.resolve(document.getElementById("roleSelect").value, document.getElementById("roleCustomInput").value).name;
  }

  // Stolens begreb ("" for et eget navn uden begreb).
  function selectedRoleConcept() {
    return window.RundbordRoles.resolve(document.getElementById("roleSelect").value, document.getElementById("roleCustomInput").value).role;
  }

  // En rolle fra biblioteket udfylder både begreb og rollenavn.
  function applyLibraryRole(id) {
    var r = window.RundbordRoles.get(store.roles || [], id);
    if (!r) return;
    var roleSelect = document.getElementById("roleSelect");
    var known = knownRoleNames().indexOf(r.concept) >= 0;
    roleSelect.value = known ? r.concept : "__custom";
    document.getElementById("roleCustomInput").value = r.name;
  }

  function currentSeatDraft() {
    var existing = currentBoard().seats.find(function (s) {
      return s.id === editingSeatId;
    });
    // Udbyder, adresse og nøgle kommer fra den valgte Modelprofil API; modellen er stolens egen (profilens standard, hvis feltet er tomt).
    var profile = seatModelProfile();
    var provider = profile ? profile.provider : existing ? existing.provider : "anthropic";
    var draft = Object.assign({}, existing || {}, {
      id: editingSeatId || uid(),
      readsIn: document.getElementById("readsInCheckbox").checked,
      checks: document.getElementById("checksCheckbox").checked,
      voiceId: document.getElementById("voiceSelect").value || "",
      name: selectedRoleName(),
      role: selectedRoleConcept(),
      provider: provider,
      model: document.getElementById("modelInput").value.trim() || (profile && profile.model) || DEFAULT_MODEL[provider] || "",
      baseUrl: profile ? profile.baseUrl : "",
      apiKey: profile ? profile.apiKey : "",
      hasKey: Boolean(profile && profile.apiKey),
      customInstruction: editingAdditions.join("\n"),
      color: selectedColor,
      calls: existing ? existing.calls : [],
      icons: existing ? existing.icons : defaultIcons(),
      dials: editingDials || defaultDials(),
    });
    if (profile) draft.modelId = profile.id;
    else delete draft.modelId;
    return draft;
  }

  function saveSeat() {
    var role = selectedRoleName();
    if (!role) {
      var roleErr = document.getElementById("roleError");
      roleErr.textContent = t("roleErrorNameOnly");
      roleErr.hidden = false;
      document.getElementById("roleCustomInput").focus();
      return;
    }
    // Uden en Modelprofil API kan stolen ikke køre: man vælger en, eller sætter en op, før stolen gemmes.
    if (!seatModelProfile()) {
      document.getElementById("seatModelError").hidden = false;
      document.getElementById("seatModelSelect").focus();
      return;
    }
    var draft = currentSeatDraft();
    // Mandatet følger dialen Selvstændighed. Ændrer en dial mandatet uden et klik på ikonet, siges det, og hvorfor.
    var mandateNote = "";
    var prevSeat = editingSeatId ? seatById(editingSeatId) : null;
    if (prevSeat && draft.icons && draft.dials) {
      var rec = window.RundbordSeatSync.reconcile(prevSeat, draft);
      if (rec.icons.mandate !== draft.icons.mandate) {
        var mand = MANDATE_ICONS.filter(function (m) { return m.key === rec.icons.mandate; })[0];
        var act = rec.dials.action || {};
        mandateNote = t("mandateChangedNote", { seat: draft.name, to: mand ? mand.icon + " " + iconTitle(mand) : rec.icons.mandate, dial: dialStateLabel(dialByKey("action"), act.state) });
      }
    }
    window.rundbord.saveSeat(store.activeBoardId, draft).then(function (s) {
      store = s;
      render();
      closeSeatPanel();
      if (mandateNote) systemNote(mandateNote);
    });
  }

  function deleteSeat() {
    if (!editingSeatId) return;
    window.rundbord.deleteSeat(store.activeBoardId, editingSeatId).then(function (s) {
      store = s;
      delete status[editingSeatId];
      render();
      closeSeatPanel();
    });
  }

  function clearBoard() {
    window.rundbord.clearBoardMessages(store.activeBoardId).then(function (s) {
      store = s;
      render();
    });
  }

  function testSeat() {
    var draft = currentSeatDraft();
    var result = document.getElementById("testResult");
    result.hidden = false;
    result.className = "test-result";
    if (!draft.apiKey) {
      result.textContent = t("seatModelError");
      result.className = "test-result fail";
      return;
    }
    result.textContent = t("testingConnection");
    window.rundbord.testSeat(draft).then(function (res) {
      result.textContent = res.message;
      result.className = "test-result " + (res.ok ? "ok" : "fail");
      status[draft.id] = res.ok ? "ok" : "fail";
      if (editingSeatId) renderSeats();
      if (!res.ok && editingSeatId) {
        emitEvent("call.failed", editingSeatId, {}, { purpose: "test", errorKind: res.errorKind || "other", durationMs: typeof res.durationMs === "number" ? res.durationMs : null });
      }
      if (res.ok && res.usage && editingSeatId) {
        window.rundbord.recordUsage(store.activeBoardId, editingSeatId, res.usage, { purpose: "test", durationMs: typeof res.durationMs === "number" ? res.durationMs : null }).then(function (s) {
          store = s;
          var seat = currentBoard().seats.find(function (x) {
            return x.id === editingSeatId;
          });
          renderSeatUsage(seat);
          renderBoardSpend();
        });
      }
    }).catch(function (err) {
      result.hidden = false;
      result.textContent = t("unexpectedErrorPrefix") + String((err && err.message) || err);
      result.className = "test-result fail";
    });
  }

  // --- Kør bordet (relæ gennem stolene i rækkefølge) ---

  var runActive = false;

  var runFailedIndexes = [];

