// 24-quickstart.js
// Hurtig start med OpenRouter: én nøgle, et bord med tre stole på tre forskellige modeller, priser udfyldt.
// Modelvalget er et startforslag (lib/openrouter.js), kontrolleret mod OpenRouters levende modelliste; intet er sendt til nogen model, før du starter en kørsel.

  var quickStartState = { starter: null, key: "" };
  var QS_PANELS = ["settingsPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel", "memoryPanel", "voicePanel", "shieldPanel", "tablePanel", "seatPanel"];

  function closeQuickStart() {
    document.getElementById("quickStartPanel").hidden = true;
    document.getElementById("quickStartKey").value = "";
    quickStartState = { starter: null, key: "" };
  }

  function openQuickStart() {
    if (typeof fillKeyExplain === "function") fillKeyExplain();
    QS_PANELS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.getElementById("quickStartResult").hidden = true;
    document.getElementById("quickStartStatus").textContent = "";
    document.getElementById("quickStartPanel").hidden = false;
    document.getElementById("quickStartKey").focus();
  }

  function quickStartPriceText(r) {
    if (!r.model) return "";
    if (r.inPerM == null || r.outPerM == null) return t("quickStartPriceUnknown");
    return t("quickStartPrice", { inp: r.inPerM, out: r.outPerM });
  }

  function renderQuickStartRows(starter) {
    document.getElementById("quickStartRows").innerHTML = starter
      .map(function (r) {
        var model = r.model ? escapeHtml(r.model) : escapeHtml(t("quickStartNotFound"));
        var note = r.note === "sameProvider" ? " " + escapeHtml(t("quickStartSameProvider")) : "";
        return (
          '<div class="qs-row' + (r.model ? "" : " qs-missing") + '"><span class="qs-role">' + escapeHtml(r.role) + " <small>(" + escapeHtml(t("quickStartTier_" + r.tier)) + ')</small></span>' +
          '<span class="qs-model">' + model + note + '</span><span class="qs-price">' + escapeHtml(quickStartPriceText(r)) + "</span></div>"
        );
      })
      .join("");
  }

  function fetchQuickStart() {
    var key = document.getElementById("quickStartKey").value.trim();
    var status = document.getElementById("quickStartStatus");
    if (!key) {
      status.textContent = t("quickStartNeedKey");
      return;
    }
    status.textContent = t("quickStartStatusFetching");
    window.rundbord.openrouterStarter(key).then(function (res) {
      if (!res || !res.ok) {
        status.textContent = (res && res.message) || t("unknownError");
        document.getElementById("quickStartResult").hidden = true;
        return;
      }
      quickStartState = { starter: res.starter, key: key };
      status.textContent = t("quickStartStatusOk", { count: res.count });
      renderQuickStartRows(res.starter);
      document.getElementById("quickStartResult").hidden = false;
    });
  }

  function createQuickStartBoard() {
    var st = quickStartState;
    if (!st.starter || !st.key) return;
    var btn = document.getElementById("quickStartCreateBtn");
    btn.disabled = true;
    window.rundbord
      .createBoard(t("quickStartBoardName"))
      .then(function (s) {
        store = s;
        var seats = st.starter.map(function (r, i) {
          return {
            id: uid(), name: r.role, provider: "openrouter", model: r.model || "", baseUrl: "", apiKey: st.key, hasKey: true,
            customInstruction: "", color: SWATCHES[i % SWATCHES.length], calls: [], icons: defaultIcons(), dials: defaultDials(), readsIn: false, checks: false, voiceId: "",
          };
        });
        return seats.reduce(function (p, seat) {
          return p.then(function () {
            return window.rundbord.saveSeat(store.activeBoardId, seat).then(function (s2) {
              store = s2;
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        // priserne fra OpenRouters egen liste (mærket som sådan), så forbrug kan regnes fra første kald
        return st.starter.reduce(function (p, r) {
          return p.then(function () {
            if (r.model && r.inPerM != null && r.outPerM != null) return window.rundbord.setPrice(r.model, r.inPerM, r.outPerM, "openrouter");
          });
        }, Promise.resolve());
      })
      .then(function () {
        return window.rundbord.getStore();
      })
      .then(function (s) {
        store = s;
        closeQuickStart();
        render();
        btn.disabled = false;
        return systemNote(t("quickStartDone", { n: st.starter.length }));
      })
      .catch(function () {
        btn.disabled = false;
      });
  }

  function bindQuickStart() {
    document.getElementById("quickStartCloseBtn").addEventListener("click", closeQuickStart);
    document.getElementById("quickStartFetchBtn").addEventListener("click", fetchQuickStart);
    document.getElementById("quickStartCreateBtn").addEventListener("click", createQuickStartBoard);
    document.getElementById("quickStartKey").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") fetchQuickStart();
    });
    var link = document.getElementById("quickStartKeyLink");
    link.addEventListener("click", function (ev) {
      ev.preventDefault();
      window.rundbord.openLink(PROVIDER_KEY_URL.openrouter);
    });
  }
