// Tilbageblik: en kalenderfil (.ics) med et par refleksionsspørgsmål, der minder dig om at se tilbage på en beslutning om fx en uge. Ren logik uden
// DOM/Electron/netværk: appen sender intet; brugeren åbner filen i sin egen kalender. Spørgsmålene laves med regler, ikke af en model.
// window.RundbordReflection i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordReflection = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var PRESETS = { "1w": 7, "2w": 14, "1m": 30 };
  var MAX_TOPIC = 120;

  function clean(text, max) {
    var s = String(text == null ? "" : text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  // Spørgsmålene (2-3). Som standard generiske; med opts.topic (valgfri, brugerens eget valg) nævnes emnet, og med opts.hasOwnTake et spørgsmål om dit eget bud.
  // t(key, vars) er oversættelsen fra appen.
  function questions(t, opts) {
    opts = opts || {};
    var topic = clean(opts.topic, MAX_TOPIC);
    var list = [topic ? t("reflectionQ1Topic", { topic: topic }) : t("reflectionQ1")];
    list.push(t("reflectionQ2"));
    list.push(opts.hasOwnTake ? t("reflectionQ3Own") : t("reflectionQ3"));
    return list;
  }

  // Det ekstra, der kan komme med i aftalens beskrivelse efter brugerens valg: åbne spørgsmål ("parkeret") og afgørelser. reg: { open: [{ seat, question }], decided: [{ seat, question, decision }] }.
  // opts: { includeOpen, includeDecided, max } → tekst (tom, hvis intet er valgt eller der intet er). Højst max punkter pr. liste; hver linje afkortes.
  function extraText(t, reg, opts) {
    opts = opts || {};
    var max = opts.max || 8;
    var parts = [];
    if (opts.includeOpen && reg && reg.open && reg.open.length) {
      parts.push(t("reflectionExtraOpenHeader") + "\n" + reg.open.slice(0, max).map(function (x) { return "- " + clean(x.question, 200); }).join("\n"));
    }
    if (opts.includeDecided && reg && reg.decided && reg.decided.length) {
      parts.push(
        t("reflectionExtraDecidedHeader") + "\n" +
          reg.decided.slice(0, max).map(function (x) {
            var d = x.decision || {};
            return "- " + clean(x.question, 120) + " → " + (d.skipped ? t("reflectionExtraSkipped") : clean(d.answer, 120));
          }).join("\n")
      );
    }
    return parts.join("\n\n");
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // Dato for tilbageblikket: kl. 09.00 lokal tid, 7, 14 eller 30 dage efter now. Rammer det en weekend, flyttes det til mandag.
  function dateFor(now, preset) {
    var days = PRESETS[preset] || PRESETS["2w"];
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9, 0, 0, 0);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }

  // Flydende lokal tid (uden zone), så aftalen står kl. 09.00 hos brugeren, uanset tidszone.
  function localStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }
  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }

  // RFC 5545: \ ; , og linjeskift skal escapes.
  function esc(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
  }

  // Linjer må højst være 75 oktetter; længere foldes med CRLF + mellemrum (uden at skære et UTF-8-tegn over).
  function fold(line) {
    var out = [];
    var cur = "";
    var bytes = 0;
    var limit = 75;
    Array.from(line).forEach(function (ch) {
      var n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > limit) {
        out.push(cur);
        cur = " ";
        bytes = 1;
        limit = 75;
      }
      cur += ch;
      bytes += n;
    });
    out.push(cur);
    return out.join("\r\n");
  }

  // opts: { summary, description, start (Date), minutes, uid, now (Date) } → .ics-tekst (CRLF). Med en VALARM, så kalenderen minder dig ved start.
  function buildIcs(opts) {
    var start = opts.start;
    var end = new Date(start.getTime() + (opts.minutes || 30) * 60000);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Rundbordet//Tilbageblik//DA",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + String(opts.uid).replace(/[^\w@.-]/g, ""),
      "DTSTAMP:" + utcStamp(opts.now || new Date()),
      "DTSTART:" + localStamp(start),
      "DTEND:" + localStamp(end),
      "SUMMARY:" + esc(clean(opts.summary, 120)),
      "DESCRIPTION:" + esc(String(opts.description || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").slice(0, 2000)),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + esc(clean(opts.summary, 120)),
      "TRIGGER:PT0S",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  return { PRESETS: PRESETS, extraText: extraText, questions: questions, dateFor: dateFor, buildIcs: buildIcs, clean: clean };
});
