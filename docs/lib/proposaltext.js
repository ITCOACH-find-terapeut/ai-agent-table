// Forslag til fast instruktion: hvad der står i tekstfeltet, og om modellens omskrivning kan bruges. Ren logik uden DOM/Electron/netværk.
// Protokollinjerne (🔭 BEHOV, 👉 ROLLE, 🎚 JUSTÉR) er til appen og hører ikke til i en instruktion; det gør modellens gentagelse af opgaven heller ikke.
// window.RundbordProposalText i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordProposalText = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX = 600;
  var PROTOCOL_LINE = /^[ \t]*(?:\*\*)?[ \t]*(?:🔭|👉|🎚|🧪)️?/;
  var DIVIDER_LINE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;

  // Fjerner protokollinjer og skillelinjer. Resten er brugerens eget stykke tekst.
  function cleanText(text) {
    return String(text == null ? "" : text)
      .split(/\r?\n/)
      .filter(function (l) { return !PROTOCOL_LINE.test(l) && !DIVIDER_LINE.test(l); })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripMarkdown(line) {
    return String(line).replace(/^[ \t]*(?:#{1,6}[ \t]+|[-*•][ \t]+|\d+[.)][ \t]+)/, "").replace(/\*\*|__|`/g, "").trim();
  }

  // En overskrift er en linje, der kun er fed/overskrift, eller slutter med kolon og er kort.
  function isHeading(line) {
    var l = line.trim();
    if (/^#{1,6}\s/.test(l)) return true;
    if (/^\*\*[^*]+\*\*:?$/.test(l)) return true;
    return l.length < 60 && /:$/.test(l);
  }

  // Forkortelser, hvor punktummet ikke slutter en sætning.
  var ABBREV = ["pr", "fx", "bl.a", "f.eks", "osv", "dvs", "m.fl", "ca", "nr", "kl", "evt", "inkl", "ift", "mht", "vs", "e.g", "i.e", "etc"];

  function firstSentence(text, max) {
    var s = String(text).replace(/\s+/g, " ").trim();
    var end = -1;
    var re = /[.!?](?=\s|$)/g;
    var m;
    while ((m = re.exec(s))) {
      var before = s.slice(0, m.index).split(" ").pop().toLowerCase();
      if (m[0] === "." && ABBREV.indexOf(before) >= 0) continue;
      if (m.index < 11) continue;
      end = m.index + 1;
      break;
    }
    var out = end > 0 ? s.slice(0, end) : s;
    return out.length > max ? out.slice(0, max - 1) + "…" : out;
  }

  // body: svaret uden protokolblokken. Første linje er stolens gentagelse af opgaven; første rigtige sætning efter den er et bedre udgangspunkt.
  function firstSentenceAfterReadback(body) {
    var lines = cleanText(body).split(/\n+/);
    for (var i = 1; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l || isHeading(l)) continue;
      var plain = stripMarkdown(l);
      if (plain.length >= 20) return firstSentence(plain, 300);
    }
    return "";
  }

  // opts: { selection, body, need }
  // → { text, source: "selection" | "reply" | "need" | "readback" }
  // Tekst er altid et udkast: brugeren retter den, eller lader en model formulere den som instruktion.
  function draft(opts) {
    opts = opts || {};
    var sel = cleanText(opts.selection);
    if (sel.length >= 4) return { text: sel.slice(0, MAX), source: "selection" };
    var reply = firstSentenceAfterReadback(opts.body);
    if (reply) return { text: reply, source: "reply" };
    var need = cleanText(opts.need).replace(/^\s*(?:intet|ingen|none)\s*\.?\s*$/i, "");
    if (need) return { text: firstSentence(need, 300), source: "need" };
    var first = cleanText(opts.body).split(/\n+/)[0] || "";
    return { text: firstSentence(stripMarkdown(first), 300), source: "readback" };
  }

  // Stolen, der anbefales som modtager: den ROLLE peger på, ellers stolen, svaret kom fra. seatIds: stolene ved bordet.
  function recommendedSeat(roleSeatId, authorSeatId, seatIds) {
    var ids = seatIds || [];
    if (roleSeatId && ids.indexOf(roleSeatId) >= 0) return roleSeatId;
    if (authorSeatId && ids.indexOf(authorSeatId) >= 0) return authorSeatId;
    return ids[0] || null;
  }

  // Rækkefølge i rullemenuen: den anbefalede først, derefter resten i bordets rækkefølge.
  function orderSeats(seats, recommendedId) {
    var list = seats || [];
    var rec = list.filter(function (s) { return s.id === recommendedId; });
    return rec.concat(list.filter(function (s) { return s.id !== recommendedId; }));
  }

  // Den omskrevne tekst fra en model: ét afsnit, uden anførselstegn og indledning, afkortet. Tom streng, hvis der ikke er noget at bruge.
  function parseRewrite(reply) {
    var s = cleanText(reply).replace(/^\s*(?:instruktion|instruction)\s*:\s*/i, "");
    s = s.split(/\n{2,}/)[0].replace(/\s+/g, " ").trim();
    s = s.replace(/^["“„'‘»«]+|["”“'’»«]+$/g, "").trim();
    return s.length > MAX ? s.slice(0, MAX - 1) + "…" : s;
  }

  return { cleanText: cleanText, draft: draft, recommendedSeat: recommendedSeat, orderSeats: orderSeats, parseRewrite: parseRewrite, MAX: MAX };
});
