// 04-seat-instructions.js
// Kompilerer en stols systeminstruktion, dials-UI og 'Hvem skal med'-panelet.

  function compileInstruction(rawSeat) {
    // Ikoner og dials er samme indstilling set fra to sider; instruktionen bygges ud fra de ryddede (se lib/seatsync.js)
    var synced = window.RundbordSeatSync.reconcile(null, rawSeat || {});
    var seat = Object.assign({}, rawSeat, { icons: synced.icons, dials: Object.keys(rawSeat && rawSeat.dials ? rawSeat.dials : {}).length ? synced.dials : rawSeat && rawSeat.dials });
    var dials = seat.dials || defaultDials();
    var lines = iconInstructionLines(seat);
    DIALS.forEach(function (dial) {
      var d = dials[dial.key] || {};
      var text = dial.describe(d.state, d.strength);
      if (!text) return;
      if (d.note && d.note.trim()) text += " — " + d.note.trim();
      lines.push("• " + text);
    });
    if (seat.customInstruction) {
      String(seat.customInstruction)
        .split("\n")
        .forEach(function (line) {
          if (line.trim()) lines.push("• " + line.trim() + t("approvedAdditionSuffix"));
        });
    }
    var base = t("seatIdentity", { name: seat.name });
    if (lines.length) base += "\n\n" + lines.join("\n");
    if (window.RundbordRoles.conceptOf(seat) === OUT_WRITER_ROLE) base += "\n\n" + t("outWriterInstruction");
    if (seat.checks) base += "\n\n" + t("verifyInstruction") + (currentBoard().requireEvidence === true ? "\n\n" + t("evidenceInstruction") : "");
    return (
      base + "\n\n" + t("readbackInstruction") + "\n\n" + t("capabilityBoundaryInstruction") +
      "\n\n" + buildNeedsSummaryInstruction(rawSeat)
    );
  }

  // Stolens systemprompt + (hvis den læser IN) materialet fra bordets IN-mappe.
  // Filerne læses friskt ved hvert kald, så nye filer straks er med.
  function buildSystemPrompt(seat, ctx) {
    var base = compileInstruction(seat);
    var memory = currentBoard().memory;
    var memoryBlock = window.RundbordMemory.buildBlock(memory, t);
    if (memoryBlock) {
      base += "\n\n" + memoryBlock;
      emitEvent("memory.injected", seat.id, ctx || {}, { items: window.RundbordMemory.normalize(memory).length, chars: memoryBlock.length });
    }
    if (!seat.readsIn) return Promise.resolve(base);
    return window.rundbord
      .filesReadIn(store.activeBoardId)
      .then(function (data) {
        if (!data || !data.files || !data.files.length) return base;
        emitEvent("in.material.injected", seat.id, ctx || {}, {
          files: data.files.length,
          chars: data.totalChars,
          skipped: (data.skipped || []).length,
        });
        return base + "\n\n" + window.RundbordIO.buildMaterialBlock(data, t);
      })
      .catch(function () {
        return base;
      });
  }

  // Kort, altid-synlig opsummering af hvilke dials der reelt påvirker
  // stolens opførsel lige nu — uden at brugeren skal åbne "Instruktioner
  // (avanceret)" for at se konsekvensen af sine valg. Bruges også direkte
  // af seatStatusRowHtml nedenfor.
  // Dials uden nogen egentlig "fra"-tilstand (de beskriver altid noget, se
  // describe() ovenfor) hører ikke hjemme i en "det her har du selv slået
  // til"-visning — de kan pr. definition aldrig forsvinde derfra igen.
  var DIALS_WITHOUT_OFF_STATE = ["action", "modifyRules"];

  function activeDials(seat) {
    var dials = seat.dials || defaultDials();
    return DIALS.filter(function (dial) {
      if (DIALS_WITHOUT_OFF_STATE.indexOf(dial.key) >= 0) return false;
      var d = dials[dial.key] || {};
      // Spørg dial'en selv om den reelt bidrager med en instruktionslinje
      // lige nu — samme afgørelse som compileInstruction bruger — i stedet
      // for at gætte ud fra strengen "off", som ikke gælder alle dials
      // (fx modifyRules bruger "no"/"suggest"/"yes").
      return Boolean(dial.describe(d.state, d.strength));
    });
  }

  function updateInstructionPreview() {
    var seatNameForPreview = selectedRoleName() || t("seatNameFallback");
    var currentSeat = editingSeatId ? seatById(editingSeatId) : null;
    var text = compileInstruction({
      name: seatNameForPreview,
      dials: editingDials,
      icons: currentSeat ? currentSeat.icons : defaultIcons(),
      customInstruction: editingAdditions.join("\n"),
    });
    document.getElementById("instructionPreview").textContent = text || t("noDialsActive");
    if (typeof refreshPresetUi === "function") refreshPresetUi();
  }

  // Én dial som række: navn, kort forklaring, tilstand (Fra/Til/Efter behov), styrke 1-10 og en valgfri note.
  function dialRowEl(dial) {
    var d = editingDials[dial.key];
    var row = document.createElement("div");
    row.className = "dial-row";
    row.setAttribute("data-dial", dial.key);
    var name = document.createElement("div");
    name.className = "dial-name";
    name.innerHTML = '<span class="dial-icon">' + dial.icon + "</span>" + escapeHtml(dialLabel(dial));
    row.appendChild(name);
    var explain = document.createElement("p");
    explain.className = "dial-explain";
    explain.textContent = t(dial.explainKey);
    row.appendChild(explain);
    var statesWrap = document.createElement("div");
    statesWrap.className = "dial-states";
    dial.states.forEach(function (stateKey) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dial-state-btn";
      btn.textContent = dialStateLabel(dial, stateKey);
      btn.setAttribute("aria-pressed", String(d.state === stateKey));
      btn.addEventListener("click", function () {
        editingDials[dial.key].state = stateKey;
        renderDials();
        updateInstructionPreview();
      });
      statesWrap.appendChild(btn);
    });
    row.appendChild(statesWrap);
    var on = d.state !== "off" && d.state !== "no";
    if (dial.hasStrength && d.state !== "off") {
      var strengthWrap = document.createElement("div");
      strengthWrap.className = "dial-strength";
      var slider = document.createElement("input");
      slider.type = "range";
      slider.min = "1";
      slider.max = "10";
      slider.step = "1";
      slider.value = String(d.strength || 6);
      slider.id = "dial-strength-" + dial.key;
      slider.setAttribute("aria-label", dialLabel(dial) + " " + t("dialStrengthLabel"));
      var out = document.createElement("span");
      out.textContent = slider.value + "/10";
      slider.addEventListener("input", function () {
        editingDials[dial.key].strength = parseInt(slider.value, 10);
        out.textContent = slider.value + "/10";
        updateInstructionPreview();
      });
      strengthWrap.appendChild(slider);
      strengthWrap.appendChild(out);
      row.appendChild(strengthWrap);
    }
    if (d.state !== "off") {
      var noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.className = "dial-note";
      noteInput.placeholder = t("dialNotePlaceholder", { dial: dialLabel(dial).toLowerCase() });
      noteInput.value = d.note || "";
      noteInput.addEventListener("input", function () {
        editingDials[dial.key].note = noteInput.value;
        updateInstructionPreview();
      });
      row.appendChild(noteInput);
    }
    return row;
  }

  // De ti dials i fire grupper. Hver gruppe viser, hvor mange der er aktive, og hvilke, uden at åbne den.
  var openDialGroups = {};

  function renderDials() {
    var wrap = document.getElementById("dialsContainer");
    wrap.innerHTML = "";
    var viewSeat = { dials: editingDials };
    DIAL_GROUPS.forEach(function (group) {
      var list = group.dials.map(dialByKey);
      var onList = list.filter(function (dial) {
        return dialIsOn(viewSeat, dial);
      });
      var det = document.createElement("details");
      det.className = "dial-group";
      det.setAttribute("data-group", group.key);
      det.open = Boolean(openDialGroups[group.key]);
      det.addEventListener("toggle", function () {
        openDialGroups[group.key] = det.open;
      });
      var sum = document.createElement("summary");
      sum.innerHTML =
        '<span class="dg-title">' + escapeHtml(t(group.titleKey)) + "</span>" +
        (typeof kindTagHtml === "function" ? kindTagHtml("style", "dg-kind") : "") +
        '<span class="dg-count">' + escapeHtml(t("dialGroupCount", { on: onList.length, total: list.length })) + "</span>" +
        '<span class="dg-sum">' +
        escapeHtml(
          onList.length
            ? onList
                .map(function (dial) {
                  return dialLabel(dial) + " " + dialStateText(viewSeat, dial).toLowerCase();
                })
                .join(" · ")
            : t("dialGroupNoneOn")
        ) +
        "</span>";
      det.appendChild(sum);
      list.forEach(function (dial) {
        det.appendChild(dialRowEl(dial));
      });
      wrap.appendChild(det);
    });
  }

  // Åbner dialens gruppe i stolens panel, ruller til dialen og markerer den kort, så du kan rette den selv ("Lad mig rette" på et behov).
  function focusSeatDial(key) {
    var group = DIAL_GROUPS.filter(function (g) {
      return g.dials.indexOf(key) >= 0;
    })[0];
    if (group) openDialGroups[group.key] = true;
    renderDials();
    var row = document.querySelector('#dialsContainer .dial-row[data-dial="' + key + '"]');
    if (!row) return;
    row.classList.add("dial-focus");
    if (row.scrollIntoView) row.scrollIntoView({ block: "center" });
    var btn = row.querySelector(".dial-state-btn");
    if (btn) btn.focus({ preventScroll: true });
    setTimeout(function () {
      row.classList.remove("dial-focus");
    }, 2400);
  }

  function buildRoleSelect() {
    var select = document.getElementById("roleSelect");
    select.innerHTML = "";
    ROLE_CATALOG.forEach(function (section) {
      var group = document.createElement("optgroup");
      group.label = t(section.group);
      section.roles.forEach(function (name) {
        var opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
    var mine = (store && store.roles) || [];
    if (mine.length) {
      var lib = document.createElement("optgroup");
      lib.label = t("roleGroupLibrary");
      mine.forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = "lib:" + r.id;
        opt.textContent = r.name + (r.concept ? " · " + r.concept : "");
        lib.appendChild(opt);
      });
      select.appendChild(lib);
    }
    var customOpt = document.createElement("option");
    customOpt.value = "__custom";
    customOpt.textContent = t("roleCustomOption");
    select.appendChild(customOpt);
  }

  // "+"-knappen ved bordet åbnede tidligere altid stolepanelet direkte med
  // "Builder" forudvalgt — denne gruppevise rolle-picker (samme ROLE_CATALOG
  // som roleSelect, bare som klikbare "chips") lader brugeren vælge rollen
  // FØRST, så det fulde panel åbner med den rigtige rolle allerede sat.
  function buildAddSeatPanel() {
    var wrap = document.getElementById("roleGroups");
    wrap.innerHTML = "";
    // Under Avanceret vælges et begreb her. Ellers er en ny stol bare en stol med et navn; kun «Skriver til OUT» kan vælges. Dine egne roller fra biblioteket står altid her.
    var advanced = currentUiLevel() === "advanced";
    document.getElementById("addSeatDesc").textContent = t(advanced ? "addSeatPanelDesc" : "addSeatPanelDescSimple");
    document.getElementById("addCustomRoleBtn").textContent = t(advanced ? "addCustomRoleBtn" : "addSeatNewBtn");
    document.getElementById("addSeatOutField").hidden = advanced;
    document.getElementById("addSeatOutCheck").checked = false;
    ROLE_CATALOG.forEach(function (section) {
      if (!advanced) return;
      var group = document.createElement("div");
      group.className = "role-group";
      var heading = document.createElement("p");
      heading.className = "role-group-heading";
      heading.textContent = t(section.group);
      group.appendChild(heading);
      var row = document.createElement("div");
      row.className = "role-chip-row";
      section.roles.forEach(function (name) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "role-chip-btn";
        btn.textContent = name;
        btn.addEventListener("click", function () {
          closeAddSeatPanel();
          openSeatPanel(null, name);
        });
        row.appendChild(btn);
      });
      group.appendChild(row);
      wrap.appendChild(group);
    });
    var mine = (store && store.roles) || [];
    if (mine.length) {
      var libGroup = document.createElement("div");
      libGroup.className = "role-group";
      var libHeading = document.createElement("p");
      libHeading.className = "role-group-heading";
      libHeading.textContent = t("roleGroupLibrary");
      libGroup.appendChild(libHeading);
      var libRow = document.createElement("div");
      libRow.className = "role-chip-row";
      mine.forEach(function (r) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "role-chip-btn";
        btn.textContent = r.name;
        btn.addEventListener("click", function () {
          closeAddSeatPanel();
          openSeatPanel(null, "lib:" + r.id);
        });
        libRow.appendChild(btn);
      });
      libGroup.appendChild(libRow);
      wrap.appendChild(libGroup);
    }
  }

  function openAddSeatPanel() {
    buildAddSeatPanel();
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("seatPanel").hidden = true;
    document.getElementById("pricePanel").hidden = true;
    document.getElementById("turnPanel").hidden = true;
    document.getElementById("proposalsPanel").hidden = true;
    document.getElementById("startConfirmPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = false;
  }

  function closeAddSeatPanel() {
    document.getElementById("addSeatPanel").hidden = true;
  }

  function updateModelSuggestions(provider) {
    setModelOptions(MODEL_SUGGESTIONS[provider] || []);
  }

  // Lille, ikke-påtrængende genvej til at hente en API-nøgle hos den valgte
  // udbyder — skjult for "custom", hvor der ikke findes ét fast sted.
  function updateApiKeyLink(provider) {
    var link = document.getElementById("apiKeyHelpLink");
    var url = PROVIDER_KEY_URL[provider];
    if (!url) {
      link.hidden = true;
      return;
    }
    link.hidden = false;
    link.dataset.url = url;
  }

  var store = { activeBoardId: null, boards: {}, priceTable: {}, locale: "da" };
  var status = {}; // seatId -> "ok" | "fail"
  var selectedColor = "denim";
  var editingSeatId = null;
  var selectedSpeakerId = null;
  var editingDials = null;

