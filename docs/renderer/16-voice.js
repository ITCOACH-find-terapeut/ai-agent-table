// 16-voice.js
// Stemme (ElevenLabs): kontonøgle, hentede stemmer, og "læs op"-knappen på svar.

  // Hentede stemmer i denne session (ikke gemt — hentes igen ved behov via "Hent stemmer").
  var voiceCache = [];

  function renderVoicePanel() {
    var hasKey = Boolean(store.elevenLabsKey);
    document.getElementById("elevenLabsKeyInput").value = "";
    document.getElementById("elevenLabsKeyNote").textContent = hasKey ? t("voiceKeyAlreadySaved") : "";
    document.getElementById("fetchVoicesBtn").disabled = !hasKey;
    document.getElementById("testVoiceKeyBtn").disabled = !hasKey;
    renderThirdEyeVoiceSelect();
    document.getElementById("voiceList").innerHTML = voiceCache.length
      ? voiceCache
          .map(function (v) {
            return (
              '<p class="voice-item"><button type="button" class="btn voice-play-btn" data-voice-id="' + escapeHtml(v.voiceId) + '" data-voice-name="' + escapeHtml(v.name) + '" title="' +
              escapeHtml(t("voiceTryTitle", { name: v.name })) + '">▶ ' + escapeHtml(t("voiceTryBtn")) + "</button><span>" + escapeHtml(v.name) + "</span></p>"
            );
          })
          .join("")
      : '<p class="note">' + escapeHtml(hasKey ? t("voiceListEmpty") : t("voiceListNoKey")) + "</p>";
    Array.prototype.forEach.call(document.querySelectorAll("#voiceList .voice-play-btn"), function (btn) {
      btn.addEventListener("click", function () {
        previewVoice(btn);
      });
    });
  }

  // ---- Prøv en stemme: en fast prøvesætning (ingen af dine tekster) læses op med stemmen ----
  function stopPreview() {
    stopSpeech();
  }

  function previewVoice(btn) {
    var label = t("voiceTryBtn");
    var status = document.getElementById("voiceFetchStatus");
    stopPreview();
    btn.disabled = true;
    btn.textContent = "… " + t("voiceTryLoading");
    status.textContent = "";
    window.rundbord.speakText(t("voiceSampleText"), btn.getAttribute("data-voice-id")).then(function (res) {
      btn.disabled = false;
      btn.textContent = "▶ " + label;
      // Prøvesætningen er fast tekst uden personoplysninger, men sendes stadig til ElevenLabs og står derfor i loggen.
      logEgress("voice", null, { provider: "elevenlabs", protected: false, assessment: { kinds: {}, possible: 0 }, ok: Boolean(res && res.ok) });
      if (!res || !res.ok) {
        status.textContent = t("voiceTryFailed", { message: (res && res.message) || t("unknownError") });
        return;
      }
      playSpeech(res.audioBase64, btn.getAttribute("data-voice-name") || "", t("voiceSampleText"), null, function () {
        status.textContent = t("voiceTryFailed", { message: t("unknownError") });
      });
    });
  }

  function openVoicePanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.getElementById("voiceFetchStatus").textContent = "";
    renderVoicePanel();
    document.getElementById("voicePanel").hidden = false;
  }

  function saveVoiceKey() {
    var input = document.getElementById("elevenLabsKeyInput");
    var typed = input.value.trim();
    if (!typed) return; // tomt felt = "behold den gemte", som ved stolenes egne API-nøgler
    window.rundbord.setElevenLabsKey(typed).then(function (s) {
      store = s;
      voiceCache = [];
      renderVoicePanel();
      testVoiceKey(); // en nøgle, der lige er sat, testes med det samme
    });
  }

  // ---- Test af nøglen: kan den hente stemmer, og må den bruge tale-til-tekst? ----
  function voiceTestLine(kind, status, label, extra) {
    var ok = status === "ok";
    var text = ok ? t(label + "Ok", extra) : status === "noPermission" ? t(label + "NoPermission") : status === "badKey" ? t("voiceTestBadKey") : t(label + "Fail", extra);
    return '<p class="' + (ok ? "ok" : "bad") + '">' + (ok ? "✓ " : "✗ ") + escapeHtml(text) + "</p>";
  }

  function testVoiceKey() {
    var out = document.getElementById("voiceTestResult");
    var btn = document.getElementById("testVoiceKeyBtn");
    if (!store.elevenLabsKey) {
      out.innerHTML = '<p class="bad">' + escapeHtml(t("voiceListNoKey")) + "</p>";
      return Promise.resolve();
    }
    btn.disabled = true;
    out.innerHTML = "<p>" + escapeHtml(t("voiceTesting")) + "</p>";
    return window.rundbord.testVoiceKey().then(function (res) {
      btn.disabled = false;
      if (!res || !res.voices) {
        out.innerHTML = '<p class="bad">✗ ' + escapeHtml((res && res.message) || t("unknownError")) + "</p>";
        return;
      }
      var html = voiceTestLine("voices", res.voices.status, "voiceTestVoices", { count: res.voices.count || 0, message: res.voices.message || "" });
      if (res.voices.status === "ok" || res.voices.status === "noPermission") {
        html += voiceTestLine("stt", res.stt.status, "voiceTestStt", { message: res.stt.message || "" });
      }
      out.innerHTML = html;
    });
  }

  // ---- Stemme til Tredje øje ----
  function renderThirdEyeVoiceSelect() {
    var select = document.getElementById("thirdEyeVoiceSelect");
    var current = store.thirdEyeVoiceId || "";
    select.innerHTML = '<option value="">' + escapeHtml(t("thirdEyeVoiceNone")) + "</option>";
    var ids = {};
    voiceCache.forEach(function (v) {
      ids[v.voiceId] = true;
      var opt = document.createElement("option");
      opt.value = v.voiceId;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
    if (current && !ids[current]) {
      var o = document.createElement("option");
      o.value = current;
      o.textContent = current;
      select.appendChild(o);
    }
    select.value = current;
  }

  // ---- Afspilning med synlig "taler"-indikator (bevægelige streger, tekstning og Stop) ----
  var speech = { audio: null, onDone: null };
  var briefSeed = 0;

  function hideSpeaking() {
    var el = document.getElementById("speakIndicator");
    if (el) el.hidden = true;
  }

  function stopSpeech() {
    var done = speech.onDone;
    var audio = speech.audio;
    speech.audio = null;
    speech.onDone = null;
    if (audio) {
      audio.onended = audio.onerror = audio.onpause = null;
      audio.pause();
    }
    hideSpeaking();
    if (done) done();
  }

  // who = hvem der taler, caption = det, stemmen siger (vises, så du også kan læse det), onDone kaldes når den stopper.
  function playSpeech(base64, who, caption, onDone, onFail) {
    stopSpeech();
    var audio = new Audio("data:audio/mpeg;base64," + base64);
    speech.audio = audio;
    speech.onDone = onDone || null;
    var el = document.getElementById("speakIndicator");
    document.getElementById("speakWho").textContent = who ? t("speakingWho", { who: who }) : t("speaking");
    document.getElementById("speakCaption").textContent = caption || "";
    el.hidden = false;
    var finish = function () {
      if (speech.audio !== audio) return;
      stopSpeech();
    };
    audio.onended = finish;
    audio.onerror = function () {
      if (onFail) onFail();
      finish();
    };
    return audio.play().catch(function () {
      if (onFail) onFail();
      finish();
    });
  }

  // Det, stemmen siger: aldrig hele svaret (ofte kode), men en kort, motiverende besked om, hvad der er sendt.
  // Meget korte, rene svar læses som de er. ctx: { thirdEye, options, needRole }.
  function spokenBrief(text, ctx) {
    var b = window.RundbordVoiceBrief.brief(text, Object.assign({}, ctx || {}, { seed: briefSeed++ }));
    return b.kind === "verbatim" ? b.text : t(b.key, b.params);
  }

  function needRoleOf(text) {
    var n = parseNeedsSummary(text);
    return n && !/^(intet|ingen|none|nothing)\b/i.test(n.need) ? n.role || n.need : "";
  }

  // Siger netop denne tekst (lydbeskeden, højst ca. 10 sekunder) med Tredje øjes stemme. Aldrig mens Beskyttelse er på.
  // Returnerer { ok, message }, så dialogen kan vise en fejl i stedet for at tie.
  function speakThirdEye(spoken) {
    if (!store.thirdEyeVoiceId || shieldOn() || !String(spoken || "").trim()) return Promise.resolve({ ok: false, message: "" });
    return window.rundbord.speakText(spoken, store.thirdEyeVoiceId).then(function (res) {
      logEgress("voice", null, {
        provider: "elevenlabs",
        protected: false,
        assessment: window.RundbordShield.assess([spoken], shieldOf(currentBoard())),
        ok: Boolean(res && res.ok),
      });
      if (!res || !res.ok) return { ok: false, message: (res && res.message) || t("unknownError") };
      return new Promise(function (resolve) {
        playSpeech(res.audioBase64, t("thirdEyeLabel"), spoken, function () {
          resolve({ ok: true });
        }, function () {
          resolve({ ok: false, message: t("unknownError") });
        });
      });
    });
  }

  // ---- Tal med Tredje øje: mikrofon → tale-til-tekst (ElevenLabs) → spørgsmål eller valg ----
  var mic = { state: "idle", recorder: null, stream: null, chunks: [], timer: null };

  function micError(message) {
    var el = document.getElementById("talkError");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  function setMicState(state) {
    mic.state = state;
    Array.prototype.forEach.call(document.querySelectorAll(".mic-btn"), function (btn) {
      btn.classList.toggle("recording", state === "recording");
      btn.disabled = state === "busy";
      btn.textContent = state === "recording" ? "● " + t("micStopLabel") : state === "busy" ? "…" : "🎤";
      btn.title = state === "recording" ? t("micStopTitle") : t("micBtnTitle");
    });
  }

  function pickAudioType() {
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return types.filter(function (x) {
      return window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x);
    })[0] || "";
  }

  function releaseMic() {
    clearTimeout(mic.timer);
    if (mic.stream) mic.stream.getTracks().forEach(function (tr) { tr.stop(); });
    mic.stream = null;
  }

  function stopMic() {
    if (mic.recorder && mic.recorder.state !== "inactive") mic.recorder.stop();
    releaseMic();
  }

  function toggleThirdEyeMic() {
    if (mic.state === "recording") return stopMic();
    if (mic.state !== "idle") return;
    var errorEl = document.getElementById("talkError");
    if (errorEl) errorEl.hidden = true;
    // Talen sendes som lyd til ElevenLabs, og lyd kan ikke beskyttes: derfor aldrig mens Beskyttelse er på.
    if (shieldOn()) return micError(t("micShieldOn"));
    if (!store.elevenLabsKey) {
      openVoicePanel();
      return micError(t("micNoKey"));
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) return micError(t("micUnsupported"));
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        mic.stream = stream;
        mic.chunks = [];
        var type = pickAudioType();
        mic.recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        mic.recorder.ondataavailable = function (e) {
          if (e.data && e.data.size) mic.chunks.push(e.data);
        };
        mic.recorder.onstop = handleRecording;
        mic.recorder.start();
        setMicState("recording");
        mic.timer = setTimeout(stopMic, 90000); // højst halvandet minut ad gangen
      })
      .catch(function () {
        setMicState("idle");
        micError(t("micDenied"));
      });
  }

  function handleRecording() {
    releaseMic();
    var type = (mic.recorder && mic.recorder.mimeType) || "audio/webm";
    var blob = new Blob(mic.chunks, { type: type });
    mic.chunks = [];
    if (blob.size < 800) {
      setMicState("idle");
      return micError(t("micEmpty"));
    }
    setMicState("busy");
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(",")[1] || "";
      window.rundbord.transcribeAudio(base64, type).then(function (res) {
        logEgress("voice", null, { provider: "elevenlabs", protected: false, audio: true, assessment: { kinds: {}, possible: 0 }, ok: Boolean(res && res.ok) });
        setMicState("idle");
        if (!res || !res.ok) return micError(t("micFailed", { message: (res && res.message) || t("unknownError") }));
        if (!res.text) return micError(t("micEmpty"));
        onSpoken(res.text);
      });
    };
    reader.readAsDataURL(blob);
  }

  // Et tydeligt valg ("vælg B") vælger kun efter din bekræftelse; alt andet bliver et spørgsmål til Tredje øje.
  function onSpoken(text) {
    var choice = window.RundbordVoice.parseChoice(text);
    var open = latestOpenOptionsMessage();
    var opt = choice && open ? optionById(open, choice) : null;
    if (opt) {
      if (window.confirm(t("voiceChoiceConfirm", { said: text, id: choice, what: optionDescription(opt) }))) chooseNextStep(open.id, choice);
      return;
    }
    if (!talkIsOpen()) openTalkPanel();
    talkSend(text);
  }

  // Har du en nøgle, men endnu ingen stemme til Tredje øje, hentes stemmerne i det stille, og den første vælges, så lyden virker med det samme.
  function ensureThirdEyeVoice() {
    if (!store.elevenLabsKey || store.thirdEyeVoiceId || shieldOn()) return Promise.resolve(false);
    return window.rundbord.listVoices().then(function (res) {
      if (!res || !res.ok || !(res.voices || []).length) return false;
      voiceCache = res.voices;
      return window.rundbord.setThirdEyeVoice(voiceCache[0].voiceId).then(function (s) {
        store = s;
        return true;
      });
    });
  }

  function fetchVoices() {
    var btn = document.getElementById("fetchVoicesBtn");
    var statusEl = document.getElementById("voiceFetchStatus");
    btn.disabled = true;
    statusEl.textContent = t("voiceFetching");
    window.rundbord.listVoices().then(function (res) {
      btn.disabled = false;
      if (res && res.ok) {
        voiceCache = res.voices || [];
        statusEl.textContent = t("voiceFetchedCount", { count: voiceCache.length });
        // Første gang: vælg den første stemme til Tredje øje, så den kan tale med det samme (kan ændres nedenfor).
        if (!store.thirdEyeVoiceId && voiceCache.length) {
          statusEl.textContent += " " + t("voiceAutoPicked", { name: voiceCache[0].name });
          window.rundbord.setThirdEyeVoice(voiceCache[0].voiceId).then(function (s) {
            store = s;
            renderThirdEyeVoiceSelect();
          });
        }
        renderVoicePanel();
        renderThirdEyeVoiceSelect();
        populateVoiceSelect(document.getElementById("voiceSelect").getAttribute("data-current") || "");
      } else {
        statusEl.textContent = t("voiceFetchFailedPrefix") + ((res && res.message) || t("unknownError"));
      }
    });
  }

  // Fyldt op i stol-panelet — kaldes fra openSeatPanel (13-board-seats.js).
  function populateVoiceSelect(currentVoiceId) {
    var select = document.getElementById("voiceSelect");
    select.setAttribute("data-current", currentVoiceId || "");
    select.innerHTML = '<option value="">' + escapeHtml(t("seatVoiceNone")) + "</option>";
    voiceCache.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v.voiceId;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
    // Stolen kan have en stemme, der ikke (længere) er i den hentede liste — vis den alligevel.
    if (currentVoiceId && !voiceCache.some(function (v) { return v.voiceId === currentVoiceId; })) {
      var opt2 = document.createElement("option");
      opt2.value = currentVoiceId;
      opt2.textContent = currentVoiceId;
      select.appendChild(opt2);
    }
    select.value = currentVoiceId || "";
    document.getElementById("voiceSelectHint").textContent = voiceCache.length || !store.elevenLabsKey
      ? t("seatVoiceHint")
      : t("seatVoiceFetchFirst");
  }

  // "🔊 Læs op" på et svar i den fulde samtale. btn går i "spiller ..."-tilstand,
  // og standser sig selv igen når afspilningen er færdig (eller fejler).
  function speakMessage(seat, text, btn) {
    if (!seat || !seat.voiceId || shieldOn()) return; // stemmen kan ikke beskyttes: aldrig mens Beskyttelse er på
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("voiceLoading");
    var spoken = spokenBrief(stripNeedsSummary(text), { needRole: needRoleOf(text) });
    var reset = function () {
      btn.disabled = false;
      btn.textContent = original;
    };
    window.rundbord.speakText(spoken, seat.voiceId).then(function (res) {
      logEgress("voice", seat, {
        provider: "elevenlabs",
        protected: false,
        assessment: window.RundbordShield.assess([spoken], shieldOf(currentBoard())),
        ok: Boolean(res && res.ok),
      });
      if (!res || !res.ok) {
        btn.disabled = false;
        btn.textContent = t("errorBtnShort");
        btn.title = (res && res.message) || t("unknownError");
        setTimeout(function () {
          btn.textContent = original;
          btn.title = t("speakBtnTitle");
        }, 4000);
        // En tooltip opdager man ikke: forklaringen står også i aktivitetsstrømmen, så man kan se, hvad der skal gøres.
        if (res && res.message) systemNote(t("voiceSeatErrorNote", { seat: seat.name, message: res.message }));
        return;
      }
      btn.textContent = t("voicePlaying");
      playSpeech(res.audioBase64, seat.name, spoken, reset, reset);
    });
  }
