// 19-tablefile.js
// Bordfil: eksportér og importér bordets opsætning, og skriv et læsbart dokument om roller og kognitivt setup.

  var tableImportState = null;

  function tableFileCtx() {
    var dials = {};
    DIALS.forEach(function (d) {
      dials[d.key] = { states: d.states.slice(), hasStrength: Boolean(d.hasStrength) };
    });
    var providers = Array.prototype.map.call(document.querySelectorAll("#providerSelect option"), function (o) {
      return o.value;
    });
    return {
      dials: dials,
      providers: providers,
      colors: SWATCHES.slice(),
      mandates: MANDATE_ICONS.map(function (i) { return i.key; }),
      work: WORK_ICONS.map(function (i) { return i.key; }),
      info: INFO_ICONS.map(function (i) { return i.key; }),
    };
  }

  function tableStatus(text, isError) {
    var el = document.getElementById("tableStatus");
    el.textContent = text || "";
    el.className = "note" + (isError ? " error-text" : "");
  }

  function safeFileBase(name) {
    return String(name || "bord").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 60) || "bord";
  }

  function openTablePanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    tableImportState = null;
    tableStatus("");
    renderTableTemplates();
    renderTableImport();
    document.getElementById("tablePanel").hidden = false;
  }

  // ---- Skabeloner: færdige borde, vist i samme forhåndsvisning som en importeret fil ----
  function renderTableTemplates() {
    var wrap = document.getElementById("tableTemplates");
    wrap.innerHTML = "";
    window.RundbordTemplates.list(store.locale === "da" ? "da" : "en").forEach(function (tpl) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      var name = document.createElement("span");
      name.className = "tpl-name";
      name.textContent = tpl.name;
      var tag = document.createElement("span");
      tag.className = "tpl-tag tpl-" + tpl.involvement;
      tag.textContent = t("tplInvolvement_" + tpl.involvement);
      btn.appendChild(name);
      btn.appendChild(tag);
      btn.title = tpl.desc + " (" + t("tplInvolvement_" + tpl.involvement) + ")";
      btn.addEventListener("click", function () {
        startTemplate(tpl.key);
      });
      wrap.appendChild(btn);
    });
  }

  function startTemplate(key) {
    var file = window.RundbordTemplates.get(key, store.locale === "da" ? "da" : "en");
    var parsed = file && window.RundbordTableFile.parse(JSON.stringify(file), tableFileCtx());
    if (!parsed || !parsed.ok) {
      tableStatus(t("tableImportError_notTableFile"), true);
      return;
    }
    tableStatus("");
    tableImportState = { setup: parsed.setup, warnings: parsed.warnings, fileName: key };
    renderTableImport();
  }

  function exportTableFile() {
    var b = currentBoard();
    var file = window.RundbordTableFile.build(b, { now: new Date().toISOString(), app: appInfo ? appInfo.version : "" });
    window.rundbord.saveTextFile(safeFileBase(b.projectName) + ".bord.json", JSON.stringify(file, null, 2), "json").then(function (res) {
      if (res && res.ok) {
        emitEvent("table.exported", null, {}, { seats: file.seats.length });
        tableStatus(t("tableExported", { path: res.path }));
      } else if (!(res && res.canceled)) {
        tableStatus((res && res.message) || t("unknownError"), true);
      }
    });
  }

  // ---- Import: filen er upålidelig, så du ser alt, hvad den vil oprette, før noget sker ----
  function importTableFile() {
    window.rundbord.openTextFile("json").then(function (res) {
      if (!res || !res.ok) {
        if (res && !res.canceled) tableStatus((res && res.message) || t("unknownError"), true);
        return;
      }
      var parsed = window.RundbordTableFile.parse(res.text, tableFileCtx());
      if (!parsed.ok) {
        tableImportState = null;
        renderTableImport();
        tableStatus(t("tableImportError_" + parsed.error), true);
        return;
      }
      tableStatus("");
      tableImportState = { setup: parsed.setup, warnings: parsed.warnings, fileName: res.name };
      renderTableImport();
    });
  }

  function tableWarningText(w) {
    return t("tableWarn_" + w.code, { role: w.role || "", provider: w.provider || "", key: w.key || "", count: w.count || 0, index: w.index || 0 });
  }

  function renderTableImport() {
    var wrap = document.getElementById("tableImportPreview");
    if (!tableImportState) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    var setup = tableImportState.setup;
    wrap.hidden = false;
    wrap.innerHTML =
      '<h3 class="eyebrow">' + escapeHtml(t("tableImportPreviewTitle", { name: setup.name })) + "</h3>" +
      '<p class="note">' + escapeHtml(t("tableImportNote")) + "</p>" +
      (setup.ownTakeFirst ? '<p class="note">' + escapeHtml(t("tableImportOwnTake")) + "</p>" : "") +
      (setup.rounds ? '<p class="note">' + escapeHtml(t("tableImportRounds", { max: setup.rounds.max, auto: t(setup.rounds.auto ? "roundsAutoOn" : "roundsAutoOff") })) + "</p>" : "") +
      (tableImportState.warnings.length
        ? '<ul class="dataflow-list">' + tableImportState.warnings.map(function (w) { return "<li>" + escapeHtml(tableWarningText(w)) + "</li>"; }).join("") + "</ul>"
        : "") +
      setup.seats
        .map(function (s) {
          return (
            '<div class="history-entry"><strong>' + escapeHtml(s.role) + "</strong> · " + escapeHtml(s.provider) + (s.model ? " · " + escapeHtml(s.model) : "") +
            (s.checks ? " · " + escapeHtml(t("tableImportChecks")) : "") + (s.readsIn ? " · " + escapeHtml(t("tableImportReadsIn")) : "") +
            (s.additions.length
              ? '<p class="shield-hint">' + escapeHtml(t("tableImportAdditions")) + "</p><ul>" +
                s.additions.map(function (a) { return "<li>“" + escapeHtml(a) + "”</li>"; }).join("") + "</ul>"
              : "") +
            "</div>"
          );
        })
        .join("") +
      '<label class="shield-row"><input type="checkbox" id="tableReuseKeys"> <span>' + escapeHtml(t("tableImportReuseKeys")) + "</span></label>" +
      '<div class="row"><button type="button" class="btn btn-primary" id="tableImportConfirmBtn">' + escapeHtml(t("tableImportCreate")) +
      '</button><button type="button" class="btn" id="tableImportCancelBtn">' + escapeHtml(t("cancel")) + "</button></div>";
    document.getElementById("tableImportConfirmBtn").addEventListener("click", confirmTableImport);
    document.getElementById("tableImportCancelBtn").addEventListener("click", function () {
      tableImportState = null;
      renderTableImport();
    });
  }

  // Opretter et nyt bord ud fra en indlæst opsætning (bordfil eller skabelon). Bruges også af velkomsten.
  // opts: { keys: { udbyder: nøgle } (genbrug til faste udbydere), provider + apiKey + models[] (tving alle stole til én udbyder, med en model pr. stol) }
  // → Promise<{ boardId, reused }>
  function createBoardFromSetup(setup, opts) {
    opts = opts || {};
    var keys = opts.keys || {};
    var reused = 0;
    var defaults = defaultDials();
    var boardId;
    return window.rundbord
      .createBoard(setup.name)
      .then(function (s) {
        store = s;
        boardId = store.activeBoardId;
        var patch = { handoffMode: setup.handoffMode };
        if (setup.maxRunCostUsd) patch.maxRunCostUsd = setup.maxRunCostUsd;
        if (setup.rounds) patch.rounds = setup.rounds;
        if (setup.ownTakeFirst) patch.ownTakeFirst = true;
        return window.rundbord.updateBoard(boardId, patch);
      })
      .then(function (s) {
        store = s;
        return setup.seats.reduce(function (chain, seat, idx) {
          return chain.then(function () {
            var dials = JSON.parse(JSON.stringify(defaults));
            Object.keys(seat.dials).forEach(function (k) {
              dials[k] = Object.assign({}, dials[k], seat.dials[k]);
            });
            var provider = opts.provider || seat.provider;
            var key = opts.provider ? opts.apiKey || "" : keys[seat.provider] || "";
            var model = opts.provider ? (opts.models && opts.models[idx]) || "" : seat.model || DEFAULT_MODEL[seat.provider] || "";
            if (key && !opts.provider) reused += 1;
            // Nøglen ligger kun i en Modelprofil API: en med samme udbyder og nøgle genbruges, ellers laves en. Stolen peger på den.
            return ensureModelProfile({ provider: provider, baseUrl: "", apiKey: key }).then(function (modelId) {
              var draft = {
                id: uid(),
                name: seat.role,
                provider: provider,
                model: model,
                baseUrl: "",
                apiKey: key,
                hasKey: Boolean(key),
                color: seat.color,
                calls: [],
                icons: seat.icons,
                dials: dials,
                customInstruction: seat.additions.join("\n"),
                checks: seat.checks,
                readsIn: seat.readsIn,
              };
              if (modelId) draft.modelId = modelId;
              // Begrebet (hvad stolen er) følger med fra en nyere bordfil eller backup; en ældre fil lader stolen hedde sit begreb, som før.
              if (typeof seat.concept === "string") draft.role = seat.concept;
              return window.rundbord.saveSeat(boardId, draft).then(function (s2) {
                store = s2;
              });
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        return { boardId: boardId, reused: reused };
      });
  }

  function confirmTableImport() {
    if (!tableImportState) return;
    var setup = tableImportState.setup;
    // Nøgler genbruges kun til faste udbydere, aldrig til "Andet" (en adresse kan ikke komme fra en fil).
    var keys = {};
    if (document.getElementById("tableReuseKeys").checked) {
      (currentBoard().seats || []).forEach(function (s) {
        if (s.apiKey && s.provider !== "custom" && !keys[s.provider]) keys[s.provider] = s.apiKey;
      });
    }
    createBoardFromSetup(setup, { keys: keys })
      .then(function (res) {
        emitEvent("table.imported", null, {}, { seats: setup.seats.length, warnings: tableImportState.warnings.length, keysReused: res.reused });
        var name = setup.name;
        tableImportState = null;
        document.getElementById("tablePanel").hidden = true;
        render();
        return nextStepNote(t("tableImportDone", { name: name, count: setup.seats.length - res.reused }));
      })
      .then(render);
  }

  // ---- Læsbart dokument om roller og kognitivt setup (lægges i OUT) ----
  function buildTableDocument() {
    var b = currentBoard();
    var out = [];
    out.push("# " + t("docTitle", { project: b.projectName }));
    out.push("");
    out.push(t("docIntro", { date: new Date().toLocaleDateString(dateLocaleCode()), version: appInfo ? appInfo.version : "" }));
    out.push("");
    out.push("## " + t("docBoard"));
    out.push("- " + t("docHandoff", { mode: t(b.handoffMode === "structured" ? "handoffModeStructured" : "handoffModeFull") }));
    out.push("- " + t("docCost", { limit: b.maxRunCostUsd ? usdText(b.maxRunCostUsd) : t("docNone") }));
    out.push("- " + t("docShield", { state: t(shieldOn() ? "histOn" : "histOff") }));
    out.push("");
    out.push("## " + t("docSeats"));
    (b.seats || []).forEach(function (seat, i) {
      out.push("");
      out.push("### " + (i + 1) + ". " + seat.name);
      out.push("- " + t("docModel", { model: seat.provider + (seat.model ? " · " + seat.model : "") }));
      var mandate = MANDATE_ICONS.filter(function (m) { return m.key === ((seat.icons || {}).mandate || "kan"); })[0];
      if (mandate) out.push("- " + t("docMandate", { mandate: iconTitle(mandate) }));
      var on = [];
      WORK_ICONS.concat(INFO_ICONS).forEach(function (ic) {
        var g = WORK_ICONS.indexOf(ic) >= 0 ? "work" : "info";
        if (seat.icons && seat.icons[g] && seat.icons[g][ic.key]) on.push(iconTitle(ic));
      });
      if (on.length) out.push("- " + t("docIcons", { icons: on.join(", ") }));
      if (seat.checks) out.push("- " + t("docChecks"));
      if (seat.readsIn) out.push("- " + t("docReadsIn"));
      var dialLines = [];
      DIALS.forEach(function (d) {
        var cur = (seat.dials || {})[d.key] || {};
        var text = d.describe(cur.state, cur.strength);
        if (text) dialLines.push("  - " + dialLabel(d) + ": " + historyDialState(d, { state: cur.state, strength: cur.strength }) + " — " + text);
      });
      if (dialLines.length) {
        out.push("- " + t("docDials"));
        dialLines.forEach(function (l) { out.push(l); });
      }
      var adds = String(seat.customInstruction || "").split("\n").filter(function (l) { return l.trim(); });
      if (adds.length) {
        out.push("- " + t("docAdditions"));
        adds.forEach(function (a) { out.push("  - " + a.trim()); });
      }
      var hist = (seat.history || []).slice(-5).reverse();
      if (hist.length) {
        out.push("- " + t("docHistory"));
        hist.forEach(function (h) {
          out.push("  - " + new Date(h.at).toLocaleDateString(dateLocaleCode()) + " (" + t("histSource_" + h.source) + "): " + h.changes.map(historyChangeText).join("; "));
        });
      }
      out.push("");
      out.push("<details><summary>" + t("docFullInstruction") + "</summary>");
      out.push("");
      out.push("```");
      out.push(compileInstruction(seat));
      out.push("```");
      out.push("");
      out.push("</details>");
    });
    out.push("");
    return out.join("\n");
  }

  // Hele samtalen som én Markdown-fil: opsætning (med stolenes fulde instruktioner), samtalen med tidspunkter, hændelser og et udkast til
  // situationsloggen over dine egne indgreb. Se lib/convoexport.js. Filen indeholder aldrig nøgler.
  function exportConversation() {
    var b = currentBoard();
    var status = document.getElementById("exportConvoStatus");
    var md = window.RundbordConvoExport.build({
      board: b,
      appInfo: appInfo,
      locale: store.locale === "da" ? "da" : "en",
      now: new Date().toISOString(),
      setupText: buildTableDocument(),
    });
    window.rundbord.saveTextFile(safeFileBase(b.projectName) + ".samtale.md", md, "md").then(function (res) {
      if (res && res.ok) {
        emitEvent("conversation.exported", null, {}, { messages: (b.messages || []).length, chars: md.length });
        status.className = "note";
        status.textContent = t("exportConvoDone", { path: res.path });
      } else if (!(res && res.canceled)) {
        status.className = "note error-text";
        status.textContent = (res && res.message) || t("unknownError");
      }
    });
  }

  function writeTableDocument() {
    var b = currentBoard();
    var name = t("docFileName", { project: safeFileBase(b.projectName) });
    window.rundbord.filesWriteOut(store.activeBoardId, name, buildTableDocument(), { via: "bordfil" }).then(function (res) {
      if (res && res.ok) {
        emitEvent("table.documented", null, {}, { seats: (b.seats || []).length });
        tableStatus(t("tableDocSaved", { name: res.name }));
        refreshIo();
      } else {
        tableStatus((res && res.message) || t("unknownError"), true);
      }
    });
  }
