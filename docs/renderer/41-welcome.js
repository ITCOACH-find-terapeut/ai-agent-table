// 41-welcome.js
// Velkomst med opgavekort: en ny bruger vælger en opgave, ser et eksempel og en liste over de modeller, bordet vil bruge, og får et færdigt bord.
// Intet sendes til nogen model, før brugeren selv trykker Start. Kun modellisten hentes (med brugerens OpenRouter-nøgle), ligesom i Hurtig start.
// Hændelserne har kun kortets nøgle og antal stole, ingen tekst.

  var welcomeState = { card: null, setup: null, starter: null, key: "", reusedKey: false, shown: false };
  var WELCOME_RUN_LIMIT_USD = 1;

  function welcomeLoc() {
    return store && store.locale === "en" ? "en" : "da";
  }

  function welcomeEl(id) {
    return document.getElementById(id);
  }

  // Forklaringen under nøglefelterne: abonnement er ikke en API-nøgle, hvem du betaler, hvor nøglen gemmes, hvem der modtager opgaven, og at nøgletjek ikke sender noget.
  function fillKeyExplain() {
    var encrypted = !appInfo || appInfo.secretsEncrypted !== false;
    Array.prototype.forEach.call(document.querySelectorAll("[data-key-explain]"), function (box) {
      var provider = box.getAttribute("data-provider");
      var lines = [
        t("keyExplainSubscription"),
        t("keyExplainPays"),
        t(encrypted ? "keyExplainStored" : "keyExplainStoredNo"),
        provider ? t("keyExplainSent", { provider: provider }) : t("keyExplainSentGeneric"),
        t("keyExplainNothing"),
      ];
      // OpenRouter giver adgang til mange modeller med én nøgle, så den bruges af alle stole og af Tredje øje: den skal kun sættes én gang.
      if (provider === "OpenRouter") lines.splice(2, 0, t("keyExplainShared"));
      box.innerHTML = "<strong>" + escapeHtml(t("keyExplainTitle")) + "</strong><ul>" + lines.map(function (l) { return "<li>" + escapeHtml(l) + "</li>"; }).join("") + "</ul>";
    });
  }

  function welcomeCardsView() {
    fillKeyExplain();
    welcomeState.card = null;
    welcomeState.setup = null;
    welcomeState.starter = null;
    welcomeState.key = "";
    welcomeState.reusedKey = false;
    welcomeState.guide = null;
    welcomeEl("welcomeDetail").hidden = true;
    welcomeEl("welcomeGuide").hidden = true;
    welcomeEl("guideProposal").hidden = true;
    welcomeEl("welcomeCards").hidden = false;
    welcomeEl("welcomeFooter").hidden = false;
    welcomeEl("welcomeDemoBox").hidden = Boolean(appInfo && appInfo.platform === "web"); // webudgaven har sin egen demo
    welcomeEl("welcomeAskBox").hidden = Boolean(appInfo && appInfo.platform === "web");
    welcomeEl("welcomeResult").hidden = true;
    welcomeEl("welcomeStatus").textContent = "";
    welcomeEl("welcomeKey").value = "";
  }

  function renderWelcomeCards() {
    var wrap = welcomeEl("welcomeCards");
    wrap.innerHTML = "";
    window.RundbordWelcome.cards(welcomeLoc()).forEach(function (card) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn welcome-card";
      btn.setAttribute("data-card", card.key);
      var title = document.createElement("span");
      title.className = "welcome-card-title";
      title.textContent = card.title;
      var line = document.createElement("span");
      line.className = "welcome-card-line";
      line.textContent = card.line;
      btn.appendChild(title);
      btn.appendChild(line);
      btn.addEventListener("click", function () {
        pickWelcomeCard(card.key);
      });
      wrap.appendChild(btn);
    });
  }

  function openWelcome() {
    // Åbnes den fra «+» på en eksisterende installation, oprettes et nyt bord først, når du vælger (kort, egen opgave, hurtig start eller tomt bord).
    var adding = Boolean(store && store.welcomeSeen !== false);
    // Webudgaven har hverken OpenRouter-forbindelse eller opgavekort her: der er kun valget om et tomt bord.
    var web = Boolean(appInfo && appInfo.platform === "web");
    QS_PANELS.forEach(function (id) {
      var el = welcomeEl(id);
      if (el) el.hidden = true;
    });
    welcomeEl("quickStartPanel").hidden = true;
    welcomeEl("tablePanel").hidden = true;
    welcomeCardsView();
    renderWelcomeCards();
    welcomeState.adding = adding;
    welcomeEl("welcomeCards").hidden = web;
    welcomeEl("welcomeAskBox").hidden = web;
    welcomeEl("welcomeQuickBtn").hidden = web;
    welcomeEl("welcomePanel").hidden = false;
  }

  function closeWelcome() {
    welcomeEl("welcomePanel").hidden = true;
    welcomeEl("welcomeKey").value = "";
    welcomeState = { card: null, setup: null, starter: null, key: "", reusedKey: false, shown: welcomeState.shown, adding: false };
  }

  // Flaget gemmes først, når brugeren har valgt (opgave eller tomt bord), så en lukket app viser velkomsten igen.
  function markWelcomeSeen() {
    if (!store || store.welcomeSeen !== false) return Promise.resolve();
    return window.rundbord.setWelcomeSeen(true).then(function (s) {
      store = s;
    });
  }

  function maybeShowWelcome() {
    if (welcomeState.shown) return;
    if (!window.RundbordWelcome.shouldShow(store, appInfo ? appInfo.platform : "")) return;
    welcomeState.shown = true;
    openWelcome();
  }

  function pickWelcomeCard(key) {
    var loc = welcomeLoc();
    var card = window.RundbordWelcome.get(key, loc);
    var file = card && window.RundbordTemplates.get(card.template, loc);
    var parsed = file && window.RundbordTableFile.parse(JSON.stringify(file), tableFileCtx());
    if (!card || !parsed || !parsed.ok) {
      welcomeEl("welcomeStatus").textContent = t("tableImportError_notTableFile");
      return;
    }
    openWelcomeDetail(card, parsed.setup, null);
  }

  // Detaljevisningen: opgaven, nøglen og modellerne. Et kort fra velkomsten (guide = null) har et mærket eksempel; en egen opgave (guide) har i stedet et forslag (renderer/48-guide.js).
  function openWelcomeDetail(card, setup, guide) {
    var existing = window.RundbordWelcome.findOpenRouterKey(store);
    welcomeState = { card: card, setup: setup, starter: null, key: existing, reusedKey: Boolean(existing), shown: welcomeState.shown, guide: guide };
    welcomeEl("welcomeGuide").hidden = true;
    welcomeEl("welcomeCards").hidden = true;
    welcomeEl("welcomeFooter").hidden = true;
    welcomeEl("welcomeDemoBox").hidden = true;
    welcomeEl("welcomeAskBox").hidden = true;
    welcomeEl("welcomeDetailTitle").textContent = card.title;
    welcomeEl("welcomeTask").textContent = card.task;
    welcomeEl("welcomeExampleBlock").hidden = Boolean(guide);
    welcomeEl("guideProposal").hidden = !guide;
    if (guide) renderGuideProposal();
    welcomeEl("welcomeExample").innerHTML = card.example
      .map(function (e) {
        return '<div class="history-entry"><strong>' + escapeHtml(e.who) + "</strong><p>" + escapeHtml(e.text) + "</p></div>";
      })
      .join("");
    welcomeEl("welcomeKeyField").hidden = Boolean(existing);
    welcomeEl("welcomeKeyReused").hidden = !existing;
    welcomeEl("welcomeResult").hidden = true;
    welcomeEl("welcomeStatus").textContent = "";
    welcomeEl("welcomeDetail").hidden = false;
    if (!existing) welcomeEl("welcomeKey").focus();
  }

  function renderWelcomeRows() {
    var models = window.RundbordWelcome.assignModels(welcomeState.setup.seats, welcomeState.starter);
    welcomeEl("welcomeRows").innerHTML = welcomeState.setup.seats
      .map(function (seat, i) {
        var m = models[i];
        var r = welcomeState.starter.filter(function (x) {
          return x.model === m;
        })[0];
        return (
          '<div class="qs-row' + (m ? "" : " qs-missing") + '"><span class="qs-role">' + escapeHtml(seat.role) +
          "</span>" +
          '<span class="qs-model">' + (m ? escapeHtml(m) : escapeHtml(t("quickStartNotFound"))) + "</span>" +
          '<span class="qs-price">' + escapeHtml(r ? quickStartPriceText(r) : "") + "</span></div>"
        );
      })
      .join("");
  }

  function fetchWelcomeModels() {
    var status = welcomeEl("welcomeStatus");
    var key = welcomeState.reusedKey ? welcomeState.key : welcomeEl("welcomeKey").value.trim();
    if (!key) {
      status.textContent = t("quickStartNeedKey");
      return;
    }
    status.textContent = t("quickStartStatusFetching");
    window.rundbord.openrouterStarter(key).then(function (res) {
      if (!res || !res.ok) {
        status.textContent = (res && res.message) || t("unknownError");
        welcomeEl("welcomeResult").hidden = true;
        // En gemt nøgle, der ikke virker længere, kan skrives om
        if (welcomeState.reusedKey) {
          welcomeState.reusedKey = false;
          welcomeState.key = "";
          welcomeEl("welcomeKeyField").hidden = false;
          welcomeEl("welcomeKeyReused").hidden = true;
        }
        return;
      }
      welcomeState.key = key;
      welcomeState.starter = res.starter;
      status.textContent = t("quickStartStatusOk", { count: res.count });
      renderWelcomeRows();
      welcomeEl("welcomeResult").hidden = false;
    });
  }

  // Det første bord, appen selv har lavet, er tomt og har et navn, ingen har valgt. Det fjernes, når det første rigtige bord er oprettet.
  function emptyFirstBoardId() {
    if (!store || store.welcomeSeen !== false) return "";
    var b = currentBoard();
    return b && !(b.seats || []).length && !(b.messages || []).length && Object.keys(store.boards || {}).length === 1 ? store.activeBoardId : "";
  }

  function createWelcomeBoard() {
    var st = welcomeState;
    if (!st.card || !st.setup || !st.starter || !st.key) return;
    var btn = welcomeEl("welcomeCreateBtn");
    btn.disabled = true;
    var emptyId = emptyFirstBoardId();
    var setup = st.setup;
    if (!setup.maxRunCostUsd) setup.maxRunCostUsd = WELCOME_RUN_LIMIT_USD;
    var models = window.RundbordWelcome.assignModels(setup.seats, st.starter);
    ensureDefaultOpenRouter(st.key, st.starter)
      .then(function () {
        return createBoardFromSetup(setup, { provider: "openrouter", apiKey: st.key, models: models });
      })
      .then(function () {
        // priserne fra OpenRouters egen liste (mærket som sådan), så forbrug kan regnes fra første kald
        return st.starter.reduce(function (p, r) {
          return p.then(function () {
            if (r.model && r.inPerM != null && r.outPerM != null) return window.rundbord.setPrice(r.model, r.inPerM, r.outPerM, "openrouter");
          });
        }, Promise.resolve());
      })
      .then(function () {
        return emptyId ? window.rundbord.deleteBoard(emptyId) : null;
      })
      .then(function () {
        return window.rundbord.getStore();
      })
      .then(function (s) {
        store = s;
        return applyGuideOutcome(st).then(markWelcomeSeen);
      })
      .then(function () {
        closeWelcome();
        render();
        emitEvent("welcome.created", null, {}, Object.assign({ card: st.card.key, seats: setup.seats.length }, st.guide ? { template: st.guide.sug.template, preset: st.guide.sug.preset, source: st.guide.sug.source } : {}));
        var input = welcomeEl("msgInput");
        input.value = st.card.task;
        input.focus();
        btn.disabled = false;
        return systemNote(t(st.guide && st.guide.sent ? "welcomeDoneGuidedRead" : "welcomeDone", { name: setup.name, limit: WELCOME_RUN_LIMIT_USD }));
      })
      .catch(function () {
        btn.disabled = false;
      });
  }

  function skipWelcome() {
    emitEvent("welcome.skipped", null, {}, {});
    // Fra «+»: nu, og først nu, oprettes det tomme bord. Første gang (velkomsten ved en ny installation) bruges det bord, appen allerede har.
    var adding = welcomeState.adding === true;
    var made = adding ? window.rundbord.createBoard(t("newBoardDefaultName")) : Promise.resolve(null);
    made
      .then(function (s) {
        if (s) store = s;
        return markWelcomeSeen();
      })
      .then(function () {
        closeWelcome();
        render();
      });
  }

  function bindWelcome() {
    welcomeEl("welcomeEmptyBtn").addEventListener("click", skipWelcome);
    welcomeEl("welcomeQuickBtn").addEventListener("click", function () {
      closeWelcome();
      openQuickStart();
    });
    // Den indspillede demo: eget vindue og eget øvelsesbord, uden nøgle og uden at røre dine borde.
    welcomeEl("welcomeDemoBtn").addEventListener("click", function () {
      window.rundbord.openDemo();
    });
    welcomeEl("welcomeBackBtn").addEventListener("click", function () {
      if (welcomeState.guide) openGuideForm();
      else welcomeCardsView();
    });
    welcomeEl("welcomeFetchBtn").addEventListener("click", fetchWelcomeModels);
    welcomeEl("welcomeCreateBtn").addEventListener("click", createWelcomeBoard);
    welcomeEl("welcomeKey").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") fetchWelcomeModels();
    });
    welcomeEl("welcomeKeyLink").addEventListener("click", function (ev) {
      ev.preventDefault();
      window.rundbord.openLink(PROVIDER_KEY_URL.openrouter);
    });
  }
