// Sammenhæng mellem ikonerne under stolen (mandat, arbejdsform) og de kognitive dials. De to overlapper i betydning:
//   🧠 Tænk ↔ Ræsonnement (reason)       ♥ Omtanke ↔ Menneskelig konsekvens (humanImpact)
//   👣 Handling og mandatet ✓/?/✕ ↔ Selvstændighed (action)
// Dials er den samme sandhed; ikonerne er genveje til dem. Ren logik uden DOM: window.RundbordSeatSync i appen,
// require() i main.js og node-tests. Intet her ændrer en stols indstillinger uden en udtrykkelig ændring eller en
// rydning af en modstrid, som beskrevet ved reconcile().
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordSeatSync = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var WORK = { tanke: "reason", omtanke: "humanImpact", handling: "action" };
  var WORK_KEYS = Object.keys(WORK);

  function clone(x) {
    return JSON.parse(JSON.stringify(x == null ? null : x));
  }

  function emptyIcons() {
    return { mandate: "kan", work: { tanke: false, omtanke: false, handling: false }, info: { sten: false, papir: false, saks: false } };
  }

  function normIcons(icons) {
    var out = clone(icons) || emptyIcons();
    out.work = Object.assign({ tanke: false, omtanke: false, handling: false }, out.work || {});
    out.info = Object.assign({ sten: false, papir: false, saks: false }, out.info || {});
    if (["kan", "foreslaa", "ikke"].indexOf(out.mandate) < 0) out.mandate = "kan";
    return out;
  }

  // En dial regnes for aktiv, når den ikke er "fra". Selvstændighed ("action") er aktiv ved til og efter behov.
  function active(dials, key) {
    var d = dials && dials[key];
    return Boolean(d && d.state && d.state !== "off" && d.state !== "no");
  }

  function setActive(dials, key, on) {
    dials[key] = Object.assign({ strength: 6, note: "" }, dials[key] || {});
    if (on) {
      if (!dials[key].state || dials[key].state === "off") dials[key].state = "on";
      if (!dials[key].strength) dials[key].strength = 6;
    } else {
      dials[key].state = "off";
    }
  }

  function changedWork(prev, next) {
    var out = {};
    WORK_KEYS.forEach(function (k) {
      if (Boolean(prev.work[k]) !== Boolean(next.work[k])) out[k] = Boolean(next.work[k]);
    });
    return out;
  }

  function changedDial(prevDials, nextDials, key) {
    var a = prevDials && prevDials[key];
    var b = nextDials && nextDials[key];
    return JSON.stringify(a || null) !== JSON.stringify(b || null);
  }

  // Rydder en stol, der aldrig er set af dette program før (eller en gammel, uenig stol):
  //  - arbejdsformer: tændt det ene sted = tændt begge steder (intet af det, modellen blev fortalt, forsvinder)
  //  - selvstændighed: det mest tilbageholdende vinder (foreslå/ikke slår "må selv"; dialen "kun forslag" slår mandatet "må selv")
  function legacyHeal(icons, dials) {
    WORK_KEYS.forEach(function (k) {
      if (icons.work[k] && !active(dials, WORK[k])) setActive(dials, WORK[k], true);
    });
    if (active(dials, "action") && icons.mandate !== "kan") setActive(dials, "action", false);
    else if (!active(dials, "action") && icons.mandate === "kan") icons.mandate = "foreslaa";
    return deriveIcons(icons, dials);
  }

  // Ikonerne vises ud fra dialerne, så de aldrig kan stå anderledes end det, modellen får at vide.
  function deriveIcons(icons, dials) {
    WORK_KEYS.forEach(function (k) {
      icons.work[k] = active(dials, WORK[k]);
    });
    if (active(dials, "action")) icons.mandate = "kan";
    else if (icons.mandate === "kan") icons.mandate = "foreslaa";
    return { icons: icons, dials: dials };
  }

  // prev: stolen som den var gemt (eller null). next: stolen, som den nu skal gemmes.
  // Returnerer { icons, dials } hvor de to er enige om de overlappende indstillinger.
  //  - Uden prev ryddes modstrider efter legacyHeal().
  //  - Med prev: en udtrykkelig ændring (af et ikon eller af en dial i forhold til det gemte) afgør, hvad der gælder for netop den
  //    indstilling. Er begge ændret, vinder dialen (den er den præcise). Alt det øvrige ryddes efter legacyHeal().
  function reconcile(prev, next) {
    var icons = normIcons(next && next.icons);
    var dials = clone((next && next.dials) || {});
    if (!prev) return legacyHeal(icons, dials);

    var prevIcons = normIcons(prev.icons);
    var prevDials = prev.dials || {};
    var w = changedWork(prevIcons, icons);
    var affected = {};
    WORK_KEYS.forEach(function (k) {
      var dk = WORK[k];
      if (changedDial(prevDials, dials, dk)) affected[dk] = true;
      else if (k in w) {
        setActive(dials, dk, w[k]);
        affected[dk] = true;
      }
    });
    if (changedDial(prevDials, dials, "action")) affected.action = true;
    else if (prevIcons.mandate !== icons.mandate) {
      setActive(dials, "action", icons.mandate === "kan");
      affected.action = true;
    }
    // Det udtrykkeligt ændrede følger sin dial med det samme, så en gammel modstrid ikke kan fortryde det bagefter
    WORK_KEYS.forEach(function (k) {
      if (affected[WORK[k]]) icons.work[k] = active(dials, WORK[k]);
    });
    if (affected.action) {
      if (active(dials, "action")) icons.mandate = "kan";
      else if (icons.mandate === "kan") icons.mandate = "foreslaa";
    }
    return legacyHeal(icons, dials);
  }

  // Et klik på et ikon: giver stolens nye ikoner OG dials, begge afledt af den STOL, DER VISES (de ryddede indstillinger).
  // Det skal ikke afgøres af, hvad der tilfældigvis står gemt: en ny stol har gemte ikoner "fra", men dialen Selvstændighed
  // "til", og viser derfor 👣 tændt. Et klik på 👣 skal så slukke den, selv om det gemte ikon allerede var "fra".
  // group: "mandate" | "work" | "info"; key: fx "kan", "tanke", "sten".
  function clickIcon(seat, group, key) {
    var synced = reconcile(null, seat || {});
    var icons = normIcons(synced.icons);
    var dials = synced.dials;
    if (group === "mandate") {
      if (["kan", "foreslaa", "ikke"].indexOf(key) < 0) return synced;
      icons.mandate = key;
      setActive(dials, "action", key === "kan");
    } else if (group === "work" && WORK[key]) {
      icons.work[key] = !icons.work[key];
      setActive(dials, WORK[key], icons.work[key]);
    } else if (group === "info" && key in icons.info) {
      icons.info[key] = !icons.info[key];
    }
    return deriveIcons(icons, dials);
  }

  // Visning og instruktion bruger altid de ryddede ikoner (uden at gemme noget).
  function effectiveIcons(seat) {
    return reconcile(null, seat || {}).icons;
  }

  return { reconcile: reconcile, clickIcon: clickIcon, effectiveIcons: effectiveIcons, WORK: WORK };
});
