// Roller: en stol har et BEGREB (hvad den er, fx Builder eller OUT Writer) og et valgfrit ROLLENAVN (det navn, der står på bordet i stedet for begrebet).
// Rollenavnet er tomt som standard; skriver man et, bruges det overalt på bordet. Rollebiblioteket gemmer dine egne roller (navn + begreb), så de kan vælges igen.
// Ren logik uden DOM/Electron. window.RundbordRoles i appen, require() i main.js og node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordRoles = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_ROLES = 40;
  var CUSTOM = "__custom";

  function str(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function normalizeOne(r) {
    if (!r || typeof r !== "object") return null;
    var id = str(r.id, 64);
    var name = str(r.name, 40);
    if (!id || !name) return null;
    var concept = str(r.concept, 40);
    return { id: id, name: name, concept: concept === CUSTOM ? "" : concept };
  }

  // Kun kendte felter, unikke id'er, højst MAX_ROLES.
  function normalize(list) {
    var seen = {};
    return (Array.isArray(list) ? list : [])
      .map(normalizeOne)
      .filter(function (r) {
        if (!r || seen[r.id]) return false;
        seen[r.id] = true;
        return true;
      })
      .slice(0, MAX_ROLES);
  }

  function get(list, id) {
    if (!id) return null;
    return (list || []).filter(function (r) { return r.id === id; })[0] || null;
  }

  function nextId(list) {
    var used = {};
    (list || []).forEach(function (r) { used[r.id] = true; });
    var n = 1;
    while (used["rolle-" + n]) n += 1;
    return "rolle-" + n;
  }

  // Gemmer en rolle (navn + begreb). Samme navn og begreb to gange giver ikke en dublet; samme id opdaterer. → ny liste
  function upsert(list, role) {
    var cur = normalize(list);
    var clean = normalizeOne(Object.assign({ id: "x" }, role, { id: (role && role.id) || "x" }));
    if (!clean) return cur;
    var same = cur.filter(function (r) { return r.name.toLowerCase() === clean.name.toLowerCase() && r.concept === clean.concept; })[0];
    if (!(role && role.id) && same) return cur;
    if (role && role.id) {
      var idx = cur.findIndex(function (r) { return r.id === clean.id; });
      if (idx >= 0) {
        cur[idx] = clean;
        return cur;
      }
    } else {
      clean.id = nextId(cur);
    }
    if (cur.length < MAX_ROLES) cur.push(clean);
    return cur;
  }

  function remove(list, id) {
    return normalize(list).filter(function (r) { return r.id !== id; });
  }

  // Det, der er valgt i stolens panel (begreb + rollenavn), til det, der gemmes på stolen: name er det viste navn, role er begrebet ("" for et eget navn uden begreb).
  // ok er falsk, hvis stolen ingen navn har (eget navn uden at have skrevet et).
  function resolve(concept, name) {
    var c = String(concept || "");
    var typed = str(name, 40);
    var role = c === CUSTOM ? "" : str(c, 40);
    var shown = typed || role;
    return { name: shown, role: role, ok: Boolean(shown) };
  }

  // Det, en gemt stol svarer til i panelet: { concept, name } (name er tomt, når stolen hedder det samme som begrebet). known = de begreber, der findes i kataloget.
  // En ældre stol uden begreb er sit navn, hvis det er et kendt begreb, ellers et eget navn.
  function split(seat, known) {
    var list = Array.isArray(known) ? known : [];
    var name = seat ? String(seat.name || "") : "";
    var role = seat && typeof seat.role === "string" ? seat.role : null;
    if (role === null) role = list.indexOf(name) >= 0 ? name : "";
    if (role && list.indexOf(role) < 0) role = "";
    return { concept: role || CUSTOM, name: name === role ? "" : name };
  }

  // Stolens begreb, til det der afhænger af begrebet (fx OUT Writer), uanset hvad stolen hedder.
  function conceptOf(seat) {
    if (!seat) return "";
    return typeof seat.role === "string" && seat.role ? seat.role : String(seat.name || "");
  }

  return { CUSTOM: CUSTOM, MAX_ROLES: MAX_ROLES, normalize: normalize, get: get, upsert: upsert, remove: remove, resolve: resolve, split: split, conceptOf: conceptOf };
});
