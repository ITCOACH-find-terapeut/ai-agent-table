// Ren logik til Stemme (ElevenLabs): klipper tekst til et fornuftigt kald-loft og oversætter
// ElevenLabs' egen svarform til det lille format appen selv bruger. Ingen netværk her —
// selve kaldet ligger i main.js. window.RundbordVoice i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordVoice = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var MAX_CHARS = 4000; // et langt kald bliver hurtigt dyrt — loft matcher ca. et langt svar

  // → { text, truncated }. Tomt/kun-whitespace input giver text: "".
  function clipForSpeech(text, maxChars) {
    var max = typeof maxChars === "number" ? maxChars : MAX_CHARS;
    var full = String(text == null ? "" : text);
    var clipped = full.slice(0, max);
    return { text: clipped.trim() ? clipped : "", truncated: full.length > clipped.length };
  }

  // ElevenLabs' /v1/voices svarer med voice_id/name (snake_case) — appen bruger kun det.
  function mapVoicesResponse(data) {
    var list = (data && data.voices) || [];
    return list.map(function (v) {
      return { voiceId: v.voice_id, name: v.name };
    });
  }

  // Tale-til-tekst: ElevenLabs svarer med { text, language_code, … } — appen bruger kun teksten.
  function parseTranscript(data) {
    var text = data && typeof data.text === "string" ? data.text : "";
    return text.replace(/\s+/g, " ").trim().slice(0, 2000);
  }

  // En kort tavs WAV-fil (16 kHz, mono, 16 bit), til at tjekke at en nøgle må bruge tale-til-tekst uden at sende rigtig tale.
  function silentWav(ms) {
    var rate = 16000;
    var samples = Math.max(1, Math.round((rate * (ms || 300)) / 1000));
    var bytes = new Uint8Array(44 + samples * 2);
    var dv = new DataView(bytes.buffer);
    function str(off, s) {
      for (var i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
    }
    str(0, "RIFF");
    dv.setUint32(4, 36 + samples * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); // PCM
    dv.setUint16(22, 1, true); // mono
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    str(36, "data");
    dv.setUint32(40, samples * 2, true);
    return bytes; // resten er nuller = tavshed
  }

  // Hvad betyder et svar fra ElevenLabs for en nøgle? ok | badKey (401) | noPermission (nøglen må ikke dette) | error
  function classifyStatus(status, bodyText) {
    if (status >= 200 && status < 300) return "ok";
    var body = String(bodyText || "");
    if (/missing_permissions|permission/i.test(body)) return "noPermission";
    if (status === 401) return "badKey";
    if (status === 403) return "noPermission";
    return "error";
  }

  // Et talt valg ("vælg B", "B", "option be") → "A" | "B" | "C" | null. Kun et ENKELT, tydeligt valg tæller.
  var LETTERS = { a: "A", aa: "A", b: "B", be: "B", bee: "B", bi: "B", c: "C", ce: "C", se: "C", see: "C", si: "C" };
  function parseChoice(text) {
    var t = String(text || "")
      .toLowerCase()
      .replace(/[.,!?;:"“”'()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    var m = /^(?:(?:jeg\s+)?(?:vælger|vaelger|vælg|vaelg|valg|vil\s+have|tag|choose|pick|select|option|mulighed|svar|i choose|i pick)\s+)?(?:(?:valg|option|mulighed|punkt)\s+)?([a-z]{1,3})$/.exec(t);
    return m && LETTERS[m[1]] ? LETTERS[m[1]] : null;
  }

  return {
    MAX_CHARS: MAX_CHARS,
    clipForSpeech: clipForSpeech,
    mapVoicesResponse: mapVoicesResponse,
    parseTranscript: parseTranscript,
    silentWav: silentWav,
    classifyStatus: classifyStatus,
    parseChoice: parseChoice,
  };
});
