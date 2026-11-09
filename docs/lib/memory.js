// Bordets hukommelse: beslutninger og fakta, brugeren selv har bedt bordet huske. Ren logik.
// window.RundbordMemory i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordMemory = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_ITEMS = 30;
  var MAX_CHARS = 300;

  function clean(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  }

  function normalize(items) {
    var seen = {};
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function (it) {
      var text = clean(it && it.text);
      var key = text.toLowerCase();
      if (!text || seen[key]) return;
      seen[key] = true;
      out.push({ id: String((it && it.id) || "").slice(0, 60) || "m" + out.length, text: text, at: (it && it.at) || null });
    });
    return out.slice(-MAX_ITEMS);
  }

  // Tilføjer tekster (dubletter og tomme springes over). Returnerer { items, added }.
  function addTexts(items, texts, now, makeId) {
    var current = normalize(items);
    var have = {};
    current.forEach(function (i) {
      have[i.text.toLowerCase()] = true;
    });
    var added = 0;
    (texts || []).forEach(function (t) {
      var text = clean(t);
      if (!text || have[text.toLowerCase()]) return;
      have[text.toLowerCase()] = true;
      current.push({ id: makeId ? makeId() : "m" + Date.now() + added, text: text, at: now || null });
      added += 1;
    });
    return { items: current.slice(-MAX_ITEMS), added: added };
  }

  // Tekstblokken der lægges i stolens instruktion. Tom hukommelse giver "".
  function buildBlock(items, t) {
    var list = normalize(items);
    if (!list.length) return "";
    return t("memoryHeader") + "\n" + list.map(function (i) {
      return "- " + i.text;
    }).join("\n");
  }

  function estimateTokens(items) {
    var chars = normalize(items).reduce(function (n, i) {
      return n + i.text.length + 3;
    }, 0);
    return Math.round(chars / 3.5);
  }

  return { normalize: normalize, addTexts: addTexts, buildBlock: buildBlock, estimateTokens: estimateTokens, MAX_ITEMS: MAX_ITEMS, MAX_CHARS: MAX_CHARS };
});
