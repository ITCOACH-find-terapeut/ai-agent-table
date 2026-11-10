// Forhåndsvisning af en stol i bordets plaket (rollover og tastaturfokus): rolle, opgave og mandat, i tre korte linjer.
// Ren logik uden DOM og Electron. window.RundbordSeatPreview i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordSeatPreview = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_TASK = 90;

  // Begreber med en egen opgavebeskrivelse i sprogfilerne (roleTask_<begreb uden mellemrum og tegn>); resten er egne roller.
  var CONCEPTS = [
    "Orchestrator", "Router", "PM (Product)", "Communicator", "Clarifier", "Researcher", "Architect", "Planner", "Builder", "Database", "Frontend", "Backend",
    "DevOps", "Tester", "Security", "Reviewer", "Evaluator", "Documenter", "Memory", "Process Analyst", "Learning Agent", "UX Researcher", "API Specialist",
    "Performance", "Compliance", "Human", "OUT Writer",
  ];

  function taskKey(concept) {
    return CONCEPTS.indexOf(concept) >= 0 ? "roleTask_" + concept.replace(/[^A-Za-z]/g, "") : null;
  }

  // Første sætning af en tekst, højst `max` tegn (afkortet ved et ord med «…»).
  function firstSentence(text, max) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    var m = /^(.*?[.!?])(\s|$)/.exec(s);
    if (m) s = m[1];
    s = s.replace(/[.!?]+$/, "");
    if (s.length <= max) return s;
    var cut = s.slice(0, max - 1);
    var sp = cut.lastIndexOf(" ");
    return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, "") + "…";
  }

  // Stolens egen opgave: første brugbare linje af dens egne instruktioner (uden en indledende «Du er …»-sætning og uden listetegn).
  function ownTask(instruction) {
    var lines = String(instruction || "").split("\n").map(function (l) {
      return l.replace(/^\s*[-*•]\s*/, "").trim();
    }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/^(Du er|You are)\s[^.!?]*[.!?]\s*/i, "");
      if (l) return firstSentence(l, MAX_TASK);
    }
    return "";
  }

  // seat: stolen · t: oversættelse · mandate: stolens mandat ("kan" | "foreslaa" | "ikke", fra RundbordSeatSync)
  // Returnerer { heading, role, task, mandateKey, mandate }. heading er stolens navn, når det afviger fra rollen; ellers rollen.
  function build(seat, t, mandate) {
    var name = String((seat && seat.name) || "").trim();
    var concept = seat && typeof seat.role === "string" && seat.role ? seat.role : name;
    var named = Boolean(name && concept && name !== concept);
    var key = taskKey(concept);
    var task = ownTask(seat && seat.customInstruction) || (key ? t(key) : "") || t("previewTaskNone");
    var mandateKey = mandate === "foreslaa" || mandate === "ikke" ? mandate : "kan";
    return {
      heading: named ? name : concept || name,
      role: named ? concept : "",
      task: task,
      mandateKey: mandateKey,
      mandate: t({ kan: "previewMandateKan", foreslaa: "previewMandateForeslaa", ikke: "previewMandateIkke" }[mandateKey]),
    };
  }

  return { build: build, firstSentence: firstSentence, ownTask: ownTask, taskKey: taskKey, CONCEPTS: CONCEPTS };
});
