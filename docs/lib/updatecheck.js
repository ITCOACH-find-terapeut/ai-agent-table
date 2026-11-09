// Opdateringstjek: sammenlign versioner, læs en udgivelses-feed, vælg den rigtige fil og kontrollér dens checksum. Ren logik uden netværk, DOM og Electron.
// Intet sendes af sig selv: tjekket kører kun, når du trykker, og det sender hverken version, navn eller andre oplysninger om dig.
// window.RundbordUpdate i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordUpdate = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var DEFAULT_FEED = "https://api.github.com/repos/ITCOACH-find-terapeut/ai-agent-table/releases/latest";

  function parseVersion(v) {
    var m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(String(v == null ? "" : v).trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  // → 1 (a er nyere), 0 (ens), -1 (a er ældre), null (en af dem kan ikke læses)
  function compareVersions(a, b) {
    var x = parseVersion(a);
    var y = parseVersion(b);
    if (!x || !y) return null;
    for (var i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    }
    return 0;
  }

  // Kun https; http kun til din egen computer (til test). Alt andet afvises.
  function feedUrlOk(url) {
    var m = /^(https?):\/\/([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(String(url || "").trim());
    if (!m) return false;
    if (m[1].toLowerCase() === "https") return true;
    return /^(localhost|127\.0\.0\.1)$/i.test(m[2]);
  }

  function cleanText(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
  }

  // Læser en GitHub-udgivelse ({ tag_name, body, html_url, assets: [{ name, size, url, browser_download_url }] }) eller en egen feed ({ version, notes, assets: [{ name, size, url }] }).
  // → { version, notes, page, assets: [{ name, size, url, apiUrl }] } eller null
  function parseFeed(json) {
    if (!json || typeof json !== "object") return null;
    var version = cleanText(json.tag_name || json.version, 40).replace(/^v/i, "");
    if (!parseVersion(version)) return null;
    var assets = (Array.isArray(json.assets) ? json.assets : [])
      .map(function (a) {
        return a && typeof a === "object"
          ? { name: cleanText(a.name, 200), size: Math.max(0, Math.floor(Number(a.size) || 0)), url: String(a.browser_download_url || a.url || ""), apiUrl: a.browser_download_url && a.url ? String(a.url) : "" }
          : null;
      })
      .filter(function (a) { return a && a.name && /^https?:\/\//i.test(a.url); })
      .slice(0, 40);
    return { version: version, notes: cleanText(json.body || json.notes, 1500), page: /^https:\/\//i.test(String(json.html_url || json.page || "")) ? String(json.html_url || json.page) : "", assets: assets };
  }

  // Filen til denne maskine. Vælg aldrig en installer til en anden arkitektur.
  function pickAsset(assets, platform, arch) {
    var list = assets || [];
    function find(re) {
      return list.filter(function (a) { return re.test(a.name); })[0] || null;
    }
    if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return find(arch === "arm64" ? /-arm64\.dmg$/ : /-x64\.dmg$/);
    if (platform === "win32" && arch === "x64") return find(/-x64\.exe$/);
    if (platform === "linux" && arch === "x64") return find(/-x64\.tar\.xz$/);
    return null;
  }

  // SHA256SUMS.txt: "<hash>  <filnavn>" pr. linje → { filnavn: hash }
  function parseSums(text) {
    var out = {};
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
      if (m) out[m[2]] = m[1].toLowerCase();
    });
    return out;
  }

  function hashMatches(expected, actual) {
    return /^[0-9a-f]{64}$/i.test(String(expected || "")) && String(expected).toLowerCase() === String(actual || "").toLowerCase();
  }

  // Samlet svar til visningen. platform/arch: som Node.
  function evaluate(current, feed, platform, arch) {
    if (!feed) return { state: "unreadable" };
    var cmp = compareVersions(feed.version, current);
    if (cmp === null) return { state: "unreadable" };
    if (cmp <= 0) return { state: cmp === 0 ? "current" : "ahead", latest: feed.version };
    var asset = pickAsset(feed.assets, platform, arch);
    return { state: "newer", latest: feed.version, notes: feed.notes, page: feed.page, asset: asset };
  }

  return { DEFAULT_FEED: DEFAULT_FEED, parseVersion: parseVersion, compareVersions: compareVersions, feedUrlOk: feedUrlOk, parseFeed: parseFeed, pickAsset: pickAsset, parseSums: parseSums, hashMatches: hashMatches, evaluate: evaluate };
});
