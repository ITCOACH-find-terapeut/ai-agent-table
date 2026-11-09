// "Næste skridt": Tredje øje kan foreslå op til tre valg (A, B, C) i en fast, maskinlæsbar blok.
// Modellens svar er utroværdigt: alt valideres her mod en hvidliste og mod bordets egne stole, roller og dials,
// og intet anvendes, før et menneske vælger. Ren logik, ingen netværk.
// window.RundbordNextSteps i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordNextSteps = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MARKER = "<<NEXT>>";
  var TYPES = ["give_turn", "set_dial", "add_seat", "add_addon"];
  var MAX_OPTIONS = 3;
  var IDS = ["A", "B", "C"];

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
      .replace(/<<NEXT>>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function norm(value) {
    return clean(value, 200).toLowerCase();
  }

  // Stol ud fra navn: præcist match først, ellers et entydigt delvist match. Aldrig gæt mellem flere.
  function findSeat(seats, name) {
    var want = norm(name);
    if (!want) return null;
    var list = Array.isArray(seats) ? seats : [];
    var exact = list.filter(function (s) {
      return norm(s.name) === want;
    });
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    var partial = list.filter(function (s) {
      return norm(s.name).indexOf(want) >= 0 || want.indexOf(norm(s.name)) >= 0;
    });
    return partial.length === 1 ? partial[0] : null;
  }

  function normalizeOne(raw, ctx) {
    if (!raw || typeof raw !== "object" || TYPES.indexOf(raw.type) < 0) return null;
    var out = { type: raw.type, why: clean(raw.why, 200) };
    if (raw.type === "give_turn") {
      var s0 = findSeat(ctx.seats, raw.seat);
      if (!s0) return null;
      out.seatId = s0.id;
      out.seatName = s0.name;
      return out;
    }
    if (raw.type === "set_dial") {
      var s1 = findSeat(ctx.seats, raw.seat);
      var dial = ctx.dials && ctx.dials[raw.dial];
      if (!s1 || !dial) return null;
      var state = dial.states.filter(function (st) {
        return norm(st) === norm(raw.state);
      })[0];
      if (!state) return null;
      out.seatId = s1.id;
      out.seatName = s1.name;
      out.dial = String(raw.dial);
      out.state = state;
      if (dial.hasStrength) {
        var n = parseInt(raw.strength, 10);
        out.strength = isFinite(n) ? Math.max(1, Math.min(10, n)) : null;
      } else {
        out.strength = null;
      }
      return out;
    }
    if (raw.type === "add_seat") {
      var roleName = clean(raw.role, 40);
      if (roleName.length < 2) return null;
      var known = (ctx.roles || []).filter(function (r) {
        return norm(r) === norm(roleName);
      })[0];
      var exists = (ctx.seats || []).some(function (s) {
        return norm(s.name) === norm(known || roleName);
      });
      if (exists) return null;
      out.role = known || roleName;
      out.custom = !known;
      out.text = clean(raw.text, 600);
      if (out.custom && out.text.length < 10) return null; // en ny rolle uden instruktion er ikke til at bruge
      return out;
    }
    // add_addon
    var s2 = findSeat(ctx.seats, raw.seat);
    var name = clean(raw.name, 40);
    var text = clean(raw.text, 400);
    if (!s2 || name.length < 2 || text.length < 5) return null;
    out.seatId = s2.id;
    out.seatName = s2.name;
    out.name = name;
    out.text = text;
    return out;
  }

  function signature(o) {
    return [o.type, o.seatId || "", o.dial || "", o.state || "", o.role || "", o.name || ""].join("|").toLowerCase();
  }

  // → { display, options, dropped, hadBlock }
  function parse(text, ctx) {
    var str = String(text == null ? "" : text);
    var idx = str.indexOf(MARKER);
    if (idx < 0) return { display: str.trim(), options: [], dropped: 0, hadBlock: false };
    var display = str.slice(0, idx).replace(/\s*-{3,}\s*$/, "").trim();
    var tail = str.slice(idx + MARKER.length).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    var arr = null;
    try {
      var parsed = JSON.parse(tail);
      arr = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.options) ? parsed.options : null;
    } catch (e) {
      arr = null;
    }
    if (!arr) return { display: display, options: [], dropped: 0, hadBlock: true };
    var seen = {};
    var options = [];
    var dropped = 0;
    arr.forEach(function (raw) {
      var o = normalizeOne(raw, ctx || {});
      if (!o || seen[signature(o)] || options.length >= MAX_OPTIONS) {
        dropped += 1;
        return;
      }
      seen[signature(o)] = true;
      o.id = IDS[options.length];
      options.push(o);
    });
    return { display: display, options: options, dropped: dropped, hadBlock: true };
  }

  // Selve valglisten til Tredje øje: kun navne og nøgler, aldrig beskedtekst.
  function choicesText(ctx) {
    var lines = [];
    lines.push("seats: " + (ctx.seats || []).map(function (s) { return s.name; }).join(" | "));
    lines.push("roles: " + (ctx.roles || []).join(" | "));
    Object.keys(ctx.dials || {}).forEach(function (k) {
      var d = ctx.dials[k];
      lines.push("dial " + k + ": " + d.states.join(" | ") + (d.hasStrength ? " (strength 1-10)" : ""));
    });
    return lines.join("\n");
  }

  return { MARKER: MARKER, TYPES: TYPES, parse: parse, findSeat: findSeat, choicesText: choicesText };
});
