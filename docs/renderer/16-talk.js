// 16-talk.js
// Samtale med Tredje øje: den ENE indgang til Tredje øje. Her stiller du spørgsmål (skrevet eller talt), beder om en vurdering
// af bordet og hører en kort orientering. Teksten skrives (her eller i bordets log); stemmen siger kun Tredje øjes egen korte
// <<SAY>>-linje, der peger dig ind i teksten. Samtalen gemmes som systembeskeder med meta { kind: "thirdEyeTalk", talk: true },
// så den aldrig havner i bordets referat, relæer eller log. Intet ændres af samtalen; ændringer sker, hvor de plejer.

  var talkBusy = false;
  var talkSpeakOn = false;

  function talkMessages() {
    return (currentBoard().messages || []).filter(function (m) {
      return m.meta && m.meta.talk;
    });
  }

  // Bordets opsætning som tekst: hvem sidder ved bordet, med hvilken model og hvilke aktive dials.
  function talkSetupDigest() {
    var board = currentBoard();
    var seats = (board.seats || []).map(function (s) {
      var dials = activeDials(s)
        .map(function (d) {
          var v = (s.dials || {})[d.key] || {};
          return dialLabel(d) + (v.state === "auto" ? " (auto)" : v.strength ? " " + v.strength : "");
        })
        .join(", ");
      return (
        "- " + s.name + (s.role ? " [" + s.role + "]" : "") + " · " + s.provider + " · " + (s.model || "?") +
        (s.checks ? " · " + t("talkSetupChecks") : "") + (s.readsIn ? " · " + t("talkSetupReadsIn") : "") +
        (dials ? " · " + dials : "")
      );
    });
    return t("talkSetupHeader", { project: board.projectName || "" }) + "\n" + (seats.join("\n") || "-");
  }

  function talkContextBlock() {
    var transcript = buildTableTranscript();
    return (
      t("thirdEyeConversationHeader") + "\n\n" + (transcript || t("talkNoTranscript")) +
      "\n\n" + t("talkSetupSection") + "\n" + talkSetupDigest() +
      "\n\n" + t("thirdEyeOpenNeedsHeader") + "\n" + openNeedsDigest() +
      "\n\n" + t("thirdEyeFindingsHeader") + "\n" + observationsDigest() +
      strategyContextSection()
    );
  }

  function renderTalkThread() {
    var box = document.getElementById("talkThread");
    var msgs = talkMessages();
    if (!msgs.length) {
      box.innerHTML = '<p class="note">' + escapeHtml(t("talkEmpty")) + "</p>";
      return;
    }
    box.innerHTML = msgs
      .map(function (m) {
        var mine = m.meta.speaker === "user";
        var jump = m.meta.ref ? ' <button type="button" class="btn talk-jump-btn" data-ref="' + escapeHtml(m.meta.ref) + '">' + escapeHtml(t("talkJump")) + "</button>" : "";
        return (
          '<div class="talk-msg ' + (mine ? "talk-me" : "talk-eye") + '"><span class="talk-who">' +
          escapeHtml(mine ? t("nameUserLabel") : t("talkWhoAssessment")) + '</span><p>' + shieldHtml(m.text) + jump + "</p></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll(".talk-jump-btn"), function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("talkPanel").hidden = true;
        switchToFullLogAndJump(btn.getAttribute("data-ref"));
      });
    });
    box.scrollTop = box.scrollHeight;
  }

  // ---- Lydbesked: en kort besked (højst ca. 10 sekunder), der siger status og hvad der kræves af dig ----
  // Der er ingen til/fra-knap: lyden kommer, når der er en stemme. Vil du ikke høre den, vælg ingen stemme under Stemme.
  function talkAudioReason() {
    if (shieldOn()) return t("talkSoundShield");
    if (!store.elevenLabsKey) return t("talkSoundNoKey");
    if (!store.thirdEyeVoiceId) return t("talkSoundNoVoice");
    return "";
  }

  function talkAudioPossible() {
    return !talkAudioReason();
  }

  // Statuslinjen under dialogen: hvorfor lyd ikke er mulig (med genvej), hvad der sker nu, eller en fejl.
  function setTalkAudioStatus(text, withChoose) {
    var hint = document.getElementById("talkSoundHint");
    hint.innerHTML = "";
    hint.hidden = !text;
    if (!text) return;
    hint.appendChild(document.createTextNode(text + " "));
    if (withChoose) {
      var go = document.createElement("button");
      go.type = "button";
      go.className = "btn talk-voice-btn";
      go.textContent = t("talkSoundChoose");
      go.addEventListener("click", function () {
        openVoicePanel();
      });
      hint.appendChild(go);
    }
  }

  function renderTalkSound() {
    var reason = talkAudioReason();
    setTalkAudioStatus(reason, Boolean(reason) && !shieldOn());
  }

  // Skriver lydbeskeden til Tredje øje-teksten med en separat, lille model-forespørgsel. Selve teksten røres ikke.
  // Svigter forespørgslen, bruges en fast skabelon, så der altid kommer en besked. Aldrig mere end ca. 25 ord.
  function writeAudioBrief(seat, text, extra) {
    var context =
      t("briefTextHeader") + "\n" + text +
      (extra && extra.options ? "\n\n" + t("briefOptionsLine", { count: extra.options }) : "") +
      "\n\n" + t("thirdEyeOpenNeedsHeader") + "\n" + openNeedsDigest();
    var sink = document.createElement("span");
    return streamReplyInto(seat, [{ role: "user", content: context }], t("briefInstruction"), sink)
      .then(function (res) {
        recordCall(seat, res, "thirdEyeBrief", {});
        var say = res && res.ok ? window.RundbordVoiceBrief.limitBrief(shieldRestoreText(res.reply || "")) : null;
        return say || spokenBrief(text, { thirdEye: true, options: (extra && extra.options) || 0 });
      })
      .catch(function () {
        return spokenBrief(text, { thirdEye: true, options: (extra && extra.options) || 0 });
      });
  }

  // Skriver og afspiller lydbeskeden; viser tydeligt, hvis noget går galt. Resolver med den sagte tekst (eller null).
  // onSay(say) kaldes, så snart lydbeskeden er skrevet (før den afspilles), så dialogen kan vise teksten med det samme.
  function talkSpeakBrief(seat, text, extra, onSay) {
    if (!talkAudioPossible()) {
      renderTalkSound();
      return Promise.resolve(null);
    }
    setTalkAudioStatus(t("talkAudioWriting"), false);
    return writeAudioBrief(seat, text, extra).then(function (say) {
      if (onSay) onSay(say);
      setTalkAudioStatus(t("talkAudioFetching"), false);
      return speakThirdEye(say).then(function (res) {
        if (res.ok) setTalkAudioStatus("", false);
        else setTalkAudioStatus(t("talkAudioFailed", { message: res.message || t("unknownError") }), false);
        return res.ok ? say : null;
      });
    });
  }

  // Registrerede observationer (regler på hændelseslogen, ingen model): et kort uddrag i dialogen.
  function renderTalkObservations() {
    var box = document.getElementById("talkObservations");
    if (!box) return;
    var list = observations || [];
    var html = '<p class="te-obs-title">' + escapeHtml(t("teObsTitle")) + "</p>";
    if (!list.length) {
      html += '<p class="te-obs-none">' + escapeHtml(t("teObsNone")) + "</p>";
    } else {
      html += list
        .slice(0, 3)
        .map(function (f) {
          return '<div class="te-obs-item"><span class="te-chip te-chip-obs">' + escapeHtml(t("teObsRegistered")) + "</span><span>" + escapeHtml(findingText(f)) + " <span class=\"te-obs-ev\">(" + escapeHtml(t("teObsEvidence", { count: f.evidence.length })) + ")</span></span></div>";
        })
        .join("");
      if (list.length > 3) html += '<p class="te-obs-none">' + escapeHtml(t("teObsMore", { count: list.length - 3 })) + "</p>";
    }
    box.innerHTML = html;
  }

  // Har Tredje øje ingen nøgle, sættes den her: den samme OpenRouter-nøgle som stolene bruger, gemt én gang som standardprofil.
  function saveTalkKey() {
    var input = document.getElementById("talkKeyInput");
    var status = document.getElementById("talkKeyStatus");
    var key = input.value.trim();
    if (!key) {
      status.textContent = t("talkKeyMissing");
      return;
    }
    var btn = document.getElementById("talkKeySaveBtn");
    btn.disabled = true;
    status.textContent = t("talkKeyChecking");
    window.rundbord
      .openrouterStarter(key)
      .then(function (res) {
        if (!res || !res.ok) {
          status.textContent = (res && res.message) || t("unknownError");
          return null;
        }
        return ensureDefaultOpenRouter(key, res.starter).then(function () {
          input.value = "";
          return window.rundbord.getStore().then(function (s) {
            store = s;
            render();
            openTalkPanel();
            document.getElementById("talkKeyStatus").textContent = "";
            document.getElementById("talkWith").textContent = t("talkKeyOk") + " " + document.getElementById("talkWith").textContent;
          });
        });
      })
      .catch(function () {
        status.textContent = t("unknownError");
      })
      .then(function () {
        btn.disabled = false;
      });
  }

  function openTalkPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var seat = thirdEyeSeat();
    document.getElementById("talkWith").textContent = seat ? t("talkWith", { seat: seat.name, model: seat.model || "" }) : "";
    document.getElementById("talkKeyBox").hidden = Boolean(seat);
    document.getElementById("talkKeyStatus").textContent = "";
    document.getElementById("talkSendBtn").disabled = !seat;
    document.getElementById("talkReviewBtn").disabled = !seat;
    document.getElementById("talkError").hidden = true;
    document.getElementById("talkChips").innerHTML = ["talkChip1", "talkChip2", "talkChip3"]
      .map(function (k) {
        return '<button type="button" class="role-chip-btn" data-k="' + k + '">' + escapeHtml(t(k)) + "</button>";
      })
      .join("");
    renderTalkObservations();
    refreshObservations().then(renderTalkObservations);
    renderTalkSound();
    ensureThirdEyeVoice().then(function (picked) {
      if (picked) renderTalkSound();
    });
    renderTalkThread();
    document.getElementById("talkPanel").hidden = false;
    document.getElementById("talkInput").focus();
  }

  function talkIsOpen() {
    var p = document.getElementById("talkPanel");
    return Boolean(p && !p.hidden);
  }

  function talkFail(message) {
    var el = document.getElementById("talkError");
    el.hidden = false;
    el.textContent = message;
  }

  function addTalkMessage(speaker, text, extra) {
    return window.rundbord
      .addMessage(store.activeBoardId, "__system__", text, "system", Object.assign({ kind: "thirdEyeTalk", talk: true, speaker: speaker }, extra || {}))
      .then(function (s) {
        store = s;
        renderTalkThread();
        return (s.boards[s.activeBoardId].messages || []).slice(-1)[0];
      });
  }

  // Sender ét spørgsmål (skrevet eller talt). Svaret skrives i tråden; stemmen siger kun den korte orientering.
  function talkSend(text) {
    text = String(text || "").trim().slice(0, 1500);
    if (!text || talkBusy) return Promise.resolve();
    var seat = thirdEyeSeat();
    if (!seat || !seat.apiKey) return talkFail(t("thirdEyeBtnTitleDisabled")), Promise.resolve();
    document.getElementById("talkError").hidden = true;
    talkBusy = true;
    var sendBtn = document.getElementById("talkSendBtn");
    sendBtn.disabled = true;
    var history = talkMessages().slice(-12).map(function (m) {
      return { role: m.meta.speaker === "user" ? "user" : "assistant", content: m.text };
    });
    // Seneste bordstatus lægges kun på det nyeste spørgsmål, så den aldrig er forældet.
    history.push({ role: "user", content: talkContextBlock() + "\n\n" + t("talkQuestionHeader") + "\n" + text });
    return addTalkMessage("user", text)
      .then(function () {
        var live = document.createElement("div");
        live.className = "talk-msg talk-eye";
        live.innerHTML = '<span class="talk-who">' + escapeHtml(t("thirdEyeLabel")) + "</span><p></p>";
        document.getElementById("talkThread").appendChild(live);
        var textEl = live.querySelector("p");
        return streamReplyInto(seat, history, t("talkInstruction"), textEl, function () {
          var box = document.getElementById("talkThread");
          box.scrollTop = box.scrollHeight;
        });
      })
      .then(function (res) {
        recordCall(seat, res, "thirdEyeTalk", {});
        if (!res.ok) {
          talkFail(t("thirdEyeFailedPrefix") + res.message);
          renderTalkThread();
          return null;
        }
        var reply = String(res.reply || "").trim();
        return addTalkMessage("eye", reply || t("emptyReplyFallback")).then(function () {
          if (reply) return talkSpeakBrief(seat, shieldRestoreText(reply), {});
        });
      })
      .finally(function () {
        talkBusy = false;
        sendBtn.disabled = false;
      });
  }

  function talkSubmit() {
    var input = document.getElementById("talkInput");
    var text = input.value;
    input.value = "";
    talkSend(text);
  }

  // "Vurdér bordet nu": den gamle vurdering, skrevet i bordets log med A/B/C. Her står kun en kort besked med en genvej til teksten.
  function talkReview() {
    if (!buildTableTranscript().trim()) return talkFail(t("thirdEyeNothingToEvaluate"));
    document.getElementById("talkError").hidden = true;
    addTalkMessage("user", t("talkReviewAsk")).then(function () {
      runThirdEyeReview();
    });
  }

  // Kaldes, når vurderingen er skrevet i bordets log (teksten er uændret): dialogen får en kort besked med genvej til teksten,
  // og en separat lydbesked fortæller status og hvad der kræves af dig.
  function talkReviewDone(seat, msgId, optionCount, display) {
    var ref = msgId ? { ref: msgId } : {};
    if (!talkAudioPossible()) {
      renderTalkSound();
      return addTalkMessage("eye", t("talkReviewNote"), ref);
    }
    return talkSpeakBrief(seat, shieldRestoreText(display || ""), { options: optionCount }, function (say) {
      addTalkMessage("eye", say, ref);
    });
  }

  function talkClear() {
    if (!talkMessages().length) return;
    if (!window.confirm(t("talkClearConfirm"))) return;
    window.rundbord.clearTalk(store.activeBoardId).then(function (s) {
      store = s;
      renderTalkThread();
    });
  }
