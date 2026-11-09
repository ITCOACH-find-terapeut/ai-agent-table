// OpenRouter: én nøgle, mange modeller. Ren logik: window.RundbordOpenRouter i appen, require() i node-tests.
// Her ligger kun tolkningen af OpenRouters modelliste og valget af modeller til en hurtig start. Selve kaldene sker i hovedprocessen.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordOpenRouter = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var BASE = "https://openrouter.ai/api/v1";

  function perMillion(x) {
    var n = Number(x);
    if (x === null || x === undefined || x === "" || !isFinite(n) || n < 0) return null;
    return Math.round(n * 1e6 * 10000) / 10000; // OpenRouter oplyser USD pr. token som tekst
  }

  // json: svaret fra GET /models. → [{ id, name, contextLength, inPerM, outPerM, vision, free }] sorteret efter id. Ukendt er null, aldrig 0.
  function parseModels(json) {
    var list = json && Array.isArray(json.data) ? json.data : [];
    return list
      .filter(function (m) {
        return m && typeof m.id === "string" && m.id;
      })
      .map(function (m) {
        var p = m.pricing || {};
        var inM = perMillion(p.prompt);
        var outM = perMillion(p.completion);
        var modalities = (m.architecture && m.architecture.input_modalities) || [];
        return {
          id: m.id,
          name: typeof m.name === "string" ? m.name : m.id,
          contextLength: typeof m.context_length === "number" ? m.context_length : null,
          inPerM: inM,
          outPerM: outM,
          vision: Array.isArray(modalities) && modalities.indexOf("image") >= 0,
          free: inM === 0 && outM === 0,
        };
      })
      .sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  // Kandidater pr. rolle, i prioriteret rækkefølge. De er gæt ud fra, hvad der plejer at findes: hver kandidat kontrolleres mod den levende
  // modelliste, så en forældet eller forkert kandidat bare springes over. Findes ingen, står pladsen tom, og brugeren vælger selv.
  var STARTER = [
    { role: "Clarifier", tier: "cheap", candidates: ["anthropic/claude-haiku-5.5", "anthropic/claude-haiku-4.5", "openai/gpt-4o-mini", "google/gemini-2.5-flash", "google/gemini-2.0-flash-001", "mistralai/mistral-small-3.2-24b-instruct"] },
    { role: "Builder", tier: "strong", candidates: ["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro", "openai/gpt-4o"] },
    { role: "Reviewer", tier: "mid", candidates: ["openai/gpt-4.1-mini", "google/gemini-2.5-flash", "anthropic/claude-haiku-4.5", "openai/gpt-4o-mini", "deepseek/deepseek-chat"] },
  ];

  function providerOf(id) {
    return String(id).split("/")[0];
  }

  // list: parseModels(...). → [{ role, tier, model|null, inPerM, outPerM, contextLength, vision, note }]
  // Pladserne får så vidt muligt modeller fra forskellige udbydere (så et bord ikke bliver tre gange den samme model i tre forklædninger).
  function buildStarter(list) {
    var byId = {};
    (list || []).forEach(function (m) {
      byId[m.id] = m;
    });
    var used = {};
    return STARTER.map(function (slot) {
      var present = slot.candidates.filter(function (id) {
        return byId[id] && !byId[id].free;
      });
      var fresh = present.filter(function (id) {
        return !used[providerOf(id)];
      });
      var pick = (fresh.length ? fresh : present)[0] || null;
      var m = pick ? byId[pick] : null;
      if (pick) used[providerOf(pick)] = true;
      return {
        role: slot.role,
        tier: slot.tier,
        model: pick,
        inPerM: m ? m.inPerM : null,
        outPerM: m ? m.outPerM : null,
        contextLength: m ? m.contextLength : null,
        vision: m ? m.vision : false,
        note: pick ? (fresh.length || !Object.keys(used).length ? "ok" : "sameProvider") : "notFound",
      };
    });
  }

  return { BASE: BASE, parseModels: parseModels, buildStarter: buildStarter, STARTER: STARTER, providerOf: providerOf };
});
