// Finder den stol, en models "👉 ROLLE"-linje peger på. Ren logik: window.RundbordSeatRef i appen, require() i node-tests.
//
// Tidligere var det en delstreng-søgning på stolenavnet (første træf), så "Tester" også ramte "Tester 2", og to
// stole med overlappende navne gav tilfældige træf. Nu gælder: præcist navn først; kun hvis ingen stol hedder det,
// ét entydigt omtrentligt træf; ellers er svaret "uklart" eller "ingen", og kalderen må ikke gætte.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordSeatRef = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var NONE = ["ingen", "intet", "ingen af dem", "none", "nobody", "no one", "n/a", "na", "-", "–", "—", "?", ""];

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[*_`"'«»“”‘’<>[\]]/g, "")
      .replace(/[.,;:!]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // → { seat, index, how: "exact"|"approx"|"ambiguous"|"none", candidates: [seat], intentionalNone }
  function resolve(raw, seats) {
    var list = Array.isArray(seats) ? seats : [];
    var ref = norm(raw);
    var out = { seat: null, index: -1, how: "none", candidates: [], intentionalNone: false };
    if (NONE.indexOf(ref) >= 0) {
      out.intentionalNone = true;
      return out;
    }
    var exact = [];
    list.forEach(function (s, i) {
      if (norm(s.name) === ref) exact.push(i);
    });
    if (exact.length === 1) return { seat: list[exact[0]], index: exact[0], how: "exact", candidates: [list[exact[0]]], intentionalNone: false };
    if (exact.length > 1) {
      out.how = "ambiguous";
      out.candidates = exact.map(function (i) { return list[i]; });
      return out;
    }
    // Ingen præcis: et entydigt omtrentligt træf, hvor modellens tekst INDEHOLDER stolens fulde navn (mindst tre tegn), fx "Architect-rollen".
    // Omvendt gælder ikke: "Tester" er ikke et træf på "Tester 2", og "Test" er ikke et træf på "Tester" (for løst; så må brugeren vælge).
    var near = [];
    list.forEach(function (s, i) {
      var n = norm(s.name);
      if (n.length >= 3 && ref.indexOf(n) >= 0) near.push(i);
    });
    if (near.length === 1) return { seat: list[near[0]], index: near[0], how: "approx", candidates: [list[near[0]]], intentionalNone: false };
    if (near.length > 1) {
      out.how = "ambiguous";
      out.candidates = near.map(function (i) { return list[i]; });
    }
    return out;
  }

  return { resolve: resolve, norm: norm };
});
