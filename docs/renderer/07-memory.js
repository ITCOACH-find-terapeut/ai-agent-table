// 07-memory.js
// Hukommelsespanelet (punkter bordet skal huske på tværs af opgaver).

  // ---- Hukommelse ----
  function saveMemory(items) {
    return window.rundbord.setMemory(store.activeBoardId, items).then(function (s) {
      store = s;
      renderMemoryPanel();
      return s;
    });
  }

  function renderMemoryPanel() {
    var items = window.RundbordMemory.normalize(currentBoard().memory);
    document.getElementById("memoryTokens").textContent = items.length
      ? t("memoryTokensLine", { count: items.length, tokens: window.RundbordMemory.estimateTokens(items) })
      : t("memoryEmpty");
    var list = document.getElementById("memoryList");
    list.innerHTML = items
      .map(function (it) {
        return (
          '<div class="memory-item"><input type="text" maxlength="300" data-id="' + escapeHtml(it.id) + '" value="' + escapeHtml(it.text) + '">' +
          '<button type="button" class="btn memory-del-btn" data-id="' + escapeHtml(it.id) + '">' + escapeHtml(t("memoryDeleteBtn")) + "</button></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(list.querySelectorAll("input"), function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-id");
        saveMemory(
          window.RundbordMemory.normalize(currentBoard().memory).map(function (it) {
            return it.id === id ? { id: it.id, text: input.value, at: it.at } : it;
          })
        );
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll(".memory-del-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        saveMemory(
          window.RundbordMemory.normalize(currentBoard().memory).filter(function (it) {
            return it.id !== id;
          })
        );
      });
    });
  }

  function openMemoryPanel() {
    ["settingsPanel", "seatPanel", "pricePanel", "turnPanel", "proposalsPanel", "addSeatPanel", "startConfirmPanel", "projectMenu", "metricsPanel", "ioPanel"].forEach(function (id) {
      document.getElementById(id).hidden = true;
    });
    renderMemoryPanel();
    document.getElementById("memoryPanel").hidden = false;
  }

  function addMemoryTexts(texts) {
    var r = window.RundbordMemory.addTexts(currentBoard().memory, texts, new Date().toISOString(), uid);
    if (!r.added) return Promise.resolve(0);
    return saveMemory(r.items).then(function () {
      return r.added;
    });
  }

  // ---- ↑IN / ↓OUT ----
  var ioState = { in: [], out: [], folder: "" };
  var ioBoardId = null;

