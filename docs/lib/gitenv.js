// Miljøet, git køres med fra appen: git må aldrig spørge efter en adgangskode i en terminal. Er adgangen forkert (fx et ugyldigt token),
// skal det fejle med det samme med en fejlbesked, og ikke hænge og vente på, at nogen taster. Ren logik uden Electron.
// require() i main.js og node-tests.
function withoutPrompts(base) {
  return Object.assign({}, base || {}, { GIT_TERMINAL_PROMPT: "0" });
}

module.exports = { withoutPrompts: withoutPrompts };
