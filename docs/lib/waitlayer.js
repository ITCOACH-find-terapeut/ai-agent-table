// Ventelag: det, der vises i stolens boble, mens et svar er på vej (farvetone, pixelmosaik, pixelsværm eller kun ordet).
// Ordet i midten er altid ÆRLIGT: det er stolens rolle (begrebet) eller, at stolen kontrollerer; aldrig noget, der skifter af sig selv.
// Laget findes kun, mens en forespørgsel er sendt til en model og første ord mangler; når bolden ligger hos brugeren, er der intet lag.
// Ren logik uden DOM og Electron. window.RundbordWaitLayer i appen, require() i main.js og node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordWaitLayer = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var STYLES = ["wash", "mosaic", "swarm", "particles", "off"];
  var DEFAULT_STYLE = "wash";

  // De begreber, en stol kan have (renderer/01-catalog.js, ROLE_CATALOG). Hvert har et udsagnsord i sprogfilerne (waitWord_<begreb uden mellemrum og tegn>).
  var CONCEPTS = [
    "Orchestrator", "Router", "PM (Product)", "Communicator",
    "Clarifier", "Researcher", "Architect", "Planner",
    "Builder", "Database", "Frontend", "Backend", "DevOps",
    "Tester", "Security", "Reviewer", "Evaluator",
    "Documenter", "Memory", "Process Analyst", "Learning Agent",
    "UX Researcher", "API Specialist", "Performance", "Compliance", "Human",
    "OUT Writer",
  ];

  function normalize(v) {
    return STYLES.indexOf(v) >= 0 ? v : DEFAULT_STYLE;
  }

  // Nøglen i sprogfilerne til ordet. info: { concept, checks }. En stol, der kontrollerer resultatet, siger det; en stol uden et kendt begreb (et eget navn) siger bare, at den svarer.
  function wordKey(info) {
    var i = info || {};
    if (i.checks) return "waitWord_Checks";
    var c = String(i.concept == null ? "" : i.concept);
    return CONCEPTS.indexOf(c) >= 0 ? "waitWord_" + c.replace(/[^A-Za-z]/g, "") : "waitWord_Default";
  }

  // Alle nøgler, sprogfilerne skal have (bruges af testen).
  function allWordKeys() {
    return CONCEPTS.map(function (c) { return wordKey({ concept: c }); }).concat(["waitWord_Checks", "waitWord_Default"]);
  }

  return { STYLES: STYLES, DEFAULT_STYLE: DEFAULT_STYLE, CONCEPTS: CONCEPTS, normalize: normalize, wordKey: wordKey, allWordKeys: allWordKeys };
});
