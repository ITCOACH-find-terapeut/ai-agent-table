// 05-core.js
// Fælles hjælpefunktioner: id, escaping, oversættelse, lokalt sprog, farver, store/currentBoard, selve render().

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Slår en UI-tekst op i det aktive locale (locales/da.js / locales/en.js),
  // med dansk som fallback hvis nøglen mangler i et andet sprog — så et
  // ufuldstændigt oversat locale aldrig viser et tomt felt eller en rå
  // nøgle, kun midlertidigt dansk indtil oversættelsen følger med.
  function t(key, vars) {
    var locale = store.locale === "en" ? "en" : "da";
    var dict = (window.RUNDBORD_LOCALES && window.RUNDBORD_LOCALES[locale]) || {};
    var fallback = (window.RUNDBORD_LOCALES && window.RUNDBORD_LOCALES.da) || {};
    var str = dict[key];
    if (str === undefined) str = fallback[key];
    if (str === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.split("{" + k + "}").join(vars[k]);
      });
    }
    return str;
  }

  // Udfylder alt statisk UI-tekst i index.html (data-i18n-* attributter) fra
  // det aktive locale. Køres ved opstart og igen efter et sprogskift — al
  // ANDEN tekst (dynamisk bygget HTML i render*-funktionerne) bruger t()
  // direkte og opdateres i stedet af den næste normale render().
  function applyStaticStrings() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-html]"), function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-placeholder]"), function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-title]"), function (el) {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria-label]"), function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    var localeSelect = document.getElementById("localeSelect");
    if (localeSelect) localeSelect.value = store.locale === "en" ? "en" : "da";
    if (typeof applyUiLevel === "function") applyUiLevel();
  }

  // Til Date#toLocaleString/-TimeString — ikke selve UI-teksten, kun
  // hvordan tal/datoer formateres (dag/måned-rækkefølge, AM/PM osv.).
  function dateLocaleCode() {
    return store.locale === "en" ? "en-GB" : "da-DK";
  }

  function setLocale(locale) {
    window.rundbord.setLocale(locale).then(function (s) {
      store = s;
      applyStaticStrings();
      render();
    });
  }

  function seatColorVar(key) {
    var found = SWATCHES.indexOf(key) >= 0;
    return "var(--seat-" + (found ? key : "denim") + ")";
  }

  function seatTextVar(key) {
    var found = SWATCHES.indexOf(key) >= 0;
    return "var(--seat-" + (found ? key : "denim") + "-text)";
  }

  function slotPosition(i) {
    var angle = ((-90 + i * (360 / SLOTS)) * Math.PI) / 180;
    var r = 45;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
  }

  function currentBoard() {
    return store.boards[store.activeBoardId] || { projectName: "", githubUrl: "", seats: [] };
  }

  function refresh() {
    if (!window.rundbord) {
      showFatalError("forbindelsen til appens baggrundsproces (preload) mangler.");
      return;
    }
    Promise.all([window.rundbord.getStore(), window.rundbord.getPrices()])
      .then(function (results) {
        store = results[0];
        store.priceTable = results[1] || {};
        applyStaticStrings();
        render();
        if (typeof maybeShowWelcome === "function") maybeShowWelcome();
      })
      .catch(function (err) {
        showFatalError(String((err && err.message) || err));
      });
  }

  function showFatalError(message) {
    var box = document.createElement("div");
    box.style.cssText =
      "position:fixed;inset:16px;background:#fff3f0;border:1px solid #8C3A2B;border-radius:10px;" +
      "padding:1rem 1.1rem;font-family:sans-serif;font-size:13px;color:#26201A;z-index:9999;";
    box.textContent = t("fatalErrorPrefix") + message + t("fatalErrorSuffix");
    document.body.appendChild(box);
  }

  function render() {
    renderBoardBar();
    renderPlaque();
    refreshTableMode();
    renderTableViewSwitch();
    renderSeats();
    renderBoardSpend();
    renderPriceList();
    renderRecipientSelect();
    renderApiMissingBar();
    renderThirdEyeSelect();
    renderGithubStatus();
    renderLog();
    renderTurnLine();
    renderProposalsBadge();
    if (!runActive) renderReadinessChecklist();
    renderIoBand();
    renderShieldChip();
    if (typeof updateResultBtn === "function") updateResultBtn();
    if (ioBoardId !== store.activeBoardId) {
      observations = [];
      refreshObservations();
      ioBoardId = store.activeBoardId;
      ioState = { in: [], out: [], folder: "" };
      renderIoBand();
      refreshIo();
      refreshInbox();
    }
    document.getElementById("introHint").hidden = currentBoard().seats.length > 0;
  }

  // Viser hvad der skal være på plads, før bordet kan rulle — samme visuelle
  // rækker som den levende trin-tracker under en kørsel, men her ét statisk
  // øjebliksbillede af klarhed (har stolen en nøgle eller ej).
  function renderReadinessChecklist() {
    var wrap = document.getElementById("runProgress");
    var seats = currentBoard().seats;
    if (!seats.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var notReady = {};
    apiMissingList(seats).forEach(function (m) { notReady[m.id] = true; });
    wrap.innerHTML = seats
      .map(function (seat) {
        var ready = !notReady[seat.id];
        var cls = "run-step " + (ready ? "done" : "failed");
        return (
          '<span class="' + cls + '"><span class="dot"></span>' + escapeHtml(seat.name) +
          " " + (ready ? "✓" : t("missingKeyBadge")) + "</span>"
        );
      })
      .join("");
  }

  // Kronen på selve stolen fortæller allerede hvem der har turen (og er
  // selv klikbar ind til samme turnPanel/"hvorfor") — denne linje er derfor
  // kun nødvendig som synlig indgang til "giv turen manuelt" når INGEN har
  // den. Med en aktiv turn ville den blot gentage det kronen allerede viser.
  function renderTurnLine() {
    var el = document.getElementById("turnLine");
    var turn = currentBoard().turn || { seatId: null };
    var seat = turn.seatId ? seatById(turn.seatId) : null;
    el.hidden = Boolean(seat);
    if (!seat) {
      el.innerHTML = '<span class="turn-empty">' + t("turnLineEmpty") + "</span>";
    }
  }

  function seatById(id) {
    return currentBoard().seats.find(function (s) {
      return s.id === id;
    });
  }

  // "Alle" er en sentinel-værdi, ikke et stole-id — valgt betyder "start en
  // automatisk kørsel med denne tekst som opgave" (se sendAsk()), fremfor
  // "send til én bestemt stol". Default for nye/tomme valg, ligesom
  // dropdownens første synlige mulighed.
  var RECIPIENT_EVERYONE = "__all__";

