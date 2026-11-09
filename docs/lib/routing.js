// Hvem tager næste: forslag og autopilotens grænser. Ren logik uden DOM/Electron: window.RundbordRouting i appen, require() i node-tests.
// Forslaget kommer fra reglerne først (stolens egen 👉 ROLLE, matchet præcist mod bordets stole), ellers fra den faste rækkefølge.
// Autopiloten fortsætter kun, hvis alle grænser holder; ellers er svaret en kode, som appen oversætter til "pause, og hvorfor".
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./seatref.js"));
  else root.RundbordRouting = factory(root.RundbordSeatRef);
})(typeof window !== "undefined" ? window : this, function (SeatRef) {
  var MAX_VISITS = 2; // en stol må tale højst så mange gange i en kørsel under autopilot (undtagen efter tilbagesendelse)

  function maxStepsFor(seatCount) {
    return seatCount + 2;
  }

  // state:
  //   seats    [{ id, name, checks, hasKey }] i bordets rækkefølge
  //   current  indeks på stolen, der lige har svaret
  //   needs    { need, role } fra svarets 🔭/👉-blok, eller null hvis blokken mangler
  // Returnerer { kind: "seat"|"end", idx, source: "stol"|"fast", how: "exact"|"approx"|"fallback", reason, note, suggestedRole, alternatives: [idx] }
  //   note (kun ved fallback eller slut): "none" (stolen mente, ingen skal tage over), "unknown", "ambiguous", "self", "nokey", "nosuggestion", "last"
  function propose(state) {
    var seats = state.seats || [];
    var cur = state.current;
    var needs = state.needs;
    var out = { kind: "seat", idx: -1, source: "fast", how: "fallback", reason: "", note: "", suggestedRole: needs ? String(needs.role || "") : "", alternatives: [] };

    function fixedNext() {
      var next = cur + 1;
      if (next < seats.length) {
        out.idx = next;
        out.source = "fast";
        out.how = "fallback";
        return out;
      }
      out.kind = "end";
      out.idx = -1;
      out.source = "fast";
      out.note = out.note || "last";
      return out;
    }

    function finish() {
      var skip = {};
      skip[cur] = true;
      if (out.idx >= 0) skip[out.idx] = true;
      out.alternatives = seats
        .map(function (s, i) {
          return i;
        })
        .filter(function (i) {
          return !skip[i] && seats[i].hasKey !== false;
        });
      return out;
    }

    if (!needs) {
      out.note = "nosuggestion";
      return finish(fixedNext());
    }
    var m = SeatRef.resolve(needs.role, seats);
    if (m.intentionalNone) {
      out.kind = "end";
      out.source = "stol";
      out.how = "exact";
      out.note = "none";
      out.reason = String(needs.need || "");
      return finish();
    }
    if (m.seat && m.index === cur) {
      out.note = "self";
      return finish(fixedNext());
    }
    if (m.seat && (m.how === "exact" || m.how === "approx")) {
      if (seats[m.index].hasKey === false) {
        out.note = "nokey";
        return finish(fixedNext());
      }
      out.idx = m.index;
      out.source = "stol";
      out.how = m.how;
      out.reason = String(needs.need || "");
      return finish();
    }
    out.note = m.how === "ambiguous" ? "ambiguous" : "unknown";
    return finish(fixedNext());
  }

  // state: { visits: {seatId: antal}, history: [indeks i rækkefølgen af besøg, med den seneste sidst], steps, maxSteps, lastNone: {seatId: true}, fromRework }
  // → { go: true } eller { go: false, code } med code: "end" | "notExact" | "visits" | "maxSteps" | "ring" | "flip"
  function autopilot(proposal, state) {
    var s = state || {};
    var seats = s.seats || [];
    if (!proposal || proposal.kind === "end") return { go: false, code: "end" };
    if (proposal.source !== "stol" || proposal.how !== "exact") return { go: false, code: "notExact" };
    var target = seats[proposal.idx];
    if (!target) return { go: false, code: "notExact" };
    var max = typeof s.maxSteps === "number" ? s.maxSteps : maxStepsFor(seats.length);
    if ((s.steps || 0) >= max) return { go: false, code: "maxSteps" };
    var visits = (s.visits && s.visits[target.id]) || 0;
    if (visits >= MAX_VISITS && !s.fromRework) return { go: false, code: "visits" };
    var h = s.history || [];
    var n = h.length;
    if (n >= 3 && h[n - 1] !== proposal.idx && h[n - 2] === proposal.idx && h[n - 3] === h[n - 1]) return { go: false, code: "ring" };
    if (s.lastNone && s.lastNone[target.id]) return { go: false, code: "flip" };
    return { go: true, code: "" };
  }

  // Skøn for næste trin ud fra stolens egne seneste kald (hændelserne 'call.completed'): { n, costUsd, durationMs } eller null uden historik.
  // Kun kald med kendt pris/tid tæller; tomme felter er null, aldrig 0.
  function estimate(events, seatId, limit) {
    var take = typeof limit === "number" ? limit : 5;
    var calls = (events || [])
      .filter(function (e) {
        return e && e.type === "call.completed" && e.seatId === seatId && e.data;
      })
      .slice(-take);
    if (!calls.length) return null;
    function avg(key) {
      var v = calls
        .map(function (e) {
          return e.data[key];
        })
        .filter(function (x) {
          return typeof x === "number" && isFinite(x);
        });
      return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
    }
    return { n: calls.length, costUsd: avg("costUsd"), durationMs: avg("durationMs") };
  }

  // Bordets indstilling: mode "fixed" (fast rækkefølge, standard) eller "suggest" (foreslået, du godkender); autopilot kun gældende ved "suggest".
  //   approvals = antal forslag i træk, du har godkendt uændret (tæller op til tilbuddet om autopilot); offerDismissed = du har sagt nej tak til tilbuddet.
  var OFFER_AFTER = 8;
  function normalizeSettings(raw) {
    var r = raw && typeof raw === "object" ? raw : {};
    var approvals = Math.floor(Number(r.approvals));
    return {
      mode: r.mode === "suggest" ? "suggest" : "fixed",
      autopilot: r.autopilot === true,
      approvals: isFinite(approvals) && approvals > 0 ? Math.min(approvals, 1000) : 0,
      offerDismissed: r.offerDismissed === true,
    };
  }
  function applySettingsPatch(current, patch) {
    var cur = normalizeSettings(current);
    var p = patch && typeof patch === "object" ? patch : {};
    var next = {
      mode: "mode" in p ? (p.mode === "suggest" ? "suggest" : "fixed") : cur.mode,
      autopilot: "autopilot" in p ? p.autopilot === true : cur.autopilot,
      approvals: "approvals" in p ? normalizeSettings({ approvals: p.approvals }).approvals : cur.approvals,
      offerDismissed: "offerDismissed" in p ? p.offerDismissed === true : cur.offerDismissed,
    };
    if (next.mode === "fixed") next.autopilot = false; // autopilot findes kun ved "foreslået"
    return next;
  }
  // Skal tilbuddet om autopilot vises nu?
  function shouldOfferAutopilot(settings) {
    var s = normalizeSettings(settings);
    return s.mode === "suggest" && !s.autopilot && !s.offerDismissed && s.approvals >= OFFER_AFTER;
  }

  return { normalizeSettings: normalizeSettings, applySettingsPatch: applySettingsPatch, shouldOfferAutopilot: shouldOfferAutopilot, OFFER_AFTER: OFFER_AFTER, propose: propose, autopilot: autopilot, estimate: estimate, maxStepsFor: maxStepsFor, MAX_VISITS: MAX_VISITS };
});
