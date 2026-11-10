// Afgrænser tekst, stolen skal behandle som DATA og ikke som instruktioner (filer fra IN, forrige stols svar).
// Hver blok får en tilfældig markør pr. kald, så indholdet ikke kan efterligne sin egen slutmarkør og
// "bryde ud" af blokken. Det er en afbødning, ikke en garanti: en model kan stadig lade sig påvirke.
// window.RundbordUntrusted i appen, require() i tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordUntrusted = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // 8 tilfældige tegn (crypto, hvor den findes).
  function nonce() {
    var c = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : null;
    var out = "";
    if (c) {
      var bytes = c.getRandomValues(new Uint8Array(4));
      for (var i = 0; i < bytes.length; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
      return out;
    }
    for (var j = 0; j < 8; j++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }

  // Sætter start- og slutmarkør om teksten. Findes markøren allerede i teksten (umuligt at gætte, men tjekket), vælges en ny.
  function wrap(text, startLine, endLine, makeId) {
    var body = String(text == null ? "" : text);
    var id = makeId || nonce();
    for (var tries = 0; tries < 5 && body.indexOf(id) >= 0; tries++) id = nonce();
    return startLine(id) + "\n" + body + "\n" + endLine(id);
  }

  return { nonce: nonce, wrap: wrap };
});
