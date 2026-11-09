// Fejl fra en modeludbyder gjort forståelige: hvad gik galt (ugyldig nøgle, ingen credits, for mange kald, forkert model …), og hvad man kan gøre.
// Ren logik uden DOM/Electron. Udbyderens egen tekst bevares kort til sidst, så ingenting skjules, og kun credits/kvote får en egen fejlklasse
// ("credits"), fordi et nyt forsøg ikke hjælper dér. window.RundbordApiError i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordApiError = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var NAMES = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", groq: "Groq", mistral: "Mistral", xai: "xAI", deepseek: "DeepSeek", openrouter: "OpenRouter", custom: "" };

  // Hvor man ser sit forbrug og fylder op, for de udbydere, hvor stedet er kendt; ellers siges det generelt.
  var BILLING = {
    da: { anthropic: "Anthropic Console → Plans & Billing", openai: "OpenAI: Settings → Billing", openrouter: "OpenRouter: siden Credits", google: "Google AI Studio eller Google Cloud (Billing)", deepseek: "DeepSeek-platformen (Top up)" },
    en: { anthropic: "Anthropic Console → Plans & Billing", openai: "OpenAI: Settings → Billing", openrouter: "OpenRouter: the Credits page", google: "Google AI Studio or Google Cloud (Billing)", deepseek: "the DeepSeek platform (Top up)" },
  };

  var TEXT = {
    da: {
      auth: "Nøglen blev afvist af {p}: den er ugyldig, udløbet eller hører til en anden udbyder.",
      authHint: "Tjek, at hele nøglen er indsat uden mellemrum og passer til udbyderen, og lav om nødvendigt en ny.",
      forbidden: "{p} afviste anmodningen: nøglen har ikke adgang til det her (modellen, regionen eller en rettighed).",
      forbiddenHint: "Tjek nøglens rettigheder og at kontoen må bruge modellen.",
      credits: "{p}: kontoen har ikke flere credits, eller kvoten er brugt op.",
      creditsHint: "Fyld op eller tjek forbruget hos udbyderen{where}. Et nyt forsøg hjælper ikke, så kørslen prøver ikke igen.",
      rate: "{p} svarer, at der kommer for mange kald på én gang.",
      rateHint: "Vent lidt og prøv igen. Kørslen prøver selv igen et par gange.",
      model: "{p} kender ikke modellen, eller kontoen har ikke adgang til den.",
      modelHint: "Vælg en anden model i stolens panel (Hent modeller viser dem, nøglen kan bruge).",
      toolarge: "Beskeden er for lang til modellen.",
      toolargeHint: "Gør opgaven eller materialet i IN kortere, eller vælg en model med længere hukommelse.",
      overloaded: "{p} er overbelastet lige nu.",
      overloadedHint: "Prøv igen om lidt. Kørslen prøver selv igen et par gange.",
      server: "{p} har en fejl i sin egen tjeneste.",
      serverHint: "Det er ikke din nøgle. Prøv igen om lidt.",
      badrequest: "{p} afviste anmodningen som ugyldig.",
      badrequestHint: "Det kan være modellen, en indstilling eller materialet. Teksten fra udbyderen nedenfor siger mere.",
      other: "{p} svarede med en fejl.",
      otherHint: "",
      id: "anmodnings-id {id}",
      detail: "fra udbyderen",
    },
    en: {
      auth: "{p} rejected the key: it is invalid, expired or belongs to another provider.",
      authHint: "Check that the whole key is pasted without spaces and matches the provider, and create a new one if needed.",
      forbidden: "{p} refused the request: the key has no access to this (the model, the region or a permission).",
      forbiddenHint: "Check the key's permissions and that the account may use the model.",
      credits: "{p}: the account is out of credits, or the quota is used up.",
      creditsHint: "Top up or check usage with the provider{where}. Trying again will not help, so the run does not retry.",
      rate: "{p} says there are too many calls at once.",
      rateHint: "Wait a little and try again. The run retries by itself a couple of times.",
      model: "{p} does not know the model, or the account has no access to it.",
      modelHint: "Choose another model in the seat's panel (Fetch models lists those the key can use).",
      toolarge: "The message is too long for the model.",
      toolargeHint: "Make the task or the material in IN shorter, or choose a model with a longer memory.",
      overloaded: "{p} is overloaded right now.",
      overloadedHint: "Try again shortly. The run retries by itself a couple of times.",
      server: "{p} has a fault in its own service.",
      serverHint: "It is not your key. Try again shortly.",
      badrequest: "{p} rejected the request as invalid.",
      badrequestHint: "It may be the model, a setting or the material. The provider's text below says more.",
      other: "{p} answered with an error.",
      otherHint: "",
      id: "request id {id}",
      detail: "from the provider",
    },
  };

  // Udbyderens egen tekst: error.message (eller message) når JSON'en kan læses, ellers selve starten af teksten.
  function providerMessage(body) {
    var s = String(body == null ? "" : body);
    try {
      var j = JSON.parse(s);
      var e = j && (j.error !== undefined ? j.error : j);
      if (typeof e === "string") return e;
      if (e && typeof e.message === "string") return e.message;
      if (j && typeof j.message === "string") return j.message;
    } catch (err) {
      // en afkortet JSON kan stadig have en læsbar "message"
    }
    var m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(s);
    return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") : s;
  }

  function requestId(body) {
    var m = /\b(req_[A-Za-z0-9]+)/.exec(String(body || "")) || /"request_id"\s*:\s*"([A-Za-z0-9_-]{8,})/.exec(String(body || ""));
    return m ? m[1] : "";
  }

  function classify(status, body) {
    var s = Number(status);
    var b = String(body || "");
    if (s === 402 || /credit balance|insufficient[_ ]?(quota|balance|funds|credits)|exceeded your current quota|out of credits|used all (of )?(its |your )?(available )?credits|spending limit|add (more )?credits|payment required|billing (is )?(not|required|hard limit)|free_tier|quota exceeded for metric/i.test(b)) return "credits";
    if (s === 401 || /API_KEY_INVALID|api key not valid|invalid[ _-]?(x-)?api[ _-]?key|incorrect api key|invalid_api_key|authentication_error/i.test(b)) return "auth";
    if (s === 403) return "forbidden";
    if (s === 413 || /context[_ ]length|maximum context|too many tokens|prompt is too long|request too large|too large/i.test(b)) return "toolarge";
    if (s === 404 || (/model/i.test(b) && /not[ _]found|does not exist|not supported|no access|unknown/i.test(b))) return "model";
    if (s === 429) return "rate";
    if (s === 529 || /overloaded/i.test(b)) return "overloaded";
    if (s >= 500) return "server";
    if (s === 400 || s === 422) return "badrequest";
    return "other";
  }

  // → { kind, message }. message er klar til at vise: hvad der gik galt, hvad man kan gøre, og udbyderens egen tekst (kort) til sidst.
  function explain(opts) {
    opts = opts || {};
    var lang = opts.locale === "en" ? "en" : "da";
    var T = TEXT[lang];
    var status = Number(opts.status);
    var kind = classify(status, opts.body);
    var name = NAMES[opts.provider] !== undefined ? NAMES[opts.provider] : "";
    var p = name || (lang === "en" ? "The provider" : "Udbyderen");
    var where = BILLING[lang][opts.provider] ? " (" + BILLING[lang][opts.provider] + ")" : "";
    var head = (T[kind] || T.other).split("{p}").join(p);
    var hint = (T[kind + "Hint"] || "").split("{where}").join(where);
    var detail = providerMessage(opts.body).replace(/\s+/g, " ").trim().slice(0, 180);
    var id = requestId(opts.body);
    var tail = "HTTP " + (isFinite(status) ? status : "?") + (id ? " · " + T.id.replace("{id}", id) : "");
    var msg = head + (hint ? " " + hint : "") + " (" + tail + (detail ? " · " + T.detail + ": " + detail : "") + ")";
    return { kind: kind, message: msg };
  }


  // ---- ElevenLabs (stemmer): samme idé, egne årsager ----
  // Koderne kommer fra ElevenLabs' svarform { detail: { type, code, status, message, request_id } }. voice_disabled/voice_access_denied er set i en rigtig
  // fejl; de øvrige navne er den forventede form og dækkes også af ordene i teksten, så en ukendt kode falder tilbage til en almindelig besked.
  var VOICE_TEXT = {
    da: {
      voiceDisabled: "Stemmen er slået fra af sin ejer hos ElevenLabs.",
      voiceDisabledHint: "Vælg en anden stemme: ⚙ → Hele programmet → Stemme (til Tredje øje) eller i stolens panel. Brug ▶ Prøv for at høre, at den virker.",
      voiceNotFound: "ElevenLabs kender ikke stemmen. Den kan være slettet eller tilhøre en anden konto.",
      voiceNotFoundHint: "Vælg en anden stemme (Hent stemmer opdaterer listen).",
      quota: "Kontoen hos ElevenLabs har brugt sin kvote af tegn.",
      quotaHint: "Vent til kvoten nulstilles, eller opgradér hos ElevenLabs. Et nyt forsøg hjælper ikke.",
      badKey: "ElevenLabs afviste nøglen: den er ugyldig eller udløbet.",
      badKeyHint: "Indsæt en ny nøgle under ⚙ → Hele programmet → Stemme.",
      noPermission: "Nøglen har ikke tilladelse til det her hos ElevenLabs.",
      noPermissionHint: "Giv nøglen den manglende rettighed (fx tekst til tale eller tale til tekst), eller lav en ny.",
      plan: "Din plan hos ElevenLabs må ikke bruge denne stemme eller funktion.",
      planHint: "Vælg en af dine egne stemmer, eller opgradér planen.",
      rate: "ElevenLabs får for mange kald på én gang.",
      rateHint: "Vent lidt og prøv igen.",
      other: "ElevenLabs svarede med en fejl.",
      otherHint: "",
    },
    en: {
      voiceDisabled: "The voice has been disabled by its owner at ElevenLabs.",
      voiceDisabledHint: "Choose another voice: ⚙ → Whole app → Voice (for the Third Eye) or in the seat's panel. Use ▶ Try to hear that it works.",
      voiceNotFound: "ElevenLabs does not know the voice. It may have been deleted or belong to another account.",
      voiceNotFoundHint: "Choose another voice (Fetch voices updates the list).",
      quota: "The account at ElevenLabs has used its character quota.",
      quotaHint: "Wait for the quota to reset, or upgrade at ElevenLabs. Trying again will not help.",
      badKey: "ElevenLabs rejected the key: it is invalid or expired.",
      badKeyHint: "Paste a new key under ⚙ → Whole app → Voice.",
      noPermission: "The key is not allowed to do this at ElevenLabs.",
      noPermissionHint: "Give the key the missing permission (for example text to speech or speech to text), or make a new one.",
      plan: "Your plan at ElevenLabs may not use this voice or feature.",
      planHint: "Choose one of your own voices, or upgrade the plan.",
      rate: "ElevenLabs is getting too many calls at once.",
      rateHint: "Wait a little and try again.",
      other: "ElevenLabs answered with an error.",
      otherHint: "",
    },
  };

  function classifyVoice(status, body) {
    var s = Number(status);
    var b = String(body || "");
    if (/voice_disabled|voice_access_denied|disabled by the owner/i.test(b)) return "voiceDisabled";
    if (/voice_not_found|voice[^"]{0,40}not found|voice[^"]{0,40}does not exist/i.test(b)) return "voiceNotFound";
    if (/quota_exceeded|exceeded your .{0,30}quota|character limit|insufficient.{0,20}character/i.test(b)) return "quota";
    if (/missing_permissions|permission/i.test(b)) return "noPermission";
    if (s === 401 || /invalid_api_key/i.test(b)) return "badKey";
    if (s === 402 || /payment_required|paid plan|upgrade|free (tier|users?)|only available (to|for)/i.test(b)) return "plan";
    if (s === 429 || /too_many_concurrent|concurrent/i.test(b)) return "rate";
    if (s === 404) return "voiceNotFound";
    if (s === 403) return "noPermission";
    return "other";
  }

  // → { kind, message } som explain(), men for ElevenLabs. kind kan bruges til at pege på stemmevalget.
  function explainVoice(opts) {
    opts = opts || {};
    var lang = opts.locale === "en" ? "en" : "da";
    var T = VOICE_TEXT[lang];
    var status = Number(opts.status);
    var kind = classifyVoice(status, opts.body);
    var detail = providerMessage(opts.body).replace(/\s+/g, " ").trim().slice(0, 160);
    var id = requestId(opts.body);
    var tail = "HTTP " + (isFinite(status) ? status : "?") + (id ? " · " + TEXT[lang].id.replace("{id}", id) : "") + (detail ? " · " + TEXT[lang].detail + ": " + detail : "");
    return { kind: kind, message: T[kind] + (T[kind + "Hint"] ? " " + T[kind + "Hint"] : "") + " (" + tail + ")" };
  }

  return { explain: explain, classify: classify, providerMessage: providerMessage, explainVoice: explainVoice, classifyVoice: classifyVoice };
});
