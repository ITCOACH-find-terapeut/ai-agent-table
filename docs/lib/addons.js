// Add-ons: hvad slags ønske er det, tre forudindstillinger i stedet for ti dials, og et blindt "med og uden". Ren logik uden DOM, netværk og Electron.
// Hvad et add-on er, afgør, hvad det kan love:
//   Stil     = en instruktion i prompten. Et ønske til modellen, ingen garanti.
//   Kontrol  = en separat stol med en tydelig dom (PASS/FAIL), der kan stoppe kørslen.
//   Regel    = noget appen selv håndhæver (fx en pause, før næste stol kaldes).
// window.RundbordAddons i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordAddons = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var KINDS = ["style", "check", "rule"];

  // De ti dials er alle stil. Kontrolstolen og appens egne pauser har hver sin art.
  var KIND_OF = {
    reason: "style", curiosity: "style", selfCheck: "style", challenge: "style", risk: "style", uncertainty: "style",
    action: "style", humanImpact: "style", modifyRules: "style", cost: "style",
    checks: "check",
    mandate: "rule", mandateGate: "rule", pause: "rule", envelope: "rule", ownTake: "rule",
  };

  function kindOf(key) {
    return KIND_OF[key] || "style";
  }

  // Forudindstillingerne rører kun de seks dials om tænkning og kritisk vurdering. Selvstændighed, menneskelig konsekvens,
  // regler og omkostning ændres aldrig stiltiende af en forudindstilling.
  var PRESET_KEYS = ["reason", "curiosity", "selfCheck", "challenge", "risk", "uncertainty"];
  var PRESETS = {
    fast: {
      reason: { state: "off" }, curiosity: { state: "off" }, selfCheck: { state: "off" },
      challenge: { state: "off" }, risk: { state: "off" }, uncertainty: { state: "off" },
    },
    thorough: {
      reason: { state: "on", strength: 6 }, curiosity: { state: "off" }, selfCheck: { state: "on" },
      challenge: { state: "off" }, risk: { state: "off" }, uncertainty: { state: "on" },
    },
    critical: {
      reason: { state: "on", strength: 8 }, curiosity: { state: "off" }, selfCheck: { state: "on" },
      challenge: { state: "on", strength: 8 }, risk: { state: "on", strength: 7 }, uncertainty: { state: "on" },
    },
  };
  var PRESET_ORDER = ["fast", "thorough", "critical"];

  function clone(x) {
    return JSON.parse(JSON.stringify(x == null ? null : x));
  }

  // dials: stolens dials; specs: { nøgle: { states: [...], hasStrength } } (fra kataloget). → nye dials, kun forudindstillingens nøgler ændret
  function applyPreset(dials, presetKey, specs) {
    var preset = PRESETS[presetKey];
    var out = clone(dials) || {};
    if (!preset) return out;
    PRESET_KEYS.forEach(function (key) {
      var want = preset[key];
      var spec = specs && specs[key];
      if (!want || !spec || spec.states.indexOf(want.state) < 0) return;
      var cur = out[key] || {};
      var next = { state: want.state, note: cur.note || "" };
      if (spec.hasStrength) next.strength = want.strength || cur.strength || 6;
      out[key] = next;
    });
    return out;
  }

  // Hvilken forudindstilling stolen står på lige nu ("custom", hvis ingen passer præcist). Styrken tæller kun, hvor den har betydning.
  function detectPreset(dials, specs) {
    for (var i = 0; i < PRESET_ORDER.length; i++) {
      var key = PRESET_ORDER[i];
      var applied = applyPreset(dials, key, specs);
      var same = PRESET_KEYS.every(function (k) {
        var a = (dials && dials[k]) || {};
        var b = applied[k] || {};
        if ((a.state || "") !== (b.state || "")) return false;
        return !(specs && specs[k] && specs[k].hasStrength && b.state !== "off" && Number(a.strength || 6) !== Number(b.strength || 6));
      });
      if (same) return key;
    }
    return "custom";
  }

  // De dials, der er slået til (kandidater til "prøv uden"). neutralOf: nøgle → fra-tilstand.
  function activeKeys(dials, neutralOf) {
    return Object.keys(dials || {}).filter(function (k) {
      var st = dials[k] && dials[k].state;
      return st && st !== (neutralOf && neutralOf[k] ? neutralOf[k] : "off") && st !== "off" && st !== "no";
    });
  }

  // "Uden": den valgte dial slået fra (eller alle, med "__all"). → nye dials
  function without(dials, which, neutralOf) {
    var out = clone(dials) || {};
    var keys = which === "__all" ? activeKeys(out, neutralOf) : [which];
    keys.forEach(function (k) {
      if (!out[k]) return;
      out[k].state = neutralOf && neutralOf[k] ? neutralOf[k] : "off";
    });
    return out;
  }

  // Blind rækkefølge: hvilket af de to svar (A, B) der er "med". rand: et tal i [0,1).
  function blindOrder(rand) {
    return Number(rand) < 0.5 ? { A: "with", B: "without" } : { A: "without", B: "with" };
  }

  // Dit valg (A, B eller ingen forskel) oversat til, hvad det betyder. → "with" | "without" | "none"
  function resolvePick(pick, order) {
    if (pick === "A" || pick === "B") return order[pick];
    return "none";
  }

  return {
    KINDS: KINDS, kindOf: kindOf, PRESET_KEYS: PRESET_KEYS, PRESET_ORDER: PRESET_ORDER, PRESETS: PRESETS,
    applyPreset: applyPreset, detectPreset: detectPreset, activeKeys: activeKeys, without: without, blindOrder: blindOrder, resolvePick: resolvePick,
  };
});
