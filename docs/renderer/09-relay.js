// 09-relay.js
// Gem i git, forslag, overdragelse mellem stole, og selve modelkaldet (streaming).

  // Skriver én besked til en fil i bordets repo og committer+pusher den —
  // brugerens eksplicitte "godkend dette svar"-handling, i stedet for at
  // gemme alting automatisk uden om brugerens vurdering.
  function saveMessageToGit(messageId, btn) {
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("savingBtn");
    var gitMsg = (currentBoard().messages || []).filter(function (m) {
      return m.id === messageId;
    })[0];
    window.rundbord
      .saveMessageToGit(store.activeBoardId, messageId)
      .then(function (res) {
        if (gitMsg) {
          logEgress("git", seatById(gitMsg.seatId), {
            provider: "github",
            host: hostOf(currentBoard().githubUrl),
            protected: false,
            assessment: window.RundbordShield.assess([gitMsg.text], shieldOf(currentBoard())),
            ok: Boolean(res && res.ok),
          });
        }
        btn.disabled = false;
        if (res && res.ok) {
          btn.textContent = res.changed ? t("savedBtn", { sha: res.sha }) : t("unchangedBtn");
          btn.title = res.message;
        } else {
          btn.textContent = t("errorBtnShort");
          btn.title = (res && res.message) || t("unknownError");
        }
        setTimeout(function () {
          btn.textContent = originalText;
          btn.title = t("saveToGitBtnTitle");
        }, 4000);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = t("errorBtnShort");
      });
  }

  function flagAsProposal(messageId) {
    var msg = (currentBoard().messages || []).find(function (m) {
      return m.id === messageId;
    });
    if (!msg) return;
    // Teksten er det stykke, du har markeret i svaret; ellers første sætning efter stolens gentagelse af opgaven (aldrig protokollinjerne eller hele svaret).
    var picked = "";
    try {
      var sel = window.getSelection && window.getSelection();
      var holder = document.querySelector('.msg[data-msg-id="' + messageId + '"]');
      var str = sel ? String(sel).trim() : "";
      if (str.length >= 4 && holder && sel.anchorNode && holder.contains(sel.anchorNode)) picked = str;
    } catch (e) {}
    var needs = parseNeedsSummary(msg.text);
    var draft = window.RundbordProposalText.draft({ selection: picked, body: stripNeedsSummary(msg.text), need: needs ? needs.need : "" });
    var seats = currentBoard().seats || [];
    var roleSeat = needs ? window.RundbordSeatRef.resolve(needs.role, seats).seat : null;
    var recommended = window.RundbordProposalText.recommendedSeat(roleSeat && roleSeat.id, msg.seatId, seats.map(function (x) { return x.id; }));
    window.rundbord.createProposal(store.activeBoardId, msg.seatId, draft.text || msg.text.slice(0, 300), { recommendedSeatId: recommended, draftSource: draft.source }).then(function (s) {
      store = s;
      renderProposalsBadge();
      openProposalsPanel();
    });
  }

  // Ægte videresendelse: brugeren vælger selv en stol, og teksten sendes
  // rent faktisk dertil (med et nyt, ægte modelkald) — i modsætning til at
  // lade en stol foregive at "sende det internt", hvilket den ikke kan.
  // Følger relæ-kæden baglæns til den oprindelige, ikke-videresendte
  // brugeropgave der satte det hele i gang. Uden dette ser hvert led i
  // kæden kun den FORRIGE stols fortolkning af opgaven — aldrig selve
  // opgaven — og efter to-tre led arbejder kæden reelt på en fortolkning af
  // en fortolkning (observeret direkte i en stress-test 2026-09-21, hvor et
  // tredje led opfandt en helt anden opgave end den brugeren stillede).
  // Går skiftevis: assistent-svar → dets udløsende brugerbesked, og hvis
  // DEN besked selv var videresendt → det assistent-svar den stammer fra —
  // indtil en ægte, ikke-videresendt brugerbesked findes.
  function findOriginalTaskMessage(msg) {
    var messages = currentBoard().messages || [];
    var byId = {};
    messages.forEach(function (m) {
      byId[m.id] = m;
    });
    var current = msg;
    var guard = 0;
    while (current && guard++ < 50) {
      if (current.role === "assistant") {
        var idx = messages.indexOf(current);
        var trigger = null;
        for (var i = idx - 1; i >= 0; i--) {
          if (messages[i].seatId === current.seatId && messages[i].role === "user") {
            trigger = messages[i];
            break;
          }
        }
        if (!trigger) return null;
        current = trigger;
        continue;
      }
      if (current.meta && current.meta.relayed && current.meta.sourceMessageId && byId[current.meta.sourceMessageId]) {
        current = byId[current.meta.sourceMessageId];
        continue;
      }
      return current;
    }
    return null;
  }

  // ÉN byggesten for begge relæveje (manuel og automatisk kørsel): vælger
  // struktureret overlevering eller hele svaret (bordets indstilling, med
  // automatisk fallback), og logger hvor meget der blev sendt.
  function buildHandoffFor(o) {
    var summary = parseNeedsSummary(o.text);
    var body = summary ? stripNeedsSummary(o.text) : o.text;
    // Overdragelsestypen: en kontrolstol får altid hele teksten; ellers gælder pilens egen indstilling, og ellers bordets.
    var edgeMode = o.sourceSeat && o.targetSeat ? window.RundbordEdges.get(currentBoard().edges, o.sourceSeat.id, o.targetSeat.id).handoff : "default";
    var effMode = o.targetSeat && o.targetSeat.checks ? "full" : edgeMode !== "default" ? edgeMode : currentBoard().handoffMode === "structured" ? "structured" : "full";
    var built = window.RundbordHandoff.buildRelayText({
      t: t,
      mode: effMode,
      originalTask: o.originalTask,
      sourceName: o.sourceName,
      summary: summary,
      body: body,
      readback: splitReadback(body).readback,
      handoff: window.RundbordHandoff.parse(o.text),
    });
    // Overdragelsen logges altid, også når svaret ikke havde en 🔭-blok (så hver pil har en hændelse bag sig).
    // Med o.defer logges og vises den først, når brugeren har godkendt kuverten (built.commit); annulleres den, er intet sendt og intet logget.
    function logHandoff() {
      emitEvent("handoff.built", o.targetSeat.id, o.ctx, {
        via: o.mode,
        fromSeatId: o.sourceSeat ? o.sourceSeat.id : null,
        mode: built.mode,
        fallback: built.mode === "full" && effMode === "structured",
        edgeMode: edgeMode,
        forcedFull: Boolean(o.targetSeat && o.targetSeat.checks),
        fallbackReason: built.fallbackReason,
        charsFull: built.charsFull,
        charsSent: built.charsSent,
      });
      if (o.sourceSeat) showHandoff(o.sourceSeat.id, o.targetSeat.id, { mode: built.mode, charsFull: built.charsFull, charsSent: built.charsSent, fallbackReason: built.fallbackReason, forcedFull: Boolean(o.targetSeat && o.targetSeat.checks) });
    }
    if (o.defer) built.commit = logHandoff;
    else logHandoff();
    return built;
  }

  function relayMessageToSeat(messageId, targetSeatId) {
    var msg = (currentBoard().messages || []).find(function (m) {
      return m.id === messageId;
    });
    var sourceSeat = msg ? seatById(msg.seatId) : null;
    var targetSeat = seatById(targetSeatId);
    if (!msg || !targetSeat) return;
    if (typeof pendingEnvelope === "function") return; // en kuvert venter allerede på dig
    var sourceName = sourceSeat ? sourceSeat.name : t("relayUnknownSourceSeat");
    var summary = parseNeedsSummary(msg.text);
    var originalTask = summary ? findOriginalTaskMessage(msg) : null;
    var ctx = { taskId: (msg.meta && msg.meta.taskId) || null, runId: (msg.meta && msg.meta.runId) || null };
    var built = buildHandoffFor({
      sourceSeat: sourceSeat,
      sourceName: sourceName,
      targetSeat: targetSeat,
      text: msg.text,
      originalTask: originalTask ? originalTask.text : null,
      ctx: ctx,
      mode: "manual",
      defer: envelopeOn(),
    });
    var textToSend = built.text;
    var regNote = registerNote();
    if (regNote) textToSend += "\n\n" + regNote;
    var meta = {
      relayed: true,
      from: sourceName,
      fromSeatId: sourceSeat ? sourceSeat.id : null,
      sourceMessageId: msg.id,
      contextual: Boolean(summary),
      taskId: (msg.meta && msg.meta.taskId) || null,
      runId: (msg.meta && msg.meta.runId) || null,
    };
    var reason = t("relayedManuallyFromReason", { seat: sourceName });
    if (!envelopeOn()) return sendTextToSeat(targetSeat, textToSend, meta, reason);
    // Kuverten: du ser og kan rette teksten, før den sendes; annullerer du, er intet sendt og intet logget.
    askEnvelope({ fromSeat: sourceSeat, toSeat: targetSeat, text: textToSend, ctx: ctx, inRun: false }).then(function (g) {
      if (g.action !== "send") return;
      if (built.commit) built.commit();
      if (g.edited) meta.envelopeEdited = true;
      sendTextToSeat(targetSeat, g.text, meta, reason);
    });
  }

  // taskId: en kørsel, der starter ren (bordets indstilling freshRuns), ser kun denne opgaves egne beskeder; ellers hele stolens samtale.
  function seatHistory(seatId, taskId) {
    var fresh = Boolean(taskId) && currentBoard().freshRuns === true;
    return (currentBoard().messages || [])
      .filter(function (m) {
        if (m.seatId !== seatId) return false;
        return !fresh || Boolean(m.meta && m.meta.taskId === taskId);
      })
      .map(function (m) {
        return { role: m.role === "assistant" ? "assistant" : "user", content: m.text };
      });
  }

  // Kalder en stols model med rigtig token-streaming: en midlertidig boble
  // vokser frem i loggen, mens svaret rent faktisk genereres. Boblen fjernes
  // igen når kaldet er færdigt — den endelige besked persisteres separat via
  // addMessage(), som udløser den normale renderLog().
  // Delt kerne for alt live token-streaming: abonnerer på ét requestId og
  // skriver deltaerne ind i et givet tekst-element. Bruges både af den
  // normale chatboble (chatSeatStreaming) og af de parallelle smags-kort
  // (runVariantTasting) — samme rigtige streaming, to forskellige visninger.
  // hooks.onSend kaldes, lige før forespørgslen sendes til modellen (efter Beskyttelsens valg), så et ventelag først vises, når det er modellen, der arbejder.
  function streamReplyInto(seat, history, systemPrompt, textEl, onDelta, images, hooks) {
    // Alt der forlader appen mod en model går gennem beskyttelsen (renderer/17-shield.js),
    // og main.js afviser selv, hvis noget alligevel slipper igennem (fail-closed).
    return shieldGate(seat, history, systemPrompt).then(function (gate) {
      if (!gate.ok) return { ok: false, errorKind: gate.errorKind, message: gate.message };
      var requestId = uid();
      var raw = "";
      var unsubscribe = window.rundbord.onChatStream(function (data) {
        if (!data || data.requestId !== requestId) return;
        raw += data.delta;
        textEl.textContent = gate.protectedOn ? shieldRestoreText(raw) : raw;
        if (onDelta) onDelta();
      });
      var sentImages = gate.protectedOn ? [] : images;
      if (hooks && hooks.onSend) hooks.onSend();
      return window.rundbord
        .chatSeat(seat, gate.history, gate.systemPrompt, requestId, sentImages, store.activeBoardId)
        .then(function (res) {
          // Stoppede main-processen afsendelsen (fail-closed), er intet sendt, og der logges ikke.
          if (!(res && res.errorKind === "shield")) {
            logEgress("llm", seat, {
              provider: seat.provider,
              model: seat.model,
              host: seat.provider === "custom" ? hostOf(seat.baseUrl) : "",
              protected: gate.protectedOn,
              assessment: gate.assessment,
              images: sentImages && seat.apiKey ? sentImages.length : 0,
              ok: Boolean(res && res.ok),
            });
          }
          return res;
        })
        .finally(function () {
          if (unsubscribe) unsubscribe();
        });
    });
  }

  function chatSeatStreaming(seat, history, systemPrompt, images) {
    var log = document.getElementById("log");
    var emptyNote = log.querySelector(".log-empty");
    if (emptyNote) emptyNote.remove();
    var bubble = document.createElement("div");
    bubble.className = "msg msg-live";
    bubble.style.setProperty("--seat-color", seatColorVar(seat.color));
    bubble.innerHTML =
      '<div class="msg-meta"><span class="msg-who">' + escapeHtml(seat.name) + "</span>" +
      activeIconsHtml(seat) +
      '<span class="msg-llm">' + escapeHtml(seat.provider + " · " + (seat.model || "")) + "</span>" +
      '<span class="msg-time live-dot">●</span></div>' +
      '<p class="msg-text"></p>';
    var textEl = bubble.querySelector(".msg-text");
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    // Ventelaget (renderer/45-waitlayer.js) vises, fra forespørgslen er sendt, til første ord kommer.
    var wait = null;
    var stopWait = function () {
      if (wait) wait.stop();
      wait = null;
    };
    return streamReplyInto(seat, history, systemPrompt, textEl, function () {
      stopWait();
      log.scrollTop = log.scrollHeight;
    }, images, {
      onSend: function () {
        wait = startWaitLayer(seat, bubble, textEl);
        log.scrollTop = log.scrollHeight;
      },
    }).finally(function () {
      stopWait();
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    });
  }

  // --- Målinger (se lib/metrics.js og board.events i main.js) ---
  // Kun fakta, aldrig beskedtekst. ctx = { taskId, runId }.
  function emitEvent(type, seatId, ctx, data, refMessageId) {
    ctx = ctx || {};
    try {
      window.rundbord
        .addEvent(store.activeBoardId, {
          type: type,
          seatId: seatId || null,
          taskId: ctx.taskId || null,
          runId: ctx.runId || null,
          refMessageId: refMessageId || null,
          data: data || {},
        })
        .then(scheduleObservationRefresh)
        .catch(function () {});
    } catch (e) {}
  }

  function lastMessageId() {
    var msgs = currentBoard().messages || [];
    return msgs.length ? msgs[msgs.length - 1].id : null;
  }

  // ÉN vej for alle modelkald: gemmer tokens/pris (som før) OG logger tid,
  // fejl og kobling til opgave/kørsel. Fejlede kald blev tidligere slet ikke
  // registreret.
  function recordCall(seat, res, purpose, ctx) {
    ctx = ctx || {};
    var refId = ctx.refMessageId || null;
    if (res && res.usage) {
      return window.rundbord
        .recordUsage(store.activeBoardId, seat.id, res.usage, {
          purpose: purpose,
          taskId: ctx.taskId || null,
          runId: ctx.runId || null,
          refMessageId: refId,
          durationMs: typeof res.durationMs === "number" ? res.durationMs : null,
        })
        .then(function (s) {
          store = s;
          renderBoardSpend();
          scheduleObservationRefresh();
        });
    }
    if (res && res.ok === false) {
      emitEvent("call.failed", seat.id, ctx, { purpose: purpose, modelId: seat.model || "", errorKind: res.errorKind || "other", durationMs: typeof res.durationMs === "number" ? res.durationMs : null }, refId);
    } else {
      emitEvent("call.completed", seat.id, ctx, { purpose: purpose, modelId: seat.model || "", inputTokens: null, outputTokens: null, durationMs: typeof res.durationMs === "number" ? res.durationMs : null }, refId);
    }
    return Promise.resolve();
  }

  // Fakta om selve svaret (uden tekst): rejste stolen et behov?
  function noteReplyEvents(seat, reply, ctx, refMessageId) {
    var needs = parseNeedsSummary(reply);
    if (!needs) return;
    var match = window.RundbordSeatRef.resolve(needs.role, currentBoard().seats);
    var named = Boolean(match.seat);
    emitEvent("need.raised", seat.id, ctx, { roleMatchesSeat: named, roleMatch: match.how, roleIntentionalNone: match.intentionalNone, hasAdjust: Boolean(needs.adjust && needs.adjust.trim()), role: String(needs.role || "").slice(0, 40) }, refMessageId);
  }

