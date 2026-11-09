// 31-own-take.js
// Eget bud først (bordets indstilling ownTakeFirst): før en kørsel kan du skrive dit eget bud. Det sendes IKKE til stolene (så bordets resultat er
// et uafhængigt bud at sammenligne med), men står i samtalen som en besked fra dig og vises ved siden af bordets resultat, når kørslen er færdig.
// Bagefter kan du vælge, om dit bud stod, blev justeret eller blev skiftet, og skrive en valgfri forklaring (kun lokalt). Hændelserne har kun tal.

  var pendingOwnTake = null; // { text } fra startbekræftelsen, indtil kørslen er startet

  function ownTakeFieldVisible() {
    return currentBoard() && currentBoard().ownTakeFirst === true;
  }

  // Kaldes, når startbekræftelsen vises: feltet er der kun, når bordet har indstillingen, og tømmes kun, når panelet åbnes (ikke ved omarrangering).
  function prepareOwnTakeField(wasHidden) {
    var field = document.getElementById("ownTakeField");
    if (!field) return;
    field.hidden = !ownTakeFieldVisible();
    if (wasHidden) document.getElementById("ownTakeInput").value = "";
  }

  // Kaldes af bekræftelsesknappen, før kørslen starter.
  function captureOwnTake() {
    pendingOwnTake = ownTakeFieldVisible() ? { text: document.getElementById("ownTakeInput").value.trim() } : null;
  }

  // Kaldes, når kørslen er startet (runCtx findes): gemmer buddet i samtalen, eller at du bevidst lod være.
  function recordOwnTake() {
    if (!pendingOwnTake) return Promise.resolve();
    var own = pendingOwnTake.text;
    pendingOwnTake = null;
    if (!own) {
      emitEvent("owntake.skipped", null, runCtx, {});
      return Promise.resolve();
    }
    emitEvent("owntake.written", null, runCtx, { chars: own.length });
    return systemNote(t("ownTakeNote", { text: own }), { ownTake: true, taskId: runCtx.taskId, runId: runCtx.runId });
  }

  function ownTakeMessageFor(taskId) {
    var list = (currentBoard().messages || []).filter(function (m) {
      return m.meta && m.meta.ownTake && m.meta.taskId === taskId;
    });
    return list[list.length - 1] || null;
  }

  // Bordets resultat: det seneste svar i opgaven.
  function latestResultMessage() {
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var list = (currentBoard().messages || []).filter(function (m) {
      return m.role === "assistant" && !(m.meta && m.meta.talk) && (!since || m.at >= since);
    });
    return list[list.length - 1] || null;
  }

  var compareMessageId = null;
  var compareSelected = null; // dit valg, indtil du har gemt det
  var compareYoursText = "";

  // Efter en gennemført kørsel: dit bud ved siden af bordets resultat (kun hvis du skrev et).
  function openComparePanelForRun() {
    var own = ownTakeMessageFor(runCtx.taskId);
    var res = latestResultMessage();
    if (!own || !res) return;
    compareMessageId = own.id;
    var yours = String(own.text || "");
    var prefix = t("ownTakeNote", { text: "" });
    if (prefix && yours.indexOf(prefix) === 0) yours = yours.slice(prefix.length);
    compareYoursText = shieldRestoreText(yours);
    compareSelected = null;
    document.getElementById("compareStep2").hidden = true;
    document.getElementById("compareAdjusted").value = "";
    document.getElementById("compareYours").textContent = compareYoursText;
    document.getElementById("compareFrom").textContent = (seatById(res.seatId) || {}).name || "";
    document.getElementById("compareResult").textContent = shieldRestoreText(stripNeedsSummary(res.text));
    document.getElementById("compareNote").value = "";
    document.getElementById("comparePanel").hidden = false;
    var panel = document.getElementById("comparePanel");
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // Et valg lukker ikke panelet: det åbner det næste trin, hvor du kan skrive (dit justerede bud, og en valgfri forklaring), og først "Gem" gemmer.
  function chooseCompare(choice) {
    if (!compareMessageId) return;
    compareSelected = choice;
    document.getElementById("compareChosen").textContent = t("compareChosen", { choice: t("compareChoice_" + choice) });
    document.getElementById("compareAdjustField").hidden = choice !== "adjusted";
    var adjusted = document.getElementById("compareAdjusted");
    if (choice === "adjusted" && !adjusted.value) adjusted.value = compareYoursText;
    document.getElementById("compareStep2").hidden = false;
    var target = document.getElementById(choice === "adjusted" ? "compareAdjusted" : "compareNote");
    target.focus();
    if (target.scrollIntoView) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function saveCompare() {
    var choice = compareSelected;
    var id = compareMessageId;
    if (!choice || !id) return;
    var note = document.getElementById("compareNote").value.trim();
    var adjusted = choice === "adjusted" ? document.getElementById("compareAdjusted").value.trim() : "";
    var changed = adjusted && adjusted !== compareYoursText.trim() ? adjusted : "";
    var taskId = runCtx ? runCtx.taskId : null;
    var runId = runCtx ? runCtx.runId : null;
    document.getElementById("comparePanel").hidden = true;
    compareMessageId = null;
    compareSelected = null;
    // Hændelsen har kun valget og tal, aldrig teksten.
    emitEvent("owntake.compared", null, runCtx, { choice: choice, hasNote: Boolean(note), adjustedChars: changed.length }, id);
    window.rundbord.setMessageMeta(store.activeBoardId, id, { compare: { choice: choice, note: note } }).then(function (s) {
      store = s;
      var done = systemNote(t("compareSaved", { choice: t("compareChoice_" + choice) }));
      // Dit justerede bud står i samtalen som en besked fra dig, ikke som et nyt "eget bud" (det er ikke sendt til nogen stol).
      return changed ? done.then(function () { return systemNote(t("compareAdjustedNote", { text: changed }), { adjustedTake: true, taskId: taskId, runId: runId }); }) : done;
    });
  }

  function bindOwnTake() {
    document.getElementById("compareSaveBtn").addEventListener("click", saveCompare);
    document.getElementById("compareBackBtn").addEventListener("click", function () {
      compareSelected = null;
      document.getElementById("compareStep2").hidden = true;
    });
    document.getElementById("compareKeepBtn").addEventListener("click", function () { chooseCompare("kept"); });
    document.getElementById("compareAdjustBtn").addEventListener("click", function () { chooseCompare("adjusted"); });
    document.getElementById("compareSwitchBtn").addEventListener("click", function () { chooseCompare("switched"); });
    document.getElementById("closeCompareBtn").addEventListener("click", function () {
      document.getElementById("comparePanel").hidden = true;
    });
  }
