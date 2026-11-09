// Tegner arbejdsgrafen: placerer stole på et gitter og lægger kanterne som SVG-stier. Ren logik (ingen DOM), så placeringen kan testes.
// window.RundbordGraphLayout i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordGraphLayout = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var NODE_W = 128;
  var NODE_H = 54;
  var GAP_X = 58;
  var GAP_Y = 76;
  var PAD = 24;
  var COLS = 4;

  // nodes: [{ key, label, sub, state }] i den rækkefølge, de skal ligge; edges: [{ from, to, label, kind: "plan"|"handoff"|"rework" }]
  // → { width, height, nodes: [{ ...node, x, y, w, h }], edges: [{ ...edge, d, lx, ly }] }
  function layout(nodes, edges) {
    var cols = Math.min(COLS, Math.max(1, nodes.length));
    var placed = nodes.map(function (n, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      return Object.assign({}, n, { x: PAD + col * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H });
    });
    var rows = Math.max(1, Math.ceil(nodes.length / cols));
    var width = PAD * 2 + cols * NODE_W + (cols - 1) * GAP_X;
    var height = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y + 18;
    var byKey = {};
    placed.forEach(function (n) { byKey[n.key] = n; });
    // flere kanter af samme slags mellem de samme to stole får hver sin forskydning
    var pairCount = {};
    var out = [];
    edges.forEach(function (e) {
      var a = byKey[e.from];
      var b = byKey[e.to];
      if (!a || !b) return;
      var pairKey = e.kind + "|" + e.from + ">" + e.to; // kanter af samme slags mellem de samme to stole fordeles; en stiplet vej og en fuld overdragelse ligger oven på hinanden
      var idx = pairCount[pairKey] || 0;
      pairCount[pairKey] = idx + 1;
      var ax = a.x + a.w / 2;
      var ay = a.y + a.h / 2;
      var bx = b.x + b.w / 2;
      var by = b.y + b.h / 2;
      var forward = ax < bx || (ax === bx && ay < by);
      var dx = bx - ax;
      var dy = by - ay;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len;
      var uy = dy / len;
      // pilen starter og slutter på nodens kant, ikke i midten
      function edgePoint(n, cx, cy, vx, vy) {
        var tx = vx === 0 ? Infinity : (n.w / 2) / Math.abs(vx);
        var ty = vy === 0 ? Infinity : (n.h / 2) / Math.abs(vy);
        var t = Math.min(tx, ty) + 3;
        return { x: cx + vx * t, y: cy + vy * t };
      }
      var p1 = edgePoint(a, ax, ay, ux, uy);
      var p2 = edgePoint(b, bx, by, -ux, -uy);
      // fremad: lige linje. Tilbagesendelse: bue under (eller til højre for) stolene. En vej tilbage i strategien: bue over (eller til venstre).
      var side = e.kind === "rework" ? 1 : !forward ? -1 : 0;
      var amount = side === 0 ? idx * 14 : 46 + idx * 16;
      var horizontal = Math.abs(dx) >= Math.abs(dy);
      var mx = (p1.x + p2.x) / 2;
      var my = (p1.y + p2.y) / 2;
      var cx = horizontal ? mx : mx + (side || 1) * amount;
      var cy = horizontal ? my + (side || 1) * amount : my;
      out.push(Object.assign({}, e, {
        d: "M" + p1.x.toFixed(1) + "," + p1.y.toFixed(1) + " Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1),
        lx: +(0.25 * p1.x + 0.5 * cx + 0.25 * p2.x).toFixed(1),
        ly: +(0.25 * p1.y + 0.5 * cy + 0.25 * p2.y).toFixed(1),
      }));
    });
    return { width: width, height: height, nodes: placed, edges: out };
  }

  return { layout: layout, NODE_W: NODE_W, NODE_H: NODE_H };
});
