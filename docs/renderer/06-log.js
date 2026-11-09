// 06-log.js
// Modtager-vælgeren og hele samtale-loggen: aktivitetsstrøm og fuld samtale.

  function renderRecipientSelect() {
    var select = document.getElementById("speakerPick");
    var seats = currentBoard().seats;
    if (!seats.length) {
      selectedSpeakerId = null;
    } else if (selectedSpeakerId !== RECIPIENT_EVERYONE && !seats.some(function (s) { return s.id === selectedSpeakerId; })) {
      selectedSpeakerId = RECIPIENT_EVERYONE;
    }
    select.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = RECIPIENT_EVERYONE;
    allOpt.textContent = t("recipientEveryone");
    select.appendChild(allOpt);
    seats.forEach(function (seat) {
      var opt = document.createElement("option");
      opt.value = seat.id;
      opt.textContent = seat.name;
      select.appendChild(opt);
    });
    select.value = selectedSpeakerId || RECIPIENT_EVERYONE;
    select.disabled = seats.length === 0;
    document.getElementById("composerHint").hidden = seats.length > 0;
    document.getElementById("sendMsgBtn").disabled = seats.length === 0;
    document.getElementById("variantToggleBtn").disabled = seats.length === 0 || selectedSpeakerId === RECIPIENT_EVERYONE;
    renderRecipientCaption();
    autoGrowMsgInput();
  }

  // Fanger ikon-tilstanden (mandat/arbejdsform/information) i det øjeblik
  // en besked afsendes, så loggen altid viser hvad der reelt var aktivt for
  // netop det svar — også hvis brugeren senere ændrer stolens ikoner.
  function iconsSnapshot(seat) {
    try {
      return JSON.parse(JSON.stringify(seat.icons || defaultIcons()));
    } catch (e) {
      return defaultIcons();
    }
  }

  // Delt af activeIconsHtml() (log-beskeder) og seatStatusRowHtml()
  // (coaster-kortet) — begge skal vise "hvilke af de ni mandat/arbejdsform/
  // info-ikoner er slået til", bare i hver sin visning.
  function activeIconObjects(icons) {
    var active = [];
    var mandateIcon = MANDATE_ICONS.filter(function (m) {
      return m.key === icons.mandate;
    })[0];
    if (mandateIcon) active.push(mandateIcon);
    WORK_ICONS.forEach(function (w) {
      if (icons.work && icons.work[w.key]) active.push(w);
    });
    INFO_ICONS.forEach(function (n) {
      if (icons.info && icons.info[n.key]) active.push(n);
    });
    return active;
  }

  // Viser kun de ikoner der rent faktisk var slået til, da beskeden blev
  // sendt — det binder stolens mandat/arbejdsform/information direkte til
  // det konkrete svar i loggen, i stedet for kun at leve i coaster-panelet.
  function activeIconsHtml(seat, iconsAtSend) {
    if (!seat) return "";
    var active = activeIconObjects(iconsAtSend || seat.icons || defaultIcons());
    if (!active.length) return "";
    return (
      '<span class="msg-icons" title="' + escapeHtml(seat.name) + " — " +
      escapeHtml(active.map(function (i) { return iconTitle(i); }).join(", ")) + '">' +
      active.map(function (i) { return '<span aria-hidden="true">' + i.icon + "</span>"; }).join("") +
      "</span>"
    );
  }

  // Én samlet, altid-synlig statuslinje på stolen: aktive dials + aktive
  // mandat/arbejdsform/info-ikoner i samme række, adskilt af en tynd streg —
  // i modsætning til hover-popup'en (iconRowHtml), som viser alle 9 ikoner
  // så man kan slå nye til. Var tidligere to separate rækker, hvilket så ud
  // som om ikonerne stod dobbelt.
  // Samler aktive dials + aktive mandat/arbejdsform/info-ikoner til ÉN pulje
  // og viser kun de tre første symboler + et "+N"-mærke for resten — et
  // fuldt overblik (alle symboler, med navn) findes stadig ved klik på
  // stolen (Instruktioner-panelet) eller hover (seatIcons-popoveren nedenfor
  // via CSS :hover), så intet forsvinder, det bare ikke alt sammen står
  // fremme på kortet på én gang.
  var SEAT_STATUS_ROW_MAX = 3;

  function seatStatusRowHtml(seat) {
    var dialSymbols = activeDials(seat).map(function (d) {
      return d.icon;
    });
    var iconObjs = activeIconObjects(seat.icons || defaultIcons());
    var symbols = dialSymbols.concat(
      iconObjs.map(function (i) {
        return i.icon;
      })
    );
    if (!symbols.length) return "";
    var shown = symbols.slice(0, SEAT_STATUS_ROW_MAX);
    var extra = symbols.length - shown.length;
    var title = t("seatStatusRowTitle") + (extra > 0 ? t("seatStatusMoreSuffix", { count: extra }) : "");
    return (
      '<div class="seat-status-row" title="' + escapeHtml(title) + '">' +
      shown
        .map(function (icon) {
          return '<span aria-hidden="true">' + icon + "</span>";
        })
        .join("") +
      (extra > 0 ? '<span class="seat-status-more">+' + extra + "</span>" : "") +
      "</div>"
    );
  }

  function relaySelectHtml(messageId, sourceSeatId, suggestedRole) {
    var others = currentBoard().seats.filter(function (s) {
      return s.id !== sourceSeatId;
    });
    if (!others.length) return "";
    var suggestedId = suggestedRole ? (window.RundbordSeatRef.resolve(suggestedRole, others).seat || {}).id : null;
    var opts = others
      .map(function (s) {
        var isSuggested = Boolean(suggestedId) && s.id === suggestedId;
        return (
          '<option value="' + s.id + '">' + (isSuggested ? "⭐ " : "") + escapeHtml(s.name) +
          (isSuggested ? t("relaySuggestedTag") : "") + "</option>"
        );
      })
      .join("");
    var title = suggestedRole
      ? t("relaySelectTitleSuggested", { role: suggestedRole })
      : t("relaySelectTitle");
    return (
      '<select class="msg-relay-select" data-msg-id="' + messageId + '" title="' + escapeHtml(title) + '">' +
      '<option value="" selected disabled>' + escapeHtml(t("relaySelectPlaceholder")) + "</option>" +
      opts +
      "</select>"
    );
  }

  // Fase C: default-visningen er en kompakt aktivitetsstrøm (renderActivityStreamHtml),
  // den hidtidige fulde transskription (renderFullLog) er nu et sekundært lag man
  // slår til via toggle-knappen — samme besked-data, ingenting fjernet.
  var logViewMode = "activity";

  // Kontrol med bevis: kørslen gemmer ved kontrolsvaret, hvor mange citater der blev fundet (m.meta.evidence). Et PASS, hvis citater ikke
  // alle blev fundet, vises som "PASS uden bevis". Uden den oplysning (bevis ikke krævet) er alt som før.
  function verdictProof(m, vd) {
    var ev = m && m.meta && m.meta.evidence;
    if (!vd || !ev || vd.verdict !== "pass") return { unproven: false, note: "" };
    var unproven = ev.status !== "ok";
    return { unproven: unproven, note: unproven ? t("proofNoteMissing", { found: ev.found, total: ev.total }) : t("proofNoteOk", { found: ev.found, total: ev.total }) };
  }

  function renderLog() {
    var log = document.getElementById("log");
    var messages = (currentBoard().messages || []).filter(function (m) {
      return !(m.meta && m.meta.talk); // samtalen med Tredje øje vises kun i sit eget panel
    });
    var toggleBtn = document.getElementById("logViewToggleBtn");
    // Den fulde samtale får hele bredden under bordet; aktivitetsstrømmen står i den smalle kolonne ved siden af.
    var grid = document.querySelector(".layout-grid");
    if (grid) grid.classList.toggle("full-log", logViewMode === "full");
    if (toggleBtn) toggleBtn.textContent = logViewMode === "full" ? t("viewActivityStreamBtn") : t("viewFullConversationBtn");
    if (!messages.length) {
      log.innerHTML = '<p class="log-empty">' + escapeHtml(t("logEmpty")) + "</p>";
      renderOpenNeedsPanel();
      return;
    }
    if (logViewMode === "full") {
      renderFullLog(log, messages);
    } else {
      renderActivityStreamHtml(log, messages);
    }
    renderOpenNeedsPanel();
  }

  function switchToFullLogAndJump(msgId) {
    logViewMode = "full";
    renderLog();
    jumpToMessage(msgId);
  }

  function renderFullLog(log, messages) {
    // Svar, der allerede er gemt i OUT (hændelsen out.saved peger på beskeden): knappen bliver til "Åbn i OUT".
    var savedToOut = {};
    (currentBoard().events || []).forEach(function (e) {
      if (e.type === "out.saved" && e.refMessageId) savedToOut[e.refMessageId] = true;
    });
    log.innerHTML = messages
      .map(function (m) {
        var seat = seatById(m.seatId);
        var isUser = m.role === "user";
        var isSystem = m.role === "system";
        var isThirdEye = isSystem && m.meta && m.meta.kind === "thirdEye";
        var isRelayed = isUser && m.meta && m.meta.relayed;
        var isTask = isUser && m.meta && m.meta.isTask;
        var isMuted = (isSystem && !isThirdEye) || isRelayed;
        var isAssistant = m.role === "assistant";
        var isQuestion = isAssistant && /[?？]\s*$/.test(String(m.text || "").trim());
        var name = isThirdEye
          ? t("thirdEyeLabel")
          : isSystem
          ? t("nameSystemLabel")
          : isRelayed
          ? t("nameRelayedLabel")
          : isTask
          ? t("nameTaskLabel")
          : isUser
          ? t("nameUserLabel")
          : seat
          ? seat.name
          : t("unknownSeat");
        var evaluatorSeat = isThirdEye ? seatById(m.meta.evaluatorSeatId) : null;
        var llm = isThirdEye
          ? t("thirdEyeEvaluatedByPrefix") + " " + (evaluatorSeat ? evaluatorSeat.name + " · " : "") + (m.meta.evaluatorLabel || "")
          : !isUser && !isSystem && seat
          ? seat.provider + " · " + (seat.model || "")
          : "";
        var icons = isAssistant && seat ? activeIconsHtml(seat, m.meta && m.meta.icons) : "";
        var color = !isUser && !isSystem && seat ? seatColorVar(seat.color) : "var(--ink-muted)";
        var time = "";
        try {
          time = new Date(m.at).toLocaleTimeString(dateLocaleCode(), { hour: "2-digit", minute: "2-digit" });
        } catch (e) {}
        var needsSummary = isAssistant ? parseNeedsSummary(m.text) : null;
        var displayText = isRelayed
          ? t("relayedToPrefix") + (seat ? seat.name : t("nextSeatFallback")) + (m.meta && m.meta.contextual
              ? t("relayedContextualSuffix")
              : t("relayedPlainSuffix"))
          : needsSummary
          ? stripNeedsSummary(m.text)
          : m.text;
        var suggestedSeat = needsSummary
          ? window.RundbordSeatRef.resolve(needsSummary.role, currentBoard().seats).seat || undefined
          : null;
        var dialMatch = needsSummary ? parseDialAdjustment(needsSummary.adjust) : null;
        var needResolved = Boolean(needsSummary && m.meta && m.meta.needResolved);
        var emptyNeed = Boolean(needsSummary && isEmptyNeed(needsSummary.need));
        var alreadySet = Boolean(suggestedSeat && dialMatch && needAdjustAlreadySet(suggestedSeat, dialMatch));
        // En justering, der kan tolkes, gælder stolen, behovet peger på, ellers stolen, der skrev det; kortet siger tydeligt, hvad der er sket (se guidedAdjustHtml).
        var guidedSeat = needsSummary && dialMatch ? adjustTargetSeat(suggestedSeat, seat) : null;
        var handoffChip = m.meta && m.meta.handoff
              ? '<p class="msg-handoff"><button type="button" class="msg-handoff-btn" data-msg-id="' + m.id + '" title="' + escapeHtml(t("handoffOpenTitle")) + '">' + escapeHtml(t("handoffChipLabel", {
                  facts: m.meta.handoff.facts.length,
                  decisions: m.meta.handoff.decisions.length,
                  questions: m.meta.handoff.openQuestions.length,
                  warnings: m.meta.handoff.warnings.length,
                })) + "</button></p>"
              : "";
        var needsHtml = needsSummary && !emptyNeed
          ? '<div class="msg-needs' + (needResolved ? " msg-needs-resolved" : "") + '">' +
            '<p><span class="msg-needs-label">' + escapeHtml(t("needLabel")) + "</span> " + escapeHtml(needsSummary.need) + "</p>" +
            '<p><span class="msg-needs-label">' + escapeHtml(t("roleLabelShort")) + "</span> " + escapeHtml(needsSummary.role) + "</p>" +
            (guidedSeat
              ? "<p>" + guidedAdjustHtml(dialMatch, guidedSeat, { prefix: "msg-needs", msgId: m.id, resolveClass: "msg-needs-resolve-inline-btn", resolved: needResolved }) + "</p>"
              : '<p><span class="msg-needs-label">' + escapeHtml(t("adjustLabel")) + "</span> " + escapeHtml(adjustDisplayText(needsSummary.adjust)) +
            (needResolved
              ? ' <span class="msg-needs-resolved-badge">' + escapeHtml(t("resolvedBadge")) + "</span>"
              : (suggestedSeat && dialMatch && alreadySet
                  ? ' <span class="msg-needs-resolved-badge" title="' + escapeHtml(t("alreadySetTitle", { seat: suggestedSeat.name })) + '">' + escapeHtml(t("alreadySetBadge")) + "</span>"
                  : "") +
                (suggestedSeat && dialMatch && !alreadySet
                  ? ' <button type="button" class="msg-needs-apply-btn" data-seat-id="' + suggestedSeat.id +
                    '" data-msg-id="' + m.id + '" title="' +
                    escapeHtml(t("doItForMeTitle", {
                      dial: dialLabel(dialMatch.dial),
                      state: dialStateLabel(dialMatch.dial, dialMatch.state),
                      seat: suggestedSeat.name,
                    })) + '">' + escapeHtml(t("doItForMe")) + "</button>"
                  : "") +
                (suggestedSeat
                  ? ' <button type="button" class="msg-needs-open-btn" data-seat-id="' + suggestedSeat.id +
                    '" title="' + escapeHtml(t("adjustSeatBtnTitle", { seat: suggestedSeat.name })) + '">' +
                    escapeHtml(t("adjustSeatBtn", { seat: suggestedSeat.name })) + "</button>"
                  : "") +
                ' <button type="button" class="msg-needs-resolve-inline-btn" data-msg-id="' + m.id +
                '" title="' + escapeHtml(t("markResolvedTitle")) + '">' + escapeHtml(t("markResolved")) + "</button>") +
            "</p>") +
            handoffChip +
            "</div>"
          : emptyNeed && handoffChip
          ? '<div class="msg-needs">' + handoffChip + "</div>"
          : "";
        var verdictHtml = "";
        if (isAssistant && seat && seat.checks) {
          var vd = window.RundbordVerify.parse(m.text);
          var proof = verdictProof(m, vd);
          var vClass = !vd ? "unclear" : proof.unproven ? "unclear" : vd.verdict;
          var vLabel = !vd ? t("verdictUnclear") : proof.unproven ? t("verdictUnproven") : vd.verdict === "pass" ? t("verdictPass") : t("verdictFail");
          verdictHtml = '<p class="msg-verdict ' + vClass + '"><strong>' + escapeHtml(vLabel) + "</strong>" + (vd && vd.reason ? " " + escapeHtml(vd.reason) : "") +
            (proof.note ? ' <span class="msg-verdict-proof">' + escapeHtml(proof.note) + "</span>" : "") + "</p>";
        }
        // Handlinger: de primære (Videresend og Gem i OUT) står fremme, de øvrige ligger under "Mere".
        var actions = "";
        if (isAssistant) {
          var primary =
            (savedToOut[m.id]
              ? '<button type="button" class="msg-act msg-act-primary msg-out-saved-btn" data-msg-id="' + m.id +
                '" title="' + escapeHtml(t("openInOutBtnTitle")) + '">' + escapeHtml(t("openInOutBtn")) + "</button>"
              : '<button type="button" class="msg-act msg-act-primary msg-out-btn" data-msg-id="' + m.id +
                '" title="' + escapeHtml(t("saveToOutBtnTitle")) + '">' + escapeHtml(t("saveToOutBtn")) + "</button>") +
            relaySelectHtml(m.id, m.seatId, needsSummary && needsSummary.role);
          var more = savedToOut[m.id]
            ? '<button type="button" class="msg-act msg-out-btn" data-msg-id="' + m.id +
              '" title="' + escapeHtml(t("saveToOutAgainTitle")) + '">' + escapeHtml(t("saveToOutAgainBtn")) + "</button>"
            : "";
          more +=
            '<button type="button" class="msg-act msg-flag-btn" data-msg-id="' + m.id +
            '" title="' + escapeHtml(t("flagProposalBtnTitle")) + '">' + escapeHtml(t("flagProposalBtn")) + "</button>";
          if (gitAutosaveReady()) {
            more +=
              '<button type="button" class="msg-act msg-git-btn" data-msg-id="' + m.id +
              '" title="' + escapeHtml(t("saveToGitBtnTitle")) + '">' + escapeHtml(t("saveToGitBtn")) + "</button>";
          }
          if (m.meta && m.meta.handoff && m.meta.handoff.decisions && m.meta.handoff.decisions.length) {
            more +=
              '<button type="button" class="msg-act msg-memory-btn" data-msg-id="' + m.id +
              '" title="' + escapeHtml(t("rememberBtnTitle")) + '">' + escapeHtml(t("rememberBtn")) + "</button>";
          }
          if (seat && seat.voiceId && !shieldOn()) {
            more +=
              '<button type="button" class="msg-act msg-speak-btn" data-msg-id="' + m.id +
              '" title="' + escapeHtml(t("speakBtnTitle")) + '">' + escapeHtml(t("speakBtn")) + "</button>";
          }
          actions =
            primary +
            '<details class="msg-more"><summary class="msg-act" title="' + escapeHtml(t("moreActionsTitle")) + '">' + escapeHtml(t("moreActions")) +
            '</summary><div class="msg-more-menu">' + more + "</div></details>";
        }
        // Kun assistent-svar foldes — brugerens egne beskeder, "Videresendt"-
        // noterne og system-/tredje øje-beskederne er allerede korte, eller
        // (tredje øje) HELE pointen er at blive læst i sin fulde længde.
        var split = isAssistant ? splitReadback(displayText) : { readback: displayText, rest: "" };
        var isExpanded = Boolean(expandedMessageIds[m.id]);
        var textHtml = split.rest
          ? '<p class="msg-text">' + shieldHtml(split.readback) + "</p>" +
            '<button type="button" class="msg-expand-btn" data-msg-id="' + m.id + '">' +
            escapeHtml(isExpanded ? t("expandHide") : t("expandShowAll")) +
            "</button>" +
            (isExpanded ? '<p class="msg-text msg-text-rest">' + shieldHtml(split.rest) + "</p>" : "")
          : '<p class="msg-text">' + shieldHtml(displayText) + "</p>";
        if (isThirdEye) {
          textHtml = '<p class="te-layer"><span class="te-chip te-chip-assess">' + escapeHtml(t("teLayerAssessment")) + '</span> <span class="te-note">' + escapeHtml(t("teLayerNote")) + "</span></p>" + textHtml;
        }
        if (isThirdEye && m.meta && m.meta.question) {
          textHtml = '<p class="msg-asked">' + escapeHtml(t("thirdEyeAskedLabel")) + " “" + shieldHtml(m.meta.question) + "”</p>" + textHtml;
        }
        return (
          '<div class="msg' + (isMuted ? " msg-system" : "") + (isThirdEye ? " msg-thirdeye" : "") +
          (isQuestion ? " msg-question" : "") +
          '" data-msg-id="' + m.id + '" style="--seat-color:' + color + '">' +
          (isQuestion ? '<span class="msg-question-badge">' + escapeHtml(t("questionBadge")) + "</span>" : "") +
          '<div class="msg-meta"><span class="msg-who">' + escapeHtml(name) + "</span>" +
          icons +
          '<span class="msg-llm">' + escapeHtml(llm) + "</span>" +
          '<span class="msg-time">' + time + "</span></div>" +
          textHtml +
          verdictHtml +
          (isSystem && m.meta && m.meta.kind === "outBlocked"
            ? '<button type="button" class="msg-out-force-btn" data-msg-id="' + escapeHtml(m.meta.replyMessageId || "") + '">' + escapeHtml(t("outSaveAnywayBtn")) + "</button>"
            : "") +
          (isSystem && m.meta && m.meta.kind === "outSaved"
            ? '<button type="button" class="msg-out-open-btn">' + escapeHtml(t("outOpenFolderBtn")) + "</button>"
            : "") +
          needsHtml +
          nextStepsCardForMessage(m) +
          (actions ? '<div class="msg-actions">' + actions + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
    log.scrollTop = log.scrollHeight;
    Array.prototype.forEach.call(log.querySelectorAll(".msg-flag-btn"), function (btn) {
      btn.addEventListener("click", function () {
        flagAsProposal(btn.getAttribute("data-msg-id"));
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-relay-select"), function (sel) {
      sel.addEventListener("change", function () {
        var targetId = sel.value;
        var msgId = sel.getAttribute("data-msg-id");
        sel.selectedIndex = 0;
        if (targetId) relayMessageToSeat(msgId, targetId);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-memory-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msg = (currentBoard().messages || []).find(function (x) {
          return x.id === btn.getAttribute("data-msg-id");
        });
        if (!msg || !msg.meta || !msg.meta.handoff) return;
        addMemoryTexts(msg.meta.handoff.decisions).then(function (n) {
          btn.textContent = n ? t("rememberedBtn", { count: n }) : t("rememberedNothingNew");
          btn.disabled = true;
        });
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-speak-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msg = (currentBoard().messages || []).find(function (x) {
          return x.id === btn.getAttribute("data-msg-id");
        });
        if (msg) speakMessage(seatById(msg.seatId), msg.text, btn);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-out-btn"), function (btn) {
      btn.addEventListener("click", function () {
        saveMessageToOut(btn.getAttribute("data-msg-id"), btn);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-out-force-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msg = (currentBoard().messages || []).find(function (x) {
          return x.id === btn.getAttribute("data-msg-id");
        });
        if (!msg) return;
        btn.disabled = true;
        var ctx = { taskId: msg.meta && msg.meta.taskId, runId: msg.meta && msg.meta.runId };
        emitEvent("check.overridden", msg.seatId, ctx, { via: "out" }, msg.id);
        saveReplyToOut(seatById(msg.seatId), msg.text, ctx, msg.id, "override", true);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-out-saved-btn"), function (btn) {
      btn.addEventListener("click", function () {
        window.rundbord.filesOpenFolder(store.activeBoardId, "out");
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-out-open-btn"), function (btn) {
      btn.addEventListener("click", function () {
        window.rundbord.filesOpenFolder(store.activeBoardId, "out");
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-git-btn"), function (btn) {
      btn.addEventListener("click", function () {
        saveMessageToGit(btn.getAttribute("data-msg-id"), btn);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-needs-open-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var seat = seatById(btn.getAttribute("data-seat-id"));
        if (!seat) return;
        openSeatPanel(seat);
        if (btn.getAttribute("data-dial")) focusSeatDial(btn.getAttribute("data-dial"));
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-needs-apply-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msgId = btn.getAttribute("data-msg-id");
        var msg = messages.filter(function (m) {
          return m.id === msgId;
        })[0];
        var needsSummary = msg ? parseNeedsSummary(msg.text) : null;
        var match = needsSummary ? parseDialAdjustment(needsSummary.adjust) : null;
        if (match) applyDialSuggestion(btn.getAttribute("data-seat-id"), match, msgId);
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-needs-resolve-inline-btn"), function (btn) {
      btn.addEventListener("click", function () {
        markNeedResolved(btn.getAttribute("data-msg-id"));
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-handoff-btn"), function (btn) {
      btn.addEventListener("click", function () {
        openHandoffForMessage(btn.getAttribute("data-msg-id"));
      });
    });
    Array.prototype.forEach.call(log.querySelectorAll(".msg-expand-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var msgId = btn.getAttribute("data-msg-id");
        expandedMessageIds[msgId] = !expandedMessageIds[msgId];
        // renderLog() selv hopper altid til bunden — fint når en ny besked
        // ankommer, men ikke når man folder en ældre besked ud/ind midt i
        // loggen, hvor man forventer at blive stående samme sted.
        var wasAtBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
        var prevScrollTop = log.scrollTop;
        renderLog();
        log.scrollTop = wasAtBottom ? log.scrollHeight : prevScrollTop;
      });
    });
  }

  // Kompakt standardvisning: én linje pr. besked (ikon + stol + kort
  // statusfrase + tidspunkt), ingen needs-blok, ingen permanente knapper.
  // Statusfrasen genbruger splitReadback()'s allerede-eksisterende resumésætning
  // for assistent-svar (se dens kommentar) fremfor at bede modellen om endnu et
  // resumé — for andre besked-typer bruges deres i forvejen korte tekst direkte.
  // Hvad slags hændelse er det, og kræver den noget af dig? Kun det, beskeden selv dokumenterer.
  function activityChipsFor(m, seat, needsSummary, isAssistant, isRelayed, isTask, isThirdEye) {
    var chips = [];
    var kind = isThirdEye
      ? t("activityKindThirdEyeAssess")
      : isTask
      ? t("activityKindTask")
      : isRelayed
      ? t("activityKindRelayed")
      : isAssistant
      ? t("activityKindReply")
      : m.role === "system"
      ? m.meta && m.meta.kind === "outSaved"
        ? t("activityKindOutSaved")
        : m.meta && m.meta.kind === "outBlocked"
        ? t("activityKindOutBlocked")
        : t("activityKindSystem")
      : t("activityKindYou");
    // Opgave og Videresendt står allerede i navnet; typen vises kun, hvor navnet ikke siger den.
    if (!isTask && !isRelayed) chips.push({ text: kind, tone: "kind" });
    if (isAssistant && seat && seat.checks) {
      var vd = window.RundbordVerify.parse(m.text);
      var proof = verdictProof(m, vd);
      chips.push(!vd ? { text: t("verdictUnclear"), tone: "attn" } : proof.unproven ? { text: t("verdictUnproven"), tone: "attn" } : { text: vd.verdict === "pass" ? t("verdictPass") : t("verdictFail"), tone: vd.verdict === "pass" ? "ok" : "bad" });
    }
    var hasNeed = needsSummary && !/^(intet|ingen|none|nothing)\b/i.test(needsSummary.need);
    if (hasNeed && !(m.meta && m.meta.needResolved)) chips.push({ text: t("activityChipNeed", { role: needsSummary.role }), tone: "attn" });
    else if (isAssistant && /[?？]\s*$/.test(String(m.text || "").trim())) chips.push({ text: t("questionBadge"), tone: "attn" });
    return chips;
  }

  function activityPhraseFor(m, seat, displayText, isAssistant, isRelayed, isTask) {
    if (isRelayed) {
      return t("activityRelayedPhrase", { seat: seat ? seat.name : t("nextSeatFallback") });
    }
    if (isTask) {
      return t("activityTaskPhrase", { text: displayText });
    }
    if (isAssistant) {
      return splitReadback(displayText).readback;
    }
    return displayText;
  }

  function renderActivityStreamHtml(log, messages) {
    log.innerHTML = messages
      .map(function (m) {
        var seat = seatById(m.seatId);
        var isUser = m.role === "user";
        var isSystem = m.role === "system";
        var isThirdEye = isSystem && m.meta && m.meta.kind === "thirdEye";
        var isRelayed = isUser && m.meta && m.meta.relayed;
        var isTask = isUser && m.meta && m.meta.isTask;
        var isAssistant = m.role === "assistant";
        var name = isThirdEye
          ? t("thirdEyeLabel")
          : isSystem
          ? t("nameSystemLabel")
          : isRelayed
          ? t("nameRelayedLabel")
          : isTask
          ? t("nameTaskLabel")
          : isUser
          ? t("nameUserLabel")
          : seat
          ? seat.name
          : t("unknownSeat");
        var needsSummary = isAssistant ? parseNeedsSummary(m.text) : null;
        var displayText = needsSummary ? stripNeedsSummary(m.text) : m.text;
        var phrase = activityPhraseFor(m, seat, displayText, isAssistant, isRelayed, isTask);
        var time = "";
        try {
          time = new Date(m.at).toLocaleTimeString(dateLocaleCode(), { hour: "2-digit", minute: "2-digit" });
        } catch (e) {}
        var dotColor = !isUser && !isSystem && seat ? seatColorVar(seat.color) : "var(--ink-muted)";
        var chips = activityChipsFor(m, seat, needsSummary, isAssistant, isRelayed, isTask, isThirdEye)
          .map(function (c) {
            return '<span class="activity-chip chip-' + c.tone + '">' + escapeHtml(c.text) + "</span>";
          })
          .join("");
        return (
          '<div class="activity-item" data-msg-id="' + m.id + '">' +
          '<div class="activity-head"><span class="activity-time">' + time + "</span>" +
          '<span class="activity-dot" style="--seat-color:' + dotColor + '" aria-hidden="true"></span>' +
          '<span class="activity-who">' + escapeHtml(name) + "</span>" + chips +
          '<button type="button" class="activity-view-btn" data-msg-id="' + m.id + '" title="' +
          escapeHtml(t("activityViewLinkTitle")) + '">' + escapeHtml(t("activityViewLinkLabel")) + "</button></div>" +
          '<p class="activity-phrase" title="' + escapeHtml(phrase) + '">' + escapeHtml(phrase) + "</p>" +
          "</div>"
        );
      })
      .join("");
    log.scrollTop = log.scrollHeight;
    Array.prototype.forEach.call(log.querySelectorAll(".activity-view-btn"), function (btn) {
      btn.addEventListener("click", function () {
        switchToFullLogAndJump(btn.getAttribute("data-msg-id"));
      });
    });
  }

  function gitAutosaveReady() {
    var board = currentBoard();
    return Boolean(board && board.githubUrl && board.githubToken);
  }

