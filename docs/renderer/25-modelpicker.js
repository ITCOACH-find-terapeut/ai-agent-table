// 25-modelpicker.js
// Modelfeltet som en søgbar liste: skriv de første bogstaver, og alle modeller, der passer, vises; ↑ ↓ og Enter vælger. Man kan stadig skrive et navn, der ikke står på listen.

  var modelOptions = [];
  var modelActive = -1;
  var MODEL_DROP_MAX = 200;

  function setModelOptions(list) {
    modelOptions = (list || []).slice();
    var drop = document.getElementById("modelDrop");
    if (drop && !drop.hidden) renderModelDrop(false);
  }

  // Træf, der begynder med det skrevne, kommer først; derefter dem, der indeholder det. Uden tekst vises alle.
  function modelMatches(query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return modelOptions.slice();
    var starts = [];
    var contains = [];
    modelOptions.forEach(function (m) {
      var i = m.toLowerCase().indexOf(q);
      if (i === 0) starts.push(m);
      else if (i > 0) contains.push(m);
    });
    return starts.concat(contains);
  }

  function renderModelDrop(showAll) {
    var input = document.getElementById("modelInput");
    var drop = document.getElementById("modelDrop");
    var q = showAll ? "" : input.value;
    var all = modelMatches(q);
    var shown = all.slice(0, MODEL_DROP_MAX);
    var ql = String(q || "").trim().toLowerCase();
    var current = input.value.trim();
    drop.innerHTML =
      shown
        .map(function (m, i) {
          var at = ql ? m.toLowerCase().indexOf(ql) : -1;
          var label = at >= 0 ? escapeHtml(m.slice(0, at)) + "<b>" + escapeHtml(m.slice(at, at + ql.length)) + "</b>" + escapeHtml(m.slice(at + ql.length)) : escapeHtml(m);
          return '<div class="model-opt' + (m === current ? " current" : "") + '" role="option" id="modelOpt' + i + '" data-v="' + escapeHtml(m) + '" data-i="' + i + '">' + label + "</div>";
        })
        .join("") +
      (all.length > shown.length ? '<div class="model-more">+' + (all.length - shown.length) + "</div>" : "");
    modelActive = -1;
    var cur = drop.querySelector(".model-opt.current");
    if (cur && showAll) cur.scrollIntoView({ block: "nearest" });
    drop.hidden = !shown.length;
    input.setAttribute("aria-expanded", String(!drop.hidden));
  }

  function closeModelDrop() {
    var drop = document.getElementById("modelDrop");
    var input = document.getElementById("modelInput");
    if (drop) drop.hidden = true;
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    modelActive = -1;
  }

  function chooseModel(value) {
    var input = document.getElementById("modelInput");
    input.value = value;
    closeModelDrop();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveModelActive(delta) {
    var drop = document.getElementById("modelDrop");
    var opts = drop.querySelectorAll(".model-opt");
    if (!opts.length) return;
    modelActive = (modelActive + delta + opts.length) % opts.length;
    Array.prototype.forEach.call(opts, function (el, i) {
      el.classList.toggle("active", i === modelActive);
    });
    opts[modelActive].scrollIntoView({ block: "nearest" });
    document.getElementById("modelInput").setAttribute("aria-activedescendant", opts[modelActive].id);
  }

  function bindModelPicker() {
    var input = document.getElementById("modelInput");
    var drop = document.getElementById("modelDrop");
    // Åbner med alle modeller og markerer teksten, så de første bogstaver, man skriver, erstatter den.
    input.addEventListener("focus", function () {
      input.select();
      renderModelDrop(true);
    });
    input.addEventListener("click", function () {
      if (drop.hidden) renderModelDrop(true);
    });
    input.addEventListener("input", function () {
      renderModelDrop(false);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (drop.hidden) renderModelDrop(true);
        moveModelActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (drop.hidden) renderModelDrop(true);
        moveModelActive(-1);
      } else if (e.key === "Enter") {
        var opts = drop.querySelectorAll(".model-opt");
        if (!drop.hidden && modelActive >= 0 && opts[modelActive]) {
          e.preventDefault();
          chooseModel(opts[modelActive].getAttribute("data-v"));
        } else closeModelDrop();
      } else if (e.key === "Escape") {
        if (!drop.hidden) {
          e.preventDefault();
          e.stopPropagation();
          closeModelDrop();
        }
      } else if (e.key === "Tab") {
        closeModelDrop();
      }
    });
    // mousedown (før feltet mister fokus), så et klik på en model ikke går tabt
    drop.addEventListener("mousedown", function (e) {
      var opt = e.target.closest ? e.target.closest(".model-opt") : null;
      if (!opt) return;
      e.preventDefault();
      chooseModel(opt.getAttribute("data-v"));
    });
    input.addEventListener("blur", function () {
      setTimeout(closeModelDrop, 120);
    });
  }
