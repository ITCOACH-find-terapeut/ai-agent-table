// 18-nextsteps.js
// Næste skridt: Tredje øje foreslår op til tre valg (A, B, C). Intet anvendes, før du vælger (se lib/nextsteps.js).

  function nextStepsContext() {
    var dials = {};
    DIALS.forEach(function (d) {
      dials[d.key] = { states: d.states.slice(), hasStrength: Boolean(d.hasStrength) };
    });
    return {
      seats: (currentBoard().seats || []).map(function (s) {
        return { id: s.id, name: s.name };
      }),
      roles: knownRoleNames(),
      dials: dials,
    };
  }

  // Det seneste Tredje øje-svar med valg, der hverken er valgt eller afvist. Ældre sæt udløber.
  function latestOpenOptionsMessage() {
    var msgs = currentBoard().messages || [];
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i];
      if (m.role === "system" && m.meta && m.meta.kind === "thirdEye" && Array.isArray(m.meta.options) && m.meta.options.length) {
        return m.meta.optionChosen || m.meta.optionsDismissed ? null : m;
      }
    }
    return null;
  }

  function optionById(msg, id) {
    return ((msg && msg.meta && msg.meta.options) || []).filter(function (o) {
      return o.id === id;
    })[0];
  }

  function optionDescription(o) {
    var dial = o.dial
      ? DIALS.filter(function (d) {
          return d.key === o.dial;
        })[0]
      : null;
    if (o.type === "give_turn") return t("nsGiveTurn", { seat: o.seatName });
    if (o.type === "set_dial") {
      return t("nsSetDial", {
        seat: o.seatName,
        dial: dial ? dialLabel(dial) : o.dial,
        state: dial ? dialStateLabel(dial, o.state) || o.state : o.state,
        strength: o.strength ? t("dialSetToStrengthSuffix", { strength: o.strength }) : "",
      });
    }
    if (o.type === "add_seat") return t(o.custom ? "nsAddSeatCustom" : "nsAddSeat", { role: o.role });
    return t("nsAddAddon", { seat: o.seatName, name: o.name });
  }

  // Hvad sker der konkret, hvis du vælger det? Skrives ud fra forslaget selv og appens faste regler, ikke af modellen.
  function optionConsequence(o) {
    if (o.type === "give_turn") return t("nsConseqTurn", { seat: o.seatName });
    if (o.type === "set_dial") {
      var dial = DIALS.filter(function (d) {
        return d.key === o.dial;
      })[0];
      return t("nsConseqDial", { seat: o.seatName, dial: dial ? dialLabel(dial) : o.dial });
    }
    if (o.type === "add_addon") return t("nsConseqAddon", { seat: o.seatName });
    return t("nsConseqSeat");
  }

  function nextStepsCardHtml(msg, interactive) {
    var opts = (msg.meta && msg.meta.options) || [];
    if (!opts.length) return "";
    var chosen = msg.meta.optionChosen ? optionById(msg, msg.meta.optionChosen) : null;
    if (chosen) {
      return '<div class="nextsteps done"><p class="nextsteps-title">' + escapeHtml(t("nsChosen", { id: chosen.id, what: optionDescription(chosen) })) + "</p></div>";
    }
    if (msg.meta.optionsDismissed || !interactive) return "";
    return (
      '<div class="nextsteps" data-msg-id="' + msg.id + '"><p class="nextsteps-title">' + escapeHtml(t("nsTitle")) + "</p>" +
      '<p class="nextsteps-sub">' + escapeHtml(t("nsSub")) + "</p>" +
      opts
        .map(function (o) {
          return (
            '<div class="nextstep"><span class="nextstep-id">' + o.id + '</span><div class="nextstep-body"><p class="nextstep-what">' +
            escapeHtml(optionDescription(o)) + "</p>" +
            '<p class="nextstep-conseq"><span class="nextstep-conseq-k">' + escapeHtml(t("nsConseqLabel")) + "</span> " + escapeHtml(optionConsequence(o)) + "</p>" +
            (o.text ? '<p class="nextstep-text">“' + shieldHtml(o.text) + "”</p>" : "") +
            (o.why ? '<p class="nextstep-why">' + shieldHtml(o.why) + "</p>" : "") +
            '</div><button type="button" class="btn nextstep-choose" data-msg-id="' + msg.id + '" data-opt="' + o.id + '">' +
            escapeHtml(t("nsChoose", { id: o.id })) + "</button></div>"
          );
        })
        .join("") +
      '<div class="row"><button type="button" class="btn nextstep-skip" data-msg-id="' + msg.id + '">' + escapeHtml(t("nsSkip")) + "</button></div></div>"
    );
  }

  // Kortet vises kun med knapper på det seneste, åbne sæt.
  function nextStepsCardForMessage(m) {
    if (!(m.meta && m.meta.kind === "thirdEye" && Array.isArray(m.meta.options))) return "";
    var latest = latestOpenOptionsMessage();
    return nextStepsCardHtml(m, Boolean(latest && latest.id === m.id));
  }

  function pendingNextStepsCount() {
    return latestOpenOptionsMessage() ? 1 : 0;
  }

  function nextStepNote(text) {
    return window.rundbord.addMessage(store.activeBoardId, "__system__", text, "system").then(function (s) {
      store = s;
    });
  }

  function chooseNextStep(msgId, optId) {
    var msg = (currentBoard().messages || []).filter(function (m) {
      return m.id === msgId;
    })[0];
    var o = optionById(msg, optId);
    if (!o || (msg.meta && (msg.meta.optionChosen || msg.meta.optionsDismissed))) return;
    // Bordet kan have ændret sig siden forslaget: tjek, at stolen stadig findes.
    var seat = o.seatId ? seatById(o.seatId) : null;
    if (o.seatId && !seat) {
      nextStepNote(t("nsStale")).then(render);
      return;
    }
    emitEvent("nextstep.chosen", seat ? seat.id : null, {}, { type: o.type, option: o.id, custom: Boolean(o.custom) }, msgId);
    window.rundbord.setMessageMeta(store.activeBoardId, msgId, { optionChosen: o.id }).then(function (s) {
      store = s;
      var done;
      if (o.type === "give_turn") {
        done = window.rundbord.setTurn(store.activeBoardId, seat.id, t("nsTurnReason")).then(function (s2) {
          store = s2;
          return nextStepNote(t("nsDoneTurn", { seat: seat.name }));
        });
      } else if (o.type === "set_dial") {
        var dial = DIALS.filter(function (d) {
          return d.key === o.dial;
        })[0];
        applyDialSuggestion(seat.id, { dial: dial, state: o.state, strength: o.strength }, null, "nextstep");
        return; // applyDialSuggestion skriver selv noten og gentegner
      } else if (o.type === "add_addon") {
        seat.customInstruction = (seat.customInstruction ? seat.customInstruction + "\n" : "") + o.name + ": " + o.text;
        done = window.rundbord.saveSeat(store.activeBoardId, seat, { source: "nextstep" }).then(function (s2) {
          store = s2;
          return nextStepNote(t("nsDoneAddon", { seat: seat.name, name: o.name }));
        });
      } else {
        // add_seat: stolen skal have en nøgle og en model, så formularen åbnes udfyldt, og du gemmer selv.
        var keySeat = (currentBoard().seats || []).filter(function (x) {
          return x.apiKey;
        })[0];
        document.getElementById("openNeedsPanel").hidden = true;
        openNeedsPanelOpen = false;
        openSeatPanel(null, o.custom ? "__custom" : o.role, { text: o.text, keyFromSeatId: keySeat ? keySeat.id : null });
        if (o.custom) {
          document.getElementById("roleCustomInput").value = o.role;
          updateInstructionPreview();
        }
        done = nextStepNote(t("nsDoneAddSeat", { role: o.role }));
      }
      done.then(render);
    });
  }

  function dismissNextSteps(msgId) {
    emitEvent("nextstep.dismissed", null, {}, {}, msgId);
    window.rundbord.setMessageMeta(store.activeBoardId, msgId, { optionsDismissed: true }).then(function (s) {
      store = s;
      render();
    });
  }

  // Øverst i indbakken: det åbne sæt valg og et resumé af forslag til instruktioner.
  function nextStepsInboxHtml() {
    var m = latestOpenOptionsMessage();
    var html = m ? nextStepsCardHtml(m, true) : "";
    var props = (currentBoard().proposals || []).length;
    if (props) {
      html +=
        '<div class="nextsteps proposals-inbox"><p class="nextsteps-title">' + escapeHtml(t("nsProposals", { count: props })) +
        '</p><div class="row"><button type="button" class="btn proposals-inbox-open">' + escapeHtml(t("nsProposalsOpen")) + "</button></div></div>";
    }
    return html;
  }

  function inboxExtraCount() {
    return pendingNextStepsCount() + (currentBoard().proposals || []).length;
  }
