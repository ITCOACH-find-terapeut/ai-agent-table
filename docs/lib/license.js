// Licens: en signeret tekst, som appen kontrollerer lokalt (Ed25519). Intet sendes nogen steder, og appen ringer ikke hjem.
// Formatet er RB1.<nyttelast base64url>.<signatur base64url>. Signaturen dækker præcis teksten "RB1.<nyttelast>", så der ikke er noget at normalisere.
// Den private nøgle ligger kun hos udgiveren (scripts/licens.js) og er aldrig i appen eller repoet; her ligger kun den offentlige.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("crypto"));
  else root.RundbordLicense = factory(null);
})(typeof self !== "undefined" ? self : this, function (crypto) {
  var PREFIX = "RB1";
  var MAX_TEXT = 4000;

  // De offentlige nøgler, licenser kontrolleres mod (en licens er gyldig, hvis én af dem passer). Flere nøgler gør det muligt at have en til manuel udstedelse
  // og en til en senere webportal, uden at den ene nøgles private halvdel skal ligge der, hvor den andens ligger.
  var PUBLIC_KEY_PEMS = ["-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAabPtb7AvrhRJLmKLhGcKDsDdk14L01etVufUnKdDbaU=\n-----END PUBLIC KEY-----\n"];

  function b64uEncode(buf) {
    return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64uDecode(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  function cleanName(s) {
    return String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function isDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var date = new Date(s + "T00:00:00Z");
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
  }

  // Lav en licens (kun til udstederens script og tests). payload: { name, plan, features, issued, expires|null }.
  function sign(payload, privateKeyPem) {
    var body = {
      v: 1,
      id: payload.id || b64uEncode(crypto.randomBytes(9)),
      name: cleanName(payload.name),
      plan: String(payload.plan || "beta").slice(0, 20),
      features: Array.isArray(payload.features) ? payload.features.map(String).slice(0, 10) : ["updates"],
      issued: payload.issued,
      expires: payload.expires || null,
    };
    var head = PREFIX + "." + b64uEncode(Buffer.from(JSON.stringify(body)));
    var sig = crypto.sign(null, Buffer.from(head), crypto.createPrivateKey(privateKeyPem));
    return head + "." + b64uEncode(sig);
  }

  // Kontrollér en licenstekst. opts: { publicKey (PEM eller liste af PEM; ellers appens egne), now (Date) }.
  // → { ok:true, payload } | { ok:false, reason:"format"|"signature"|"expired", payload? }
  function verify(text, opts) {
    opts = opts || {};
    var s = String(text == null ? "" : text).replace(/\s+/g, "");
    if (!s || s.length > MAX_TEXT) return { ok: false, reason: "format" };
    var parts = s.split(".");
    if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: "format" };
    var payloadBytes = b64uDecode(parts[1]);
    var sig = b64uDecode(parts[2]);
    if (!payloadBytes || !sig || sig.length !== 64) return { ok: false, reason: "format" };
    var keys = opts.publicKey ? [].concat(opts.publicKey) : PUBLIC_KEY_PEMS;
    var okSig = keys.some(function (k) {
      try { return crypto.verify(null, Buffer.from(PREFIX + "." + parts[1]), crypto.createPublicKey(k), sig); } catch (e) { return false; }
    });
    if (!okSig) return { ok: false, reason: "signature" };
    var p;
    try { p = JSON.parse(payloadBytes.toString("utf8")); } catch (e) { return { ok: false, reason: "format" }; }
    if (!p || p.v !== 1 || !isDate(p.issued) || !(p.expires === null || isDate(p.expires)) || !Array.isArray(p.features)) return { ok: false, reason: "format" };
    var payload = {
      id: String(p.id || "").slice(0, 40),
      name: cleanName(p.name),
      plan: String(p.plan || "").slice(0, 20),
      features: p.features.map(String).slice(0, 10),
      issued: p.issued,
      expires: p.expires,
    };
    var today = (opts.now || new Date()).toISOString().slice(0, 10);
    if (payload.expires && today > payload.expires) return { ok: false, reason: "expired", payload: payload };
    return { ok: true, payload: payload };
  }

  function hasFeature(result, feature) {
    return !!(result && result.ok && result.payload.features.indexOf(feature) !== -1);
  }

  return { PREFIX: PREFIX, PUBLIC_KEY_PEMS: PUBLIC_KEY_PEMS, sign: sign, verify: verify, hasFeature: hasFeature };
});
