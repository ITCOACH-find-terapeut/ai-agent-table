// 03-observer-needs.js
// Observationer (regler på hændelseslogen) og panelet 'Åbne behov'.

  function refreshObservations() {
    var boardId = store.activeBoardId;
    return window.rundbord
      .getEvents(boardId)
      .then(function (events) {
        if (boardId !== store.activeBoardId) return;
        observationEvents = {};
        (events || []).forEach(function (e) {
          observationEvents[e.id] = e;
        });
        observations = window.RundbordObserver.findings(events, { maxReworks: window.RundbordRounds.maxReworks(currentBoard().rounds) });
        renderOpenNeedsPanel();
      })
      .catch(function () {});
  }

  // Hændelser skrives asynkront; en kort pause samler dem, før reglerne kigger igen.
  function scheduleObservationRefresh() {
    clearTimeout(observationTimer);
    observationTimer = setTimeout(refreshObservations, 350);
  }

  function findingText(f) {
    var data = Object.assign({}, f.data);
    if (f.seatId) {
      var seat = seatById(f.seatId);
      data.seat = seat ? seat.name : t("unknownSeat");
    }
    return t("finding_" + f.kind, data);
  }

  function observationsHtml() {
    if (!observations.length) return "";
    return (
      observations
        .map(function (f) {
          var evidence = f.evidence
            .map(function (id) {
              var e = observationEvents[id];
              if (!e) return "";
              var seat = e.seatId ? seatById(e.seatId) : null;
              return (e.at || "").slice(11, 19) + " · " + e.type + (seat ? " · " + seat.name : "");
            })
            .filter(Boolean)
            .join("<br>");
          return (
            '<div class="observation sev-' + f.severity + '">' + escapeHtml(findingText(f)) +
            "<details><summary>" + escapeHtml(t("observationEvidence", { count: f.evidence.length })) + "</summary>" + evidence + "</details>" +
            '<div class="obs-actions"><button type="button" class="obs-dismiss-btn" data-key="' + escapeHtml(f.key) + '">' + escapeHtml(t("observationDismiss")) + "</button></div></div>"
          );
        })
        .join("")
    );
  }

  function observationsDigest() {
    if (!observations.length) return t("noFindingsPlaceholder");
    return observations
      .map(function (f) {
        return "- [" + f.severity + "] " + findingText(f);
      })
      .join("\n");
  }

  // Alle 🔭 Behov på tværs af hele bordets samtale, der endnu ikke er
  // markeret løst — så "Human in the loop" kan se hele køen ét sted i
  // stedet for at skulle scrolle hele samtalen igennem for at finde dem.
  // Et behov, der er "intet" (eller et tilsvarende ord), er ikke et behov
  function isEmptyNeed(text) {
    return window.RundbordSeatRef.resolve(String(text || "").replace(/\.$/, ""), []).intentionalNone;
  }

  // Står dialen allerede, som forslaget siger? Så er der intet at gøre ("Gør det for mig" ville ikke ændre noget).
  function needAdjustAlreadySet(seat, match) {
    if (!seat || !match) return false;
    var cur = (seat.dials || {})[match.dial.key];
    if (!cur || cur.state !== match.state) return false;
    if (match.dial.hasStrength && match.state !== "off" && match.strength && Number(cur.strength) !== Number(match.strength)) return false;
    return true;
  }

  // Tidspunktet for den seneste opgave: behov fra før den hører til tidligere opgaver og tæller ikke med i tallet på knappen.
  function latestTaskStartAt() {
    var at = "";
    ((currentBoard() && currentBoard().events) || []).forEach(function (e) {
      if (e.type === "task.started" && e.at > at) at = e.at;
    });
    return at;
  }

  function computeOpenNeeds() {
    var board = currentBoard();
    if (!board) return [];
    var since = latestTaskStartAt();
    return (board.messages || [])
      .map(function (m) {
        if (m.role !== "assistant" || (m.meta && m.meta.needResolved)) return null;
        var needsSummary = parseNeedsSummary(m.text);
        if (!needsSummary || isEmptyNeed(needsSummary.need)) return null;
        // et spørgsmål, brugeren har besvaret eller bevidst udeladt (på pilen eller i pausekortet), er afgjort
        if (window.RundbordDecisions && window.RundbordDecisions.find(m.meta && m.meta.decisions, needsSummary.need)) return null;
        // præcist navn først; et uklart eller ukendt rollenavn peger ikke på en stol (se lib/seatref.js)
        var suggestedSeat = window.RundbordSeatRef.resolve(needsSummary.role, board.seats).seat || undefined;
        return {
          message: m,
          seat: seatById(m.seatId),
          needsSummary: needsSummary,
          suggestedSeat: suggestedSeat,
          dialMatch: parseDialAdjustment(needsSummary.adjust),
          alreadySet: needAdjustAlreadySet(suggestedSeat, parseDialAdjustment(needsSummary.adjust)),
          older: Boolean(since && m.at < since),
        };
      })
      .filter(Boolean);
  }

  var openNeedsPanelOpen = false;
  var openNeedsEmptyTimer = null;

  // Hvilke beskeder brugeren selv har valgt at folde fuldt ud. Rent
  // sessions-lokal UI-tilstand — ikke noget der skal gemmes i bordets data,
  // så den nulstilles roligt når appen genstartes.
  var expandedMessageIds = {};

  // Enhver assistent-besked starter (jf. READBACK_INSTRUCTION) med netop ÉN
  // kort sætning, der opsummerer hvordan opgaven blev forstået, før resten
  // af svaret følger på en ny linje. Den sætning er i praksis allerede det
  // resumé, brugeren efterspurgte — så i stedet for at bede modellen om at
  // skrive endnu et resumé, bruger vi bare den linje der allerede findes,
  // og folder resten sammen bag et klik.
  function splitReadback(text) {
    var str = String(text || "");
    var idx = str.search(/\n+/);
    if (idx < 0) return { readback: str.trim(), rest: "" };
    return {
      readback: str.slice(0, idx).trim(),
      rest: str.slice(idx).replace(/^\n+/, "").trim(),
    };
  }

  // Let heuristik, ingen ny AI-logik: et behov uden en stol der matcher den
  // navngivne rolle kan kun løses af et menneske (høj prioritet); et behov
  // med både en matchende stol OG en tolkelig dial-justering kan løses med
  // ét klik ("Gør det for mig", lav prioritet); alt andet ligger imellem —
  // stolen er fundet, men kræver et manuelt besøg i dens panel.
  function needPriority(item) {
    if (!item.suggestedSeat) return "high";
    if (item.dialMatch) return "low";
    return "medium";
  }

  var NEED_PRIORITY_ORDER = ["high", "medium", "low"];

  // Næste skridt i fire kategorier (se UX-planen, trin 7):
  //  1. Kræver din beslutning: ingen model eller regel kan afgøre det, og det der blokerer en kørsel står øverst
  //  2. Kan justeres: stolen er fundet, og du justerer den selv
  //  3. Kan udføres efter godkendelse: Tredje øjes forslag, forslag til instruktioner og behov, appen kan løse med ét klik
  //  4. Observation: registreret af regler. Intet udføres uden dit valg, som før.
  function inboxSectionHtml(key, title, sub, count, body) {
    if (!count) return "";
    return (
      '<section class="inbox-sec inbox-' + key + '"><h3 class="inbox-h"><span>' + escapeHtml(title) + '</span><span class="inbox-n">' + count + "</span></h3>" +
      '<p class="inbox-sub">' + escapeHtml(sub) + "</p>" + body + "</section>"
    );
  }

  function inboxNeedHtml(item, kind) {
    var m = item.message;
    var fromName = item.seat ? item.seat.name : t("unknownSeat");
    var apply = item.suggestedSeat && item.dialMatch && item.alreadySet
      ? '<span class="msg-needs-resolved-badge">' + escapeHtml(t("alreadySetBadge")) + "</span>"
      : item.suggestedSeat && item.dialMatch
      ? '<button type="button" class="msg-needs-apply-btn open-needs-apply-btn" data-msg-id="' + m.id + '" data-seat-id="' + item.suggestedSeat.id + '" title="' + escapeHtml(t("adjustApplyTitle", { dial: dialLabel(item.dialMatch.dial), value: dialValueText(item.dialMatch), seat: item.suggestedSeat.name })) + '">' + escapeHtml(t("adjustApplyBtn", { dial: dialLabel(item.dialMatch.dial), value: dialValueText(item.dialMatch) })) + "</button>"
      : "";
    var open = item.suggestedSeat
      ? '<button type="button" class="msg-needs-open-btn open-needs-open-btn" data-seat-id="' + item.suggestedSeat.id + '"' + (item.dialMatch ? ' data-dial="' + escapeHtml(item.dialMatch.dial.key) + '"' : "") + ">" + escapeHtml(item.dialMatch ? t("adjustFixBtn") : t("adjustSeatBtn", { seat: item.suggestedSeat.name })) + "</button>"
      : "";
    var resolve = '<button type="button" class="open-needs-resolve-btn" data-msg-id="' + m.id + '" title="' + escapeHtml(t("markResolvedTitle")) + '">' + escapeHtml(t("markResolved")) + "</button>";
    // Kræver-din-beslutning: peger behovet ikke på en stol, men foreslår en justering, gælder den for stolen, der skrev det.
    // Knappen siger tydeligt, hvilken stol og hvilken justering, og kan ændres igen i stolens panel.
    var decideSeat = item.suggestedSeat || item.seat;
    var decideApply = "";
    if (kind === "decide" && item.dialMatch && decideSeat && !item.alreadySet) {
      var dm = item.dialMatch;
      decideApply =
        '<button type="button" class="msg-needs-apply-btn open-needs-apply-btn decide-apply-btn" data-msg-id="' + m.id + '" data-seat-id="' + decideSeat.id + '" title="' +
        escapeHtml(t("adjustApplyTitle", { dial: dialLabel(dm.dial), value: dialValueText(dm), seat: decideSeat.name })) + '">' +
        escapeHtml(t("adjustApplyBtn", { dial: dialLabel(dm.dial), value: dialValueText(dm) })) + "</button>";
    }
    // Er behovet en vurdering, kun du kan afgøre, kan du svare lige her; svaret følger med bordet i beslutningsregistret.
    var decideAnswer = "";
    if (kind === "decide" && item.needsSummary.needType !== "fact") {
      decideAnswer =
        '<div class="inbox-answer"><label class="inbox-answer-field"><span class="visually-hidden">' + escapeHtml(t("decideAnswerLabel")) + "</span>" +
        '<textarea class="decide-answer" rows="2" data-msg-id="' + m.id + '" placeholder="' + escapeHtml(t("decideAnswerPlaceholder")) + '"></textarea></label>' +
        '<button type="button" class="btn decide-answer-btn" data-msg-id="' + m.id + '" title="' + escapeHtml(t("decideAnswerTitle")) + '">' + escapeHtml(t("decideAnswerBtn")) + "</button></div>";
    }
    // Kun det nødvendige i oversigten: hvad, fra hvem, og den ene handling; resten ligger under Detaljer.
    var primary = kind === "approve" ? apply || open : kind === "adjust" ? open : decideApply || resolve;
    var quietResolve = kind === "decide" && primary !== resolve ? resolve.replace('class="open-needs-resolve-btn"', 'class="open-needs-resolve-btn inbox-quiet"') : "";
    return (
      '<div class="open-needs-item inbox-item"><p class="inbox-line" title="' + escapeHtml(item.needsSummary.need) + '"><span class="open-needs-from">' + escapeHtml(fromName) + "</span> " +
      escapeHtml(item.needsSummary.need) + "</p>" +
      decideAnswer +
      '<div class="inbox-actions">' + primary + quietResolve + "</div>" +
      '<details class="inbox-details"><summary>' + escapeHtml(t("inboxDetails")) + "</summary>" +
      '<p><span class="msg-needs-label">' + escapeHtml(t("roleLabelShort")) + "</span> " + escapeHtml(item.needsSummary.role) + "</p>" +
      '<p><span class="msg-needs-label">' + escapeHtml(t("adjustLabel")) + "</span> " + escapeHtml(adjustDisplayText(item.needsSummary.adjust)) + "</p>" +
      '<div class="inbox-actions">' + (primary === resolve || quietResolve ? "" : resolve) + (primary === open ? apply : open) +
      '<button type="button" class="open-needs-jump-btn" data-msg-id="' + m.id + '" title="' + escapeHtml(t("viewInChatTitle")) + '">' + escapeHtml(t("viewInChat")) + "</button></div></details></div>"
    );
  }

  // Kontrolpausen: den eneste beslutning, der blokerer en igangværende kørsel.
  function inboxCheckHtml() {
    var seat = seatById(runView.checkSeatId);
    return (
      '<div class="open-needs-item inbox-item inbox-blocking"><p class="inbox-line"><span class="inbox-block-chip">' + escapeHtml(t("inboxBlocks")) + "</span> " +
      escapeHtml(t("inboxCheckLine", { seat: seat ? seat.name : "?" })) + "</p>" +
      '<div class="inbox-actions"><button type="button" class="inbox-check-open">' + escapeHtml(t("inboxCheckOpen")) + "</button></div></div>"
    );
  }

  function inboxCounts() {
    var items = computeOpenNeeds();
    var c = { decide: 0, adjust: 0, approve: 0, observe: observations.length, older: 0 };
    items.forEach(function (item) {
      if (item.older) {
        c.older += 1;
        return;
      }
      var p = needPriority(item);
      if (p === "high") c.decide += 1;
      else if (p === "medium") c.adjust += 1;
      else c.approve += 1;
    });
    if (typeof runView === "object" && runView && runView.checkSeatId) c.decide += 1;
    c.approve += inboxExtraCount();
    c.total = c.decide + c.adjust + c.approve + c.observe;
    return c;
  }

  // Næste skridt-kortet under det seneste svar: ét kort med én handling. Resten ligger bag "Flere forslag" (oversigten).
  // Rækkefølgen: det, kun du kan afgøre; det, du selv justerer; Tredje øjes åbne valg; det, appen kan udføre efter din godkendelse; forslag til instruktioner.
  // Kortet skjules, mens en pause, kontrol eller rute-tilbud venter på dig, så der kun er ét at svare på.
  function renderNextCard(items) {
    var card = document.getElementById("nextCard");
    if (!card) return;
    var gating = ["checkPanel", "pausePanel", "routePanel"].some(function (id) {
      var el = document.getElementById(id);
      return el && !el.hidden;
    });
    var decide = [];
    var adjust = [];
    var approve = [];
    items.forEach(function (item) {
      if (item.older) return;
      var p = needPriority(item);
      if (p === "high") decide.push(inboxNeedHtml(item, "decide"));
      else if (p === "medium") adjust.push(inboxNeedHtml(item, "adjust"));
      else approve.push(inboxNeedHtml(item, "approve"));
    });
    var options = typeof latestOpenOptionsMessage === "function" ? latestOpenOptionsMessage() : null;
    var optionsHtml = options ? nextStepsCardHtml(options, true) : "";
    var props = (currentBoard().proposals || []).length;
    var propsHtml = props
      ? '<div class="nextsteps proposals-inbox"><p class="nextsteps-title">' + escapeHtml(t("nsProposals", { count: props })) +
        '</p><div class="row"><button type="button" class="btn proposals-inbox-open">' + escapeHtml(t("nsProposalsOpen")) + "</button></div></div>"
      : "";
    var all = decide.concat(adjust, optionsHtml ? [optionsHtml] : [], approve, propsHtml ? [propsHtml] : []);
    if (gating || !all.length) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }
    var html =
      '<p class="nextcard-eyebrow">' + escapeHtml(t("nextCardTitle")) + "</p>" + all[0] +
      (all.length > 1
        ? '<div class="nextcard-foot"><button type="button" class="btn nextcard-more" title="' + escapeHtml(t("nextCardMoreTitle")) + '">' + escapeHtml(t("nextCardMore", { count: all.length - 1 })) + "</button></div>"
        : "");
    // Gentegnes siden (fx mens et svar strømmer ind), må det du er i gang med at skrive ikke forsvinde.
    if (!card.hidden && card.getAttribute("data-sig") === html) return;
    var typed = card.querySelector(".decide-answer");
    var keep = typed ? { id: typed.getAttribute("data-msg-id"), value: typed.value, focus: document.activeElement === typed } : null;
    card.innerHTML = html;
    card.setAttribute("data-sig", html);
    card.hidden = false;
    if (keep && keep.value) {
      var again = card.querySelector('.decide-answer[data-msg-id="' + keep.id + '"]');
      if (again) {
        again.value = keep.value;
        if (keep.focus) again.focus();
      }
    }
    bindNeedActions(card);
    var more = card.querySelector(".nextcard-more");
    if (more) {
      more.addEventListener("click", function () {
        openNeedsPanelOpen = true;
        renderOpenNeedsPanel();
        var panel = document.getElementById("openNeedsPanel");
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
      });
    }
  }

  function renderOpenNeedsPanel() {
    var toggleBtn = document.getElementById("openNeedsToggleBtn");
    var panel = document.getElementById("openNeedsPanel");
    if (!toggleBtn || !panel) return;
    var items = computeOpenNeeds();
    var counts = inboxCounts();
    var blocking = typeof runView === "object" && runView && Boolean(runView.checkSeatId);
    toggleBtn.textContent = t("needsInboxBtnLabel") + " (" + counts.total + ")" + (counts.decide ? " · " + t("inboxNeedYou", { count: counts.decide }) : "");
    toggleBtn.title = t("inboxToggleTitle", { older: counts.older });
    toggleBtn.classList.toggle("needs-you", counts.decide > 0);
    toggleBtn.classList.toggle("blocking", blocking);
    if (typeof renderOverview === "function") renderOverview(counts, blocking);
    renderNextCard(items);
    panel.hidden = !openNeedsPanelOpen;
    if (!openNeedsPanelOpen) return;

    var decide = blocking ? [inboxCheckHtml()] : [];
    var adjust = [];
    var approve = [];
    var older = [];
    items.forEach(function (item) {
      if (item.older) {
        older.push(inboxNeedHtml(item, "adjust"));
        return;
      }
      var p = needPriority(item);
      if (p === "high") decide.push(inboxNeedHtml(item, "decide"));
      else if (p === "medium") adjust.push(inboxNeedHtml(item, "adjust"));
      else approve.push(inboxNeedHtml(item, "approve"));
    });
    var html =
      inboxSectionHtml("decide", t("inboxDecide"), t("inboxDecideSub"), decide.length, decide.join("")) +
      inboxSectionHtml("adjust", t("inboxAdjust"), t("inboxAdjustSub"), adjust.length, adjust.join("")) +
      inboxSectionHtml("approve", t("inboxApprove"), t("inboxApproveSub"), counts.approve, nextStepsInboxHtml() + approve.join("")) +
      inboxSectionHtml("observe", t("observationsHeading"), t("observationsSub"), observations.length, observationsHtml()) +
      (older.length
        ? '<details class="inbox-older"><summary>' + escapeHtml(t("inboxOlder", { count: older.length })) + "</summary>" + older.join("") + "</details>"
        : "");
    // Er der intet, er det bare et lille ✓ med teksten som tip (og til skærmlæsere), som forsvinder af sig selv, i stedet for et kort oven på knapperne og teksten under.
    if (!html) {
      panel.classList.add("is-empty");
      panel.innerHTML =
        '<span class="open-needs-ok" role="status" tabindex="0" title="' + escapeHtml(t("openNeedsEmpty")) + '" aria-label="' + escapeHtml(t("openNeedsEmpty")) + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
      clearTimeout(openNeedsEmptyTimer);
      openNeedsEmptyTimer = setTimeout(function () {
        if (!panel.classList.contains("is-empty")) return;
        openNeedsPanelOpen = false;
        panel.hidden = true;
      }, 2500);
      return;
    }
    clearTimeout(openNeedsEmptyTimer);
    panel.classList.remove("is-empty");
    panel.innerHTML = html;

    bindNeedActions(panel);
  }

  // Knapperne på behovskort (både i oversigten og i Næste skridt-kortet).
  function bindNeedActions(root) {
    Array.prototype.forEach.call(root.querySelectorAll(".obs-dismiss-btn"), function (btn) {
      btn.addEventListener("click", function () {
        emitEvent("finding.dismissed", null, {}, { key: btn.getAttribute("data-key") });
        scheduleObservationRefresh();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".inbox-check-open"), function (btn) {
      btn.addEventListener("click", function () {
        var cp = document.getElementById("checkPanel");
        if (cp) cp.scrollIntoView({ block: "center" });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".open-needs-apply-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msgId = btn.getAttribute("data-msg-id");
        var msg = (currentBoard().messages || []).filter(function (mm) {
          return mm.id === msgId;
        })[0];
        var needsSummary = msg ? parseNeedsSummary(msg.text) : null;
        var match = needsSummary ? parseDialAdjustment(needsSummary.adjust) : null;
        if (match) applyDialSuggestion(btn.getAttribute("data-seat-id"), match, msgId);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".decide-answer-btn"), function (btn) {
      function send() {
        var msgId = btn.getAttribute("data-msg-id");
        var input = root.querySelector('.decide-answer[data-msg-id="' + msgId + '"]');
        var text = input ? input.value.trim() : "";
        var msg = (currentBoard().messages || []).filter(function (mm) { return mm.id === msgId; })[0];
        var needsSummary = msg ? parseNeedsSummary(msg.text) : null;
        if (!text || !needsSummary) {
          if (input) input.focus();
          return;
        }
        btn.disabled = true;
        var ctx = { taskId: (msg.meta && msg.meta.taskId) || null, runId: (msg.meta && msg.meta.runId) || null };
        recordDecision(msgId, needsSummary.need, { answer: text }).then(function () {
          emitEvent("question.answered", msg.seatId, ctx, { via: "inbox" }, msgId);
          render();
        });
      }
      btn.addEventListener("click", send);
      var field = root.querySelector('.decide-answer[data-msg-id="' + btn.getAttribute("data-msg-id") + '"]');
      if (field) field.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); } });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".open-needs-open-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var seat = seatById(btn.getAttribute("data-seat-id"));
        if (!seat) return;
        openSeatPanel(seat);
        if (btn.getAttribute("data-dial")) focusSeatDial(btn.getAttribute("data-dial"));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".open-needs-resolve-btn"), function (btn) {
      btn.addEventListener("click", function () {
        markNeedResolved(btn.getAttribute("data-msg-id"));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".open-needs-jump-btn"), function (btn) {
      btn.addEventListener("click", function () {
        switchToFullLogAndJump(btn.getAttribute("data-msg-id"));
      });
    });
  
  }

  function stripNeedsSummary(text) {
    var str = String(text || "");
    var idx = str.search(NEEDS_SUMMARY_RE);
    return idx < 0 ? str : str.slice(0, idx).trim();
  }

  // Ikonerne (mandat/arbejdsform/information) var indtil nu rent visuelle —
  // de påvirkede aldrig selve systeminstruktionen. Denne funktion gør dem
  // reelle: hvert aktive ikon bliver til en linje i den kompilerede
  // instruktion, på samme måde som dials allerede gør.
  function iconInstructionLines(seat) {
    var icons = seat.icons || defaultIcons();
    var lines = [];
    var mandate = MANDATE_ICONS.filter(function (m) {
      return m.key === icons.mandate;
    })[0];
    if (mandate) lines.push(t("iconLineMandate", { title: iconTitle(mandate) }));
    WORK_ICONS.forEach(function (w) {
      if (icons.work && icons.work[w.key]) lines.push(t("iconLineWork", { title: iconTitle(w) }));
    });
    INFO_ICONS.forEach(function (n) {
      if (icons.info && icons.info[n.key]) lines.push(t("iconLineInfo", { title: iconTitle(n) }));
    });
    return lines;
  }

  var OUT_WRITER_ROLE = "OUT Writer";

