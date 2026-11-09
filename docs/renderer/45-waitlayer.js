// 45-waitlayer.js
// Ventelaget (lib/waitlayer.js): mens et svar er på vej, står der i stolens boble et roligt lag (farvetone, pixelmosaik, pixelsværm eller 3D-partikler) med ét ord i midten.
// Ordet er stolens rolle eller «Kontrollerer» og skifter aldrig af sig selv. Laget findes kun fra det øjeblik, forespørgslen er sendt til modellen, til første ord kommer
// (se chatSeatStreaming i 09-relay.js), og aldrig mens bolden ligger hos dig (fx Beskyttelsens valg). Alt tegnes lokalt på et lærred, uden biblioteker.
// Tegningen standser af sig selv i et skjult vindue, begrænses til 30 billeder i sekundet og står stille, hvis systemet er sat til «reducer bevægelse».

  var WAIT_H = 88;
  var WAIT_H_PARTICLES = 104;
  var WAIT_FPS_CAP = 30;

  function waitStyleNow() {
    return window.RundbordWaitLayer.normalize(store && store.waitStyle);
  }

  function waitReduceMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // Stolens farve som [r, g, b], læst fra den CSS-variabel, stolen bruger (følger lyst og mørkt tema).
  function waitSeatRgb(el, seat) {
    el.style.color = seatColorVar(seat.color);
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color);
    el.style.color = "";
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [46, 92, 78];
  }

  function waitRgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function waitLighter(c, f) {
    return c.map(function (v) {
      return Math.round(v + (255 - v) * f);
    });
  }

  // Punkterne i et ord: tegn ordet usynligt på et skjult lærred, og tag de steder, hvor der er farve.
  function waitWordPoints(word, w, h) {
    var off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    var o = off.getContext("2d");
    var size = 58;
    o.font = "700 " + size + "px system-ui,-apple-system,'Segoe UI',sans-serif";
    var width = o.measureText(word).width;
    if (width > w * 0.8) size = Math.max(18, Math.floor((size * w * 0.8) / width));
    o.font = "700 " + size + "px system-ui,-apple-system,'Segoe UI',sans-serif";
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.fillStyle = "#000";
    o.fillText(word, w / 2, h / 2);
    var d = o.getImageData(0, 0, w, h).data;
    var pts = [];
    for (var y = 0; y < h; y += 3) for (var x = 0; x < w; x += 3) if (d[(y * w + x) * 4 + 3] > 128) pts.push([x, y]);
    return pts;
  }

  // Tegner de tre udtryk. Hver giver en funktion draw(t, dt) (t i sekunder, dt siden sidst), som tegner på et gennemsigtigt lærred over lagets baggrund.
  function waitPainter(style, ctx, w, h, rgb, word, reduced) {
    var light = waitLighter(rgb, 0.45);
    if (style === "particles") {
      return window.RundbordWaitParticles.create(ctx, w, h, rgb);
    }
    if (style === "mosaic") {
      var steps = [0, 1, 2, 3].map(function (q) {
        return waitRgba(rgb, 0.1 + q * 0.24);
      });
      var cell = 8;
      return function (t) {
        ctx.clearRect(0, 0, w, h);
        for (var y = 0; y < h / cell; y++)
          for (var x = 0; x < w / cell; x++) {
            var v = 0.5 + (Math.sin(x * 0.21 + t * 0.9) + Math.sin(y * 0.33 - t * 0.7) + Math.sin((x + y) * 0.12 + t * 0.5)) / 6;
            ctx.fillStyle = steps[Math.max(0, Math.min(3, Math.floor(v * 4)))];
            ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
          }
      };
    }
    if (style === "swarm") {
      var targets = waitWordPoints(word, w, h);
      var N = 700;
      var P = [];
      for (var i = 0; i < N; i++) {
        var tp = targets.length ? targets[(Math.random() * targets.length) | 0] : [w / 2, h / 2];
        var amb = i % 4 === 0;
        P.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, a: 0.55 + Math.random() * 0.45, s: Math.random() < 0.3 ? 3 : 2, tx: tp[0], ty: tp[1], amb: amb });
      }
      return function (t, dt) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = waitRgba(rgb, 1);
        for (var k = 0; k < N; k++) {
          var p = P[k];
          if (p.amb) {
            p.tx = w / 2 + Math.cos(t * 0.45 + k * 0.7) * w * 0.46;
            p.ty = h / 2 + Math.sin(t * 0.6 + k * 1.3) * h * 0.46;
          }
          if (reduced) {
            p.x = p.tx;
            p.y = p.ty;
          } else {
            p.vx += ((p.tx - p.x) * 70 - p.vx * 9) * dt;
            p.vy += ((p.ty - p.y) * 70 - p.vy * 9) * dt;
            p.x += p.vx * dt + Math.sin(t * 2.1 + k) * 0.12;
            p.y += p.vy * dt + Math.cos(t * 1.7 + k) * 0.12;
          }
          ctx.globalAlpha = p.a;
          ctx.fillRect(p.x, p.y, p.s, p.s);
        }
        ctx.globalAlpha = 1;
      };
    }
    // Farvetone (standard): seks bløde farveflader i stolens farve og en lysere tone af den
    return function (t) {
      ctx.clearRect(0, 0, w, h);
      for (var k = 0; k < 6; k++) {
        var cx = w * (0.5 + 0.42 * Math.sin(t * 0.33 + k * 1.7));
        var cy = h * (0.5 + 0.5 * Math.cos(t * 0.27 + k * 2.3));
        var r = Math.max(w, 300) * 0.34;
        var col = k % 3 === 2 ? light : rgb;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, waitRgba(col, k % 3 === 2 ? 0.5 : 0.7));
        g.addColorStop(1, waitRgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    };
  }

  // Lægger et ventelag i stolens boble (før beskedteksten). Returnerer { el, stop() }; stop() fjerner laget og standser tegningen.
  function startWaitLayer(seat, bubble, beforeEl) {
    var style = waitStyleNow();
    var word = t(window.RundbordWaitLayer.wordKey({ concept: window.RundbordRoles.conceptOf(seat), checks: Boolean(seat.checks) }));
    var el = document.createElement("div");
    el.className = "wait-layer";
    el.setAttribute("role", "status");
    el.setAttribute("data-style", style);
    el.setAttribute("data-word", word);
    var layer = { el: el, stopped: false, stop: null };
    var raf = 0;
    layer.stop = function () {
      if (layer.stopped) return;
      layer.stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    var canvas = null;
    if (style !== "off") {
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      el.appendChild(canvas);
    }
    var wordEl = document.createElement("span");
    wordEl.className = "wait-word";
    wordEl.textContent = word;
    el.appendChild(wordEl);
    if (beforeEl && beforeEl.parentNode === bubble) bubble.insertBefore(el, beforeEl);
    else bubble.appendChild(el);

    var reduced = waitReduceMotion();
    el.setAttribute("data-motion", style === "off" || reduced ? "still" : "live");
    if (!canvas) return layer;

    var w = Math.max(200, el.clientWidth || 560);
    var h = style === "particles" ? WAIT_H_PARTICLES : WAIT_H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    if (!ctx) return layer;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var draw = waitPainter(style, ctx, w, h, waitSeatRgb(el, seat), word, reduced);
    draw(3, 0.016); // første billede med det samme (også i et skjult vindue, hvor der ikke tegnes flere)
    if (reduced) return layer;
    var last = 0;
    var frame = function (now) {
      if (layer.stopped) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / WAIT_FPS_CAP - 2) return;
      var dt = Math.min((now - last) / 1000 || 0.033, 0.06);
      last = now;
      draw(now / 1000, dt);
    };
    raf = requestAnimationFrame(frame);
    return layer;
  }
