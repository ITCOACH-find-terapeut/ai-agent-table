// Dublér et bord og find et navn, der ikke findes i forvejen (Dine borde under ⚙ → Hele programmet).
// En kopi har samme opsætning (stole, instrukser, Modelprofil API, runder, kontrol, pile) men ingen samtale, ingen målinger, ingen hukommelse
// og ingen GitHub-adgang: bordet er et nyt, rent udgangspunkt. Nøgler ligger i Modelprofiler API og følger med stolenes modelId.
// Ren logik uden DOM og Electron. window.RundbordBoardCopy i appen, require() i main.js og node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordBoardCopy = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var NAME_MAX = 60;

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Et navn, der ikke findes i listen (uden hensyn til store/små bogstaver): «Navn», derefter «Navn (kopi)», «Navn (kopi 2)» osv.
  // Hedder bordet allerede «Navn (kopi)», bliver kopien «Navn (kopi 2)» og ikke «Navn (kopi) (kopi)».
  function uniqueName(existing, base, suffix) {
    var taken = {};
    (existing || []).forEach(function (n) {
      taken[String(n == null ? "" : n).trim().toLowerCase()] = true;
    });
    var word = String(suffix || "kopi");
    var b = String(base == null ? "" : base).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    var m = new RegExp("^(.*?)\\s*\\(" + escapeRe(word) + "(?: \\d+)?\\)$", "i").exec(b);
    var root = (m ? m[1] : b).trim() || "Nyt bord";
    root = root.slice(0, NAME_MAX).trim();
    if (!m && !taken[root.toLowerCase()]) return root;
    function make(n) {
      var tail = " (" + word + (n > 1 ? " " + n : "") + ")";
      return root.slice(0, NAME_MAX - tail.length).trim() + tail;
    }
    var n = 1;
    while (taken[make(n).toLowerCase()]) n += 1;
    return make(n);
  }

  // opts: { name, makeId: () => nyt id }. Returnerer en ny tavle; originalen røres ikke.
  function duplicate(board, opts) {
    var o = opts || {};
    var makeId = typeof o.makeId === "function" ? o.makeId : function () { return "id-" + Math.random().toString(36).slice(2); };
    var copy = JSON.parse(JSON.stringify(board || {}));
    var map = {};
    (copy.seats || []).forEach(function (s) {
      if (s && s.id) map[s.id] = makeId();
    });
    // Stolenes id'er står også som nøgler og værdier i pile og ruter; udskift dem alle som hele, citerede tegnstrenge.
    var text = JSON.stringify(copy);
    Object.keys(map).forEach(function (oldId) {
      text = text.split(JSON.stringify(oldId)).join(JSON.stringify(map[oldId]));
    });
    copy = JSON.parse(text);
    copy.id = makeId();
    copy.projectName = String(o.name || copy.projectName || "Nyt bord").slice(0, NAME_MAX);
    copy.githubUrl = "";
    copy.githubToken = "";
    copy.messages = [];
    copy.events = [];
    copy.proposals = [];
    copy.thirdEyeCalls = [];
    copy.memory = [];
    delete copy.inbox;
    delete copy.folderName;
    copy.turn = { seatId: null, reason: "", at: null };
    var shield = copy.shield && typeof copy.shield === "object" ? copy.shield : {};
    copy.shield = { enabled: Boolean(shield.enabled), terms: shield.terms || [], allow: shield.allow || [], mapping: {} };
    (copy.seats || []).forEach(function (s) {
      s.calls = [];
      s.history = [];
    });
    return copy;
  }

  return { NAME_MAX: NAME_MAX, uniqueName: uniqueName, duplicate: duplicate };
});
