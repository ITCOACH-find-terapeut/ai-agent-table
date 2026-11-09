// Visningsniveau: Enkel, Mere eller Avanceret. Det styrer kun, hvilke knapper og indstillinger der vises som standard; intet er fjernet, og alt findes under Avanceret.
// Paneler, der åbner af sig selv (pauser, kontrol, spørgsmål), vises uanset niveau. Ren logik uden DOM/Electron.
// window.RundbordUiLevel i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordUiLevel = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var LEVELS = ["simple", "more", "advanced"];

  // fallback: det niveau, en ukendt eller manglende værdi giver (eksisterende brugere beholder alt: "advanced").
  function normalize(v, fallback) {
    if (LEVELS.indexOf(v) >= 0) return v;
    return LEVELS.indexOf(fallback) >= 0 ? fallback : "advanced";
  }

  // tag: "more" (vises under Mere og Avanceret), "advanced" (kun under Avanceret), ellers altid.
  function isVisible(level, tag) {
    var rank = LEVELS.indexOf(normalize(level));
    if (tag === "more") return rank >= 1;
    if (tag === "advanced") return rank >= 2;
    return true;
  }

  return { LEVELS: LEVELS, normalize: normalize, isVisible: isVisible };
});
