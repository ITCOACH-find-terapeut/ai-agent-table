// Runder i et bord med en kontrolstol (fx et makkerpar: en der laver, en der gennemgår). En runde er ét gennemløb, hvor stolen laver
// arbejdet og kontrollen vurderer det; første gennemløb er runde 1. "max" er det højeste antal runder (1 = ingen tilbagesendelse),
// "auto" betyder, at en tydelig FAIL sendes tilbage af sig selv, til loftet er nået. Ellers (uklar dom, loft nået, ingen stol at sende til)
// afgør et menneske. Ren logik; window.RundbordRounds i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordRounds = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MIN_ROUNDS = 1;
  var MAX_ROUNDS = 10;
  var DEFAULT_ROUNDS = 3; // svarer til de to tilbagesendelser, bordet altid har haft

  function clampRounds(v, fallback) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) return fallback;
    return Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, n));
  }

  function normalize(r) {
    r = r && typeof r === "object" ? r : {};
    return { max: clampRounds(r.max, DEFAULT_ROUNDS), auto: r.auto === true };
  }

  function applyPatch(current, patch) {
    var c = normalize(current);
    if (patch && typeof patch === "object") {
      if ("max" in patch) c.max = clampRounds(patch.max, c.max);
      if ("auto" in patch) c.auto = patch.auto === true;
    }
    return c;
  }

  // Højeste antal tilbagesendelser = runder − 1.
  function maxReworks(r) {
    return normalize(r).max - 1;
  }

  return { MIN_ROUNDS: MIN_ROUNDS, MAX_ROUNDS: MAX_ROUNDS, DEFAULT_ROUNDS: DEFAULT_ROUNDS, normalize: normalize, applyPatch: applyPatch, maxReworks: maxReworks };
});
