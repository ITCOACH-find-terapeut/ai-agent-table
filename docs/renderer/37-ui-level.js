// 37-ui-level.js
// Visningsniveau (Enkel, Mere, Avanceret): vælgeren i toppen styrer, hvilke knapper og indstillinger der vises. Intet er fjernet, og paneler, der åbner af sig selv
// (pauser, kontrol, spørgsmål), vises uanset niveau. Hændelsen har kun niveauet, ingen tekst.

  function currentUiLevel() {
    return window.RundbordUiLevel.normalize(store && store.uiLevel, "advanced");
  }

  function applyUiLevel() {
    var level = currentUiLevel();
    document.body.setAttribute("data-ui-level", level);
    var sel = document.getElementById("uiLevelSelect");
    if (sel) sel.value = level;
  }

  function bindUiLevel() {
    var sel = document.getElementById("uiLevelSelect");
    if (!sel) return;
    sel.addEventListener("change", function () {
      var level = window.RundbordUiLevel.normalize(sel.value, "advanced");
      window.rundbord.setUiLevel(level).then(function (s) {
        store = s;
        applyUiLevel();
        emitEvent("ui.level", null, runCtx, { level: level });
      });
    });
    applyUiLevel();
  }
