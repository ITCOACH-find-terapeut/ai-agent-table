// Visningstilstand for bordet og stolene, afledt af det systemet kan dokumentere. Ren logik uden tekster og uden DOM:
// seatView() returnerer nøgler og værdier, som visningen oversætter; tableMode() vælger bordets visning ud fra bredden.
// window.RundbordViewState i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordViewState = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MODES = ["round", "compact", "list"];
  var PREFS = ["auto", "round", "compact", "list"];
  // Bredden på bordets kolonne (px), hvor automatisk visning skifter. HYST holder en visning fast, til bredden er
  // HYST px forbi grænsen, så bordet ikke flimrer, når bredden ligger lige på den.
  var ROUND_MIN = 480;
  var COMPACT_MIN = 340;
  var HYST = 24;

  function normalizePref(v) {
    return PREFS.indexOf(v) >= 0 ? v : "auto";
  }

  // pref: auto|round|compact|list (en låst visning gælder altid). prev: den visning, automatikken sidst valgte.
  function tableMode(width, pref, prev) {
    pref = normalizePref(pref);
    if (MODES.indexOf(pref) >= 0) return pref;
    var w = Number(width);
    if (!isFinite(w) || w <= 0) return MODES.indexOf(prev) >= 0 ? prev : "round";
    var wantRound = prev === "round" ? w >= ROUND_MIN - HYST : w >= ROUND_MIN + (prev ? HYST : 0);
    if (wantRound) return "round";
    var wantCompact = prev === "list" ? w >= COMPACT_MIN + HYST : prev === "compact" || prev === "round" ? w >= COMPACT_MIN - HYST : w >= COMPACT_MIN;
    return wantCompact ? "compact" : "list";
  }

  function nameOf(list, i) {
    return list[i] ? list[i].name : "";
  }

  // seat: { id, name }. ctx:
  //   order        stolene i kørslens/bordets rækkefølge ([{ id, name }])
  //   runActive    om en kørsel er i gang;  runIndex  hvilket trin der kører (0-baseret);  runFinished  kørslen er færdig
  //   failedIds    stole, hvis kald fejlede
  //   pendingCheckId  kontrolstolen, hvis resultat venter på din beslutning (kørslen holder pause); pendingKind "pause" = mandatets stop efter en almindelig stol
  //   turnSeatId   den stol, der har kronen
  //   needSeatIds  stole, som et åbent behov peger på;  needText  { seatId: tekst } (valgfri)
  //   handoff      { fromId, toId } mens en overdragelse sker
  //   dynamic      kørslen vælger næste stol undervejs (ikke fast rækkefølge); så bruges disse i stedet for rækkefølgen:
  //                currentId (stolen, der svarer nu), visitedIds (stole, der har svaret), handedTo { seatId: navn }, nextId (foreslået/valgt næste),
  //                routePendingId (stolen, der lige har svaret, mens der ventes på valget af næste)
  // Returnerer { key, decide, turn, needsYou, activity: { kind, ...params } }. Intet opfindes: mangler en kilde, er feltet tomt.
  function seatView(seat, ctx) {
    ctx = ctx || {};
    var order = ctx.order || [];
    var idx = -1;
    order.forEach(function (s, i) {
      if (s.id === seat.id) idx = i;
    });
    var prevName = idx > 0 ? nameOf(order, idx - 1) : "";
    var nextName = idx >= 0 ? nameOf(order, idx + 1) : "";
    var needs = (ctx.needSeatIds || []).indexOf(seat.id) >= 0;
    var needText = (ctx.needText && ctx.needText[seat.id]) || "";
    var turn = ctx.turnSeatId === seat.id;
    var out = { key: "waiting", decide: false, turn: turn, needsYou: needs, activity: { kind: "none" } };

    var h = ctx.handoff;
    if (h && h.fromId === seat.id) {
      out.key = "handing";
      out.activity = { kind: "handing", to: nextName };
      return out;
    }
    if (h && h.toId === seat.id) {
      out.key = "receiving";
      out.activity = { kind: "receiving", from: prevName };
      return out;
    }
    if ((ctx.failedIds || []).indexOf(seat.id) >= 0) {
      out.key = "failed";
      out.activity = { kind: "failed" };
      return out;
    }
    if (ctx.dynamic && (ctx.runActive || ctx.runFinished || ctx.pendingCheckId)) {
      var visited = (ctx.visitedIds || []).indexOf(seat.id) >= 0;
      var handed = (ctx.handedTo && ctx.handedTo[seat.id]) || "";
      if (ctx.pendingCheckId) {
        if (seat.id === ctx.pendingCheckId) {
          out.key = ctx.pendingKind === "pause" ? "pause-ask" : "check-failed";
          out.decide = true;
          out.turn = true;
          out.activity = { kind: ctx.pendingKind === "pause" ? "pauseAsk" : "checkFailed" };
          return out;
        }
        if (visited) {
          out.key = "done";
          out.activity = handed ? { kind: "handedOver", to: handed } : { kind: "finished" };
          return out;
        }
        out.key = "paused";
        out.activity = { kind: "none" };
        return out;
      }
      if (ctx.routePendingId === seat.id) {
        out.key = "choosing";
        out.decide = true;
        out.turn = true;
        out.activity = { kind: "choosing" };
        return out;
      }
      if (ctx.currentId === seat.id && ctx.runActive) {
        out.key = "working";
        out.turn = true;
        out.activity = { kind: "calling" };
        return out;
      }
      if (visited) {
        out.key = "done";
        out.activity = ctx.runFinished || !handed ? { kind: "finished" } : { kind: "handedOver", to: handed };
        return out;
      }
      if (ctx.runFinished) {
        out.key = "unused";
        out.activity = { kind: "none" };
        return out;
      }
      if (ctx.nextId === seat.id) {
        out.key = "next";
        out.activity = { kind: "proposed" };
        return out;
      }
      if (needs) {
        out.key = "need";
        out.decide = true;
        out.activity = { kind: "need", text: needText };
        return out;
      }
      out.key = "waiting";
      out.activity = { kind: "none" };
      return out;
    }
    if (ctx.pendingCheckId) {
      var chk = -1;
      order.forEach(function (s, i) {
        if (s.id === ctx.pendingCheckId) chk = i;
      });
      if (seat.id === ctx.pendingCheckId) {
        out.key = ctx.pendingKind === "pause" ? "pause-ask" : "check-failed";
        out.decide = true;
        out.turn = true;
        out.activity = { kind: ctx.pendingKind === "pause" ? "pauseAsk" : "checkFailed" };
        return out;
      }
      if (idx >= 0 && chk >= 0 && idx < chk) {
        out.key = "done";
        out.activity = { kind: "handedOver", to: nextName };
        return out;
      }
      out.key = "paused";
      out.activity = { kind: "waitingFor", name: prevName };
      return out;
    }
    if (ctx.runActive || ctx.runFinished) {
      var cur = Number(ctx.runIndex);
      if (ctx.runFinished || (idx >= 0 && idx < cur)) {
        out.key = "done";
        out.activity = nextName ? { kind: "handedOver", to: nextName } : { kind: "finished" };
        return out;
      }
      if (idx === cur) {
        out.key = "working";
        out.turn = true;
        out.activity = { kind: "calling" };
        return out;
      }
      if (needs) {
        out.key = "need";
        out.decide = true;
        out.activity = { kind: "need", text: needText };
        return out;
      }
      if (idx === cur + 1) {
        out.key = "next";
        out.activity = { kind: "waitingFor", name: prevName };
        return out;
      }
      out.key = "waiting";
      out.activity = idx > 0 ? { kind: "waitingFor", name: prevName } : { kind: "none" };
      return out;
    }
    if (needs) {
      out.key = "need";
      out.decide = true;
      out.activity = { kind: "need", text: needText };
      return out;
    }
    if (turn) {
      out.key = "turn";
      out.activity = { kind: "idle" };
      return out;
    }
    return out;
  }


  // ---------------- Projektets centrum (plaquen) og IN/OUT-båndet ----------------
  // Kun fakta, appen har: kørslens tilstand, forbrug, prisgrænse, GitHub-adresse, Beskyttelse og filerne i IN/OUT.
  //   board: { projectName, githubUrl, seatCount }
  //   ctx:   { runActive, runFinished, pendingCheck, runIndex, runTotal, runSeatName, spentUsd (eller null), limitUsd (eller null),
  //            shield, inCount, outCount, readerCount }
  function repoFromUrl(url) {
    var u = String(url || "").trim().replace(/^https?:\/\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    return u.replace(/^github\.com\//, "");
  }

  function centreView(board, ctx) {
    var b = board || {};
    var c = ctx || {};
    var out = {
      name: b.projectName || "",
      github: { connected: Boolean(b.githubUrl), repo: repoFromUrl(b.githubUrl) },
      state: { key: "ready", current: null, total: null, seat: "" },
      spend: null,
      shield: c.shield === true,
    };
    if (!b.seatCount) out.state.key = "empty";
    else if (c.pendingCheck) out.state = { key: c.pendingKind === "pause" ? "pause-you" : "pause", current: null, total: c.runTotal || null, seat: c.runSeatName || "" };
    else if (c.runActive && c.routePending) out.state = { key: "choose", current: null, total: null, seat: c.runSeatName || "" };
    else if (c.runActive) out.state = { key: "running", current: (c.runIndex || 0) + 1, total: c.runTotal || null, seat: c.runSeatName || "" };
    else if (c.runFinished) out.state.key = "finished";
    if (typeof c.spentUsd === "number") out.spend = { usd: c.spentUsd, limitUsd: typeof c.limitUsd === "number" && c.limitUsd > 0 ? c.limitUsd : null };
    return out;
  }

  // io: { in: [{name, modified}], out: [{name, modified}] } (nyeste først, som main.js leverer dem), readerCount = stole der læser IN
  function ioView(io, readerCount) {
    var inn = (io && io.in) || [];
    var outt = (io && io.out) || [];
    var readers = readerCount || 0;
    var inState = !inn.length ? "empty" : readers > 0 ? "read" : "unread";
    return {
      in: { count: inn.length, readers: readers, state: inState },
      out: { count: outt.length, latest: outt.length ? { name: outt[0].name, modified: outt[0].modified || null } : null },
    };
  }

  return { centreView: centreView, ioView: ioView, repoFromUrl: repoFromUrl, seatView: seatView, tableMode: tableMode, normalizePref: normalizePref, MODES: MODES, PREFS: PREFS, ROUND_MIN: ROUND_MIN, COMPACT_MIN: COMPACT_MIN, HYST: HYST };
});
