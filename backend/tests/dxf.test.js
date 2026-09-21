const { test, done } = require('./_env');
const assert = require('assert');
const DXF = require('../public/js/dxf-import.js');

// Un DXF è una sequenza di coppie codice/valore, una per riga.
function dxf(sections) {
  const out = [];
  const push = (...pairs) => { for (const p of pairs) out.push(String(p)); };
  for (const [name, body] of sections) {
    push(0, 'SECTION', 2, name, ...body);
    push(0, 'ENDSEC');
  }
  push(0, 'EOF');
  return out.join('\n') + '\n';
}
const entities = (...body) => dxf([['ENTITIES', body]]);

// I punti si confrontano con tolleranza: altrimenti -0 e +0 risultano
// diversi e ogni arrotondamento fa fallire un test buono.
function near(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    (msg || 'valore') + ': atteso ' + expected + ', trovato ' + actual);
}
function nearPoint(p, x, y, msg) { near(p.x, x, (msg || 'punto') + '.x'); near(p.y, y, (msg || 'punto') + '.y'); }

(async () => {

await test('una linea cambia segno alla Y: in DXF sale, in STEGO scende', () => {
  const r = DXF.parse(entities(0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 5));
  assert.strictEqual(r.segments.length, 1);
  nearPoint(r.segments[0].a, 0, 0, 'primo estremo');
  nearPoint(r.segments[0].b, 10, -5, 'secondo estremo');
});

await test('un cerchio diventa un\'ellisse con i due raggi uguali', () => {
  const r = DXF.parse(entities(0, 'CIRCLE', 8, '0', 10, 3, 20, 4, 40, 10));
  assert.strictEqual(r.ellipses.length, 1);
  const e = r.ellipses[0];
  near(e.cx, 3, 'centro x');
  near(e.cy, -4, 'centro y');
  assert.strictEqual(e.rx, 10);
  assert.strictEqual(e.ry, 10);
});

await test('gli angoli di un arco seguono la Y specchiata', () => {
  const r = DXF.parse(entities(0, 'ARC', 8, '0', 10, 0, 20, 0, 40, 10, 50, 0, 51, 90));
  assert.strictEqual(r.arcs.length, 1);
  const a = r.arcs[0];
  near(a.a0, 0, 'angolo iniziale');
  assert.ok(Math.abs(a.a1 + Math.PI / 2) < 1e-9, 'angolo finale atteso -π/2, trovato ' + a.a1);
  assert.strictEqual(a.ccw, true);
  // Il punto a metà dell'arco deve stare in alto a destra, cioè con Y
  // negativa nel sistema di STEGO.
  const mid = { x: a.cx + a.r * Math.cos(-Math.PI / 4), y: a.cy + a.r * Math.sin(-Math.PI / 4) };
  assert.ok(mid.x > 0 && mid.y < 0, 'arco ribaltato: metà arco in ' + JSON.stringify(mid));
});

await test('il bulge di una polilinea diventa un arco vero, non una corda', () => {
  // Due vertici con bulge 1 = mezzo cerchio da (0,0) a (10,0).
  const r = DXF.parse(entities(0, 'LWPOLYLINE', 8, '0', 90, 2, 70, 0,
    10, 0, 20, 0, 42, 1, 10, 10, 20, 0));
  assert.strictEqual(r.polylines.length, 1);
  const pts = r.polylines[0].pts;
  assert.ok(pts.length > 10, 'il tratto curvo non è stato suddiviso: ' + pts.length + ' punti');
  // Tutti i punti stanno sulla circonferenza di raggio 5 centrata in (5,0).
  for (const p of pts) {
    const d = Math.hypot(p.x - 5, p.y - 0);
    assert.ok(Math.abs(d - 5) < 1e-6, 'punto fuori dall\'arco: ' + JSON.stringify(p));
  }
});

await test('il verso del bulge decide da che parte curva il tratto', () => {
  // bulge = tan(90°/4): un quarto di giro in senso antiorario da (0,0) a
  // (10,0). In DXF l'arco passa sotto la corda; in STEGO, con la Y
  // specchiata, passa sopra. Con il centro dalla parte sbagliata questo
  // test fallisce mentre un mezzo giro passerebbe lo stesso.
  const b = Math.tan(Math.PI / 8);
  const r = DXF.parse(entities(0, 'LWPOLYLINE', 8, '0', 90, 2, 70, 0,
    10, 0, 20, 0, 42, b, 10, 10, 20, 0));
  const pts = r.polylines[0].pts;
  const mid = pts[Math.floor(pts.length / 2)];
  near(mid.x, 5, 'il tratto non è simmetrico');
  assert.ok(mid.y > 0, 'arco dalla parte sbagliata della corda: y = ' + mid.y);
  // e resta comunque un arco di raggio costante attorno al suo centro
  const cx = 5, cy = -5, rad = Math.hypot(5, 5);
  for (const p of pts) near(Math.hypot(p.x - cx, p.y - cy), rad, 'punto fuori dall\'arco');
});

await test('la polilinea vecchio stile legge i suoi VERTEX', () => {
  const r = DXF.parse(entities(
    0, 'POLYLINE', 8, '0', 70, 1,
    0, 'VERTEX', 10, 0, 20, 0,
    0, 'VERTEX', 10, 10, 20, 0,
    0, 'VERTEX', 10, 10, 20, 10,
    0, 'SEQEND'));
  assert.strictEqual(r.polylines.length, 1);
  assert.strictEqual(r.polylines[0].closed, true);
  assert.strictEqual(r.polylines[0].pts.length, 3);
  nearPoint(r.polylines[0].pts[2], 10, -10, 'terzo vertice');
});

await test('un INSERT porta con sé posizione, rotazione e scala del blocco', () => {
  const src = dxf([
    ['BLOCKS', [
      0, 'BLOCK', 2, 'B', 10, 0, 20, 0,
      0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0,
      0, 'ENDBLK',
    ]],
    ['ENTITIES', [0, 'INSERT', 8, '0', 2, 'B', 10, 100, 20, 50, 41, 2, 42, 2, 50, 90]],
  ]);
  const r = DXF.parse(src);
  assert.strictEqual(r.segments.length, 1, 'il blocco non è stato espanso');
  const s = r.segments[0];
  nearPoint(s.a, 100, -50, 'punto di inserimento');
  // ruotata di 90° e scalata ×2: da (100,50) a (100,70) in DXF
  assert.ok(Math.abs(s.b.x - 100) < 1e-9 && Math.abs(s.b.y + 70) < 1e-9,
    'estremo atteso (100,-70), trovato ' + JSON.stringify(s.b));
});

await test('un blocco che si richiama non manda in ricorsione infinita', () => {
  const src = dxf([
    ['BLOCKS', [
      0, 'BLOCK', 2, 'LOOP', 10, 0, 20, 0,
      0, 'INSERT', 2, 'LOOP', 10, 1, 20, 1,
      0, 'ENDBLK',
    ]],
    ['ENTITIES', [0, 'INSERT', 8, '0', 2, 'LOOP', 10, 0, 20, 0]],
  ]);
  const r = DXF.parse(src);
  assert.ok(r.warnings.some(w => /profondità/i.test(w)), 'nessun avviso sul limite di annidamento');
});

await test('le unità del file diventano millimetri', () => {
  const src = dxf([
    ['HEADER', [9, '$INSUNITS', 70, 6]],          // metri
    ['ENTITIES', [0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 0]],
  ]);
  const r = DXF.parse(src);
  assert.strictEqual(r.unitScale, 1000);
  assert.strictEqual(r.segments[0].b.x, 1000);
});

await test('senza unità dichiarate si assumono i millimetri, e lo si dice', () => {
  const r = DXF.parse(entities(0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0));
  assert.strictEqual(r.unitScale, 1);
  assert.ok(r.warnings.some(w => /unità/i.test(w)));
});

await test('i layer portano nome e colore, le entità il proprio colore', () => {
  const src = dxf([
    ['TABLES', [0, 'LAYER', 2, 'MURI', 62, 1, 70, 0]],
    ['ENTITIES', [
      0, 'LINE', 8, 'MURI', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'LINE', 8, 'MURI', 62, 3, 10, 0, 20, 0, 11, 1, 21, 0,
    ]],
  ]);
  const r = DXF.parse(src);
  assert.strictEqual(r.layers.MURI.color, '#ff0000');
  assert.strictEqual(r.segments[0].color, null, 'BYLAYER deve restare senza colore proprio');
  assert.strictEqual(r.segments[1].color, '#00ff00');
});

await test('il colore a 24 bit ha la precedenza sull\'indice', () => {
  const r = DXF.parse(entities(0, 'LINE', 8, '0', 62, 1, 420, 0x336699, 10, 0, 20, 0, 11, 1, 21, 0));
  assert.strictEqual(r.segments[0].color, '#336699');
});

await test('il testo arriva con posizione, altezza e allineamento', () => {
  const r = DXF.parse(entities(0, 'TEXT', 8, '0', 10, 5, 20, 8, 40, 2.5, 72, 1, 1, 'QUOTA'));
  assert.strictEqual(r.texts.length, 1);
  const t = r.texts[0];
  assert.strictEqual(t.text, 'QUOTA');
  assert.strictEqual(t.sizeMM, 2.5);
  assert.strictEqual(t.align, 'center');
  nearPoint(t, 5, -8, 'posizione del testo');
});

await test('la formattazione di un MTEXT non finisce nel testo', () => {
  const r = DXF.parse(entities(0, 'MTEXT', 8, '0', 10, 0, 20, 0, 40, 3, 1, '{\\fArial|b0;Muro\\Pportante}'));
  assert.strictEqual(r.texts[0].text, 'Muro portante');
});

await test('un\'ellisse completa resta un\'ellisse, una parziale diventa polilinea', () => {
  const full = DXF.parse(entities(0, 'ELLIPSE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0, 40, 0.5, 41, 0, 42, 6.283185307179586));
  assert.strictEqual(full.ellipses.length, 1);
  assert.strictEqual(full.ellipses[0].rx, 10);
  assert.strictEqual(full.ellipses[0].ry, 5);

  const half = DXF.parse(entities(0, 'ELLIPSE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0, 40, 0.5, 41, 0, 42, 3.141592653589793));
  assert.strictEqual(half.ellipses.length, 0);
  assert.strictEqual(half.polylines.length, 1);
  assert.ok(half.warnings.some(w => /ellisse/i.test(w)));
});

await test('quello che non si sa importare viene contato e dichiarato', () => {
  const r = DXF.parse(entities(
    0, 'HATCH', 8, '0', 10, 0, 20, 0,
    0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 0));
  assert.strictEqual(r.stats.skipped.HATCH, 1);
  assert.strictEqual(r.stats.imported, 1);
  assert.strictEqual(r.stats.byType.LINE, 1);
});

await test('una quota viene disegnata espandendo il suo blocco', () => {
  const src = dxf([
    ['BLOCKS', [
      0, 'BLOCK', 2, '*D1', 10, 0, 20, 0,
      0, 'LINE', 8, 'QUOTE', 10, 0, 20, 0, 11, 50, 21, 0,
      0, 'ENDBLK',
    ]],
    ['ENTITIES', [0, 'DIMENSION', 8, 'QUOTE', 2, '*D1', 10, 0, 20, 0]],
  ]);
  const r = DXF.parse(src);
  assert.strictEqual(r.segments.length, 1);
  assert.ok(r.warnings.some(w => /quote/i.test(w)));
});

await test('un file che non è un DXF viene rifiutato con un messaggio chiaro', () => {
  assert.throws(() => DXF.parse('questo non è un DXF'), /DXF/);
  assert.throws(() => DXF.parse(''), /vuoto|illeggibile/i);
});

await test('le righe con CRLF non mandano fuori sincrono la lettura', () => {
  const src = entities(0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 7, 21, 0).replace(/\n/g, '\r\n');
  const r = DXF.parse(src);
  assert.strictEqual(r.segments[0].b.x, 7);
});

done();
})();
