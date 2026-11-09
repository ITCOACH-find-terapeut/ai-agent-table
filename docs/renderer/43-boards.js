// 43-boards.js
// ⚙ → Hele programmet → Dine borde: alle borde på ét sted. Omdøb, dublér (opsætningen uden samtale, lib/boardcopy.js), backup som fil (lib/boardbackup.js),
// gendan en backup som et nyt bord og slet. En backup har bordets opsætning og samtale, aldrig nøgler, tokens eller adresser.
// Sletning kræver, at bordets navn skrives, ligesom under Dette bord. En backup åbnes altid som et NYT bord, så intet overskrives. Intet sendes nogen steder.

  var boardsDeleteId = null;
  var boardsRenameId = null;

  // Handlingerne på et bord er ikoner med en tekst, der kommer frem ved hover og fokus (og som skærmlæsere læser som navn): omdøb, dublér, gem som fil, slet.
  var BOARD_ICONS = {
    rename: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    duplicate: '<rect x="9" y="9" width="10" height="10" rx="1.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
    backup: '<path d="M12 4v10"/><path d="M8 10.5l4 4 4-4"/><path d="M5 19h14"/>',
    del: '<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  };

  // En ikonknap: klassen bevares (testene og lytterne finder knappen på den), navnet er aria-label, og tip er teksten, der vises.
  function boardIconBtn(cls, icon, eid, label, tip, extra) {
    return (
      '<button type="button" class="' + cls + ' btn icon-action" data-id="' + eid + '" aria-label="' + escapeHtml(label) + '" data-tip="' + escapeHtml(tip) + '"' + (extra || "") + ">" +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + BOARD_ICONS[icon] + "</svg></button>"
    );
  }
  var boardsRestoreState = null;

  function boardsOrder() {
    var ids = Object.keys(store.boards || {});
    return ids.sort(function (a, b) {
      var sa = window.RundbordBoardBackup.summary(store.boards[a]).lastAt || "";
      var sb = window.RundbordBoardBackup.summary(store.boards[b]).lastAt || "";
      return sa < sb ? 1 : sa > sb ? -1 : 0;
    });
  }

  function boardsDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "?";
    return d.toLocaleDateString(store.locale === "en" ? "en-GB" : "da-DK", { day: "numeric", month: "long", year: "numeric" });
  }

  function renderBoardsList() {
    var box = document.getElementById("boardsList");
    if (!box || !store) return;
    var ids = boardsOrder();
    var last = ids.length <= 1;
    box.innerHTML = ids
      .map(function (id) {
        var b = store.boards[id];
        var s = window.RundbordBoardBackup.summary(b);
        var stats = s.messages ? t("boardsStats", { seats: s.seats, messages: s.messages, date: boardsDate(s.lastAt) }) : t("boardsStatsNone", { seats: s.seats });
        var open = id === store.activeBoardId ? ' <span class="note">· ' + escapeHtml(t("boardsOpenTag")) + "</span>" : "";
        var eid = escapeHtml(id);
        if (id === boardsRenameId) {
          return (
            '<div class="models-row" data-id="' + eid + '"><div class="models-main"><label for="boardsRenameInput">' + escapeHtml(t("boardsRenameLabel", { name: boardDisplayName(b) })) + "</label>" +
            '<input type="text" id="boardsRenameInput" maxlength="60" autocomplete="off" value="' + escapeHtml(b.projectName || "") + '"></div>' +
            '<div class="row"><button type="button" class="btn btn-primary" id="boardsRenameSaveBtn">' + escapeHtml(t("boardsRenameSave")) + "</button>" +
            '<button type="button" class="btn" id="boardsRenameCancelBtn">' + escapeHtml(t("boardsRenameCancel")) + "</button></div></div>"
          );
        }
        return (
          '<div class="models-row" data-id="' + eid + '"><div class="models-main"><strong>' + escapeHtml(boardDisplayName(b)) + "</strong>" + open +
          '<br><span class="note">' + escapeHtml(stats) + "</span></div>" +
          '<div class="row board-actions">' +
          boardIconBtn("boards-rename-btn", "rename", eid, t("boardsRenameBtn"), t("boardsRenameTip")) +
          boardIconBtn("boards-duplicate-btn", "duplicate", eid, t("boardsDuplicateBtn"), t("boardsDuplicateTitle")) +
          boardIconBtn("boards-backup-btn", "backup", eid, t("boardsBackupBtn"), t("boardsBackupTip")) +
          boardIconBtn("boards-delete-btn", "del", eid, t("boardsDeleteBtn"), last ? t("boardsDeleteLastTitle") : t("boardsDeleteTip"), last ? " disabled" : "") +
          "</div></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll(".boards-rename-btn"), function (btn) {
      btn.addEventListener("click", function () {
        startBoardRename(btn.getAttribute("data-id"));
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll(".boards-duplicate-btn"), function (btn) {
      btn.addEventListener("click", function () {
        duplicateBoardAction(btn.getAttribute("data-id"));
      });
    });
    var renameInput = document.getElementById("boardsRenameInput");
    if (renameInput) {
      renameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") saveBoardRename();
        if (e.key === "Escape") cancelBoardRename();
      });
      document.getElementById("boardsRenameSaveBtn").addEventListener("click", saveBoardRename);
      document.getElementById("boardsRenameCancelBtn").addEventListener("click", cancelBoardRename);
      renameInput.focus();
      renameInput.select();
    }
    Array.prototype.forEach.call(box.querySelectorAll(".boards-backup-btn"), function (btn) {
      btn.addEventListener("click", function () {
        backupBoard(btn.getAttribute("data-id"));
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll(".boards-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        openBoardsDelete(btn.getAttribute("data-id"));
      });
    });
  }

  function boardsStatus(text, isError) {
    var el = document.getElementById("boardsStatus");
    el.className = isError ? "note error-text" : "note";
    el.textContent = text || "";
  }

  // Gemmer ét bord som fil. Returnerer et løfte, der giver true, når filen er gemt.
  function backupBoard(id) {
    var board = store.boards[id];
    if (!board) return Promise.resolve(false);
    var now = new Date().toISOString();
    var info = { now: now, version: appInfo ? appInfo.version : "", revision: appInfo ? appInfo.revision : "" };
    return window.rundbord.saveTextFile(window.RundbordBoardBackup.fileName(board, now), window.RundbordBoardBackup.text(board, info), "json").then(function (res) {
      if (res && res.ok) {
        boardsStatus(t("boardsBackupSaved", { path: res.path }), false);
        return true;
      }
      if (!(res && res.canceled)) boardsStatus((res && res.message) || t("unknownError"), true);
      return false;
    });
  }

  // ---- Omdøb ----
  function startBoardRename(id) {
    if (!store.boards[id]) return;
    resetBoardsDelete();
    boardsRenameId = id;
    boardsStatus("", false);
    renderBoardsList();
  }

  function cancelBoardRename() {
    boardsRenameId = null;
    renderBoardsList();
  }

  function saveBoardRename() {
    var id = boardsRenameId;
    var board = id && store.boards[id];
    if (!board) return;
    var name = document.getElementById("boardsRenameInput").value.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) {
      boardsStatus(t("boardsRenameEmpty"), true);
      return;
    }
    if (name === board.projectName) {
      cancelBoardRename();
      return;
    }
    // To borde med samme navn kan ikke skelnes ved sletning (navnet skrives for at bekræfte), så navnet skal være frit.
    var taken = Object.keys(store.boards).some(function (other) {
      return other !== id && String(store.boards[other].projectName || "").trim().toLowerCase() === name.toLowerCase();
    });
    if (taken) {
      boardsStatus(t("boardsRenameTaken"), true);
      return;
    }
    window.rundbord.updateBoard(id, { projectName: name }).then(function (s) {
      store = s;
      boardsRenameId = null;
      render();
      renderBoardsList();
      renderSettingsBoardScope();
      boardsStatus(t("boardsRenamed", { name: name }), false);
    });
  }

  // ---- Dublér ----
  function duplicateBoardAction(id) {
    if (!store.boards[id]) return Promise.resolve(false);
    boardsRenameId = null;
    resetBoardsDelete();
    return window.rundbord.duplicateBoard(id).then(function (s) {
      store = s;
      var made = store.boards[store.activeBoardId];
      render();
      renderBoardsList();
      renderSettingsBoardScope();
      boardsStatus(t("boardsDuplicated", { name: boardDisplayName(made) }), false);
      return true;
    });
  }

  // ---- Gendan fra backup: filen er upålidelig, så du ser, hvad den vil oprette, før noget sker ----
  function resetBoardsRestore() {
    boardsRestoreState = null;
    var wrap = document.getElementById("boardsRestore");
    wrap.hidden = true;
    wrap.innerHTML = "";
  }

  function openBoardsRestore() {
    boardsStatus("", false);
    return window.rundbord.openTextFile("json").then(function (res) {
      if (!res || !res.ok) {
        if (res && !res.canceled) boardsStatus((res && res.message) || t("unknownError"), true);
        return;
      }
      var parsed = window.RundbordBoardBackup.parse(res.text, tableFileCtx());
      if (!parsed.ok) {
        resetBoardsRestore();
        boardsStatus(t("boardsRestoreError_" + parsed.error), true);
        return;
      }
      var names = Object.keys(store.boards).map(function (k) {
        return store.boards[k].projectName;
      });
      boardsRestoreState = { parsed: parsed, name: window.RundbordBoardCopy.uniqueName(names, parsed.setup.name, t("boardsRestoreSuffix")) };
      renderBoardsRestore();
    });
  }

  function boardsRestoreWarningText(w) {
    if (w.code === "shieldWasOn" || w.code === "tooManyMessages") return t("boardsRestoreWarn_" + w.code, { count: w.count || 0 });
    return tableWarningText(w);
  }

  function renderBoardsRestore() {
    var wrap = document.getElementById("boardsRestore");
    if (!boardsRestoreState) {
      resetBoardsRestore();
      return;
    }
    var p = boardsRestoreState.parsed;
    wrap.hidden = false;
    wrap.innerHTML =
      '<h3 class="eyebrow">' + escapeHtml(t("boardsRestoreTitle", { name: boardsRestoreState.name })) + "</h3>" +
      '<p class="note">' + escapeHtml(t("boardsRestoreNote")) + "</p>" +
      '<p class="note">' + escapeHtml(t("boardsRestoreStats", { seats: p.setup.seats.length, messages: p.messages.length, memory: p.memory.length })) + "</p>" +
      '<p class="note">' + escapeHtml(t("boardsRestoreSeats", { names: p.setup.seats.map(function (s) { return s.role; }).join(", ") })) + "</p>" +
      (p.warnings.length ? '<ul class="dataflow-list">' + p.warnings.map(function (w) { return "<li>" + escapeHtml(boardsRestoreWarningText(w)) + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="row"><button type="button" class="btn btn-primary" id="boardsRestoreConfirmBtn">' + escapeHtml(t("boardsRestoreConfirm")) + "</button>" +
      '<button type="button" class="btn" id="boardsRestoreCancelBtn">' + escapeHtml(t("boardsRestoreCancel")) + "</button></div>";
    document.getElementById("boardsRestoreConfirmBtn").addEventListener("click", confirmBoardsRestore);
    document.getElementById("boardsRestoreCancelBtn").addEventListener("click", resetBoardsRestore);
  }

  // Opretter et nyt bord ud fra opsætningen (uden nøgler) og lægger samtalen og hukommelsen tilbage. Giver et løfte med det nye bords id.
  function confirmBoardsRestore() {
    var state = boardsRestoreState;
    if (!state) return Promise.resolve(null);
    var p = state.parsed;
    var setup = Object.assign({}, p.setup, { name: state.name });
    var boardId;
    resetBoardsRestore();
    return createBoardFromSetup(setup, {})
      .then(function (res) {
        boardId = res.boardId;
        return window.rundbord.restoreBoardBackup(boardId, {
          messages: p.messages.map(function (m) {
            return { at: m.at, role: m.role, seat: m.seat, text: m.text, talk: m.talk, kind: m.kind };
          }),
          memory: p.memory,
        });
      })
      .then(function (s) {
        store = s;
        render();
        renderBoardsList();
        renderSettingsBoardScope();
        var needsApi = apiMissingList(store.boards[boardId].seats || []).length > 0;
        boardsStatus(t("boardsRestored", { name: state.name, messages: store.boards[boardId].messages.length }) + (needsApi ? t("boardsRestoredApi") : ""), false);
        return boardId;
      });
  }

  function resetBoardsDelete() {
    boardsDeleteId = null;
    document.getElementById("boardsDelete").hidden = true;
    document.getElementById("boardsDeleteName").value = "";
    document.getElementById("boardsDeleteConfirmBtn").disabled = true;
  }

  function openBoardsDelete(id) {
    var board = store.boards[id];
    if (!board || Object.keys(store.boards).length <= 1) return;
    boardsDeleteId = id;
    boardsStatus("", false);
    document.getElementById("boardsDeleteText").textContent = t("boardsDeleteText", { name: boardDisplayName(board) });
    document.getElementById("boardsDeleteNameLabel").textContent = t("boardsDeleteNameLabel", { name: boardDisplayName(board) });
    document.getElementById("boardsDeleteName").value = "";
    document.getElementById("boardsDeleteConfirmBtn").disabled = true;
    document.getElementById("boardsDelete").hidden = false;
    document.getElementById("boardsDeleteName").focus();
  }

  function boardsDeleteNameMatches() {
    var board = boardsDeleteId && store.boards[boardsDeleteId];
    return Boolean(board) && document.getElementById("boardsDeleteName").value.trim() === boardDisplayName(board);
  }

  function confirmBoardsDelete() {
    if (!boardsDeleteNameMatches() || Object.keys(store.boards).length <= 1) return;
    var id = boardsDeleteId;
    var name = boardDisplayName(store.boards[id]);
    window.rundbord.deleteBoard(id).then(function (s) {
      store = s;
      resetBoardsDelete();
      render();
      renderBoardsList();
      renderSettingsBoardScope();
      boardsStatus(t("boardsDeleted", { name: name }), false);
    });
  }

  function bindBoards() {
    document.getElementById("boardsRestoreBtn").addEventListener("click", openBoardsRestore);
    document.getElementById("boardsDeleteName").addEventListener("input", function () {
      document.getElementById("boardsDeleteConfirmBtn").disabled = !boardsDeleteNameMatches();
    });
    document.getElementById("boardsDeleteBackupBtn").addEventListener("click", function () {
      if (boardsDeleteId) backupBoard(boardsDeleteId);
    });
    document.getElementById("boardsDeleteConfirmBtn").addEventListener("click", confirmBoardsDelete);
    document.getElementById("boardsDeleteCancelBtn").addEventListener("click", resetBoardsDelete);
  }
