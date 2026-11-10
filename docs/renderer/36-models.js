// 36-models.js
// Modelprofiler API (lib/models.js): udbyder, adresse og nøgle sættes op ÉN gang under ⚙ → Hele programmet → Modelprofiler API; modellen vælges på stolen. En stol vælger en profil i sit panel
// i stedet for sin egen opsætning; ændrer du profilen, følger alle stole med. Sletter du en profil, beholder stolene deres opsætning.
// Nøglen gemmes krypteret og sendes kun til udbyderen. Den ligger stadig også i visningslaget, som i dag.

  var modelsEditingId = null;
  var modelsReturnToSeat = false;
  var modelsDeleteArmed = null;

  function modelProfiles() {
    return (store && store.models) || [];
  }

  function modelProfileById(id) {
    return window.RundbordModels.get(modelProfiles(), id);
  }

  function modelProfileLabel(p) {
    return p.name + " · " + p.provider + " · " + (p.model || "?");
  }

  function renderModelsList() {
    var box = document.getElementById("modelsList");
    var list = modelProfiles();
    if (!list.length) {
      box.innerHTML = '<p class="note">' + escapeHtml(t("modelsEmpty")) + "</p>";
      return;
    }
    box.innerHTML = list
      .map(function (p) {
        var n = window.RundbordModels.usage(store, p.id);
        return (
          '<div class="models-row" data-id="' + escapeHtml(p.id) + '"><div class="models-main"><strong>' + escapeHtml(p.name) + "</strong> " +
          '<span class="note">' + escapeHtml(p.provider + " · " + (p.model || "?")) + " · " + escapeHtml(p.apiKey ? t("modelsRowKeyOk") : t("modelsRowKeyMissing")) +
          (n ? " · " + escapeHtml(t("modelsRowUsed", { n: n })) : "") + "</span></div>" +
          '<div class="row"><button type="button" class="btn models-edit" data-id="' + escapeHtml(p.id) + '">' + escapeHtml(t("modelsEditBtn")) + "</button>" +
          '<button type="button" class="btn models-del" data-id="' + escapeHtml(p.id) + '">' + escapeHtml(modelsDeleteArmed === p.id ? t("modelsDeleteConfirm", { n: n }) : t("modelsDeleteBtn")) + "</button></div></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll(".models-edit"), function (b) {
      b.addEventListener("click", function () { openModelForm(b.getAttribute("data-id")); });
    });
    Array.prototype.forEach.call(box.querySelectorAll(".models-del"), function (b) {
      b.addEventListener("click", function () { deleteModelProfile(b.getAttribute("data-id")); });
    });
  }

  function openModelForm(id) {
    modelsEditingId = id || null;
    var p = id ? modelProfileById(id) : null;
    var sel = document.getElementById("modelFormProvider");
    if (!sel.options.length) sel.innerHTML = document.getElementById("providerSelect").innerHTML;
    document.getElementById("modelFormName").value = p ? p.name : "";
    sel.value = p ? p.provider : "anthropic";
    document.getElementById("modelFormModel").value = p ? p.model : "";
    document.getElementById("modelFormBaseUrl").value = p ? p.baseUrl : "";
    document.getElementById("modelFormKey").value = "";
    document.getElementById("modelFormBaseField").hidden = sel.value !== "custom";
    document.getElementById("modelFormKeyNote").textContent = p && p.apiKey ? t("modelsFormKeyKeep") : t("modelsFormKeyNew");
    document.getElementById("modelFormStatus").textContent = "";
    document.getElementById("modelForm").hidden = false;
    document.getElementById("modelFormName").focus();
  }

  function closeModelForm() {
    modelsEditingId = null;
    document.getElementById("modelForm").hidden = true;
  }

  function modelFormValues() {
    var existing = modelsEditingId ? modelProfileById(modelsEditingId) : null;
    var typed = document.getElementById("modelFormKey").value.trim();
    var provider = document.getElementById("modelFormProvider").value;
    return {
      id: modelsEditingId || "",
      name: document.getElementById("modelFormName").value.trim(),
      provider: provider,
      model: document.getElementById("modelFormModel").value.trim() || DEFAULT_MODEL[provider] || "",
      baseUrl: provider === "custom" ? document.getElementById("modelFormBaseUrl").value.trim() : "",
      apiKey: typed || (existing ? existing.apiKey : ""),
      typedKey: Boolean(typed),
    };
  }

  function saveModelProfile() {
    var v = modelFormValues();
    var typed = v.typedKey;
    delete v.typedKey;
    var knownIds = modelProfiles().map(function (m) { return m.id; });
    window.rundbord.saveModel(v).then(function (s) {
      store = s;
      var count = window.RundbordModels.usage(store, v.id || "");
      emitEvent("model.saved", null, {}, { provider: v.provider, isNew: !v.id, hasKey: Boolean(v.apiKey), seats: count, keyChanged: typed });
      closeModelForm();
      render();
      renderModelsList();
      // Er profilen lavet fra en stol, vælges den på stolen, og man står ved modellen igen.
      if (modelsReturnToSeat && !document.getElementById("seatPanel").hidden) {
        var made = modelProfiles().filter(function (m) { return knownIds.indexOf(m.id) < 0; })[0];
        modelsReturnToSeat = false;
        document.getElementById("modelsPanel").hidden = true;
        fillSeatModelSelect(null, made ? made.id : v.id);
        document.getElementById("modelInput").focus();
      }
    });
  }

  function testModelProfile() {
    var v = modelFormValues();
    var status = document.getElementById("modelFormStatus");
    if (!v.apiKey) {
      status.textContent = t("modelsNeedKey");
      return;
    }
    status.textContent = t("modelsTesting");
    window.rundbord.testSeat({ id: "model-test", name: "Test", provider: v.provider, model: v.model, baseUrl: v.baseUrl, apiKey: v.apiKey }).then(function (res) {
      status.textContent = res && res.ok ? t("modelsTestOk") : t("modelsTestFail", { message: (res && res.message) || t("unknownError") });
    });
  }

  function deleteModelProfile(id) {
    if (modelsDeleteArmed !== id) {
      modelsDeleteArmed = id;
      renderModelsList();
      setTimeout(function () {
        if (modelsDeleteArmed === id) {
          modelsDeleteArmed = null;
          renderModelsList();
        }
      }, 4000);
      return;
    }
    modelsDeleteArmed = null;
    var n = window.RundbordModels.usage(store, id);
    window.rundbord.deleteModel(id).then(function (s) {
      store = s;
      emitEvent("model.deleted", null, {}, { seats: n });
      render();
      renderModelsList();
    });
  }

  // fromSeat: åbnet fra stolens panel, som så bliver stående (intet, du har skrevet dér, går tabt).
  function openModelsPanel(fromSeat) {
    modelsReturnToSeat = fromSeat === true;
    ["settingsPanel", modelsReturnToSeat ? "" : "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "apiNeededPanel"].forEach(function (id) {
      var el = id && document.getElementById(id);
      if (el) el.hidden = true;
    });
    closeModelForm();
    renderModelsList();
    document.getElementById("modelsPanel").hidden = false;
    if (modelsReturnToSeat && !modelProfiles().length) openModelForm(null);
  }

  // Finder en Modelprofil API med samme udbyder og nøgle, eller laver en (se RundbordModels.ensureProfile). → løfte med profilens id ("" uden nøgle)
  function ensureModelProfile(spec) {
    var res = window.RundbordModels.ensureProfile(modelProfiles(), spec);
    if (!res.id || modelProfileById(res.id)) return Promise.resolve(res.id);
    var p = res.models.filter(function (m) { return m.id === res.id; })[0];
    return window.rundbord.saveModel(p).then(function (s) {
      store = s;
      return res.id;
    });
  }

  // Den ene OpenRouter-nøgle, brugeren sætter op første gang: gemmes som Modelprofil API med en billig standardmodel (fra OpenRouters startforslag).
  // Alle stole uden eget valg og Tredje øje bruger den, så nøglen aldrig skal sættes på hver stol. Har profilen allerede en model, rører vi den ikke.
  // → løfte med profilens id
  function ensureDefaultOpenRouter(key, starter) {
    return ensureModelProfile({ provider: "openrouter", baseUrl: "", apiKey: key }).then(function (id) {
      var p = id ? modelProfileById(id) : null;
      if (!p || p.model) return id;
      var list = Array.isArray(starter) ? starter : [];
      var cheap = list.filter(function (r) { return r.tier === "cheap" && r.model; })[0] || list.filter(function (r) { return r.model; })[0];
      if (!cheap) return id;
      return window.rundbord.saveModel(Object.assign({}, p, { model: cheap.model })).then(function (s) {
        store = s;
        return id;
      });
    });
  }

  // ---- Valget på stolen ----
  // Stolen har kun et valg af Modelprofil API (udbyder, adresse og nøgle) og en model; nøglefeltet findes ikke på stolen.
  function fillSeatModelSelect(seat, preselectId) {
    var sel = document.getElementById("seatModelSelect");
    var list = modelProfiles();
    var want = preselectId || (seat && seat.modelId) || "";
    sel.innerHTML = '<option value="">' + escapeHtml(t("seatModelChoose")) + "</option>" + list.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name + " · " + p.provider) + "</option>"; }).join("");
    sel.value = want && modelProfileById(want) ? want : "";
    applySeatModelChoice();
  }

  // Valgt en profil, følger udbyder og adresse den (de skjulte felter styrer modelforslag og Hent modeller).
  function applySeatModelChoice() {
    var p = seatModelProfile();
    var note = document.getElementById("seatModelNote");
    document.getElementById("seatModelError").hidden = true;
    if (p) {
      document.getElementById("providerSelect").value = p.provider;
      document.getElementById("baseUrlInput").value = p.baseUrl || "";
      document.getElementById("modelInput").placeholder = p.model || DEFAULT_MODEL[p.provider] || t("defaultModelNamePlaceholder");
      if (typeof updateModelSuggestions === "function") updateModelSuggestions(p.provider);
      note.textContent = t("seatModelUsing", { name: p.name, provider: p.provider });
    } else {
      note.textContent = modelProfiles().length ? t("seatModelHint") : t("seatModelNone");
    }
  }

  function seatModelProfile() {
    var sel = document.getElementById("seatModelSelect");
    return sel && sel.value ? modelProfileById(sel.value) : null;
  }

  // ---- API mangler ----
  function apiMissingList(seats) {
    return window.RundbordModels.missingApi(seats || currentBoard().seats, store.models);
  }

  // Før bordet starter: mangler nogen stole API, vises hvad der mangler, og hvordan man kommer videre.
  function openApiNeeded(miss) {
    if (typeof fillKeyExplain === "function") fillKeyExplain();
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "modelsPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var none = !modelProfiles().length;
    document.getElementById("apiNeededText").textContent = none ? t("apiNeededNoProfile") : t("apiNeededSomeSeats", { count: miss.length });
    document.getElementById("apiNeededList").innerHTML = miss
      .map(function (m) {
        return "<li><strong>" + escapeHtml(m.name) + "</strong> – " + escapeHtml(t("apiNeededReason_" + m.reason)) + "</li>";
      })
      .join("");
    emitEvent("api.needed", null, {}, { count: miss.length, noProfiles: none });
    document.getElementById("apiNeededPanel").hidden = false;
  }

  // Næste skridt mod et færdigt API: ingen profil → opret en; en stol mangler profil eller model → åbn stolen; en profil mangler nøgle → åbn profilerne.
  function apiSetupAction() {
    document.getElementById("apiNeededPanel").hidden = true;
    var miss = apiMissingList();
    if (!modelProfiles().length) {
      openModelsPanel(false);
      openModelForm(null);
      return;
    }
    var first = miss[0];
    var seat = first ? seatById(first.id) : null;
    if (seat && first.reason !== "key") openSeatPanel(seat);
    else openModelsPanel(false);
  }

  function renderApiMissingBar() {
    var bar = document.getElementById("apiMissingBar");
    if (!bar) return;
    var seats = currentBoard().seats;
    var miss = seats.length ? apiMissingList(seats) : [];
    bar.hidden = !miss.length;
    if (typeof renderEye === "function") renderEye();
    if (miss.length) document.getElementById("apiMissingText").textContent = t("apiMissingBar", { count: miss.length, names: miss.map(function (m) { return m.name; }).join(", ") });
  }

  function bindModels() {
    document.getElementById("openModelsBtn").addEventListener("click", function () { openModelsPanel(false); });
    document.getElementById("seatModelSetupBtn").addEventListener("click", function () { openModelsPanel(true); });
    document.getElementById("apiNeededSetupBtn").addEventListener("click", apiSetupAction);
    document.getElementById("apiNeededCloseBtn").addEventListener("click", function () { document.getElementById("apiNeededPanel").hidden = true; });
    document.getElementById("apiMissingBtn").addEventListener("click", function () { apiSetupAction(); });
    document.getElementById("closeModelsBtn").addEventListener("click", function () {
      document.getElementById("modelsPanel").hidden = true;
      if (modelsReturnToSeat && !document.getElementById("seatPanel").hidden) fillSeatModelSelect(null, document.getElementById("seatModelSelect").value);
      modelsReturnToSeat = false;
    });
    document.getElementById("modelsAddBtn").addEventListener("click", function () { openModelForm(null); });
    document.getElementById("modelFormSaveBtn").addEventListener("click", saveModelProfile);
    document.getElementById("modelFormCancelBtn").addEventListener("click", closeModelForm);
    document.getElementById("modelFormTestBtn").addEventListener("click", testModelProfile);
    document.getElementById("modelFormProvider").addEventListener("change", function () {
      document.getElementById("modelFormBaseField").hidden = this.value !== "custom";
    });
    document.getElementById("seatModelSelect").addEventListener("change", function () {
      // Skifter udbyderen, passer den gamle models navn ikke længere; feltet får den nye profils standardmodel (eller udbyderens), som man kan skifte.
      var before = document.getElementById("providerSelect").value;
      applySeatModelChoice();
      var p = seatModelProfile();
      if (p && before !== p.provider) document.getElementById("modelInput").value = p.model || DEFAULT_MODEL[p.provider] || "";
    });
  }
