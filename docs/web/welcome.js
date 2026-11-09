// FORSØG: velkomst for webudgaven. Første gang (tomt bord) tilbydes: en indspillet demo, et prøvebord med én gratis nøgle,
// eller at starte tomt. I demoen vises et tydeligt bånd om, at svarene er indspillet. Her ligger også vejen til skrivebordsversionen.
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var DEMO = params.get("demo") === "1";
  // Demoen i selve appen (eget vindue): sproget følger appen, der er ingen vej til downloads, og «Afslut demo» lukker vinduet.
  var EMBEDDED = DEMO && params.get("embedded") === "1";
  var FLAG = "rundbordet-web-welcomed";

  var T = {
    da: {
      title: "Velkommen til Rundbordet",
      intro: "Flere AI-modeller sidder ved ét bord, og du bestemmer. Vælg, hvordan du vil prøve det:",
      demoH: "Se en indspillet demo",
      demoP: "Ingen nøgle og ingen omkostning. Svarene er optaget på forhånd og kommer ikke fra en live model, men du kan klikke rundt, prøve Tredje øjes valg og se Beskyttelsen virke.",
      demoB: "Se demoen",
      trialH: "Prøv med et gratis prøvebord",
      trialP: "Tre stole er sat op. Du skal bruge én nøgle fra en udbyder, du selv opretter hos dem. Mange har et gratis niveau; tjek deres aktuelle vilkår.",
      keyL: "Din nøgle",
      getKey: "Hent en nøgle hos udbyderen ↗",
      trialB: "Opret prøvebord",
      trialNote: "Nøglen gemmes kun i denne browser og sendes kun direkte til udbyderen. Beskyttelse er slået til på prøvebordet, men gratis niveauer kan have vilkår om, at tekst bruges til forbedring. Skriv derfor ikke følsomme oplysninger.",
      emptyH: "Start tomt",
      emptyP: "Sæt dine egne stole og nøgler op.",
      emptyB: "Start tomt",
      download: "Hent skrivebordsversionen",
      needKey: "Indsæt en nøgle først.",
      banner: "Indspillet demo: svarene er optaget og kommer ikke fra en live model.",
      bannerTry: "Prøv med en gratis nøgle",
      bannerEnd: "Afslut demo",
      bannerOwn: "Din egen tekst bruges ikke. Luk demoen for at prøve din egen opgave i appen.",
      trialName: "Prøvebord",
    },
    en: {
      title: "Welcome to Rundbordet",
      intro: "Several AI models sit at one table, and you decide. Choose how you want to try it:",
      demoH: "Watch a recorded demo",
      demoP: "No key and no cost. The replies are pre-recorded and do not come from a live model, but you can click around, try the Third Eye's choices and see Protection at work.",
      demoB: "See the demo",
      trialH: "Try a free trial table",
      trialP: "Three seats are set up. You need one key from a provider you sign up with yourself. Many have a free tier; check their current terms.",
      keyL: "Your key",
      getKey: "Get a key from the provider ↗",
      trialB: "Create trial table",
      trialNote: "The key is only stored in this browser and only sent directly to the provider. Protection is on for the trial table, but free tiers may have terms that text is used for improvement. So do not write sensitive details.",
      emptyH: "Start empty",
      emptyP: "Set up your own seats and keys.",
      emptyB: "Start empty",
      download: "Get the desktop version",
      needKey: "Paste a key first.",
      banner: "Recorded demo: the replies are pre-recorded and do not come from a live model.",
      bannerTry: "Try with a free key",
      bannerEnd: "End demo",
      bannerOwn: "Your own text is not used. Close the demo to try your own task in the app.",
      trialName: "Trial table",
    },
  };
  var KEY_LINKS = { groq: "https://console.groq.com/keys", mistral: "https://console.mistral.ai/api-keys" };
  var ROLES = ["Orchestrator", "Clarifier", "Builder"];

  var CSS =
    ".rw-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto;}" +
    ".rw-card{background:var(--surface);color:var(--ink);border:1px solid var(--surface-line);border-radius:14px;max-width:760px;width:100%;padding:1.4rem 1.5rem;font-family:var(--font-body);}" +
    ".rw-card h1{font:600 22px var(--font-display);margin:0 0 .4rem;}" +
    ".rw-card p{margin:.2rem 0 .6rem;font-size:13.5px;line-height:1.5;color:var(--ink-secondary);}" +
    ".rw-opt{border:1px solid var(--surface-line);border-radius:10px;padding:.8rem .9rem;margin:.7rem 0;background:var(--bg);}" +
    ".rw-opt h2{font:600 15px var(--font-body);margin:0 0 .2rem;color:var(--ink);}" +
    ".rw-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:.4rem;}" +
    ".rw-card input,.rw-card select{font:13px var(--font-body);padding:.4rem .5rem;border:1px solid var(--surface-line);border-radius:8px;background:var(--surface);color:var(--ink);}" +
    ".rw-card input{flex:1;min-width:180px;}" +
    ".rw-btn{font:600 13px var(--font-body);padding:.45rem .8rem;border-radius:8px;border:1px solid var(--surface-line);background:var(--surface);color:var(--ink);cursor:pointer;}" +
    ".rw-btn.primary{background:var(--accent);color:var(--accent-text);border-color:var(--accent);}" +
    ".rw-note{font-size:11.5px!important;color:var(--ink-muted)!important;}" +
    ".rw-card a{color:var(--ink-secondary);font-size:12.5px;}" +
    ".rw-error{color:var(--danger);font-size:12.5px;margin:.3rem 0 0;}" +
    ".rw-banner{position:sticky;top:0;z-index:90;background:var(--accent);color:var(--accent-text);padding:.45rem 1rem;font:600 13px var(--font-body);display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;}" +
    ".rw-banner a{color:inherit;text-decoration:underline;font-weight:600;}" +
    ".rw-pill{position:fixed;right:12px;bottom:12px;z-index:80;font:600 12px var(--font-body);background:var(--surface);color:var(--ink);border:1px solid var(--surface-line);border-radius:999px;padding:.4rem .75rem;text-decoration:none;}";

  // Webudgavens standardsprog er engelsk. Valget gemmes; i demoen starter den på ny, så de optagede svar følger sproget.
  function switchLang(current) {
    var next = current === "da" ? "en" : "da";
    if (DEMO) {
      try {
        localStorage.removeItem("rundbordet-web-demo");
      } catch (e) {}
      location.href = location.pathname + "?demo=1&lang=" + next;
      return;
    }
    window.rundbord.setLocale(next).then(function () {
      location.reload();
    });
  }
  function langButton(current) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rw-btn";
    b.textContent = current === "da" ? "English" : "Dansk";
    b.setAttribute("lang", current === "da" ? "en" : "da");
    b.addEventListener("click", function () {
      switchLang(current);
    });
    return b;
  }
  function hentHref(lang) {
    return lang === "da" ? "hent.da.html" : "hent.html";
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      e.appendChild(c);
    });
    return e;
  }

  function remember() {
    try {
      localStorage.setItem(FLAG, "1");
    } catch (e) {}
  }
  function welcomed() {
    try {
      return localStorage.getItem(FLAG) === "1";
    } catch (e) {
      return false;
    }
  }

  function createTrial(provider, key, t) {
    var api = window.rundbord;
    var boardId;
    return api
      .getStore()
      .then(function (s) {
        boardId = s.activeBoardId;
        return api.updateBoard(boardId, { projectName: t.trialName, handoffMode: "full" });
      })
      .then(function () {
        return api.updateShield(boardId, { enabled: true });
      })
      .then(function () {
        return ROLES.reduce(function (chain, role, i) {
          return chain.then(function () {
            return api.saveSeat(boardId, {
              id: "trial-" + i + "-" + Date.now(), name: role, provider: provider, model: window.DEFAULT_MODEL[provider] || "",
              baseUrl: "", apiKey: key, hasKey: true, color: window.SWATCHES[i], calls: [], icons: window.defaultIcons(),
              dials: window.defaultDials(), customInstruction: "", checks: false, readsIn: false,
            });
          });
        }, Promise.resolve());
      });
  }

  function showOverlay(t, lang) {
    var overlay = el("div", { class: "rw-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "rwTitle" });
    var provider = el("select", { "aria-label": "Udbyder" }, [el("option", { value: "groq", text: "Groq" }), el("option", { value: "mistral", text: "Mistral" })]);
    var key = el("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: t.keyL, "aria-label": t.keyL });
    var link = el("a", { href: KEY_LINKS.groq, target: "_blank", rel: "noopener noreferrer", text: t.getKey });
    provider.addEventListener("change", function () {
      link.setAttribute("href", KEY_LINKS[provider.value]);
    });
    var error = el("p", { class: "rw-error", role: "alert", hidden: "" });
    var trialBtn = el("button", { type: "button", class: "rw-btn primary", text: t.trialB });
    trialBtn.addEventListener("click", function () {
      var v = key.value.trim();
      if (!v) {
        error.textContent = t.needKey;
        error.hidden = false;
        key.focus();
        return;
      }
      trialBtn.disabled = true;
      remember();
      createTrial(provider.value, v, t).then(function () {
        location.reload();
      });
    });
    var demoBtn = el("button", { type: "button", class: "rw-btn primary", text: t.demoB });
    demoBtn.addEventListener("click", function () {
      remember();
      location.href = location.pathname + "?demo=1";
    });
    var emptyBtn = el("button", { type: "button", class: "rw-btn", text: t.emptyB });
    function close() {
      remember();
      overlay.remove();
    }
    emptyBtn.addEventListener("click", close);
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    var card = el("div", { class: "rw-card" }, [
      el("h1", { id: "rwTitle", text: t.title }),
      el("p", { text: t.intro }),
      el("div", { class: "rw-opt" }, [el("h2", { text: t.demoH }), el("p", { text: t.demoP }), el("div", { class: "rw-row" }, [demoBtn])]),
      el("div", { class: "rw-opt" }, [
        el("h2", { text: t.trialH }), el("p", { text: t.trialP }),
        el("div", { class: "rw-row" }, [provider, key, trialBtn]),
        el("div", { class: "rw-row" }, [link]), error,
        el("p", { class: "rw-note", text: t.trialNote }),
      ]),
      el("div", { class: "rw-opt" }, [el("h2", { text: t.emptyH }), el("p", { text: t.emptyP }), el("div", { class: "rw-row" }, [emptyBtn])]),
      el("div", { class: "rw-row" }, [el("a", { href: hentHref(lang), text: t.download }), langButton(lang)]),
    ]);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    demoBtn.focus();
  }

  function showBanner(t, lang) {
    var end = el("a", { href: location.pathname, text: t.bannerEnd });
    if (EMBEDDED) {
      end = el("button", { type: "button", class: "rw-btn", text: t.bannerEnd });
      end.addEventListener("click", function () {
        window.close();
      });
    }
    var banner = el("div", { class: "rw-banner", role: "status" }, EMBEDDED
      ? [el("span", { text: t.banner + " " + t.bannerOwn }), end]
      : [el("span", { text: t.banner }), end, el("a", { href: hentHref(lang), text: t.download }), langButton(lang)]);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function init() {
    window.rundbord.getStore().then(function (s) {
      var lang = s.locale === "da" ? "da" : "en";
      var t = T[lang];
      var style = document.createElement("style");
      style.textContent = CSS;
      document.head.appendChild(style);
      if (DEMO) {
        showBanner(t, lang);
        return;
      }
      document.body.appendChild(el("a", { class: "rw-pill", href: hentHref(lang), text: "⬇ " + t.download }));
      var board = s.boards[s.activeBoardId];
      if (!welcomed() && board && !board.seats.length) showOverlay(t, lang);
    });
  }
  // Ikke window.RundbordWelcome: det navn er lib/welcome.js (cards, shouldShow), som appen kalder, og må ikke overskrives.
  window.RundbordWebWelcome = { init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
