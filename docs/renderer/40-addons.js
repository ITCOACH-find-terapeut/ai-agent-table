// 40-addons.js
// Add-ons: mærker (Stil, Kontrol, Regel), tre forudindstillinger i stedet for ti dials, og et blindt "Prøv med og uden".
// En forudindstilling ændrer kun udkastet i stolens panel; intet gemmes, før du trykker Gem. "Prøv med og uden" er to kald til stolens model,
// kun når du trykker, og svarene gemmes ikke i samtalen. Hændelserne har kun valg og antal, aldrig tekst.

  var tryOutState = null;

  function kindTagHtml(kind, extraClass) {
    var key = kind === "check" ? "Check" : kind === "rule" ? "Rule" : "Style";
    return '<span class="kind-tag ' + (extraClass || "") + '" data-kind="' + kind + '" title="' + escapeHtml(t("kind" + key + "Title")) + '">' + escapeHtml(t("kind" + key)) + "</span>";
  }

  function dialSpecs() {
    var out = {};
    DIALS.forEach(function (d) {
      out[d.key] = { states: d.states, hasStrength: d.hasStrength };
    });
    return out;
  }

  function dialNeutral() {
    var out = {};
    DIALS.forEach(function (d) {
      out[d.key] = d.states[0];
    });
    return out;
  }

  function currentPresetKey() {
    return window.RundbordAddons.detectPreset(editingDials, dialSpecs());
  }

  // Viser, hvilken forudindstilling stolen står på, og hvad den betyder (og ikke betyder).
  function refreshPresetUi() {
    var row = document.getElementById("presetRow");
    var hint = document.getElementById("presetHint");
    if (!row || !hint || !editingDials) return;
    var key = currentPresetKey();
    Array.prototype.forEach.call(row.querySelectorAll(".preset-btn"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-preset") === key ? "true" : "false");
    });
    hint.textContent = t("presetHint" + key.charAt(0).toUpperCase() + key.slice(1));
  }

  function applyPresetToDraft(key) {
    editingDials = window.RundbordAddons.applyPreset(editingDials, key, dialSpecs());
    renderDials();
    updateInstructionPreview();
    if (typeof setPanelDirty === "function") setPanelDirty("seatPanel", true);
    emitEvent("preset.applied", editingSeatId || null, runCtx, { preset: key });
  }

  // ---- Prøv med og uden ----

  function tryOutSeat() {
    return currentSeatDraft();
  }

  function fillTryOutChoices() {
    var sel = document.getElementById("tryOutWhich");
    var neutral = dialNeutral();
    var keys = window.RundbordAddons.activeKeys(editingDials, neutral);
    sel.innerHTML = "";
    keys.forEach(function (k) {
      var dial = dialByKey(k);
      if (!dial) return;
      var d = editingDials[k] || {};
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = dialLabel(dial) + " (" + dialStateText({ dials: editingDials }, dial) + ")";
      sel.appendChild(opt);
    });
    if (keys.length > 1) {
      var all = document.createElement("option");
      all.value = "__all";
      all.textContent = t("tryOutAll");
      sel.appendChild(all);
    }
    sel.disabled = !keys.length;
    return keys.length;
  }

  function updateTryOutCost() {
    var seat = tryOutSeat();
    var n = document.getElementById("tryOutWhich").options.length;
    var cost = document.getElementById("tryOutCost");
    var ready = Boolean(seat && seat.apiKey && seat.model);
    cost.textContent = !n ? t("tryOutNoneActive") : ready ? t("tryOutCost", { model: seat.model || seat.provider, seat: seat.name || "?" }) : t("tryOutNoKey");
    document.getElementById("tryOutRunBtn").disabled = !n || !ready || Boolean(tryOutState && tryOutState.running);
  }

  function openTryOut() {
    var box = document.getElementById("tryOut");
    box.hidden = false;
    tryOutState = null;
    document.getElementById("tryOutResult").hidden = true;
    document.getElementById("tryOutStatus").textContent = "";
    fillTryOutChoices();
    var task = document.getElementById("tryOutTask");
    if (!task.value.trim() && typeof diffTaskText === "function") task.value = diffTaskText();
    updateTryOutCost();
    if (box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
  }

  // Stolens systeminstruktion for et bestemt sæt dials, som den ville blive efter Gem (ikoner og dials gøres enige på samme måde som ved Gem).
  function tryOutSystem(draft, dials) {
    var existing = editingSeatId ? seatById(editingSeatId) : null;
    var raw = Object.assign({}, draft, { dials: dials });
    var synced = window.RundbordSeatSync.reconcile(existing || null, raw);
    return compileInstruction(Object.assign({}, raw, { icons: synced.icons, dials: synced.dials }));
  }

  function runTryOut() {
    var seat = tryOutSeat();
    var which = document.getElementById("tryOutWhich").value;
    var task = document.getElementById("tryOutTask").value.trim();
    var status = document.getElementById("tryOutStatus");
    if (!seat || !seat.apiKey || !which || !task || (tryOutState && tryOutState.running)) {
      if (!task) document.getElementById("tryOutTask").focus();
      return;
    }
    var neutral = dialNeutral();
    var withDials = JSON.parse(JSON.stringify(editingDials));
    var withoutDials = window.RundbordAddons.without(editingDials, which, neutral);
    var order = window.RundbordAddons.blindOrder(Math.random());
    tryOutState = { running: true, which: which, order: order, withDials: withDials, withoutDials: withoutDials, replies: {} };
    document.getElementById("tryOutResult").hidden = true;
    document.getElementById("tryOutRevealBox").hidden = true;
    document.getElementById("tryOutPickRow").hidden = false;
    document.getElementById("tryOutRunBtn").disabled = true;
    var variants = ["with", "without"];
    var next = function (i) {
      if (i >= variants.length) return Promise.resolve(true);
      var v = variants[i];
      status.textContent = t("tryOutRunning", { n: i + 1 });
      var sink = document.createElement("p");
      var system = tryOutSystem(seat, v === "with" ? withDials : withoutDials);
      return streamReplyInto(seat, [{ role: "user", content: task }], system, sink, function () {}).then(function (res) {
        recordCall(seat, res, "tryout", {});
        if (!res || !res.ok) {
          status.textContent = t("tryOutFailed") + " " + ((res && res.message) || "");
          return false;
        }
        tryOutState.replies[v] = shieldRestoreText(stripNeedsSummary(res.reply || "")).trim();
        return next(i + 1);
      });
    };
    next(0).then(function (ok) {
      tryOutState.running = false;
      updateTryOutCost();
      emitEvent("tryout.run", seat.id || null, runCtx, { scope: which === "__all" ? "all" : "one", ok: Boolean(ok) });
      if (!ok) return;
      status.textContent = t("tryOutHint");
      document.getElementById("tryOutTextA").textContent = tryOutState.replies[order.A];
      document.getElementById("tryOutTextB").textContent = tryOutState.replies[order.B];
      document.getElementById("tryOutResult").hidden = false;
    });
  }

  function whichLabel(which) {
    if (which === "__all") return t("tryOutAll");
    var dial = dialByKey(which);
    return dial ? dialLabel(dial) : which;
  }

  function pickTryOut(pick) {
    if (!tryOutState || !tryOutState.replies.with) return;
    var res = window.RundbordAddons.resolvePick(pick, tryOutState.order);
    tryOutState.pick = res;
    var label = whichLabel(tryOutState.which);
    var a = tryOutState.order.A === "with" ? t("tryOutWith", { dial: label }) : t("tryOutWithout", { dial: label });
    var b = tryOutState.order.B === "with" ? t("tryOutWith", { dial: label }) : t("tryOutWithout", { dial: label });
    document.getElementById("tryOutReveal").textContent = t("tryOutReveal", { a: a, b: b }) + " " + t(res === "with" ? "tryOutPickedWith" : res === "without" ? "tryOutPickedWithout" : "tryOutPickedNone");
    document.getElementById("tryOutKeepBtn").textContent = t("tryOutKeep", { dial: label });
    document.getElementById("tryOutDropBtn").textContent = t("tryOutDrop", { dial: label });
    document.getElementById("tryOutPickRow").hidden = true;
    document.getElementById("tryOutRevealBox").hidden = false;
    emitEvent("tryout.chosen", null, runCtx, { pick: res });
  }

  function finishTryOut(drop) {
    if (!tryOutState) return;
    if (drop) {
      editingDials = tryOutState.withoutDials;
      renderDials();
      updateInstructionPreview();
      if (typeof setPanelDirty === "function") setPanelDirty("seatPanel", true);
      document.getElementById("tryOutStatus").textContent = t("tryOutAppliedDrop");
    } else {
      document.getElementById("tryOutStatus").textContent = "";
    }
    emitEvent("tryout.decided", null, runCtx, { action: drop ? "dropped" : "kept" });
    document.getElementById("tryOutResult").hidden = true;
    document.getElementById("tryOutRevealBox").hidden = true;
    tryOutState = null;
    if (drop) fillTryOutChoices();
  }

  function bindAddons() {
    var row = document.getElementById("presetRow");
    if (!row) return;
    Array.prototype.forEach.call(row.querySelectorAll(".preset-btn"), function (b) {
      b.addEventListener("click", function () {
        applyPresetToDraft(b.getAttribute("data-preset"));
      });
    });
    document.getElementById("tryOutBtn").addEventListener("click", openTryOut);
    document.getElementById("tryOutCloseBtn").addEventListener("click", function () {
      document.getElementById("tryOut").hidden = true;
      tryOutState = null;
    });
    document.getElementById("tryOutRunBtn").addEventListener("click", runTryOut);
    document.getElementById("tryOutWhich").addEventListener("change", updateTryOutCost);
    Array.prototype.forEach.call(document.querySelectorAll("#tryOutPickRow [data-pick]"), function (b) {
      b.addEventListener("click", function () {
        pickTryOut(b.getAttribute("data-pick"));
      });
    });
    document.getElementById("tryOutKeepBtn").addEventListener("click", function () {
      finishTryOut(false);
    });
    document.getElementById("tryOutDropBtn").addEventListener("click", function () {
      finishTryOut(true);
    });
  }
