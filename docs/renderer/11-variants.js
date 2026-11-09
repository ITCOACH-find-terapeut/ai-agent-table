// 11-variants.js
// 'Smag varianter': parallelle kørsler af samme besked med forskellig dial-indstilling.

  // --- Smag varianter ---
  // Kør den samme besked flere gange parallelt på ÉN stol, med forskellige
  // tilstande af ÉN dial — så man kan sammenligne svar side om side i
  // stedet for at gætte sig frem til den rigtige indstilling. Modsat en
  // agent-sværm er formålet ikke bredde, men at kalibrere én rolle man
  // allerede forstår.
  function populateVariantDialSelect() {
    var select = document.getElementById("variantDialSelect");
    select.innerHTML = "";
    DIALS.forEach(function (dial) {
      var opt = document.createElement("option");
      opt.value = dial.key;
      opt.textContent = dial.icon + " " + dialLabel(dial);
      select.appendChild(opt);
    });
  }

  // "Efter behov" overlader selve vurderingen til modellen, besked for
  // besked — dens pointe kan aldrig ses i ét enkelt testsvar side om side,
  // kun i hvordan den varierer hen over mange forskellige beskeder over tid.
  // Den er derfor udelukket fra smagningen: hvert dial har enten to reelle
  // tilstande tilbage (Fra/Til) eller, for "Må ændre egne regler", tre der
  // ikke er en gættet/fast modsætning (Nej/Foreslå/Ja).
  function variantEligibleStates(dial) {
    return dial.states.filter(function (s) {
      return s !== "auto";
    });
  }

  function renderVariantStatePicks() {
    var dialKey = document.getElementById("variantDialSelect").value;
    var dial = DIALS.filter(function (d) {
      return d.key === dialKey;
    })[0];
    var wrap = document.getElementById("variantStatePicks");
    wrap.innerHTML = "";
    if (!dial) return;
    var states = variantEligibleStates(dial);
    if (states.length <= 2) {
      // Kun to tilstande tilbage — der er intet at vælge imellem, det ER
      // sammenligningen. Ingen afkrydsning at rode i eller glemme, så
      // "vælg mindst 2" kan slet ikke opstå her.
      wrap.innerHTML =
        '<p class="variant-compare-note">' + escapeHtml(t("variantCompareNotePrefix")) +
        states.map(function (s) { return escapeHtml(dialStateLabel(dial, s)); }).join(" ↔ ") +
        "</p>";
      return;
    }
    states.forEach(function (stateKey) {
      var label = document.createElement("label");
      label.className = "variant-state-check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = stateKey;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(dialStateLabel(dial, stateKey)));
      wrap.appendChild(label);
    });
  }

  function runVariantTasting() {
    var errorEl = document.getElementById("chatError");
    errorEl.hidden = true;
    var text = document.getElementById("msgInput").value.trim();
    // Tidligere returnerede disse to tjek helt stille — ingen fejl, ingen
    // synlig reaktion overhovedet. Set fra brugerens stol så det bare ud som
    // om "Kør varianter" ikke virkede.
    if (!selectedSpeakerId || selectedSpeakerId === RECIPIENT_EVERYONE) {
      errorEl.hidden = false;
      errorEl.textContent = t("variantSelectSeatFirst");
      return;
    }
    if (!text) {
      errorEl.hidden = false;
      errorEl.textContent = t("variantWriteMessageFirst");
      return;
    }
    var seat = seatById(selectedSpeakerId);
    if (!seat) return;
    if (!seat.apiKey) {
      errorEl.hidden = false;
      errorEl.textContent = t("noApiKeySaved");
      return;
    }
    var dialKey = document.getElementById("variantDialSelect").value;
    var dial = DIALS.filter(function (d) {
      return d.key === dialKey;
    })[0];
    // Kun dials med 3+ tilstande efter fjernelse af "auto" (i praksis kun
    // "Må ændre egne regler") viser afkrydsningsfelter overhovedet — ellers
    // er de to tilbageværende tilstande automatisk selve sammenligningen.
    var checkboxes = document.querySelectorAll("#variantStatePicks input[type=checkbox]");
    var checkedStates = checkboxes.length
      ? Array.prototype.filter
          .call(checkboxes, function (cb) {
            return cb.checked;
          })
          .map(function (cb) {
            return cb.value;
          })
      : variantEligibleStates(dial);
    if (checkedStates.length < 2) {
      errorEl.hidden = false;
      errorEl.textContent = t("variantSelectAtLeastTwo");
      return;
    }

    document.getElementById("variantSetup").hidden = true;
    var resultsWrap = document.getElementById("variantResults");
    resultsWrap.hidden = false;
    resultsWrap.innerHTML =
      '<p class="note variant-results-heading">' +
      escapeHtml(t("variantResultsHeading", { count: checkedStates.length, dial: dialLabel(dial), seat: seat.name })) +
      "</p>";

    // Samme historik sendes til alle varianter — ingen af dem er "det rigtige
    // svar" endnu, så ingen af dem må selv tilføjes til stolens historik.
    // Beskeden i feltet er heller ikke gemt/sendt endnu på dette tidspunkt
    // (det sker først i useVariantAnswer, hvis brugeren vælger en variant),
    // så den skal tilføjes her manuelt — ellers svarer modellen på den GAMLE
    // samtale uden noget nyt at reagere på, og alle varianter konvergerer
    // mod stort set det samme svar uanset hvilken dial-tilstand der testes.
    var history = seatHistory(seat.id).concat([{ role: "user", content: text }]);

    checkedStates.forEach(function (stateKey) {
      var variantSeat = JSON.parse(JSON.stringify(seat));
      variantSeat.dials = variantSeat.dials || defaultDials();
      variantSeat.dials[dialKey] = variantSeat.dials[dialKey] || {};
      variantSeat.dials[dialKey].state = stateKey;

      var card = document.createElement("div");
      card.className = "variant-card";
      card.style.setProperty("--seat-color", seatColorVar(seat.color));
      card.innerHTML =
        '<div class="variant-card-head"><span class="variant-card-label">' +
        escapeHtml(dialStateLabel(dial, stateKey)) + '</span><span class="live-dot">●</span></div>' +
        '<p class="variant-card-text"></p>';
      resultsWrap.appendChild(card);
      var textEl = card.querySelector(".variant-card-text");
      var history2 = history.slice();

      Promise.all([buildSystemPrompt(variantSeat, {}), buildInImages(variantSeat)])
        .then(function (r) {
          return streamReplyInto(variantSeat, history2, r[0], textEl, null, r[1]);
        })
        .then(function (res) {
          card.querySelector(".live-dot").remove();
          recordCall(seat, res, "variant", {});
          if (!res.ok) {
            textEl.textContent = t("variantErrorPrefix", { message: res.message });
            return;
          }
          textEl.textContent = res.reply || t("emptyReplyFallback");
          var useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "btn btn-primary variant-use-btn";
          useBtn.textContent = t("useVariantAnswerBtn");
          useBtn.addEventListener("click", function () {
            useVariantAnswer(seat, dialKey, stateKey, text, res.reply || t("emptyReplyFallback"));
          });
          card.appendChild(useBtn);
        });
    });
  }

  // Gør én smagt variant "rigtig": tilføjer den til stolens historik som et
  // ægte svar (uden at kalde modellen igen — svaret er allerede genereret),
  // og anvender den vindende dial-tilstand permanent på stolen.
  function useVariantAnswer(seat, dialKey, stateKey, sentText, replyText) {
    emitEvent("variant.chosen", seat.id, {}, { dial: dialKey, state: stateKey });
    window.rundbord
      .setTurn(store.activeBoardId, seat.id, t("selectedVariantReason", { seat: seat.name }))
      .then(function (s) {
        store = s;
        render();
        return window.rundbord.addMessage(store.activeBoardId, seat.id, sentText, "user", null);
      })
      .then(function (s) {
        store = s;
        return window.rundbord.addMessage(
          store.activeBoardId,
          seat.id,
          replyText,
          "assistant",
          { icons: iconsSnapshot(seat) }
        );
      })
      .then(function (s) {
        store = s;
        var freshSeat = seatById(seat.id);
        if (!freshSeat) return store;
        freshSeat.dials = freshSeat.dials || defaultDials();
        freshSeat.dials[dialKey] = freshSeat.dials[dialKey] || {};
        freshSeat.dials[dialKey].state = stateKey;
        return window.rundbord.saveSeat(store.activeBoardId, freshSeat, { source: "variant" });
      })
      .then(function (s) {
        store = s;
        document.getElementById("msgInput").value = "";
        document.getElementById("variantResults").hidden = true;
        document.getElementById("variantResults").innerHTML = "";
        render();
      });
  }

