// Velkomst med opgavekort: hvad en ny bruger kan prøve første gang, uden først at forstå stole, dials og add-ons.
// Hvert kort peger på en skabelon (lib/templates.js), har en eksempelopgave, som kommer i beskedfeltet, og et illustreret eksempel på et resultat.
// Eksemplerne er skrevet på forhånd og mærkes i skærmbilledet som det: de er ikke svar fra en model.
// Ren logik uden DOM, netværk og Electron. window.RundbordWelcome i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordWelcome = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // Rækkefølgen er den, kortene vises i. "template" er nøglen i lib/templates.js.
  var ORDER = [
    { key: "learn", template: "learning" },
    { key: "decide", template: "decision" },
    { key: "check", template: "facts" },
    { key: "letter", template: "letter" },
  ];

  var TEXT = {
    da: {
      learn: {
        title: "Forstå noget svært",
        line: "Du tænker først. Bordet hjælper dig med at forstå, uden at tage tankearbejdet fra dig.",
        task: "Jeg vil gerne forstå, hvordan en varmepumpe virker, og om den er noget for mit hus. Jeg tror selv, at den er billigere at have end et oliefyr, men jeg ved ikke helt hvorfor.",
        example: [
          ["Clarifier", "Før vi går i gang: hvad tror du selv er grunden til, at den kan være billigere? Og hvad ved du om dit hus, fx alder og isolering?"],
          ["Forklarer", "En varmepumpe flytter varme i stedet for at skabe den, så den kan give mere varme, end den bruger i strøm. Hvor meget mere afhænger af udetemperaturen og husets isolering. Usikkert: hvad det bliver for netop dit hus."],
          ["Udfordrer", "Hvad antager du om prisen på strøm de næste ti år? Og hvad gør du, hvis huset er dårligt isoleret?"],
          ["Skriver", "Dit eget bud, sat op så du kan rette det: “Jeg tror, en varmepumpe er billigere, fordi … Det vil jeg undersøge først: …”"],
        ],
      },
      decide: {
        title: "Vælg mellem to muligheder",
        line: "Fordele, ulemper og hvem valget rammer. Bordet beslutter ikke for dig; du skriver selv beslutningen.",
        task: "Jeg overvejer at takke ja til et job med højere løn, men en time længere transport hver vej, eller blive i mit nuværende job. Hjælp mig med at se konsekvenserne.",
        example: [
          ["Analytiker", "Nyt job: højere løn, men cirka ti timers ekstra transport om ugen (antagelse: en time hver vej, fem dage). Nuværende job: kendt og tæt på, men uklart hvor meget du kan udvikle dig. Fakta er adskilt fra antagelser."],
          ["Berørte", "Valget rammer også dem, du bor sammen med: mindre tid hjemme. Jeg ved ikke, hvad de ønsker, så det bør du spørge om."],
          ["Udfordrer", "Hvilken mulighed har ingen nævnt? Fx at forhandle om hjemmearbejde eller fleksible tider i det nye job?"],
          ["OUT Writer", "Beslutningsnotat: valget, mulighederne, fakta og antagelser, hvem der berøres. Din beslutning skriver du selv, før notatet bliver lavet."],
        ],
      },
      check: {
        title: "Er det her rigtigt?",
        line: "Bordet samler det, der er sagt, med kilder, og en kontrollant tjekker, at intet er opfundet.",
        task: "Er det rigtigt, at vi kun bruger ti procent af vores hjerne?",
        example: [
          ["Researcher", "FAKTA: Nej, det er en udbredt myte. Hjerneskanninger viser aktivitet i hele hjernen i løbet af en dag. Kilde: ingen i IN-materialet, så det er almen viden og ikke kontrolleret. Usikkert: hvor der findes en god kilde."],
          ["Reviewer", "PASS med forbehold: påstanden holder som almen viden, men der er ikke givet en kilde. Læg en artikel eller en rapport i IN, hvis du vil have den kontrolleret."],
        ],
      },
      letter: {
        title: "Forstå et brev, jeg har fået",
        line: "Brevet oversættes til almindeligt sprog, og beløb og datoer tjekkes mod brevet. Det er ikke juridisk rådgivning.",
        task:
          "Forklar dette brev for mig (det er et opdigtet eksempel; skift det ud med dit eget, eller læg en PDF i IN):\n\n" +
          "Kære beboer,\n\nVi skriver til dig, fordi lejen på din bolig reguleres fra den 1. januar 2027. Den månedlige leje stiger fra 7.200 kr. til 7.560 kr. " +
          "Du kan gøre indsigelse skriftligt senest 8 uger efter, at du har modtaget dette brev.\n\nMed venlig hilsen\nBoligforeningen Nordlys",
        example: [
          ["Oversætter", "Brevet siger, at lejen stiger fra 1. januar 2027, fra 7.200 kr. til 7.560 kr. om måneden. Du kan skriftligt gøre indsigelse senest 8 uger efter, du har modtaget brevet. “Indsigelse” betyder en skriftlig indvending. Bemærk: Det her er en forklaring, ikke juridisk rådgivning."],
          ["Skeptiker", "Brevet siger ikke, hvorfor lejen stiger, eller hvordan stigningen på 360 kr. er regnet ud. Spørg afsenderen efter hvilken regel. Fristen regnes fra, du modtog brevet: skriv datoen ned."],
          ["Kontrol", "PASS: beløb, dato og frist i forklaringen stemmer med brevet, og bemærkningen om rådgivning er med."],
        ],
      },
    },
    en: {
      learn: {
        title: "Understand something difficult",
        line: "You think first. The table helps you understand, without taking the thinking away from you.",
        task: "I would like to understand how a heat pump works and whether it suits my house. I think it is cheaper to run than an oil boiler, but I am not sure why.",
        example: [
          ["Clarifier", "Before we start: what do you think is the reason it can be cheaper? And what do you know about your house, such as its age and insulation?"],
          ["Explainer", "A heat pump moves heat instead of creating it, so it can deliver more heat than the electricity it uses. How much more depends on the outdoor temperature and the insulation. Uncertain: what it will be for your house in particular."],
          ["Challenger", "What do you assume about the price of electricity over the next ten years? And what will you do if the house is poorly insulated?"],
          ["Writer", "Your own take, set up so you can correct it: “I think a heat pump is cheaper because … I will look into this first: …”"],
        ],
      },
      decide: {
        title: "Choose between two options",
        line: "Pros, cons and who the choice affects. The table does not decide for you; you write the decision yourself.",
        task: "I am considering accepting a job with higher pay but an hour longer commute each way, or staying in my current job. Help me see the consequences.",
        example: [
          ["Analyst", "New job: higher pay, but about ten extra hours of commuting a week (assumption: an hour each way, five days). Current job: familiar and close, but unclear how much you can develop. Facts are kept apart from assumptions."],
          ["Affected", "The choice also affects the people you live with: less time at home. I do not know what they want, so you should ask."],
          ["Challenger", "Which option has nobody mentioned? For example negotiating home working or flexible hours in the new job?"],
          ["OUT Writer", "Decision note: the choice, the options, facts and assumptions, who is affected. You write your own decision before the note is made."],
        ],
      },
      check: {
        title: "Is this true?",
        line: "The table gathers what has been said, with sources, and a checker makes sure nothing is invented.",
        task: "Is it true that we only use ten percent of our brain?",
        example: [
          ["Researcher", "FACT: No, it is a widespread myth. Brain scans show activity throughout the brain over a day. Source: none in the IN material, so it is general knowledge and not checked. Uncertain: where a good source can be found."],
          ["Reviewer", "PASS with reservations: the claim holds as general knowledge, but no source was given. Put an article or a report in IN if you want it checked."],
        ],
      },
      letter: {
        title: "Understand a letter I have received",
        line: "The letter is put into plain language, and amounts and dates are checked against it. It is not legal advice.",
        task:
          "Explain this letter to me (it is an invented example; replace it with your own, or put a PDF in IN):\n\n" +
          "Dear tenant,\n\nWe are writing to you because the rent for your home will be adjusted from 1 January 2027. The monthly rent rises from 7,200 to 7,560. " +
          "You may object in writing no later than 8 weeks after you have received this letter.\n\nKind regards\nNordlys Housing Association",
        example: [
          ["Translator", "The letter says the rent rises from 1 January 2027, from 7,200 to 7,560 a month. You can object in writing no later than 8 weeks after you received the letter. “Objection” means a written protest. Note: This is an explanation, not legal advice."],
          ["Skeptic", "The letter does not say why the rent rises or how the increase of 360 is calculated. Ask the sender under which rule. The deadline runs from when you received the letter: write the date down."],
          ["Checker", "PASS: the amounts, date and deadline in the explanation match the letter, and the note about advice is included."],
        ],
      },
    },
  };

  function loc(locale) {
    return locale === "en" ? "en" : "da";
  }

  // → [{ key, template, title, line, task, example: [{ who, text }] }] i visningsrækkefølge
  function cards(locale) {
    var t = TEXT[loc(locale)];
    return ORDER.map(function (c) {
      var x = t[c.key];
      return {
        key: c.key,
        template: c.template,
        title: x.title,
        line: x.line,
        task: x.task,
        example: x.example.map(function (e) {
          return { who: e[0], text: e[1] };
        }),
      };
    });
  }

  function get(key, locale) {
    return cards(locale).filter(function (c) {
      return c.key === key;
    })[0] || null;
  }

  // Velkomsten vises kun, når appen selv har sat flaget til false (en helt ny installation). Eksisterende brugere og webudgaven ser den ikke.
  function shouldShow(store, platform) {
    return Boolean(store) && store.welcomeSeen === false && platform !== "web";
  }

  // En OpenRouter-nøgle, brugeren allerede har sat op (i en Modelprofil API eller på en stol på et hvilket som helst bord), så den ikke skal skrives to gange.
  function findOpenRouterKey(store) {
    var profiles = (store && Array.isArray(store.models) && store.models) || [];
    for (var p = 0; p < profiles.length; p++) {
      var m = profiles[p];
      if (m && m.provider === "openrouter" && typeof m.apiKey === "string" && m.apiKey.trim()) return m.apiKey.trim();
    }
    var boards = (store && store.boards) || {};
    var ids = Object.keys(boards);
    for (var i = 0; i < ids.length; i++) {
      var seats = (boards[ids[i]] && boards[ids[i]].seats) || [];
      for (var j = 0; j < seats.length; j++) {
        var s = seats[j];
        if (s && s.provider === "openrouter" && typeof s.apiKey === "string" && s.apiKey.trim()) return s.apiKey.trim();
      }
    }
    return "";
  }

  // Modelvalget til skabelonens stole ud fra OpenRouters startforslag (lib/openrouter.js: [{ role, tier, model, ... }]).
  // Kontrolstolen får "mellem", så den ikke er den samme model som dem, den kontrollerer; de øvrige får "billig", så en prøve ikke koster mere end nødvendigt.
  // Mangler en model i forslaget, bruges en anden fra forslaget, og findes ingen, står pladsen tom, så brugeren vælger selv bagefter.
  function assignModels(seats, starter) {
    var list = Array.isArray(starter) ? starter : [];
    var byTier = {};
    var any = "";
    list.forEach(function (r) {
      if (!r || !r.model) return;
      if (!byTier[r.tier]) byTier[r.tier] = r.model;
      if (!any) any = r.model;
    });
    return (Array.isArray(seats) ? seats : []).map(function (seat) {
      var order = seat && seat.checks ? ["mid", "strong", "cheap"] : ["cheap", "mid", "strong"];
      for (var i = 0; i < order.length; i++) if (byTier[order[i]]) return byTier[order[i]];
      return any;
    });
  }

  return { cards: cards, get: get, shouldShow: shouldShow, findOpenRouterKey: findOpenRouterKey, assignModels: assignModels };
});
