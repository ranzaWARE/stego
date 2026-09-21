/* STEGO — inchiostro adattivo.

   Il colore di un oggetto è un dato dell'utente e non va mai riscritto:
   quello che cambia è come lo si rende. Ogni colore viene confrontato col
   foglio su cui sta finendo — la tela nel tema corrente, o il bianco
   quando si esporta o si stampa — e si interviene solo se il contrasto
   non basta: ribaltando la luminosità per i quasi-neri e i quasi-bianchi,
   spostandola quel tanto che serve per le tinte di mezzo. Tinta e
   saturazione restano quelle scelte.

   Così una linea bianca si vede su carta bianca, una nera si vede su tela
   scura, il rosso resta rosso e l'ambra resta ambra.

   Deve essere caricato prima di draw.js. */
(function (global) {
  'use strict';

  // Sotto questo rapporto di contrasto (WCAG) un tratto sottile sparisce.
  var MIN_CONTRAST = 2.5;
  var INK_ON_LIGHT = '#111827';   // il nero di STEGO
  var INK_ON_DARK  = '#e6e9ef';

  // Il canvas normalizza qualsiasi colore CSS — nomi, hsl(), #abc — in
  // un formato che si può leggere indietro: molto meglio di un parser.
  var probe = document.createElement('canvas').getContext('2d');
  var parseCache = Object.create(null);

  function parse(css) {
    if (css == null) return null;
    var key = String(css);
    if (key in parseCache) return parseCache[key];
    var out = null;
    try {
      probe.fillStyle = '#000';
      probe.fillStyle = key;
      var v = probe.fillStyle;             // '#rrggbb' oppure 'rgba(r, g, b, a)'
      if (v[0] === '#') {
        out = { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16), a: 1 };
      } else {
        var m = v.match(/rgba?\(([^)]+)\)/);
        if (m) {
          var p = m[1].split(',').map(function (n) { return parseFloat(n); });
          out = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
      }
    } catch (e) { out = null; }
    parseCache[key] = out;
    return out;
  }

  function toCss(c) {
    var r = Math.round(Math.max(0, Math.min(255, c.r)));
    var g = Math.round(Math.max(0, Math.min(255, c.g)));
    var b = Math.round(Math.max(0, Math.min(255, c.b)));
    if (c.a != null && c.a < 1) return 'rgba(' + r + ',' + g + ',' + b + ',' + c.a + ')';
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function luminance(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function toHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else                h = ((r - g) / d + 4) / 6;
    }
    return { h: h, s: s, l: l, a: c.a };
  }

  function fromHsl(x) {
    if (x.s === 0) { var v = x.l * 255; return { r: v, g: v, b: v, a: x.a }; }
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = x.l < 0.5 ? x.l * (1 + x.s) : x.l + x.s - x.l * x.s;
    var p = 2 * x.l - q;
    return { r: hue(p, q, x.h + 1 / 3) * 255, g: hue(p, q, x.h) * 255, b: hue(p, q, x.h - 1 / 3) * 255, a: x.a };
  }

  // ---- foglio corrente --------------------------------------------------
  // Il valore vero sta in CSS (--paper), così tema e tela non possono
  // divergere. `forced` serve a esportare e stampare su bianco mentre a
  // schermo il tema resta quello che è.
  var forced = null;
  var paperCache = { theme: null, value: '#ffffff' };
  var inkCache = Object.create(null);

  function cssPaper() {
    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    if (paperCache.theme !== theme) {
      var v = '';
      try { v = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(); } catch (e) {}
      paperCache = { theme: theme, value: v || '#ffffff' };
      inkCache = Object.create(null);
    }
    return paperCache.value;
  }

  function paper() { return forced || cssPaper(); }

  function paperIsDark() {
    var p = parse(paper());
    return p ? luminance(p) < 0.35 : false;
  }

  // ---- mappatura --------------------------------------------------------
  function onPaper(color, paperColor) {
    var c = parse(color), p = parse(paperColor);
    if (!c || !p) return color;
    if (contrast(c, p) >= MIN_CONTRAST) return color;   // si vede già: non si tocca

    var dark = luminance(p) < 0.35;
    var hsl = toHsl(c);

    // Grigi e quasi-grigi: non c'è tinta da conservare, meglio
    // l'inchiostro canonico che un grigio spostato a caso.
    if (hsl.s < 0.08) return dark ? INK_ON_DARK : INK_ON_LIGHT;

    // Colori che leggono già come "inchiostro" (quasi neri) o come
    // "evidenziatore" (quasi bianchi): il ribaltamento dà il risultato che
    // uno si aspetta — il nero diventa chiaro sulla tela scura e viceversa.
    if (hsl.l < 0.25 || hsl.l > 0.75) {
      var flipped = fromHsl({ h: hsl.h, s: hsl.s, l: 1 - hsl.l, a: hsl.a });
      if (contrast(flipped, p) >= MIN_CONTRAST) return toCss(flipped);
    }

    // Tinte a media luminosità: ribaltarle le stravolgerebbe (l'ambra del
    // marchio diventerebbe blu scuro). Si sposta la luminosità nella
    // direzione opposta al foglio, il minimo che serve a rendersi visibili.
    var step = dark ? 0.04 : -0.04;
    var l = hsl.l;
    for (var i = 0; i < 25; i++) {
      l = Math.max(0.03, Math.min(0.97, l + step));
      var cand = fromHsl({ h: hsl.h, s: hsl.s, l: l, a: hsl.a });
      if (contrast(cand, p) >= MIN_CONTRAST) return toCss(cand);
      if (l <= 0.03 || l >= 0.97) break;
    }

    // Nemmeno saturando la luminosità si arriva al contrasto minimo:
    // meglio un tratto visibile che uno fedele e invisibile.
    return dark ? INK_ON_DARK : INK_ON_LIGHT;
  }

  function ink(color) {
    var key = (color == null ? '' : color) + '|' + paper();
    if (key in inkCache) return inkCache[key];
    var v = onPaper(color == null ? INK_ON_LIGHT : color, paper());
    inkCache[key] = v;
    return v;
  }

  // Inchiostro predefinito: quote, frecce, testi senza stile proprio.
  function defaultInk() { return ink(INK_ON_LIGHT); }

  // Griglia e righelli: non sono oggetti, seguono il foglio.
  function grid(alpha) {
    return paperIsDark()
      ? 'rgba(255,255,255,' + (alpha * 1.6).toFixed(3) + ')'
      : 'rgba(0,0,0,' + alpha + ')';
  }

  // Esegue fn come se il foglio fosse quello indicato (di norma bianco):
  // export PNG, SVG e stampa disegnano lì, non sulla tela a schermo.
  function withPaper(paperColor, fn) {
    var prev = forced;
    forced = paperColor;
    inkCache = Object.create(null);
    try { return fn(); }
    finally {
      forced = prev;
      inkCache = Object.create(null);
    }
  }

  // La stampa prende la tela così com'è: va ridisegnata su bianco prima
  // che il browser la fotografi, e rimessa a posto dopo.
  function bindPrint(redraw) {
    if (typeof redraw !== 'function') return;
    var printing = false;
    global.addEventListener('beforeprint', function () {
      printing = true;
      forced = '#ffffff';
      inkCache = Object.create(null);
      redraw();
    });
    global.addEventListener('afterprint', function () {
      if (!printing) return;
      printing = false;
      forced = null;
      inkCache = Object.create(null);
      redraw();
    });
  }

  global.StegoInk = {
    ink: ink,
    onPaper: onPaper,
    defaultInk: defaultInk,
    paper: paper,
    paperIsDark: paperIsDark,
    grid: grid,
    withPaper: withPaper,
    bindPrint: bindPrint,
    EXPORT_PAPER: '#ffffff',
  };
})(window);
