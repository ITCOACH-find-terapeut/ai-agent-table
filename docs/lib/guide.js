// Startguide: fra en opgave i egne ord til et foreslået bord, uden at brugeren skal kende stole, dials eller tilvalg.
// To ting foreslås, og brugeren kan ændre hver af dem, før noget oprettes:
//   Bord       = en af skabelonerne (lib/templates.js), valgt ud fra opgaven (regler uden modelkald, eller Tredje øje, hvis brugeren beder om det).
//   Tænkning   = en forudindstilling (lib/addons.js: Hurtig, Grundig, Kritisk), ud fra hvor vigtigt det er, at svaret er rigtigt.
// Intet sendes nogen steder fra denne fil. En modelrespons accepteres kun, hvis den er et af de kendte valg (lukket liste); alt andet kasseres.
// Ren logik uden DOM, netværk og Electron. window.RundbordGuide i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordGuide = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var TEMPLATE_KEYS = ["facts", "pair", "scrum", "learning", "decision", "letter"];
  var PRESET_KEYS = ["fast", "thorough", "critical"];
  var MAX_TASK = 1500;
  var MAX_WHY = 200;

  // Spørgsmålet. Svarene er i stigende orden (første = mindst).
  var QUESTIONS = [{ key: "stakes", options: ["low", "mid", "high"] }];
  var DEFAULT_ANSWERS = { stakes: "mid" };

  function cleanAnswers(a) {
    var out = {};
    QUESTIONS.forEach(function (q) {
      out[q.key] = a && q.options.indexOf(a[q.key]) >= 0 ? a[q.key] : DEFAULT_ANSWERS[q.key];
    });
    return out;
  }

  // Hvor vigtigt det er, at svaret er rigtigt, afgør tænkningen.
  function presetFrom(answers) {
    var s = cleanAnswers(answers).stakes;
    return s === "high" ? "critical" : s === "mid" ? "thorough" : "fast";
  }

  // Regler, i denne rækkefølge: den første, der passer, vinder. Kun almindelige ord; ingen model, intet netværk. Danske stammer rammes også inde i sammensatte ord (lejekontrakt).
  var RULES = [
    { key: "letter", re: /(brev|afgørelse|påkrav|opsigelse|kontrakt|vilkår|\bletter from\b|\bnotice\b|\bcontract\b)/i },
    { key: "scrum", re: /\b(sprint|backlog|scrum|user stor(?:y|ies))\b/i },
    { key: "facts", re: /(er det rigtigt|passer det|er det sandt|myte|faktatjek|tjek (?:om|at)|is it true|fact.?check|\bmyth\b|is it correct)/i },
    { key: "decision", re: /(vælge mellem|skal jeg .{1,60}\beller\b|overvejer|fordele og ulemper|beslut|should i .{1,60}\bor\b|pros and cons|\bdecide\b|\bdecision\b|choose between)/i },
    { key: "learning", re: /(forstå|forklar|lære|hvordan virker|hvad er forskellen|understand|explain|learn\b|how does)/i },
    { key: "pair", re: /(\bkode\b|kildekode|\bprogram|\bapp\b|funktion|\bbug\b|\bscript\b|hjemmeside|\bwebsite\b|\bbuild\b|implement|\bcode\b|refaktor|refactor)/i },
  ];

  // → { template, why } hvor why er "rule:<nøgle>" eller "default" (ingen regel passede; Læring er det mest forsigtige udgangspunkt, fordi du tænker først)
  function templateFromTask(task) {
    var text = String(task || "");
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(text)) return { template: RULES[i].key, why: "rule:" + RULES[i].key };
    }
    return { template: "learning", why: "default" };
  }

  function cleanTask(task) {
    return String(task || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_TASK);
  }

  // Forslaget uden modelkald
  function suggest(task, answers) {
    var tpl = templateFromTask(task);
    return {
      template: tpl.template,
      templateWhy: tpl.why,
      preset: presetFrom(answers),
      presetWhy: "answers",
      source: "rules",
    };
  }

  // Det, der sendes til Tredje øje, hvis brugeren beder om det: kun opgaven og en kort liste over bordtyperne. Svarene på de tre spørgsmål sendes ikke.
  // templates: [{ key, name, desc }] fra lib/templates.js. → { system, user }
  function buildRequest(task, locale, templates) {
    var da = locale !== "en";
    var list = (templates || [])
      .filter(function (x) { return TEMPLATE_KEYS.indexOf(x.key) >= 0; })
      .map(function (x) { return "- " + x.key + ": " + x.name + " – " + x.desc; })
      .join("\n");
    var system = da
      ? "RUNDBORD-STARTGUIDE. Du hjælper en bruger med at vælge, hvordan et bord af AI-stole skal sættes op til hendes opgave. Svar KUN med ét JSON-objekt og ingen anden tekst, uden forklaring uden for JSON.\n" +
        'Form: {"template":"<nøgle>","preset":"<nøgle>","reasons":{"template":"<én kort sætning på dansk>","preset":"<én kort sætning på dansk>"}}\n' +
        "template skal være præcis en af disse nøgler:\n" + list + "\n" +
        "preset skal være præcis en af: fast (hurtig, billig, ingen ekstra kritik), thorough (grundig: ræsonnement, selvtjek, usikkerhed), critical (kritisk: grundig plus modsigelse og risikosans). Vælg critical kun, hvis fejl kan koste penge, helbred eller rettigheder.\n" +
        "Løs ikke selve opgaven. Hver begrundelse højst 160 tegn og skal nævne noget konkret fra opgaven."
      : "RUNDBORD-STARTGUIDE. You help a user choose how a table of AI seats should be set up for their task. Answer ONLY with one JSON object and no other text.\n" +
        'Form: {"template":"<key>","preset":"<key>","reasons":{"template":"<one short sentence in English>","preset":"<one short sentence in English>"}}\n' +
        "template must be exactly one of these keys:\n" + list + "\n" +
        "preset must be exactly one of: fast (quick, cheap, no extra criticism), thorough (reasoning, self-check, uncertainty), critical (thorough plus contradiction and risk sense). Choose critical only if mistakes could cost money, health or rights.\n" +
        "Do not solve the task itself. Each reason at most 160 characters and must mention something concrete from the task.";
    return { system: system, user: cleanTask(task) };
  }

  function cleanWhy(v) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_WHY);
  }

  // Tredje øjes svar → { template, preset (eller null), templateWhy, presetWhy } eller null. Kun kendte nøgler godtages.
  function parseReply(text) {
    var raw = String(text || "");
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    var obj;
    try {
      obj = JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
      return null;
    }
    if (!obj || typeof obj !== "object" || TEMPLATE_KEYS.indexOf(obj.template) < 0) return null;
    var reasons = obj.reasons && typeof obj.reasons === "object" ? obj.reasons : {};
    var preset = PRESET_KEYS.indexOf(obj.preset) >= 0 ? obj.preset : null;
    return {
      template: obj.template,
      preset: preset,
      templateWhy: cleanWhy(reasons.template),
      presetWhy: preset ? cleanWhy(reasons.preset) : "",
    };
  }

  // Forslaget med Tredje øjes valg lagt ovenpå (niveauet er altid brugerens eget). Mangler en begrundelse, bruges reglens.
  function withModel(base, parsed) {
    if (!parsed) return base;
    return {
      template: parsed.template,
      templateWhy: parsed.templateWhy ? "model:" + parsed.templateWhy : base.templateWhy,
      preset: parsed.preset || base.preset,
      presetWhy: parsed.preset && parsed.presetWhy ? "model:" + parsed.presetWhy : base.presetWhy,
      source: "model",
    };
  }

  // Groft overslag over tokens (tegn / 4) til prisvisningen før afsendelse. Det er et overslag og siges som et.
  function estimateTokens(text) {
    return Math.ceil(String(text || "").length / 4);
  }

  // Overslag over prisen i USD for ét kald: input-tokens fra teksten, ca. 150 output-tokens. Priserne er pr. million tokens. Ukendt pris → null.
  function estimateCostUsd(request, inPerM, outPerM) {
    if (typeof inPerM !== "number" || typeof outPerM !== "number" || !isFinite(inPerM) || !isFinite(outPerM)) return null;
    var inTokens = estimateTokens((request && request.system) || "") + estimateTokens((request && request.user) || "");
    return (inTokens * inPerM + 150 * outPerM) / 1e6;
  }

  // Forudindstillingen lægges kun OVENPÅ skabelonens egen opsætning: en dial, skabelonen har slået til, slås aldrig fra af forudindstillingen (en skabelons Skeptiker
  // skal blive ved med at udfordre, også på Hurtig), og er en dial slået til begge steder, gælder den højeste styrke.
  // original: stolens dials; applied: de samme dials efter lib/addons.js applyPreset; keys: de dials, forudindstillingen rører. → nye dials
  function mergeUp(original, applied, keys) {
    var out = JSON.parse(JSON.stringify(original || {}));
    (keys || []).forEach(function (k) {
      var a = applied && applied[k];
      if (!a || a.state !== "on") return;
      var o = out[k];
      if (o && o.state === "on") {
        if (a.strength != null || o.strength != null) o.strength = Math.max(Number(o.strength) || 0, Number(a.strength) || 0);
        return;
      }
      out[k] = JSON.parse(JSON.stringify(a));
    });
    return out;
  }

  // Det valg, der er foreslået, er altid et kendt valg (også efter ændringer fra brugerens egne vælgere)
  function validChoice(kind, value, fallback) {
    var list = kind === "template" ? TEMPLATE_KEYS : PRESET_KEYS;
    return list.indexOf(value) >= 0 ? value : fallback;
  }

  return {
    TEMPLATE_KEYS: TEMPLATE_KEYS, PRESET_KEYS: PRESET_KEYS, QUESTIONS: QUESTIONS, DEFAULT_ANSWERS: DEFAULT_ANSWERS, MAX_TASK: MAX_TASK,
    cleanAnswers: cleanAnswers, cleanTask: cleanTask, presetFrom: presetFrom, templateFromTask: templateFromTask, suggest: suggest,
    buildRequest: buildRequest, parseReply: parseReply, withModel: withModel, estimateTokens: estimateTokens, estimateCostUsd: estimateCostUsd, validChoice: validChoice, mergeUp: mergeUp,
  };
});
