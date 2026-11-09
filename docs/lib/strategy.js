// Strategibibliotek: en strategi er en rettet graf over roller, skrevet som enkle linjer, fx
//     Clarifier -> Builder -> Reviewer
//     Reviewer -> Builder [ved ikke bestået]
// Her ligger skrivemåden (læsning og kontrol), startstrategierne og koblingen til bordets stole. Ren logik; ingen modelkald.
// Strategierne er udgangspunkter, ikke anbefalinger: ingen af dem er målt. window.RundbordStrategy i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordStrategy = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_NODES = 12;
  var MAX_EDGES = 30;
  var MAX_TEXT = 2000;
  var MAX_NAME = 60;
  var MAX_DESC = 400;

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
  }

  function SeatRef() {
    return typeof module === "object" && module.exports ? require("./seatref.js") : window.RundbordSeatRef;
  }

  // text → { ok, nodes: [navn i rækkefølge], edges: [{from, to, label}], errors: [{line, code}] }
  // Koder: tooFew (en linje med under to navne), badName, selfLoop, tooManyNodes, tooManyEdges, empty, tooLong
  function parse(text) {
    var str = String(text == null ? "" : text);
    var errors = [];
    if (str.length > MAX_TEXT) return { ok: false, nodes: [], edges: [], errors: [{ line: 0, code: "tooLong" }] };
    var nodes = [];
    var edges = [];
    var seenEdge = {};
    str.split("\n").forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || line.charAt(0) === "#") return;
      var label = "";
      var lm = /\[([^\]]*)\]\s*$/.exec(line);
      if (lm) {
        label = clean(lm[1], 60);
        line = line.slice(0, lm.index).trim();
      }
      var names = line.split(/\s*(?:->|→)\s*/).map(function (n) {
        return clean(n, 40);
      });
      if (names.length < 2) return errors.push({ line: i + 1, code: "tooFew" });
      if (names.some(function (n) { return n.length < 2 || /[\[\]]/.test(n); })) return errors.push({ line: i + 1, code: "badName" });
      for (var k = 0; k < names.length - 1; k++) {
        if (names[k].toLowerCase() === names[k + 1].toLowerCase()) {
          errors.push({ line: i + 1, code: "selfLoop" });
          return;
        }
      }
      names.forEach(function (n) {
        if (!nodes.some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) nodes.push(n);
      });
      for (var j = 0; j < names.length - 1; j++) {
        var from = nodes.filter(function (x) { return x.toLowerCase() === names[j].toLowerCase(); })[0];
        var to = nodes.filter(function (x) { return x.toLowerCase() === names[j + 1].toLowerCase(); })[0];
        var lab = j === names.length - 2 ? label : "";
        var key = from + ">" + to + ">" + lab;
        if (!seenEdge[key]) {
          seenEdge[key] = true;
          edges.push({ from: from, to: to, label: lab });
        }
      }
    });
    if (nodes.length > MAX_NODES) errors.push({ line: 0, code: "tooManyNodes" });
    if (edges.length > MAX_EDGES) errors.push({ line: 0, code: "tooManyEdges" });
    if (!errors.length && !edges.length) errors.push({ line: 0, code: "empty" });
    return { ok: errors.length === 0, nodes: nodes, edges: edges, errors: errors };
  }

  // En strategi som den gemmes: { id, name, description, text }. Teksten skal kunne læses, ellers afvises den.
  function normalize(raw) {
    var r = raw && typeof raw === "object" ? raw : {};
    var s = {
      id: clean(r.id, 60) || "",
      name: clean(r.name, MAX_NAME),
      description: clean(r.description, MAX_DESC),
      text: String(r.text == null ? "" : r.text).replace(/\r/g, "").slice(0, MAX_TEXT),
    };
    if (r.builtin === true) s.builtin = true;
    return s;
  }

  function validate(raw) {
    var s = normalize(raw);
    if (s.name.length < 2) return { ok: false, error: "noName", strategy: s };
    var p = parse(s.text);
    if (!p.ok) return { ok: false, error: "badText", errors: p.errors, strategy: s };
    return { ok: true, strategy: s, parsed: p };
  }

  var STARTERS = {
    da: [
      {
        id: "starter-afklar-byg-kontroller",
        name: "Afklar, byg, kontrollér",
        description: "Først afklares opgaven, så bygges løsningen, og en gennemgang kan sende den tilbage. Et udgangspunkt, ikke en anbefaling.",
        text: "Clarifier -> Builder -> Reviewer\nReviewer -> Builder [ved ikke bestået]",
      },
      {
        id: "starter-perspektiver-syntese",
        name: "Flere perspektiver, så syntese",
        description: "Flere roller ser på det samme, og til sidst samler én det. Et udgangspunkt, ikke en anbefaling.",
        text: "Researcher -> Architect -> Reviewer -> Orchestrator",
      },
      {
        id: "starter-udfordr-forbedr",
        name: "Udfordr og forbedr",
        description: "Én laver et udkast, en anden udfordrer det, og den første retter. Et udgangspunkt, ikke en anbefaling.",
        text: "Builder -> Reviewer -> Builder",
      },
    ],
    en: [
      {
        id: "starter-afklar-byg-kontroller",
        name: "Clarify, build, check",
        description: "The task is clarified first, then the solution is built, and a review can send it back. A starting point, not a recommendation.",
        text: "Clarifier -> Builder -> Reviewer\nReviewer -> Builder [on fail]",
      },
      {
        id: "starter-perspektiver-syntese",
        name: "Several perspectives, then synthesis",
        description: "Several roles look at the same thing, and in the end one gathers it. A starting point, not a recommendation.",
        text: "Researcher -> Architect -> Reviewer -> Orchestrator",
      },
      {
        id: "starter-udfordr-forbedr",
        name: "Challenge and improve",
        description: "One makes a draft, another challenges it, and the first revises. A starting point, not a recommendation.",
        text: "Builder -> Reviewer -> Builder",
      },
    ],
  };

  function starters(locale) {
    return STARTERS[locale === "en" ? "en" : "da"].map(function (s) {
      return Object.assign({}, s, { builtin: true });
    });
  }

  // Strategiens roller → bordets stole, på præcist navn (se seatref). seats: [{id, name}]
  // → [{ node, seatId|null }]
  function mapToSeats(parsed, seats) {
    var ref = SeatRef();
    var list = (seats || []).map(function (s) {
      return { id: s.id, name: s.name };
    });
    return (parsed.nodes || []).map(function (n) {
      var hit = ref.resolve(n, list);
      return { node: n, seatId: hit && hit.seat && hit.how === "exact" ? hit.seat.id : null };
    });
  }

  return { parse: parse, normalize: normalize, validate: validate, starters: starters, mapToSeats: mapToSeats, MAX_NODES: MAX_NODES, MAX_EDGES: MAX_EDGES, MAX_TEXT: MAX_TEXT };
});
