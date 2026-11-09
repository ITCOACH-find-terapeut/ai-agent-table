// Sprintplan: en stol skriver en kort tekst og afslutter med linjen <<SPRINT>> + JSON. Appen læser og kontrollerer den
// (modellens svar er utroværdigt) og laver selv en læsbar fil og en CSV til import i regneark eller et planlægningsværktøj.
// Ren logik; window.RundbordSprintPlan i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordSprintPlan = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MARKER = "<<SPRINT>>";
  var POINTS = [1, 2, 3, 5, 8, 13];
  var MAX_ITEMS = 30;

  function clean(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  // Første komplette JSON-objekt i teksten (kender til strenge og escape), så pynt omkring ikke ødelægger det.
  function extractObject(text) {
    var start = text.indexOf("{");
    if (start < 0) return null;
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < text.length; i++) {
      var c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  function priorityOf(raw) {
    var n = parseInt(raw, 10);
    if (isFinite(n) && n >= 1 && n <= 99) return n;
    var w = String(raw || "").toLowerCase();
    if (/^(high|høj|hoj)$/.test(w)) return 1;
    if (/^(medium|mellem)$/.test(w)) return 2;
    if (/^(low|lav)$/.test(w)) return 3;
    return null;
  }

  // → { ok, error?, plan?, warnings }
  function parse(text) {
    var warnings = [];
    var str = String(text == null ? "" : text);
    var idx = str.indexOf(MARKER);
    if (idx < 0) return { ok: false, error: "noBlock", warnings: warnings };
    var tail = str.slice(idx + MARKER.length).split(/\n[ \t]*FIL[ \t]*>>>/)[0];
    var json = extractObject(tail);
    var obj = null;
    try {
      obj = json ? JSON.parse(json) : null;
    } catch (e) {
      obj = null;
    }
    if (!obj || typeof obj !== "object") return { ok: false, error: "badJson", warnings: warnings };
    if (!Array.isArray(obj.items) || !obj.items.length) return { ok: false, error: "noItems", warnings: warnings };
    var seen = {};
    var items = [];
    obj.items.slice(0, MAX_ITEMS + 10).forEach(function (raw, i) {
      if (!raw || typeof raw !== "object") return warnings.push({ code: "skippedItem", index: i + 1 });
      var title = clean(raw.title, 120);
      if (title.length < 2) return warnings.push({ code: "skippedItem", index: i + 1 });
      var key = title.toLowerCase();
      if (seen[key]) return warnings.push({ code: "duplicate", title: title });
      if (items.length >= MAX_ITEMS) return warnings.push({ code: "tooMany", title: title });
      seen[key] = true;
      var points = parseInt(raw.points, 10);
      if (POINTS.indexOf(points) < 0) {
        if (raw.points != null && raw.points !== "") warnings.push({ code: "badPoints", title: title });
        points = null;
      }
      var pr = priorityOf(raw.priority);
      items.push({
        title: title,
        description: clean(raw.description, 600),
        priority: pr == null ? i + 1 : pr,
        points: points,
        acceptance: (Array.isArray(raw.acceptance) ? raw.acceptance : []).map(function (a) { return clean(a, 200); }).filter(Boolean).slice(0, 8),
        owner: clean(raw.owner, 40),
        order: i,
      });
    });
    if (!items.length) return { ok: false, error: "noItems", warnings: warnings };
    items.sort(function (a, b) {
      return a.priority - b.priority || a.order - b.order;
    });
    items.forEach(function (it) { delete it.order; });
    var cap = parseInt(obj.capacity, 10);
    var total = items.reduce(function (s, it) { return s + (it.points || 0); }, 0);
    return {
      ok: true,
      warnings: warnings,
      plan: {
        goal: clean(obj.goal, 200),
        capacity: isFinite(cap) && cap >= 1 && cap <= 500 ? cap : null,
        items: items,
        risks: (Array.isArray(obj.risks) ? obj.risks : []).map(function (r) { return clean(r, 200); }).filter(Boolean).slice(0, 8),
        total: total,
      },
    };
  }

  // Et regneark kan køre en celle, der starter med = + - @ som formel. En model skriver indholdet, så det neutraliseres.
  function csvCell(value) {
    var s = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // UTF-8 med BOM, så Excel viser æ, ø og å rigtigt. (Fjernes BOM'en, hvis et importværktøj fejltolker første kolonne.)
  function toCsv(plan) {
    var rows = [["Title", "Description", "Priority", "Story points", "Acceptance criteria", "Owner"]];
    plan.items.forEach(function (it) {
      rows.push([it.title, it.description, it.priority, it.points == null ? "" : it.points, it.acceptance.join(" | "), it.owner]);
    });
    return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  function mdCell(v) {
    return String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  }

  var TEXT = {
    da: { title: "Sprintplan", goal: "Sprintmål", cap: "Kapacitet", total: "Planlagt", pts: "point", over: "Over kapaciteten", cols: ["Prioritet", "Historie", "Point", "Ansvarlig"], acc: "Acceptkriterier", risks: "Risici", none: "ikke angivet" },
    en: { title: "Sprint plan", goal: "Sprint goal", cap: "Capacity", total: "Planned", pts: "points", over: "Over capacity", cols: ["Priority", "Story", "Points", "Owner"], acc: "Acceptance criteria", risks: "Risks", none: "not stated" },
  };

  function toMarkdown(plan, locale) {
    var t = TEXT[locale === "da" ? "da" : "en"];
    var out = ["# " + t.title, ""];
    out.push("**" + t.goal + ":** " + (plan.goal || t.none));
    out.push("**" + t.cap + ":** " + (plan.capacity == null ? t.none : plan.capacity + " " + t.pts));
    out.push("**" + t.total + ":** " + plan.total + " " + t.pts + (plan.capacity != null && plan.total > plan.capacity ? " — **" + t.over + "**" : ""));
    out.push("", "| " + t.cols.join(" | ") + " |", "|---|---|---|---|");
    plan.items.forEach(function (it) {
      out.push("| " + [it.priority, mdCell(it.title), it.points == null ? "?" : it.points, mdCell(it.owner)].join(" | ") + " |");
    });
    plan.items.forEach(function (it) {
      out.push("", "## " + it.priority + ". " + mdCell(it.title));
      if (it.description) out.push("", it.description);
      if (it.acceptance.length) {
        out.push("", "**" + t.acc + ":**");
        it.acceptance.forEach(function (a) { out.push("- " + a); });
      }
    });
    if (plan.risks.length) {
      out.push("", "## " + t.risks);
      plan.risks.forEach(function (r) { out.push("- " + r); });
    }
    return out.join("\n") + "\n";
  }

  return { MARKER: MARKER, POINTS: POINTS, parse: parse, toCsv: toCsv, toMarkdown: toMarkdown };
});
