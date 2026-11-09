// Indbakke: en mappe, et bord kun LÆSER fra ("ny siden sidst"). Appen ændrer, flytter og sletter aldrig noget i den. Nye filer kan hentes
// som en kopi til bordets IN-mappe; det er kun IN, stolene læser. Ren logik: hvad er nyt, og hvad huskes som set.
// window.RundbordInbox i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordInbox = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_SEEN = 2000;

  // En fils "fingeraftryk": navn, størrelse og ændringstid. Ændres filen, er den ny igen.
  function fingerprint(entry) {
    return String(entry.name) + "|" + Number(entry.size) + "|" + Math.round(Number(entry.mtimeMs) || 0);
  }

  function normalize(inbox) {
    var i = inbox && typeof inbox === "object" ? inbox : {};
    var seen = i.seen && typeof i.seen === "object" && !Array.isArray(i.seen) ? i.seen : {};
    return { path: typeof i.path === "string" ? i.path : "", seen: seen, checkedAt: typeof i.checkedAt === "string" ? i.checkedAt : null };
  }

  // entries: [{name, size, mtimeMs, ...}] → samme med isNew
  function annotate(entries, seen) {
    seen = seen || {};
    return (entries || []).map(function (e) {
      return Object.assign({}, e, { isNew: !seen[fingerprint(e)] });
    });
  }

  // Det, der huskes som set: kun fingeraftryk for filer, der stadig ligger i mappen (og højst MAX_SEEN), så listen ikke vokser for evigt.
  function markSeen(entries, seen, names) {
    var all = !names;
    var want = {};
    (names || []).forEach(function (n) {
      want[n] = true;
    });
    var next = {};
    (entries || []).forEach(function (e) {
      var fp = fingerprint(e);
      if ((seen && seen[fp]) || all || want[e.name]) next[fp] = true;
    });
    var keys = Object.keys(next);
    if (keys.length > MAX_SEEN) keys.slice(0, keys.length - MAX_SEEN).forEach(function (k) {
      delete next[k];
    });
    return next;
  }

  function newCount(entries) {
    return (entries || []).filter(function (e) {
      return e.isNew && !e.tooLarge;
    }).length;
  }

  return { fingerprint: fingerprint, normalize: normalize, annotate: annotate, markSeen: markSeen, newCount: newCount, MAX_SEEN: MAX_SEEN };
});
