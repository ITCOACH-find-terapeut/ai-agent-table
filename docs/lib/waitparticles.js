// Ventelag: «Partikler». Tusindvis af små, lysende punkter i et tredimensionelt rum, som samles, opløses og bliver til bølger, ringe, spiraler, kugler og en galakse.
// Ren tegning og matematik uden DOM og uden biblioteker: create(ctx, w, h, rgb) giver draw(t, dt) (t i sekunder, dt siden sidst). Hver bevægelse er en funktion af tiden og af et fast tal pr. punkt,
// så et stillestående billede (reducer bevægelse) og et levende billede er samme tegning. Ordet i midten ligger i HTML'en og røres ikke af denne fil.
// window.RundbordWaitParticles i appen, require() i node-tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RundbordWaitParticles = factory();
})(typeof window !== "undefined" ? window : this, function () {
  var TAU = Math.PI * 2;
  var COUNT = 1800;
  var HOLD = 3.6; // sekunder en form står
  var MORPH = 2.4; // sekunder en overgang varer
  var SHAPES = 5; // bølge, ring, spiral, kugle, galakse
  var CAMERA = 4; // afstand fra kameraet til midten
  var GAIN = [1, 0.85, 1.1, 0.5, 1]; // lysstyrke pr. form: den tætte kugle skal dæmpes, ellers brænder den hvid

  // Ensartede tilfældige tal ud fra et frø, så to lag ser ens ud og testen kan gentages.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function smooth(x) {
    var c = x < 0 ? 0 : x > 1 ? 1 : x;
    return c * c * (3 - 2 * c);
  }

  // Faste tal for hvert punkt: to koordinater på formen (u, v), tre tilfældige tal, en forsinkelse i overgangen og en farve (0 stolens, 1 lysere, 2 kølig accent).
  function makeParams(n, seed) {
    var r = rng(seed);
    var P = { n: n, u: new Float32Array(n), v: new Float32Array(n), a: new Float32Array(n), b: new Float32Array(n), c: new Float32Array(n), delay: new Float32Array(n), tint: new Uint8Array(n) };
    for (var i = 0; i < n; i++) {
      P.u[i] = r();
      P.v[i] = r();
      P.a[i] = r() * 2 - 1;
      P.b[i] = r() * 2 - 1;
      P.c[i] = r() * 2 - 1;
      P.delay[i] = r();
      var q = r();
      P.tint[i] = q < 0.62 ? 0 : q < 0.9 ? 1 : 2;
    }
    return P;
  }

  // Punkt i på form k til tiden t, skrevet i out = [x, y, z]. Rummet: lodret går fra -1 til 1, vandret fra -L til L.
  function shapePoint(k, i, t, P, L, out) {
    var u = P.u[i];
    var v = P.v[i];
    var a, b, rad, s, c;
    if (k === 0) {
      // en bølgeflade, der kører
      out[0] = (u * 2 - 1) * L;
      out[2] = (v * 2 - 1) * 1.7;
      out[1] = 0.46 * Math.sin(u * 11 + t * 1.1) * Math.cos(v * 4.4 - t * 0.7) + 0.13 * Math.sin(u * 25 - t * 1.9 + v * 3);
    } else if (k === 1) {
      // en ring (torus)
      a = u * TAU + t * 0.25;
      b = v * TAU;
      rad = 1.3 + 0.36 * Math.cos(b);
      out[0] = rad * Math.cos(a);
      out[1] = 0.36 * Math.sin(b);
      out[2] = rad * Math.sin(a);
    } else if (k === 2) {
      // to sammenslyngede spiraler langs bredden
      a = u * TAU * 5 + t * 0.9 + (i & 1) * Math.PI;
      rad = 0.62 + 0.1 * P.a[i];
      out[0] = (u * 2 - 1) * L * 0.92;
      out[1] = rad * Math.sin(a);
      out[2] = rad * Math.cos(a) + 0.08 * P.b[i];
    } else if (k === 3) {
      // en kugle, som trækker vejret
      a = Math.acos(1 - 2 * ((i + 0.5) / P.n));
      b = 2.399963 * i + t * 0.3;
      rad = 1.0 * (1 + 0.07 * Math.sin(a * 6 + t * 1.3));
      s = Math.sin(a);
      out[0] = rad * s * Math.cos(b);
      out[1] = rad * Math.cos(a);
      out[2] = rad * s * Math.sin(b);
    } else {
      // en galakse med tre arme
      rad = Math.sqrt(v) * 2.0;
      c = Math.floor(u * 3) * (TAU / 3);
      a = rad * 2.6 + c + t * 0.22;
      out[0] = Math.cos(a) * rad * 1.35 + 0.1 * P.a[i];
      out[1] = 0.22 * P.b[i] * (1.2 - Math.min(1, rad / 2));
      out[2] = Math.sin(a) * rad * 0.9 + 0.1 * P.c[i];
    }
  }

  // Et lysende punkt som lille billede (hvid kerne, blød kant) i en given farve; tegnes mange gange med forskellig størrelse og styrke.
  function makeSprite(makeCanvas, color) {
    var size = 32;
    var cv = makeCanvas(size, size);
    var g = cv.getContext("2d");
    if (!g) return null;
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.8)");
    grad.addColorStop(0.1, "rgba(" + color[0] + "," + color[1] + "," + color[2] + ",0.9)");
    grad.addColorStop(0.45, "rgba(" + color[0] + "," + color[1] + "," + color[2] + ",0.22)");
    grad.addColorStop(1, "rgba(" + color[0] + "," + color[1] + "," + color[2] + ",0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function lighter(c, f) {
    return c.map(function (v) {
      return Math.round(v + (255 - v) * f);
    });
  }

  // Hvilken form og hvor langt i overgangen vi er til tiden t: { from, to, m } med m fra 0 (står på from) til 1 (er på to).
  function timeline(t) {
    var cycle = SHAPES * (HOLD + MORPH);
    var x = ((t % cycle) + cycle) % cycle;
    var seg = HOLD + MORPH;
    var k = Math.floor(x / seg);
    var into = x - k * seg;
    return { from: k, to: (k + 1) % SHAPES, m: into <= HOLD ? 0 : (into - HOLD) / MORPH };
  }

  // Punktets sted til tiden t (før kameraet): blandet mellem to former, med en forsinkelse og et sus af uro i overgangen, så formerne opløses og samles.
  function particlePoint(i, tl, t, P, L, out, tmp) {
    shapePoint(tl.from, i, t, P, L, out);
    if (tl.m <= 0) return;
    var span = 0.62;
    var p = smooth((tl.m - P.delay[i] * (1 - span)) / span);
    if (p <= 0) return;
    shapePoint(tl.to, i, t, P, L, tmp);
    var swirl = Math.sin(p * Math.PI) * 0.55;
    out[0] += (tmp[0] - out[0]) * p + P.a[i] * swirl;
    out[1] += (tmp[1] - out[1]) * p + P.b[i] * swirl;
    out[2] += (tmp[2] - out[2]) * p + P.c[i] * swirl;
  }

  // ctx: et 2D-lærred, w og h: dets størrelse i billedpunkter, rgb: stolens farve, opts.makeCanvas(w, h): laver et skjult lærred (i node-tests en falsk).
  function create(ctx, w, h, rgb, opts) {
    var o = opts || {};
    var n = o.count || COUNT;
    var makeCanvas =
      o.makeCanvas ||
      function (cw, ch) {
        var cv = document.createElement("canvas");
        cv.width = cw;
        cv.height = ch;
        return cv;
      };
    var P = makeParams(n, o.seed == null ? 20260508 : o.seed);
    var sprites = [makeSprite(makeCanvas, lighter(rgb, 0.25)), makeSprite(makeCanvas, lighter(rgb, 0.6)), makeSprite(makeCanvas, [96, 190, 255])];
    var L = Math.min(4.2, Math.max(1.6, (w / h) * 0.8));
    var pos = [0, 0, 0];
    var tmp = [0, 0, 0];
    var sy = h * 0.33;
    var sx = h * 0.33;
    var cx = w / 2;
    var cy = h / 2;
    var first = true;

    return function draw(t, dt) {
      // Mørk scene med et let slør over forrige billede, så bevægelsen efterlader en blød hale. Første billede dækker helt.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = first ? "rgb(6,9,20)" : "rgba(6,9,20,0.34)";
      ctx.fillRect(0, 0, w, h);
      first = false;
      var tl = timeline(t);
      var gain = GAIN[tl.from] + (GAIN[tl.to] - GAIN[tl.from]) * smooth(tl.m);
      // kameraet svinger kun lidt til siden: formerne drejer selv, og de brede (bølge og spiral) må ikke vende kanten mod os
      var yaw = 0.38 * Math.sin(t * 0.21);
      var pitch = 0.5 + 0.2 * Math.sin(t * 0.13);
      var cyaw = Math.cos(yaw);
      var syaw = Math.sin(yaw);
      var cp = Math.cos(pitch);
      var sp = Math.sin(pitch);
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < n; i++) {
        particlePoint(i, tl, t, P, L, pos, tmp);
        // drej om lodret akse, derefter vip
        var x1 = pos[0] * cyaw - pos[2] * syaw;
        var z1 = pos[0] * syaw + pos[2] * cyaw;
        var y2 = pos[1] * cp - z1 * sp;
        var z2 = pos[1] * sp + z1 * cp;
        var den = CAMERA + z2;
        if (den < 0.6) continue;
        var f = CAMERA / den;
        var px = cx + x1 * sx * f;
        var py = cy + y2 * sy * f;
        if (px < -6 || px > w + 6 || py < -6 || py > h + 6) continue;
        // dybde: det fjerne er mindre og svagere, det nære større og skarpere
        var near = f * f;
        var a = Math.min(1, (0.06 + 0.26 * near) * gain);
        var r = (1.5 + 1.3 * P.delay[i]) * f;
        ctx.globalAlpha = a;
        var sp0 = sprites[P.tint[i]];
        if (sp0) ctx.drawImage(sp0, px - r, py - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  return { COUNT: COUNT, SHAPES: SHAPES, HOLD: HOLD, MORPH: MORPH, rng: rng, makeParams: makeParams, shapePoint: shapePoint, timeline: timeline, particlePoint: particlePoint, create: create };
});
