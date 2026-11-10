// Miljøet, git køres med fra appen: git må aldrig spørge efter en adgangskode i en terminal. Er adgangen forkert (fx et ugyldigt token),
// skal det fejle med det samme med en fejlbesked, og ikke hænge og vente på, at nogen taster. Ren logik uden Electron.
// require() i main.js og node-tests.
function withoutPrompts(base) {
  return Object.assign({}, base || {}, { GIT_TERMINAL_PROMPT: "0" });
}

// GitHub-adressen uden noget indlejret brugernavn eller token. Kun https; ellers null.
function cleanRemoteUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!/^https:\/\//.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    u.username = "";
    u.password = "";
    u.hash = "";
    return u.toString();
  } catch (e) {
    return null;
  }
}

// Tokenet gives til git som en HTTP-header i miljøet (GIT_CONFIG_*, git 2.31+), kun til den ene vært.
// Så står det hverken i procesargumenterne (som andre brugere på maskinen kan se) eller i .git/config.
function withToken(base, remoteUrl, token) {
  const env = withoutPrompts(base);
  if (!token) return env;
  const origin = new URL(remoteUrl).origin;
  const n = Math.max(0, parseInt(env.GIT_CONFIG_COUNT, 10) || 0);
  env.GIT_CONFIG_COUNT = String(n + 1);
  env["GIT_CONFIG_KEY_" + n] = "http." + origin + "/.extraheader";
  env["GIT_CONFIG_VALUE_" + n] = "Authorization: Basic " + headerSecret(token);
  return env;
}

function headerSecret(token) {
  return Buffer.from("x-access-token:" + token).toString("base64");
}

// Fjerner tokenet (og dets header-form) fra en tekst, før den vises.
function scrubToken(text, token) {
  if (!token) return String(text);
  return String(text).split(token).join("***").split(headerSecret(token)).join("***");
}

module.exports = { withoutPrompts, cleanRemoteUrl, withToken, scrubToken };
