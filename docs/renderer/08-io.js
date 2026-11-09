// 08-io.js
// ↑IN / ↓OUT: bånd, panel, drop-zone, og at skrive et svar til OUT.

  function ioCountText(n) {
    return n === 1 ? t("ioFileOne") : t("ioFileMany", { count: n });
  }

  function renderIoBand() {
    var readers = currentBoard().seats.filter(function (s) {
      return s.readsIn;
    }).length;
    var v = window.RundbordViewState.ioView(ioState, readers);
    document.getElementById("ioInCount").textContent = ioCountText(v.in.count);
    document.getElementById("ioOutCount").textContent = ioCountText(v.out.count);
    var inNote = document.getElementById("ioInNote");
    var inTile = document.getElementById("ioInTile");
    inNote.textContent = v.in.state === "empty" ? t("ioInEmpty") : v.in.state === "unread" ? t("ioInNoReader") : v.in.readers === 1 ? t("ioInReadByOne") : t("ioInReadBy", { count: v.in.readers });
    inTile.setAttribute("data-state", v.in.state);
    document.getElementById("ioOutNote").textContent = v.out.latest ? t("ioOutLatest", { name: v.out.latest.name }) : t("ioOutNone");
    document.getElementById("ioOutTile").setAttribute("data-state", v.out.count ? "has" : "empty");
    renderPlaque();
  }

  function ioSizeText(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + " MB"
      : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function ioListHtml(files, showReadable) {
    if (!files.length) return '<p class="note">' + escapeHtml(t("ioEmpty")) + "</p>";
    return files
      .map(function (f) {
        var unreadable = showReadable && !f.readable && !f.image;
        var badge = showReadable && f.image ? '<span class="io-file-badge">' + escapeHtml(t("ioImageBadge")) + "</span>" : "";
        return (
          '<div class="io-file' + (unreadable ? " unreadable" : "") + '"' +
          (unreadable ? ' title="' + escapeHtml(t("ioUnreadable")) + '"' : "") +
          (f.image ? ' title="' + escapeHtml(t("ioImageHint")) + '"' : "") +
          '><span class="io-file-name">' + escapeHtml(f.name) + "</span>" + badge +
          '<span class="io-file-meta">' + escapeHtml(ioSizeText(f.size)) + "</span></div>"
        );
      })
      .join("");
  }

  function ioReadersText() {
    var readers = currentBoard().seats.filter(function (s) {
      return s.readsIn;
    });
    if (!readers.length) return t("ioReadersNone");
    var readable = ioState.in.filter(function (f) {
      return f.readable;
    });
    var images = ioState.in.filter(function (f) {
      return f.image;
    });
    var chars = readable.reduce(function (sum, f) {
      return sum + Math.min(f.size, 60 * 1024);
    }, 0);
    var line = t("ioReadersSome", {
      count: readers.length,
      readable: readable.length,
      tokens: window.RundbordIO.estimateTokens(Math.min(chars, 150 * 1024)),
    });
    if (images.length) {
      var vision = readers.filter(function (s) {
        return IMAGE_CAPABLE_PROVIDERS[s.provider];
      });
      line += " · " + (vision.length
        ? t("ioImagesReadersSome", { images: images.length, seats: vision.length })
        : t("ioImagesNoVisionSeat", { images: images.length }));
    }
    return line;
  }

  // Billeder i IN, klar til at sendes med — kun til en stol med en udbyder der kan se dem
  // (se IMAGE_CAPABLE_PROVIDERS). Andre stole får kun tekstmaterialet, som hidtil.
  function buildInImages(seat, ctx) {
    // Billeder kan ikke beskyttes af tekstreglerne, så de sendes ikke, mens Beskyttelse er slået til.
    if (shieldOn() || !seat.readsIn || !IMAGE_CAPABLE_PROVIDERS[seat.provider]) return Promise.resolve([]);
    return window.rundbord
      .filesListImages(store.activeBoardId)
      .then(function (res) {
        var images = (res && res.images) || [];
        if (images.length) {
          emitEvent("in.image.injected", seat.id, ctx || {}, {
            images: images.length,
            skipped: ((res && res.skipped) || []).length,
          });
        }
        return images;
      })
      .catch(function () {
        return [];
      });
  }

  function renderIoPanel() {
    document.getElementById("ioReaders").textContent = ioReadersText();
    document.getElementById("ioInList").innerHTML = ioListHtml(ioState.in, true);
    document.getElementById("ioOutList").innerHTML = ioListHtml(ioState.out, false);
    document.getElementById("ioFolder").textContent = t("ioFolderLabel", { path: ioState.folder });
    renderInboxSection();
  }

  function refreshIo() {
    var boardId = store.activeBoardId;
    return window.rundbord
      .filesList(boardId)
      .then(function (res) {
        if (!res || boardId !== store.activeBoardId) return;
        ioState = { in: res.in || [], out: res.out || [], folder: res.folder || "" };
        renderIoBand();
        if (!document.getElementById("ioPanel").hidden) renderIoPanel();
      })
      .catch(function () {});
  }

  function openIoPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.getElementById("ioStatus").textContent = "";
    document.getElementById("ioPanel").hidden = false;
    renderIoPanel();
    refreshIo();
  }

  function addFilesResult(promise) {
    return promise.then(function (res) {
      var status = "";
      if (res && res.added && res.added.length) status += t("ioAdded", { count: res.added.length });
      if (res && res.skipped && res.skipped.length) {
        status += (status ? " " : "") + t("ioSkipped", {
          names: res.skipped.map(function (x) { return x.name || x; }).join(", "),
        });
      }
      if (status) openIoPanel();
      document.getElementById("ioStatus").textContent = status;
      return refreshIo();
    });
  }

  function addFilesToIn(paths) {
    if (!paths || !paths.length) return;
    addFilesResult(window.rundbord.filesAddToIn(store.activeBoardId, paths));
  }

  function setupDropZone() {
    // Uden preventDefault på dokumentniveau navigerer vinduet væk til filen.
    var dragDepth = 0;
    function hasFiles(e) {
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0;
    }
    document.addEventListener("dragenter", function (e) {
      if (!hasFiles(e)) return;
      dragDepth += 1;
      document.body.classList.add("drag-files");
    });
    document.addEventListener("dragleave", function (e) {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove("drag-files");
    });
    document.addEventListener("dragover", function (e) {
      e.preventDefault();
    });
    var inTile = document.getElementById("ioInTile");
    inTile.addEventListener("dragover", function () {
      inTile.classList.add("drag-over");
    });
    inTile.addEventListener("dragleave", function () {
      inTile.classList.remove("drag-over");
    });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove("drag-files");
      inTile.classList.remove("drag-over");
      if (!hasFiles(e) || !e.dataTransfer.files.length) return;
      // Slip overalt i vinduet lægger filerne i IN — kun IN-feltet fremhæves.
      var dropped = Array.prototype.slice.call(e.dataTransfer.files);
      var paths = window.rundbord.pathsForFiles(dropped);
      if (paths.length === dropped.length) return addFilesToIn(paths);
      // Ingen sti (fx trukket ud af en mail eller browser): send bytes i stedet.
      Promise.all(
        dropped.map(function (file) {
          return file.arrayBuffer().then(function (buf) {
            return { name: file.name, data: new Uint8Array(buf) };
          });
        })
      ).then(function (items) {
        addFilesResult(window.rundbord.filesAddBuffersToIn(store.activeBoardId, items));
      });
    });
  }

  function defaultOutName(seat) {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    var base = seat ? seat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
    return (base || "svar") + "-" + stamp + ".md";
  }

  // Gemmer ét svar i OUT og lægger en systemnote. via: "outWriter" | "button".
  // Port før OUT: er den seneste kontrol i opgaven ikke bestået, gemmes intet, før du bevidst overstyrer.
  function outGateClosed(taskId) {
    if (!taskId) return Promise.resolve(false);
    return window.rundbord.getEvents(store.activeBoardId).then(function (events) {
      var mine = (events || []).filter(function (e) {
        return e.taskId === taskId;
      });
      return window.RundbordVerify.outGate(mine) === "closed";
    });
  }

  function saveReplyToOut(seat, reply, ctx, refMessageId, via, force) {
    if (!force) {
      return outGateClosed(ctx && ctx.taskId).then(function (closed) {
        if (!closed) return writeReplyToOut(seat, reply, ctx, refMessageId, via);
        return systemNote(t("outBlockedNote"), { kind: "outBlocked", replyMessageId: refMessageId }).then(function () {
          return { ok: false, blocked: true };
        });
      });
    }
    return writeReplyToOut(seat, reply, ctx, refMessageId, via);
  }

  // En stol, der afslutter med <<SPRINT>> + JSON, giver en læsbar fil OG en CSV (lib/sprintplan.js). Kan blokken ikke læses,
  // gemmes teksten som den er, med en note.
  function writeReplyToOut(seat, reply, ctx, refMessageId, via) {
    var sp = window.RundbordSprintPlan.parse(reply);
    if (sp.ok) return writeSprintPlan(seat, reply, ctx, refMessageId, via, sp);
    var plain = writeReplyToOutPlain(seat, reply, ctx, refMessageId, via);
    if (sp.error === "noBlock") return plain;
    return plain.then(function (res) {
      return systemNote(t("sprintUnreadableNote")).then(function () {
        return res;
      });
    });
  }

  function sprintBaseName(reply) {
    var parsed = window.RundbordIO.parseOutFile(reply, stripNeedsSummary);
    var base = String(parsed.name || "").replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 60);
    return base || t("sprintDefaultName") + "-" + new Date().toISOString().slice(0, 10);
  }

  function writeSprintPlan(seat, reply, ctx, refMessageId, via, sp) {
    var loc = store.locale === "da" ? "da" : "en";
    var base = sprintBaseName(reply);
    // Beskyttelse: filerne får de rigtige værdier tilbage, som alle andre filer i OUT.
    var restore = function (txt) {
      return shieldOn() ? window.RundbordShield.restore(txt, shieldMapping()).text : txt;
    };
    var files = [
      { name: base + ".md", content: restore(window.RundbordSprintPlan.toMarkdown(sp.plan, loc)) },
      { name: base + ".csv", content: restore(window.RundbordSprintPlan.toCsv(sp.plan)) },
    ];
    var saved = [];
    return files
      .reduce(function (chain, f) {
        return chain.then(function () {
          return window.rundbord
            .filesWriteOut(store.activeBoardId, f.name, f.content, {
              seatId: seat ? seat.id : null, taskId: (ctx && ctx.taskId) || null, runId: (ctx && ctx.runId) || null,
              refMessageId: refMessageId || null, via: via, fallback: false,
            })
            .then(function (res) {
              if (res && res.ok) saved.push(res.name);
              return res;
            });
        });
      }, Promise.resolve())
      .then(function () {
        if (saved.length < 2) return systemNote(t("outSaveFailed", { message: t("unknownError") }));
        return systemNote(t("sprintSavedNote", { md: saved[0], csv: saved[1], items: sp.plan.items.length, points: sp.plan.total }), { kind: "outSaved", file: saved[0] });
      })
      .then(function () {
        return sp.warnings.length ? systemNote(t("sprintWarningsNote", { count: sp.warnings.length })) : null;
      })
      .then(function () {
        refreshIo();
        return { ok: saved.length === 2, name: saved[0] };
      });
  }

  function writeReplyToOutPlain(seat, reply, ctx, refMessageId, via) {
    var parsed = window.RundbordIO.parseOutFile(reply, stripNeedsSummary);
    var suggested = parsed.name || defaultOutName(seat);
    // Beskyttelse: filen i OUT får de rigtige værdier tilbage; pladsholdere, vi ikke kender, står og meldes.
    var restoredOut = shieldOn() ? window.RundbordShield.restore(parsed.content, shieldMapping()) : null;
    var outContent = restoredOut ? restoredOut.text : parsed.content;
    var outUnknown = restoredOut ? restoredOut.unknown.length + restoredOut.altered.length : 0;
    return window.rundbord
      .filesWriteOut(store.activeBoardId, suggested, outContent, {
        seatId: seat ? seat.id : null,
        taskId: (ctx && ctx.taskId) || null,
        runId: (ctx && ctx.runId) || null,
        refMessageId: refMessageId || null,
        via: via,
        fallback: parsed.fallback,
      })
      .then(function (res) {
        if (res && res.ok) {
          return systemNote(t("outSavedNote", { name: res.name }), { kind: "outSaved", file: res.name })
            .then(function () {
              return outUnknown ? systemNote(t("shieldOutUnknownNote", { count: outUnknown })) : null;
            })
            .then(function () {
              refreshIo();
              return res;
            });
        }
        return systemNote(t("outSaveFailed", { message: (res && res.message) || t("unknownError") })).then(function () {
          return res;
        });
      });
  }

  function maybeAutoSaveOut(seat, reply, ctx) {
    if (window.RundbordRoles.conceptOf(seat) !== OUT_WRITER_ROLE) return Promise.resolve();
    return saveReplyToOut(seat, reply, ctx, ctx.refMessageId, "outWriter");
  }

  function saveMessageToOut(messageId, btn) {
    var msg = (currentBoard().messages || []).find(function (m) {
      return m.id === messageId;
    });
    if (!msg) return;
    btn.disabled = true;
    saveReplyToOut(seatById(msg.seatId), msg.text, { taskId: msg.meta && msg.meta.taskId, runId: msg.meta && msg.meta.runId }, msg.id, "button")
      .then(function () {
        btn.disabled = false;
      })
      .catch(function () {
        btn.disabled = false;
      });
  }

