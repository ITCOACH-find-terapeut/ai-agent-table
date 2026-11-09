// Bordfil: bordets opsætning (roller, dials, tilvalg) som én læsbar fil, der kan gemmes, deles og importeres.
// En fil fra en anden er UPÅLIDELIG: den kan ikke indeholde nøgler, beskeder eller adresser, og alt valideres mod
// hvidlister, før noget oprettes. Ren logik; window.RundbordTableFile i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordTableFile = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var FORMAT = "rundbordet-bord";
  var VERSION = 1;
  var MAX_CHARS = 1000000;
  var MAX_SEATS = 12;
  var MAX_ADDITIONS = 20;

  function Rounds() {
    return typeof module === "object" && module.exports ? require("./rounds.js") : window.RundbordRounds;
  }

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function lines(text) {
    return String(text || "")
      .split("\n")
      .map(function (l) {
        return clean(l, 400);
      })
      .filter(Boolean);
  }

  // Bordet → fil. Uden nøgler, adresser, stemmer, beskeder, hukommelse, Beskyttelsens ord og historik.
  function build(board, info) {
    var b = board || {};
    var out = {
      format: FORMAT,
      version: VERSION,
      exportedAt: (info && info.now) || null,
      app: (info && info.app) || "",
      board: { name: clean(b.projectName, 80), handoffMode: b.handoffMode === "structured" ? "structured" : "full" },
      seats: (b.seats || []).map(function (s) {
        var icons = s.icons && typeof s.icons === "object" ? s.icons : {};
        var entry = {
          role: clean(s.name, 40),
          provider: clean(s.provider, 40),
          model: clean(s.model, 80),
          color: clean(s.color, 20),
          dials: JSON.parse(JSON.stringify(s.dials && typeof s.dials === "object" ? s.dials : {})),
          icons: { mandate: icons.mandate || "kan", work: icons.work || {}, info: icons.info || {} },
          additions: lines(s.customInstruction),
          checks: Boolean(s.checks),
          readsIn: Boolean(s.readsIn),
        };
        // Begrebet (hvad stolen er) skrives kun, når stolen har et gemt; "" betyder bevidst intet begreb (et eget navn). En ældre stol uden begreb lader appen udlede det af navnet.
        if (typeof s.role === "string") entry.concept = clean(s.role, 40);
        return entry;
      }),
    };
    if (typeof b.maxRunCostUsd === "number" && b.maxRunCostUsd > 0) out.board.maxRunCostUsd = b.maxRunCostUsd;
    if (b.rounds && typeof b.rounds === "object") out.board.rounds = Rounds().normalize(b.rounds);
    if (b.ownTakeFirst === true) out.board.ownTakeFirst = true;
    return out;
  }

  // ctx = { dials: {key: {states, hasStrength}}, providers: [...], colors: [...], mandates: [...], work: [...], info: [...] }
  // → { ok, error?, setup?, warnings }
  function parse(text, ctx) {
    var warnings = [];
    var str = String(text == null ? "" : text);
    if (str.length > MAX_CHARS) return { ok: false, error: "tooBig", warnings: warnings };
    var data;
    try {
      data = JSON.parse(str);
    } catch (e) {
      return { ok: false, error: "notJson", warnings: warnings };
    }
    if (!data || typeof data !== "object" || data.format !== FORMAT) return { ok: false, error: "notTableFile", warnings: warnings };
    if (typeof data.version !== "number" || data.version > VERSION) return { ok: false, error: "newerVersion", warnings: warnings };
    if (!Array.isArray(data.seats) || !data.seats.length) return { ok: false, error: "noSeats", warnings: warnings };
    if (data.seats.length > MAX_SEATS) {
      warnings.push({ code: "tooManySeats", count: data.seats.length - MAX_SEATS });
    }
    var c = ctx || {};
    var providers = c.providers || [];
    var colors = c.colors || [];
    var seats = [];
    data.seats.slice(0, MAX_SEATS).forEach(function (raw, i) {
      if (!raw || typeof raw !== "object") return warnings.push({ code: "skippedSeat", index: i + 1 });
      var role = clean(raw.role, 40);
      if (role.length < 2) return warnings.push({ code: "skippedSeat", index: i + 1 });
      var provider = clean(raw.provider, 40);
      if (providers.indexOf(provider) < 0) {
        warnings.push({ code: "unknownProvider", role: role, provider: provider });
        provider = providers[0] || "anthropic";
      }
      var color = colors.indexOf(raw.color) >= 0 ? raw.color : colors[i % Math.max(colors.length, 1)] || "";
      var dials = {};
      var rawDials = raw.dials && typeof raw.dials === "object" ? raw.dials : {};
      Object.keys(rawDials).forEach(function (k) {
        var def = c.dials && c.dials[k];
        var d = rawDials[k];
        if (!def || !d || typeof d !== "object") return warnings.push({ code: "unknownDial", role: role, key: clean(k, 40) });
        if (def.states.indexOf(d.state) < 0) return warnings.push({ code: "unknownDialState", role: role, key: k });
        var entry = { state: d.state, note: clean(d.note, 200) };
        if (def.hasStrength) {
          var n = parseInt(d.strength, 10);
          entry.strength = isFinite(n) ? Math.max(1, Math.min(10, n)) : 6;
        }
        dials[k] = entry;
      });
      var rawIcons = raw.icons && typeof raw.icons === "object" ? raw.icons : {};
      var icons = { mandate: (c.mandates || []).indexOf(rawIcons.mandate) >= 0 ? rawIcons.mandate : "kan", work: {}, info: {} };
      (c.work || []).forEach(function (k) {
        icons.work[k] = Boolean(rawIcons.work && rawIcons.work[k]);
      });
      (c.info || []).forEach(function (k) {
        icons.info[k] = Boolean(rawIcons.info && rawIcons.info[k]);
      });
      var additions = (Array.isArray(raw.additions) ? raw.additions : []).map(function (a) {
        return clean(a, 400);
      }).filter(Boolean);
      if (additions.length > MAX_ADDITIONS) {
        warnings.push({ code: "tooManyAdditions", role: role, count: additions.length - MAX_ADDITIONS });
        additions = additions.slice(0, MAX_ADDITIONS);
      }
      if (icons.mandate !== "kan" && dials.action && dials.action.state !== "off") warnings.push({ code: "mandateConflict", role: role });
      var seat = {
        role: role,
        provider: provider,
        model: clean(raw.model, 80),
        color: color,
        dials: dials,
        icons: icons,
        additions: additions,
        checks: raw.checks === true,
        readsIn: raw.readsIn === true,
      };
      // Begrebet (hvad stolen er, fx OUT Writer) står kun i nyere filer; en ældre fil lader stolen hedde sit begreb, som før.
      if (typeof raw.concept === "string") seat.concept = clean(raw.concept, 40);
      seats.push(seat);
    });
    if (!seats.length) return { ok: false, error: "noSeats", warnings: warnings };
    var rawBoard = data.board && typeof data.board === "object" ? data.board : {};
    var setup = {
      name: clean(rawBoard.name, 80) || "Importeret bord",
      handoffMode: rawBoard.handoffMode === "structured" ? "structured" : "full",
      seats: seats,
    };
    var cost = Number(rawBoard.maxRunCostUsd);
    if (isFinite(cost) && cost > 0 && cost <= 1000) setup.maxRunCostUsd = Math.round(cost * 10000) / 10000;
    if (rawBoard.rounds && typeof rawBoard.rounds === "object") setup.rounds = Rounds().normalize(rawBoard.rounds);
    if (rawBoard.ownTakeFirst === true) setup.ownTakeFirst = true;
    return { ok: true, setup: setup, warnings: warnings };
  }

  return { FORMAT: FORMAT, VERSION: VERSION, MAX_SEATS: MAX_SEATS, build: build, parse: parse };
});
