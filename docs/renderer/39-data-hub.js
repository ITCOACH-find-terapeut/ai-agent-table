// 39-data-hub.js
// Bordets data som faner: Hukommelse, Beskyttelse, Målinger og Bordfil ligger i ét sted. Hvert panel er uændret og åbnes og lukkes som før;
// fanerne følger bare med i, hvilket der er åbent, og et klik på en fane åbner det samme panel som knappen under Dette bords data.

  var DATA_HUB_PANELS = ["memoryPanel", "shieldPanel", "metricsPanel", "tablePanel"];

  function syncDataHub() {
    var hub = document.getElementById("dataHub");
    if (!hub) return;
    var open = DATA_HUB_PANELS.filter(function (id) {
      var p = document.getElementById(id);
      return p && !p.hidden;
    })[0];
    hub.hidden = !open;
    Array.prototype.forEach.call(hub.querySelectorAll(".data-tab"), function (tab) {
      var on = tab.getAttribute("data-panel") === open;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    });
  }

  function bindDataHub() {
    var hub = document.getElementById("dataHub");
    if (!hub) return;
    // Kun ét af de fire paneler er åbent ad gangen: åbnes ét, lukkes de andre (nogle af åbnerne lukker ikke alle fire).
    DATA_HUB_PANELS.forEach(function (id) {
      var p = document.getElementById(id);
      if (!p) return;
      new MutationObserver(function () {
        if (!p.hidden) {
          DATA_HUB_PANELS.forEach(function (other) {
            var o = document.getElementById(other);
            if (o && other !== id && !o.hidden) o.hidden = true;
          });
        }
        syncDataHub();
      }).observe(p, { attributes: true, attributeFilter: ["hidden"] });
    });
    var tabs = Array.prototype.slice.call(hub.querySelectorAll(".data-tab"));
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var opener = document.getElementById(tab.getAttribute("data-open"));
        if (opener) opener.click();
      });
      // Piletaster flytter mellem fanerne, som man forventer af faner.
      tab.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var visible = tabs.filter(function (x) { return x.offsetParent !== null; });
        var i = visible.indexOf(tab);
        var next = visible[(i + (e.key === "ArrowRight" ? 1 : visible.length - 1)) % visible.length];
        if (next) {
          next.focus();
          next.click();
        }
      });
    });
    syncDataHub();
  }
