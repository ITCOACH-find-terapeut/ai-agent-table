// Backup af ét bord som én læsbar fil: opsætningen (som i en bordfil) og samtalen, så intet er tabt, hvis bordet slettes.
// Filen kommer fra en HVIDLISTE af felter: aldrig API-nøgler, GitHub-token og -adresse, stolenes adresser eller Beskyttelsens ordliste og kortlægning.
// Beskeder står, som de er gemt (med pladsholdere, hvis Beskyttelse var slået til). Ren logik uden DOM og Electron.
// window.RundbordBoardBackup i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordBoardBackup = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var FORMAT = "rundbordet-backup";
  var VERSION = 1;

  function TableFile() {
    return typeof module === "object" && module.exports ? require("./tablefile.js") : window.RundbordTableFile;
  }

  function str(v, max) {
    return String(v == null ? "" : v).slice(0, max);
  }

  // info: { now (iso), version, revision }
  function build(board, info) {
    var b = board || {};
    info = info || {};
    var names = {};
    (b.seats || []).forEach(function (s) {
      if (s && s.id) names[s.id] = str(s.name, 40);
    });
    var out = {
      format: FORMAT,
      version: VERSION,
      savedAt: info.now || null,
      app: { version: str(info.version, 20), revision: str(info.revision, 20) },
      note: "Indeholder bordets opsætning og samtale. Indeholder aldrig API-nøgler, tokens eller adresser.",
      board: { name: str(b.projectName, 80), shieldWasOn: Boolean(b.shield && b.shield.enabled) },
      setup: TableFile().build(b, { now: info.now || null, app: info.version ? "Rundbordet " + info.version : "" }),
      messages: (b.messages || []).map(function (m) {
        var entry = {
          at: str(m.at, 40),
          role: m.role === "assistant" || m.role === "system" ? m.role : "user",
          seat: m.seatId && names[m.seatId] ? names[m.seatId] : null,
          text: str(m.text, 200000),
        };
        // Samtalen med Tredje øje og notitser skal kunne gendannes som det, de var, og ikke som almindelige beskeder ved bordet.
        if (m.meta && m.meta.talk) entry.talk = true;
        if (m.meta && typeof m.meta.kind === "string" && m.meta.kind) entry.kind = str(m.meta.kind, 40);
        return entry;
      }),
    };
    if (Array.isArray(b.memory) && b.memory.length) {
      out.memory = b.memory.map(function (m) {
        return { at: str(m && (m.at || m.createdAt), 40), text: str(m && m.text, 20000) };
      });
    }
    return out;
  }

  function text(board, info) {
    return JSON.stringify(build(board, info), null, 2);
  }

  // Et filnavn uden mellemrum og specialtegn: rundbordet-backup-<bordnavn>-ÅÅÅÅ-MM-DD.json
  function fileName(board, nowIso) {
    var name = String((board && board.projectName) || "bord")
      .replace(/æ/g, "ae")
      .replace(/Æ/g, "Ae")
      .replace(/ø/g, "oe")
      .replace(/Ø/g, "Oe")
      .replace(/å/g, "aa")
      .replace(/Å/g, "Aa")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    var day = /^\d{4}-\d{2}-\d{2}/.test(String(nowIso || "")) ? String(nowIso).slice(0, 10) : "ukendt-dato";
    return "rundbordet-backup-" + (name || "bord") + "-" + day + ".json";
  }

  // ---- Gendan: en backupfil er UPÅLIDELIG, så alt valideres, før noget oprettes ----
  var MAX_CHARS = 2000000; // som loftet ved gem og åbn af en tekstfil (main.js)
  var MAX_MESSAGES = 300;
  var MAX_MEMORY = 200;

  function oneLine(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  }

  // Beskedens tekst beholder linjeskift og indrykning, men ingen styretegn.
  function body(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").slice(0, max);
  }

  // ctx som til TableFile().parse. → { ok, error?, setup?, messages?, memory?, shieldWasOn?, warnings }
  function parse(textIn, ctx) {
    var warnings = [];
    var raw = String(textIn == null ? "" : textIn);
    if (raw.length > MAX_CHARS) return { ok: false, error: "tooBig", warnings: warnings };
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: "notJson", warnings: warnings };
    }
    if (!data || typeof data !== "object" || data.format !== FORMAT) return { ok: false, error: "notBackup", warnings: warnings };
    if (typeof data.version !== "number" || data.version > VERSION) return { ok: false, error: "newerVersion", warnings: warnings };
    if (!data.setup || typeof data.setup !== "object") return { ok: false, error: "noSetup", warnings: warnings };
    var t = TableFile().parse(JSON.stringify(data.setup), ctx);
    warnings = warnings.concat(t.warnings || []);
    if (!t.ok) return { ok: false, error: "badSetup", warnings: warnings };
    var names = t.setup.seats.map(function (s) {
      return s.role;
    });
    var rawMessages = Array.isArray(data.messages) ? data.messages : [];
    if (rawMessages.length > MAX_MESSAGES) warnings.push({ code: "tooManyMessages", count: rawMessages.length - MAX_MESSAGES });
    var messages = rawMessages
      .slice(-MAX_MESSAGES)
      .map(function (m) {
        if (!m || typeof m !== "object") return null;
        var text = body(m.text, 200000);
        if (!text.trim()) return null;
        var seat = oneLine(m.seat, 40);
        var entry = {
          at: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(String(m.at || "")) ? String(m.at).slice(0, 40) : "",
          role: m.role === "assistant" || m.role === "system" ? m.role : "user",
          seat: names.indexOf(seat) >= 0 ? seat : null,
          text: text,
        };
        if (m.talk === true) entry.talk = true;
        var kind = oneLine(m.kind, 40);
        if (kind) entry.kind = kind;
        return entry;
      })
      .filter(Boolean);
    var memory = (Array.isArray(data.memory) ? data.memory : [])
      .slice(-MAX_MEMORY)
      .map(function (m) {
        var text = oneLine(m && m.text, 20000);
        return text ? { at: oneLine(m && m.at, 40), text: text } : null;
      })
      .filter(Boolean);
    var shieldWasOn = Boolean(data.board && data.board.shieldWasOn);
    if (shieldWasOn && messages.length) warnings.push({ code: "shieldWasOn" });
    return { ok: true, setup: t.setup, messages: messages, memory: memory, shieldWasOn: shieldWasOn, savedAt: oneLine(data.savedAt, 40), warnings: warnings };
  }

  // Til listen over borde: tal og tidspunkt for sidste besked.
  function summary(board) {
    var b = board || {};
    var messages = b.messages || [];
    var last = messages.length ? messages[messages.length - 1].at || "" : "";
    return {
      seats: (b.seats || []).length,
      messages: messages.length,
      tasks: messages.filter(function (m) {
        return m && m.role === "user" && !(m.meta && m.meta.talk);
      }).length,
      lastAt: last,
    };
  }

  return { FORMAT: FORMAT, VERSION: VERSION, build: build, text: text, parse: parse, fileName: fileName, summary: summary };
});
