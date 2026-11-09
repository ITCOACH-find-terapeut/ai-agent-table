// Sikker skrivning af filer, brugeren ikke må miste: først en midlertidig fil, så omdøbning (en afbrudt skrivning efterlader den gamle fil urørt).
// Kun til Node (main.js og tests); ingen DOM.
const fs = require("fs");

// Skriver data til file via en midlertidig fil i samme mappe. options: { mode } (fx 0o600).
function writeFileAtomic(file, data, options) {
  const opts = options || {};
  const tmp = file + "." + process.pid + ".tmp";
  let fd = null;
  try {
    fd = fs.openSync(tmp, "w", opts.mode === undefined ? 0o666 : opts.mode);
    fs.writeFileSync(fd, data, "utf8");
    try { fs.fsyncSync(fd); } catch (e) { /* ikke alle filsystemer kan; omdøbningen er stadig atomisk */ }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e2) {} }
    try { fs.unlinkSync(tmp); } catch (e3) {}
    throw e;
  }
}

// Er filen gyldig JSON? (En ulæselig fil må ikke blive til sikkerhedskopi og overskrive en god kopi.)
function isReadableJson(file) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { writeFileAtomic, isReadableJson };
