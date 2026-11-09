// Bygger multimodalt indhold (tekst + billeder) i det format hver udbyder forventer, og
// afgør hvilke udbydere der reelt kan se billeder. Ren logik, ingen netværk. Billeder lægges
// KUN på den sidste besked i historikken (den lige tilføjede opgave) — ellers ville allerede
// sendte billeder blive gensendt (og betalt for) ved hver ny tur i samtalen.
// window.RundbordVision i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordVision = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var IMAGE_EXT_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
  // Skal holdes i sync begge steder den bruges (main.js's chatfunktioner og renderer/01-catalog.js's
  // IMAGE_CAPABLE_PROVIDERS) — "custom" er brugerens eget OpenAI-kompatible endpoint, eget ansvar.
  var VISION_PROVIDERS = { anthropic: true, openai: true, google: true, custom: true };

  function isImageExt(ext) {
    return Boolean(IMAGE_EXT_MIME[String(ext || "").toLowerCase()]);
  }
  function mimeForExt(ext) {
    return IMAGE_EXT_MIME[String(ext || "").toLowerCase()] || null;
  }
  function providerSupportsVision(provider) {
    return Boolean(VISION_PROVIDERS[provider]);
  }

  function anthropicContentParts(text, images) {
    var parts = (images || []).map(function (img) {
      return { type: "image", source: { type: "base64", media_type: img.mimeType, data: img.dataBase64 } };
    });
    if (text) parts.push({ type: "text", text: text });
    return parts;
  }
  function openaiContentParts(text, images) {
    var parts = (images || []).map(function (img) {
      return { type: "image_url", image_url: { url: "data:" + img.mimeType + ";base64," + img.dataBase64 } };
    });
    if (text) parts.push({ type: "text", text: text });
    return parts;
  }
  function googleContentParts(text, images) {
    var parts = (images || []).map(function (img) {
      return { inlineData: { mimeType: img.mimeType, data: img.dataBase64 } };
    });
    if (text) parts.push({ text: text });
    return parts;
  }

  // history: [{role, content}]. Returnerer en NY liste (rører ikke originalen) hvor sidste
  // besked får sit content erstattet af en del-liste — eller historien uændret, hvis der
  // ingen billeder er (så tekst-only-kald er 100% som før).
  function attachImagesToLast(history, images, contentPartsFn) {
    if (!images || !images.length || !history || !history.length) return history;
    return history.map(function (m, i) {
      return i === history.length - 1 ? { role: m.role, content: contentPartsFn(m.content, images) } : m;
    });
  }

  return {
    IMAGE_EXT_MIME: IMAGE_EXT_MIME,
    VISION_PROVIDERS: VISION_PROVIDERS,
    isImageExt: isImageExt,
    mimeForExt: mimeForExt,
    providerSupportsVision: providerSupportsVision,
    anthropicContentParts: anthropicContentParts,
    openaiContentParts: openaiContentParts,
    googleContentParts: googleContentParts,
    attachImagesToLast: attachImagesToLast,
  };
});
