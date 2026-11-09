// Indstillinger pr. pil (fra én stol til en anden): en pause før næste stol, og hvordan overdragelsen bygges. Ren logik uden DOM/Electron.
//   edges: { "<fraStolId>><tilStolId>": { pause: true, handoff: "full" | "structured" | "anchor" } }
//   handoff "default" (eller manglende) = bordets indstilling. "anchor" = kun opgaven og brugerens afgørelser, ikke forrige stols svar.
// window.RundbordEdges i appen, require() i node-tests og main.js.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordEdges = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var HANDOFFS = ["default", "full", "structured", "anchor"];
  var MAX_EDGES = 200;

  function key(from, to) {
    return String(from) + ">" + String(to);
  }

  function clean(v) {
    var handoff = v && HANDOFFS.indexOf(v.handoff) >= 0 ? v.handoff : "default";
    return { pause: Boolean(v && v.pause === true), handoff: handoff };
  }

  function isDefault(c) {
    return !c.pause && c.handoff === "default";
  }

  // Kun kendte felter; standardværdier gemmes ikke. seatIds (valgfri): pile til stole, der ikke findes, droppes.
  function normalize(edges, seatIds) {
    var out = {};
    if (!edges || typeof edges !== "object") return out;
    var known = null;
    if (Array.isArray(seatIds)) {
      known = {};
      seatIds.forEach(function (id) {
        known[id] = true;
      });
    }
    Object.keys(edges)
      .slice(0, MAX_EDGES)
      .forEach(function (k) {
        var parts = k.split(">");
        if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1] || k.length > 140) return;
        if (known && (!known[parts[0]] || !known[parts[1]])) return;
        var c = clean(edges[k]);
        if (!isDefault(c)) out[k] = c;
      });
    return out;
  }

  function get(edges, from, to) {
    var v = edges && typeof edges === "object" ? edges[key(from, to)] : null;
    return clean(v);
  }

  // Ny map med ændringen (patch: { pause?, handoff? }); standardværdier fjernes.
  function set(edges, from, to, patch) {
    var next = Object.assign({}, edges && typeof edges === "object" ? edges : {});
    var c = clean(Object.assign({}, get(edges, from, to), patch || {}));
    if (isDefault(c)) delete next[key(from, to)];
    else next[key(from, to)] = c;
    return next;
  }

  function summary(edges) {
    var n = { pauses: 0, custom: 0 };
    Object.keys(edges || {}).forEach(function (k) {
      var c = clean(edges[k]);
      if (c.pause) n.pauses += 1;
      if (c.handoff !== "default") n.custom += 1;
    });
    return n;
  }

  return { HANDOFFS: HANDOFFS, key: key, normalize: normalize, get: get, set: set, summary: summary };
});
