// 21-tableview.js
// Bordets visning: rundt, kompakt eller liste. Valget gemmes pr. computer (localStorage). I automatisk visning vælges
// ud fra bordkolonnens faktiske bredde (lib/viewstate.js), med hysterese, så bordet ikke skifter uventet.

  // Visningen gemmes pr. bord (board.view). Bordet uden eget valg bruger det, der før lå i denne computers localStorage.
  var TABLE_VIEW_KEY = "rundbord.tableView";
  var tableViewState = { pref: "auto", mode: "round", auto: null, boardId: null };

  function legacyTableViewPref() {
    try {
      return localStorage.getItem(TABLE_VIEW_KEY);
    } catch (e) {
      return null;
    }
  }

  function boardTableViewPref() {
    var board = typeof currentBoard === "function" && store ? currentBoard() : null;
    return window.RundbordViewState.normalizePref(board && board.view ? board.view : legacyTableViewPref());
  }

  function saveTableViewPref(pref) {
    pref = window.RundbordViewState.normalizePref(pref);
    return window.rundbord.updateBoard(store.activeBoardId, { view: pref }).then(function (s) {
      store = s;
    });
  }

  function tableViewMode() {
    return tableViewState.mode;
  }

  // Udregner visningen ud fra præference og bredde. Returnerer true, hvis den ændrede sig.
  function refreshTableMode() {
    var col = document.querySelector(".table-col");
    if (tableViewState.boardId !== store.activeBoardId) {
      tableViewState.boardId = store.activeBoardId;
      tableViewState.auto = null;
    }
    tableViewState.pref = boardTableViewPref();
    var m = window.RundbordViewState.tableMode(col ? col.clientWidth : 0, tableViewState.pref, tableViewState.auto);
    if (tableViewState.pref === "auto") tableViewState.auto = m;
    var changed = m !== tableViewState.mode;
    tableViewState.mode = m;
    return changed;
  }

  function renderTableViewSwitch() {
    var wrap = document.getElementById("tableViewSwitch");
    if (!wrap) return;
    var opts = ["auto", "round", "compact", "list"];
    var labels = { auto: t("tableViewAuto"), round: t("tableViewRound"), compact: t("tableViewCompact"), list: t("tableViewList") };
    var col = document.querySelector(".table-col");
    var tight = tableViewState.pref === "round" && col && col.clientWidth < window.RundbordViewState.ROUND_MIN - window.RundbordViewState.HYST;
    var current = tableViewState.pref === "auto" ? t("tableViewAutoNow", { mode: labels[tableViewState.mode].toLowerCase() }) : tight ? t("tableViewTight") : "";
    wrap.innerHTML =
      '<span class="vs-auto">' + escapeHtml(current) + "</span>" +
      '<span class="vs-seg">' +
      opts
        .map(function (o) {
          return '<button type="button" data-view="' + o + '" aria-pressed="' + (tableViewState.pref === o) + '" title="' + escapeHtml(t("tableViewTitle", { view: labels[o] })) + '">' + escapeHtml(labels[o]) + "</button>";
        })
        .join("") +
      "</span>";
    Array.prototype.forEach.call(wrap.querySelectorAll("button"), function (btn) {
      btn.addEventListener("click", function () {
        saveTableViewPref(btn.getAttribute("data-view")).then(function () {
          applyTableView(true);
        });
      });
    });
  }

  // Bruges ved valg og ved ændret bredde: opdater visningen og tegn stolene kun, hvis visningen ændrede sig (eller force).
  function applyTableView(force) {
    var changed = refreshTableMode();
    renderTableViewSwitch();
    if (changed || force) renderSeats();
  }

  function initTableView() {
    var col = document.querySelector(".table-col");
    if (!col || typeof ResizeObserver === "undefined") return;
    // setTimeout i stedet for requestAnimationFrame: virker også, når vinduet ikke tegnes (skjult eller i baggrunden).
    var pending = false;
    new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        applyTableView(false);
      }, 30);
    }).observe(col);
  }
