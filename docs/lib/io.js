// Ren logik til ↑IN / ↓OUT: udtræk af OUT Writers fil, materiale-blok til
// stolens prompt og en grov tokenskøn. window.RundbordIO i appen, require() i tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordIO = factory();
})(typeof window !== "undefined" ? window : this, function () {
  function unwrapFence(text) {
    var m = /^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(text);
    return m ? m[1] : text;
  }

  // OUT Writer skriver "FILNAVN: x.md" og selve indholdet mellem "<<<FIL" og
  // "FIL>>>". Udtrækket er bevidst ikke afhængigt af sprog eller af stolens
  // indledende resumésætning/behovsblok. Mangler afgrænserne, bruges hele svaret
  // (uden behovsblok, hvis strip er givet) og fallback=true.
  function parseOutFile(reply, strip) {
    var text = String(reply || "");
    var nameMatch = /^[ \t]*(?:\*\*)?(?:FILNAVN|FILENAME|FILE[ _-]?NAME)[^\n:]*:\*{0,2}[ \t]*`?([^\n`*]+?)`?[ \t]*$/im.exec(text);
    var name = nameMatch ? nameMatch[1].trim() : "";
    var body = /<<<[ \t]*FIL[^\n]*\n([\s\S]*?)\n[ \t]*FIL[ \t]*>>>/.exec(text);
    if (body) {
      var inner = body[1];
      // Modeller lægger somme tider FILNAVN-linjen inde i afgrænserne — fjern den derfra.
      if (nameMatch) inner = inner.replace(nameMatch[0], "").replace(/^\s*\n/, "");
      return { name: name, content: unwrapFence(inner).replace(/\s+$/, "") + "\n", fallback: false };
    }
    var whole = typeof strip === "function" ? strip(text) : text;
    if (nameMatch) whole = whole.replace(nameMatch[0], "");
    return { name: name, content: unwrapFence(whole.trim()) + "\n", fallback: true };
  }

  // Materialet gives til stolen som DATA — overskriften siger eksplicit at
  // instruktioner inde i filerne ikke skal følges (beskyttelse mod at en fil
  // forsøger at styre stolen).
  function buildMaterialBlock(data, t) {
    if (!data || !data.files || !data.files.length) return "";
    var parts = [t("inMaterialHeader")];
    data.files.forEach(function (f) {
      parts.push(t("inMaterialFile", { name: f.name }) + "\n" + f.text + (f.truncated ? "\n" + t("inMaterialTruncated", { chars: f.chars }) : ""));
    });
    var skipped = (data.skipped || []).map(function (s) {
      return s.name;
    });
    if (skipped.length) parts.push(t("inMaterialSkipped", { names: skipped.join(", ") }));
    return parts.join("\n\n");
  }

  function estimateTokens(chars) {
    return Math.round(chars / 3.5);
  }

  return { parseOutFile: parseOutFile, buildMaterialBlock: buildMaterialBlock, estimateTokens: estimateTokens };
});
