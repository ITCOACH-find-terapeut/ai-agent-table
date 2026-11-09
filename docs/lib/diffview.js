// Uenighedsvisning: to svar ved siden af hinanden, og (efter dit valg) en models vurdering af, hvor de er enige og uenige. Ren logik uden DOM/Electron/netværk.
// Modellens svar er upålideligt: det læses som JSON, valideres og afkortes, og vises som en model-vurdering, ikke en kendsgerning.
// window.RundbordDiffView i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordDiffView = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_ITEMS = 6;
  var MAX_TEXT = 220;

  function clean(v, max) {
    var s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  // Kendetegn for en model (til at se, om to svar kommer fra samme model).
  function modelKey(seat) {
    return seat ? String(seat.provider || "") + "|" + String(seat.model || "") : "";
  }

  // Standardvalg af to svar: de to seneste assistentsvar fra FORSKELLIGE modeller i opgaven; findes de ikke, de to seneste.
  // messages: bordets beskeder; seats: stolene; since: opgavens starttidspunkt (valgfri). → { a, b } (beskeder) eller null
  function defaults(messages, seats, since) {
    var byId = {};
    (seats || []).forEach(function (s) { byId[s.id] = s; });
    var list = (messages || []).filter(function (m) {
      return m.role === "assistant" && !(m.meta && m.meta.talk) && byId[m.seatId] && (!since || m.at >= since);
    });
    if (list.length < 2) return null;
    var last = list[list.length - 1];
    for (var i = list.length - 2; i >= 0; i--) {
      if (modelKey(byId[list[i].seatId]) !== modelKey(byId[last.seatId]) && list[i].seatId !== last.seatId) return { a: list[i], b: last };
    }
    return { a: list[list.length - 2], b: last };
  }

  // Stolen, der skal låne regnekraft: helst en model, der hverken er A's eller B's; ellers en vilkårlig stol med nøgle.
  function pickJudge(seats, aSeat, bSeat) {
    var withKey = (seats || []).filter(function (s) { return s.apiKey; });
    var other = withKey.filter(function (s) { return modelKey(s) !== modelKey(aSeat) && modelKey(s) !== modelKey(bSeat); });
    return (other[0] || withKey[0] || null);
  }

  function strList(v) {
    return (Array.isArray(v) ? v : []).slice(0, MAX_ITEMS).map(function (x) { return clean(x, MAX_TEXT); }).filter(Boolean);
  }

  // Læser modellens svar (JSON, evt. i kodehegn eller med tekst omkring). → { ok, agree[], differ[{point,a,b}], unclear[] }
  function parse(raw) {
    var text = String(raw == null ? "" : raw);
    var start = text.indexOf("{");
    var end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false, agree: [], differ: [], unclear: [] };
    var data;
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return { ok: false, agree: [], differ: [], unclear: [] };
    }
    if (!data || typeof data !== "object") return { ok: false, agree: [], differ: [], unclear: [] };
    var differ = (Array.isArray(data.differ) ? data.differ : []).slice(0, MAX_ITEMS).map(function (d) {
      return d && typeof d === "object" ? { point: clean(d.point, MAX_TEXT), a: clean(d.a, MAX_TEXT), b: clean(d.b, MAX_TEXT) } : null;
    }).filter(function (d) { return d && d.point; });
    var out = { ok: true, agree: strList(data.agree), differ: differ, unclear: strList(data.unclear) };
    if (!out.agree.length && !out.differ.length && !out.unclear.length) out.ok = false;
    return out;
  }

  return { defaults: defaults, pickJudge: pickJudge, parse: parse, modelKey: modelKey, clean: clean };
});
