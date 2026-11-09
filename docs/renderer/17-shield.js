// 17-shield.js
// Beskyttelse af følsomme oplysninger: skjul før afsendelse, gendan lokalt (se lib/shield.js).

  var shieldQueue = Promise.resolve(); // afsendelser gennem beskyttelsen køres ét ad gangen (kortlægningen deles)
  var shieldShowRaw = false; // vis svar som modellen så dem (kun denne session)
  var shieldReviewResolve = null;

  function shieldOf(board) {
    return (board && board.shield) || { enabled: false, terms: [], allow: [], mapping: {} };
  }

  function shieldOn() {
    return shieldOf(currentBoard()).enabled === true;
  }

  function shieldMapping() {
    return shieldOf(currentBoard()).mapping || {};
  }

  // Gendanner pladsholdere i ren tekst (til filer og forhåndsvisninger).
  function shieldRestoreText(text) {
    var map = shieldMapping();
    if (!Object.keys(map).length) return String(text == null ? "" : text);
    return window.RundbordShield.restore(text, map).text;
  }

  // Gendanner pladsholdere som HTML: gendannede værdier understreges, og pladsholderen står i tooltip.
  function shieldHtml(text) {
    var map = shieldMapping();
    if (shieldShowRaw || !Object.keys(map).length) return escapeHtml(text);
    return window.RundbordShield
      .restoreParts(text, map)
      .map(function (p) {
        return p.placeholder
          ? '<span class="shield-restored" title="' + escapeHtml(p.placeholder) + '">' + escapeHtml(p.value) + "</span>"
          : escapeHtml(p.text);
      })
      .join("");
  }

  function renderShieldChip() {
    var btn = document.getElementById("shieldBtn");
    if (!btn) return;
    var on = shieldOn();
    btn.classList.toggle("on", on);
    btn.title = on ? t("shieldChipTitleOn") : t("shieldChipTitleOff");
    btn.setAttribute("aria-pressed", String(on));
    var note = document.getElementById("shieldStateNote");
    if (note) {
      note.textContent = on ? t("shieldStateOn") : t("shieldStateOff");
      note.classList.toggle("on", on);
    }
    renderPlaque();
  }

  function shieldPatch(patch) {
    return window.rundbord.updateShield(store.activeBoardId, patch).then(function (s) {
      store = s;
      renderShieldChip();
      return s;
    });
  }

  // ---- Porten: alt der sendes til en model går gennem her (se streamReplyInto) ----
  function collectShieldCandidates(texts, state) {
    var seen = {};
    var out = [];
    texts.forEach(function (txt) {
      window.RundbordShield.detect(txt, state).review.forEach(function (c) {
        var key = c.value.replace(/\s+/g, " ").trim().toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(c.value.replace(/\s+/g, " ").trim());
      });
    });
    return out;
  }

  function askShieldReview(cands) {
    var list = document.getElementById("shieldReviewList");
    list.innerHTML = cands
      .map(function (c, i) {
        return (
          '<label class="shield-row"><input type="checkbox" data-i="' + i + '"> <span class="shield-val">' + escapeHtml(c) +
          '</span> <span class="shield-hint">' + escapeHtml(t("shieldAllowLabel")) + "</span></label>"
        );
      })
      .join("");
    document.getElementById("shieldReviewPanel").hidden = false;
    var statusEl = document.getElementById("runStatus");
    var statusBefore = statusEl.textContent;
    updateRunUI(t("shieldReviewWaiting"));
    return new Promise(function (resolve) {
      shieldReviewResolve = function (action) {
        shieldReviewResolve = null;
        statusEl.textContent = statusBefore;
        var hide = [];
        var allow = [];
        Array.prototype.forEach.call(list.querySelectorAll("input"), function (input) {
          (input.checked ? allow : hide).push(cands[Number(input.getAttribute("data-i"))]);
        });
        document.getElementById("shieldReviewPanel").hidden = true;
        resolve({ action: action, hide: hide, allow: allow });
      };
    });
  }

  function shieldGate(seat, history, systemPrompt) {
    if (!shieldOn()) {
      var texts = [systemPrompt].concat(
        history.map(function (m) {
          return m.content;
        })
      );
      return Promise.resolve({
        ok: true,
        history: history,
        systemPrompt: systemPrompt,
        protectedOn: false,
        assessment: window.RundbordShield.assess(texts, shieldOf(currentBoard())),
      });
    }
    var run = shieldQueue.then(function () {
      return shieldGateInner(seat, history, systemPrompt);
    });
    shieldQueue = run.catch(function () {});
    return run;
  }

  function shieldGateInner(seat, history, systemPrompt) {
    var S = window.RundbordShield;
    var sh = shieldOf(currentBoard());
    var state = S.newState(sh);
    var texts = [systemPrompt].concat(
      history.map(function (m) {
        return m.content;
      })
    );
    var cands = collectShieldCandidates(texts, state);
    var decide = cands.length ? askShieldReview(cands) : Promise.resolve({ action: "send", hide: [], allow: [] });
    return decide.then(function (d) {
      if (d.action !== "send") return { ok: false, errorKind: "shield", message: t("shieldCancelled") };
      var patch = {};
      var shNow = sh;
      if (cands.length) {
        var dec = S.applyDecisions(sh, d.hide, d.allow);
        patch.terms = dec.terms;
        patch.allow = dec.allow;
        shNow = Object.assign({}, sh, { terms: dec.terms, allow: dec.allow });
      }
      state = S.newState(shNow);
      var count = 0;
      var kinds = {};
      function prot(txt) {
        var r = S.protect(txt, state);
        r.found.forEach(function (f) {
          count += 1;
          kinds[f.kind] = (kinds[f.kind] || 0) + 1;
        });
        return r.text;
      }
      var pPrompt = prot(systemPrompt) + "\n\n" + t("shieldInstruction");
      var pHist = history.map(function (m) {
        return { role: m.role, content: prot(m.content) };
      });
      if (S.changed(state)) patch.mapping = state.mapping;
      if (count) patch.event = { type: "shield.protected", seatId: seat.id, data: { count: count, kinds: kinds, reviewed: cands.length } };
      else if (cands.length) patch.event = { type: "shield.reviewed", seatId: seat.id, data: { reviewed: cands.length } };
      // Hvad blev skjult? Tælles på originalerne med de afgjorte valg, så loggen viser typer og antal.
      var assessment = S.assess(texts, shNow);
      var done = { ok: true, history: pHist, systemPrompt: pPrompt, protectedOn: true, assessment: assessment };
      if (!Object.keys(patch).length) return done;
      return shieldPatch(patch).then(function () {
        return done;
      });
    });
  }

  // ---- Indstillinger og forhåndsvisning ----
  function renderShieldPanel() {
    var sh = shieldOf(currentBoard());
    document.getElementById("shieldEnabledCheckbox").checked = sh.enabled;
    document.getElementById("shieldShowRawCheckbox").checked = shieldShowRaw;
    document.getElementById("shieldMappingLine").textContent = t("shieldMappingLine", {
      count: Object.keys(sh.mapping || {}).length,
      allow: (sh.allow || []).length,
    });
    var list = document.getElementById("shieldTermList");
    list.innerHTML = sh.terms.length
      ? sh.terms
          .map(function (term, i) {
            return (
              '<div class="memory-item"><span class="shield-val">' + escapeHtml(term.value) + '</span><span class="shield-hint">' +
              escapeHtml(t("shieldKind" + term.kind)) + '</span><button type="button" class="btn shield-del-btn" data-i="' + i + '">' +
              escapeHtml(t("shieldDeleteBtn")) + "</button></div>"
            );
          })
          .join("")
      : '<p class="shield-hint">' + escapeHtml(t("shieldTermsEmpty")) + "</p>";
    Array.prototype.forEach.call(list.querySelectorAll(".shield-del-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var next = sh.terms.filter(function (_t, i) {
          return i !== Number(btn.getAttribute("data-i"));
        });
        shieldPatch({ terms: next }).then(renderShieldPanel);
      });
    });
    updateShieldPreview();
    renderDataFlow();
    renderEgressLog();
  }

  function updateShieldPreview() {
    var S = window.RundbordShield;
    var text = document.getElementById("msgInput").value;
    var orig = document.getElementById("shieldPreviewOriginal");
    var prot = document.getElementById("shieldPreviewProtected");
    var note = document.getElementById("shieldPreviewNote");
    if (!text.trim()) {
      orig.textContent = t("shieldPreviewSample");
      prot.textContent = "";
      note.textContent = "";
      return;
    }
    var state = S.newState(shieldOf(currentBoard())); // kun til visning: intet gemmes
    var r = S.protect(text, state);
    orig.textContent = text;
    prot.textContent = r.text;
    note.textContent = r.review.length ? t("shieldPreviewReview", { count: r.review.length }) : "";
  }

  function openShieldPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    renderShieldPanel();
    document.getElementById("shieldPanel").hidden = false;
  }

  function addShieldTerm() {
    var input = document.getElementById("shieldTermInput");
    var value = input.value.trim();
    if (!value) return;
    var sh = shieldOf(currentBoard());
    var kind = document.getElementById("shieldTermKind").value;
    shieldPatch({ terms: sh.terms.concat([{ value: value, kind: kind }]) }).then(function () {
      input.value = "";
      renderShieldPanel();
    });
  }

  // ---- Log over det, der er sendt ud (kun typer og antal, aldrig værdierne) ----
  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return "";
    }
  }

  // dest: "llm" | "voice" | "git". info: { provider, model, host, protected, assessment, images, ok }
  function logEgress(dest, seat, info) {
    var data = window.RundbordEgress.makeData(Object.assign({ dest: dest }, info));
    emitEvent(window.RundbordEgress.TYPE, seat ? seat.id : null, {}, data);
  }

  function destLabel(row) {
    if (row.dest === "voice") return "ElevenLabs";
    if (row.dest === "git") return "GitHub" + (row.host ? " · " + row.host : "");
    return row.provider + (row.model ? " · " + row.model : "") + (row.host && row.provider === "custom" ? " · " + row.host : "");
  }

  function kindsText(kinds) {
    return Object.keys(kinds)
      .map(function (k) {
        return kinds[k] + " " + t("shieldKind" + k);
      })
      .join(", ");
  }

  function renderEgressLog() {
    var boardId = store.activeBoardId;
    return window.rundbord.getEvents(boardId).then(function (events) {
      if (boardId !== store.activeBoardId) return;
      var E = window.RundbordEgress;
      var tot = E.totals(events);
      var summary = document.getElementById("egressSummary");
      summary.textContent = tot.sends
        ? t("egressSummary", { sends: tot.sends, protectedSends: tot.protectedSends, clearSends: tot.clearSends, clearWithFindings: tot.clearWithFindings })
        : t("egressNone");
      summary.classList.toggle("egress-warn", tot.clearWithFindings > 0);
      var list = document.getElementById("egressList");
      var rows = E.rows(events, 25);
      list.innerHTML = rows
        .map(function (r) {
          var found = r.items ? kindsText(r.kinds) : t("egressNothingFound");
          if (r.possible) found += (r.items ? ", " : "") + t("egressPossible", { count: r.possible });
          if (r.images) found += (found ? ", " : "") + t("egressImages", { count: r.images });
          if (r.audio) found = t("egressAudio");
          var when = new Date(r.at);
          return (
            '<div class="egress-row' + (r.protected ? "" : " clear") + '"><span class="egress-when">' +
            escapeHtml(isNaN(when) ? "" : when.toLocaleString(store.locale === "en" ? "en-GB" : "da-DK", { dateStyle: "short", timeStyle: "short" })) +
            '</span><span class="egress-dest">' + escapeHtml(destLabel(r)) + '</span><span class="egress-status">' +
            escapeHtml(r.protected ? t("egressProtected") : t("egressClear")) + (r.ok ? "" : " · " + escapeHtml(t("egressFailed"))) +
            '</span><span class="egress-found">' + escapeHtml(found) + "</span></div>"
          );
        })
        .join("");
    });
  }

  // Hvor kan dine data gå hen? Udledt af bordets egen opsætning.
  function renderDataFlow() {
    var b = currentBoard();
    var seen = {};
    var lines = [];
    (b.seats || []).forEach(function (seat) {
      if (!seat.apiKey) return;
      var host = seat.provider === "custom" ? hostOf(seat.baseUrl) : "";
      var label = seat.provider + (host ? " (" + host + ")" : "");
      if (seen[label]) return;
      seen[label] = true;
      lines.push(t("dataflowLlm", { to: label }));
    });
    if (!lines.length) lines.push(t("dataflowNoSeats"));
    if (store.elevenLabsKey) lines.push(t("dataflowVoice"));
    if (b.githubUrl) lines.push(t("dataflowGit", { to: hostOf(b.githubUrl) || b.githubUrl }));
    document.getElementById("dataflowList").innerHTML = lines
      .map(function (l) {
        return "<li>" + escapeHtml(l) + "</li>";
      })
      .join("");
    var enc = !appInfo || appInfo.secretsEncrypted !== false;
    document.getElementById("shieldStorageNote").textContent = enc
      ? shieldOn()
        ? t("storageNoteOn")
        : t("storageNoteOff")
      : t("storageNoteNoEncryption");
  }
