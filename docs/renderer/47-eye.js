// 47-eye.js
// Det flydende Tredje øje-ikon (lib/eyewatch.js): et lille øje i hjørnet, der kun markerer det, appen faktisk ved kræver dig.
// Det pulserer nogle få gange, når tilstanden ændrer sig til noget, der kræver dig, og står derefter stille med en markering, til det er løst.
// Et tryk fører dig derhen, hvor tingen kan afgøres; er der intet, åbner det selve Tredje øje. Første gang forklarer et lille kort, hvad øjet er; derefter er et roligt øje grønt og blinker blidt.
// Øjet kan skjules under Indstillinger.

  var eyeSig = "";
  var eyeLastReason = null;

  // Det, appen ved lige nu. Før appen er klar (ingen butik endnu) er alt roligt.
  function eyeInput() {
    var rv = typeof runView === "object" && runView ? runView : {};
    var decide = 0;
    var api = 0;
    try {
      decide = inboxCounts().decide;
      api = apiMissingList(currentBoard().seats || []).length;
    } catch (e) {
      decide = 0;
      api = 0;
    }
    var check = Boolean(rv.checkSeatId);
    // Kontrollen, der venter, er allerede talt med i «kun du kan afgøre»; her tælles den kun som sin egen årsag.
    return { check: check, pause: Boolean(rv.pauseSeatId), budget: Boolean(rv.budgetStopped), api: api, decide: Math.max(0, decide - (check ? 1 : 0)) };
  }

  function eyeReasonText(sum) {
    var text = t("eyeReason_" + sum.reason, { count: sum.decide });
    if (sum.reasons.length > 1) text += t("eyeMore", { count: sum.reasons.length - 1 });
    return text;
  }

  function eyeIntroSeen() {
    return typeof store === "object" && store && store.eyeIntroSeen === true;
  }

  // Introduktionen vises én gang, når øjet er synligt, og velkomsten (nye installationer) er lukket. Den ligger ved siden af og blokerer intet.
  function renderEyeIntro() {
    var card = document.getElementById("eyeIntro");
    if (!card) return;
    var eyeShown = typeof store === "object" && store && window.RundbordEye.normalizeVisible(store.eyeFloat) === "on";
    var welcome = document.getElementById("welcomePanel");
    var welcomeOpen = Boolean(welcome && !welcome.hidden);
    card.hidden = !(eyeShown && !eyeIntroSeen() && !welcomeOpen && typeof store === "object" && store && store.activeBoardId);
  }

  function eyeIntroDone(thenTalk) {
    window.rundbord.setEyeIntroSeen(true).then(function (s) {
      store = s;
      renderEyeIntro();
      renderEye();
      if (thenTalk) eyeGo();
    });
  }

  function renderEye() {
    var btn = document.getElementById("eyeFloat");
    if (!btn) return;
    var visible = typeof store === "object" && store && window.RundbordEye.normalizeVisible(store.eyeFloat) === "on";
    btn.hidden = !visible;
    renderEyeIntro();
    if (!visible) return;
    var sum = window.RundbordEye.summarize(eyeInput());
    var sig = window.RundbordEye.signature(sum);
    var text = sum.reason ? t("eyeTitle", { reason: eyeReasonText(sum) }) : t("eyeCalm");
    btn.setAttribute("data-state", sum.state);
    btn.setAttribute("data-intro", eyeIntroSeen() ? "done" : "pending");
    btn.setAttribute("data-reason", sum.reason || "");
    btn.title = text;
    btn.setAttribute("aria-label", text);
    if (sig === eyeSig) return;
    eyeSig = sig;
    // Pulsér kun, når der er kommet noget nyt, der kræver dig; ikke ved ro og ikke ved en gentegning med samme tilstand.
    btn.classList.remove("pulse");
    if (sum.reason) {
      void btn.offsetWidth;
      btn.classList.add("pulse");
    }
    // Skærmlæsere får det at vide én gang, når en ny årsag kommer til.
    var live = document.getElementById("eyeLive");
    if (live) live.textContent = sum.reason && sum.reason !== eyeLastReason ? text : "";
    eyeLastReason = sum.reason;
  }

  // Hvor et tryk fører hen, efter hvad der kræver dig
  function eyeGo() {
    var sum = window.RundbordEye.summarize(eyeInput());
    function click(id) {
      var el = document.getElementById(id);
      if (el) el.click();
    }
    function focusIn(panelId, selector) {
      var panel = document.getElementById(panelId);
      var el = panel && !panel.hidden ? panel.querySelector(selector) || panel : null;
      if (el && el.focus) {
        if (panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
        el.focus();
      }
    }
    switch (sum.reason) {
      case "check":
        focusIn("checkPanel", "button");
        break;
      case "pause":
        focusIn("pausePanel", "textarea, button");
        break;
      case "budget":
        click("boardSpend");
        break;
      case "api":
        apiSetupAction();
        break;
      case "decide":
        click("openNeedsToggleBtn");
        break;
      default:
        // Roligt: et tryk åbner selve Tredje øje (samtalen). Kan den ikke åbnes endnu (ingen Modelprofil API), åbner det Overblik.
        var talk = document.getElementById("thirdEyeBtn");
        var pick = document.getElementById("thirdEyeSeatSelect");
        if (talk && pick && !pick.disabled) openTalkPanel();
        else click("overviewBtn");
    }
  }

  function bindEye() {
    var btn = document.getElementById("eyeFloat");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      eyeGo();
    });
    var tryBtn = document.getElementById("eyeIntroTryBtn");
    var okBtn = document.getElementById("eyeIntroOkBtn");
    if (tryBtn) tryBtn.addEventListener("click", function () { eyeIntroDone(true); });
    if (okBtn) okBtn.addEventListener("click", function () { eyeIntroDone(false); });
    renderEye();
  }
