// Det flydende Tredje øje-ikon: et lille øje i hjørnet, der kun markerer det, appen faktisk ved kræver dig.
// Fem ægte tilstande, i denne rækkefølge: kontrol ikke bestået, kørslen holder pause, prisgrænsen nået, API mangler, ting kun du kan afgøre.
// De to første stopper kørslen (block), de øvrige venter på dig (you). Ellers er øjet roligt (calm) og pulserer aldrig.
// Ren logik uden DOM og Electron. window.RundbordEye i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordEye = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var REASONS = ["check", "pause", "budget", "api", "decide"];
  var BLOCKING = { check: true, pause: true };

  function count(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // input: { check, pause, budget (sand), api (antal stole uden API), decide (antal ting, kun du kan afgøre, uden den kontrol, der allerede er med) }
  // → { state: "calm" | "you" | "block", reason: første årsag eller null, reasons: alle aktive i rækkefølge, decide: antal }
  function summarize(input) {
    var i = input || {};
    var decide = count(i.decide);
    var active = {
      check: i.check === true,
      pause: i.pause === true,
      budget: i.budget === true,
      api: count(i.api) > 0,
      decide: decide > 0,
    };
    var reasons = REASONS.filter(function (r) { return active[r]; });
    var reason = reasons.length ? reasons[0] : null;
    return {
      state: !reason ? "calm" : BLOCKING[reason] ? "block" : "you",
      reason: reason,
      reasons: reasons,
      decide: decide,
    };
  }

  // Samme tilstand og samme årsager giver samme signatur; kun en ændring får øjet til at pulsere igen.
  function signature(sum) {
    return sum.state + ":" + sum.reasons.join(",") + ":" + sum.decide;
  }

  // Øjet kan skjules under Indstillinger; det er tændt som standard.
  function normalizeVisible(v) {
    return v === "off" ? "off" : "on";
  }

  return { REASONS: REASONS, summarize: summarize, signature: signature, normalizeVisible: normalizeVisible };
});
