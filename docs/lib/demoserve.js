// Hvilke af appens egne filer den indspillede demo må få udleveret, og med hvilken filtype. Demoen er webudgaven (web/demo.js), kørt i et eget vindue
// uden adgang til dine borde; den får kun brugerfladens egne filer, aldrig andet fra disken. Ren logik uden filer og uden Electron.
const WEB_ALLOWED = ["rundbord-web.js", "demo.js", "welcome.js"];
const TOP_DIRS = ["renderer", "locales", "fonts", "lib"];
const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

// urlPath: stien i adressen (fx "/renderer/01-catalog.js"). → { kind: "index" } | { kind: "file", rel, type } | null (ikke tilladt).
function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath == null ? "" : urlPath));
  } catch (e) {
    return null;
  }
  p = p.replace(/^\/+/, "");
  if (!p || p === "index.html") return { kind: "index" };
  if (p.indexOf("\0") >= 0 || p.indexOf("\\") >= 0) return null;
  const parts = p.split("/");
  if (parts.some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  if (p === "icon.png") return { kind: "file", rel: "build/icon-1024.png", type: TYPES[".png"] };
  const top = parts[0];
  let ok = false;
  if (TOP_DIRS.indexOf(top) >= 0) ok = !/^lib\/pdf-text\.js$/.test(p);
  else if (top === "web") ok = parts.length === 2 && WEB_ALLOWED.indexOf(parts[1]) >= 0;
  else if (top === "help") ok = parts.length > 2 && (parts[1] === "dist" || parts[1] === "img");
  if (!ok) return null;
  const dot = p.lastIndexOf(".");
  const type = dot >= 0 ? TYPES[p.slice(dot).toLowerCase()] : null;
  if (!type) return null;
  return { kind: "file", rel: p, type: type };
}

module.exports = { resolve, WEB_ALLOWED };
