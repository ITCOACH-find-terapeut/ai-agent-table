// 14-run.js
// Kør bordet: orkestrering, kontrolpause, start-bekræftelse.

  function updateRunUI(statusText) {
    document.getElementById("runStopBtn").hidden = !runActive;
    renderRecipientCaption();
    if (statusText) document.getElementById("runStatus").textContent = statusText;
  }

  function renderRunProgress(seats, currentIdx) {
    var wrap = document.getElementById("runProgress");
    if (!seats || !seats.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    if (runView.dynamic) {
      // dynamisk valg: stolene står i bordets rækkefølge; besøgte er færdige, den der svarer nu er aktiv
      wrap.innerHTML = seats
        .map(function (seat) {
          var cls = "run-step";
          if (runView.currentId === seat.id && runActive) cls += " active";
          else if (runView.visitedIds.indexOf(seat.id) >= 0) cls += " done";
          return '<span class="' + cls + '"><span class="dot"></span>' + escapeHtml(seat.name) + "</span>";
        })
        .join("");
      return;
    }
    wrap.innerHTML = seats
      .map(function (seat, i) {
        var cls = "run-step";
        if (runFailedIndexes.indexOf(i) >= 0) cls += " failed";
        else if (i < currentIdx || (i === currentIdx && !runActive && currentIdx >= seats.length)) cls += " done";
        else if (i === currentIdx && runActive) cls += " active";
        return '<span class="' + cls + '"><span class="dot"></span>' + escapeHtml(seat.name) + "</span>";
      })
      .join("");
  }

  function systemNote(text, meta) {
    return window.rundbord.addMessage(store.activeBoardId, "__system__", text, "system", meta).then(function (s) {
      store = s;
      renderLog();
    });
  }

  // Id'er for den igangværende automatiske kørsel (kun én ad gangen).
  var runCtx = { taskId: null, runId: null };

  var pendingDecision = null;
  var pendingPause = null;

  // Mandatet er sat til at stoppe efter en stol (lib/mandate.js): ⏸ stopper altid, ? stopper, når stolen har et spørgsmål, kun brugeren kan afgøre.
  // Brugerens svar eller kommentar gives videre til næste stol (hooks.beforeCall → humanNote). Intet gemmes som tekst i hændelserne.
  // "Se svaret": svaret åbner i selve pausepanelet (ingen rulning i samtalen), og panelet får en ramme, indtil du har svaret eller skjuler svaret.
  function resetPauseAnswer() {
    document.getElementById("pausePanel").classList.remove("pause-framed");
    document.getElementById("pauseAnswer").hidden = true;
    var btn = document.getElementById("pauseSeeBtn");
    btn.textContent = t("pauseSeeBtn");
    btn.setAttribute("aria-expanded", "false");
  }

  function togglePauseAnswer() {
    var box = document.getElementById("pauseAnswer");
    if (!box.hidden) {
      resetPauseAnswer();
      return;
    }
    var id = lastMessageId();
    var msg = (currentBoard().messages || []).filter(function (m) {
      return m.id === id;
    })[0];
    var seat = msg ? seatById(msg.seatId) : null;
    var text = msg ? (parseNeedsSummary(msg.text) ? stripNeedsSummary(msg.text) : String(msg.text || "")) : "";
    document.getElementById("pauseAnswerWho").textContent = t("pauseAnswerFrom", { seat: seat ? seat.name : "?" });
    document.getElementById("pauseAnswerText").innerHTML = text.trim() ? shieldHtml(text) : escapeHtml(t("pauseAnswerEmpty"));
    box.hidden = false;
    document.getElementById("pausePanel").classList.add("pause-framed");
    var btn = document.getElementById("pauseSeeBtn");
    btn.textContent = t("pauseHideBtn");
    btn.setAttribute("aria-expanded", "true");
    document.getElementById("pauseAnswerText").focus({ preventScroll: true });
  }

  function askPauseDecision(o, seats) {
    var always = o.reason === "always";
    var edge = o.reason === "edge";
    var toName = (o.gate && o.gate.toName) || "";
    document.getElementById("pauseTitle").textContent = edge ? t("pauseTitleEdge", { seat: o.seat.name, next: toName }) : t(always ? "pauseTitleAlways" : "pauseTitleQuestion", { seat: o.seat.name });
    document.getElementById("pauseReason").textContent = edge ? t("pauseReasonEdge", { seat: o.seat.name, next: toName }) : t(always ? "pauseReasonAlways" : "pauseReasonQuestion", { seat: o.seat.name });
    var box = document.getElementById("pauseQuestions");
    var qs = o.questions && o.questions.length ? o.questions : [];
    box.innerHTML = qs.length
      ? qs.map(function (q, i) {
          return '<p class="pause-q">' + escapeHtml(shieldRestoreText(q.text)) + '</p><textarea class="pause-a" rows="2" data-i="' + i + '" placeholder="' + escapeHtml(t("pauseAnswerPlaceholder")) + '"></textarea>';
        }).join("")
      : '<textarea class="pause-a pause-comment" rows="2" placeholder="' + escapeHtml(t("pauseCommentPlaceholder")) + '"></textarea>';
    document.getElementById("pauseSkipBtn").hidden = !qs.length;
    resetPauseAnswer();
    document.getElementById("pausePanel").hidden = false;
    updateRunUI(t("pauseWaiting", { seat: o.seat.name }));
    runView.pauseSeatId = o.seat.id;
    renderSeats();
    emitEvent("run.paused", o.seat.id, runCtx, { reason: o.reason, questions: qs.length }, lastMessageId());
    return new Promise(function (resolve) {
      pendingPause = function (action) {
        pendingPause = null;
        var fields = Array.prototype.slice.call(box.querySelectorAll("textarea"));
        var answered = [];
        if (action === "continue" || action === "skip") {
          if (qs.length) {
            qs.forEach(function (q, i) {
              var text = fields[i] ? fields[i].value.trim() : "";
              if (action === "skip" || !text) answered.push({ question: q.text, skipped: true });
              else answered.push({ question: q.text, answer: text });
            });
          } else if (fields[0] && fields[0].value.trim()) {
            answered.push({ comment: fields[0].value.trim() });
          }
        }
        answered.forEach(function (a) {
          if (a.comment) emitEvent("pause.commented", o.seat.id, runCtx, {}, lastMessageId());
          else emitEvent(a.skipped ? "question.skipped" : "question.answered", o.seat.id, runCtx, {}, lastMessageId());
        });
        runView.pauseSeatId = null;
        resetPauseAnswer();
        document.getElementById("pausePanel").hidden = true;
        renderSeats();
        if (action === "stop") return resolve({ action: "stop" });
        emitEvent("run.resumed", o.seat.id, runCtx, { answered: answered.filter(function (a) { return !a.skipped && !a.comment; }).length, skipped: answered.filter(function (a) { return a.skipped; }).length }, lastMessageId());
        // Svar og bevidste udeladelser gemmes på stolens svar, så pilen og Næste skridt viser dem som afgjort, og de kommer med i beslutningsregistret,
        // som følger med til de næste stole. En kommentar (uden spørgsmål) går kun til næste stol.
        var reply = latestReplyOf(o.seat.id);
        var saved = reply
          ? answered.filter(function (a) { return a.question; }).reduce(function (p, a) {
              return p.then(function () {
                return recordDecision(reply.id, a.question, a.skipped ? { skipped: true } : { answer: a.answer });
              });
            }, Promise.resolve())
          : Promise.resolve();
        saved.then(function () {
          resolve({ action: "continue", note: window.RundbordMandate.humanNoteText(t, answered.filter(function (a) { return a.comment; })) });
        });
      };
    });
  }

  // Afslutningstjek (regler, ingen model): efter en kørsel siges det, hvor mange spørgsmål til dig der stadig er åbne, og hvilke.
  function closingCheckNote() {
    var cc = window.RundbordDecisions.closingCheck(collectRegister());
    if (!cc.open) return Promise.resolve();
    emitEvent("run.closingcheck", null, runCtx, { open: cc.open, decided: cc.decided });
    return systemNote(t("closingCheckNote", { n: cc.open, list: cc.items.map(function (x) { return "«" + shieldRestoreText(x.question) + "» (" + x.seat + ")"; }).join("; ") }));
  }

  // Kontrollen er ikke bestået (eller uklar): kørslen holder pause, og du vælger. Intet sker af sig selv.
  function askCheckDecision(o, seats) {
    var target = o.targetIdx >= 0 ? seats[o.targetIdx] : null;
    var unproven = Boolean(o.info && o.info.verdict === "unproven");
    document.getElementById("checkTitle").textContent = unproven
      ? t("checkUnprovenTitle", { seat: o.seat.name })
      : o.info ? t("checkFailedTitle", { seat: o.seat.name }) : t("checkUnclearTitle", { seat: o.seat.name });
    document.getElementById("checkReason").textContent = unproven
      ? t(o.info.evidence && o.info.evidence.status === "none" ? "checkUnprovenNone" : "checkUnprovenMissing", { found: o.info.evidence ? o.info.evidence.found : 0, total: o.info.evidence ? o.info.evidence.total : 0 })
      : o.info && o.info.reason ? o.info.reason : o.info ? t("reworkNoReason") : t("checkUnclearBody");
    var reworkBtn = document.getElementById("checkReworkBtn");
    reworkBtn.hidden = !o.canRework;
    if (o.canRework) reworkBtn.textContent = t("checkReworkBtn", { seat: target.name });
    document.getElementById("checkLimitNote").textContent = !o.canRework && target
      ? t("checkLimitReached", { max: o.maxReworks })
      : t("checkRoundsNote", { done: o.reworks, max: o.maxReworks });
    document.getElementById("checkPanel").hidden = false;
    updateRunUI(t("checkWaiting"));
    runView.checkSeatId = o.seat.id;
    renderSeats();
    return new Promise(function (resolve) {
      pendingDecision = function (action) {
        pendingDecision = null;
        runView.checkSeatId = null;
        document.getElementById("checkPanel").hidden = true;
        resolve({ action: action });
      };
    });
  }

  // Hidtidigt forbrug i den igangværende kørsel (kun kald med kendt pris tæller).
  function runSpentUsd() {
    var total = 0;
    (currentBoard().events || []).forEach(function (e) {
      if (e.type === "call.completed" && e.runId === runCtx.runId && e.data && typeof e.data.costUsd === "number") {
        total += e.data.costUsd;
      }
    });
    return total;
  }

  function usdText(n) {
    return "$" + (n < 0.01 ? n.toFixed(4) : n.toFixed(2));
  }

  var RUN_RETRY = { max: 2, delaysMs: [2000, 6000] };

  // Kontrolflowet (rækkefølge, spring over, gentagelser, stop, prisgrænse) ligger i
  // lib/orchestrator.js og er testet med en falsk udbyder. Her ligger kun det, der rører
  // ved skærm og lager: hooks til log, tur, modelkald og statuslinje.
  function startRunSequence(seats, taskText) {
    var board = currentBoard();
    var limit = typeof board.maxRunCostUsd === "number" && board.maxRunCostUsd > 0 ? board.maxRunCostUsd : null;
    var rounds = window.RundbordRounds.normalize(board.rounds);
    var hasChecker = seats.some(function (x) { return x.checks; });
    return window.RundbordOrchestrator.runSequence({
      seats: seats,
      taskText: taskText,
      isStopped: function () {
        return !runActive;
      },
      retry: RUN_RETRY,
      maxCostUsd: limit,
      spentUsd: runSpentUsd,
      maxReworks: window.RundbordRounds.maxReworks(rounds),
      autoRework: rounds.auto,
      chooseNext: runView.dynamic
        ? function (o) {
            return chooseNextSeat(o, seats, taskText);
          }
        : undefined,
      shouldPause: function (o) {
        var board = currentBoard();
        var summary = parseNeedsSummary(o.reply);
        var needs = summary ? { need: summary.need, type: summary.needType, empty: isEmptyNeed(summary.need) } : null;
        var roleIsSeat = summary ? Boolean(window.RundbordSeatRef.resolve(summary.role, seats).seat) : false;
        var questions = window.RundbordMandate.humanQuestions(needs, roleIsSeat);
        var gate = null;
        // Mandatet som stop: ✓ kører videre, ? stopper ved et spørgsmål til dig, ⏸ stopper altid (kun når bordets indstilling er slået til).
        if (board.mandateGate === true) {
          var mandate = window.RundbordSeatSync.reconcile(null, o.seat).icons.mandate;
          gate = window.RundbordMandate.gateFor({ gate: true, mandate: mandate, checks: Boolean(o.seat.checks), isLast: o.isLast, questions: questions });
        }
        // Pause på pilen til næste stol: lægges oveni mandatet og gælder uanset den indstilling. Kun i fast rækkefølge; ved dynamisk valg vælger du selv næste stol.
        if (!gate && !o.isLast && !o.seat.checks && !runView.dynamic) {
          var next = null;
          for (var j = o.idx + 1; j < seats.length && !next; j++) if (seats[j].apiKey) next = seats[j];
          if (next && window.RundbordEdges.get(board.edges, o.seat.id, next.id).pause) {
            gate = { pause: true, reason: "edge", questions: questions.slice(0, window.RundbordMandate.MAX_SHOWN), toName: next.name };
          }
        }
        return gate;
      },
      parseVerdict: function (seat, reply, source) {
        // Med "Kræv bevis for PASS" gælder et PASS kun, hvis citaterne findes ordret i det, kontrollen fik at vurdere.
        var v = window.RundbordVerify.judge(reply, source, currentBoard().requireEvidence === true);
        var needs = parseNeedsSummary(reply);
        return v ? { verdict: v.verdict, reason: v.reason, suggestedRole: needs ? needs.role : "", evidence: v.evidence || null } : null;
      },
      pickTarget: function (list, idx, info) {
        return window.RundbordVerify.pickReworkTarget(list, idx, info && info.suggestedRole);
      },
      hooks: {
        pause: function (o) {
          return askPauseDecision(o, seats);
        },
        onVerdict: function (o) {
          var type = !o.info ? "check.unclear" : o.info.verdict === "pass" ? "check.passed" : o.info.verdict === "unproven" ? "check.unproven" : "check.failed";
          var ev = o.info && o.info.evidence;
          // Kun tal og status i hændelsen, aldrig citaterne. Resultatet gemmes ved svaret, så samtalen kan vise "PASS uden bevis".
          emitEvent(type, o.seat.id, runCtx, ev ? { hasReason: Boolean(o.info.reason), evidence: ev.status, quotes: ev.total, found: ev.found } : { hasReason: Boolean(o.info && o.info.reason) }, lastMessageId());
          var msgId = lastMessageId();
          if (ev && msgId) {
            return window.rundbord.setMessageMeta(store.activeBoardId, msgId, { evidence: { status: ev.status, total: ev.total, found: ev.found } }).then(function (s) {
              store = s;
              render();
            });
          }
        },
        decide: function (o) {
          emitEvent("route.proposed", o.seat.id, runCtx, { canRework: o.canRework, reworks: o.reworks, maxReworks: o.maxReworks, unclear: !o.info }, lastMessageId());
          return askCheckDecision(o, seats);
        },
        onDecision: function (o) {
          if (o.action === "rework") {
            emitEvent("route.rework", o.seat.id, runCtx, { targetSeatId: seats[o.targetIdx].id, auto: Boolean(o.auto), round: o.round, maxRounds: o.maxRounds }, lastMessageId());
            // Sendes tilbage uden dit valg, står det i aktivitetsstrømmen: hvem, hvilken runde og hvorfor.
            if (o.auto) systemNote(t("runAutoReworkNote", { checker: o.seat.name, target: seats[o.targetIdx].name, round: o.round + 1, max: o.maxRounds, reason: (o.info && o.info.reason) || t("reworkNoReason") }));
          }
          else if (o.action === "continue") emitEvent("check.overridden", o.seat.id, runCtx, { via: "run" }, lastMessageId());
          else emitEvent("route.stopped", o.seat.id, runCtx, {}, lastMessageId());
        },
        reworkText: function (o) {
          return t("reworkRequest", {
            checker: o.seat.name,
            reason: (o.info && o.info.reason) || t("reworkNoReason"),
            task: taskText,
          });
        },
        onProgress: function (idx, seat, roundInfo) {
          runView.index = idx;
          runView.checkSeatId = null;
          if (runView.dynamic) {
            runView.currentId = seat.id;
            runView.nextId = null;
            runView.routePendingId = null;
            runView.steps += 1;
          }
          renderSeats();
          renderRunProgress(seats, idx);
          runView.round = roundInfo ? roundInfo.round : 1;
          runView.maxRounds = roundInfo ? roundInfo.maxRounds : 1;
          var roundSuffix = hasChecker && roundInfo && roundInfo.maxRounds > 1 ? t("runRoundSuffix", { round: roundInfo.round, max: roundInfo.maxRounds }) : "";
          updateRunUI((runView.dynamic ? t("runRunningDynamic", { step: runView.steps, seat: seat.name }) : t("runRunningStatus", { current: idx + 1, total: seats.length, seat: seat.name })) + roundSuffix);
        },
        onSkip: function (seat, idx) {
          runFailedIndexes.push(idx);
          renderSeats();
          return systemNote(t("runSkippedNote", { seat: seat.name }));
        },
        beforeCall: function (o) {
          var seat = o.seat;
          var idx = o.idx;
          var relayText = o.relayText;
          // Første kald i kørslen = der er ingen forrige stol (med dynamisk valg kan stol nr. 1 få turen igen senere).
          var isFirst = !o.prevSeat && !o.rework;
          var reason = o.rework
            ? t("reworkReason", { seat: o.prevSeat.name })
            : isFirst
            ? t("runStartedReason", { task: taskText })
            : t("runForwardedReason", { seat: o.prevSeat.name });
          var relaySummary = !isFirst && !o.rework ? parseNeedsSummary(relayText) : null;
          var textForSeat = relayText;
          var built = null;
          if (!isFirst && !o.rework) {
            // Samme byggesten som manuel videresendelse; den oprindelige opgave føres med i hvert led.
            // Med kuvert-forhåndsvisning logges og vises overdragelsen først, når du har sendt kuverten.
            built = buildHandoffFor({
              sourceSeat: o.prevSeat,
              sourceName: o.prevSeat.name,
              targetSeat: seat,
              text: relayText,
              originalTask: taskText,
              ctx: runCtx,
              mode: "auto",
              defer: envelopeOn(),
            });
            textForSeat = built.text;
          }
          var msgMeta = o.rework
            ? { relayed: true, rework: true, from: o.prevSeat.name }
            : isFirst
            ? { isTask: true }
            : { relayed: true, from: o.prevSeat.name, contextual: Boolean(relaySummary) };
          if (o.humanNote) textForSeat += "\n\n" + o.humanNote;
          // Beslutningsregistret (dine afgørelser og de åbne spørgsmål i opgaven) følger med i hver overdragelse.
          var regNote = !isFirst ? registerNote() : "";
          if (regNote) textForSeat += "\n\n" + regNote;
          msgMeta.taskId = runCtx.taskId;
          msgMeta.runId = runCtx.runId;
          // Kuverten: du ser og kan rette præcis det, stolen får, før den kaldes (ikke ved opgaven til første stol).
          var gate = !isFirst && envelopeOn()
            ? askEnvelope({ fromSeat: o.prevSeat, toSeat: seat, text: textForSeat, ctx: runCtx, inRun: true })
            : Promise.resolve({ action: "send", text: textForSeat });
          return gate.then(function (g) {
            if (g.action === "stop") return { stop: true, reason: "envelope" };
            textForSeat = g.text;
            if (g.edited) msgMeta.envelopeEdited = true;
            if (built && built.commit) built.commit();
            return window.rundbord.setTurn(store.activeBoardId, seat.id, reason);
          })
            .then(function (s) {
              if (s && s.stop) return s;
              store = s;
              render();
              return window.rundbord.addMessage(store.activeBoardId, seat.id, textForSeat, "user", msgMeta);
            })
            .then(function (s) {
              if (s && s.stop) return s;
              store = s;
              renderLog();
            });
        },
        call: function (o) {
          var history = seatHistory(o.seat.id, runCtx.taskId);
          return Promise.all([buildSystemPrompt(o.seat, runCtx), buildInImages(o.seat, runCtx)]).then(function (r) {
            return chatSeatStreaming(o.seat, history, r[0], r[1]);
          });
        },
        onRetry: function (o) {
          // Hvert mislykket forsøg logges, så Målinger viser den reelle fejlrate.
          recordCall(o.seat, o.res, "run", runCtx);
          emitEvent("call.retried", o.seat.id, runCtx, { attempt: o.attempt, errorKind: o.res.errorKind || "other", delayMs: o.delayMs });
          updateRunUI(t("runRetryStatus", { seat: o.seat.name, attempt: o.attempt, max: RUN_RETRY.max }));
        },
        onFail: function (o) {
          runFailedIndexes.push(o.idx);
          recordCall(o.seat, o.res, "run", runCtx);
          return systemNote(t("runSeatDidNotReplySkipping", { seat: o.seat.name, message: o.res.message }));
        },
        onReply: function (o) {
          var seat = o.seat;
          var reply = o.res.reply || t("emptyReplyFallback");
          o.res.reply = reply;
          if (runView.dynamic) {
            if (runView.visitedIds.indexOf(seat.id) < 0) runView.visitedIds.push(seat.id);
            runView.path.push(seat.id);
            var nb = parseNeedsSummary(reply);
            runView.lastNone[seat.id] = Boolean(nb && window.RundbordSeatRef.resolve(nb.role, []).intentionalNone);
          }
          return window.rundbord
            .addMessage(store.activeBoardId, seat.id, reply, "assistant", { icons: iconsSnapshot(seat), taskId: runCtx.taskId, runId: runCtx.runId, handoff: window.RundbordHandoff.parse(reply) })
            .then(function (s) {
              store = s;
              renderLog();
              var ctx = { taskId: runCtx.taskId, runId: runCtx.runId, refMessageId: lastMessageId() };
              noteReplyEvents(seat, reply, ctx, ctx.refMessageId);
              return recordCall(seat, o.res, "run", ctx)
                .then(function () {
                  // Et svar, der ramte længdegrænsen, står ikke som fuldt: det siges i samtalen, så ingen tror, teksten er hel.
                  return o.res.truncated ? systemNote(t("replyCutOff", { seat: seat.name })) : null;
                })
                .then(function () {
                  return maybeAutoSaveOut(seat, reply, ctx);
                });
            });
        },
        onEnd: function (r) {
          runActive = false;
          runView.checkSeatId = null;
          runView.index = r.done;
          runView.finished = r.outcome === "finished";
          renderSeats();
          renderRunProgress(seats, r.done);
          if (r.outcome === "finished") {
            emitEvent("run.finished", null, runCtx, { total: runView.dynamic ? runView.path.length : seats.length, failed: r.failed.length });
            return window.rundbord.setTurn(store.activeBoardId, null, t("runFinishedReason")).then(function (s) {
              store = s;
              render();
              renderRunProgress(seats, r.done);
              var totalSeats = runView.dynamic ? runView.path.length : seats.length;
              var failedSeats = r.failed.length;
              // Statussen siger kun, hvad der er sket: svarede ikke alle stole, står det her, og spørgsmålet lægges tilbage, så intet er tabt.
              if (failedSeats) {
                var box = document.getElementById("msgInput");
                if (!box.value.trim()) box.value = taskText;
                updateRunUI(t(failedSeats >= totalSeats ? "runFinishedNoneReplied" : "runFinishedSomeFailed", { failed: failedSeats, total: totalSeats }));
              } else {
                updateRunUI(t("runFinishedStatus", { total: totalSeats }));
              }
              return routeSummaryNote(seats).then(function () {
                return closingCheckNote();
              }).then(function () {
                openComparePanelForRun();
                openResultPanelAfterRun();
              });
            });
          }
          if (r.outcome === "budget") {
            var text = t("runBudgetStopped", { spent: usdText(runSpentUsd()), limit: usdText(limit), done: r.done, total: seats.length });
            emitEvent("run.stopped", null, runCtx, { done: r.done, total: seats.length, reason: "budget", limitUsd: limit });
            runView.budgetStopped = true;
            renderEye();
            updateRunUI(text);
            return systemNote(text);
          }
          emitEvent("run.stopped", null, runCtx, { done: r.done, total: seats.length, reason: r.reason || "user" });
          if (r.reason === "pause") {
            var pauseText = t("runStoppedByPause");
            updateRunUI(pauseText);
            return systemNote(pauseText);
          }
          if (r.reason === "envelope") {
            var envText = t("runStoppedByEnvelope");
            updateRunUI(envText);
            return systemNote(envText);
          }
          if (r.reason === "check") {
            var checkText = t("runStoppedByCheck");
            updateRunUI(checkText);
            return systemNote(checkText);
          }
          updateRunUI(t("runStoppedStatus", { done: r.done, total: seats.length }));
        },
      },
    });
  }

  // Fase E: viser en let opsummering (stoleliste i rækkefølge + eksisterende
  // forbrugsdata) FØR runTable() rent faktisk kaldes — ingen AI-genereret
  // plantekst, kun data der allerede findes, præsenteret roligere. Teksten
  // ligger stadig i #msgInput og røres ikke her, så "Justér" (closeStartConfirmPanel)
  // altid kan lukke bekræftelsen uden at miste noget.
  var pendingStartTaskText = null;

  // Flytter en stol i rækkefølgen og opdaterer alt, der viser den (ikke mens en kørsel er i gang).
  function moveSeatBy(seatId, delta) {
    if (runActive) return Promise.resolve();
    return window.rundbord.moveSeat(store.activeBoardId, seatId, delta).then(function (s) {
      store = s;
      render();
      if (!document.getElementById("startConfirmPanel").hidden && pendingStartTaskText != null) openStartConfirmPanel(pendingStartTaskText);
      renderSeatOrderField();
    });
  }

  function renderSeatOrderField() {
    var field = document.getElementById("seatOrderField");
    if (!field) return;
    var seats = currentBoard().seats;
    var idx = editingSeatId ? seats.findIndex(function (x) { return x.id === editingSeatId; }) : -1;
    field.hidden = idx < 0 || seats.length < 2;
    if (idx < 0) return;
    document.getElementById("seatOrderText").textContent = t("seatOrderText", { n: idx + 1, total: seats.length });
    document.getElementById("seatOrderUpBtn").disabled = idx === 0 || runActive;
    document.getElementById("seatOrderDownBtn").disabled = idx === seats.length - 1 || runActive;
  }

  // Forventet forbrug før start: et skøn ud fra stolenes seneste kald, siges som et skøn. Stole uden tidligere kald og modeller uden listepris nævnes i stedet for at tælle som 0.
  function runEstimateText(seats) {
    var est = window.RundbordRunEstimate.estimate({ seats: seats, events: currentBoard().events || [], priceTable: store.priceTable || {}, estimateSeat: window.RundbordRouting.estimate });
    var text;
    if (est.totalUsd === null) text = t("estimateNone");
    else if (est.unknown.length) text = t("estimatePartial", { amount: "ca. " + usdText(est.totalUsd), known: est.known, total: est.total, names: est.unknown.join(", ") });
    else text = t("estimateFull", { amount: "ca. " + usdText(est.totalUsd) });
    if (est.noPrice.length) text += " " + t("estimateNoPrice", { models: est.noPrice.join(", ") });
    return text;
  }

  var PROVIDER_NAMES = { anthropic: "Anthropic", openai: "OpenAI", google: "Google (Gemini)", groq: "Groq", mistral: "Mistral", xai: "xAI (Grok)", deepseek: "DeepSeek", openrouter: "OpenRouter" };

  // Hvem modtager opgaven, og hvem betaler du: udbyderne på de stole, der kører, og at du betaler udbyderen direkte.
  function runSendsText(seats) {
    var names = [];
    seats.forEach(function (s) {
      var name = PROVIDER_NAMES[s.provider];
      if (!name) {
        var host = "";
        try {
          host = new URL(s.baseUrl).host;
        } catch (e) {}
        name = host ? t("sendsCustomHost", { host: host }) : t("sendsCustom");
      }
      if (s.provider === "openrouter") name += " (" + t("sendsOpenrouterNote") + ")";
      if (names.indexOf(name) < 0) names.push(name);
    });
    return t("startConfirmSends", { providers: names.join(", ") });
  }

  function openStartConfirmPanel(taskText) {
    var seats = currentBoard().seats;
    if (!seats.length) {
      document.getElementById("runStatus").textContent = t("runNeedSeatFirst");
      return;
    }
    // Mangler en stol API (profil, nøgle eller model), er onboarding ikke færdig: bordet starter ikke, og man ledes til det, der mangler.
    var missingApi = apiMissingList(seats);
    if (missingApi.length) {
      pendingStartTaskText = taskText;
      openApiNeeded(missingApi);
      return;
    }
    pendingStartTaskText = taskText;
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("seatPanel").hidden = true;
    document.getElementById("pricePanel").hidden = true;
    document.getElementById("turnPanel").hidden = true;
    document.getElementById("proposalsPanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    document.getElementById("startConfirmTaskNote").textContent = t("startConfirmTaskLabel", { text: taskText });
    document.getElementById("startConfirmSeatList").innerHTML = seats
      .map(function (seat, i) {
        var ready = Boolean(seat.apiKey);
        return (
          '<p class="start-confirm-seat">' + (i + 1) + ". " + escapeHtml(seat.name) +
          (ready ? "" : ' <span class="missing-key">' + escapeHtml(t("missingKeyBadge")) + "</span>") +
          '<span class="order-btns">' +
          '<button type="button" class="order-btn" data-move="-1" data-seat-id="' + seat.id + '" title="' + escapeHtml(t("seatOrderUp")) + '" aria-label="' + escapeHtml(t("seatOrderUp") + ": " + seat.name) + '"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
          '<button type="button" class="order-btn" data-move="1" data-seat-id="' + seat.id + '" title="' + escapeHtml(t("seatOrderDown")) + '" aria-label="' + escapeHtml(t("seatOrderDown") + ": " + seat.name) + '"' + (i === seats.length - 1 ? " disabled" : "") + ">↓</button>" +
          "</span></p>"
        );
      })
      .join("");
    var summary = summarizeCalls(boardCallsOf(currentBoard()));
    document.getElementById("startConfirmSpendNote").textContent = summary.calls
      ? t("spendPrefix") + usageLineText(summary)
      : t("spendNone");
    document.getElementById("startConfirmEstimateNote").textContent = runEstimateText(seats);
    document.getElementById("startConfirmSendsNote").textContent = runSendsText(seats);
    var noteEl = document.getElementById("startConfirmInNote");
    var readers = seats.filter(function (x) {
      return x.readsIn;
    }).length;
    var readable = ioState.in.filter(function (f) {
      return f.readable;
    });
    noteEl.hidden = !(readers && readable.length);
    if (!noteEl.hidden) {
      var chars = Math.min(readable.reduce(function (sum, f) { return sum + Math.min(f.size, 60 * 1024); }, 0), 150 * 1024);
      noteEl.textContent = t("startConfirmInNote", {
        stole: readers,
        files: readable.length,
        tokens: window.RundbordIO.estimateTokens(chars),
      });
    }
    var imgEl = document.getElementById("startConfirmImagesNote");
    var images = ioState.in.filter(function (f) {
      return f.image;
    });
    var visionReaders = seats.filter(function (x) {
      return x.readsIn && IMAGE_CAPABLE_PROVIDERS[x.provider];
    }).length;
    imgEl.hidden = !(images.length && readers);
    if (!imgEl.hidden) {
      imgEl.textContent = shieldOn()
        ? t("shieldImagesBlockedNote", { images: images.length })
        : visionReaders
        ? t("startConfirmImagesNote", { images: images.length, stole: visionReaders })
        : t("startConfirmImagesNoVisionNote", { images: images.length });
    }
    var limitEl = document.getElementById("startConfirmLimitNote");
    var lim = currentBoard().maxRunCostUsd;
    limitEl.hidden = !(typeof lim === "number" && lim > 0);
    if (!limitEl.hidden) limitEl.textContent = t("startConfirmLimitNote", { limit: usdText(lim) }) + " " + t("startConfirmLimitFine");
    var remembered = (currentBoard().messages || []).filter(function (m) {
      return m.seatId && m.seatId !== "__system__" && !(m.meta && (m.meta.talk || m.meta.kind === "thirdEye"));
    }).length;
    document.getElementById("startConfirmFreshNote").textContent = currentBoard().freshRuns === true
      ? t("startConfirmFresh")
      : remembered
      ? t("startConfirmRemember", { count: remembered })
      : "";
    var roundsEl = document.getElementById("startConfirmRoundsNote");
    var hasChecker = seats.some(function (x) { return x.checks; });
    var rounds = window.RundbordRounds.normalize(currentBoard().rounds);
    roundsEl.hidden = !hasChecker;
    if (hasChecker) roundsEl.textContent = t(rounds.auto ? "startConfirmRoundsAuto" : "startConfirmRoundsAsk", { max: rounds.max });
    prepareOwnTakeField(document.getElementById("startConfirmPanel").hidden);
    document.getElementById("startConfirmPanel").hidden = false;
  }

  function closeStartConfirmPanel() {
    document.getElementById("startConfirmPanel").hidden = true;
    pendingStartTaskText = null;
  }

  function runTable(taskText) {
    taskText = String(taskText || "").trim();
    if (!taskText) {
      document.getElementById("runStatus").textContent = t("runNeedTaskFirst");
      return;
    }
    var seats = currentBoard().seats;
    if (!seats.length) {
      document.getElementById("runStatus").textContent = t("runNeedSeatFirst");
      return;
    }
    runActive = true;
    runFailedIndexes = [];
    runView = newRunView(store.activeBoardId);
    runView.order = seats.map(function (s) {
      return { id: s.id, name: s.name };
    });
    runView.dynamic = routingIsDynamic();
    runCtx = { taskId: uid(), runId: uid() };
    emitEvent("task.started", null, runCtx, { mode: "run", text: taskText.slice(0, 80), seatCount: seats.length });
    emitEvent("run.started", null, runCtx, { seats: seats.length });
    recordOwnTake();
    updateRunUI(t("runStarting"));
    startRunSequence(seats, taskText);
  }

  function stopRun() {
    runActive = false;
    runView.checkSeatId = null;
    renderSeats();
    runView.pauseSeatId = null;
    if (pendingDecision) pendingDecision("stop");
    if (pendingPause) pendingPause("stop");
    if (pendingEnvelope) pendingEnvelope("stop");
    if (pendingRoute) pendingRoute({ stop: true });
  }

  // --- Kronen (hvem har turen) ---

