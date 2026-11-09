// Eksport af samtalen som én læsbar Markdown-fil: opsætning, samtalen med tidspunkter, hændelser (uden tekst) og et udkast til en situationslog
// over dine egne indgreb. Ren logik uden DOM/Electron; teksten til opsætningen (stolenes instruktioner m.m.) kommer udefra.
// Indeholder aldrig nøgler, adresser eller stemmer: kun det, der står i bordets beskeder og hændelser.
// window.RundbordConvoExport i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordConvoExport = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var TEXT = {
    da: {
      title: "Samtale: {project}",
      meta: "Eksporteret {now} · Rundbordet {version} (revision {revision}) · {count} beskeder · {events} hændelser",
      noKeys: "Filen indeholder aldrig API-nøgler, adresser eller stemmer.",
      shieldOn: "Beskyttelse var slået til: teksten står, som den er gemt (med pladsholdere i stedet for de skjulte oplysninger).",
      shieldOff: "Beskyttelse var slået fra.",
      setup: "Opsætning",
      conversation: "Samtalen",
      events: "Hændelser (uden tekst)",
      eventsNote: "Hændelserne er appens egen logbog: rene fakta og tidspunkter, uden beskedtekst.",
      interventions: "Dine indgreb (udkast til situationsloggen)",
      interventionsNote: "Udkast: tidspunkter og handlinger er fra appen. Kolonnerne T/U/O (Tænkning, Udførelse, Overvågning) og *Hvorfor* er tomme; dem udfylder du selv. Her står kun, hvad appen kan se, ikke hvad du tænkte.",
      colTime: "Tidspunkt",
      colWhat: "Hvad",
      colSeat: "Stol",
      colEvent: "Hændelse",
      colDetails: "Detaljer",
      colTuo: "T/U/O",
      colWhy: "Hvorfor",
      none: "Ingen.",
      task: "Opgave fra dig",
      direct: "Dig → {to}",
      relayed: "Videresendt til {to} (fra {from})",
      rework: "Sendt tilbage til {to} (efter kontrol fra {from})",
      system: "System",
      thirdEye: "Tredje øje",
      thirdEyeTalk: "Tredje øje (samtale)",
      reply: "{seat}",
      unknownSeat: "ukendt stol",
      "int.task": "Du gav opgaven",
      "int.direct": "Du skrev til {seat}",
      "int.run.started": "Du startede kørslen",
      "int.run.stopped": "Du stoppede kørslen",
      "int.route.accepted": "Du godkendte forslaget om, hvem der tager næste",
      "int.route.overridden": "Du valgte en anden stol end forslaget",
      "int.route.rework": "Du sendte arbejdet tilbage efter en kontrol",
      "int.route.stopped": "Du stoppede kørslen ved et valg",
      "int.check.overridden": "Du lod kørslen fortsætte trods en kontrol, der ikke bestod",
      "int.need.resolved": "Du markerede et behov som løst",
      "int.dial.applied": "Du anvendte en justering af en dial",
      "int.proposal.flagged": "Du markerede et svar som forslag",
      "int.proposal.approved": "Du godkendte et forslag",
      "int.proposal.dismissed": "Du afviste et forslag",
      "int.variant.chosen": "Du valgte en variant",
      "int.nextstep.chosen": "Du valgte et næste skridt",
      "int.nextstep.dismissed": "Du afviste næste skridt",
      "int.seat.reconfigured": "Du ændrede en stols indstillinger",
      "int.seat.added": "Du tilføjede en stol",
      "int.seat.reordered": "Du ændrede rækkefølgen af stole",
    },
    en: {
      title: "Conversation: {project}",
      meta: "Exported {now} · Rundbordet {version} (revision {revision}) · {count} messages · {events} events",
      noKeys: "The file never contains API keys, addresses or voices.",
      shieldOn: "Protection was on: the text is as stored (with placeholders instead of the hidden details).",
      shieldOff: "Protection was off.",
      setup: "Setup",
      conversation: "The conversation",
      events: "Events (without text)",
      eventsNote: "The events are the app's own log: plain facts and times, without message text.",
      interventions: "Your interventions (draft for the situation log)",
      interventionsNote: "Draft: the times and actions are from the app. The columns T/U/O (Thinking, Execution, Oversight) and *Why* are empty; you fill them in yourself. Only what the app can see is here, not what you thought.",
      colTime: "Time",
      colWhat: "What",
      colSeat: "Seat",
      colEvent: "Event",
      colDetails: "Details",
      colTuo: "T/U/O",
      colWhy: "Why",
      none: "None.",
      task: "Task from you",
      direct: "You → {to}",
      relayed: "Forwarded to {to} (from {from})",
      rework: "Sent back to {to} (after a check by {from})",
      system: "System",
      thirdEye: "Third Eye",
      thirdEyeTalk: "Third Eye (conversation)",
      reply: "{seat}",
      unknownSeat: "unknown seat",
      "int.task": "You gave the task",
      "int.direct": "You wrote to {seat}",
      "int.run.started": "You started the run",
      "int.run.stopped": "You stopped the run",
      "int.route.accepted": "You approved the suggestion for who takes the next turn",
      "int.route.overridden": "You chose another seat than the suggestion",
      "int.route.rework": "You sent the work back after a check",
      "int.route.stopped": "You stopped the run at a choice",
      "int.check.overridden": "You let the run continue despite a failed check",
      "int.need.resolved": "You marked a need as resolved",
      "int.dial.applied": "You applied a dial adjustment",
      "int.proposal.flagged": "You flagged a reply as a proposal",
      "int.proposal.approved": "You approved a proposal",
      "int.proposal.dismissed": "You dismissed a proposal",
      "int.variant.chosen": "You chose a variant",
      "int.nextstep.chosen": "You chose a next step",
      "int.nextstep.dismissed": "You dismissed the next steps",
      "int.seat.reconfigured": "You changed a seat's settings",
      "int.seat.added": "You added a seat",
      "int.seat.reordered": "You changed the order of the seats",
    },
  };

  function fill(text, vars) {
    var out = String(text);
    Object.keys(vars || {}).forEach(function (k) {
      out = out.split("{" + k + "}").join(String(vars[k]));
    });
    return out;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // 2026-10-21 15:40:12 i den lokale tid (så klokkeslættet passer til det, du så på uret)
  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function cell(text) {
    return String(text == null ? "" : text).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
  }

  function table(head, rows) {
    var out = ["| " + head.join(" | ") + " |", "|" + head.map(function () { return "---"; }).join("|") + "|"];
    rows.forEach(function (r) {
      out.push("| " + r.map(cell).join(" | ") + " |");
    });
    return out;
  }

  // Beskyttede skærme: en kodeblok kan ikke indeholde tre backticks, så hegnet gøres længere, end nogen række i teksten.
  function fenced(text) {
    var fence = "```";
    while (String(text).indexOf(fence) >= 0) fence += "`";
    return fence + "\n" + text + "\n" + fence;
  }

  // Hvad der kan opsummeres fra en hændelses data uden at vise tekst: kun enkle værdier, afkortet.
  function dataSummary(data) {
    if (!data || typeof data !== "object") return "";
    var parts = [];
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (v === null || v === undefined || typeof v === "object") return;
      parts.push(k + "=" + String(v).slice(0, 60));
    });
    return parts.join(", ").slice(0, 200);
  }

  var HUMAN_EVENTS = ["run.started", "route.accepted", "route.overridden", "route.stopped", "check.overridden", "need.resolved", "dial.applied", "proposal.flagged", "proposal.approved", "proposal.dismissed", "variant.chosen", "nextstep.chosen", "nextstep.dismissed", "seat.reconfigured", "seat.added", "seat.reordered"];

  // opts: { board, appInfo: {version, revision}, locale, now (ISO), setupText (Markdown, valgfri) }
  function build(opts) {
    opts = opts || {};
    var T = TEXT[opts.locale === "en" ? "en" : "da"];
    var board = opts.board || {};
    var seats = board.seats || [];
    var messages = (board.messages || []).slice().sort(function (a, b) {
      return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0;
    });
    var events = (board.events || []).slice().sort(function (a, b) {
      return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0;
    });
    function seatName(id) {
      for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i].name;
      return id && id !== "__system__" ? T.unknownSeat : "";
    }
    function modelOf(id) {
      for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i].model ? seats[i].provider + " · " + seats[i].model : seats[i].provider || "";
      return "";
    }
    var info = opts.appInfo || {};
    var out = [];
    out.push("# " + fill(T.title, { project: board.projectName || "" }));
    out.push("");
    out.push(fill(T.meta, { now: formatTime(opts.now || new Date().toISOString()), version: info.version || "?", revision: info.revision || "?", count: messages.length, events: events.length }));
    out.push("");
    out.push(T.noKeys + " " + (board.shield && board.shield.enabled ? T.shieldOn : T.shieldOff));
    out.push("");
    if (opts.setupText) {
      out.push("## " + T.setup);
      out.push("");
      // opsætningsteksten har sine egne overskrifter; de rykkes ét niveau ned, så den passer ind under denne
      out.push(String(opts.setupText).replace(/^(#{1,5}) /gm, "$1# "));
      out.push("");
    }
    out.push("## " + T.conversation);
    out.push("");
    if (!messages.length) out.push(T.none + "\n");
    messages.forEach(function (m) {
      var meta = m.meta || {};
      var who;
      if (m.role === "assistant") who = fill(T.reply, { seat: seatName(m.seatId) }) + (modelOf(m.seatId) ? " · " + modelOf(m.seatId) : "");
      else if (m.role === "system") who = meta.kind === "thirdEye" ? T.thirdEye : T.system;
      else if (meta.talk) who = T.thirdEyeTalk;
      else if (meta.isTask) who = T.task;
      else if (meta.rework) who = fill(T.rework, { to: seatName(m.seatId), from: meta.from || "" });
      else if (meta.relayed) who = fill(T.relayed, { to: seatName(m.seatId), from: meta.from || "" });
      else who = fill(T.direct, { to: seatName(m.seatId) });
      out.push("### " + formatTime(m.at) + " · " + who);
      out.push("");
      out.push(fenced(String(m.text == null ? "" : m.text)));
      out.push("");
    });
    out.push("## " + T.events);
    out.push("");
    out.push(T.eventsNote);
    out.push("");
    out.push.apply(out, events.length ? table([T.colTime, T.colEvent, T.colSeat, T.colDetails], events.map(function (e) {
      return [formatTime(e.at), e.type, seatName(e.seatId), dataSummary(e.data)];
    })) : [T.none]);
    out.push("");
    out.push("## " + T.interventions);
    out.push("");
    out.push(T.interventionsNote);
    out.push("");
    var rows = [];
    messages.forEach(function (m) {
      var meta = m.meta || {};
      if (m.role !== "user" || meta.talk || meta.relayed || meta.rework) return;
      rows.push({ at: m.at, what: meta.isTask ? T["int.task"] : fill(T["int.direct"], { seat: seatName(m.seatId) }), seat: meta.isTask ? "" : seatName(m.seatId) });
    });
    events.forEach(function (e) {
      var d = e.data || {};
      var human = HUMAN_EVENTS.indexOf(e.type) >= 0 || (e.type === "route.rework" && d.auto !== true) || (e.type === "run.stopped" && d.reason === "user");
      if (!human) return;
      rows.push({ at: e.at, what: T["int." + e.type] || e.type, seat: seatName(e.seatId) });
    });
    rows.sort(function (a, b) {
      return String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0;
    });
    out.push.apply(out, rows.length ? table([T.colTime, T.colWhat, T.colSeat, T.colTuo, T.colWhy], rows.map(function (r) {
      return [formatTime(r.at), r.what, r.seat, "", ""];
    })) : [T.none]);
    out.push("");
    return out.join("\n");
  }

  return { build: build, formatTime: formatTime, HUMAN_EVENTS: HUMAN_EVENTS };
});
