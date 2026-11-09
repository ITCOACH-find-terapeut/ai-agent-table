// 27-dismiss.js
// Lukning af paneler. Hvert panel får en synlig ✕ øverst til højre (følger med, når panelet ruller) og lukkes af et klik ved siden af,
// men kun hvis intet er ændret i det. Er der skrevet eller valgt noget, lukker et klik udenfor ikke; panelet viser "Ikke gemt" og
// blinker, så man ser, at Gem eller Annullér skal bruges. ✕ og klik udenfor gør det samme som panelets egen Luk/Annullér-knap.
// Paneler, hvor man arbejder udenfor panelet (Beskyttelsens forhåndsvisning, samtalen, kørslens beslutninger), lukkes ikke af et klik udenfor.

  var DISMISS_PANELS = ["strategyPanel", "settingsPanel", "seatPanel", "handoffPanel", "pricePanel", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "tablePanel", "proposalsPanel", "turnPanel", "addSeatPanel", "quickStartPanel", "comparePanel", "reflectPanel", "diffPanel", "stuckPanel", "apiNeededPanel"];
  var DISMISS_OUTSIDE = ["strategyPanel", "settingsPanel", "seatPanel", "handoffPanel", "pricePanel", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "tablePanel", "proposalsPanel", "turnPanel", "addSeatPanel", "quickStartPanel"];
  // Felter, der virker med det samme, tæller ikke som ændringer, der mangler at blive gemt.
  var DISMISS_INSTANT = ["themeSelect", "localeSelect", "waitStyleSelect", "eyeFloatSelect", "thirdEyeVoiceSelect", "dangerNameInput"];
  var panelDirty = {};
  var lastPointerDown = null; // { target, at }

  function panelCancelButton(panel) {
    return panel.querySelector('button[data-i18n="cancel"], button[data-i18n="close"]');
  }

  function dismissPanel(id) {
    var panel = document.getElementById(id);
    if (!panel || panel.hidden) return;
    var btn = panelCancelButton(panel);
    if (btn) btn.click();
    else panel.hidden = true;
    if (!panel.hidden) panel.hidden = true;
  }

  function setPanelDirty(id, on) {
    var panel = document.getElementById(id);
    if (!panel) return;
    panelDirty[id] = on;
    if (on) panel.setAttribute("data-dirty", "1");
    else panel.removeAttribute("data-dirty");
  }

  function flashPanel(panel) {
    panel.classList.remove("panel-attn");
    void panel.offsetWidth;
    panel.classList.add("panel-attn");
    setTimeout(function () {
      panel.classList.remove("panel-attn");
    }, 700);
  }

  function initPanelDismiss() {
    DISMISS_PANELS.forEach(function (id) {
      var panel = document.getElementById(id);
      if (!panel) return;
      var bar = document.createElement("div");
      bar.className = "panel-bar";
      bar.innerHTML =
        '<span class="panel-dirty" data-i18n="panelDirty"></span>' +
        '<button type="button" class="panel-x" data-i18n-title="panelClose" data-i18n-aria-label="panelClose">✕</button>';
      panel.insertBefore(bar, panel.firstChild);
      bar.querySelector(".panel-x").addEventListener("click", function () {
        dismissPanel(id);
      });
      function mark(e) {
        if (e.target && e.target.id && DISMISS_INSTANT.indexOf(e.target.id) >= 0) return;
        if (e.target && e.target.closest && e.target.closest("[data-instant]")) return;
        setPanelDirty(id, true);
      }
      panel.addEventListener("input", mark);
      panel.addEventListener("change", mark);
      // Åbnes eller lukkes panelet, starter det rent.
      new MutationObserver(function () {
        setPanelDirty(id, false);
      }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    });

    // Et klik tæller kun som "udenfor", hvis det også begyndte udenfor (så en markering, der trækkes ud af panelet, ikke lukker det),
    // og kun hvis der var et rigtigt tryk forud (programmatiske klik lukker intet).
    document.addEventListener(
      "pointerdown",
      function (e) {
        lastPointerDown = { target: e.target, at: Date.now() };
      },
      true
    );
    document.addEventListener(
      "click",
      function (e) {
        var down = lastPointerDown;
        lastPointerDown = null;
        if (!down || Date.now() - down.at > 2000) return;
        var node = e.target;
        if (!node || !node.closest) return;
        if (node.closest("#settingsBtn")) return; // knappen åbner og lukker selv
        if (node.closest("#dataTabs")) return; // fanerne skifter mellem Bordets data-paneler
        DISMISS_OUTSIDE.forEach(function (id) {
          var panel = document.getElementById(id);
          if (!panel || panel.hidden) return;
          if (panel.contains(node) || panel.contains(down.target)) return;
          // Valglister og menuer, der hører til panelet, men ligger udenfor det
          if (node.closest(".model-drop")) return;
          if (panelDirty[id]) {
            // Ikke gemt: klikket gør ikke noget andet, før man har valgt Gem eller Annullér (eller ✕).
            e.stopPropagation();
            e.preventDefault();
            flashPanel(panel);
            return;
          }
          dismissPanel(id);
        });
      },
      true
    );

    initPanelReveal();
  }

  // Et panel, der åbner øverst på siden, mens du står længere nede, er usynligt. Det scroller sig derfor selv i syne og får fokus.
  // (Faste sidepaneler ligger altid i syne og røres ikke.)
  var REVEAL_PANELS = DISMISS_PANELS.concat(["startConfirmPanel", "talkPanel", "checkPanel", "shieldPanel", "shieldReviewPanel", "routePanel", "pausePanel", "envelopePanel"]);

  function revealPanel(panel) {
    if (panel.classList.contains("side-panel")) return;
    // Paneler i fanerne (Bordets data) vises med fanelinjen over sig, så det er hele gruppen, der scroller i syne.
    var inHub = panel.parentElement && panel.parentElement.id === "dataHub";
    if (inHub && typeof syncDataHub === "function") syncDataHub();
    var shown = inHub ? panel.parentElement : panel;
    var r = shown.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (r.height && r.top >= 0 && r.top < vh - 60) return; // toppen er allerede i syne
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      shown.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    } catch (e) {
      shown.scrollIntoView();
    }
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    try {
      panel.focus({ preventScroll: true });
    } catch (e) {}
  }

  function initPanelReveal() {
    REVEAL_PANELS.forEach(function (id) {
      var panel = document.getElementById(id);
      if (!panel || panel.classList.contains("side-panel")) return;
      new MutationObserver(function () {
        if (!panel.hidden) revealPanel(panel);
      }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    });
  }
