// 02-instructions.js
// Behovs- og overdragelsestekst, Tredje øje, og parsing/anvendelse af 🔭👉🎚-blokken.

  function defaultDials() {
    var d = {};
    DIALS.forEach(function (dial) {
      // Fase D: "auto" er nu standard for nye stole, hvor dial'en har den
      // tilstand (Ræsonnement, Modsigelse, Nysgerrighed, Risikosans,
      // Menneskelig konsekvens) — modellen bruger selv sin vurdering fra
      // start, fremfor at være helt tavs om det, indtil brugeren aktivt
      // slår det til. Dette gælder KUN nyoprettede stole (se kaldsstederne:
      // altid `seat.dials || defaultDials()`) — eksisterende stoles gemte
      // dials rører denne ændring aldrig ved, ingen stiltiende migrering.
      // For dials UDEN en "auto"-tilstand (Selvtjek, Usikkerhed, Omkostning)
      // gælder den oprindelige regel: dial.states[0] er altid den neutrale
      // "fra"-tilstand. En tidligere fejl her ("length > 2 ? 1 : 0") slog
      // reelt 5 dials til som "on" pr. ny stol, uden brugeren nogensinde
      // havde valgt det — denne ændring gentager IKKE den fejl, fordi
      // "auto" (modellens egen vurdering) er noget andet end et stiltiende
      // "til" brugeren aldrig bad om.
      var defaultState = dial.states.indexOf("auto") >= 0 ? "auto" : dial.states[0];
      d[dial.key] = { state: defaultState, strength: 6, note: "" };
    });
    // action og modifyRules har ingen egentlig "fra"-tilstand — de beskriver
    // altid noget (se describe() ovenfor) — så deres startværdi er et
    // bevidst adfærdsvalg for nye stole, ikke en synlig til/fra-knap.
    d.action = { state: "on", strength: 5, note: "" };
    d.modifyRules = { state: "suggest", note: "" };
    return d;
  }

  // Den faktiske liste af dials modellen kan vælge imellem — bygget direkte
  // fra DIALS, så prompten aldrig kommer ud af trit med de rigtige knapper.
  // Uden denne liste gættede modellen frit ("Kreativitet", "Struktur",
  // "Selektion") på navne der ikke findes nogen steder i appen, så forslaget
  // aldrig kunne anvendes automatisk — kun læses og oversættes manuelt.
  // Funktion, ikke en konstant — skal genopbygges pr. kald, fordi den følger
  // det AKTIVE locale, ikke et der var aktivt da scriptet loadede.
  function buildDialAdjustCatalog() {
    return DIALS.map(function (dial) {
      var states = dial.states.map(function (s) { return dialStateLabel(dial, s); }).join("/");
      return dialLabel(dial) + " (" + states + (dial.hasStrength ? t("dialStrengthSuffix") : "") + ")";
    }).join("; ");
  }

  // Beder modellen afslutte med en fast, parse-bar blok, så "→ Videresend"
  // kan bruge den til at give næste stol en konkret opgave i stedet for
  // bare at sende det samme svar videre til at blive gengivet forfra.
  // Ligesom buildDialAdjustCatalog: en funktion, ikke en konstant.
  function buildNeedsSummaryInstruction(seat) {
    // De andre stoles navne, så modellen vælger blandt rigtige stole i stedet for at gætte et rollenavn.
    var others = currentBoard().seats
      .filter(function (s) {
        return !seat || s.id !== seat.id;
      })
      .map(function (s) {
        return s.name;
      });
    return (
      t("needsSummaryPreamble") +
      t("needsSummaryInstruction", {
        catalog: buildDialAdjustCatalog(),
        seats: others.length ? t("needsSummarySeats", { names: others.join(", ") }) : "",
        handoff: currentBoard().handoffMode === "structured" ? t("handoffInstruction") : "",
      }) +
      t("needsSummaryClosing")
    );
  }

  // To bevidste forskelle fra en naiv version af dette regex:
  // 1) JUSTÉR bruger [^\n]* (0+), ikke [^\n]+ (1+) som de to andre felter —
  //    en model der efterlader linjen tom ("🎚 JUSTÉR:" uden noget efter)
  //    skal stadig give et gyldigt BEHOV/ROLLE-match. Med + fejlede HELE
  //    blokken stille, og bordet mistede original-opgave-ankeret,
  //    dial-forslaget og "Åbne behov"-sporingen for beskeden — uden nogen
  //    synlig fejl (opdaget i en rigtig kørsel 2026-09-21).
  // 2) [ \t]* (kun vandret whitespace) efter hvert felt-navn, ikke \s* — \s*
  //    matcher også linjeskift, så den ville æde den tomme linje efter et
  //    tomt JUSTÉR-felt og fange starten af NÆSTE afsnit som "justeringen"
  //    i stedet (fanget under selve rettelsen af (1): en tom JUSTÉR-linje
  //    endte med at fange "💡 Forslag?" som sin værdi).
  // 3) \*{0,2} omkring hvert felt-navn og dets kolon — nogle modeller (set
  //    hos Clarifier/claude-haiku) fed-skriver labelen som "🔭 **BEHOV:**"
  //    i stedet for "🔭 BEHOV:". Uden dette fejlede HELE blokken igen,
  //    stille, med præcis samme konsekvens som (1): videresendelsen faldt
  //    tilbage til rå gengivelse uden original-opgave-anker (opdaget i en
  //    rigtig kørsel 2026-09-21, samme dag som (1) og (2)).
  // 4) [^\n:]* i stedet for det bogstavelige ordet "BEHOV"/"ROLLE"/"JUSTÉR" —
  //    matcher hvad som helst frem til første kolon på linjen, uanset hvilket
  //    ord der faktisk står der. Fanger dermed BEHOV, NEED, eller et hvilket
  //    som helst andet sprogs label, uden at parseren skal kende det på
  //    forhånd. Uden dette ville en engelsksproget stol (eller enhver anden
  //    sprogindstilling) ramme nøjagtig samme stille fejl som (1) og (3),
  //    bare udløst af sprog i stedet for et tomt felt eller fed skrift.
  // 5) (?:[ \t]*\n)* mellem linjerne — nogle modeller (set hos Clarifier/
  //    claude-haiku 2026-09-26) sætter en tom linje mellem "---" og "🔭". Uden
  //    dette blev HELE blokken overset, og relæet faldt tilbage til rå tekst
  //    uden original-opgave-anker og uden overdragelse (samme fejlklasse som 1-4).
  var NEEDS_SUMMARY_RE =
    /---[ \t]*\n(?:[ \t]*\n)*[ \t]*🔭[^\n:]*:\*{0,2}[ \t]*([^\n]+)\n(?:[ \t]*\n)*[ \t]*👉[^\n:]*:\*{0,2}[ \t]*([^\n]+)\n(?:[ \t]*\n)*[ \t]*🎚[^\n:]*:\*{0,2}[ \t]*([^\n]*)/;

  // "Tredje øje": en uafhængig vurdering af selve bordets proces — ikke en
  // deltager i arbejdet, kun en observatør af det. Bevidst en FAST
  // instruktion uafhængig af den lånte stols egne dials/rolle, så
  // vurderingen ikke bliver farvet af fx Communicators egen Modsigelse- eller
  // Selvstændighedsindstilling — den låner kun modellen og nøglen. Selve
  // teksten hentes via t("thirdEyeInstruction") ved brug (se
  // runThirdEyeReview), ikke en konstant her, så den følger aktivt locale.

  // Fladt, kronologisk referat af HELE bordets samtale på tværs af alle
  // stole — modsat seatHistory(), som kun viser én stols eget snævre
  // perspektiv. Tredje øje skal netop se det de enkelte stole ikke kan:
  // hele bordet på én gang.
  function buildTableTranscript() {
    var board = currentBoard();
    return (board.messages || [])
      .filter(function (m) {
        return !(m.meta && (m.meta.kind === "thirdEye" || m.meta.talk));
      })
      .map(function (m) {
        var seat = seatById(m.seatId);
        var who = m.role === "user" ? t("nameUserLabel") : m.role === "system" ? t("nameSystemLabel") : seat ? seat.name : t("unknownSeat");
        var text = m.role === "assistant" ? stripNeedsSummary(m.text) : m.text;
        return who + ": " + text;
      })
      .join("\n\n---\n\n");
  }

  function openNeedsDigest() {
    var items = computeOpenNeeds();
    if (!items.length) return t("noOpenNeedsPlaceholder");
    return items
      .map(function (item) {
        return "- [" + (item.seat ? item.seat.name : "?") + " → " + item.needsSummary.role + "] " + item.needsSummary.need;
      })
      .join("\n");
  }

  // Tredje øje har sin egen forbindelse: en Modelprofil API med en nøgle, uden at en stol skal låne den. Udgifterne regnes i bordets Tredje øje-regnskab (board.thirdEyeCalls).
  var THIRD_EYE_SEAT_ID = "__thirdeye__";

  // Modellen, Tredje øje sender til: profilens egen, ellers udbyderens standard, ellers modellen på en stol, der bruger profilen (fx en egen adresse uden standard).
  function thirdEyeModelOf(p) {
    if (p.model) return p.model;
    if (DEFAULT_MODEL[p.provider]) return DEFAULT_MODEL[p.provider];
    var seat = ((currentBoard() && currentBoard().seats) || []).filter(function (s) {
      return s.modelId === p.id && s.model;
    })[0];
    return seat ? seat.model : "";
  }

  // Kun profiler med en nøgle og en model at sende til.
  function thirdEyeProfiles() {
    return modelProfiles().filter(function (p) {
      return p.apiKey && thirdEyeModelOf(p);
    });
  }

  // Valget i vælgeren som noget, et kald kan sendes med: en Tredje øje-"stol" bygget af en Modelprofil API, eller en stol på bordet (som før).
  function thirdEyeSeat() {
    var sel = document.getElementById("thirdEyeSeatSelect");
    var v = sel ? sel.value : "";
    if (v.indexOf("profile:") === 0) {
      var p = modelProfileById(v.slice(8));
      if (!p || !p.apiKey || !thirdEyeModelOf(p)) return null;
      return { id: THIRD_EYE_SEAT_ID, name: p.name, provider: p.provider, baseUrl: p.baseUrl || "", apiKey: p.apiKey, model: thirdEyeModelOf(p), modelId: p.id, color: "slate", calls: [] };
    }
    return seatById(v);
  }

  // Automatisk valg: det, du har valgt, ellers OpenRouter-profilen (mange modeller med én nøgle), ellers den første profil, ellers den første stol med en nøgle.
  function thirdEyeDefaultValue(profiles, values) {
    var saved = store && store.thirdEyeModelId;
    if (saved && values.indexOf("profile:" + saved) >= 0) return "profile:" + saved;
    var standard = window.RundbordModels.defaultProfile(store);
    if (standard && values.indexOf("profile:" + standard.id) >= 0) return "profile:" + standard.id;
    var openrouter = profiles.filter(function (p) {
      return p.provider === "openrouter";
    })[0];
    if (openrouter) return "profile:" + openrouter.id;
    if (profiles[0]) return "profile:" + profiles[0].id;
    return values[0] || "";
  }

  function renderThirdEyeSelect() {
    var sel = document.getElementById("thirdEyeSeatSelect");
    var btn = document.getElementById("thirdEyeBtn");
    if (!sel || !btn) return;
    var prevValue = sel.value;
    var profiles = thirdEyeProfiles();
    var seats = (currentBoard().seats || []).filter(function (s) {
      return s.apiKey;
    });
    var html = "";
    if (profiles.length) {
      html += '<optgroup label="' + escapeHtml(t("thirdEyeGroupProfiles")) + '">' +
        profiles.map(function (p) {
          return '<option value="profile:' + escapeHtml(p.id) + '">' + escapeHtml(p.name + " · " + thirdEyeModelOf(p)) + "</option>";
        }).join("") + "</optgroup>";
    }
    if (seats.length) {
      html += '<optgroup label="' + escapeHtml(t("thirdEyeGroupSeats")) + '">' +
        seats.map(function (s) {
          return '<option value="' + s.id + '">' + escapeHtml(s.name) + "</option>";
        }).join("") + "</optgroup>";
    }
    sel.innerHTML = html;
    var values = Array.prototype.map.call(sel.options, function (o) {
      return o.value;
    });
    var want = values.indexOf(prevValue) >= 0 ? prevValue : thirdEyeDefaultValue(profiles, values);
    if (want) sel.value = want;
    var disabled = !values.length;
    sel.disabled = disabled;
    btn.title = t("thirdEyeBtnTitle");
    var review = document.getElementById("talkReviewBtn");
    if (review) review.disabled = disabled;
    var send = document.getElementById("talkSendBtn");
    if (send) send.disabled = disabled;
  }

  // Vurderingen af bordet, startet fra samtalen med Tredje øje. Teksten skrives i bordets log, som før;
  // stemmen siger kun Tredje øjes egen korte orientering (<<SAY>>), og samtalen peger ind i teksten.
  function runThirdEyeReview() {
    var errorEl = document.getElementById("talkError") || document.getElementById("chatError");
    var sel = document.getElementById("thirdEyeSeatSelect");
    var btn = document.getElementById("talkReviewBtn");
    var seat = thirdEyeSeat();
    if (!seat || !seat.apiKey || btn.disabled) return;
    var transcript = buildTableTranscript();
    if (!transcript.trim()) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = t("thirdEyeNothingToEvaluate");
      }
      return;
    }
    if (errorEl) errorEl.hidden = true;

    var content =
      t("thirdEyeConversationHeader") + "\n\n" + transcript + "\n\n" + t("thirdEyeOpenNeedsHeader") + "\n" + openNeedsDigest() +
      "\n\n" + t("thirdEyeFindingsHeader") + "\n" + observationsDigest() +
      "\n\n" + t("thirdEyeChoicesHeader") + "\n" + window.RundbordNextSteps.choicesText(nextStepsContext()) +
      strategyContextSection();

    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("thirdEyeEvaluating");

    var log = document.getElementById("log");
    var emptyNote = log.querySelector(".log-empty");
    if (emptyNote) emptyNote.remove();
    var bubble = document.createElement("div");
    bubble.className = "msg msg-thirdeye msg-live";
    bubble.innerHTML =
      '<div class="msg-meta"><span class="msg-who">' + escapeHtml(t("thirdEyeLabel")) + "</span>" +
      '<span class="msg-llm">' + escapeHtml(t("thirdEyeEvaluatedByPrefix")) + " " + escapeHtml(seat.name) + " · " + escapeHtml(seat.provider) +
      " · " + escapeHtml(seat.model || "") + '</span>' +
      '<span class="msg-time live-dot">●</span></div>' +
      '<p class="msg-text"></p>';
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    var textEl = bubble.querySelector(".msg-text");

    // Valg-blokken (<<NEXT>> + JSON) er til appen, ikke til læseren: skjul den, mens svaret strømmer.
    streamReplyInto(seat, [{ role: "user", content: content }], t("thirdEyeInstruction"), textEl, function () {
      var cut = textEl.textContent.indexOf(window.RundbordNextSteps.MARKER);
      if (cut >= 0) textEl.textContent = textEl.textContent.slice(0, cut);
    })
      .then(function (res) {
        bubble.remove();
        renderThirdEyeSelect();
        btn.textContent = originalLabel;
        btn.disabled = false;
        recordCall(seat, res, "thirdEye", {});
        if (!res.ok) {
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = t("thirdEyeFailedPrefix") + res.message;
          }
          return null;
        }
        // Svaret er utroværdigt: valgene valideres mod bordets egne stole, roller og dials (lib/nextsteps.js).
        var parsedReply = window.RundbordNextSteps.parse(res.reply || "", nextStepsContext());
        var meta = { kind: "thirdEye", evaluatorSeatId: seat.id, evaluatorLabel: seat.provider + " · " + (seat.model || "") };
        if (parsedReply.options.length) meta.options = parsedReply.options;
        if (parsedReply.hadBlock) {
          emitEvent("nextstep.proposed", seat.id, {}, {
            count: parsedReply.options.length,
            dropped: parsedReply.dropped,
            types: parsedReply.options.map(function (o) {
              return o.type;
            }),
          });
        }
        return window.rundbord
          .addMessage(store.activeBoardId, "__system__", parsedReply.display || t("emptyReplyFallback"), "system", meta)
          .then(function (s2) {
            var added = (s2.boards[s2.activeBoardId].messages || []).slice(-1)[0];
            talkReviewDone(seat, added && added.id, parsedReply.options.length, parsedReply.display || "");
            return s2;
          });
      })
      .then(function (s) {
        if (!s) return;
        store = s;
        render();
      });
  }

  function parseNeedsSummary(text) {
    var m = NEEDS_SUMMARY_RE.exec(String(text || ""));
    if (!m) return null;
    // Et mærke (VURDERING:/FAKTA:) fjernes fra teksten og gemmes som needType (se lib/mandate.js)
    var tag = window.RundbordMandate.parseNeedTag(m[1]);
    return { need: tag.text, needType: tag.type, role: m[2].trim(), adjust: m[3].trim() };
  }

  // Viser en tydelig, ikke-blank placeholder når JUSTÉR-feltet er tomt —
  // ellers ville linjen bare se ud som om noget manglede at loade.
  function adjustDisplayText(adjust) {
    return adjust && adjust.trim() ? adjust : t("noAdjustGiven");
  }

  function normalizeDialLabel(s) {
    return String(s || "").replace(/^[^\p{L}]+/u, "").trim().toLowerCase();
  }

  // Tolker kun det strikte "<Dial>: <Tilstand>[, styrke <N>]"-format —
  // bevidst INGEN løs fritekst-gætning her. Et forslag der refererer til en
  // dial der ikke findes (fx ældre beskeder skrevet før dette format fandtes)
  // skal fejle stille, ikke risikere at anvende den forkerte justering.
  // "Til, styrke 6": værdien i en fundet justering, som brugeren læser den.
  function dialValueText(match) {
    var state = dialStateLabel(match.dial, match.state) || match.state;
    var hasStrength = match.dial.hasStrength && match.state !== "off" && match.strength;
    return hasStrength ? t("adjustValueStrength", { state: state, strength: match.strength }) : state;
  }

  // Stolen, en justering gælder: den, behovet peger på, ellers stolen, der skrev det (som kortet "Kræver din beslutning").
  function adjustTargetSeat(suggestedSeat, authorSeat) {
    return suggestedSeat || authorSeat || null;
  }

  // Kortets linje for en justering, der kan tolkes og har en stol. Siger tydeligt, hvad der er sket:
  //  - ikke sat: "Modellen foreslår …" med [Sæt …] [Lad mig rette] [Ikke nu]
  //  - står allerede sådan: "… står på …" med [OK] [Lad mig rette]
  //  - løst: det, der faktisk er tilfældet (står sådan nu, eller blev ikke ændret) og "✓ Løst"
  // Knapperne bruger klasserne fra loggen (prefix "msg-needs") eller fra Næste skridt (prefix "open-needs").
  function guidedAdjustHtml(match, seat, o) {
    var vars = { dial: dialLabel(match.dial), value: dialValueText(match), seat: seat.name };
    var set = needAdjustAlreadySet(seat, match);
    var p = o.prefix;
    var msg = ' data-msg-id="' + o.msgId + '"';
    var apply = set ? "" : ' <button type="button" class="' + p + '-apply-btn" data-seat-id="' + seat.id + '"' + msg + ' title="' + escapeHtml(t("adjustApplyTitle", vars)) + '">' + escapeHtml(t("adjustApplyBtn", vars)) + "</button>";
    var fix = ' <button type="button" class="' + p + '-open-btn" data-seat-id="' + seat.id + '" data-dial="' + escapeHtml(match.dial.key) + '" title="' + escapeHtml(t("adjustFixTitle", vars)) + '">' + escapeHtml(t("adjustFixBtn")) + "</button>";
    var later = ' <button type="button" class="' + o.resolveClass + '"' + msg + ' title="' + escapeHtml(t(set ? "adjustOkTitle" : "adjustLaterTitle")) + '">' + escapeHtml(t(set ? "adjustOkBtn" : "adjustLaterBtn")) + "</button>";
    if (o.resolved) {
      return '<span class="msg-needs-label">' + escapeHtml(t(set ? "adjustIsSet" : "adjustDeclined", vars)) + '</span> <span class="msg-needs-resolved-badge">' + escapeHtml(t("resolvedBadge")) + "</span>";
    }
    return '<span class="msg-needs-label">' + escapeHtml(t(set ? "adjustIsSet" : "adjustProposed", vars)) + "</span>" + (set ? later + fix : apply + fix + later);
  }

  function parseDialAdjustment(adjustText) {
    var text = String(adjustText || "").trim();
    if (!text) return null;
    // Ordet foran tallet er sprogafhængigt ("styrke"/"strength") — match det
    // generisk i stedet for at hardkode dansk, ligesom NEEDS_SUMMARY_RE.
    var m = /^([^:]+):\s*([^,]+?)\s*(?:,\s*\S+\s*(\d{1,2}))?\s*$/.exec(text);
    if (!m) return null;
    var wantLabel = normalizeDialLabel(m[1]);
    var dial = DIALS.filter(function (d) {
      return normalizeDialLabel(dialLabel(d)) === wantLabel;
    })[0];
    if (!dial) return null;
    var wantState = m[2].trim().toLowerCase();
    var stateKey = dial.states.filter(function (s) {
      return dialStateLabel(dial, s).toLowerCase() === wantState;
    })[0];
    if (!stateKey) return null;
    var strength = m[3] ? Math.max(1, Math.min(10, parseInt(m[3], 10))) : null;
    return { dial: dial, state: stateKey, strength: strength };
  }

  // Anvender et tolket dial-forslag direkte på den foreslåede stol — uden at
  // brugeren selv skal åbne stolens panel og finde den rigtige knap. Lægger
  // en synlig systembesked i loggen, så det er til at følge hvad der skete
  // og hvornår (progressionen), ikke kun at det skete.
  function applyDialSuggestion(seatId, match, sourceMsgId, source) {
    var seat = seatById(seatId);
    if (!seat || !match) return;
    seat.dials = seat.dials || defaultDials();
    var current = seat.dials[match.dial.key] || { state: match.dial.states[0], strength: 6, note: "" };
    var updated = { state: match.state, note: current.note || "" };
    var strength = match.dial.hasStrength ? match.strength || current.strength || 6 : null;
    if (match.dial.hasStrength) updated.strength = strength;
    seat.dials[match.dial.key] = updated;
    emitEvent("dial.applied", seat.id, {}, { dial: match.dial.key, state: match.state, strength: strength, source: source || "need" }, sourceMsgId);

    var stateLabel = dialStateLabel(match.dial, match.state) || match.state;
    var note =
      t("dialSetToNote", { seat: seat.name, dial: dialLabel(match.dial), state: stateLabel }) +
      (strength ? t("dialSetToStrengthSuffix", { strength: strength }) : "") + ".";

    window.rundbord
      .saveSeat(store.activeBoardId, seat, { source: source || "need" })
      .then(function (s) {
        store = s;
        return window.rundbord.addMessage(store.activeBoardId, "__system__", note, "system");
      })
      .then(function (s) {
        store = s;
        // Anvendelsen løser i sig selv behovet, der udløste den — uden dette
        // ville "Gør det for mig" udføre justeringen, men behovet ville
        // stadig stå som "åbent" i oversigten bagefter.
        if (sourceMsgId) return window.rundbord.setMessageMeta(store.activeBoardId, sourceMsgId, { needResolved: true });
        return s;
      })
      .then(function (s) {
        store = s;
        render();
      });
  }

  function markNeedResolved(msgId) {
    window.rundbord.setMessageMeta(store.activeBoardId, msgId, { needResolved: true }).then(function (s) {
      store = s;
      render();
    });
  }

  function jumpToMessage(msgId) {
    var el = document.querySelector('.msg[data-msg-id="' + msgId + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-flash");
    setTimeout(function () {
      el.classList.remove("msg-flash");
    }, 1600);
  }

  // ---- Tredje øje 2.0: regler på hændelseslogen (ingen modelkald) ----
  var observations = [];
  var observationEvents = {};
  var observationTimer = null;

