// 26-settings.js
// Indstillinger: ét panel med to faner. "Dette bord" gælder kun det aktive bord (navn, visning, hvem tager næste,
// prisgrænse, GitHub, bordets data og faresonen). "Hele programmet" gælder alle borde (udseende, sprog, priser, stemme, hjælp).
// Faneskift huskes pr. computer. Panelets id er settingsPanel; de øvrige paneler lukker det, når de åbnes.

  var SETTINGS_TAB_KEY = "rundbord.settingsTab";

  function settingsLastTab() {
    try {
      return localStorage.getItem(SETTINGS_TAB_KEY) === "app" ? "app" : "board";
    } catch (e) {
      return "board";
    }
  }

  function boardDisplayName(board) {
    return (board && board.projectName) || t("unnamedBoard");
  }

  function showSettingsTab(tab) {
    tab = tab === "app" ? "app" : "board";
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, tab);
    } catch (e) {}
    ["board", "app"].forEach(function (name) {
      var btn = document.getElementById(name === "board" ? "settingsTabBoard" : "settingsTabApp");
      var pane = document.getElementById(name === "board" ? "settingsBoardPane" : "settingsAppPane");
      btn.setAttribute("aria-selected", String(name === tab));
      btn.tabIndex = name === tab ? 0 : -1;
      pane.hidden = name !== tab;
    });
    if (tab === "board") renderSettingsBoardScope();
    if (tab === "app") {
      resetBoardsDelete();
      boardsStatus("", false);
      renderBoardsList();
      renderRolesList();
      renderRoleDefaultsEditor();
    }
  }

  function renderSettingsBoardScope() {
    var board = currentBoard();
    document.getElementById("settingsBoardScope").textContent = t("settingsScopeBoard", { name: boardDisplayName(board) });
    var last = Object.keys(store.boards).length <= 1;
    document.getElementById("dangerText").textContent = last ? t("dangerLastBoard") : t("dangerText", { name: boardDisplayName(board) });
    document.getElementById("deleteBoardBtn").disabled = last;
    resetDangerConfirm();
  }

  function resetDangerConfirm() {
    document.getElementById("dangerConfirm").hidden = true;
    document.getElementById("dangerNameInput").value = "";
    document.getElementById("dangerConfirmBtn").disabled = true;
    document.getElementById("deleteBoardBtn").hidden = false;
  }

  function openDangerConfirm() {
    var board = currentBoard();
    document.getElementById("dangerNameLabel").textContent = t("dangerNameLabel", { name: boardDisplayName(board) });
    document.getElementById("dangerConfirm").hidden = false;
    document.getElementById("deleteBoardBtn").hidden = true;
    document.getElementById("dangerNameInput").focus();
  }

  function dangerNameMatches() {
    return document.getElementById("dangerNameInput").value.trim() === boardDisplayName(currentBoard());
  }

  function confirmDeleteBoard() {
    if (!dangerNameMatches() || Object.keys(store.boards).length <= 1) return;
    window.rundbord.deleteBoard(store.activeBoardId).then(function (s) {
      store = s;
      closeSettings();
      render();
    });
  }

  function closeSettings() {
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("settingsBtn").setAttribute("aria-expanded", "false");
    resetDangerConfirm();
  }

  // tab: "board" | "app" | udeladt (den sidst brugte fane)
  function openSettings(tab) {
    closeAddMenu();
    ["seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var board = currentBoard();
    document.getElementById("settingsPanel").hidden = false;
    document.getElementById("settingsBtn").setAttribute("aria-expanded", "true");
    document.getElementById("projectNameInput").value = board.projectName || "";
    document.getElementById("githubInput").value = board.githubUrl || "";
    document.getElementById("githubTokenInput").value = board.githubToken || "";
    document.getElementById("handoffModeSelect").value = board.handoffMode === "structured" ? "structured" : "full";
    renderBoardPanelRouting();
    var rounds = window.RundbordRounds.normalize(board.rounds);
    document.getElementById("roundsMaxInput").value = rounds.max;
    document.getElementById("roundsAutoCheckbox").checked = rounds.auto;
    var hasChecker = board.seats.some(function (x) { return x.checks; });
    document.getElementById("roundsField").hidden = !hasChecker;
    document.getElementById("evidenceField").hidden = !hasChecker;
    document.getElementById("requireEvidenceCheckbox").checked = board.requireEvidence === true;
    document.getElementById("maxRunCostInput").value = typeof board.maxRunCostUsd === "number" ? board.maxRunCostUsd : "";
    renderTableViewSwitch();
    renderInboxSettings();
    refreshInbox();
    renderStrategySelect();
    document.getElementById("freshRunsCheckbox").checked = board.freshRuns === true;
    document.getElementById("mandateGateCheckbox").checked = board.mandateGate === true;
    document.getElementById("ownTakeFirstCheckbox").checked = board.ownTakeFirst === true;
    document.getElementById("envelopePreviewCheckbox").checked = board.envelopePreview === true;
    showSettingsTab(tab || settingsLastTab());
  }

  function closeAddMenu() {
    var menu = document.getElementById("projectMenu");
    if (menu) menu.hidden = true;
    var btn = document.getElementById("boardAddBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function initSettings() {
    // Andre paneler lukker indstillingerne ved at skjule dem; knappens tilstand følger panelet.
    new MutationObserver(function () {
      document.getElementById("settingsBtn").setAttribute("aria-expanded", String(!document.getElementById("settingsPanel").hidden));
    }).observe(document.getElementById("settingsPanel"), { attributes: true, attributeFilter: ["hidden"] });
    document.getElementById("settingsBtn").addEventListener("click", function () {
      if (document.getElementById("settingsPanel").hidden) openSettings();
      else closeSettings();
    });
    Array.prototype.forEach.call(document.querySelectorAll(".settings-tab"), function (btn) {
      btn.addEventListener("click", function () {
        showSettingsTab(btn.getAttribute("data-tab"));
      });
      btn.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        var next = btn.getAttribute("data-tab") === "board" ? "app" : "board";
        showSettingsTab(next);
        document.getElementById(next === "board" ? "settingsTabBoard" : "settingsTabApp").focus();
      });
    });
    document.getElementById("deleteBoardBtn").addEventListener("click", openDangerConfirm);
    document.getElementById("dangerCancelBtn").addEventListener("click", resetDangerConfirm);
    document.getElementById("dangerNameInput").addEventListener("input", function () {
      document.getElementById("dangerConfirmBtn").disabled = !dangerNameMatches();
    });
    document.getElementById("dangerNameInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") confirmDeleteBoard();
      if (e.key === "Escape") resetDangerConfirm();
    });
    document.getElementById("dangerConfirmBtn").addEventListener("click", confirmDeleteBoard);
    // "+" ved bordvælgeren åbner valgene direkte (opgavekort, egen opgave, hurtig start, tomt bord). Der oprettes intet, før du selv har valgt og startet.
    document.getElementById("boardAddBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      closeSettings();
      openWelcome();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest(".board-add-wrap")) closeAddMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAddMenu();
    });
  }
