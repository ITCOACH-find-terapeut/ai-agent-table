// Modelprofiler API: udbyder, adresse og nøgle sættes op ÉN gang globalt, og en stol peger på en profil (seat.modelId). Nøglen ligger kun i profilen.
// Ændrer du profilen, følger alle stole med. Modellen vælges på stolen; en profils model er kun en standard, som bruges, hvis stolen ingen har.
// Ren logik uden DOM/Electron/netværk. window.RundbordModels i appen, require() i main.js og node-tests.
//   profil: { id, name, provider, model (standard, valgfri), baseUrl, apiKey }
// En stol, der peger på en profil, får profilens udbyder, adresse og nøgle lagt over sine egne, når data hentes (overlay), og gemmes uden nøgle på disken (stripForSave).
// Nøglerne ligger stadig også i visningslaget, som i dag; registret fjerner kun gentagelsen, det skjuler ikke nøglerne.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordModels = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var PROVIDERS = ["anthropic", "openai", "google", "groq", "mistral", "xai", "deepseek", "openrouter", "custom"];
  var MAX_MODELS = 40;

  function str(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  }

  function normalizeOne(m) {
    if (!m || typeof m !== "object") return null;
    var id = str(m.id, 64);
    var provider = PROVIDERS.indexOf(m.provider) >= 0 ? m.provider : "";
    if (!id || !provider) return null;
    return {
      id: id,
      name: str(m.name, 60) || str(m.model, 60) || provider,
      provider: provider,
      model: str(m.model, 120),
      baseUrl: provider === "custom" ? str(m.baseUrl, 300) : "",
      apiKey: typeof m.apiKey === "string" ? m.apiKey.trim() : "",
    };
  }

  // Kun kendte felter og udbydere, unikke id'er, højst MAX_MODELS.
  function normalize(models) {
    var seen = {};
    return (Array.isArray(models) ? models : [])
      .map(normalizeOne)
      .filter(function (m) {
        if (!m || seen[m.id]) return false;
        seen[m.id] = true;
        return true;
      })
      .slice(0, MAX_MODELS);
  }

  function get(models, id) {
    if (!id) return null;
    return (models || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  // Stolen med profilens felter lagt over (en kopi). Peger den på en profil, der ikke findes, er den uændret (så intet går tabt).
  function overlay(seat, models) {
    var p = seat && seat.modelId ? get(models, seat.modelId) : null;
    if (!p) return seat;
    return Object.assign({}, seat, { provider: p.provider, model: str(seat.model, 120) || p.model, baseUrl: p.baseUrl, apiKey: p.apiKey });
  }

  // Standardprofilen: den, stole uden eget valg bruger. Først den, du har valgt (store.defaultModelId), ellers OpenRouter (én nøgle til mange modeller),
  // ellers den eneste profil med en nøgle. Uden nøgle i profilen er der ingen standard. → profilen eller null
  function defaultProfile(store) {
    var list = normalize(store && store.models).filter(function (m) { return m.apiKey; });
    var chosen = get(list, store && store.defaultModelId);
    if (chosen) return chosen;
    var openrouter = list.filter(function (m) { return m.provider === "openrouter"; })[0];
    if (openrouter) return openrouter;
    return list.length === 1 ? list[0] : null;
  }

  // En stol uden egen nøgle og uden valgt profil peger på standardprofilen, så man ikke skal sætte API på hver stol. Rører ikke en stol, der selv har en nøgle,
  // en lokal model (Anden adresse), eller en model, som standardprofilens udbyder ikke kan køre (fx en stol, der har valgt en anden udbyders model). → antal stole
  function linkToDefault(store) {
    var def = defaultProfile(store);
    var n = 0;
    if (!def) return n;
    Object.keys(store.boards || {}).forEach(function (bid) {
      (store.boards[bid].seats || []).forEach(function (s) {
        if (!s || s.modelId) return;
        if (typeof s.apiKey === "string" && s.apiKey.trim()) return;
        if (s.provider === "custom") return;
        if (str(s.model, 120) && s.provider !== def.provider) return;
        s.modelId = def.id;
        n += 1;
      });
    });
    return n;
  }

  // Lægger profilerne over alle stole i alle borde (på stedet). Bruges, når data hentes.
  function applyToStore(store) {
    linkToDefault(store);
    var models = normalize(store.models);
    Object.keys(store.boards || {}).forEach(function (bid) {
      var seats = store.boards[bid].seats || [];
      seats.forEach(function (s, i) {
        if (s && s.modelId) seats[i] = overlay(s, models);
      });
    });
    return store;
  }

  // En kopi af en stol, der skal gemmes: peger den på en profil, gemmes nøglen ikke på stolen (den ligger i profilen).
  function stripForSave(seat, models) {
    if (seat && seat.modelId && get(models, seat.modelId)) return Object.assign({}, seat, { apiKey: "" });
    return seat;
  }

  // Sletter en profil, men bevarer opsætningen på de stole, der pegede på den (de får profilens felter og peger ikke længere).
  function detachAndRemove(store, id) {
    var p = get(normalize(store.models), id);
    if (p) {
      Object.keys(store.boards || {}).forEach(function (bid) {
        (store.boards[bid].seats || []).forEach(function (s) {
          if (s && s.modelId === id) {
            s.provider = p.provider;
            s.model = str(s.model, 120) || p.model;
            s.baseUrl = p.baseUrl;
            s.apiKey = p.apiKey;
            delete s.modelId;
          }
        });
      });
    }
    store.models = normalize(store.models).filter(function (m) { return m.id !== id; });
    return store;
  }

  // Hvor mange stole peger på en profil (til advarsel ved sletning).
  function usage(store, id) {
    var n = 0;
    Object.keys(store.boards || {}).forEach(function (bid) {
      (store.boards[bid].seats || []).forEach(function (s) { if (s && s.modelId === id) n += 1; });
    });
    return n;
  }

  // Opretter eller opdaterer en profil. Tom nøgle ved en opdatering beholder den gamle (som i stolens panel). → ny liste
  function upsert(models, profile) {
    var list = normalize(models);
    var clean = normalizeOne(profile);
    if (!clean) return list;
    var idx = list.findIndex(function (m) { return m.id === clean.id; });
    if (idx >= 0) {
      if (!clean.apiKey) clean.apiKey = list[idx].apiKey;
      list[idx] = clean;
    } else if (list.length < MAX_MODELS) {
      list.push(clean);
    }
    return list;
  }


  var LABEL = { anthropic: "Anthropic", openai: "OpenAI", google: "Google (Gemini)", groq: "Groq", mistral: "Mistral", xai: "xAI (Grok)", deepseek: "DeepSeek", openrouter: "OpenRouter", custom: "Anden" };

  function hostOf(url) {
    var m = /^https?:\/\/([^\/:?#]+)/i.exec(String(url || ""));
    return m ? m[1] : "";
  }

  // Et navn til en ny profil: udbyderens navn, og med et tal bagefter, hvis der allerede er en med samme navn.
  function profileName(models, provider, baseUrl) {
    var base = LABEL[provider] || provider;
    if (provider === "custom" && hostOf(baseUrl)) base += " (" + hostOf(baseUrl) + ")";
    var taken = {};
    (models || []).forEach(function (m) { taken[m.name] = true; });
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + " " + n]) n += 1;
    return base + " " + n;
  }

  function nextId(models) {
    var used = {};
    (models || []).forEach(function (m) { used[m.id] = true; });
    var n = 1;
    while (used["model-" + n]) n += 1;
    return "model-" + n;
  }

  function sameConnection(p, provider, baseUrl, apiKey) {
    return p.provider === provider && p.apiKey === apiKey && (provider !== "custom" || p.baseUrl === baseUrl);
  }

  // Finder en profil med samme udbyder, adresse og nøgle, eller laver en ny. → { models, id } (id er tomt, hvis listen er fuld eller nøglen mangler)
  function ensureProfile(models, spec) {
    var list = normalize(models);
    var provider = PROVIDERS.indexOf(spec && spec.provider) >= 0 ? spec.provider : "";
    var apiKey = spec && typeof spec.apiKey === "string" ? spec.apiKey.trim() : "";
    var baseUrl = provider === "custom" ? str(spec.baseUrl, 300) : "";
    if (!provider || !apiKey) return { models: list, id: "" };
    var found = list.filter(function (m) { return sameConnection(m, provider, baseUrl, apiKey); })[0];
    if (found) return { models: list, id: found.id };
    if (list.length >= MAX_MODELS) return { models: list, id: "" };
    var id = nextId(list);
    list.push({ id: id, name: str(spec.name, 60) || profileName(list, provider, baseUrl), provider: provider, model: "", baseUrl: baseUrl, apiKey: apiKey });
    return { models: list, id: id };
  }

  // Flytter nøgler fra stole til profiler (på stedet, efter at nøglerne er dekrypteret): én profil pr. udbyder, adresse og nøgle, og stolen peger på den.
  // Stolens egen model bevares. En stol, hvis nøgle ikke kan læses (stadig krypteret), røres ikke. → { changed, created }
  function migrateSeatKeys(store) {
    var models = normalize(store.models);
    var before = models.length;
    var changed = false;
    Object.keys(store.boards || {}).forEach(function (bid) {
      (store.boards[bid].seats || []).forEach(function (s) {
        if (!s || s.modelId || typeof s.apiKey !== "string") return;
        var key = s.apiKey.trim();
        if (!key || key.indexOf("enc:v1:") === 0) return;
        var res = ensureProfile(models, { provider: s.provider, baseUrl: s.baseUrl, apiKey: key });
        models = res.models;
        if (res.id) {
          s.modelId = res.id;
          changed = true;
        }
      });
    });
    store.models = models;
    return { changed: changed, created: models.length - before };
  }

  // Stole, der ikke kan køre endnu: ingen profil (og ingen egen nøgle), profilen mangler nøgle, eller ingen model. → [{ id, name, reason: "profile"|"key"|"model" }]
  function missingApi(seats, models) {
    var list = normalize(models);
    return (seats || [])
      .map(function (s) {
        if (!s) return null;
        var p = s.modelId ? get(list, s.modelId) : null;
        var reason = "";
        if (p) {
          if (!p.apiKey) reason = "key";
          else if (!str(s.model, 120) && !p.model) reason = "model";
        } else if (typeof s.apiKey === "string" && s.apiKey.trim()) {
          if (!str(s.model, 120)) reason = "model";
        } else {
          reason = "profile";
        }
        return reason ? { id: s.id, name: s.name, reason: reason } : null;
      })
      .filter(Boolean);
  }

  return { PROVIDERS: PROVIDERS, normalize: normalize, get: get, defaultProfile: defaultProfile, linkToDefault: linkToDefault, overlay: overlay, applyToStore: applyToStore, stripForSave: stripForSave, detachAndRemove: detachAndRemove, usage: usage, upsert: upsert, ensureProfile: ensureProfile, migrateSeatKeys: migrateSeatKeys, missingApi: missingApi, profileName: profileName };
});
