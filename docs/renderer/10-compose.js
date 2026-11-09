// 10-compose.js
// Det ene skrivefelt: sender til én stol eller starter en kørsel.

  // Delt kerne: sender tekst til én stol (som "user"), streamer det rigtige
  // svar frem, og persisterer + prisberegner resultatet. Bruges af den
  // almindelige komponist, "→ Videresend" og fremtidige genveje — alle skal
  // opføre sig identisk, ikke tre snesevis af næsten-ens kopier.
  function sendTextToSeat(seat, text, meta, turnReason) {
    if (!seat || !text) return Promise.resolve({ ok: false, message: t("nothingToSend") });
    var errorEl = document.getElementById("chatError");
    if (errorEl) errorEl.hidden = true;
    if (!seat.apiKey) {
      var msg = t("noApiKeySaved");
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = msg;
      }
      return Promise.resolve({ ok: false, message: msg });
    }
    // Hver direkte besked uden opgave-id er sin egen opgave; relæ-beskeder
    // arver opgaven fra den besked de videresender.
    var ctx = { taskId: meta && meta.taskId, runId: meta && meta.runId };
    if (!ctx.taskId) {
      ctx.taskId = uid();
      emitEvent("task.started", null, ctx, { mode: "direct", text: String(text).slice(0, 80), seatCount: 1 });
      meta = Object.assign({}, meta, { taskId: ctx.taskId });
    }
    return window.rundbord
      .setTurn(store.activeBoardId, seat.id, turnReason || t("continuedConversationReason", { seat: seat.name }))
      .then(function (s) {
        store = s;
        render();
        return window.rundbord.addMessage(store.activeBoardId, seat.id, text, "user", meta);
      })
      .then(function (s) {
        store = s;
        renderLog();
        var history = seatHistory(seat.id);
        return Promise.all([buildSystemPrompt(seat, ctx), buildInImages(seat, ctx)]).then(function (r) {
          return chatSeatStreaming(seat, history, r[0], r[1]);
        });
      })
      .then(function (res) {
        if (!res.ok) {
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = t("seatDidNotReply", { seat: seat.name, message: res.message });
          }
          recordCall(seat, res, "chat", ctx);
          return res;
        }
        var reply = res.reply || t("emptyReplyFallback");
        return window.rundbord
          .addMessage(store.activeBoardId, seat.id, reply, "assistant", { icons: iconsSnapshot(seat), taskId: ctx.taskId, runId: ctx.runId || null, handoff: window.RundbordHandoff.parse(reply) })
          .then(function (s) {
            store = s;
            renderLog();
            ctx.refMessageId = lastMessageId();
            noteReplyEvents(seat, reply, ctx, ctx.refMessageId);
            return recordCall(seat, res, "chat", ctx)
              .then(function () {
                return res.truncated ? systemNote(t("replyCutOff", { seat: seat.name })) : null;
              })
              .then(function () {
                return maybeAutoSaveOut(seat, reply, ctx);
              })
              .then(function () {
                return res;
              });
          });
      });
  }

  // Hvem skriver du til, og hvad sker der? Står under modtagervalget, så det altid er tydeligt, om du starter en kørsel
  // gennem hele bordet eller kun spørger én stol.
  function renderRecipientCaption() {
    var cap = document.getElementById("recipientCaption");
    var btn = document.getElementById("sendMsgBtn");
    if (!cap || !btn) return;
    var seats = currentBoard().seats || [];
    var everyone = !selectedSpeakerId || selectedSpeakerId === RECIPIENT_EVERYONE;
    if (!seats.length) {
      cap.textContent = "";
    } else if (runActive) {
      cap.textContent = t("recipientCaptionRunning");
    } else if (everyone) {
      cap.textContent = t("recipientCaptionAll", { count: seats.length });
    } else {
      var seat = seatById(selectedSpeakerId);
      cap.textContent = seat ? t("recipientCaptionOne", { seat: seat.name, model: seat.model || seat.provider || "" }) : "";
    }
    if (!btn.disabled || btn.textContent !== t("thinkingBtn")) btn.textContent = everyone ? t("sendToTableBtn") : t("sendMsgBtn");
  }

  // Skrivefeltet vokser med teksten (højst ca. 10 linjer); derefter ruller det.
  function autoGrowMsgInput() {
    var ta = document.getElementById("msgInput");
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight + 2, 240) + "px";
  }

  // Det ene inputfelt forgrener her: "Alle" (default) starter en automatisk
  // kørsel af hele bordet med teksten som opgave (som runTable() altid har
  // gjort); en navngiven stol sender direkte til den, som sendMessage()
  // altid har gjort. Samme felt, samme knap — kun modtager-valget afgør
  // hvilken vej beskeden går.
  function sendAsk() {
    var textarea = document.getElementById("msgInput");
    var text = textarea.value.trim();
    if (!text) return;
    if (!selectedSpeakerId || selectedSpeakerId === RECIPIENT_EVERYONE) {
      if (runActive) return;
      // Teksten bevares i feltet indtil brugeren rent faktisk bekræfter
      // (se confirmStartBtn) — "Justér" i startConfirmPanel skal kunne
      // lukke bekræftelsen igen uden at det skrevne går tabt.
      openStartConfirmPanel(text);
      return;
    }
    var seat = seatById(selectedSpeakerId);
    if (!seat) return;
    var sendBtn = document.getElementById("sendMsgBtn");
    sendBtn.disabled = true;
    sendBtn.textContent = t("thinkingBtn");
    textarea.value = "";
    autoGrowMsgInput();
    sendTextToSeat(seat, text)
      .catch(function (err) {
        var errorEl = document.getElementById("chatError");
        errorEl.hidden = false;
        errorEl.textContent = t("unexpectedErrorPrefix") + String((err && err.message) || err);
      })
      .finally(function () {
        sendBtn.disabled = false;
        renderRecipientCaption();
        autoGrowMsgInput();
      });
  }

