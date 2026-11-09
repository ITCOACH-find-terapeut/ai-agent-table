// FORSØG: indspillet demo. Et færdigt bord og skriftede svar, så en besøgende kan klikke rundt uden nøgler og uden omkostning.
// Intet her kalder en model: svarene er skrevet på forhånd og vises med streaming-effekt. Demoen mærkes tydeligt (se welcome.js).
(function () {
  "use strict";
  var NEEDS = function (loc, need, role, adjust) {
    var L = loc === "en" ? ["NEED", "ROLE", "ADJUST"] : ["BEHOV", "ROLLE", "JUSTÉR"];
    return "\n\n---\n🔭 " + L[0] + ": " + need + "\n👉 " + L[1] + ": " + role + "\n🎚 " + L[2] + ": " + (adjust || "");
  };

  // Svar pr. stol og sprog; der cykles igennem dem i rækkefølge. Stolenes navne er de samme på begge sprog.
  var REPLIES = {
    da: {
      Orchestrator: [
        "Jeg forstår opgaven som en plan for en lille café på Nørrebro med åbning til foråret: koncept, budget, lokale og tidsplan. Før vi bestiller noget, skal målgruppen og budgettet være på plads.\n\n1. Afklar målgruppe og åbningstider\n2. Sæt et realistisk budget\n3. Find og vurder lokaler\n4. Lav en tidsplan frem mod åbning" +
          NEEDS("da", "Målgruppe og budget mangler", "Clarifier", "Nysgerrighed: Til, styrke 8"),
        "Jeg har samlet trådene: målgruppen er studerende og kontorfolk i nærområdet, budgettet er under afklaring. Næste skridt er en konkret tidsplan." + NEEDS("da", "intet", "Builder", ""),
      ],
      Clarifier: [
        "Jeg forstår det sådan, at jeg skal hjælpe med at gøre opgaven præcis. Tre spørgsmål, før vi går videre:\n\n1. Hvem er den vigtigste gæst: studerende, kontorfolk eller naboer?\n2. Hvad er det samlede budget til indretning og første måneds drift?\n3. Skal der være mad, eller kun kaffe og kage?" +
          NEEDS("da", "Svar fra dig om budget og målgruppe", "Orchestrator", ""),
        "Tak. Så er opgaven afgrænset: kaffe og kage, studerende og kontorfolk, budget under 250.000 kr. Jeg overgiver til Builder." + NEEDS("da", "intet", "Builder", ""),
      ],
      Builder: [
        "Jeg forstår opgaven som at bygge selve planen. Et første udkast:\n\n**Uge 1–2:** lokale og lejekontrakt\n**Uge 3–6:** indretning og udstyr\n**Uge 7–8:** menu, leverandører og prøvedage\n**Uge 9:** blød åbning\n\nBudget: indretning 120.000 kr., udstyr 80.000 kr., reserve 50.000 kr." + NEEDS("da", "Tjek af budgettet mod rigtige tilbud", "Tester", ""),
        "Jeg har rettet planen, så reserven er 15 % af budgettet, og blød åbning er flyttet en uge." + NEEDS("da", "intet", "Tester", ""),
      ],
    },
    en: {
      Orchestrator: [
        "I understand the task as a plan for a small café in Nørrebro opening in spring: concept, budget, premises and schedule. Before we order anything, the target group and the budget need to be settled.\n\n1. Clarify the target group and opening hours\n2. Set a realistic budget\n3. Find and assess premises\n4. Make a schedule up to opening" +
          NEEDS("en", "The target group and budget are missing", "Clarifier", "Curiosity: On, strength 8"),
        "I have pulled the threads together: the target group is students and office workers nearby, and the budget is still being clarified. The next step is a concrete schedule." + NEEDS("en", "nothing", "Builder", ""),
      ],
      Clarifier: [
        "I understand that I should help make the task precise. Three questions before we go on:\n\n1. Who is the most important guest: students, office workers or neighbours?\n2. What is the total budget for the fit-out and the first month of running it?\n3. Should there be food, or only coffee and cake?" +
          NEEDS("en", "Your answers about budget and target group", "Orchestrator", ""),
        "Thank you. Then the task is bounded: coffee and cake, students and office workers, a budget under 250,000 DKK. I hand over to Builder." + NEEDS("en", "nothing", "Builder", ""),
      ],
      Builder: [
        "I understand the task as building the plan itself. A first draft:\n\n**Weeks 1–2:** premises and lease\n**Weeks 3–6:** fit-out and equipment\n**Weeks 7–8:** menu, suppliers and trial days\n**Week 9:** soft opening\n\nBudget: fit-out 120,000 DKK, equipment 80,000 DKK, reserve 50,000 DKK." + NEEDS("en", "Check the budget against real quotes", "Tester", ""),
        "I have revised the plan so the reserve is 15% of the budget, and the soft opening is moved by a week." + NEEDS("en", "nothing", "Tester", ""),
      ],
    },
  };

  var THIRD_EYE = {
    da:
      "Fremdrift: Bordet er kommet i gang, og opgaven er blevet mere præcis, men Builders udkast er endnu ikke prøvet mod rigtige tal.\n" +
      "Kvalitet: Svarene er konkrete. Spørgsmålene fra Clarifier var skarpe.\n" +
      "Ubehandlede behov: Budgettet er ikke kontrolleret af nogen.\n" +
      "Råd: Lad Tester kigge på budgettet, før I bygger videre.\n\n---\n<<NEXT>>\n" +
      JSON.stringify([
        { type: "give_turn", seat: "Clarifier", why: "Budgettet er stadig det mest uklare." },
        { type: "set_dial", seat: "Builder", dial: "challenge", state: "on", strength: 7, why: "Planen er ikke blevet udfordret endnu." },
        { type: "add_addon", seat: "Clarifier", name: "Budgetspørgsmål", text: "Spørg altid efter budgettet, før du foreslår løsninger.", why: "Gør det til en fast vane ved bordet." },
      ]),
    en:
      "Progress: The table is under way and the task has become more precise, but Builder's draft has not been tried against real numbers yet.\n" +
      "Quality: The replies are concrete. Clarifier's questions were sharp.\n" +
      "Unhandled needs: Nobody has checked the budget.\n" +
      "Advice: Let Tester look at the budget before you build further.\n\n---\n<<NEXT>>\n" +
      JSON.stringify([
        { type: "give_turn", seat: "Clarifier", why: "The budget is still the least clear part." },
        { type: "set_dial", seat: "Builder", dial: "challenge", state: "on", strength: 7, why: "The plan has not been challenged yet." },
        { type: "add_addon", seat: "Clarifier", name: "Budget question", text: "Always ask about the budget before suggesting solutions.", why: "Make it a standing habit at the table." },
      ]),
  };

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "d" + Date.now() + Math.random().toString(16).slice(2);
  }

  function seedStore(newBoardFn, locale) {
    var loc = locale === "da" ? "da" : "en";
    // Samme form som stolene i appen: alle dials og ikoner skal være der, ellers kan brugerfladen ikke bygge instruktionen.
    var off = function () { return { state: "off", strength: 6, note: "" }; };
    function dials(extra) {
      return Object.assign({
        reason: off(), challenge: off(), curiosity: off(), risk: off(), action: { state: "off", note: "" }, selfCheck: { state: "off", note: "" },
        humanImpact: off(), uncertainty: off(), cost: off(), modifyRules: { state: "suggest", note: "" },
      }, extra || {});
    }
    function icons() {
      return { mandate: "kan", work: { tanke: false, omtanke: false, handling: false }, info: { sten: false, papir: false, saks: false } };
    }
    var seats = [
      { id: "demo-s1", name: "Orchestrator", color: "denim", dials: dials({ reason: { state: "on", strength: 6, note: "" } }) },
      { id: "demo-s2", name: "Clarifier", color: "ochre", dials: dials({ curiosity: { state: "on", strength: 8, note: "" } }) },
      { id: "demo-s3", name: "Builder", color: "slate", dials: dials({ selfCheck: { state: "on", note: "" } }) },
    ].map(function (s) {
      return Object.assign({ provider: "custom", model: "indspillet-demo", baseUrl: "", apiKey: "demo", hasKey: true, calls: [], history: [], icons: icons(), customInstruction: "", checks: false, readsIn: false }, s);
    });
    var b = newBoardFn(loc === "da" ? "Demo: café på Nørrebro" : "Demo: café in Nørrebro");
    b.seats = seats;
    var t = Date.now() - 600000;
    function at(min) {
      return new Date(t + min * 60000).toISOString();
    }
    b.messages = [
      { id: uid(), seatId: "demo-s1", role: "user", text: loc === "da" ? "Lav en plan for at åbne en lille café på Nørrebro til foråret" : "Make a plan to open a small café in Nørrebro by spring", at: at(0), meta: { isTask: true } },
      { id: uid(), seatId: "demo-s1", role: "assistant", text: REPLIES[loc].Orchestrator[0], at: at(1) },
    ];
    b.shield = { enabled: true, terms: [{ value: "Anne Madsen", kind: "PERSON" }], allow: [], mapping: {} };
    var s = { activeBoardId: b.id, boards: {}, priceTable: { demo: { modelId: "demo", priceInPerM: 0, priceOutPerM: 0, versionId: "demo", updatedAt: at(0), source: "demo" } }, locale: loc, theme: "system", elevenLabsKey: "", schemaVersion: 3 };
    s.boards[b.id] = b;
    return s;
  }

  // Er det Tredje øje, der spørger? Dets instruktion starter med "tredje øje" / "third eye".
  function isThirdEye(systemPrompt) {
    return /tredje øje|third eye/i.test(String(systemPrompt || "").slice(0, 200));
  }

  // → { text, usage }. Byder på pladsholdere fra brugerens tekst, så Beskyttelsen kan vises: skjult ud, gendannet ind.
  function respond(seat, history, systemPrompt, locale) {
    var loc = locale === "da" ? "da" : "en";
    if (isThirdEye(systemPrompt)) return { text: THIRD_EYE[loc] };
    var list = REPLIES[loc][seat.name] || REPLIES[loc].Builder;
    var done = (respond.counts = respond.counts || {});
    var n = (done[seat.id] = (done[seat.id] || 0) + 1) - 1;
    var last = (history[history.length - 1] || {}).content || "";
    var ph = (String(last).match(/\[[A-ZÆØÅ]+_\d{2,}\]/g) || []).filter(function (v, i, a) {
      return a.indexOf(v) === i;
    });
    var text = list[n % list.length];
    if (ph.length) text = (loc === "da" ? "Noteret: " + ph.join(", ") + ". (Demoen svarer med indspillede svar, men Beskyttelsen virker som i den rigtige app.)" : "Noted: " + ph.join(", ") + ". (The demo answers with recorded replies, but Protection works as in the real app.)") + "\n\n" + text;
    return { text: text };
  }

  window.RundbordDemo = { seedStore: seedStore, respond: respond };
})();
