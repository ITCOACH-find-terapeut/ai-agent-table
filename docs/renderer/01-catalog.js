// 01-catalog.js
// Roller, ikoner og de ti kognitive dials (rene katalog-data, ingen tilstand).

  var SLOTS = 8;
  var SWATCHES = ["denim", "moss", "plum", "ochre", "brick", "slate"];
  // Interne nøgler er uændrede (allerede gemte stole peger på dem), men de
  // faktiske farver bag hver nøgle er skiftet til en mere adskillelig palet —
  // så det synlige navn skal matche det, øjet faktisk ser. Selve navnet slås
  // op via t("color" + Key) — se locales/da.js / locales/en.js.
  var DEFAULT_MODEL = {
    anthropic: "claude-haiku-4-5-20251001",
    openai: "gpt-4o-mini",
    google: "gemini-3.1-flash-lite",
    groq: "llama-3.1-8b-instant",
    mistral: "mistral-small-latest",
    xai: "grok-2-latest",
    deepseek: "deepseek-chat",
    openrouter: "openai/gpt-4o-mini",
    custom: "",
  };
  var MODEL_SUGGESTIONS = {
    anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-fable-5-1"],
    openai: ["gpt-6-astra", "gpt-5", "gpt-5-mini", "gpt-4o-mini"],
    google: ["gemini-3.1-flash-lite", "gemini-3.5-ultra", "gemini-3.5-flash", "gemini-2.5-pro"],
    groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen-2.5-32b", "gemma2-9b-it"],
    mistral: ["mistral-large-3", "mistral-large-latest", "mistral-small-latest"],
    xai: ["grok-2-latest"],
    deepseek: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    openrouter: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-flash", "openai/gpt-4o-mini"],
    custom: [],
  };

  // Verificeret live 2026-09-17 (fulgt hvert link i browser til dets reelle
  // login/nøgle-side) — ikke gættet ud fra træningsdata. "custom" har
  // bevidst intet link, da udbyderen er brugerens egen.
  var PROVIDER_KEY_URL = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    google: "https://aistudio.google.com/apikey",
    groq: "https://console.groq.com/keys",
    mistral: "https://console.mistral.ai/api-keys/",
    xai: "https://console.x.ai/",
    deepseek: "https://platform.deepseek.com/api_keys",
    openrouter: "https://openrouter.ai/keys",
  };

  // Fra lib/vision.js (samme kilde som main.js selv bruger til afgørelsen) — hvilke udbydere
  // modellen faktisk kan SE billeder hos. Bruges kun til at undgå spildte IPC-kald og til at
  // vise en ærlig note i IN-panelet for stole, hvis udbyder ikke understøtter det.
  var IMAGE_CAPABLE_PROVIDERS = window.RundbordVision.VISION_PROVIDERS;

  // "group" peger på en locale-nøgle (se t()), ikke selve visningsteksten —
  // selve rollenavnene ("Orchestrator", "Researcher" osv.) forbliver
  // uoversatte på tværs af sprog, da de fungerer som en fælles, sproglig
  // neutral fagterminologi, ikke beskrivende dansk tekst.
  var ROLE_CATALOG = [
    { group: "roleGroupCore", roles: ["Orchestrator", "Router", "PM (Product)", "Communicator"] },
    { group: "roleGroupAnalysis", roles: ["Clarifier", "Researcher", "Architect", "Planner"] },
    { group: "roleGroupDev", roles: ["Builder", "Database", "Frontend", "Backend", "DevOps"] },
    { group: "roleGroupQA", roles: ["Tester", "Security", "Reviewer", "Evaluator"] },
    { group: "roleGroupKnowledge", roles: ["Documenter", "Memory", "Process Analyst", "Learning Agent"] },
    { group: "roleGroupSpecial", roles: ["UX Researcher", "API Specialist", "Performance", "Compliance", "Human"] },
    { group: "roleGroupOutput", roles: ["OUT Writer"] },
  ];

  var MANDATE_ICONS = [
    { key: "kan", icon: "✓", titleKey: "iconMandateKan" },
    { key: "foreslaa", icon: "?", titleKey: "iconMandateForeslaa" },
    { key: "ikke", icon: "⏸", titleKey: "iconMandateIkke" },
  ];
  var WORK_ICONS = [
    { key: "tanke", icon: "🧠", titleKey: "iconWorkTanke" },
    { key: "omtanke", icon: "♥", titleKey: "iconWorkOmtanke" },
    { key: "handling", icon: "👣", titleKey: "iconWorkHandling" },
  ];
  var INFO_ICONS = [
    { key: "sten", icon: "●", titleKey: "iconInfoSten" },
    { key: "papir", icon: "▤", titleKey: "iconInfoPapir" },
    { key: "saks", icon: "✂", titleKey: "iconInfoSaks" },
  ];

  // Ikonets visningstekst OG dets bidrag til AI-instruktionen er samme
  // streng (se iconInstructionLines nedenfor) — derfor slås den op via
  // locale, ikke en fast egenskab, ligesom dial-labels/-tilstande.
  function iconTitle(icon) {
    return t(icon.titleKey);
  }

  function defaultIcons() {
    return {
      mandate: "kan",
      work: { tanke: false, omtanke: false, handling: false },
      info: { sten: false, papir: false, saks: false },
    };
  }

  // --- De 10 kuraterede kognitive dials ---
  // Hver dial er ikke en separat motor — den er en parameter der genererer
  // et stykke af stolens systeminstruktion i almindeligt sprog. label og
  // stateLabels er her locale-NØGLER, ikke selve teksten — se dialLabel()/
  // dialStateLabel() nedenfor — fordi denne tekst både vises i UI'en OG
  // bliver kompileret direkte ind i det systemprompt modellen får.
  var DIALS = [
    {
      key: "reason",
      icon: "💭",
      labelKey: "dialReasonLabel",
      explainKey: "dialReasonExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: true,
      describe: function (state, strength) {
        if (state === "off") return null;
        if (state === "auto") return t("dialReasonAuto");
        return t("dialReasonOn", { strength: strength });
      },
    },
    {
      key: "challenge",
      icon: "⚔",
      labelKey: "dialChallengeLabel",
      explainKey: "dialChallengeExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: true,
      describe: function (state, strength) {
        if (state === "off") return null;
        if (state === "auto") return t("dialChallengeAuto");
        return t("dialChallengeOn", { strength: strength });
      },
    },
    {
      key: "curiosity",
      icon: "💡",
      labelKey: "dialCuriosityLabel",
      explainKey: "dialCuriosityExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: true,
      describe: function (state, strength) {
        if (state === "off") return null;
        return t("dialCuriosityOn", { strength: strength });
      },
    },
    {
      key: "risk",
      icon: "🚨",
      labelKey: "dialRiskLabel",
      explainKey: "dialRiskExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: true,
      describe: function (state, strength) {
        if (state === "off") return null;
        return t("dialRiskOn", { strength: strength });
      },
    },
    {
      key: "action",
      icon: "👣",
      labelKey: "dialActionLabel",
      explainKey: "dialActionExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialActionStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: true,
      describe: function (state, strength) {
        if (state === "off") return t("dialActionOff");
        return t("dialActionOn", { strength: strength });
      },
    },
    {
      key: "selfCheck",
      icon: "🪞",
      labelKey: "dialSelfCheckLabel",
      explainKey: "dialSelfCheckExplain",
      states: ["off", "on"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn" },
      hasStrength: false,
      describe: function (state) {
        if (state !== "on") return null;
        return t("dialSelfCheckOn");
      },
    },
    {
      key: "humanImpact",
      icon: "♥",
      labelKey: "dialHumanImpactLabel",
      explainKey: "dialHumanImpactExplain",
      states: ["off", "on", "auto"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn", auto: "dialStateAuto" },
      hasStrength: false,
      describe: function (state) {
        if (state === "off") return null;
        if (state === "auto") return t("dialHumanImpactAuto");
        return t("dialHumanImpactOn");
      },
    },
    {
      key: "uncertainty",
      icon: "❓",
      labelKey: "dialUncertaintyLabel",
      explainKey: "dialUncertaintyExplain",
      states: ["off", "on"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn" },
      hasStrength: false,
      describe: function (state) {
        if (state !== "on") return null;
        return t("dialUncertaintyOn");
      },
    },
    {
      key: "cost",
      icon: "💸",
      labelKey: "dialCostLabel",
      explainKey: "dialCostExplain",
      states: ["off", "on"],
      stateLabelKeys: { off: "dialStateOff", on: "dialStateOn" },
      hasStrength: false,
      describe: function (state) {
        if (state !== "on") return null;
        return t("dialCostOn");
      },
    },
    {
      key: "modifyRules",
      icon: "🔧",
      labelKey: "dialModifyRulesLabel",
      explainKey: "dialModifyRulesExplain",
      states: ["no", "suggest", "yes"],
      stateLabelKeys: { no: "dialModifyRulesStateNo", suggest: "dialModifyRulesStateSuggest", yes: "dialModifyRulesStateYes" },
      hasStrength: false,
      describe: function (state) {
        if (state === "no") return t("dialModifyRulesNo");
        if (state === "suggest") return t("dialModifyRulesSuggest");
        return t("dialModifyRulesYes");
      },
    },
  ];

  // De ti dials i fire grupper (kun præsentation; data og betydning er uændrede).
  var DIAL_GROUPS = [
    { key: "think", titleKey: "dialGroupThink", dials: ["reason", "curiosity", "selfCheck"] },
    { key: "critical", titleKey: "dialGroupCritical", dials: ["challenge", "risk", "uncertainty"] },
    { key: "action", titleKey: "dialGroupAction", dials: ["action", "humanImpact", "modifyRules"] },
    { key: "resources", titleKey: "dialGroupResources", dials: ["cost"] },
  ];

  function dialByKey(key) {
    return DIALS.filter(function (d) {
      return d.key === key;
    })[0];
  }

  // Dialens tilstand som tekst: "Til 7", "Efter behov", "Fra". Bruges af stolens detaljeboks og gruppernes oversigt.
  function dialStateText(seat, dial) {
    var dials = (seat && seat.dials) || {};
    var d = dials[dial.key] || {};
    var state = d.state || dial.states[0];
    var text = dialStateLabel(dial, state);
    if (dial.hasStrength && state !== "off" && state !== "no" && d.strength) text += " " + d.strength;
    return text;
  }

  function dialIsOn(seat, dial) {
    var d = ((seat && seat.dials) || {})[dial.key] || {};
    return Boolean(d.state && d.state !== "off" && d.state !== "no");
  }

  function dialLabel(dial) {
    return t(dial.labelKey);
  }

  function dialStateLabel(dial, stateKey) {
    return t(dial.stateLabelKeys[stateKey]);
  }

