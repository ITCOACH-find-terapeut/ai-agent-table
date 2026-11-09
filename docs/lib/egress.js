// Log over det, der er sendt ud: hvad forlod computeren, til hvem, og var det beskyttet? Ren logik.
// Hændelserne ("egress.sent") indeholder kun type og antal — aldrig selve værdierne.
// window.RundbordEgress i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordEgress = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var TYPE = "egress.sent";
  var DESTS = ["llm", "voice", "git"];

  function cleanKinds(kinds) {
    var out = {};
    Object.keys(kinds && typeof kinds === "object" ? kinds : {}).forEach(function (k) {
      var n = Number(kinds[k]);
      if (/^[A-ZÆØÅ]{2,12}$/.test(k) && isFinite(n) && n > 0) out[k] = Math.floor(n);
    });
    return out;
  }

  function sumKinds(kinds) {
    return Object.keys(kinds).reduce(function (sum, k) {
      return sum + kinds[k];
    }, 0);
  }

  // Bygger hændelsens data. assessment = { kinds, possible } fra RundbordShield.assess.
  function makeData(o) {
    var assessment = (o && o.assessment) || {};
    return {
      dest: DESTS.indexOf(o && o.dest) >= 0 ? o.dest : "llm",
      provider: String((o && o.provider) || "").slice(0, 40),
      model: String((o && o.model) || "").slice(0, 80),
      host: String((o && o.host) || "").slice(0, 120),
      protected: Boolean(o && o.protected),
      kinds: cleanKinds(assessment.kinds),
      possible: Math.max(0, Math.floor(Number(assessment.possible) || 0)),
      images: Math.max(0, Math.floor(Number(o && o.images) || 0)),
      audio: Boolean(o && o.audio),
      ok: Boolean(o && o.ok),
    };
  }

  function rows(events, limit) {
    var list = (Array.isArray(events) ? events : [])
      .filter(function (e) {
        return e && e.type === TYPE && e.data;
      })
      .map(function (e) {
        var d = e.data;
        var kinds = cleanKinds(d.kinds);
        return {
          at: e.at,
          seatId: e.seatId || null,
          dest: d.dest || "llm",
          provider: d.provider || "",
          model: d.model || "",
          host: d.host || "",
          protected: Boolean(d.protected),
          kinds: kinds,
          items: sumKinds(kinds),
          possible: Number(d.possible) || 0,
          images: Number(d.images) || 0,
          audio: Boolean(d.audio),
          ok: d.ok !== false,
        };
      })
      .reverse();
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  // Samlet overblik. "clearWithFindings" = afsendelser UDEN beskyttelse, hvor der var noget følsomt (eller billeder,
  // som reglerne ikke kan læse).
  function totals(events) {
    var all = rows(events);
    var t = { sends: all.length, protectedSends: 0, clearSends: 0, clearWithFindings: 0, hiddenItems: 0, clearItems: 0, clearImages: 0, since: null };
    all.forEach(function (r) {
      if (!t.since || r.at < t.since) t.since = r.at;
      if (r.protected) {
        t.protectedSends += 1;
        t.hiddenItems += r.items;
      } else {
        t.clearSends += 1;
        t.clearItems += r.items;
        t.clearImages += r.images;
        if (r.items > 0 || r.possible > 0 || r.images > 0 || r.audio) t.clearWithFindings += 1;
      }
    });
    return t;
  }

  return { TYPE: TYPE, makeData: makeData, rows: rows, totals: totals };
});
