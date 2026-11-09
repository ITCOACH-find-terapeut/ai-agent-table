// 38-update.js
// Opdateringer: tjek, om der er en nyere version, og hent den med kontrolleret checksum. Intet sker af sig selv, og du installerer selv.
// Tjekket sender hverken din version eller andet om dig. Webudgaven har ingen opdateringer, så afsnittet skjules der.

  var updateInfoState = null;
  var updateDownloading = false;

  function formatUpdateSize(bytes) {
    return bytes ? (bytes / (1024 * 1024)).toFixed(0) + " MB" : "?";
  }

  function setUpdateStatus(text) {
    document.getElementById("updateStatus").textContent = text || "";
  }

  function resetUpdateInfo() {
    updateInfoState = null;
    document.getElementById("updateInfo").hidden = true;
  }

  function licenseDate(iso) {
    var d = new Date(String(iso) + "T12:00:00");
    if (isNaN(d.getTime())) return String(iso || "");
    var loc = typeof store === "object" && store && store.locale === "en" ? "en-GB" : "da-DK";
    return d.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" });
  }

  // Beskeden, når opdateringstjekket afvises, fordi licensen mangler, er udløbet eller ikke kan bruges. Intet er sendt nogen steder.
  function licenseBlockedText(lic) {
    if (lic && lic.state === "expired") return t("updateErrLicenseExpired", { date: licenseDate(lic.expires) });
    if (lic && lic.state === "invalid") return t("updateErrLicenseInvalid");
    return t("updateErrLicense");
  }

  function renderLicense(st) {
    var line = document.getElementById("licenseStatus");
    var clearBtn = document.getElementById("licenseClearBtn");
    if (!line) return;
    var state = (st && st.state) || "none";
    line.textContent =
      state === "valid" ? (st.expires ? t("licenseValid", { name: st.name, date: licenseDate(st.expires) }) : t("licenseValidNoExpiry", { name: st.name })) :
      state === "expired" ? t("licenseExpiredLine", { name: st.name, date: licenseDate(st.expires) }) :
      state === "invalid" ? t("licenseInvalidLine") : t("licenseNone");
    clearBtn.hidden = state === "none";
  }

  function showUpdateResult(res) {
    var info = document.getElementById("updateInfo");
    info.hidden = true;
    updateInfoState = null;
    document.getElementById("updateVersionLine").textContent = t("updateVersionLine", { version: res.current });
    if (!res.ok) {
      setUpdateStatus(res.kind === "license" ? licenseBlockedText(res.license) : res.kind === "http" ? t("updateErrHttp", { status: res.status || "?" }) : t("updateErrNetwork"));
      return;
    }
    if (res.state === "current") return setUpdateStatus(t("updateStateCurrent", { version: res.current }));
    if (res.state === "ahead") return setUpdateStatus(t("updateStateAhead", { current: res.current, latest: res.latest }));
    if (res.state !== "newer") return setUpdateStatus(t("updateStateUnreadable"));
    setUpdateStatus(t("updateStateNewer", { latest: res.latest }));
    if (!res.asset) {
      setUpdateStatus(t("updateStateNewer", { latest: res.latest }) + " " + t("updateNoAsset"));
      return;
    }
    updateInfoState = res;
    document.getElementById("updateNotes").textContent = res.notes || "";
    var btn = document.getElementById("updateDownloadBtn");
    btn.textContent = t("updateDownloadBtn", { name: res.asset.name, size: formatUpdateSize(res.asset.size) });
    btn.disabled = false;
    info.hidden = false;
  }

  function bindLicense() {
    var input = document.getElementById("licenseInput");
    var msg = document.getElementById("licenseMsg");
    function say(text) { msg.textContent = text || ""; }
    var saveBtn = document.getElementById("licenseSaveBtn");
    var clearBtn = document.getElementById("licenseClearBtn");
    function setBusy(busy) { saveBtn.disabled = busy; clearBtn.disabled = busy; }
    window.rundbord.getLicense().then(renderLicense).catch(function () { say(t("licenseReadError")); });
    document.getElementById("licenseSaveBtn").addEventListener("click", function () {
      if (saveBtn.disabled) return;
      setBusy(true);
      say("");
      window.rundbord.setLicense(input.value).then(function (res) {
        if (res && res.ok) {
          input.value = "";
          say(t("licenseSaved"));
          resetUpdateInfo();
          setUpdateStatus("");
        } else {
          var reason = res && res.reason;
          say(t(reason === "signature" ? "licenseRejectSignature" : reason === "expired" ? "licenseRejectExpired" : reason === "feature" ? "licenseRejectFeature" : "licenseRejectFormat"));
        }
        if (res && res.status) renderLicense(res.status);
      }).catch(function () {
        say(t("licenseSaveError"));
      }).finally(function () { setBusy(false); });
    });
    document.getElementById("licenseClearBtn").addEventListener("click", function () {
      if (clearBtn.disabled) return;
      setBusy(true);
      window.rundbord.clearLicense().then(function (st) {
        say(t("licenseCleared"));
        resetUpdateInfo();
        renderLicense(st);
      }).catch(function () {
        say(t("licenseClearError"));
      }).finally(function () { setBusy(false); });
    });
  }

  function bindUpdate() {
    var section = document.getElementById("updateSection");
    if (!section) return;
    var heading = section.previousElementSibling;
    if (typeof window.rundbord.checkUpdate !== "function") {
      section.hidden = true;
      if (heading) heading.hidden = true;
      return;
    }
    if (typeof window.rundbord.getLicense === "function") bindLicense();
    var vline = document.getElementById("updateVersionLine");
    if (typeof appInfo === "object" && appInfo && appInfo.version) vline.textContent = t("updateVersionLine", { version: appInfo.version });
    var checkBtn = document.getElementById("updateCheckBtn");
    checkBtn.addEventListener("click", function () {
      if (checkBtn.disabled || updateDownloading) return;
      checkBtn.disabled = true;
      resetUpdateInfo();
      setUpdateStatus(t("updateChecking"));
      window.rundbord.checkUpdate().then(function (res) {
        showUpdateResult(res || { ok: false, kind: "network", current: "" });
      }).catch(function () {
        resetUpdateInfo();
        setUpdateStatus(t("updateErrNetwork"));
      }).finally(function () { checkBtn.disabled = false; });
    });
    document.getElementById("updateDownloadBtn").addEventListener("click", function () {
      var btn = this;
      if (!updateInfoState || btn.disabled) return;
      updateDownloading = true;
      btn.disabled = true;
      setUpdateStatus(t("updateDownloading"));
      window.rundbord.downloadUpdate().then(function (res) {
        if (res && res.ok) {
          setUpdateStatus(t(res.platform === "darwin" ? "updateDoneMac" : res.platform === "linux" ? "updateDoneLinux" : "updateDoneOther"));
          return;
        }
        btn.disabled = false;
        if (res && res.kind === "license") return setUpdateStatus(t("updateErrLicense"));
        setUpdateStatus(res && res.kind === "hash" ? t("updateErrHash") : res && res.kind === "nosums" ? t("updateErrNoSums") : t("updateErrDownload"));
      }).catch(function () {
        btn.disabled = false;
        setUpdateStatus(t("updateErrDownload"));
      }).finally(function () { updateDownloading = false; });
    });
  }
