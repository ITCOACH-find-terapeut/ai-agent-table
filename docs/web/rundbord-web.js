// FORSØG: webadapter. Laver den samme bro som preload.js (window.rundbord), men over browserens lager og fetch,
// så den eksisterende brugerflade kan køre uden Electron. Ingen server; nøglerne ligger i browserens lager.
// Kun det nødvendige er med: lager, Anthropic og OpenAI-kompatible udbydere (streaming), Beskyttelse med fail-closed,
// bordfil som download/upload. IN/OUT-mapper, git, stemme, PDF og automatiske priser er ikke med (se web/README.md).
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  // Indspillet demo (?demo=1): eget lager, så den aldrig rører en bruger egne borde, og ingen kald forlader siden.
  var DEMO = params.get("demo") === "1";
  var KEY = DEMO ? "rundbordet-web-demo" : "rundbordet-web-store";
  var MAX_MESSAGES = 300;
  var MAX_EVENTS = 2000;
  var MAX_CALLS = 500;
  var THEMES = ["system", "light", "dark"];
  // Kun til test: peg Anthropic-kald og OpenAI-kompatible kald på en anden adresse (fx en falsk server).
  var OPENAI_OVERRIDE = params.get("openaiBase");
  var ANTHROPIC_BASE = params.get("anthropicBase") || "https://api.anthropic.com";
  var OPENAI_BASES = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    mistral: "https://api.mistral.ai/v1",
    xai: "https://api.x.ai/v1",
    deepseek: "https://api.deepseek.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
  };

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2);
  }
  function now() {
    return new Date().toISOString();
  }

  // ---- lager ----
  var memoryFallback = null;
  function newBoard(name) {
    return {
      id: uid(), projectName: name || "Nyt bord", githubUrl: "", githubToken: "", seats: [], messages: [],
      turn: { seatId: null, reason: "", at: null }, proposals: [], events: [], handoffMode: "full", freshRuns: true, mandateGate: true, ownTakeFirst: false, envelopePreview: false, edges: {},
      shield: { enabled: false, terms: [], allow: [], mapping: {} },
    };
  }
  function normalize(s) {
    if (!s || typeof s !== "object" || !s.boards || !Object.keys(s.boards).length) {
      var b = newBoard("My table"); // webudgavens standardsprog er engelsk
      s = { activeBoardId: b.id, boards: {} };
      s.boards[b.id] = b;
    }
    if (!s.boards[s.activeBoardId]) s.activeBoardId = Object.keys(s.boards)[0];
    if (!s.priceTable || typeof s.priceTable !== "object") s.priceTable = {};
    if (s.locale !== "da") s.locale = "en"; // webudgavens standardsprog er engelsk
    if (THEMES.indexOf(s.theme) < 0) s.theme = "system";
    if (typeof s.elevenLabsKey !== "string") s.elevenLabsKey = "";
    s.models = window.RundbordModels.normalize(s.models);
    s.schemaVersion = 3;
    Object.keys(s.boards).forEach(function (id) {
      var b = s.boards[id];
      ["messages", "proposals", "events", "seats"].forEach(function (k) {
        if (!Array.isArray(b[k])) b[k] = [];
      });
      if (!b.turn || typeof b.turn !== "object") b.turn = { seatId: null, reason: "", at: null };
      if (b.handoffMode !== "structured") b.handoffMode = "full";
      if (!b.shield || typeof b.shield !== "object") b.shield = {};
      b.shield.enabled = b.shield.enabled === true;
      b.shield.terms = window.RundbordShield.normalizeTerms(b.shield.terms);
      b.shield.allow = window.RundbordShield.normalizeAllow(b.shield.allow);
      if (!b.shield.mapping || typeof b.shield.mapping !== "object") b.shield.mapping = {};
    });
    return s;
  }
  // Webbygget gør de mørke farver til en attribut (data-theme), fordi en side ikke selv kan tvinge prefers-color-scheme.
  function applyLang(locale) {
    document.documentElement.lang = locale === "da" ? "da" : "en";
  }
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      raw = memoryFallback;
    }
    var parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (e) {}
    if (!parsed && DEMO && window.RundbordDemo) parsed = window.RundbordDemo.seedStore(newBoard, params.get("lang") === "da" ? "da" : "en");
    var fresh = !parsed;
    var s = normalize(parsed);
    window.RundbordModels.applyToStore(s);
    // Første besøg: gem startlageret med det samme. Ellers får tavlen et nyt tilfældigt id ved hvert opslag,
    // og alle senere ændringer rammer en tavle, der ikke findes.
    if (fresh || !raw) save(s);
    return s;
  }
  function save(s) {
    var text = JSON.stringify(s);
    try {
      localStorage.setItem(KEY, text);
    } catch (e) {
      memoryFallback = text;
    }
    return s;
  }
  function mutate(boardId, fn) {
    var s = load();
    var b = s.boards[boardId];
    if (!b) return s;
    fn(b, s);
    return save(s);
  }
  function logEvent(board, evt) {
    if (!board || !evt || typeof evt.type !== "string") return;
    board.events.push({
      id: uid(), at: now(), type: evt.type.slice(0, 60), seatId: evt.seatId || null, runId: evt.runId || null,
      taskId: evt.taskId || null, refMessageId: evt.refMessageId || null, data: evt.data && typeof evt.data === "object" ? evt.data : {},
    });
    if (board.events.length > MAX_EVENTS) board.events = board.events.slice(-MAX_EVENTS);
  }

  // ---- hjælpere ----
  function classifyError(message) {
    var m = String(message || "");
    if (/Ingen API-nøgle|No API key/i.test(m)) return "no_key";
    var http = m.match(/HTTP\s*(\d{3})/i);
    if (http) return "http_" + http[1];
    if (/timeout|timed out|Intet svar|No response/i.test(m)) return "timeout";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "network";
    return "other";
  }
  function download(name, content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type || "text/plain" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }
  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return resolve({ ok: false, canceled: true });
        if (f.size > 1000000) return resolve({ ok: false, message: L("Filen er for stor.", "The file is too large.") });
        f.text().then(function (text) {
          resolve({ ok: true, text: text, name: f.name });
        });
      };
      input.oncancel = function () {
        resolve({ ok: false, canceled: true });
      };
      input.click();
    });
  }
  function L(da, en) {
    return load().locale === "da" ? da : en;
  }
  function notInWeb() {
    return { ok: false, message: L("Ikke med i webudgaven endnu.", "Not in the web version yet.") };
  }

  // ---- modelkald ----
  var streamListeners = [];
  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 15000);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .catch(function (e) {
        if (e && e.name === "AbortError") throw new Error(L("Intet svar fra udbyderen inden for 15 sekunder.", "No response from the provider within 15 seconds."));
        throw e;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }
  function readSSE(res, onEvent) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    function step() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buffer += decoder.decode(r.value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        var idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          var raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          var lines = raw.split("\n").filter(function (l) {
            return l.indexOf("data:") === 0;
          });
          if (!lines.length) continue;
          var data = lines.map(function (l) { return l.slice(5).trim(); }).join("\n");
          if (data === "[DONE]") continue;
          try {
            onEvent(JSON.parse(data));
          } catch (e) {}
        }
        return step();
      });
    }
    return step();
  }
  function emit(requestId, delta) {
    streamListeners.slice().forEach(function (cb) {
      cb({ requestId: requestId, delta: delta });
    });
  }
  function chatAnthropic(requestId, seat, history, systemPrompt) {
    var body = { model: seat.model, max_tokens: 1024, messages: history, stream: true };
    if (systemPrompt) body.system = systemPrompt;
    return fetchWithTimeout(ANTHROPIC_BASE + "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json", "x-api-key": seat.apiKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true", // browseren er kun et ekstra lag; nøglen er brugerens egen
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          return { ok: false, message: "HTTP " + res.status + ": " + t.slice(0, 200) };
        });
      }
      var reply = "", modelId = seat.model, inTok = 0, outTok = 0, cached = 0;
      return readSSE(res, function (evt) {
        if (evt.type === "content_block_delta" && evt.delta && typeof evt.delta.text === "string") {
          reply += evt.delta.text;
          emit(requestId, evt.delta.text);
        } else if (evt.type === "message_start" && evt.message) {
          modelId = evt.message.model || modelId;
          if (evt.message.usage) {
            inTok = evt.message.usage.input_tokens || 0;
            cached = (evt.message.usage.cache_read_input_tokens || 0) + (evt.message.usage.cache_creation_input_tokens || 0);
          }
        } else if (evt.type === "message_delta" && evt.usage) {
          outTok = evt.usage.output_tokens || 0;
        }
      }).then(function () {
        return { ok: true, reply: reply, usage: { modelId: modelId, inputTokens: inTok, outputTokens: outTok, cachedTokens: cached } };
      });
    });
  }
  function chatOpenAI(requestId, baseUrl, seat, history, systemPrompt) {
    var messages = systemPrompt ? [{ role: "system", content: systemPrompt }].concat(history) : history;
    return fetchWithTimeout(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + seat.apiKey },
      body: JSON.stringify({ model: seat.model, max_tokens: 1024, messages: messages, stream: true, stream_options: { include_usage: true } }),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          return { ok: false, message: "HTTP " + res.status + ": " + t.slice(0, 200) };
        });
      }
      var reply = "", modelId = seat.model, inTok = 0, outTok = 0, cached = 0;
      return readSSE(res, function (evt) {
        var delta = evt.choices && evt.choices[0] && evt.choices[0].delta && evt.choices[0].delta.content;
        if (delta) {
          reply += delta;
          emit(requestId, delta);
        }
        if (evt.model) modelId = evt.model;
        if (evt.usage) {
          inTok = evt.usage.prompt_tokens || 0;
          outTok = evt.usage.completion_tokens || 0;
          cached = (evt.usage.prompt_tokens_details && evt.usage.prompt_tokens_details.cached_tokens) || 0;
        }
      }).then(function () {
        return { ok: true, reply: reply, usage: { modelId: modelId, inputTokens: inTok, outputTokens: outTok, cachedTokens: cached } };
      });
    });
  }
  // Indspillet demo: svaret er skrevet på forhånd og vises med streaming-effekt. Intet kald forlader siden.
  function runDemo(requestId, seat, history, systemPrompt) {
    var r = window.RundbordDemo.respond(seat, history, systemPrompt, load().locale);
    var text = r.text;
    // Afspilning efter TID, ikke efter antal timere: en skjult fane eller en browser uden vindueshåndtering sænker timere til ca. 1 Hz,
    // og så ville et langt svar tage minutter. Her tager det altid kun omkring ét sekund.
    var t0 = Date.now();
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        var target = Math.min(text.length, Math.floor((Date.now() - t0) * 0.7)); // ca. 700 tegn i sekundet
        if (target > i) {
          emit(requestId, text.slice(i, target));
          i = target;
        }
        if (i >= text.length) {
          resolve({ ok: true, reply: text, usage: { modelId: "demo", inputTokens: 300, outputTokens: Math.round(text.length / 4), cachedTokens: 0 } });
          return;
        }
        setTimeout(step, 20);
      })();
    });
  }
  function runChat(requestId, seat, history, systemPrompt) {
    if (DEMO) return runDemo(requestId, seat, history, systemPrompt);
    if (!seat || !seat.apiKey) return Promise.resolve({ ok: false, message: L("Ingen API-nøgle angivet.", "No API key entered.") });
    if (!history || !history.length) return Promise.resolve({ ok: false, message: L("Ingen besked at sende.", "No message to send.") });
    if (seat.provider === "anthropic") return chatAnthropic(requestId, seat, history, systemPrompt);
    if (seat.provider === "google") return Promise.resolve({ ok: false, message: L("Google er ikke med i webforsøget endnu.", "Google is not in the web trial yet.") });
    var base = OPENAI_OVERRIDE || (seat.provider === "custom" ? seat.baseUrl : OPENAI_BASES[seat.provider]);
    if (!base) return Promise.resolve({ ok: false, message: seat.provider === "custom" ? L("Angiv en base-URL for den brugerdefinerede udbyder.", "Enter a base URL for the custom provider.") : L("Ukendt udbyder.", "Unknown provider.") });
    return chatOpenAI(requestId, base, seat, history, systemPrompt);
  }
  function timed(run) {
    var t0 = Date.now();
    return Promise.resolve()
      .then(run)
      .catch(function (e) {
        return { ok: false, message: String((e && e.message) || e) };
      })
      .then(function (res) {
        res.durationMs = Date.now() - t0;
        if (!res.ok && !res.errorKind) res.errorKind = classifyError(res.message);
        return res;
      });
  }
  // Samme sikkerhedsnet som main.js: tekst, der ikke er skjult eller afgjort, sendes aldrig (fail-closed).
  function shieldCheck(boardId, history, systemPrompt) {
    var board = load().boards[boardId];
    if (!board || !board.shield.enabled) return { active: false, leaked: 0 };
    var S = window.RundbordShield;
    var state = S.newState(board.shield);
    var texts = [systemPrompt].concat((history || []).map(function (m) { return m.content; }));
    var leaked = texts.reduce(function (n, t) { return n + S.leaks(t, state).length; }, 0);
    if (leaked) {
      mutate(boardId, function (b) {
        logEvent(b, { type: "shield.blocked", data: { leaks: leaked } });
      });
    }
    return { active: true, leaked: leaked };
  }

  // ---- broen ----
  var api = {
    getStore: function () { return Promise.resolve(load()); },
    createBoard: function (name) {
      var s = load();
      var b = newBoard(name);
      s.boards[b.id] = b;
      s.activeBoardId = b.id;
      return Promise.resolve(save(s));
    },
    switchBoard: function (id) {
      var s = load();
      if (s.boards[id]) s.activeBoardId = id;
      return Promise.resolve(save(s));
    },
    updateBoard: function (id, patch) {
      return Promise.resolve(mutate(id, function (b) {
        if (typeof patch.projectName === "string") b.projectName = patch.projectName.trim() || "Unavngivet bord";
        if (typeof patch.githubUrl === "string") b.githubUrl = patch.githubUrl.trim();
        if (typeof patch.githubToken === "string") b.githubToken = patch.githubToken.trim();
        if (patch.handoffMode === "full" || patch.handoffMode === "structured") b.handoffMode = patch.handoffMode;
        if (patch.routing && typeof patch.routing === "object") b.routing = window.RundbordRouting.applySettingsPatch(b.routing, patch.routing);
        if (patch.rounds && typeof patch.rounds === "object") b.rounds = window.RundbordRounds.applyPatch(b.rounds, patch.rounds);
        if (typeof patch.freshRuns === "boolean") b.freshRuns = patch.freshRuns;
        if (typeof patch.requireEvidence === "boolean") b.requireEvidence = patch.requireEvidence;
        if (typeof patch.mandateGate === "boolean") b.mandateGate = patch.mandateGate;
        if (typeof patch.ownTakeFirst === "boolean") b.ownTakeFirst = patch.ownTakeFirst;
        if (typeof patch.envelopePreview === "boolean") b.envelopePreview = patch.envelopePreview;
        if (patch.edges && typeof patch.edges === "object") b.edges = window.RundbordEdges.normalize(patch.edges, b.seats.map(function (s) { return s.id; }));
        if (["auto", "round", "compact", "list"].indexOf(patch.view) >= 0) b.view = patch.view;
        if (typeof patch.strategyId === "string") {
          var known = window.RundbordStrategy.starters("da").some(function (x) { return x.id === patch.strategyId; }) || (load().strategies || []).some(function (x) { return x.id === patch.strategyId; });
          b.strategyId = known ? patch.strategyId : "";
        }
        if ("maxRunCostUsd" in patch) {
          var n = Number(patch.maxRunCostUsd);
          if (patch.maxRunCostUsd === "" || patch.maxRunCostUsd === null || !isFinite(n) || n <= 0) delete b.maxRunCostUsd;
          else b.maxRunCostUsd = Math.round(n * 10000) / 10000;
        }
      }));
    },
    saveModel: function (profile) {
      var s = load();
      var p = Object.assign({}, profile && typeof profile === "object" ? profile : {});
      if (!p.id) p.id = "model-" + uid().slice(0, 8);
      s.models = window.RundbordModels.upsert(s.models, p);
      window.RundbordModels.applyToStore(s);
      return Promise.resolve(save(s));
    },
    deleteModel: function (id) {
      var s = load();
      window.RundbordModels.detachAndRemove(s, String(id || ""));
      return Promise.resolve(save(s));
    },
    saveRole: function (role) {
      var s = load();
      s.roles = window.RundbordRoles.upsert(s.roles, role && typeof role === "object" ? role : {});
      return Promise.resolve(save(s));
    },
    setRoleDefault: function (concept, preset) {
      var s = load();
      var key = String(concept || "").slice(0, 40);
      var next = Object.assign({}, window.RundbordRoleDefaults.normalize(s.roleDefaults));
      if (!key) return Promise.resolve(save(s));
      if (preset && typeof preset === "object") next[key] = window.RundbordRoleDefaults.normalizeOne(preset);
      else delete next[key];
      s.roleDefaults = next;
      return Promise.resolve(save(s));
    },
    deleteRole: function (id) {
      var s = load();
      s.roles = window.RundbordRoles.remove(s.roles, String(id || ""));
      return Promise.resolve(save(s));
    },
    saveStrategy: function (raw) {
      var s = load();
      var v = window.RundbordStrategy.validate(raw);
      if (!v.ok) return Promise.resolve(s);
      var st = v.strategy;
      if (window.RundbordStrategy.starters("da").some(function (x) { return x.id === st.id; })) st.id = "";
      if (!st.id) st.id = "egen-" + uid().slice(0, 8);
      delete st.builtin;
      var list = s.strategies || [];
      var i = list.findIndex(function (x) { return x.id === st.id; });
      if (i >= 0) list[i] = st;
      else if (list.length < 40) list.push(st);
      s.strategies = list;
      return Promise.resolve(save(s));
    },
    deleteStrategy: function (id) {
      var s = load();
      s.strategies = (s.strategies || []).filter(function (x) { return x.id !== id; });
      Object.keys(s.boards).forEach(function (k) { if (s.boards[k].strategyId === id) s.boards[k].strategyId = ""; });
      return Promise.resolve(save(s));
    },
    setTheme: function (t) {
      var s = load();
      s.theme = THEMES.indexOf(t) >= 0 ? t : "system";
      applyTheme(s.theme);
      return Promise.resolve(save(s));
    },
    setEyeFloat: function (value) {
      var s = load();
      s.eyeFloat = window.RundbordEye.normalizeVisible(value);
      return Promise.resolve(save(s));
    },
    setEyeIntroSeen: function (seen) {
      var s = load();
      s.eyeIntroSeen = seen === true;
      return Promise.resolve(save(s));
    },
    setWaitStyle: function (style) {
      var s = load();
      s.waitStyle = window.RundbordWaitLayer.normalize(style);
      return Promise.resolve(save(s));
    },
    setThirdEyeModel: function (id) {
      var s = load();
      var wanted = String(id || "");
      s.thirdEyeModelId = (s.models || []).some(function (m) { return m.id === wanted; }) ? wanted : "";
      return Promise.resolve(save(s));
    },
    setWelcomeSeen: function () {
      return Promise.resolve(load()); // webudgaven har sin egen velkomst (web/welcome.js)
    },
    setLocale: function (l) {
      var s = load();
      s.locale = l === "da" ? "da" : "en";
      applyLang(s.locale);
      return Promise.resolve(save(s));
    },
    setMemory: function (id, items) {
      return Promise.resolve(mutate(id, function (b) {
        var before = Array.isArray(b.memory) ? b.memory.length : 0;
        b.memory = window.RundbordMemory.normalize(items);
        logEvent(b, { type: "memory.changed", data: { before: before, count: b.memory.length } });
      }));
    },
    openDemo: function () {
      return Promise.resolve({ ok: false }); // webudgaven har sin egen demo (web/welcome.js)
    },
    openHelp: function (anchor) {
      window.open("help/dist/manual." + load().locale + ".html" + (anchor ? "#" + anchor : ""), "_blank", "noopener");
      return Promise.resolve({ ok: true });
    },
    getAppInfo: function () {
      return Promise.resolve({ version: DEMO ? "web-demo" : "web-forsøg", revision: "web", demo: DEMO, platform: "web", secretsEncrypted: false, secretsBackend: "browser" });
    },
    deleteBoard: function (id) {
      var s = load();
      if (Object.keys(s.boards).length <= 1) return Promise.resolve(s);
      delete s.boards[id];
      if (s.activeBoardId === id) s.activeBoardId = Object.keys(s.boards)[0];
      return Promise.resolve(save(s));
    },
    duplicateBoard: function (id) {
      var s = load();
      var source = s.boards[id];
      if (!source) return Promise.resolve(s);
      var names = Object.keys(s.boards).map(function (k) { return s.boards[k].projectName; });
      var name = window.RundbordBoardCopy.uniqueName(names, source.projectName, s.locale === "en" ? "copy" : "kopi");
      var copy = window.RundbordBoardCopy.duplicate(source, { name: name, makeId: uid });
      logEvent(copy, { type: "board.duplicated", data: { seats: (copy.seats || []).length } });
      s.boards[copy.id] = copy;
      s.activeBoardId = copy.id;
      return Promise.resolve(save(s));
    },
    restoreBoardBackup: function (id, data) {
      var d = data && typeof data === "object" ? data : {};
      mutate(id, function (b) {
        var byName = {};
        (b.seats || []).forEach(function (seat) { if (seat.name && !(seat.name in byName)) byName[seat.name] = seat.id; });
        var now = new Date().toISOString();
        b.messages = (Array.isArray(d.messages) ? d.messages : []).slice(-300).map(function (m) {
          if (!m || typeof m !== "object") return null;
          var text = String(m.text == null ? "" : m.text).slice(0, 200000);
          if (!text.trim()) return null;
          var entry = {
            id: uid(),
            seatId: typeof m.seat === "string" && Object.prototype.hasOwnProperty.call(byName, m.seat) ? byName[m.seat] : null,
            role: m.role === "assistant" || m.role === "system" ? m.role : "user",
            text: text.trim(),
            at: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(String(m.at || "")) ? String(m.at).slice(0, 40) : now,
          };
          var meta = {};
          if (m.talk === true) meta.talk = true;
          if (typeof m.kind === "string" && m.kind) meta.kind = m.kind.slice(0, 40);
          if (Object.keys(meta).length) entry.meta = meta;
          return entry;
        }).filter(Boolean);
        b.memory = window.RundbordMemory.normalize(d.memory);
        logEvent(b, { type: "board.restored", data: { messages: b.messages.length, memory: b.memory.length } });
      });
      return Promise.resolve(load());
    },
    addEvent: function (id, evt) {
      mutate(id, function (b) { logEvent(b, evt); });
      return Promise.resolve(true);
    },
    getEvents: function (id) {
      var b = load().boards[id];
      return Promise.resolve(b ? b.events : []);
    },
    exportEvents: function (id) {
      var b = load().boards[id];
      if (!b) return Promise.resolve({ ok: false });
      download("rundbordet-maalinger.json", JSON.stringify({ exportedAt: now(), board: { projectName: b.projectName }, events: b.events }, null, 2), "application/json");
      return Promise.resolve({ ok: true });
    },
    saveTextFile: function (name, content) {
      download(String(name || "rundbordet.txt"), String(content), "application/json");
      return Promise.resolve({ ok: true, path: String(name) });
    },
    openTextFile: function (ext) { return pickFile("." + (ext || "json")); },
    addMessage: function (id, seatId, text, role, meta) {
      return Promise.resolve(mutate(id, function (b) {
        if (!text || !String(text).trim()) return;
        var entry = { id: uid(), seatId: seatId, role: role === "assistant" || role === "system" ? role : "user", text: String(text).trim(), at: now() };
        if (meta && typeof meta === "object") entry.meta = meta;
        b.messages.push(entry);
        if (b.messages.length > MAX_MESSAGES) b.messages = b.messages.slice(-MAX_MESSAGES);
      }));
    },
    clearTalk: function (id) {
      return Promise.resolve(mutate(id, function (b) { b.messages = b.messages.filter(function (m) { return !(m.meta && m.meta.talk); }); }));
    },
    clearBoardMessages: function (id) {
      return Promise.resolve(mutate(id, function (b) { b.messages = []; b.turn = { seatId: null, reason: "", at: null }; }));
    },
    setMessageMeta: function (id, msgId, patch) {
      return Promise.resolve(mutate(id, function (b) {
        var m = b.messages.filter(function (x) { return x.id === msgId; })[0];
        if (!m || !patch || typeof patch !== "object") return;
        var was = Boolean(m.meta && m.meta.needResolved);
        m.meta = Object.assign({}, m.meta, patch);
        if (patch.needResolved && !was) logEvent(b, { type: "need.resolved", seatId: m.seatId, taskId: m.meta.taskId, refMessageId: msgId, data: { by: "user" } });
      }));
    },
    setTurn: function (id, seatId, reason) {
      return Promise.resolve(mutate(id, function (b) { b.turn = { seatId: seatId || null, reason: reason || "", at: now() }; }));
    },
    createProposal: function (id, seatId, text, meta) {
      return Promise.resolve(mutate(id, function (b) {
        if (!text || !String(text).trim()) return;
        var recommendedSeatId = meta && b.seats.some(function (s) { return s.id === meta.recommendedSeatId; }) ? meta.recommendedSeatId : null;
        var draftSource = meta && ["selection", "reply", "need", "readback"].indexOf(meta.draftSource) >= 0 ? meta.draftSource : null;
        b.proposals.push({ id: uid(), seatId: seatId, text: String(text).trim(), createdAt: now(), recommendedSeatId: recommendedSeatId, draftSource: draftSource });
        logEvent(b, { type: "proposal.flagged", seatId: seatId, data: { chars: String(text).trim().length, source: draftSource } });
      }));
    },
    approveProposal: function (id, pid, finalText, targetSeatId) {
      return Promise.resolve(mutate(id, function (b) {
        var p = b.proposals.filter(function (x) { return x.id === pid; })[0];
        if (!p) return;
        var targetId = targetSeatId && b.seats.some(function (s) { return s.id === targetSeatId; }) ? targetSeatId : p.seatId;
        var seat = b.seats.filter(function (s) { return s.id === targetId; })[0];
        if (seat) {
          var text = String(finalText || p.text || "").trim();
          var prev = JSON.parse(JSON.stringify(seat));
          seat.customInstruction = seat.customInstruction ? seat.customInstruction + "\n" + text : text;
          var entry = window.RundbordSeatHistory.makeEntry({ before: prev, after: seat, source: "proposal", id: uid(), now: now() });
          seat.history = window.RundbordSeatHistory.record(prev.history, entry);
        }
        b.proposals = b.proposals.filter(function (x) { return x.id !== pid; });
        logEvent(b, { type: "proposal.approved", seatId: p.seatId, data: { edited: Boolean(finalText && finalText.trim() !== p.text) } });
      }));
    },
    dismissProposal: function (id, pid) {
      return Promise.resolve(mutate(id, function (b) {
        var p = b.proposals.filter(function (x) { return x.id === pid; })[0];
        b.proposals = b.proposals.filter(function (x) { return x.id !== pid; });
        if (p) logEvent(b, { type: "proposal.dismissed", seatId: p.seatId, data: {} });
      }));
    },
    saveSeat: function (id, seat, meta) {
      return Promise.resolve(mutate(id, function (b) {
        var idx = b.seats.findIndex(function (s) { return s.id === seat.id; });
        // Ikoner og dials gemmes aldrig uenige (samme regler som i skrivebordsversionens hovedproces, lib/seatsync.js)
        var synced = window.RundbordSeatSync.reconcile(idx >= 0 ? b.seats[idx] : null, seat);
        seat.icons = synced.icons;
        seat.dials = synced.dials;
        if (idx >= 0) {
          var prev = b.seats[idx];
          seat.history = Array.isArray(prev.history) ? prev.history : [];
          var entry = window.RundbordSeatHistory.makeEntry({ before: prev, after: seat, source: meta && meta.source, id: uid(), now: now() });
          if (entry) seat.history = window.RundbordSeatHistory.record(seat.history, entry);
          b.seats[idx] = seat;
        } else {
          seat.history = [];
          b.seats.push(seat);
          logEvent(b, { type: "seat.added", seatId: seat.id, data: { role: seat.name } });
        }
      }));
    },
    moveSeat: function (id, seatId, delta) {
      return Promise.resolve(mutate(id, function (b) {
        var i = b.seats.findIndex(function (s) { return s.id === seatId; });
        var j = i + (Number(delta) < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= b.seats.length) return;
        var tmp = b.seats[i]; b.seats[i] = b.seats[j]; b.seats[j] = tmp;
      }));
    },
    deleteSeat: function (id, seatId) {
      return Promise.resolve(mutate(id, function (b) {
        b.seats = b.seats.filter(function (s) { return s.id !== seatId; });
        if (b.turn && b.turn.seatId === seatId) b.turn = { seatId: null, reason: "", at: null };
        b.proposals = b.proposals.filter(function (p) { return p.seatId !== seatId; });
      }));
    },
    recordUsage: function (id, seatId, usage, meta) {
      return Promise.resolve(mutate(id, function (b, s) {
        var isEye = seatId === "__thirdeye__";
        var seat = isEye ? null : b.seats.filter(function (x) { return x.id === seatId; })[0];
        if ((!seat && !isEye) || !usage) return;
        var holder = isEye ? b : seat;
        var ledger = isEye ? "thirdEyeCalls" : "calls";
        if (!Array.isArray(holder[ledger])) holder[ledger] = [];
        var entry = s.priceTable[usage.modelId || "ukendt"];
        var rec = { id: uid(), at: now(), modelId: usage.modelId || "ukendt", inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0, cachedTokens: usage.cachedTokens || 0 };
        if (entry) {
          rec.price = { priceInPerM: entry.priceInPerM, priceOutPerM: entry.priceOutPerM, versionId: entry.versionId };
          rec.pricePending = false;
        } else {
          rec.price = null;
          rec.pricePending = true;
        }
        holder[ledger].push(rec);
        var m = meta && typeof meta === "object" ? meta : {};
        var cost = rec.price ? (rec.inputTokens / 1e6) * rec.price.priceInPerM + (rec.outputTokens / 1e6) * rec.price.priceOutPerM : null;
        logEvent(b, { type: "call.completed", seatId: isEye ? null : seatId, runId: m.runId, taskId: m.taskId, refMessageId: m.refMessageId, data: { purpose: m.purpose || "chat", modelId: rec.modelId, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, cachedTokens: rec.cachedTokens, costUsd: cost, durationMs: typeof m.durationMs === "number" ? m.durationMs : null } });
        if (holder[ledger].length > MAX_CALLS) holder[ledger] = holder[ledger].slice(-MAX_CALLS);
      }));
    },
    updateShield: function (id, patch) {
      var S = window.RundbordShield;
      return Promise.resolve(mutate(id, function (b) {
        if (!patch || typeof patch !== "object") return;
        var sh = b.shield;
        if (typeof patch.enabled === "boolean" && patch.enabled !== sh.enabled) {
          sh.enabled = patch.enabled;
          logEvent(b, { type: sh.enabled ? "shield.enabled" : "shield.disabled", data: {} });
        }
        if (Array.isArray(patch.terms)) sh.terms = S.normalizeTerms(patch.terms);
        if (Array.isArray(patch.allow)) sh.allow = S.normalizeAllow(patch.allow);
        if (patch.mapping && typeof patch.mapping === "object") {
          var clean = {};
          Object.keys(patch.mapping).forEach(function (k) {
            if (/^\[[A-ZÆØÅ]+_\d{2,}\]$/.test(k) && typeof patch.mapping[k] === "string" && patch.mapping[k]) clean[k] = patch.mapping[k];
          });
          sh.mapping = clean;
        }
        if (patch.event && typeof patch.event.type === "string" && patch.event.type.indexOf("shield.") === 0) {
          var d = patch.event.data && typeof patch.event.data === "object" ? patch.event.data : {};
          var safe = {};
          Object.keys(d).forEach(function (k) {
            if (typeof d[k] === "number" || typeof d[k] === "boolean") safe[k] = d[k];
            else if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) {
              safe[k] = {};
              Object.keys(d[k]).forEach(function (kk) { if (typeof d[k][kk] === "number") safe[k][kk] = d[k][kk]; });
            }
          });
          logEvent(b, { type: patch.event.type.slice(0, 40), seatId: patch.event.seatId || null, taskId: patch.event.taskId || null, runId: patch.event.runId || null, data: safe });
        }
      }));
    },
    chatSeat: function (seat, history, systemPrompt, requestId, images, boardId) {
      var check = shieldCheck(boardId, history, systemPrompt);
      if (check.active && check.leaked) {
        return Promise.resolve({ ok: false, errorKind: "shield", message: L("Beskyttelsen stoppede afsendelsen: " + check.leaked + " oplysning(er) i teksten var ikke skjult eller afgjort.", "Protection stopped the sending: " + check.leaked + " detail(s) in the text were not hidden or decided.") });
      }
      return timed(function () { return runChat(requestId, seat, history, systemPrompt); });
    },
    onChatStream: function (cb) {
      streamListeners.push(cb);
      return function () {
        streamListeners = streamListeners.filter(function (x) { return x !== cb; });
      };
    },
    testSeat: function (seat) {
      return timed(function () {
        return runChat("test", seat, [{ role: "user", content: "Reply only: ok" }], "").then(function (r) {
          return r.ok ? { ok: true, message: L("Forbindelse ok.", "Connection OK."), usage: r.usage } : r;
        });
      });
    },
    listModels: function () { return Promise.resolve({ ok: false, message: L("Modelliste er ikke med i webforsøget; skriv modelnavnet selv.", "The model list is not in the web trial; type the model name yourself.") }); },
    openLink: function (url) {
      if (/^https:\/\//.test(String(url))) window.open(url, "_blank", "noopener");
      return Promise.resolve({ ok: true });
    },
    getPrices: function () { return Promise.resolve(load().priceTable); },
    setPrice: function (modelId, a, b2) {
      var s = load();
      if (!modelId) return Promise.resolve(s.priceTable);
      s.priceTable[modelId] = { modelId: modelId, priceInPerM: Number(a) || 0, priceOutPerM: Number(b2) || 0, versionId: uid(), updatedAt: now(), source: "manual" };
      return Promise.resolve(save(s).priceTable);
    },
    deletePrice: function (modelId) {
      var s = load();
      delete s.priceTable[modelId];
      return Promise.resolve(save(s).priceTable);
    },
    fetchAutoPrices: function () { return Promise.resolve({ ok: false, message: L("Automatiske priser kræver en server (kilden tillader ikke browserkald). Indtast priser selv.", "Automatic prices need a server (the source does not allow browser calls). Enter prices yourself.") }); },
    recomputePending: function () { return Promise.resolve({ recomputed: 0, store: load() }); },
    // Ikke med i forsøget: mapper på disken, git, stemme og PDF.
    filesList: function () { return Promise.resolve({ in: [], out: [], folder: "(browseren)" }); },
    filesAddToIn: function () { return Promise.resolve(notInWeb()); },
    filesReadIn: function () { return Promise.resolve({ files: [], totalChars: 0, skipped: [] }); },
    filesListImages: function () { return Promise.resolve({ images: [], skipped: [] }); },
    filesWriteOut: function (id, name, content) {
      download(String(name || "resultat.md"), String(content), "text/markdown"); // OUT = en download i browseren
      return Promise.resolve({ ok: true, name: String(name || "resultat.md") });
    },
    inboxGet: function () { return Promise.resolve({ ok: true, path: "", files: [], newCount: 0, web: true }); },
    inboxChoose: function () { return Promise.resolve(notInWeb()); },
    inboxClear: function () { return Promise.resolve(notInWeb()); },
    inboxImport: function () { return Promise.resolve(Object.assign({ added: [], skipped: [] }, notInWeb())); },
    inboxMarkSeen: function () { return Promise.resolve(notInWeb()); },
    filesOpenFolder: function () { return Promise.resolve(notInWeb()); },
    filesAddBuffersToIn: function () { return Promise.resolve(notInWeb()); },
    pathsForFiles: function () { return []; },
    saveMessageToGit: function () { return Promise.resolve(notInWeb()); },
    setElevenLabsKey: function (key) {
      var s = load();
      s.elevenLabsKey = String(key || "");
      return Promise.resolve(save(s));
    },
    listVoices: function () { return Promise.resolve(notInWeb()); },
    speakText: function () { return Promise.resolve(notInWeb()); },
    setThirdEyeVoice: function () { return Promise.resolve(load()); },
    testVoiceKey: function () { return Promise.resolve(notInWeb()); },
    transcribeAudio: function () { return Promise.resolve(notInWeb()); },
  };
  applyTheme(load().theme);
  applyLang(load().locale);
  window.rundbord = api;
  window.RUNDBORD_WEB = true;
})();
