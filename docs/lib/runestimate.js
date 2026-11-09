// Skøn over, hvad en kørsel typisk koster, ud fra de seneste kald på hver stol (hændelserne call.completed), og hvilke stole der ingen kendt pris har.
// Det er et skøn og siges som et: stole uden tidligere kald kan ikke skønnes, og tal uden kendt pris regnes aldrig som 0. Ren logik uden DOM og Electron.
// window.RundbordRunEstimate i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordRunEstimate = factory();
})(typeof window !== "undefined" ? window : this, function () {
  // o: { seats: [{ id, name, model }], events, priceTable, estimateSeat: (events, seatId) → { n, costUsd } | null (lib/routing.js estimate) }
  // → { totalUsd (kun de stole, der kan skønnes, ellers null), known: antal skønnede stole, total: antal stole, unknown: [navne uden skøn], noPrice: [modeller uden listepris], perSeat }
  function estimate(o) {
    var opts = o || {};
    var seats = opts.seats || [];
    var table = opts.priceTable || {};
    var per = [];
    var unknown = [];
    var noPrice = [];
    var total = 0;
    var known = 0;
    seats.forEach(function (s) {
      var est = typeof opts.estimateSeat === "function" ? opts.estimateSeat(opts.events || [], s.id) : null;
      var usd = est && typeof est.costUsd === "number" && isFinite(est.costUsd) ? est.costUsd : null;
      per.push({ name: s.name, usd: usd, n: est ? est.n : 0 });
      if (usd === null) unknown.push(s.name);
      else {
        total += usd;
        known += 1;
      }
      if (s.model && !table[s.model] && noPrice.indexOf(s.model) < 0) noPrice.push(s.model);
    });
    return { totalUsd: known ? total : null, known: known, total: seats.length, unknown: unknown, noPrice: noPrice, perSeat: per };
  }

  return { estimate: estimate };
});
