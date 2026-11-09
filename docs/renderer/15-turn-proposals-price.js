// 15-turn-proposals-price.js
// Hvem har turen, forslag til instruktioner, pristabellen.

  function openTurnPanel() {
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("seatPanel").hidden = true;
    document.getElementById("pricePanel").hidden = true;
    document.getElementById("proposalsPanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = true;
    document.getElementById("startConfirmPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    var board = currentBoard();
    var turn = board.turn || { seatId: null };
    var seat = turn.seatId ? seatById(turn.seatId) : null;
    var detail = document.getElementById("turnDetail");
    if (seat) {
      var when = "";
      try {
        when = turn.at ? new Date(turn.at).toLocaleString(dateLocaleCode()) : "";
      } catch (e) {}
      detail.textContent =
        seat.name + t("turnGotItSuffix") + (when ? " " + when : "") + "." +
        (turn.reason ? t("turnReasonSuffix", { reason: turn.reason }) : t("turnNoReasonGiven"));
    } else {
      detail.textContent = t("turnNoOneHasTurn");
    }
    var select = document.getElementById("turnSeatSelect");
    select.innerHTML = "";
    board.seats.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      opt.selected = s.id === turn.seatId;
      select.appendChild(opt);
    });
    document.getElementById("turnReasonInput").value = "";
    document.getElementById("turnPanel").hidden = false;
  }
  function closeTurnPanel() {
    document.getElementById("turnPanel").hidden = true;
  }

  function giveTurn() {
    var seatId = document.getElementById("turnSeatSelect").value;
    var reason = document.getElementById("turnReasonInput").value.trim() || t("turnManualReason");
    if (!seatId) return;
    window.rundbord.setTurn(store.activeBoardId, seatId, reason).then(function (s) {
      store = s;
      render();
      closeTurnPanel();
    });
  }

  function clearTurn() {
    window.rundbord.setTurn(store.activeBoardId, null, "").then(function (s) {
      store = s;
      render();
      closeTurnPanel();
    });
  }

  // --- Forslag til instruktioner ---

  function renderProposalsBadge() {
    var badge = document.getElementById("proposalBadge");
    var count = (currentBoard().proposals || []).length;
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }

  function openProposalsPanel() {
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("seatPanel").hidden = true;
    document.getElementById("turnPanel").hidden = true;
    document.getElementById("pricePanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = true;
    document.getElementById("startConfirmPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    renderProposalsList();
    document.getElementById("proposalsPanel").hidden = false;
  }
  function closeProposalsPanel() {
    document.getElementById("proposalsPanel").hidden = true;
  }

  // "Formulér som instruktion for mig": ét kort modelkald, kun efter klik. Teksten går til den stol, der skal have instruktionen, og kommer tilbage i feltet, hvor du kan rette den, før noget gemmes.
  function bindProposalRewrite(item, p, textarea) {
    var btn = item.querySelector(".rewrite-btn");
    var costEl = item.querySelector(".rewrite-cost");
    var status = item.querySelector(".rewrite-status");
    var select = item.querySelector(".proposal-target");
    function target() {
      return seatById(select.value);
    }
    function showCost() {
      var seat = target();
      var ready = Boolean(seat && seat.apiKey);
      costEl.textContent = ready ? t("proposalRewriteCost", { seat: seat.name, model: seat.model || seat.provider }) : t("proposalRewriteNoKey");
      btn.disabled = !ready;
    }
    select.addEventListener("change", showCost);
    showCost();
    btn.addEventListener("click", function () {
      var seat = target();
      var text = textarea.value.trim();
      if (!seat || !seat.apiKey || !text || btn.dataset.busy) return;
      btn.dataset.busy = "1";
      btn.disabled = true;
      status.textContent = t("proposalRewriteRunning");
      var sink = document.createElement("p");
      streamReplyInto(seat, [{ role: "user", content: text }], t("proposalRewriteInstruction"), sink, function () {}).then(function (res) {
        delete btn.dataset.busy;
        recordCall(seat, res, "proposal-rewrite", {});
        showCost();
        var out = res && res.ok ? window.RundbordProposalText.parseRewrite(res.reply || "") : "";
        emitEvent("proposal.rewritten", seat.id, runCtx, { ok: Boolean(out) });
        if (!out) {
          status.textContent = t("proposalRewriteFailed") + (res && res.message ? " " + res.message : "");
          return;
        }
        textarea.value = out;
        status.textContent = t("proposalRewriteDone");
      });
    });
  }

  function renderProposalsList() {
    var wrap = document.getElementById("proposalsList");
    var proposals = currentBoard().proposals || [];
    if (!proposals.length) {
      wrap.innerHTML = '<p class="proposals-empty">' + escapeHtml(t("proposalsEmpty")) + "</p>";
      return;
    }
    wrap.innerHTML = "";
    proposals.forEach(function (p) {
      var seat = seatById(p.seatId);
      var item = document.createElement("div");
      item.className = "proposal-item";
      var time = "";
      try {
        time = new Date(p.createdAt).toLocaleString(dateLocaleCode());
      } catch (e) {}
      var seats = currentBoard().seats || [];
      var recommendedId = window.RundbordProposalText.recommendedSeat(p.recommendedSeatId, p.seatId, seats.map(function (x) { return x.id; }));
      item.innerHTML =
        '<p class="meta">' + escapeHtml(t("proposalFromPrefix")) + escapeHtml(seat ? seat.name : t("proposalUnknownSeat")) + " · " + time + "</p>" +
        '<p class="note proposal-hint">' + escapeHtml(t(p.draftSource === "selection" ? "proposalHintSelection" : "proposalHintDraft")) + "</p>" +
        '<textarea rows="4"></textarea>' +
        '<div class="row proposal-rewrite-row"><button type="button" class="btn rewrite-btn">' + escapeHtml(t("proposalRewriteBtn")) + '</button>' +
        '<span class="note rewrite-cost"></span></div><p class="note rewrite-status" role="status"></p>' +
        '<label class="proposal-target-label">' + escapeHtml(t("proposalTargetLabel")) + ' <select class="proposal-target">' +
        window.RundbordProposalText.orderSeats(seats, recommendedId).map(function (s) {
          return '<option value="' + escapeHtml(s.id) + '"' + (s.id === recommendedId ? " selected" : "") + ">" + escapeHtml(s.name) + (s.id === recommendedId ? " " + escapeHtml(t("proposalRecommended")) : "") + "</option>";
        }).join("") + "</select></label>" +
        '<div class="row">' +
        '<button type="button" class="btn btn-primary approve-btn">' + escapeHtml(t("approveBtn")) + "</button>" +
        '<button type="button" class="btn dismiss-btn">' + escapeHtml(t("dismissBtn")) + "</button>" +
        "</div>";
      var textarea = item.querySelector("textarea");
      textarea.value = p.text;
      bindProposalRewrite(item, p, textarea);
      item.querySelector(".approve-btn").addEventListener("click", function () {
        window.rundbord.approveProposal(store.activeBoardId, p.id, textarea.value, item.querySelector(".proposal-target").value).then(function (s) {
          store = s;
          renderProposalsBadge();
          renderProposalsList();
        });
      });
      item.querySelector(".dismiss-btn").addEventListener("click", function () {
        window.rundbord.dismissProposal(store.activeBoardId, p.id).then(function (s) {
          store = s;
          renderProposalsBadge();
          renderProposalsList();
        });
      });
      wrap.appendChild(item);
    });
  }

  // --- Pristabel ---

  function openPricePanel() {
    document.getElementById("settingsPanel").hidden = true;
    document.getElementById("seatPanel").hidden = true;
    document.getElementById("turnPanel").hidden = true;
    document.getElementById("proposalsPanel").hidden = true;
    document.getElementById("addSeatPanel").hidden = true;
    document.getElementById("startConfirmPanel").hidden = true;
    document.getElementById("projectMenu").hidden = true;
    document.getElementById("metricsPanel").hidden = true;
    document.getElementById("ioPanel").hidden = true;
    document.getElementById("memoryPanel").hidden = true;
    document.getElementById("voicePanel").hidden = true;
    document.getElementById("shieldPanel").hidden = true;
    document.getElementById("tablePanel").hidden = true;
    document.getElementById("priceStatus").textContent = "";
    renderPriceList();
    document.getElementById("pricePanel").hidden = false;
  }
  function closePricePanel() {
    document.getElementById("pricePanel").hidden = true;
  }

  function renderPriceList() {
    var wrap = document.getElementById("priceList");
    if (!wrap) return;
    var ids = Object.keys(store.priceTable || {}).sort();
    if (!ids.length) {
      wrap.innerHTML = '<p class="price-empty">' + escapeHtml(t("priceEmpty")) + "</p>";
      return;
    }
    wrap.innerHTML = "";
    ids.forEach(function (id) {
      var entry = store.priceTable[id];
      var row = document.createElement("div");
      row.className = "price-item";
      row.innerHTML =
        '<span class="model">' + escapeHtml(id) + "</span>" +
        '<span class="nums">$' + entry.priceInPerM + " / $" + entry.priceOutPerM + " per 1M</span>" +
        '<span class="src">' + escapeHtml(entry.source) + "</span>" +
        '<button type="button" aria-label="' + escapeHtml(t("deletePriceAriaLabel", { model: id })) + '">&times;</button>';
      row.querySelector("button").addEventListener("click", function () {
        window.rundbord.deletePrice(id).then(function (prices) {
          store.priceTable = prices;
          renderPriceList();
          renderBoardSpend();
        });
      });
      wrap.appendChild(row);
    });
  }

  function addPrice() {
    var modelId = document.getElementById("priceModelInput").value.trim();
    var priceIn = document.getElementById("priceInNewInput").value.trim();
    var priceOut = document.getElementById("priceOutNewInput").value.trim();
    var statusEl = document.getElementById("priceStatus");
    if (!modelId || !priceIn || !priceOut) {
      statusEl.textContent = t("priceFillAllFields");
      return;
    }
    window.rundbord.setPrice(modelId, priceIn, priceOut).then(function (prices) {
      store.priceTable = prices;
      document.getElementById("priceModelInput").value = "";
      document.getElementById("priceInNewInput").value = "";
      document.getElementById("priceOutNewInput").value = "";
      statusEl.textContent = t("priceSavedFor", { model: modelId });
      renderPriceList();
      renderBoardSpend();
    });
  }

  function autoFetchPrices() {
    var statusEl = document.getElementById("priceStatus");
    statusEl.textContent = t("priceFetching");
    window.rundbord.fetchAutoPrices().then(function (res) {
      if (!res.ok) {
        statusEl.textContent = t("priceFetchFailedPrefix") + res.message;
        return;
      }
      store.priceTable = res.priceTable;
      statusEl.textContent = t("priceFetchResult", { updated: res.updated, checked: res.checked, total: res.total });
      renderPriceList();
      renderBoardSpend();
    }).catch(function (err) {
      statusEl.textContent = t("unexpectedErrorPrefix") + String((err && err.message) || err);
    });
  }

  function recomputePending() {
    var statusEl = document.getElementById("priceStatus");
    statusEl.textContent = t("priceRecomputing");
    window.rundbord.recomputePending().then(function (res) {
      store = res.store;
      statusEl.textContent = t("priceRecomputedResult", { count: res.recomputed });
      render();
    });
  }

