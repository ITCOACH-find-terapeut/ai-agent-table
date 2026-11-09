// 20-init.js
// Sammensætter alle event-lyttere og starter appen.

  // Kunne den gemte opsætning ikke læses ved start, siger appen det, i stedet for lydløst at starte tom.
  function showConfigProblem(info) {
    var problem = info && info.configProblem;
    if (!problem) return;
    document.getElementById("configProblemText").textContent = t(problem.kind === "restored" ? "configProblemRestored" : "configProblemUnreadable", { path: problem.copy || "" });
    document.getElementById("configProblem").hidden = false;
    document.getElementById("configProblemCloseBtn").addEventListener("click", function () {
      document.getElementById("configProblem").hidden = true;
    });
  }

  function init() {
    document.getElementById("boardSelect").addEventListener("change", function () {
      closeSettings();
      window.rundbord.switchBoard(this.value).then(function (s) {
        store = s;
        render();
      });
    });
    document.getElementById("saveBoardBtn").addEventListener("click", function () {
      window.rundbord
        .updateBoard(store.activeBoardId, {
          projectName: document.getElementById("projectNameInput").value,
          githubUrl: document.getElementById("githubInput").value,
          githubToken: document.getElementById("githubTokenInput").value,
          handoffMode: document.getElementById("handoffModeSelect").value,
          routing: { mode: document.getElementById("routingModeSelect").value, autopilot: document.getElementById("autopilotCheckbox").checked },
          rounds: { max: document.getElementById("roundsMaxInput").value, auto: document.getElementById("roundsAutoCheckbox").checked },
          requireEvidence: document.getElementById("requireEvidenceCheckbox").checked,
          strategyId: document.getElementById("strategySelect").value,
          freshRuns: document.getElementById("freshRunsCheckbox").checked,
          mandateGate: document.getElementById("mandateGateCheckbox").checked,
          ownTakeFirst: document.getElementById("ownTakeFirstCheckbox").checked,
          envelopePreview: document.getElementById("envelopePreviewCheckbox").checked,
          maxRunCostUsd: document.getElementById("maxRunCostInput").value,
        })
        .then(function (s) {
          store = s;
          render();
          closeBoardPanel();
        });
    });
    document.getElementById("cancelBoardBtn").addEventListener("click", closeBoardPanel);
    document.getElementById("saveSeatBtn").addEventListener("click", saveSeat);
    document.getElementById("cancelSeatBtn").addEventListener("click", closeSeatPanel);
    document.getElementById("deleteSeatBtn").addEventListener("click", deleteSeat);
    // Papirkurven sletter uden fortryd, så den kræver et klik mere inden for tre sekunder.
    var clearArmTimer = null;
    document.getElementById("clearBoardBtn").addEventListener("click", function () {
      var btn = this;
      if (!btn.classList.contains("armed")) {
        btn.classList.add("armed");
        btn.title = t("clearBoardConfirm");
        clearArmTimer = setTimeout(function () {
          btn.classList.remove("armed");
          btn.title = t("clearBoardTitle");
        }, 3000);
        return;
      }
      clearTimeout(clearArmTimer);
      btn.classList.remove("armed");
      btn.title = t("clearBoardTitle");
      clearBoard();
    });
    document.getElementById("openNeedsToggleBtn").addEventListener("click", function () {
      openNeedsPanelOpen = !openNeedsPanelOpen;
      renderOpenNeedsPanel();
    });
    document.getElementById("logViewToggleBtn").addEventListener("click", function () {
      logViewMode = logViewMode === "full" ? "activity" : "full";
      renderLog();
    });
    document.getElementById("thirdEyeBtn").addEventListener("click", openTalkPanel);
    // Et valgt Modelprofil API huskes (på tværs af borde og genstart); et valgt stol-valg gælder, til siden tegnes forfra.
    document.getElementById("thirdEyeSeatSelect").addEventListener("change", function () {
      if (this.value.indexOf("profile:") !== 0) return;
      window.rundbord.setThirdEyeModel(this.value.slice(8)).then(function (s) {
        store = s;
      });
    });
    document.getElementById("testSeatBtn").addEventListener("click", testSeat);
    document.getElementById("providerSelect").addEventListener("change", function () {
      var modelInput = document.getElementById("modelInput");
      var knownDefaults = Object.keys(DEFAULT_MODEL).map(function (p) {
        return DEFAULT_MODEL[p];
      });
      var untouched = !modelInput.value.trim() || knownDefaults.indexOf(modelInput.value.trim()) >= 0;
      if (untouched) {
        modelInput.value = DEFAULT_MODEL[this.value] || "";
      }
      modelInput.placeholder = DEFAULT_MODEL[this.value] || t("defaultModelNamePlaceholder");
      document.getElementById("baseUrlField").hidden = this.value !== "custom";
      updateModelSuggestions(this.value);
      updateApiKeyLink(this.value);
      resetModelNote();
    });
    document.getElementById("fetchModelsBtn").addEventListener("click", fetchModels);
    bindModelPicker();
    Array.prototype.forEach.call(document.querySelectorAll(".field-hint-link"), function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        if (link.dataset.url) window.rundbord.openLink(link.dataset.url);
      });
    });
    bindQuickStart();
    bindWelcome();
    bindGuide();
    bindStuck();
    bindBoards();
    bindOverview();
    bindEye();
    bindRoleDefaults();
    bindResult();
    bindRoles();
    document.getElementById("openPricesBtn").addEventListener("click", openPricePanel);
    document.getElementById("closePricesBtn").addEventListener("click", closePricePanel);
    document.getElementById("openProposalsBtn").addEventListener("click", openProposalsPanel);
    document.getElementById("closeProposalsBtn").addEventListener("click", closeProposalsPanel);
    document.getElementById("addPriceBtn").addEventListener("click", addPrice);
    document.getElementById("autoPriceBtn").addEventListener("click", autoFetchPrices);
    document.getElementById("recomputeBtn").addEventListener("click", recomputePending);
    document.getElementById("sendMsgBtn").addEventListener("click", sendAsk);
    document.getElementById("speakerPick").addEventListener("change", function () {
      selectedSpeakerId = this.value;
      document.getElementById("variantToggleBtn").disabled =
        selectedSpeakerId === RECIPIENT_EVERYONE || currentBoard().seats.length === 0;
      renderRecipientCaption();
    });
    document.getElementById("variantToggleBtn").addEventListener("click", function () {
      var setup = document.getElementById("variantSetup");
      setup.hidden = !setup.hidden;
      if (!setup.hidden) {
        populateVariantDialSelect();
        renderVariantStatePicks();
      }
    });
    document.getElementById("variantDialSelect").addEventListener("change", renderVariantStatePicks);
    document.getElementById("cancelVariantsBtn").addEventListener("click", function () {
      document.getElementById("variantSetup").hidden = true;
    });
    document.getElementById("runVariantsBtn").addEventListener("click", runVariantTasting);
    document.getElementById("msgInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendAsk();
      }
    });
    document.getElementById("roleSelect").addEventListener("change", function () {
      if (this.value.indexOf("lib:") === 0) applyLibraryRole(this.value.slice(4));
      if (this.value === "__custom") document.getElementById("roleCustomInput").focus();
      updateInstructionPreview();
      rolePresetOnChange();
    });
    document.getElementById("roleSaveLibBtn").addEventListener("click", saveRoleToLibrary);
    document.getElementById("roleCustomInput").addEventListener("input", updateInstructionPreview);
    document.getElementById("turnLine").addEventListener("click", openTurnPanel);
    document.getElementById("giveTurnBtn").addEventListener("click", giveTurn);
    document.getElementById("clearTurnBtn").addEventListener("click", clearTurn);
    document.getElementById("closeTurnBtn").addEventListener("click", closeTurnPanel);
    document.getElementById("runStopBtn").addEventListener("click", stopRun);
    var themeSelect = document.getElementById("themeSelect");
    themeSelect.value = store.theme || "system";
    themeSelect.addEventListener("change", function () {
      window.rundbord.setTheme(themeSelect.value).then(function (s) {
        store = s;
      });
    });
    var waitStyleSelect = document.getElementById("waitStyleSelect");
    waitStyleSelect.value = window.RundbordWaitLayer.normalize(store.waitStyle);
    waitStyleSelect.addEventListener("change", function () {
      window.rundbord.setWaitStyle(waitStyleSelect.value).then(function (s) {
        store = s;
      });
    });
    var eyeFloatSelect = document.getElementById("eyeFloatSelect");
    eyeFloatSelect.value = window.RundbordEye.normalizeVisible(store.eyeFloat);
    eyeFloatSelect.addEventListener("change", function () {
      window.rundbord.setEyeFloat(eyeFloatSelect.value).then(function (s) {
        store = s;
        renderEye();
      });
    });
    document.getElementById("localeSelect").addEventListener("change", function () {
      setLocale(this.value);
      document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("boardSpend").addEventListener("click", function () {
      var pop = document.getElementById("spendPopover");
      pop.hidden = !pop.hidden;
      if (!pop.hidden) renderSpendPopover();
    });
    document.getElementById("openMetricsBtn").addEventListener("click", openMetricsPanel);
    document.getElementById("openHelpBtn").addEventListener("click", function () {
      window.rundbord.openHelp();
    });
    document.getElementById("openManualBtn").addEventListener("click", function () {
      document.getElementById("projectMenu").hidden = true;
      window.rundbord.openHelp();
    });
    // "Læs mere"-links dybe-linker til det rigtige kapitel i manualen.
    document.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest(".help-link");
      if (!link) return;
      e.preventDefault();
      window.rundbord.openHelp(link.getAttribute("data-help"));
    });
    document.getElementById("openMemoryBtn").addEventListener("click", function () {
      openMemoryPanel();
    });
    document.getElementById("closeMemoryBtn").addEventListener("click", function () {
      document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("memoryAddBtn").addEventListener("click", function () {
      var input = document.getElementById("memoryNewInput");
      addMemoryTexts([input.value]).then(function () {
        input.value = "";
      });
    });
    document.getElementById("openVoiceBtn").addEventListener("click", function () {
      document.getElementById("projectMenu").hidden = true;
      openVoicePanel();
    });
    document.getElementById("closeVoiceBtn").addEventListener("click", function () {
      stopPreview();
      document.getElementById("voicePanel").hidden = true;
      document.getElementById("shieldPanel").hidden = true;
      document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("openShieldBtn").addEventListener("click", function () {
      document.getElementById("projectMenu").hidden = true;
      openShieldPanel();
    });
    document.getElementById("shieldBtn").addEventListener("click", function () {
      shieldPatch({ enabled: !shieldOn() });
    });
    document.getElementById("closeShieldBtn").addEventListener("click", function () {
      document.getElementById("shieldPanel").hidden = true;
      document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("shieldEnabledCheckbox").addEventListener("change", function () {
      shieldPatch({ enabled: this.checked }).then(renderShieldPanel);
    });
    document.getElementById("shieldShowRawCheckbox").addEventListener("change", function () {
      shieldShowRaw = this.checked;
      renderLog();
    });
    document.getElementById("shieldTermAddBtn").addEventListener("click", addShieldTerm);
    document.getElementById("shieldTermInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") addShieldTerm();
    });
    document.getElementById("shieldClearMappingBtn").addEventListener("click", function () {
      if (!window.confirm(t("shieldClearMappingConfirm"))) return;
      shieldPatch({ mapping: {} }).then(function () {
        renderShieldPanel();
        renderLog();
      });
    });
    document.getElementById("msgInput").addEventListener("input", function () {
      autoGrowMsgInput();
      if (!document.getElementById("shieldPanel").hidden) updateShieldPreview();
    });
    document.getElementById("shieldReviewSendBtn").addEventListener("click", function () {
      if (shieldReviewResolve) shieldReviewResolve("send");
    });
    document.getElementById("shieldReviewCancelBtn").addEventListener("click", function () {
      if (shieldReviewResolve) shieldReviewResolve("cancel");
    });
    // Næste skridt: kortene findes både i samtalen og i indbakken, så klik håndteres ét sted.
    document.addEventListener("click", function (e) {
      var choose = e.target.closest && e.target.closest(".nextstep-choose");
      if (choose) return chooseNextStep(choose.getAttribute("data-msg-id"), choose.getAttribute("data-opt"));
      var skip = e.target.closest && e.target.closest(".nextstep-skip");
      if (skip) return dismissNextSteps(skip.getAttribute("data-msg-id"));
      var props = e.target.closest && e.target.closest(".proposals-inbox-open");
      if (props) {
        openNeedsPanelOpen = false;
        render();
        openProposalsPanel();
      }
    });
    document.getElementById("openTableBtn").addEventListener("click", function () {
      document.getElementById("projectMenu").hidden = true;
      openTablePanel();
    });
    document.getElementById("closeTableBtn").addEventListener("click", function () {
      document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("tableExportBtn").addEventListener("click", exportTableFile);
    document.getElementById("exportConvoBtn").addEventListener("click", exportConversation);
    document.getElementById("tableDocBtn").addEventListener("click", writeTableDocument);
    document.getElementById("tableImportBtn").addEventListener("click", importTableFile);
    document.getElementById("saveVoiceKeyBtn").addEventListener("click", saveVoiceKey);
    document.getElementById("testVoiceKeyBtn").addEventListener("click", testVoiceKey);
    document.getElementById("thirdEyeVoiceSelect").addEventListener("change", function () {
      window.rundbord.setThirdEyeVoice(this.value).then(function (s) {
        store = s;
      });
    });
    document.getElementById("speakStopBtn").addEventListener("click", stopSpeech);
    document.getElementById("talkMicBtn").addEventListener("click", toggleThirdEyeMic);
    document.getElementById("closeHandoffBtn").addEventListener("click", function () {
      document.getElementById("handoffPanel").hidden = true;
    });
    document.getElementById("talkReviewBtn").addEventListener("click", talkReview);
    document.getElementById("closeTalkBtn").addEventListener("click", function () {
      document.getElementById("talkPanel").hidden = true;
    });
    document.getElementById("talkSendBtn").addEventListener("click", talkSubmit);
    document.getElementById("talkClearBtn").addEventListener("click", talkClear);
    document.getElementById("talkInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        talkSubmit();
      }
    });
    document.getElementById("talkChips").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]");
      if (!b) return;
      var input = document.getElementById("talkInput");
      input.value = t(b.getAttribute("data-k"));
      input.focus();
    });
    document.getElementById("fetchVoicesBtn").addEventListener("click", fetchVoices);
    document.getElementById("checkReworkBtn").addEventListener("click", function () {
      if (pendingDecision) pendingDecision("rework");
    });
    document.getElementById("pauseContinueBtn").addEventListener("click", function () {
      if (pendingPause) pendingPause("continue");
    });
    document.getElementById("pauseSkipBtn").addEventListener("click", function () {
      if (pendingPause) pendingPause("skip");
    });
    document.getElementById("pauseStopBtn").addEventListener("click", function () {
      if (pendingPause) pendingPause("stop");
    });
    document.getElementById("pauseSeeBtn").addEventListener("click", togglePauseAnswer);
    document.getElementById("checkContinueBtn").addEventListener("click", function () {
      if (pendingDecision) pendingDecision("continue");
    });
    document.getElementById("checkStopBtn").addEventListener("click", function () {
      if (pendingDecision) pendingDecision("stop");
    });
    document.getElementById("ioInTile").addEventListener("click", openIoPanel);
    document.getElementById("ioOutTile").addEventListener("click", openIoPanel);
    document.getElementById("closeIoBtn").addEventListener("click", function () {
      document.getElementById("ioPanel").hidden = true;
      document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("ioOpenInBtn").addEventListener("click", function () {
      window.rundbord.filesOpenFolder(store.activeBoardId, "in");
    });
    document.getElementById("ioOpenOutBtn").addEventListener("click", function () {
      window.rundbord.filesOpenFolder(store.activeBoardId, "out");
    });
    window.addEventListener("focus", refreshIo);
    setupDropZone();
    document.getElementById("closeMetricsBtn").addEventListener("click", function () {
      document.getElementById("metricsPanel").hidden = true;
      document.getElementById("ioPanel").hidden = true;
      document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    });
    document.getElementById("exportMetricsBtn").addEventListener("click", function () {
      window.rundbord.exportEvents(store.activeBoardId).then(function (res) {
        if (res && res.ok) document.getElementById("metricsStatus").textContent = t("metricsExported", { path: res.path });
      });
    });
    document.getElementById("addCustomRoleBtn").addEventListener("click", function () {
      var outChecked = currentUiLevel() !== "advanced" && document.getElementById("addSeatOutCheck").checked;
      closeAddSeatPanel();
      openSeatPanel(null, outChecked ? "OUT Writer" : "__custom");
    });
    document.getElementById("closeAddSeatPanelBtn").addEventListener("click", closeAddSeatPanel);
    document.getElementById("confirmStartBtn").addEventListener("click", function () {
      var text = pendingStartTaskText;
      captureOwnTake();
      closeStartConfirmPanel();
      document.getElementById("msgInput").value = "";
      runTable(text);
    });
    document.getElementById("adjustStartBtn").addEventListener("click", function () {
      closeStartConfirmPanel();
      // Teksten ligger stadig i beskedfeltet: markøren står der, så du kan rette den med det samme
      var box = document.getElementById("msgInput");
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
    bindRoutingPanel();
    bindOwnTake();
    bindEnvelope();
    bindReflection();
    bindModels();
    bindUiLevel();
    bindUpdate();
    bindDataHub();
    bindAddons();
    bindDiffView();
    document.getElementById("routingModeSelect").addEventListener("change", function () {
      var box = document.getElementById("autopilotCheckbox");
      box.disabled = this.value !== "suggest";
      if (box.disabled) box.checked = false;
    });
    document.getElementById("startConfirmSeatList").addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest(".order-btn") : null;
      if (btn && !btn.disabled) moveSeatBy(btn.getAttribute("data-seat-id"), Number(btn.getAttribute("data-move")));
    });
    document.getElementById("seatOrderUpBtn").addEventListener("click", function () {
      if (editingSeatId) moveSeatBy(editingSeatId, -1);
    });
    document.getElementById("seatOrderDownBtn").addEventListener("click", function () {
      if (editingSeatId) moveSeatBy(editingSeatId, 1);
    });
    window.rundbord.getAppInfo().then(function (info) {
      appInfo = info;
      renderAppVersion();
      showConfigProblem(info);
      if (info && info.platform === "web") document.getElementById("talkMicBtn").hidden = true; // tale kræver skrivebordsversionen
    });
    buildRoleSelect();
    buildAddSeatPanel();
    buildSwatches();
    initPanelDismiss();
    applyStaticStrings();
    initTableView();
    initSettings();
    initInbox();
    initStrategy();
    render();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
