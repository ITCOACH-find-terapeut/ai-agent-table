// 49-roledefaults.js
// Rollernes startindstillinger (lib/roledefaults.js): får en stol et begreb (ny stol, eller et nyt begreb på en eksisterende), viser en konsekvensgennemgang,
// hvad der ændres, og du vælger: brug rollens indstillinger, behold stolens egne, eller fortryd. Intet gemmes, før stolen gemmes.
// Menuen ⚙ → Hele programmet → Rollernes startindstillinger lader dig se og rette, hvad hver rolle sætter, og gendanne forslaget.

  var roleDefPrev = ""; // begrebet stolen havde, da panelet blev åbnet eller sidst bekræftet
  var rolePresetPending = null; // { concept, after } mens konsekvensgennemgangen står åben

  function roleDefLocale() {
    return store && store.locale === "en" ? "en" : "da";
  }

  function roleDefEffective(concept) {
    return window.RundbordRoleDefaults.effective(concept, store && store.roleDefaults, roleDefLocale());
  }

  // Stolens begreb, som det står i panelet ("" for et eget navn uden begreb)
  function roleDefConceptNow() {
    var v = document.getElementById("roleSelect").value;
    return !v || v === "__custom" || v.indexOf("lib:") === 0 ? "" : v;
  }

  // Stolens indstillinger, som de står i panelet lige nu (kladden), til sammenligning
  function roleDefDraft() {
    var existing = editingSeatId ? seatById(editingSeatId) : null;
    return {
      dials: JSON.parse(JSON.stringify(editingDials || defaultDials())),
      customInstruction: editingAdditions.join("\n"),
      checks: document.getElementById("checksCheckbox").checked,
      readsIn: document.getElementById("readsInCheckbox").checked,
      icons: existing ? existing.icons : defaultIcons(),
    };
  }

  function closeRolePreset() {
    rolePresetPending = null;
    document.getElementById("rolePresetOverlay").hidden = true;
  }

  // Et begreb er valgt (nyt, eller skiftet til). Er der ingen indstillinger til det, eller ændrer de intet, sker der intet; ellers vises konsekvensgennemgangen.
  function offerRolePreset(concept, isNew) {
    var prev = roleDefPrev;
    if (!concept) {
      roleDefPrev = "";
      return;
    }
    var next = roleDefEffective(concept);
    if (!next.preset) {
      roleDefPrev = concept;
      return;
    }
    var before = roleDefDraft();
    var after = window.RundbordRoleDefaults.apply(before, next.preset, prev ? roleDefEffective(prev).preset : null);
    var changes = window.RundbordSeatHistory.diff(before, after);
    if (!changes.length) {
      roleDefPrev = concept;
      return;
    }
    rolePresetPending = { concept: concept, after: after, builtinAfter: after, prev: prev, isNew: isNew };
    document.getElementById("rolePresetTitle").textContent = t("rolePresetTitle", { role: concept });
    document.getElementById("rolePresetIntro").textContent = t(isNew ? "rolePresetIntroNew" : "rolePresetIntro", { role: concept });
    renderRolePresetChanges(changes);
    rolePresetEyeReset();
    document.getElementById("rolePresetOverlay").hidden = false;
    document.getElementById("rolePresetApplyBtn").focus();
  }

  // Listen over ændringer og advarslerne (Selvstændighed, regler, pris) i konsekvensgennemgangen
  function renderRolePresetChanges(changes) {
    document.getElementById("rolePresetList").innerHTML = changes
      .map(function (c) {
        return "<li>" + escapeHtml(historyChangeText(c)) + "</li>";
      })
      .join("");
    var fl = window.RundbordRoleDefaults.flags(changes);
    var warn = [];
    if (fl.autonomy) warn.push(t("rolePresetWarnAutonomy"));
    if (fl.rules) warn.push(t("rolePresetWarnRules"));
    if (fl.cost) warn.push(t("rolePresetWarnCost"));
    var warnEl = document.getElementById("rolePresetWarn");
    warnEl.textContent = warn.join(" ");
    warnEl.hidden = !warn.length;
  }

  // ---- Tredje øje foreslår: kun efter dit ja, med forhåndsvisning af det sendte; forslaget vises som ændringer, og intet anvendes før dit valg ----

  function rolePresetEyeSeat() {
    var seat = typeof thirdEyeSeat === "function" ? thirdEyeSeat() : null;
    return seat && seat.apiKey ? seat : null;
  }

  function rolePresetEyeReset() {
    var box = document.getElementById("rolePresetEyeBox");
    box.hidden = !rolePresetEyeSeat();
    document.getElementById("rolePresetWhy").hidden = true;
    document.getElementById("rolePresetBuiltinBtn").hidden = true;
    document.getElementById("rolePresetEyePreview").hidden = true;
    document.getElementById("rolePresetEyeBtn").hidden = false;
    document.getElementById("rolePresetEyeBtn").disabled = false;
    document.getElementById("rolePresetEyeStatus").textContent = "";
  }

  function rolePresetEyeRequest() {
    return window.RundbordRoleDefaults.buildProposalRequest(rolePresetPending.concept, editingAdditions, roleDefLocale());
  }

  function rolePresetEyeOpen() {
    if (!rolePresetPending) return;
    var seat = rolePresetEyeSeat();
    var status = document.getElementById("rolePresetEyeStatus");
    if (!seat) {
      status.textContent = t("rolePresetEyeNoModel");
      return;
    }
    var req = rolePresetEyeRequest();
    var tokens = window.RundbordGuide ? window.RundbordGuide.estimateTokens(req.system + req.user) : 0;
    status.textContent = "";
    document.getElementById("rolePresetEyeText").textContent = t("rolePresetEyePreview", { model: seat.model || seat.name, tokens: tokens });
    document.getElementById("rolePresetEyeSent").textContent = req.user;
    document.getElementById("rolePresetEyePreview").hidden = false;
    document.getElementById("rolePresetEyeBtn").hidden = true;
  }

  function rolePresetEyeCancel() {
    document.getElementById("rolePresetEyePreview").hidden = true;
    document.getElementById("rolePresetEyeBtn").hidden = false;
  }

  function rolePresetEyeSend() {
    var p = rolePresetPending;
    var seat = rolePresetEyeSeat();
    var status = document.getElementById("rolePresetEyeStatus");
    var sendBtn = document.getElementById("rolePresetEyeSendBtn");
    if (!p || !seat || sendBtn.disabled) return Promise.resolve();
    var req = rolePresetEyeRequest();
    sendBtn.disabled = true;
    status.textContent = t("rolePresetEyeAsking");
    document.getElementById("rolePresetEyePreview").hidden = true;
    return streamReplyInto(seat, [{ role: "user", content: req.user }], req.system, document.createElement("span"), null)
      .then(function (res) {
        recordCall(seat, res, "roleProposal", {});
        if (rolePresetPending !== p) return;
        if (!res || !res.ok) {
          status.textContent = t("rolePresetEyeFailed", { message: (res && res.message) || t("unknownError") });
          document.getElementById("rolePresetEyeBtn").hidden = false;
          return;
        }
        var parsed = window.RundbordRoleDefaults.parseProposal(res.reply);
        if (!parsed) {
          status.textContent = t("rolePresetEyeUnusable");
          document.getElementById("rolePresetEyeBtn").hidden = false;
          return;
        }
        // Forslaget lægges oven på stolens indstillinger, som de står nu (rollens egne linjer fra den forrige rolle fjernes som før)
        var before = roleDefDraft();
        var after = window.RundbordRoleDefaults.apply(before, parsed.preset, p.prev ? roleDefEffective(p.prev).preset : null);
        var changes = window.RundbordSeatHistory.diff(before, after);
        if (!changes.length) {
          status.textContent = t("rolePresetEyeNothing");
          document.getElementById("rolePresetEyeBtn").hidden = false;
          return;
        }
        p.after = after;
        renderRolePresetChanges(changes);
        var why = document.getElementById("rolePresetWhy");
        why.textContent = t("rolePresetEyeWhy", { why: parsed.why || "–" });
        why.hidden = false;
        document.getElementById("rolePresetBuiltinBtn").hidden = false;
        document.getElementById("rolePresetEyeBtn").hidden = true;
        status.textContent = t("rolePresetEyeDone");
        emitEvent("role.preset.proposed", editingSeatId || null, runCtx, { role: p.concept });
      })
      .finally(function () {
        sendBtn.disabled = false;
      });
  }

  // Tilbage til appens eget forslag (hvis Tredje øjes forslag ikke er det, du vil have)
  function rolePresetUseBuiltin() {
    var p = rolePresetPending;
    if (!p) return;
    p.after = p.builtinAfter;
    renderRolePresetChanges(window.RundbordSeatHistory.diff(roleDefDraft(), p.after));
    rolePresetEyeReset();
  }

  function applyRolePreset() {
    var p = rolePresetPending;
    if (!p) return;
    editingDials = p.after.dials;
    editingAdditions = String(p.after.customInstruction || "").split("\n").filter(function (l) { return l.trim(); });
    document.getElementById("checksCheckbox").checked = Boolean(p.after.checks);
    document.getElementById("readsInCheckbox").checked = Boolean(p.after.readsIn);
    roleDefPrev = p.concept;
    closeRolePreset();
    renderDials();
    renderSeatAdditions();
    if (typeof refreshPresetUi === "function") refreshPresetUi();
    document.getElementById("seatChangesDetails").open = editingAdditions.length > 0;
    updateInstructionPreview();
    if (typeof setPanelDirty === "function") setPanelDirty("seatPanel", true);
    emitEvent("role.preset.applied", editingSeatId || null, runCtx, { role: p.concept });
  }

  function keepSeatSettings() {
    var p = rolePresetPending;
    if (!p) return;
    roleDefPrev = p.concept;
    closeRolePreset();
    emitEvent("role.preset.kept", editingSeatId || null, runCtx, { role: p.concept });
  }

  // Fortryd: begrebet i panelet sættes tilbage til det, stolen havde.
  function cancelRolePreset() {
    if (!rolePresetPending) return;
    var sel = document.getElementById("roleSelect");
    sel.value = roleDefPrev || "__custom";
    closeRolePreset();
    updateInstructionPreview();
  }

  // Kaldes, når seat-panelet er åbnet: husk begrebet, og tilbyd en ny stol rollens indstillinger.
  function rolePresetOnOpen(seat) {
    closeRolePreset();
    var concept = roleDefConceptNow();
    roleDefPrev = seat ? concept : "";
    if (!seat && concept) offerRolePreset(concept, true);
  }

  // Kaldes, når begrebet skiftes på listen eller vælges fra rollebiblioteket.
  function rolePresetOnChange() {
    if (!editingSeatId && !rolePresetPending && !roleDefPrev && !roleDefConceptNow()) return;
    offerRolePreset(roleDefConceptNow(), !editingSeatId);
  }

  // ---- Menuen: Rollernes startindstillinger ----

  function roleDefConcepts() {
    var out = [];
    ROLE_CATALOG.forEach(function (section) {
      section.roles.forEach(function (r) {
        out.push(r);
      });
    });
    return out;
  }

  function roleDefDial(key) {
    return DIALS.filter(function (d) {
      return d.key === key;
    })[0];
  }

  function roleDefSelectHtml(attr, value, options) {
    return (
      "<select " + attr + ">" +
      options
        .map(function (o) {
          return '<option value="' + escapeHtml(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + escapeHtml(o[1]) + "</option>";
        })
        .join("") +
      "</select>"
    );
  }

  function roleDefTri(v) {
    return v === true ? "on" : v === false ? "off" : "";
  }

  function renderRoleDefaultsEditor() {
    var sel = document.getElementById("roleDefConcept");
    var box = document.getElementById("roleDefEditor");
    if (!sel || !box || !store) return;
    if (!sel.options.length) {
      sel.innerHTML = roleDefConcepts()
        .map(function (c) {
          return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + "</option>";
        })
        .join("");
      sel.value = "Reviewer";
    }
    var concept = sel.value;
    var eff = roleDefEffective(concept);
    var p = eff.preset || { dials: {}, additions: [], checks: null, readsIn: null };
    document.getElementById("roleDefSource").textContent = t(eff.source === "own" ? "roleDefSourceOwn" : eff.source === "builtin" ? "roleDefSourceBuiltin" : "roleDefSourceNone");
    document.getElementById("roleDefResetBtn").disabled = eff.source !== "own";
    var html = "";
    window.RundbordRoleDefaults.DIAL_KEYS.forEach(function (key) {
      var dial = roleDefDial(key);
      var spec = window.RundbordRoleDefaults.SPECS[key];
      var cur = p.dials[key] || null;
      var states = [["", t("roleDefUnchanged")]].concat(
        spec.states.map(function (s) {
          return [s, dialStateLabel(dial, s) || s];
        })
      );
      var strengths = [];
      for (var i = 1; i <= 10; i++) strengths.push([String(i), String(i)]);
      html +=
        '<div class="roledef-row"><span class="roledef-label">' + escapeHtml(dialLabel(dial)) + "</span>" +
        roleDefSelectHtml('class="roledef-state" data-dial="' + key + '" aria-label="' + escapeHtml(dialLabel(dial)) + '"', cur ? cur.state : "", states) +
        (spec.hasStrength ? roleDefSelectHtml('class="roledef-strength" data-strength="' + key + '" aria-label="' + escapeHtml(dialLabel(dial) + " " + t("roleDefStrength")) + '"', cur && cur.strength ? cur.strength : 6, strengths) : "") +
        "</div>";
    });
    var tri = [["", t("roleDefUnchanged")], ["on", t("roleDefOn")], ["off", t("roleDefOff")]];
    html +=
      '<div class="roledef-row"><label class="roledef-label" for="roleDefChecks">' + escapeHtml(t("roleDefChecksLabel")) + "</label>" +
      roleDefSelectHtml('id="roleDefChecks"', roleDefTri(p.checks), tri) + "</div>" +
      '<div class="roledef-row"><label class="roledef-label" for="roleDefReadsIn">' + escapeHtml(t("roleDefReadsInLabel")) + "</label>" +
      roleDefSelectHtml('id="roleDefReadsIn"', roleDefTri(p.readsIn), tri) + "</div>" +
      '<label for="roleDefAdditions">' + escapeHtml(t("roleDefAdditionsLabel")) + "</label>" +
      '<textarea id="roleDefAdditions" rows="4" maxlength="1800" spellcheck="true">' + escapeHtml(p.additions.join("\n")) + "</textarea>";
    box.innerHTML = html;
  }

  function roleDefRead() {
    var preset = { dials: {}, additions: document.getElementById("roleDefAdditions").value, checks: null, readsIn: null };
    Array.prototype.forEach.call(document.querySelectorAll("#roleDefEditor .roledef-state"), function (el) {
      var key = el.getAttribute("data-dial");
      if (!el.value) return;
      var d = { state: el.value };
      var st = document.querySelector('#roleDefEditor .roledef-strength[data-strength="' + key + '"]');
      if (st && el.value !== "off") d.strength = Number(st.value);
      preset.dials[key] = d;
    });
    var c = document.getElementById("roleDefChecks").value;
    var r = document.getElementById("roleDefReadsIn").value;
    preset.checks = c === "on" ? true : c === "off" ? false : null;
    preset.readsIn = r === "on" ? true : r === "off" ? false : null;
    return preset;
  }

  function saveRoleDefaults() {
    var concept = document.getElementById("roleDefConcept").value;
    window.rundbord.setRoleDefault(concept, roleDefRead()).then(function (s) {
      store = s;
      renderRoleDefaultsEditor();
      document.getElementById("roleDefStatus").textContent = t("roleDefSaved", { role: concept });
      emitEvent("role.default.saved", null, runCtx, { role: concept });
    });
  }

  function resetRoleDefaults() {
    var concept = document.getElementById("roleDefConcept").value;
    window.rundbord.setRoleDefault(concept, null).then(function (s) {
      store = s;
      renderRoleDefaultsEditor();
      document.getElementById("roleDefStatus").textContent = t("roleDefReset", { role: concept });
      emitEvent("role.default.reset", null, runCtx, { role: concept });
    });
  }

  function bindRoleDefaults() {
    var sel = document.getElementById("roleDefConcept");
    if (!sel) return;
    sel.addEventListener("change", function () {
      document.getElementById("roleDefStatus").textContent = "";
      renderRoleDefaultsEditor();
    });
    document.getElementById("roleDefSaveBtn").addEventListener("click", saveRoleDefaults);
    document.getElementById("roleDefResetBtn").addEventListener("click", resetRoleDefaults);
    document.getElementById("rolePresetApplyBtn").addEventListener("click", applyRolePreset);
    document.getElementById("rolePresetEyeBtn").addEventListener("click", rolePresetEyeOpen);
    document.getElementById("rolePresetEyeCancelBtn").addEventListener("click", rolePresetEyeCancel);
    document.getElementById("rolePresetEyeSendBtn").addEventListener("click", rolePresetEyeSend);
    document.getElementById("rolePresetBuiltinBtn").addEventListener("click", rolePresetUseBuiltin);
    document.getElementById("rolePresetKeepBtn").addEventListener("click", keepSeatSettings);
    document.getElementById("rolePresetCancelBtn").addEventListener("click", cancelRolePreset);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && rolePresetPending) {
        e.stopPropagation();
        cancelRolePreset();
      }
    });
    renderRoleDefaultsEditor();
  }
