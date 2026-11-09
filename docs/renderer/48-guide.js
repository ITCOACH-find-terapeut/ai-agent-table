// 48-guide.js
// Startguide i velkomsten (lib/guide.js): en opgave i egne ord + tre spørgsmål giver et forslag til bord, tænkning og visning, som brugeren kan ændre, før noget oprettes.
// Forslaget laves af faste regler, uden modelkald. Først når brugeren selv beder om det, og har set præcis hvad der sendes og et overslag over prisen, læser Tredje øje opgaven (ét kald)
// og kan rette bord og tænkning. Svaret godtages kun, hvis det er et kendt valg. Visningen afgøres altid af brugerens egne svar.

  function guideEl(id) {
    return document.getElementById(id);
  }

  function guideCap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function guideAnswers() {
    var a = {};
    window.RundbordGuide.QUESTIONS.forEach(function (q) {
      var el = guideEl("guideSel_" + q.key);
      a[q.key] = el ? el.value : undefined;
    });
    return window.RundbordGuide.cleanAnswers(a);
  }

  function openGuideForm() {
    var keep = guideAnswers();
    guideEl("guideQuestions").innerHTML = window.RundbordGuide.QUESTIONS
      .map(function (q) {
        return (
          '<div class="field"><label for="guideSel_' + q.key + '">' + escapeHtml(t("guideQ_" + q.key)) + '</label><select id="guideSel_' + q.key + '" class="locale-select">' +
          q.options.map(function (o) {
            return '<option value="' + o + '"' + (keep[q.key] === o ? " selected" : "") + ">" + escapeHtml(t("guideA_" + q.key + "_" + o)) + "</option>";
          }).join("") +
          "</select></div>"
        );
      })
      .join("");
    welcomeState.guide = null;
    guideEl("welcomeCards").hidden = true;
    guideEl("welcomeFooter").hidden = true;
    guideEl("welcomeDemoBox").hidden = true;
    guideEl("welcomeAskBox").hidden = true;
    guideEl("welcomeDetail").hidden = true;
    guideEl("welcomeGuide").hidden = false;
    guideEl("guideStatus").textContent = "";
    // Det, du skrev på første skærm, følger med ind i guiden (og står der, hvis du går tilbage)
    var typed = guideEl("welcomeAskTask").value;
    if (typed.trim()) guideEl("guideTask").value = typed;
    guideEl("guideTask").focus();
  }

  // Skabelonen med forudindstillingen lagt ovenpå (aldrig under) på arbejdsstolene; kontrolstolen røres ikke.
  function guideBuildSetup(sug) {
    var loc = welcomeLoc();
    var file = window.RundbordTemplates.get(sug.template, loc);
    var parsed = file && window.RundbordTableFile.parse(JSON.stringify(file), tableFileCtx());
    if (!parsed || !parsed.ok) return null;
    var specs = dialSpecs();
    parsed.setup.seats.forEach(function (seat) {
      if (seat.checks) return;
      var applied = window.RundbordAddons.applyPreset(seat.dials, sug.preset, specs);
      seat.dials = window.RundbordGuide.mergeUp(seat.dials, applied, window.RundbordAddons.PRESET_KEYS);
    });
    return parsed.setup;
  }

  function submitGuide() {
    var task = window.RundbordGuide.cleanTask(guideEl("guideTask").value);
    if (!task) {
      guideEl("guideStatus").textContent = t("guideNeedTask");
      return;
    }
    var sug = window.RundbordGuide.suggest(task, guideAnswers());
    var setup = guideBuildSetup(sug);
    if (!setup) {
      guideEl("guideStatus").textContent = t("tableImportError_notTableFile");
      return;
    }
    var card = { key: "guide", template: sug.template, title: t("guideDetailTitle"), line: "", task: task, example: [] };
    openWelcomeDetail(card, setup, { task: task, sug: sug, usages: [], sent: false });
  }

  function guideWhyText(kind, why) {
    var g = welcomeState.guide;
    if (why === "user") return t("guideWhyUser");
    if (String(why || "").indexOf("model:") === 0) return t("guideWhyModel", { text: why.slice(6) });
    if (kind === "template") return t("guideWhyTemplate_" + (why === "default" ? "default" : String(why).replace("rule:", "")));
    if (kind === "preset") return t("guideWhyPreset_answers") + (g.sug.preset === "fast" ? " " + t("guideWhyPreset_fastNote") : "");
    return t("guideWhyLevel_" + g.sug.level);
  }

  function renderGuideProposal() {
    var g = welcomeState.guide;
    if (!g) return;
    var sug = g.sug;
    var loc = welcomeLoc();
    var Guide = window.RundbordGuide;
    guideEl("guideTemplateSelect").innerHTML = window.RundbordTemplates.list(loc)
      .filter(function (x) { return Guide.TEMPLATE_KEYS.indexOf(x.key) >= 0; })
      .map(function (x) { return '<option value="' + x.key + '">' + escapeHtml(x.name) + "</option>"; })
      .join("");
    guideEl("guideTemplateSelect").value = sug.template;
    guideEl("guidePresetSelect").innerHTML = Guide.PRESET_KEYS.map(function (k) { return '<option value="' + k + '">' + escapeHtml(t("preset" + guideCap(k))) + "</option>"; }).join("");
    guideEl("guidePresetSelect").value = sug.preset;
    guideEl("guideLevelSelect").innerHTML = Guide.LEVELS.map(function (k) { return '<option value="' + k + '">' + escapeHtml(t("uiLevel" + guideCap(k))) + "</option>"; }).join("");
    guideEl("guideLevelSelect").value = sug.level;
    // Med almindelige ord: hvad der sker, hvor mange stole der kaldes, og hvad du får ud af det (bordtypens egen beskrivelse, ikke noget opdigtet)
    var tpl = window.RundbordTemplates.list(loc).filter(function (x) { return x.key === sug.template; })[0];
    var plan = guideBuildSetup(sug);
    guideEl("guidePlanWhat").textContent = tpl ? t("guidePlanWhat", { name: tpl.name, desc: tpl.desc }) : "";
    var planSeats = plan && plan.seats ? plan.seats : [];
    var planChecks = planSeats.some(function (s) { return s.checks; });
    guideEl("guidePlanCalls").textContent = planSeats.length
      ? t(planChecks ? "guidePlanCallsChecks" : "guidePlanCalls", { n: planSeats.length, names: planSeats.map(function (s) { return s.role; }).join(", ") })
      : "";
    guideEl("guideWhyTemplate").textContent = guideWhyText("template", sug.templateWhy);
    guideEl("guideWhyPreset").textContent = guideWhyText("preset", sug.presetWhy);
    guideEl("guideWhyLevel").textContent = sug.levelWhy === "user" ? t("guideWhyUser") : guideWhyText("level", sug.levelWhy);
    guideEl("guideSource").textContent = t(sug.source === "model" ? "guideSourceModel" : "guideSourceRules");
    guideEl("guideAskBtn").hidden = false;
    guideEl("guideAskPreview").hidden = true;
  }

  // Brugerens eget valg i en af de tre vælgere: bordet bygges om, og modellerne vises igen, hvis de er hentet.
  function guideChoose(kind, value) {
    var g = welcomeState.guide;
    if (!g) return;
    var Guide = window.RundbordGuide;
    if (kind === "template") {
      g.sug.template = Guide.validChoice("template", value, g.sug.template);
      g.sug.templateWhy = "user";
    } else if (kind === "preset") {
      g.sug.preset = Guide.validChoice("preset", value, g.sug.preset);
      g.sug.presetWhy = "user";
    } else {
      g.sug.level = Guide.validChoice("level", value, g.sug.level);
      g.sug.levelWhy = "user";
    }
    if (kind !== "level") guideRebuild();
    renderGuideProposal();
  }

  function guideRebuild() {
    var setup = guideBuildSetup(welcomeState.guide.sug);
    if (!setup) return;
    var old = welcomeState.setup;
    if (old && old.maxRunCostUsd && !setup.maxRunCostUsd) setup.maxRunCostUsd = old.maxRunCostUsd;
    welcomeState.setup = setup;
    if (welcomeState.starter) renderWelcomeRows();
  }

  // Modellen og prisen til ét kald: den billige model fra startforslaget (som arbejdsstolene), med OpenRouters egen pris
  function guideCallPlan() {
    var st = welcomeState;
    var g = st.guide;
    if (!g || !st.starter || !st.key) return null;
    var loc = welcomeLoc();
    var request = window.RundbordGuide.buildRequest(g.task, loc, window.RundbordTemplates.list(loc));
    var model = window.RundbordWelcome.assignModels([{ checks: false }], st.starter)[0];
    if (!model) return null;
    var row = st.starter.filter(function (x) { return x.model === model; })[0];
    var cost = row ? window.RundbordGuide.estimateCostUsd(request, row.inPerM, row.outPerM) : null;
    return { request: request, model: model, cost: cost };
  }

  function guideAskOpen() {
    var status = guideEl("guideAskStatus");
    var plan = guideCallPlan();
    if (!plan) {
      status.textContent = t("guideAskNeedModels");
      return;
    }
    status.textContent = "";
    var price = plan.cost == null ? t("guidePriceUnknown") : t("guidePriceApprox", { amount: plan.cost < 0.0001 ? "< 0,0001" : plan.cost.toFixed(4) });
    guideEl("guideAskText").textContent = t("guideAskPreview", { model: plan.model, price: price });
    guideEl("guideAskTask").textContent = welcomeState.guide.task;
    guideEl("guideAskBtn").hidden = true;
    guideEl("guideAskPreview").hidden = false;
  }

  function guideAskCancel() {
    guideEl("guideAskPreview").hidden = true;
    guideEl("guideAskBtn").hidden = false;
  }

  function guideAskSend() {
    var st = welcomeState;
    var g = st.guide;
    var plan = guideCallPlan();
    var status = guideEl("guideAskStatus");
    if (!g || !plan) return;
    var seat = { id: THIRD_EYE_SEAT_ID, name: t("thirdEyeLabel"), provider: "openrouter", baseUrl: "", apiKey: st.key, model: plan.model, color: "slate", calls: [] };
    g.sent = true;
    guideEl("guideAskPreview").hidden = true;
    status.textContent = t("guideAsking");
    guideEl("guideAskSendBtn").disabled = true;
    return streamReplyInto(seat, [{ role: "user", content: plan.request.user }], plan.request.system, document.createElement("span"), null)
      .then(function (res) {
        if (res && res.usage) g.usages.push({ usage: res.usage, durationMs: typeof res.durationMs === "number" ? res.durationMs : null });
        if (!res || !res.ok) {
          status.textContent = t("guideModelFailed", { message: (res && res.message) || t("unknownError") });
          return;
        }
        var parsed = window.RundbordGuide.parseReply(res.reply);
        if (!parsed) {
          status.textContent = t("guideModelUnusable");
          return;
        }
        g.sug = window.RundbordGuide.withModel(g.sug, parsed);
        guideRebuild();
        renderGuideProposal();
        status.textContent = t("guideModelOk");
      })
      .finally(function () {
        guideEl("guideAskSendBtn").disabled = false;
        guideEl("guideAskBtn").hidden = false;
      });
  }

  // Efter at bordet er oprettet: Tredje øjes læsning bogføres på det nye bord (så prisen ikke går tabt), og visningen sættes til det, brugeren endte på.
  function applyGuideOutcome(st) {
    var g = st.guide;
    if (!g) return Promise.resolve();
    var chain = Promise.resolve();
    g.usages.forEach(function (u) {
      chain = chain.then(function () {
        return window.rundbord.recordUsage(store.activeBoardId, THIRD_EYE_SEAT_ID, u.usage, { purpose: "startGuide", taskId: null, runId: null, refMessageId: null, durationMs: u.durationMs }).then(function (s) {
          store = s;
        });
      });
    });
    return chain
      .then(function () {
        return window.rundbord.setUiLevel(g.sug.level);
      })
      .then(function (s) {
        store = s;
        applyUiLevel();
      });
  }

  function bindGuide() {
    guideEl("welcomeGuideBtn").addEventListener("click", openGuideForm);
    guideEl("guideSuggestBtn").addEventListener("click", submitGuide);
    guideEl("guideBackBtn").addEventListener("click", welcomeCardsView);
    guideEl("guideTemplateSelect").addEventListener("change", function () { guideChoose("template", this.value); });
    guideEl("guidePresetSelect").addEventListener("change", function () { guideChoose("preset", this.value); });
    guideEl("guideLevelSelect").addEventListener("change", function () { guideChoose("level", this.value); });
    guideEl("guideAskBtn").addEventListener("click", guideAskOpen);
    guideEl("guideAskCancelBtn").addEventListener("click", guideAskCancel);
    guideEl("guideAskSendBtn").addEventListener("click", guideAskSend);
  }
