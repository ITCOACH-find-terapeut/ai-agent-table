// 42-stuck.js
// "Jeg sidder fast": en knap, der altid er synlig, og som laver en kort statusbesked (se lib/stuck.js), brugeren selv læser og selv sender.
// Skærmen husker de seneste trin i hukommelsen (kun knappernes id og hvilke paneler der åbnes og lukkes, aldrig tekst) og fejl i siden.
// Intet gemmes på disken, og intet sendes af sig selv. Hændelsen ved kopiering har kun tal, og er første skridt mod en anonym måling af, hvor det knirker.

  var stuckSteps = [];
  var stuckErrors = [];
  var stuckSnapshot = null; // { now, where, board, steps, events } fra det øjeblik, panelet blev åbnet

  function stuckPush(kind, id) {
    if (!id || /^stuck/.test(id)) return;
    stuckSteps.push({ at: Date.now(), kind: kind, id: id });
    if (stuckSteps.length > window.RundbordStuck.MAX_STEPS) stuckSteps.shift();
  }

  // Et id uden tekst: elementets eget id, ellers kortets/fanens nøgle, ellers tag og første klasse.
  function stuckIdOf(el) {
    if (el.id) return el.id;
    var ds = el.dataset || {};
    if (ds.card) return "card:" + ds.card;
    if (ds.panel) return "tab:" + ds.panel;
    if (ds.help) return "help:" + ds.help;
    var cls = (el.className && typeof el.className === "string" ? el.className.split(/\s+/)[0] : "") || "";
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  }

  function stuckIsVisible(el) {
    if (!el || el.hidden) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
  }

  function stuckPanelsView() {
    return Array.prototype.slice.call(document.querySelectorAll(".panel[id]")).map(function (panel) {
      var visible = stuckIsVisible(panel);
      var controls = visible
        ? Array.prototype.slice.call(panel.querySelectorAll("button, a[href], select")).map(function (c) {
            return { visible: stuckIsVisible(c), enabled: !c.disabled };
          })
        : [];
      return { id: panel.id, visible: visible, controls: controls };
    });
  }

  // Hvor står brugeren lige nu: åbne paneler, blindgyder og om siden står stille. Bruges af rapporten og af gennemgangstestene.
  function stuckWhere() {
    var panels = stuckPanelsView().filter(function (p) {
      return p.id !== "stuckPanel";
    });
    var open = panels.filter(function (p) {
      return p.visible;
    });
    var input = document.getElementById("msgInput");
    var inputUsable = Boolean(input && stuckIsVisible(input) && !input.disabled);
    var stop = document.getElementById("runStopBtn");
    var running = Boolean(runActive) || Boolean(stop && stuckIsVisible(stop));
    var dead = window.RundbordStuck.deadEnds(panels);
    return {
      panels: open.map(function (p) {
        return p.id;
      }),
      dead: dead,
      running: running,
      inputUsable: inputUsable,
      frozen: window.RundbordStuck.frozen({ running: running, panelsOpen: open.length > 0, inputUsable: inputUsable }),
    };
  }

  function stuckBoardView() {
    var b = currentBoard() || {};
    return {
      seats: (b.seats || []).map(function (s) {
        return { provider: s.provider, model: s.model, hasKey: Boolean(s.hasKey) };
      }),
      messages: (b.messages || []).length,
      tasks: (b.messages || []).filter(function (m) {
        return m.role === "user";
      }).length,
      welcomeSeen: store ? store.welcomeSeen : undefined,
    };
  }

  function stuckBuildText() {
    var snap = stuckSnapshot;
    return window.RundbordStuck.build({
      now: snap.now,
      app: {
        version: appInfo ? appInfo.version : "",
        revision: appInfo ? appInfo.revision : "",
        platform: appInfo ? appInfo.platform : "",
        locale: store ? store.locale : "",
      },
      where: snap.where,
      board: snap.board,
      steps: snap.steps,
      events: snap.events,
      errors: stuckErrors.slice(),
      note: document.getElementById("stuckNote").value,
    });
  }

  function stuckRefresh() {
    document.getElementById("stuckReport").value = stuckBuildText();
  }

  function openStuck() {
    var b = currentBoard() || {};
    stuckSnapshot = {
      now: Date.now(),
      where: stuckWhere(),
      board: stuckBoardView(),
      steps: stuckSteps.slice(),
      events: (b.events || []).slice(-40).map(function (e) {
        return { at: e.at, type: e.type, data: e.data };
      }),
    };
    document.getElementById("stuckNote").value = "";
    document.getElementById("stuckStatus").textContent = "";
    stuckRefresh();
    document.getElementById("stuckPanel").hidden = false;
    var panel = document.getElementById("stuckPanel");
    if (panel.scrollIntoView) panel.scrollIntoView({ block: "center", behavior: "smooth" });
    document.getElementById("stuckNote").focus();
  }

  function closeStuck() {
    document.getElementById("stuckPanel").hidden = true;
    stuckSnapshot = null;
  }

  function stuckReported(via) {
    var snap = stuckSnapshot;
    emitEvent("stuck.reported", null, {}, {
      via: via,
      panels: snap.where.panels.length,
      deadEnds: snap.where.dead.length,
      steps: snap.steps.length,
      hasNote: Boolean(document.getElementById("stuckNote").value.trim()),
    });
  }

  function copyStuck() {
    var text = document.getElementById("stuckReport").value;
    var status = document.getElementById("stuckStatus");
    var done = function () {
      status.className = "note";
      status.textContent = t("stuckCopied");
      stuckReported("copy");
    };
    var fallback = function () {
      var box = document.getElementById("stuckReport");
      box.focus();
      box.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {}
      if (ok) done();
      else {
        status.className = "note error-text";
        status.textContent = t("stuckCopyFailed");
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function saveStuck() {
    var status = document.getElementById("stuckStatus");
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    window.rundbord.saveTextFile("rundbordet-statusbesked-" + stamp + ".txt", document.getElementById("stuckReport").value, "txt").then(function (res) {
      if (res && res.ok) {
        status.className = "note";
        status.textContent = t("stuckSaved", { path: res.path });
        stuckReported("file");
      } else if (!(res && res.canceled)) {
        status.className = "note error-text";
        status.textContent = (res && res.message) || t("unknownError");
      }
    });
  }

  function bindStuck() {
    // Trinene optages fra start og kun i hukommelsen: klik (id), ændring af en vælger (id) og paneler, der åbnes og lukkes.
    document.addEventListener(
      "click",
      function (ev) {
        var el = ev.target && ev.target.closest ? ev.target.closest("button, a, select, summary, [data-card], [role=tab]") : null;
        if (el) stuckPush("click", stuckIdOf(el));
      },
      true
    );
    document.addEventListener(
      "change",
      function (ev) {
        var el = ev.target;
        if (el && el.id && /^(SELECT|INPUT)$/.test(el.tagName) && el.type !== "text" && el.type !== "password") stuckPush("change", el.id);
      },
      true
    );
    Array.prototype.forEach.call(document.querySelectorAll(".panel[id]"), function (panel) {
      var was = !panel.hidden;
      new MutationObserver(function () {
        var now = !panel.hidden;
        if (now !== was) stuckPush(now ? "open" : "close", panel.id);
        was = now;
      }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    });
    window.addEventListener("error", function (ev) {
      stuckErrors.push({ at: Date.now(), msg: ev.message, where: ev.filename ? ev.filename + ":" + ev.lineno : "" });
      if (stuckErrors.length > 5) stuckErrors.shift();
    });
    window.addEventListener("unhandledrejection", function (ev) {
      var r = ev.reason;
      stuckErrors.push({ at: Date.now(), msg: (r && r.message) || String(r || ""), where: "" });
      if (stuckErrors.length > 5) stuckErrors.shift();
    });

    document.getElementById("stuckBtn").addEventListener("click", openStuck);
    document.getElementById("stuckCloseBtn").addEventListener("click", closeStuck);
    document.getElementById("stuckCopyBtn").addEventListener("click", copyStuck);
    document.getElementById("stuckSaveBtn").addEventListener("click", saveStuck);
    document.getElementById("stuckNote").addEventListener("input", stuckRefresh);
  }
