// Overblik: ét sted i topbaren for Næste skridt, Tilbageblik, Uenigheder, Regning og priser og Jeg sidder fast.
// Markeringen siger kun, hvad appen faktisk ved kræver dig: antal ting, der kun du kan afgøre, og at en kørsel venter på dig. Resten er rolige rækker uden markering.
// Ren logik uden DOM og Electron. window.RundbordOverview i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordOverview = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // Rækkefølgen i menuen. level: det laveste visningsniveau, rækken vises fra (som data-level i siden).
  var ROWS = [
    { key: "needs", level: "simple" },
    { key: "reflect", level: "more" },
    { key: "diff", level: "more" },
    { key: "spend", level: "simple" },
    { key: "stuck", level: "simple" },
  ];

  function count(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // input: { needsTotal, needsDecide, blocking } → { badge, urgent, needs: { marker, total, decide } }
  // badge: tallet på Overblik-knappen (ting, der kræver dig + en kørsel, der venter på dig); urgent: en kørsel venter på dig.
  function summarize(input) {
    var i = input || {};
    var total = count(i.needsTotal);
    var decide = count(i.needsDecide);
    var blocking = i.blocking === true;
    return {
      badge: decide + (blocking ? 1 : 0),
      urgent: blocking,
      needs: { marker: blocking ? "block" : decide > 0 ? "you" : "none", total: Math.max(total, decide), decide: decide },
    };
  }

  return { ROWS: ROWS, summarize: summarize };
});
