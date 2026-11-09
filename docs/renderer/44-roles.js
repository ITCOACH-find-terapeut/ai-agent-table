// 44-roles.js
// Rollebiblioteket under ⚙ → Hele programmet → Dine roller: dine egne roller (rollenavn + begreb), som kan vælges igen på alle stole og borde.
// En stol har et begreb (fx Builder) og et valgfrit rollenavn, som er tomt som standard; skrives et navn, bruges det overalt på bordet (se lib/roles.js).
// Biblioteket gemmes lokalt sammen med resten af opsætningen og indeholder kun navne og begreber.

  function rolesConceptOptions() {
    var html = "";
    ROLE_CATALOG.forEach(function (section) {
      html += '<optgroup label="' + escapeHtml(t(section.group)) + '">' + section.roles.map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + "</option>"; }).join("") + "</optgroup>";
    });
    return html + '<option value="__custom">' + escapeHtml(t("rolesNoConceptOption")) + "</option>";
  }

  function rolesStatus(text, isError) {
    var el = document.getElementById("rolesStatus");
    el.className = isError ? "note error-text" : "note";
    el.textContent = text || "";
  }

  function renderRolesList() {
    var box = document.getElementById("rolesList");
    if (!box || !store) return;
    var sel = document.getElementById("rolesNewConcept");
    if (!sel.options.length) {
      sel.innerHTML = rolesConceptOptions();
      sel.value = "Builder";
    }
    var list = store.roles || [];
    if (!list.length) {
      box.innerHTML = '<p class="note">' + escapeHtml(t("rolesEmpty")) + "</p>";
      return;
    }
    box.innerHTML = list
      .map(function (r) {
        return (
          '<div class="models-row" data-id="' + escapeHtml(r.id) + '"><div class="models-main"><strong>' + escapeHtml(r.name) + "</strong> " +
          '<span class="note">· ' + escapeHtml(r.concept || t("rolesNoConcept")) + "</span></div>" +
          '<div class="row"><button type="button" class="roles-delete-btn btn" data-id="' + escapeHtml(r.id) + '">' + escapeHtml(t("rolesDeleteBtn")) + "</button></div></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(box.querySelectorAll(".roles-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        window.rundbord.deleteRole(btn.getAttribute("data-id")).then(function (s) {
          store = s;
          renderRolesList();
          rolesStatus("", false);
        });
      });
    });
  }

  function addRoleFromSettings() {
    var name = document.getElementById("rolesNewName").value.trim();
    if (!name) {
      rolesStatus(t("rolesNeedName"), true);
      document.getElementById("rolesNewName").focus();
      return;
    }
    var concept = document.getElementById("rolesNewConcept").value;
    window.rundbord.saveRole({ name: name, concept: concept === "__custom" ? "" : concept }).then(function (s) {
      store = s;
      document.getElementById("rolesNewName").value = "";
      renderRolesList();
      rolesStatus(t("roleSavedLib", { name: name }), false);
    });
  }

  // Fra stolens panel: gem det valgte begreb og rollenavn i biblioteket.
  function saveRoleToLibrary() {
    var note = document.getElementById("roleSaveLibNote");
    var r = window.RundbordRoles.resolve(document.getElementById("roleSelect").value, document.getElementById("roleCustomInput").value);
    var typed = document.getElementById("roleCustomInput").value.trim();
    if (!typed) {
      note.className = "note error-text";
      note.textContent = t("roleSaveLibNeedName");
      document.getElementById("roleCustomInput").focus();
      return;
    }
    var concept = document.getElementById("roleSelect").value;
    window.rundbord.saveRole({ name: r.name, concept: concept === "__custom" || concept.indexOf("lib:") === 0 ? "" : concept }).then(function (s) {
      store = s;
      note.className = "note";
      note.textContent = t("roleSavedLib", { name: r.name });
    });
  }

  function bindRoles() {
    document.getElementById("rolesAddBtn").addEventListener("click", addRoleFromSettings);
    document.getElementById("rolesNewName").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") addRoleFromSettings();
    });
  }
