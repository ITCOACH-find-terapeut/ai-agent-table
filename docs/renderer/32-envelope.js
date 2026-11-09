// 32-envelope.js
// Kuverten: bordets indstilling envelopePreview. Før næste stol kaldes, vises præcis den tekst, den får (opgaven, forrige svar, beslutningsregistret og
// dine noter), og du kan rette den, før den sendes. Det gælder en kørsel og en manuel videresendelse. Den rettede tekst er den, der sendes og gemmes i
// samtalen. Hændelserne har kun antal tegn og om du rettede, aldrig teksten.

  var envelopePending = null; // { fromId, toId } mens kuverten venter på dig (pilen markeres)
  var pendingEnvelope = null; // afgørelsen: function (action)
  var envelopeOriginal = null; // den oprindelige tekst, så den kan gendannes

  function envelopeOn() {
    return currentBoard() && currentBoard().envelopePreview === true;
  }

  // o: { fromSeat, toSeat, text, ctx, inRun } → løfte med { action: "send", text, edited } eller { action: "stop" }
  function askEnvelope(o) {
    var original = String(o.text || "");
    var field = document.getElementById("envelopeText");
    document.getElementById("envelopeTitle").textContent = t("envelopeTitle", { from: o.fromSeat ? o.fromSeat.name : "?", to: o.toSeat.name });
    document.getElementById("envelopeNote").textContent = t("envelopeNote", { to: o.toSeat.name });
    envelopeOriginal = original;
    field.value = original;
    var stopBtn = document.getElementById("envelopeStopBtn");
    stopBtn.textContent = t(o.inRun ? "envelopeStopRunBtn" : "envelopeCancelBtn");
    function refresh() {
      document.getElementById("envelopeCount").textContent = t("envelopeCount", { n: field.value.length, orig: original.length }) + (field.value !== original ? " · " + t("envelopeEdited") : "");
      document.getElementById("envelopeResetBtn").disabled = field.value === original;
    }
    field.oninput = refresh;
    refresh();
    envelopePending = { fromId: o.fromSeat ? o.fromSeat.id : null, toId: o.toSeat.id };
    var panel = document.getElementById("envelopePanel");
    panel.hidden = false;
    if (o.inRun) updateRunUI(t("envelopeWaiting", { seat: o.toSeat.name }));
    renderSeats();
    emitEvent("envelope.opened", o.toSeat.id, o.ctx || runCtx, { chars: original.length, inRun: Boolean(o.inRun) });
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
    return new Promise(function (resolve) {
      pendingEnvelope = function (action) {
        pendingEnvelope = null;
        envelopePending = null;
        var text = field.value;
        var edited = text !== original;
        panel.hidden = true;
        field.oninput = null;
        if (action === "stop") {
          emitEvent("envelope.cancelled", o.toSeat.id, o.ctx || runCtx, { chars: original.length });
          renderSeats();
          return resolve({ action: "stop" });
        }
        emitEvent("envelope.sent", o.toSeat.id, o.ctx || runCtx, { charsBefore: original.length, charsAfter: text.length, edited: edited });
        if (edited) emitEvent("envelope.edited", o.toSeat.id, o.ctx || runCtx, { charsBefore: original.length, charsAfter: text.length });
        renderSeats();
        resolve({ action: "send", text: text, edited: edited });
      };
    });
  }

  function bindEnvelope() {
    document.getElementById("envelopeSendBtn").addEventListener("click", function () {
      if (pendingEnvelope) pendingEnvelope("send");
    });
    document.getElementById("envelopeStopBtn").addEventListener("click", function () {
      if (pendingEnvelope) pendingEnvelope("stop");
    });
    document.getElementById("envelopeResetBtn").addEventListener("click", function () {
      var field = document.getElementById("envelopeText");
      if (envelopeOriginal != null) field.value = envelopeOriginal;
      field.dispatchEvent(new Event("input"));
    });
  }

  // Pilens mærke og panel, mens kuverten venter.
  function edgeHasEnvelope(e) {
    return Boolean(envelopePending && envelopePending.fromId === e.from && envelopePending.toId === e.to);
  }

  function envelopePendingSectionHtml(spec) {
    if (!envelopePending || envelopePending.fromId !== spec.fromId || envelopePending.toId !== spec.toId) return "";
    return '<h3 class="ho-h">' + escapeHtml(t("envelopeHeading")) + '</h3><p class="note">' + escapeHtml(t("envelopePaused")) +
      '</p><div class="row"><button type="button" class="btn primary" id="envelopeGoBtn">' + escapeHtml(t("envelopeGo")) + "</button></div>";
  }

  function bindEnvelopeGo() {
    var go = document.getElementById("envelopeGoBtn");
    if (!go) return;
    go.addEventListener("click", function () {
      document.getElementById("handoffPanel").hidden = true;
      var panel = document.getElementById("envelopePanel");
      if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
