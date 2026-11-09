// 33-edge-settings.js
// Indstillinger pr. pil (lib/edges.js): en pause før næste stol og hvordan overdragelsen bygges. De sidder i pilens panel og gælder fra næste overdragelse.
// Pausen lægges oveni stolens mandat og gælder i fast rækkefølge (ved dynamisk valg vælger du selv næste stol). Hændelsen edge.configured har kun valget.

  function edgeConfig(fromId, toId) {
    return window.RundbordEdges.get(currentBoard().edges, fromId, toId);
  }

  function edgePauseOn(e) {
    return edgeConfig(e.from, e.to).pause;
  }

  // Sektionen "Denne pil" i pilens panel.
  function edgeSettingsSectionHtml(spec) {
    var from = seatById(spec.fromId);
    var to = seatById(spec.toId);
    if (!from || !to) return "";
    var c = edgeConfig(spec.fromId, spec.toId);
    var opts = ["default", "full", "structured", "anchor"]
      .map(function (v) {
        return '<option value="' + v + '"' + (c.handoff === v ? " selected" : "") + ">" + escapeHtml(t("edgeHandoff_" + v)) + "</option>";
      })
      .join("");
    return (
      '<h3 class="ho-h">' + escapeHtml(t("edgeSettingsHeading")) + '</h3><div class="ho-q">' +
      '<label class="check-row"><input type="checkbox" id="edgePauseCheck"' + (c.pause ? " checked" : "") + "> <span>" + escapeHtml(t("edgePauseLabel", { next: to.name })) + "</span></label>" +
      '<p class="note">' + escapeHtml(t("edgePauseHint")) + "</p>" +
      '<label for="edgeHandoffSelect">' + escapeHtml(t("edgeHandoffLabel")) + '</label><select id="edgeHandoffSelect">' + opts + "</select>" +
      '<p class="note">' + escapeHtml(t(to.checks ? "edgeHandoffCheckerNote" : "edgeHandoffHint")) + "</p></div>"
    );
  }

  function bindEdgeSettings(spec) {
    var pause = document.getElementById("edgePauseCheck");
    var sel = document.getElementById("edgeHandoffSelect");
    if (!pause || !sel) return;
    function save() {
      var next = window.RundbordEdges.set(currentBoard().edges, spec.fromId, spec.toId, { pause: pause.checked, handoff: sel.value });
      window.rundbord.updateBoard(store.activeBoardId, { edges: next }).then(function (s) {
        store = s;
        emitEvent("edge.configured", spec.toId, {}, { pause: pause.checked, handoff: sel.value });
        render();
        openHandoffPanel(spec);
      });
    }
    pause.addEventListener("change", save);
    sel.addEventListener("change", save);
  }
