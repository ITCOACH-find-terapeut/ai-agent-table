// 46-overview.js
// Overblik (lib/overview.js): ét sted i topbaren for Næste skridt, Tilbageblik, Uenigheder, Regning og priser og Jeg sidder fast.
// Hver række åbner det, den gamle knap åbnede (knapperne ligger stadig i siden, skjulte, så intet af det, der virker, er flyttet).
// Tallet på knappen er kun det, appen ved kræver dig: ting, kun du kan afgøre, og en kørsel, der venter på dig.

  var overviewOpen = false;
  var overviewState = { counts: { total: 0, decide: 0 }, blocking: false };

  // Række → den skjulte knap, der gør arbejdet
  var OVERVIEW_TARGETS = { needs: "openNeedsToggleBtn", reflect: "reflectBtn", diff: "diffBtn", spend: "boardSpend", stuck: "stuckBtn" };

  function fillOverviewRows() {
    var sum = window.RundbordOverview.summarize({ needsTotal: overviewState.counts.total, needsDecide: overviewState.counts.decide, blocking: overviewState.blocking });
    var sub = document.getElementById("ovSubNeeds");
    if (sub) {
      sub.textContent = sum.needs.marker === "block" ? t("overviewNeedsBlock") : sum.needs.decide || sum.needs.total ? t("overviewNeedsSome", { total: sum.needs.total, decide: sum.needs.decide }) : t("overviewNeedsNone");
    }
    var mark = document.getElementById("ovMarkNeeds");
    if (mark) {
      var n = sum.needs.decide + (overviewState.blocking ? 1 : 0);
      mark.hidden = n === 0;
      mark.textContent = String(n);
    }
    var spend = document.getElementById("boardSpend");
    var spendSub = document.getElementById("ovSubSpend");
    if (spendSub) spendSub.textContent = t("overviewSpendSub", { amount: spend ? spend.textContent : "$0.00" });
    return sum;
  }

  // Kaldes, hver gang Næste skridt tegnes om (counts: inboxCounts(), blocking: venter en kontrolpause på dig).
  function renderOverview(counts, blocking) {
    var btn = document.getElementById("overviewBtn");
    if (!btn) return;
    overviewState = { counts: counts || { total: 0, decide: 0 }, blocking: Boolean(blocking) };
    var sum = fillOverviewRows();
    var badge = document.getElementById("overviewBadge");
    badge.hidden = sum.badge === 0;
    badge.textContent = String(sum.badge);
    btn.classList.toggle("needs-you", sum.badge > 0 && !sum.urgent);
    btn.classList.toggle("blocking", sum.urgent);
    btn.title = sum.badge ? t("overviewBadgeTitle", { count: sum.badge }) : t("overviewTitle");
    if (typeof renderEye === "function") renderEye();
  }

  function setOverviewOpen(open) {
    overviewOpen = Boolean(open);
    var menu = document.getElementById("overviewMenu");
    var btn = document.getElementById("overviewBtn");
    if (!menu || !btn) return;
    if (overviewOpen) fillOverviewRows();
    menu.hidden = !overviewOpen;
    btn.setAttribute("aria-expanded", overviewOpen ? "true" : "false");
  }

  function bindOverview() {
    var btn = document.getElementById("overviewBtn");
    var menu = document.getElementById("overviewMenu");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOverviewOpen(!overviewOpen);
    });
    Array.prototype.forEach.call(menu.querySelectorAll(".overview-row"), function (row) {
      row.addEventListener("click", function () {
        var target = document.getElementById(OVERVIEW_TARGETS[row.getAttribute("data-ov")]);
        setOverviewOpen(false);
        if (target) target.click();
      });
    });
    // Menuen lukker ved Escape og ved et klik udenfor
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overviewOpen) {
        setOverviewOpen(false);
        btn.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (overviewOpen && !(e.target && e.target.closest && e.target.closest(".overview-wrap"))) setOverviewOpen(false);
    });
  }
