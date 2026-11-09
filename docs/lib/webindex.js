// Omskriver appens index.html til webudgavens (og den indspillede demos) form. Bruges af scripts/build-web.js og af main.js (demovinduet),
// så der kun er én udgave af omskrivningen. Ren tekstbehandling uden filer og uden Electron.
// opts.embedded: demoen i selve appen. Den kalder aldrig nogen udbyder, så indholdspolitikken tillader ingen forbindelser.
function transformIndex(html, opts) {
  const embedded = Boolean(opts && opts.embedded);
  const connectSrc = embedded ? "connect-src 'none'" : "connect-src https: http://localhost:* http://127.0.0.1:*";

// 0. Webudgavens standardsprog er engelsk (adapteren skifter til dansk, hvis brugeren vælger det).
html = html.replace('<html lang="da">', '<html lang="en">');

// 1. Indholdspolitik: kald til udbydere går direkte fra browseren (https og lokale modeller).
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src data: blob:; ${connectSrc}; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'">`);

// 2. Mobil/tablet og ikon.
html = html.replace('<meta name="color-scheme" content="light dark">', '<meta name="color-scheme" content="light dark">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="icon" href="icon.png">');

// 3. Mørkt tema kan vælges manuelt: gentag den mørke palet som [data-theme="dark"], og lad systemets mørke vige for [data-theme="light"].
const m = html.match(/@media \(prefers-color-scheme: dark\)\{\n  :root\{([\s\S]*?)\n  \}\n\}/);
if (!m) throw new Error("den mørke palet blev ikke fundet i index.html");
html = html.replace(m[0], m[0].replace("  :root{", '  :root:not([data-theme="light"]){') + `\n:root[data-theme="dark"]{${m[1]}\n}`);

// 4. Adapteren indlæses efter bibliotekerne og før brugerfladen.
const marker = '<script src="renderer/01-catalog.js"></script>';
if (!html.includes(marker)) throw new Error("kunne ikke finde indsætningspunkt for adapteren");
html = html.replace(marker, '<script src="web/demo.js"></script>\n<script src="web/rundbord-web.js"></script>\n' + marker);
// Velkomst og demobånd lægges ovenpå brugerfladen, efter at den er startet.
const initMarker = '<script src="renderer/20-init.js"></script>';
if (!html.includes(initMarker)) throw new Error("kunne ikke finde 20-init.js");
html = html.replace(initMarker, initMarker + '\n<script src="web/welcome.js"></script>');
  return html;
}

module.exports = { transformIndex };
