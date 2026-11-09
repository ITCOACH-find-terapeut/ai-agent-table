// Nøglelager på Linux: Electrons safeStorage vælger selv en backend ud fra skrivebordsmiljøet. På fx Hyprland
// (Omarchy) finder den ikke en udbyder og falder tilbage til "basic_text", der kun skjuler værdier bag en
// fast, kendt adgangskode. Ren logik; window.RundbordKeystore i appen, require() i main.js og node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordKeystore = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var PROTECTED = ["gnome_libsecret", "gnome-libsecret", "kwallet", "kwallet5", "kwallet6"];

  // Hvilket --password-store-flag skal sættes? null = lad Electron vælge (andre systemer, KDE, eller brugeren har valgt selv).
  function pickPasswordStore(env, platform) {
    if (platform !== "linux") return null;
    var desktop = String((env && env.XDG_CURRENT_DESKTOP) || "").toLowerCase();
    if (desktop.indexOf("kde") >= 0 || desktop.indexOf("plasma") >= 0) return null; // KWallet findes selv
    return "gnome-libsecret"; // Secret Service (gnome-keyring) — den Omarchy leverer
  }

  // Beskytter backenden rent faktisk noget? Uden for Linux er svaret altid ja (Keychain/DPAPI).
  function isProtectedBackend(backend, platform) {
    if (platform !== "linux") return true;
    return PROTECTED.indexOf(String(backend || "")) >= 0;
  }

  return { pickPasswordStore: pickPasswordStore, isProtectedBackend: isProtectedBackend };
});
