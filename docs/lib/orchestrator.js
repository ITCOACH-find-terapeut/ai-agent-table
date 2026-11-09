// Kontrolflowet i en kørsel ("start bordet"): rækkefølge, spring over, gentagelser ved
// forbigående fejl, stop, prisgrænse. Ren logik uden DOM/Electron; alt med bivirkninger
// (log, tur, modelkald) kommer udefra som hooks, så flowet kan testes med en falsk udbyder.
// window.RundbordOrchestrator i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordOrchestrator = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // Fejl der plejer at forsvinde af sig selv. Ugyldig nøgle, forkert model o.l. gentages ALDRIG.
  function isRetryable(errorKind) {
    var k = String(errorKind || "");
    if (k === "timeout" || k === "network") return true;
    var m = /^http_(\d{3})$/.exec(k);
    if (!m) return false;
    var code = Number(m[1]);
    return code === 408 || code === 429 || code >= 500;
  }

  function defaultSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // opts:
  //  seats           stolene i rækkefølge
  //  taskText        brugerens opgave
  //  isStopped()     true når brugeren har trykket Stop
  //  retry           { max: 2, delaysMs: [2000, 6000], sleep }   (max 0 slår gentagelser fra)
  //  maxCostUsd      valgfri prisgrænse for kørslen (null = ingen)
  //  spentUsd()      hidtidigt forbrug i kørslen (kun kendt pris tæller)
  //  parseVerdict(seat, reply, source) → {verdict:"pass"|"fail"|"unproven", reason, suggestedRole} | null   (kun for stole med checks;
  //                   source er teksten, kontrollen fik at vurdere; kun "pass" går videre, alt andet afgøres af et menneske,
  //                   og kun "fail" kan sendes tilbage af sig selv)
  //  pickTarget(seats, idx, info) → indeks på stolen arbejdet kan sendes tilbage til, eller -1
  //  chooseNext({seat, idx, reply, steps, history, visits, fromRework}) → Promise<{idx}|{end:true}|{stop:true}>  (valgfri)
  //                  Hvem tager næste efter et vellykket svar. Uden den går kørslen i rækkefølge (idx + 1). Med den kan næste være en
  //                  hvilken som helst stol (også en, der har talt før), og kørslen kan afsluttes eller stoppes af den.
  //  shouldPause({seat, idx, reply, isLast}) → null eller {pause:true, reason, questions}   (valgfri; mandat som stop, se lib/mandate.js)
  //                  Bruges ikke efter kontrolstole (de har deres egen beslutning).
  //  maxReworks      højeste antal tilbagesendelser i én kørsel (standard 2), derefter kræves et menneske
  //  autoRework      true: en tydelig FAIL sendes tilbage af sig selv (uden decide), så længe der er runder tilbage; en uklar dom,
  //                  nået loft eller manglende stol at sende til kræver stadig et menneske
  //  hooks:
  //    onProgress(idx, seat, {round, maxRounds})   før hver stol (runde 1 = første gennemløb, hver tilbagesendelse giver en ny)
  //    onSkip(seat, idx)                           stolen har ingen nøgle
  //    beforeCall({seat, idx, prevSeat, relayText}) → Promise  (tur + brugerbesked); kan give { stop: true, reason } for at stoppe, før stolen kaldes
  //    call({seat, idx, attempt})                  → Promise<{ok, reply, message, errorKind}>
  //    onRetry({seat, idx, attempt, res, delayMs}) → Promise|void
  //    onFail({seat, idx, res, attempts})          → Promise|void
  //    onReply({seat, idx, res})                   → Promise|void
  //    onVerdict({seat, idx, info})                 kontrolstolen har svaret; info er null hvis dommen er uklar
  //    decide({seat, idx, info, targetIdx, canRework, reworks, maxReworks}) → Promise<{action: "rework"|"continue"|"stop"}>
  //    reworkText({seat, targetSeat, reply, info}) → tekst til stolen, der får arbejdet tilbage
  //    pause({seat, idx, reason, questions, reply}) → Promise<{action: "continue"|"stop", note?}>   kørslen holder pause, til brugeren vælger;
  //                  note (brugerens svar) gives til næste stol som beforeCall({humanNote})
  //    onDecision({seat, idx, action, targetIdx, info, auto, round, maxRounds})   auto = tilbagesendelsen skete uden menneskets valg
  //    onEnd({outcome, done, total, failed, reason})
  // Returnerer { outcome: "finished"|"stopped"|"budget", done, total, failed: [idx], reason }.
  function runSequence(opts) {
    var seats = opts.seats || [];
    var hooks = opts.hooks || {};
    var retry = Object.assign({ max: 0, delaysMs: [], sleep: defaultSleep }, opts.retry || {});
    var failed = [];
    var reworks = 0;
    var steps = 0; // antal stole, der er kaldt (bruges af chooseNext og som 'done' ved dynamisk valg)
    var history = []; // indeks på de stole, der er kaldt, i rækkefølge
    var visits = {};
    var maxReworks = opts.maxReworks != null ? opts.maxReworks : 2;

    function finish(outcome, idx, reason) {
      var result = { outcome: outcome, done: idx, total: seats.length, failed: failed.slice(), reason: reason || null };
      return Promise.resolve(hooks.onEnd ? hooks.onEnd(result) : null).then(function () {
        return result;
      });
    }

    function callWithRetry(seat, idx) {
      var attempt = 0;
      function once() {
        attempt += 1;
        return Promise.resolve(hooks.call({ seat: seat, idx: idx, attempt: attempt })).then(function (res) {
          if (res && res.ok) return { res: res, attempts: attempt };
          var canRetry = attempt <= retry.max && isRetryable(res && res.errorKind) && !(opts.isStopped && opts.isStopped());
          if (!canRetry) return { res: res || { ok: false, message: "" }, attempts: attempt };
          var delayMs = retry.delaysMs[attempt - 1] != null ? retry.delaysMs[attempt - 1] : 0;
          return Promise.resolve(hooks.onRetry ? hooks.onRetry({ seat: seat, idx: idx, attempt: attempt, res: res, delayMs: delayMs }) : null)
            .then(function () {
              return retry.sleep(delayMs);
            })
            .then(once);
        });
      }
      return once();
    }

    // Kontrol: bestået → videre. Ikke bestået eller uklar → et menneske afgør (send tilbage, fortsæt, stop).
    function afterCheck(seat, idx, res, source) {
      // source = den tekst, kontrollen fik at vurdere (bruges til kontrol med bevis); kun et tydeligt "pass" går videre
      var info = opts.parseVerdict ? opts.parseVerdict(seat, res.reply, source) : null;
      return Promise.resolve(hooks.onVerdict ? hooks.onVerdict({ seat: seat, idx: idx, info: info }) : null).then(function () {
        if (info && info.verdict === "pass") return advance(idx, res.reply, false);
        var targetIdx = opts.pickTarget ? opts.pickTarget(seats, idx, info) : -1;
        var canRework = targetIdx >= 0 && reworks < maxReworks;
        var auto = Boolean(opts.autoRework) && Boolean(info) && info.verdict === "fail" && canRework;
        var ask = auto
          ? Promise.resolve({ action: "rework" })
          : hooks.decide ? hooks.decide({ seat: seat, idx: idx, info: info, targetIdx: targetIdx, canRework: canRework, reworks: reworks, maxReworks: maxReworks }) : Promise.resolve({ action: "stop" });
        return Promise.resolve(ask).then(function (d) {
          var action = d && d.action;
          if (action === "rework" && !canRework) action = "stop";
          if (action !== "rework" && action !== "continue") action = "stop";
          return Promise.resolve(hooks.onDecision ? hooks.onDecision({ seat: seat, idx: idx, action: action, targetIdx: targetIdx, info: info, auto: auto && action === "rework", round: reworks + 1, maxRounds: maxReworks + 1 }) : null).then(function () {
            if (action === "stop") return finish("stopped", idx + 1, "check");
            if (action === "continue") return advance(idx, res.reply, false);
            reworks += 1;
            var target = seats[targetIdx];
            var text = hooks.reworkText ? hooks.reworkText({ seat: seat, targetSeat: target, reply: res.reply, info: info }) : res.reply;
            return step(targetIdx, text, { fromSeat: seat });
          });
        });
      });
    }

    // Efter et vellykket svar: næste stol. Fast rækkefølge, medmindre der er en chooseNext.
    function advance(idx, reply, fromRework, humanNote) {
      if (!opts.chooseNext) return step(idx + 1, reply, undefined, undefined, humanNote);
      return Promise.resolve(
        opts.chooseNext({ seat: seats[idx], idx: idx, reply: reply, steps: steps, history: history.slice(), visits: Object.assign({}, visits), fromRework: Boolean(fromRework) })
      ).then(function (d) {
        if (opts.isStopped && opts.isStopped()) return finish("stopped", steps, "user");
        if (d && d.stop) return finish("stopped", steps, d.reason || "user");
        if (!d || d.end || typeof d.idx !== "number" || d.idx < 0 || d.idx >= seats.length) return finish("finished", steps);
        return step(d.idx, reply, null, seats[idx], humanNote);
      });
    }

    function step(idx, relayText, rework, prev, humanNote) {
      if (opts.isStopped && opts.isStopped()) return finish("stopped", idx, "user");
      if (idx >= seats.length) return finish("finished", idx);
      if (opts.maxCostUsd != null && opts.spentUsd && opts.spentUsd() >= opts.maxCostUsd) {
        return finish("budget", idx, "budget");
      }
      var seat = seats[idx];
      if (hooks.onProgress) hooks.onProgress(idx, seat, { round: reworks + 1, maxRounds: maxReworks + 1 });
      if (!seat.apiKey) {
        failed.push(idx);
        return Promise.resolve(hooks.onSkip ? hooks.onSkip(seat, idx) : null).then(function () {
          return step(idx + 1, relayText, undefined, undefined, humanNote);
        });
      }
      var prevSeat = rework ? rework.fromSeat : prev || (idx > 0 ? seats[idx - 1] : null);
      steps += 1;
      history.push(idx);
      visits[seat.id] = (visits[seat.id] || 0) + 1;
      return Promise.resolve(hooks.beforeCall({ seat: seat, idx: idx, prevSeat: prevSeat, relayText: relayText, rework: Boolean(rework), round: reworks + 1, maxRounds: maxReworks + 1, humanNote: humanNote || "" }))
        .then(function (bc) {
          // beforeCall kan stoppe kørslen, før stolen kaldes (fx når brugeren siger nej ved kuverten).
          if (bc && bc.stop) return { stopped: bc.reason || "user" };
          return callWithRetry(seat, idx);
        })
        .then(function (out) {
          if (out.stopped) return finish("stopped", idx, out.stopped);
          if (!out.res.ok) {
            failed.push(idx);
            return Promise.resolve(hooks.onFail ? hooks.onFail({ seat: seat, idx: idx, res: out.res, attempts: out.attempts }) : null).then(function () {
              return step(idx + 1, relayText, undefined, undefined, humanNote);
            });
          }
          return Promise.resolve(hooks.onReply ? hooks.onReply({ seat: seat, idx: idx, res: out.res }) : null).then(function () {
            if (seat.checks) return afterCheck(seat, idx, out.res, relayText);
            var gate = opts.shouldPause ? opts.shouldPause({ seat: seat, idx: idx, reply: out.res.reply, isLast: !opts.chooseNext && idx >= seats.length - 1 }) : null;
            if (!gate || !gate.pause || !hooks.pause) return advance(idx, out.res.reply, Boolean(rework));
            return Promise.resolve(hooks.pause({ seat: seat, idx: idx, reason: gate.reason, questions: gate.questions || [], reply: out.res.reply, gate: gate })).then(function (d) {
              if (opts.isStopped && opts.isStopped()) return finish("stopped", idx + 1, "user");
              if (!d || d.action !== "continue") return finish("stopped", idx + 1, "pause");
              return advance(idx, out.res.reply, Boolean(rework), d.note || "");
            });
          });
        });
    }

    return step(0, opts.taskText);
  }

  return { runSequence: runSequence, isRetryable: isRetryable };
});
