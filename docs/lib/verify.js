// Kontrolstolen ("checker"): dommen og hvad den betyder for kørslen. Ren logik uden DOM/Electron.
// window.RundbordVerify i appen, require() i node-tests.
//
// En kontrolstol afslutter sit svar med én linje:  🧪 KONTROL: PASS   eller   🧪 KONTROL: FAIL — <begrundelse>
// Parseren er forankret på emoji + kolon og accepterer kun de to ord PASS/FAIL (uafhængigt af appens sprog),
// så et svar uden tydelig dom aldrig regnes for bestået.
// Valgfrit (bordets "Kræv bevis for PASS"): et PASS skal følges af ordrette citater, 🔎 BEVIS: "…", som appen selv finder i det kontrollerede svar.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordVerify = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var LINE_RE = /^[ \t]*(?:\*\*)?🧪️?[^\n:]*:\*{0,2}[ \t]*(PASS|FAIL)\b\*{0,2}[ \t]*[:—–-]?[ \t]*([^\n]*)$/gim;

  // → { verdict: "pass"|"fail", reason } eller null når der ikke er en tydelig dom.
  // Er der flere linjer, gælder den SIDSTE (modellen kan have citeret formatet tidligere i svaret).
  function parse(text) {
    var str = String(text || "");
    var m;
    var last = null;
    LINE_RE.lastIndex = 0;
    while ((m = LINE_RE.exec(str))) last = m;
    if (!last) return null;
    return { verdict: last[1].toUpperCase() === "PASS" ? "pass" : "fail", reason: last[2].replace(/\*\*/g, "").trim() };
  }

  // --- Kontrol med bevis (valgfrit) ---
  // Når bordet kræver bevis, må et PASS kun gælde, hvis kontrolstolen har citeret det, den har set, i ordrette citater:
  //   🔎 BEVIS: "…ordret stump af det kontrollerede svar…"
  // Appen slår hvert citat op i den tekst, kontrollen har fået (efter at have ensrettet mellemrum, citationstegn, streger og
  // markdown-tegn). Det beviser, at citatet findes; ikke at det understøtter PASS, og ikke at arbejdet er rigtigt.
  var EVIDENCE_RE = /^[ \t]*(?:\*\*)?🔎️?[^\n:]*:\*{0,2}[ \t]*([^\n]*)$/gim;
  var MIN_QUOTE_CHARS = 12; // kortere stumper findes næsten altid af sig selv og beviser intet
  var MAX_QUOTES = 8;

  function normText(s) {
    return String(s || "")
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB\u201F"]/g, '"')
      .replace(/[\u2018\u2019\u201A\u2032`]/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[*_#>`~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function quoteBody(raw) {
    var line = String(raw || "").replace(/\*\*/g, "").trim();
    var m = /^["\u201C\u201E\u00AB]\s*(.*?)\s*["\u201D\u201C\u00BB][^"\u201D\u201C\u00BB]*$/.exec(line);
    return (m ? m[1] : line).trim();
  }

  // → de citater, kontrollen har skrevet (højst MAX_QUOTES), ordret som de står
  function parseEvidence(text) {
    var str = String(text || "");
    var out = [];
    var m;
    EVIDENCE_RE.lastIndex = 0;
    while ((m = EVIDENCE_RE.exec(str)) && out.length < MAX_QUOTES) {
      var q = quoteBody(m[1]);
      if (q) out.push(q);
    }
    return out;
  }

  // Et citat må indeholde "…" eller "[…]" for udeladt tekst; hver del skal findes for sig, i rækkefølge.
  function quoteFound(quote, haystack) {
    var parts = String(quote).split(/\s*(?:\[\s*(?:\.{3}|\u2026)\s*\]|\.{3}|\u2026)\s*/).map(normText).filter(Boolean);
    if (!parts.length) return { found: false, tooShort: true };
    var longest = parts.reduce(function (a, b) { return Math.max(a, b.length); }, 0);
    if (longest < MIN_QUOTE_CHARS) return { found: false, tooShort: true }; // mindst én sammenhængende stump skal have vægt
    var from = 0;
    for (var i = 0; i < parts.length; i++) {
      var at = haystack.indexOf(parts[i], from);
      if (at < 0) return { found: false, tooShort: false };
      from = at + parts[i].length;
    }
    return { found: true, tooShort: false };
  }

  // reply: kontrolstolens svar; source: den tekst, kontrollen fik at vurdere.
  // → { status: "ok"|"none"|"missing", total, found, missing, short }   ("none": ingen citater; "missing": mindst ét findes ikke eller er for kort)
  function checkEvidence(reply, source) {
    var quotes = parseEvidence(reply);
    var hay = normText(source);
    var found = 0;
    var short = 0;
    quotes.forEach(function (q) {
      var r = quoteFound(q, hay);
      if (r.found) found += 1;
      else if (r.tooShort) short += 1;
    });
    var total = quotes.length;
    var status = total === 0 ? "none" : found === total ? "ok" : "missing";
    return { status: status, total: total, found: found, missing: total - found, short: short };
  }

  // Dommen med evt. krav om bevis. → parse()-resultatet; et PASS uden fuldt belagte citater bliver
  // { verdict: "unproven", reason, evidence } og regnes aldrig for bestået (et menneske afgør). null hvis ingen tydelig dom.
  function judge(reply, source, requireEvidence) {
    var v = parse(reply);
    if (!v || !requireEvidence || v.verdict !== "pass") return v;
    var ev = checkEvidence(reply, source);
    if (ev.status === "ok") return { verdict: "pass", reason: v.reason, evidence: ev };
    return { verdict: "unproven", reason: v.reason, evidence: ev };
  }

  // Finder den stol, en fejlet kontrol skal sende arbejdet tilbage til: først den rolle, kontrollen selv
  // anbefalede (👉 ROLLE), hvis den sidder tidligere i rækken; ellers nærmeste tidligere stol, der ikke selv kontrollerer.
  function SeatRef() {
    return typeof module === "object" && module.exports ? require("./seatref.js") : window.RundbordSeatRef;
  }

  function pickReworkTarget(seats, checkerIdx, suggestedRole) {
    var ref = SeatRef();
    if (String(suggestedRole || "").trim()) {
      // kun tidligere stole, der selv arbejder (ikke kontrolstole), kan få arbejdet tilbage; præcist navn først
      var eligible = [];
      for (var i = 0; i < checkerIdx; i++) if (!seats[i].checks) eligible.push({ name: seats[i].name, idx: i });
      var hit = ref.resolve(suggestedRole, eligible);
      if (hit.seat && (hit.how === "exact" || hit.how === "approx")) return hit.seat.idx;
    }
    for (var j = checkerIdx - 1; j >= 0; j--) {
      if (!seats[j].checks) return j;
    }
    return -1;
  }

  // Port før OUT: må resultatet gemmes? events er bordets hændelser for den aktuelle opgave (i rækkefølge).
  // Lukket, hvis den seneste kontrol i opgaven er FAIL/uklar og ikke bagefter er bestået eller overstyret.
  function outGate(events) {
    var state = "open";
    (events || []).forEach(function (e) {
      if (e.type === "check.passed") state = "open";
      else if (e.type === "check.failed" || e.type === "check.unclear" || e.type === "check.unproven") state = "closed";
      else if (e.type === "check.overridden") state = "open";
    });
    return state;
  }

  return { parse: parse, parseEvidence: parseEvidence, checkEvidence: checkEvidence, judge: judge, MIN_QUOTE_CHARS: MIN_QUOTE_CHARS, pickReworkTarget: pickReworkTarget, outGate: outGate };
});
