// 34-reflection.js
// Tilbageblik: panelet laver en kalenderfil (.ics, lib/reflection.js) med 2-3 refleksionsspørgsmål om fx en uge. Appen sender intet; du åbner filen i
// din egen kalender. Spørgsmålene er regler og kan rettes. Emnet står kun i aftalen, hvis du selv tager det med. Hændelsen har kun valgene, aldrig tekst.

  var reflectState = { dirty: false, extraDirty: false };

  // Emnet til forslag: det seneste afgjorte spørgsmål i opgaven, ellers opgavens første ord. Kun et forslag; du vælger, om det kommer med.
  function reflectionTopicSuggestion() {
    var reg = typeof collectRegister === "function" ? collectRegister() : null;
    if (reg && reg.decided.length) return reg.decided[reg.decided.length - 1].question;
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    var tasks = (currentBoard().messages || []).filter(function (m) {
      return m.meta && m.meta.isTask && (!since || m.at >= since);
    });
    return tasks.length ? tasks[tasks.length - 1].text : "";
  }

  function reflectionHasOwnTake() {
    var since = typeof latestTaskStartAt === "function" ? latestTaskStartAt() : "";
    return (currentBoard().messages || []).some(function (m) {
      return m.meta && m.meta.ownTake && (!since || m.at >= since);
    });
  }

  function reflectPreset() {
    var el = document.querySelector('input[name="reflectPreset"]:checked');
    return el ? el.value : "2w";
  }

  // Det, der kommer med i beskrivelsen ud over spørgsmålene: kun efter dit valg, og du ser og kan rette teksten, før noget gemmes.
  function refreshReflectionExtra(force) {
    var box = document.getElementById("reflectExtra");
    var useOpen = document.getElementById("reflectOpenCheck").checked;
    var useDecided = document.getElementById("reflectDecidedCheck").checked;
    box.hidden = !(useOpen || useDecided);
    if (box.hidden) {
      box.value = "";
      reflectState.extraDirty = false;
      return;
    }
    if (reflectState.extraDirty && !force) return;
    var reg = typeof collectRegister === "function" ? collectRegister() : { open: [], decided: [] };
    // Beskyttelsens pladsholdere gendannes, så du ser (og kalenderen får) de rigtige ord; teksten bliver lokalt.
    var restored = {
      open: reg.open.map(function (x) { return { seat: x.seat, question: shieldRestoreText(x.question) }; }),
      decided: reg.decided.map(function (x) {
        return { seat: x.seat, question: shieldRestoreText(x.question), decision: { skipped: x.decision.skipped, answer: shieldRestoreText(x.decision.answer || "") } };
      }),
    };
    box.value = window.RundbordReflection.extraText(t, restored, { includeOpen: useOpen, includeDecided: useDecided }) || t("reflectExtraNone");
  }

  function refreshReflection(force) {
    var d = window.RundbordReflection.dateFor(new Date(), reflectPreset());
    document.getElementById("reflectWhen").textContent = t("reflectWhen", { date: d.toLocaleDateString(store.locale === "da" ? "da-DK" : "en-GB", { weekday: "long", day: "numeric", month: "long" }) });
    if (reflectState.dirty && !force) return;
    var withTopic = document.getElementById("reflectTopicCheck").checked;
    var qs = window.RundbordReflection.questions(t, { topic: withTopic ? document.getElementById("reflectTopicInput").value : "", hasOwnTake: reflectionHasOwnTake() });
    document.getElementById("reflectQuestions").value = qs.join("\n");
  }

  function openReflectPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    reflectState.dirty = false;
    reflectState.extraDirty = false;
    document.getElementById("reflectOpenCheck").checked = false;
    document.getElementById("reflectDecidedCheck").checked = false;
    refreshReflectionExtra(true);
    document.getElementById("reflectTopicCheck").checked = false;
    document.getElementById("reflectTopicInput").value = window.RundbordReflection.clean(reflectionTopicSuggestion(), 120);
    document.getElementById("reflectTopicInput").disabled = true;
    var two = document.querySelector('input[name="reflectPreset"][value="2w"]');
    if (two) two.checked = true;
    document.getElementById("reflectStatus").textContent = "";
    refreshReflection(true);
    var panel = document.getElementById("reflectPanel");
    panel.hidden = false;
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function saveReflection() {
    var lines = document.getElementById("reflectQuestions").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6);
    if (!lines.length) {
      document.getElementById("reflectQuestions").focus();
      return;
    }
    var preset = reflectPreset();
    var withTopic = document.getElementById("reflectTopicCheck").checked;
    var topic = withTopic ? window.RundbordReflection.clean(document.getElementById("reflectTopicInput").value, 120) : "";
    var start = window.RundbordReflection.dateFor(new Date(), preset);
    var extra = document.getElementById("reflectExtra").hidden ? "" : document.getElementById("reflectExtra").value.trim();
    if (extra === t("reflectExtraNone")) extra = "";
    var description = t("reflectionIntro") + "\n\n" + lines.map(function (q, i) { return i + 1 + ") " + q; }).join("\n") + (extra ? "\n\n" + extra : "") + "\n\n" + t("reflectionFooter");
    var ics = window.RundbordReflection.buildIcs({
      summary: topic ? t("reflectionSummaryTopic", { topic: topic }) : t("reflectionSummary"),
      description: description,
      start: start,
      minutes: 30,
      uid: "tilbageblik-" + uid() + "@rundbordet",
      now: new Date(),
    });
    var base = String(currentBoard().projectName || "bord").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "bord";
    var name = "tilbageblik-" + base + "-" + start.getFullYear() + String(start.getMonth() + 1).padStart(2, "0") + String(start.getDate()).padStart(2, "0") + ".ics";
    window.rundbord.saveTextFile(name, ics, "ics").then(function (res) {
      var status = document.getElementById("reflectStatus");
      if (res && res.ok) {
        emitEvent("reflection.scheduled", null, runCtx, { preset: preset, questions: lines.length, withTopic: withTopic, hasOwnTake: reflectionHasOwnTake(), withOpen: document.getElementById("reflectOpenCheck").checked, withDecided: document.getElementById("reflectDecidedCheck").checked });
        status.textContent = t("reflectionSaved", { path: res.path });
        systemNote(t("reflectionSavedNote", { path: res.path }));
      } else if (!(res && res.canceled)) {
        status.textContent = (res && res.message) || t("unknownError");
      }
    });
  }

  function bindReflection() {
    document.getElementById("reflectBtn").addEventListener("click", openReflectPanel);
    document.getElementById("closeReflectBtn").addEventListener("click", function () {
      document.getElementById("reflectPanel").hidden = true;
    });
    document.getElementById("reflectSaveBtn").addEventListener("click", saveReflection);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="reflectPreset"]'), function (el) {
      el.addEventListener("change", function () { refreshReflection(false); });
    });
    document.getElementById("reflectTopicCheck").addEventListener("change", function () {
      document.getElementById("reflectTopicInput").disabled = !this.checked;
      refreshReflection(false);
    });
    document.getElementById("reflectTopicInput").addEventListener("input", function () { refreshReflection(false); });
    document.getElementById("reflectQuestions").addEventListener("input", function () { reflectState.dirty = true; });
    ["reflectOpenCheck", "reflectDecidedCheck"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { refreshReflectionExtra(false); });
    });
    document.getElementById("reflectExtra").addEventListener("input", function () { reflectState.extraDirty = true; });
  }
