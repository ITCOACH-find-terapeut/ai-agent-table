// Historik på en stols opførsel: hvad blev ændret, af hvad, og hvordan kommer man tilbage? Ren logik.
// Kun det, der påvirker hvad stolen gør (rollens begreb, dials, ikoner, tilføjelser, kontrolstol, læser IN) — ikke farve, plads eller nøgler.
// window.RundbordSeatHistory i appen, require() i main.js og i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordSeatHistory = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_ENTRIES = 30;
  var SOURCES = ["manual", "need", "nextstep", "variant", "proposal", "rollback"];

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function lines(text) {
    return String(text || "")
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
  }

  // Det, en tilbagerulning kan sætte tilbage.
  function snapshot(seat) {
    var s = seat || {};
    var icons = s.icons && typeof s.icons === "object" ? s.icons : {};
    return {
      // Begrebet (fx Builder; "" for et eget navn uden begreb). null = stolen er ældre end begrebet og har intet gemt, så en rolleændring kan ikke udledes.
      role: typeof s.role === "string" ? s.role : null,
      dials: clone(s.dials && typeof s.dials === "object" ? s.dials : {}),
      icons: { mandate: icons.mandate || "kan", work: clone(icons.work || {}), info: clone(icons.info || {}) },
      customInstruction: lines(s.customInstruction).join("\n"),
      checks: Boolean(s.checks),
      readsIn: Boolean(s.readsIn),
    };
  }

  function dialView(d) {
    var x = d && typeof d === "object" ? d : {};
    return { state: x.state || "off", strength: x.strength == null ? null : x.strength, note: x.note || "" };
  }

  // → liste af ændringer, klar til at blive vist (teksten gøres sprogafhængig i skærmbilledet)
  function diff(beforeSeat, afterSeat) {
    var b = snapshot(beforeSeat);
    var a = snapshot(afterSeat);
    var out = [];
    if (b.role !== null && a.role !== null && b.role !== a.role) out.push({ field: "role", from: b.role, to: a.role });
    Object.keys(Object.assign({}, b.dials, a.dials)).forEach(function (k) {
      var from = dialView(b.dials[k]);
      var to = dialView(a.dials[k]);
      if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field: "dial", key: k, from: from, to: to });
    });
    if (b.icons.mandate !== a.icons.mandate) out.push({ field: "mandate", from: b.icons.mandate, to: a.icons.mandate });
    ["work", "info"].forEach(function (group) {
      Object.keys(Object.assign({}, b.icons[group], a.icons[group])).forEach(function (k) {
        var from = Boolean(b.icons[group][k]);
        var to = Boolean(a.icons[group][k]);
        if (from !== to) out.push({ field: "icon", group: group, key: k, from: from, to: to });
      });
    });
    var bl = lines(b.customInstruction);
    var al = lines(a.customInstruction);
    al.forEach(function (l) {
      if (bl.indexOf(l) < 0) out.push({ field: "addition", change: "added", text: l });
    });
    bl.forEach(function (l) {
      if (al.indexOf(l) < 0) out.push({ field: "addition", change: "removed", text: l });
    });
    if (b.checks !== a.checks) out.push({ field: "checks", from: b.checks, to: a.checks });
    if (b.readsIn !== a.readsIn) out.push({ field: "readsIn", from: b.readsIn, to: a.readsIn });
    return out;
  }

  // Én post, eller null hvis intet i opførslen er ændret.
  function makeEntry(o) {
    var changes = diff(o.before, o.after);
    if (!changes.length) return null;
    return {
      id: String(o.id || ""),
      at: o.now || null,
      source: SOURCES.indexOf(o.source) >= 0 ? o.source : "manual",
      changes: changes,
      before: snapshot(o.before),
    };
  }

  function record(history, entry, max) {
    var list = Array.isArray(history) ? history.slice() : [];
    if (entry) list.push(entry);
    return list.slice(-(max || MAX_ENTRIES));
  }

  // Stolen med opførslen fra et øjebliksbillede; alt andet (navn, model, nøgle, historik) er uændret.
  function restore(seat, snap) {
    var out = clone(seat) || {};
    var s = snap || {};
    // Begrebet rulles kun tilbage, hvis øjebliksbilledet har et (ældre poster har ikke). Hedder stolen det samme som begrebet, følger navnet med; et selvskrevet navn rører vi ikke.
    if (typeof s.role === "string") {
      if (out.name === out.role || !out.name) out.name = s.role || out.name;
      out.role = s.role;
    }
    out.dials = clone(s.dials || {});
    out.icons = { mandate: (s.icons && s.icons.mandate) || "kan", work: clone((s.icons && s.icons.work) || {}), info: clone((s.icons && s.icons.info) || {}) };
    out.customInstruction = s.customInstruction || "";
    out.checks = Boolean(s.checks);
    out.readsIn = Boolean(s.readsIn);
    return out;
  }

  return { MAX_ENTRIES: MAX_ENTRIES, SOURCES: SOURCES, snapshot: snapshot, diff: diff, makeEntry: makeEntry, record: record, restore: restore };
});
