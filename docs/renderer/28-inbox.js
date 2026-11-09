// 28-inbox.js
// Indbakke: en mappe, bordet kun læser fra. Tilstand, indstilling (⚙ → Dette bord), flise i IN/OUT-båndet og afsnit i IN/OUT-panelet.
// Appen ændrer aldrig noget i mappen; en fil kopieres til IN, hvis stolene skal læse den (lib/inbox.js, main.js).

  var inboxState = { ok: true, path: "", files: [], newCount: 0, message: "" };

  function inboxIsWeb() {
    return Boolean(appInfo && appInfo.platform === "web");
  }

  function applyInbox(res) {
    if (!res) return;
    inboxState = { ok: res.ok !== false, path: res.path || "", files: res.files || [], newCount: res.newCount || 0, message: res.message || "" };
    renderInboxTile();
    renderInboxSettings();
    if (!document.getElementById("ioPanel").hidden) renderInboxSection();
  }

  function refreshInbox() {
    var boardId = store.activeBoardId;
    return window.rundbord
      .inboxGet(boardId)
      .then(function (res) {
        if (boardId === store.activeBoardId) applyInbox(res);
      })
      .catch(function () {});
  }

  function renderInboxTile() {
    var tile = document.getElementById("ioInboxTile");
    var on = Boolean(inboxState.path) && !inboxIsWeb();
    tile.hidden = !on;
    if (!on) return;
    document.getElementById("ioInboxCount").textContent = !inboxState.ok ? t("inboxUnavailable") : inboxState.newCount ? t("inboxCountNew", { count: inboxState.newCount }) : t("inboxCountNone");
    document.getElementById("ioInboxNote").textContent = inboxState.path.split(/[\\/]/).filter(Boolean).pop() || inboxState.path;
    tile.setAttribute("data-state", !inboxState.ok ? "missing" : inboxState.newCount ? "new" : "none");
  }

  function renderInboxSettings() {
    var field = document.getElementById("inboxField");
    if (!field) return;
    field.hidden = inboxIsWeb();
    document.getElementById("inboxPathText").textContent = inboxState.path || t("inboxNoneSet");
    document.getElementById("inboxClearBtn").hidden = !inboxState.path;
    document.getElementById("inboxChooseBtn").textContent = t(inboxState.path ? "inboxChangeBtn" : "inboxChooseBtn");
  }

  function renderInboxSection() {
    var section = document.getElementById("inboxSection");
    var on = Boolean(inboxState.path) && !inboxIsWeb();
    section.hidden = !on;
    if (!on) return;
    document.getElementById("inboxDesc").textContent = t("inboxDesc", { path: inboxState.path });
    var list = document.getElementById("inboxList");
    if (!inboxState.ok) {
      list.innerHTML = '<p class="note error-text">' + escapeHtml(inboxState.message || t("inboxUnavailable")) + "</p>";
    } else if (!inboxState.files.length) {
      list.innerHTML = '<p class="note">' + escapeHtml(t("inboxEmpty")) + "</p>";
    } else {
      list.innerHTML = inboxState.files
        .map(function (f) {
          var badge = f.isNew ? '<span class="io-file-badge">' + escapeHtml(t("inboxNewBadge")) + "</span>" : "";
          var action = f.tooLarge
            ? '<span class="io-file-meta">' + escapeHtml(t("inboxTooLarge")) + "</span>"
            : '<button type="button" class="btn btn-small inbox-import-one" data-name="' + escapeHtml(f.name) + '">' + escapeHtml(t("inboxImportOne")) + "</button>";
          return (
            '<div class="io-file' + (f.isNew ? " inbox-new" : "") + '"><span class="io-file-name">' + escapeHtml(f.name) + "</span>" + badge +
            '<span class="io-file-meta">' + escapeHtml(ioSizeText(f.size)) + "</span>" + action + "</div>"
          );
        })
        .join("");
    }
    document.getElementById("inboxImportAllBtn").disabled = !inboxState.newCount;
    document.getElementById("inboxSeenBtn").disabled = !inboxState.newCount;
  }

  function inboxStatus(text, isError) {
    var el = document.getElementById("inboxStatus");
    el.textContent = text || "";
    el.className = "note" + (isError ? " error-text" : "");
  }

  function importFromInbox(names) {
    return window.rundbord.inboxImport(store.activeBoardId, names).then(function (res) {
      applyInbox(res);
      var text = "";
      if (res && res.added && res.added.length) text = t("inboxImported", { count: res.added.length });
      if (res && res.skipped && res.skipped.length) text += (text ? " " : "") + t("ioSkipped", { names: res.skipped.map(function (x) { return x.name; }).join(", ") });
      inboxStatus(text, !(res && res.added && res.added.length) && Boolean(text));
      return refreshIo();
    });
  }

  function initInbox() {
    document.getElementById("inboxChooseBtn").addEventListener("click", function () {
      window.rundbord.inboxChoose(store.activeBoardId).then(function (res) {
        var status = document.getElementById("inboxSettingsStatus");
        if (res && res.ok) {
          status.textContent = "";
          applyInbox(res);
        } else if (!(res && res.canceled)) {
          status.className = "note error-text";
          status.textContent = (res && res.message) || t("unknownError");
        }
      });
    });
    document.getElementById("inboxClearBtn").addEventListener("click", function () {
      window.rundbord.inboxClear(store.activeBoardId).then(applyInbox);
    });
    document.getElementById("ioInboxTile").addEventListener("click", function () {
      openIoPanel();
    });
    document.getElementById("inboxImportAllBtn").addEventListener("click", function () {
      importFromInbox(null);
    });
    document.getElementById("inboxSeenBtn").addEventListener("click", function () {
      window.rundbord.inboxMarkSeen(store.activeBoardId, null).then(applyInbox);
    });
    document.getElementById("inboxOpenBtn").addEventListener("click", function () {
      window.rundbord.filesOpenFolder(store.activeBoardId, "inbox");
    });
    document.getElementById("inboxList").addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".inbox-import-one");
      if (btn) importFromInbox([btn.getAttribute("data-name")]);
    });
    // Mappen kan have ændret sig, mens du var i et andet program.
    window.addEventListener("focus", refreshInbox);
  }
