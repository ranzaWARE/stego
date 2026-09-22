/* STEGO — lettura DXF.

   DXF è la lingua franca dei CAD: qualsiasi programma la esporta, e i DWG
   vengono convertiti qui dentro prima di arrivare (vedi /api/import/dwg).
   Questo modulo legge il testo e restituisce geometria già nel sistema di
   STEGO; non tocca `state`, di quello si occupa chi lo chiama.

   Due conversioni valgono per tutto il file:
   - le unità: DXF dichiara le sue in $INSUNITS, STEGO lavora in millimetri;
   - l'asse Y: in DXF cresce verso l'alto, in STEGO verso il basso (è lo
     stesso verso dello schermo), quindi ogni punto viene specchiato e gli
     angoli cambiano segno.

   Gira sia nel browser sia in Node, così la suite di test può leggerlo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StegoDXF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Tavolozza ACI -----------------------------------------------------
  // I DXF indicano i colori per indice. La tavolozza completa è di 255 voci,
  // ma i disegni reali vivono quasi tutti sui primi nove e sui grigi finali;
  // per il resto si ricade sul colore del layer, che è meglio di un colore
  // inventato.
  var ACI = {
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff',
    6: '#ff00ff', 7: '#111827', 8: '#808080', 9: '#c0c0c0',
    250: '#333333', 251: '#505050', 252: '#696969', 253: '#828282',
    254: '#bebebe', 255: '#ffffff',
  };

  // ---- Unità → millimetri -----------------------------------------------
  var UNITS = {
    0: null,          // senza unità: si assume millimetri
    1: 25.4,          // pollici
    2: 304.8,         // piedi
    3: 1609344,       // miglia
    4: 1,             // millimetri
    5: 10,            // centimetri
    6: 1000,          // metri
    7: 1000000,       // chilometri
    8: 0.0000254,     // micropollici
    9: 0.0254,        // mil
    10: 914.4,        // iarde
    11: 1e-7,         // ångström
    12: 1e-6,         // nanometri
    13: 0.001,        // micron
    14: 100,          // decimetri
    15: 10000,        // decametri
    16: 100000,       // ettometri
  };

  // ---- Tokenizzazione ----------------------------------------------------
  function tokenize(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var code = parseInt(lines[i], 10);
      if (isNaN(code)) {           // riga di rumore: si riallinea al prossimo codice
        i -= 1;
        continue;
      }
      out.push([code, lines[i + 1]]);
    }
    return out;
  }

  // Un'entità è la sequenza di coppie fra due codici 0. L'ordine conta
  // (le LWPOLYLINE ripetono 10/20 per ogni vertice), quindi si conserva.
  function makeEntity(type, pairs) {
    return {
      type: type,
      pairs: pairs,
      first: function (code) {
        for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === code) return pairs[i][1];
        return undefined;
      },
      num: function (code, def) {
        var v = this.first(code);
        if (v === undefined) return def;
        var n = parseFloat(v);
        return isFinite(n) ? n : def;
      },
      all: function (code) {
        var r = [];
        for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === code) r.push(pairs[i][1]);
        return r;
      },
    };
  }

  // ---- Trasformazioni affini (nello spazio DXF, Y in su) -----------------
  function identity() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }

  function compose(m, n) {           // applica prima n, poi m
    return {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f,
    };
  }

  function trs(tx, ty, rot, sx, sy) {
    var cos = Math.cos(rot), sin = Math.sin(rot);
    return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: tx, f: ty };
  }

  function apply(m, x, y) { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  function scaleOf(m) { return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; }
  function rotOf(m) { return Math.atan2(m.b, m.a); }
  function isUniform(m) {
    var sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d);
    return Math.abs(sx - sy) < 1e-9;
  }

  // ---- Parser ------------------------------------------------------------
  function parse(text, opts) {
    opts = opts || {};
    var tokens = tokenize(text);
    if (!tokens.length) throw new Error('File DXF vuoto o illeggibile');

    var header = {}, layers = {}, blocks = {}, entities = [];
    var warnings = [], skipped = {}, counted = {};

    // --- suddivisione in sezioni ---
    var i = 0;
    while (i < tokens.length) {
      var t = tokens[i];
      if (t[0] === 0 && t[1] === 'SECTION') {
        var name = (tokens[i + 1] && tokens[i + 1][0] === 2) ? tokens[i + 1][1] : '';
        var end = i + 2;
        while (end < tokens.length && !(tokens[end][0] === 0 && tokens[end][1] === 'ENDSEC')) end++;
        var body = tokens.slice(i + 2, end);
        if (name === 'HEADER') readHeader(body, header);
        else if (name === 'TABLES') readLayers(body, layers);
        else if (name === 'BLOCKS') readBlocks(body, blocks);
        else if (name === 'ENTITIES') entities = readEntities(body);
        i = end + 1;
        continue;
      }
      i++;
    }

    if (!entities.length && !Object.keys(blocks).length) {
      throw new Error('Nessuna entità trovata: il file non sembra un DXF');
    }

    // --- unità ---
    var insunits = header.$INSUNITS;
    var forced = opts.unitScale > 0;
    var unit = forced ? opts.unitScale : UNITS[insunits];
    if (unit == null) {
      unit = 1;
      if (insunits !== 4) {
        warnings.push(insunits === 0 || insunits === undefined
          ? 'Il file non dichiara le unità: si assumono millimetri.'
          : 'Unità sconosciute (' + insunits + '): si assumono millimetri.');
      }
    }
    // Se le unità sono state imposte da fuori, quello che dichiara il
    // file non conta più: dirlo sarebbe fuorviante, e va detto invece
    // che si sta ignorando la sua dichiarazione.
    if (forced && UNITS[insunits] && UNITS[insunits] !== unit) {
      warnings.push('Il file dichiarava altre unità: si sta usando quella scelta a mano.');
    }

    // --- raccolta ---
    var out = { segments: [], polylines: [], arcs: [], ellipses: [], texts: [] };

    function note(type) { counted[type] = (counted[type] || 0) + 1; }
    function skip(type) { skipped[type] = (skipped[type] || 0) + 1; }

    // Y specchiato e unità applicate: è l'unico punto in cui si passa
    // dallo spazio DXF a quello di STEGO.
    function P(p) { return { x: p.x * unit, y: -p.y * unit }; }

    function colorOf(ent, ctxLayer) {
      var rgb = ent.first(420);
      if (rgb !== undefined) {
        var n = parseInt(rgb, 10) & 0xffffff;
        return '#' + ('000000' + n.toString(16)).slice(-6);
      }
      var ci = ent.num(62, undefined);
      if (ci === undefined || ci === 256) return null;      // BYLAYER
      if (ci === 0) return null;                            // BYBLOCK
      return ACI[Math.abs(ci)] || null;
    }

    function layerOf(ent, fallback) {
      var l = ent.first(8);
      return (l && String(l).trim()) || fallback || '0';
    }

    function push(kind, obj, ent, ctx) {
      obj.layer = layerOf(ent, ctx.layer);
      obj.color = colorOf(ent, obj.layer);
      if (!layers[obj.layer]) layers[obj.layer] = { color: '#111827', visible: true, locked: false };
      out[kind].push(obj);
      note(ent.type);
    }

    // --- emissione per tipo -------------------------------------------------
    function emit(ent, m, ctx, depth) {
      switch (ent.type) {
        case 'LINE': {
          var a = apply(m, ent.num(10, 0), ent.num(20, 0));
          var b = apply(m, ent.num(11, 0), ent.num(21, 0));
          push('segments', { a: P(a), b: P(b) }, ent, ctx);
          break;
        }
        case 'CIRCLE': {
          var c = apply(m, ent.num(10, 0), ent.num(20, 0));
          var r = ent.num(40, 0) * scaleOf(m);
          if (r <= 0) { skip('CIRCLE degenere'); break; }
          var p = P(c);
          push('ellipses', { cx: p.x, cy: p.y, rx: r * unit, ry: r * unit, rot: 0 }, ent, ctx);
          break;
        }
        case 'ARC': {
          var ac = apply(m, ent.num(10, 0), ent.num(20, 0));
          var ar = ent.num(40, 0) * scaleOf(m);
          if (ar <= 0) { skip('ARC degenere'); break; }
          var rot = rotOf(m);
          // In DXF l'arco va sempre in senso antiorario dall'angolo iniziale
          // a quello finale. Specchiando Y il verso si inverte.
          var a0 = -(ent.num(50, 0) * Math.PI / 180 + rot);
          var a1 = -(ent.num(51, 0) * Math.PI / 180 + rot);
          var ap = P(ac);
          push('arcs', { cx: ap.x, cy: ap.y, r: ar * unit, a0: a0, a1: a1, ccw: true }, ent, ctx);
          break;
        }
        case 'ELLIPSE': {
          var ec = apply(m, ent.num(10, 0), ent.num(20, 0));
          // L'asse maggiore è un vettore relativo al centro.
          var mx = ent.num(11, 0), my = ent.num(21, 0);
          var maj = { x: m.a * mx + m.c * my, y: m.b * mx + m.d * my };
          var rx = Math.hypot(maj.x, maj.y);
          var ratio = ent.num(40, 1);
          var t0 = ent.num(41, 0), t1 = ent.num(42, Math.PI * 2);
          if (rx <= 0) { skip('ELLIPSE degenere'); break; }
          if (Math.abs((t1 - t0) - Math.PI * 2) > 1e-6) {
            // Ellisse parziale: non esiste in STEGO, si approssima.
            var pts = [];
            var steps = 64;
            for (var s = 0; s <= steps; s++) {
              var th = t0 + (t1 - t0) * s / steps;
              var px = Math.cos(th) * rx, py = Math.sin(th) * rx * ratio;
              var rr = Math.atan2(maj.y, maj.x);
              pts.push(P({ x: ec.x + px * Math.cos(rr) - py * Math.sin(rr),
                           y: ec.y + px * Math.sin(rr) + py * Math.cos(rr) }));
            }
            push('polylines', { pts: pts, closed: false }, ent, ctx);
            warnings.push('Archi di ellisse approssimati con polilinee.');
          } else {
            var epc = P(ec);
            push('ellipses', {
              cx: epc.x, cy: epc.y,
              rx: rx * unit, ry: rx * ratio * unit,
              rot: -Math.atan2(maj.y, maj.x),
            }, ent, ctx);
          }
          break;
        }
        case 'LWPOLYLINE': {
          var lw = readLwVertices(ent);
          if (lw.length < 2) { skip('LWPOLYLINE incompleta'); break; }
          var closed = (ent.num(70, 0) & 1) === 1;
          var pts = tessellate(lw, closed).map(function (p) { return P(apply(m, p.x, p.y)); });
          push('polylines', { pts: pts, closed: closed }, ent, ctx);
          break;
        }
        case 'POLYLINE': {
          // Formato vecchio: i vertici sono entità VERTEX che seguono.
          var vs = (ent.vertices || []).map(function (v) {
            return { x: v.num(10, 0), y: v.num(20, 0), bulge: v.num(42, 0) };
          });
          if (vs.length < 2) { skip('POLYLINE incompleta'); break; }
          var pclosed = (ent.num(70, 0) & 1) === 1;
          var ppts = tessellate(vs, pclosed).map(function (p) { return P(apply(m, p.x, p.y)); });
          push('polylines', { pts: ppts, closed: pclosed }, ent, ctx);
          break;
        }
        case 'SPLINE': {
          var fit = pairsOf(ent, 11, 21);
          var ctrl = pairsOf(ent, 10, 20);
          var src = fit.length >= 2 ? fit : ctrl;
          if (src.length < 2) { skip('SPLINE incompleta'); break; }
          var spts = src.map(function (p) { return P(apply(m, p.x, p.y)); });
          push('polylines', { pts: spts, closed: (ent.num(70, 0) & 1) === 1 }, ent, ctx);
          warnings.push('Le spline sono approssimate con polilinee.');
          break;
        }
        case 'POINT':
          skip('POINT');
          break;
        case 'TEXT':
        case 'MTEXT': {
          var raw = ent.type === 'MTEXT'
            ? ent.all(3).join('') + (ent.first(1) || '')
            : (ent.first(1) || '');
          var txt = cleanText(raw);
          if (!txt) { skip(ent.type + ' vuoto'); break; }
          var tp = apply(m, ent.num(10, 0), ent.num(20, 0));
          var h = ent.num(40, 2.5) * scaleOf(m) * unit;
          var trot = ent.type === 'MTEXT' ? ent.num(50, 0) * Math.PI / 180
                                          : ent.num(50, 0) * Math.PI / 180;
          var alignCode = ent.type === 'MTEXT' ? mtextAlign(ent.num(71, 1)) : ent.num(72, 0);
          var tpp = P(tp);
          push('texts', {
            x: tpp.x, y: tpp.y,
            text: txt,
            sizeMM: h || 2.5,
            font: 'Arial',
            align: ['left', 'center', 'right'][alignCode] || 'left',
            spacingMM: 0,
            rot: -(trot + rotOf(m)),
          }, ent, ctx);
          break;
        }
        case 'INSERT': {
          if (depth > 8) { warnings.push('Blocchi annidati troppo in profondità: fermato a 8 livelli.'); break; }
          var bname = ent.first(2);
          var blk = blocks[bname];
          if (!blk) { skip('INSERT senza blocco "' + bname + '"'); break; }
          var sx = ent.num(41, 1), sy = ent.num(42, 1);
          var irot = ent.num(50, 0) * Math.PI / 180;
          var cols = Math.max(1, Math.round(ent.num(70, 1)));
          var rows = Math.max(1, Math.round(ent.num(71, 1)));
          var cspc = ent.num(44, 0), rspc = ent.num(45, 0);
          if (!isUniform(trs(0, 0, irot, sx || 1, sy || 1))) {
            warnings.push('Blocchi con scala non uniforme: cerchi e archi sono approssimati.');
          }
          if (cols * rows > 400) {
            warnings.push('Matrice di blocchi molto grande (' + cols + '×' + rows + '): importata comunque.');
          }
          for (var cx2 = 0; cx2 < cols; cx2++) {
            for (var ry = 0; ry < rows; ry++) {
              var ix = ent.num(10, 0) + cx2 * cspc;
              var iy = ent.num(20, 0) + ry * rspc;
              // Il punto base del blocco è l'origine del suo contenuto.
              var local = compose(trs(ix, iy, irot, sx || 1, sy || 1),
                                  trs(-blk.base.x, -blk.base.y, 0, 1, 1));
              var mm = compose(m, local);
              var ictx = { layer: layerOf(ent, ctx.layer) };
              for (var e2 = 0; e2 < blk.entities.length; e2++) {
                emit(blk.entities[e2], mm, ictx, depth + 1);
              }
            }
          }
          break;
        }
        case 'DIMENSION': {
          // Una quota porta con sé il blocco già disegnato: espanderlo dà
          // linee, frecce e testo. La quota come oggetto vivo di STEGO
          // richiederebbe di reinterpretarne i punti di definizione.
          var dblk = blocks[ent.first(2)];
          if (dblk) {
            var dctx = { layer: layerOf(ent, ctx.layer) };
            for (var d2 = 0; d2 < dblk.entities.length; d2++) emit(dblk.entities[d2], m, dctx, depth + 1);
            warnings.push('Le quote sono importate come geometria, non come quote modificabili.');
          } else skip('DIMENSION senza blocco');
          break;
        }
        default:
          skip(ent.type);
      }
    }

    var rootCtx = { layer: '0' };
    for (var k = 0; k < entities.length; k++) {
      try { emit(entities[k], identity(), rootCtx, 0); }
      catch (e) { skip(entities[k].type + ' (errore: ' + e.message + ')'); }
    }

    // Layer citati dalle entità ma assenti dalla tabella
    for (var ln in layers) {
      if (!layers[ln].color) layers[ln].color = '#111827';
    }

    return {
      layers: layers,
      segments: out.segments,
      polylines: out.polylines,
      arcs: out.arcs,
      ellipses: out.ellipses,
      texts: out.texts,
      units: insunits,
      unitScale: unit,
      stats: {
        imported: out.segments.length + out.polylines.length + out.arcs.length + out.ellipses.length + out.texts.length,
        byType: counted,
        skipped: skipped,
      },
      warnings: dedupe(warnings),
    };
  }

  // ---- lettori di sezione ------------------------------------------------
  function readHeader(tokens, into) {
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i][0] !== 9) continue;
      var name = tokens[i][1];
      var v = tokens[i + 1];
      if (!v) continue;
      var n = parseFloat(v[1]);
      into[name] = isFinite(n) ? n : v[1];
    }
  }

  function readLayers(tokens, into) {
    var i = 0;
    while (i < tokens.length) {
      if (tokens[i][0] === 0 && tokens[i][1] === 'LAYER') {
        var j = i + 1, name = null, color = null, flags = 0;
        while (j < tokens.length && tokens[j][0] !== 0) {
          if (tokens[j][0] === 2) name = tokens[j][1];
          else if (tokens[j][0] === 62) color = parseInt(tokens[j][1], 10);
          else if (tokens[j][0] === 70) flags = parseInt(tokens[j][1], 10) || 0;
          j++;
        }
        if (name) {
          into[name] = {
            // Colore negativo = layer spento: si importa comunque, nascosto.
            color: ACI[Math.abs(color)] || '#111827',
            visible: !(color < 0) && !(flags & 1),
            locked: !!(flags & 4),
          };
        }
        i = j;
        continue;
      }
      i++;
    }
  }

  function readBlocks(tokens, into) {
    var i = 0;
    while (i < tokens.length) {
      if (tokens[i][0] === 0 && tokens[i][1] === 'BLOCK') {
        var j = i + 1, name = null, bx = 0, by = 0;
        while (j < tokens.length && tokens[j][0] !== 0) {
          if (tokens[j][0] === 2) name = tokens[j][1];
          else if (tokens[j][0] === 10) bx = parseFloat(tokens[j][1]) || 0;
          else if (tokens[j][0] === 20) by = parseFloat(tokens[j][1]) || 0;
          j++;
        }
        var end = j;
        while (end < tokens.length && !(tokens[end][0] === 0 && tokens[end][1] === 'ENDBLK')) end++;
        if (name) into[name] = { base: { x: bx, y: by }, entities: readEntities(tokens.slice(j, end)) };
        i = end + 1;
        continue;
      }
      i++;
    }
  }

  function readEntities(tokens) {
    var list = [], i = 0;
    while (i < tokens.length) {
      if (tokens[i][0] !== 0) { i++; continue; }
      var type = tokens[i][1];
      if (type === 'ENDSEC' || type === 'ENDBLK') break;
      var j = i + 1, pairs = [];
      while (j < tokens.length && tokens[j][0] !== 0) { pairs.push(tokens[j]); j++; }
      var ent = makeEntity(type, pairs);
      // POLYLINE vecchio stile: i vertici sono entità a sé fino a SEQEND
      if (type === 'POLYLINE') {
        ent.vertices = [];
        while (j < tokens.length && tokens[j][0] === 0 && tokens[j][1] === 'VERTEX') {
          var v = j + 1, vp = [];
          while (v < tokens.length && tokens[v][0] !== 0) { vp.push(tokens[v]); v++; }
          ent.vertices.push(makeEntity('VERTEX', vp));
          j = v;
        }
        if (j < tokens.length && tokens[j][0] === 0 && tokens[j][1] === 'SEQEND') {
          j++;
          while (j < tokens.length && tokens[j][0] !== 0) j++;
        }
      }
      if (type !== 'VERTEX' && type !== 'SEQEND') list.push(ent);
      i = j;
    }
    return list;
  }

  // ---- utilità geometriche ----------------------------------------------
  function pairsOf(ent, cx, cy) {
    var xs = [], ys = [];
    for (var i = 0; i < ent.pairs.length; i++) {
      if (ent.pairs[i][0] === cx) xs.push(parseFloat(ent.pairs[i][1]));
      else if (ent.pairs[i][0] === cy) ys.push(parseFloat(ent.pairs[i][1]));
    }
    var n = Math.min(xs.length, ys.length), out = [];
    for (var k = 0; k < n; k++) out.push({ x: xs[k] || 0, y: ys[k] || 0 });
    return out;
  }

  // In una LWPOLYLINE i vertici arrivano come 10/20 consecutivi, con un 42
  // facoltativo (il "bulge", cioè quanto quel tratto è curvo).
  function readLwVertices(ent) {
    var out = [], cur = null;
    for (var i = 0; i < ent.pairs.length; i++) {
      var c = ent.pairs[i][0], v = parseFloat(ent.pairs[i][1]);
      if (c === 10) { if (cur) out.push(cur); cur = { x: v || 0, y: 0, bulge: 0 }; }
      else if (c === 20 && cur) cur.y = v || 0;
      else if (c === 42 && cur) cur.bulge = v || 0;
    }
    if (cur) out.push(cur);
    return out;
  }

  // Un tratto con bulge è un arco: si spezza in segmenti brevi, così resta
  // una polilinea sola invece di frammentarsi in oggetti separati.
  function tessellate(verts, closed) {
    var pts = [];
    var n = verts.length;
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = verts[i], p1 = verts[(i + 1) % n];
      pts.push({ x: p0.x, y: p0.y });
      var b = p0.bulge || 0;
      if (!b) continue;
      var theta = 4 * Math.atan(b);              // angolo sotteso, con segno
      var chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (chord < 1e-12) continue;
      var r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      if (!isFinite(r)) continue;
      var mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      // Distanza del centro dalla corda. Negativa oltre il mezzo giro:
      // lì il centro passa dall'altra parte, ed è il coseno a dirlo.
      var h = r * Math.cos(Math.abs(theta) / 2);
      var dir = theta > 0 ? 1 : -1;
      var nx = -(p1.y - p0.y) / chord, ny = (p1.x - p0.x) / chord;   // normale a sinistra
      var cxx = mid.x + nx * h * dir, cyy = mid.y + ny * h * dir;
      var a0 = Math.atan2(p0.y - cyy, p0.x - cxx);
      var steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 30)));
      for (var s = 1; s < steps; s++) {
        var a = a0 + theta * s / steps;
        pts.push({ x: cxx + r * Math.cos(a), y: cyy + r * Math.sin(a) });
      }
    }
    if (!closed) pts.push({ x: verts[n - 1].x, y: verts[n - 1].y });
    return pts;
  }

  // MTEXT porta la formattazione dentro al testo: qui interessa il testo.
  function cleanText(s) {
    return String(s || '')
      .replace(/\\[pP]/g, ' ')            // a capo
      .replace(/\\[A-Za-z][^;]*;/g, '')   // font, altezza, colore…
      .replace(/[{}]/g, '')
      .replace(/%%[dD]/g, '°')
      .replace(/%%[cC]/g, 'Ø')
      .replace(/%%[pP]/g, '±')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mtextAlign(code) {
    // 1,4,7 = sinistra · 2,5,8 = centro · 3,6,9 = destra
    var c = ((code - 1) % 3);
    return c < 0 ? 0 : c;
  }

  function dedupe(list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) continue;
      seen[list[i]] = 1;
      out.push(list[i]);
    }
    return out;
  }

  return { parse: parse, ACI: ACI, UNITS: UNITS };
});
