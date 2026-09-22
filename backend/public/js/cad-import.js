/* STEGO — importazione di disegni CAD.

   Il DXF si legge qui nel browser (js/dxf-import.js). Il DWG è un formato
   binario chiuso: il file va al server, che lo converte in DXF con
   LibreDWG e lo rimanda indietro, e da lì il percorso è lo stesso.

   Quello che entra non sovrascrive mai il disegno aperto: si aggiunge,
   e resta annullabile con Undo come qualsiasi altra modifica. */
(function (global) {
  'use strict';

  var api = global.StegoApi;

  // Ultimo file letto: tenerlo permette di rifare l'importazione con
  // un'altra unità senza ricaricare niente — che per un DWG vorrebbe
  // dire rifare tutto il giro di conversione sul server.
  var last = null;   // { dxf, name, histIndex, scale, size }

  function $(id) { return document.getElementById(id); }
  function tr(key, fallback) { return global.t ? global.t(key) : fallback; }

  function toast(message, tone) {
    if (global.AurorToast) global.AurorToast.show({ message: message, tone: tone || 'neutral' });
  }

  // Il valore del menu è già il fattore verso i millimetri: 'auto' lascia
  // decidere al file, come prima.
  function chosenScale() {
    var el = $('importUnits');
    if (!el || el.value === 'auto') return undefined;
    var n = parseFloat(el.value);
    return isFinite(n) && n > 0 ? n : undefined;
  }

  // ---- inserimento nel disegno ------------------------------------------
  function merge(parsed) {
    var state = global.state;
    var before = countObjects(state);

    // I layer del file che non esistono ancora vengono creati; quelli
    // omonimi si riusano, che è quello che ci si aspetta reimportando
    // una revisione dello stesso disegno.
    for (var name in parsed.layers) {
      if (!state.layers[name]) {
        state.layers[name] = {
          visible: parsed.layers[name].visible !== false,
          color: parsed.layers[name].color || '#111827',
          locked: !!parsed.layers[name].locked,
        };
      }
    }

    function layerColor(l) {
      return (state.layers[l] && state.layers[l].color) || '#111827';
    }
    function strokeStyle(o) {
      return { stroke: o.color || layerColor(o.layer), width: 1, dashed: false };
    }
    function add(list, type, obj) {
      var id = global.uid();
      obj.id = id;
      list.push(obj);
      global.addToZOrder(type, id);
    }

    parsed.segments.forEach(function (o) {
      add(state.segments, 'seg', { a: o.a, b: o.b, layer: o.layer, style: strokeStyle(o) });
    });
    parsed.polylines.forEach(function (o) {
      add(state.polylines, 'pline', { pts: o.pts, closed: !!o.closed, layer: o.layer, style: strokeStyle(o) });
    });
    parsed.arcs.forEach(function (o) {
      add(state.arcs, 'arc', { cx: o.cx, cy: o.cy, r: o.r, a0: o.a0, a1: o.a1, ccw: !!o.ccw, layer: o.layer, style: strokeStyle(o) });
    });
    parsed.ellipses.forEach(function (o) {
      add(state.ellipses, 'ell', { cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry, rot: o.rot || 0, layer: o.layer, style: strokeStyle(o) });
    });
    parsed.texts.forEach(function (o) {
      add(state.texts, 'text', {
        x: o.x, y: o.y, text: o.text, sizeMM: o.sizeMM, font: o.font || 'Arial',
        align: o.align || 'left', spacingMM: 0, rot: o.rot || 0,
        layer: o.layer, style: { fill: o.color || layerColor(o.layer) },
      });
    });

    // Su una tela vuota si inquadra il disegno appena arrivato; su un
    // disegno già avviato no, spostare la vista sotto le mani dà fastidio.
    if (before === 0) fitToDrawing();

    if (typeof global.refreshUI === 'function') global.refreshUI();
    if (typeof global.pushHist === 'function') global.pushHist();
    if (typeof global.draw === 'function') global.draw();
  }

  function countObjects(state) {
    return state.segments.length + state.polylines.length + state.arcs.length +
           state.ellipses.length + state.texts.length + state.rects.length +
           state.dims.length + state.images.length;
  }

  function fitToDrawing() {
    if (typeof global.computeWorldBounds !== 'function') return;
    var b = global.computeWorldBounds();
    if (!b || b.w <= 0 && b.h <= 0) return;
    var cv = document.getElementById('c');
    if (!cv || !cv.width || !cv.height) return;
    var pad = 0.9;
    var sx = cv.width / Math.max(b.w, 1e-6);
    var sy = cv.height / Math.max(b.h, 1e-6);
    var px = Math.min(sx, sy) * pad;
    if (!isFinite(px) || px <= 0) return;
    global.state.pxPerMM = px;
    global.state.panMM = {
      x: b.x + b.w / 2 - (cv.width / 2) / px,
      y: b.y + b.h / 2 - (cv.height / 2) / px,
    };
    var zoomInput = $('zoom');
    if (zoomInput) zoomInput.value = (Math.round(px * 100) / 100);
  }

  // Ingombro del disegno importato: è il modo più rapido per capire se
  // le unità erano quelle giuste — un monitor largo 24 mm non esiste.
  function extent(p) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    function at(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    }
    p.segments.forEach(function (o) { at(o.a.x, o.a.y); at(o.b.x, o.b.y); });
    p.polylines.forEach(function (o) { o.pts.forEach(function (q) { at(q.x, q.y); }); });
    p.arcs.forEach(function (o) { at(o.cx - o.r, o.cy - o.r); at(o.cx + o.r, o.cy + o.r); });
    p.ellipses.forEach(function (o) { at(o.cx - o.rx, o.cy - o.ry); at(o.cx + o.rx, o.cy + o.ry); });
    p.texts.forEach(function (o) { at(o.x, o.y); });
    if (!isFinite(minx)) return null;
    return { w: maxx - minx, h: maxy - miny };
  }

  function mm(v) {
    if (v >= 1000) return (v / 1000).toFixed(2) + ' m';
    if (v < 1) return v.toFixed(2) + ' mm';
    return Math.round(v) + ' mm';
  }

  // ---- resoconto ---------------------------------------------------------
  function report(parsed, fileName) {
    var box = $('importReport');
    if (!box) return null;
    var s = parsed.stats;
    var lines = [];
    lines.push('<strong>' + escapeHtml(fileName) + '</strong> — ' +
      s.imported + ' ' + (s.imported === 1 ? 'oggetto importato' : 'oggetti importati') +
      ' su ' + Object.keys(parsed.layers).length + ' layer.');

    var by = Object.keys(s.byType).sort().map(function (k) { return k + ' ' + s.byType[k]; });
    if (by.length) lines.push('<span class="mono">' + escapeHtml(by.join(' · ')) + '</span>');

    var size = extent(parsed);
    if (size) {
      lines.push(tr('import.extent', 'Ingombro') + ': <span class="mono">' +
        escapeHtml(mm(size.w) + ' × ' + mm(size.h)) + '</span>');
    }

    var sk = Object.keys(s.skipped).sort().map(function (k) { return k + ' ' + s.skipped[k]; });
    if (sk.length) lines.push('Non importato: ' + escapeHtml(sk.join(' · ')) + '.');

    parsed.warnings.forEach(function (w) { lines.push(escapeHtml(w)); });

    box.className = 'aurorNotice' + (sk.length || parsed.warnings.length ? ' aurorNotice--warn' : ' aurorNotice--success');
    box.innerHTML = lines.join('<br>');
    box.hidden = false;
    return size;
  }

  function fail(message) {
    var box = $('importReport');
    if (box) {
      box.className = 'aurorNotice aurorNotice--danger';
      box.textContent = message;
      box.hidden = false;
    }
    toast(message, 'danger');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Legge il DXF con le unità scelte e lo inserisce nel disegno. È il
  // punto comune fra il primo import e il "rifai con queste unità".
  function place(dxf, name, forcedScale) {
    var parsed = global.StegoDXF.parse(dxf, { unitScale: forcedScale || chosenScale() });
    if (!parsed.stats.imported) {
      fail(tr('import.empty', 'Il file è stato letto ma non conteneva geometria importabile.'));
      return false;
    }
    merge(parsed);
    var size = report(parsed, name);
    // Da qui si può rifare con un'altra unità, ma solo finché il disegno
    // non viene toccato d'altro: il rifacimento annulla l'ultimo passo di
    // storico, e se nel frattempo ne sono arrivati altri annullerebbe
    // quelli invece dell'importazione.
    last = {
      dxf: dxf, name: name,
      histIndex: global.state ? global.state.histIndex : -1,
      scale: parsed.unitScale,
      size: size,
    };
    showSize(size);
    var again = $('btnReimport');
    if (again) { again.hidden = false; again.classList.remove('primary'); }
    toast(parsed.stats.imported + ' ' + tr('import.toast', 'oggetti importati'), 'success');
    return true;
  }

  // ---- misure volute ----------------------------------------------------
  // Le due caselle mostrano l'ingombro appena importato e si possono
  // riscrivere: è la misura che l'utente conosce davvero ("questo monitor
  // è largo 597"), mentre l'unità del file è solo un modo indiretto per
  // arrivarci. Da quel numero si ricava il fattore di scala.
  function showSize(size) {
    var row = $('importSizeRow'), help = $('importSizeHelp');
    var w = $('importW'), h = $('importH');
    if (!row || !w || !h) return;
    if (!size) { row.hidden = true; if (help) help.hidden = true; return; }
    row.hidden = false;
    if (help) help.hidden = false;
    w.value = round1(size.w);
    h.value = round1(size.h);
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  // Scrivendo una misura l'altra segue: un disegno importato va scalato,
  // non deformato, quindi il rapporto fra i lati non si tocca.
  function linkSizeFields() {
    var w = $('importW'), h = $('importH');
    if (!w || !h) return;
    function ratio() {
      if (!last || !last.size || !last.size.w || !last.size.h) return null;
      return last.size.h / last.size.w;
    }
    w.addEventListener('input', function () {
      var r = ratio();
      if (r == null) return;
      var v = parseFloat(w.value);
      h.value = isFinite(v) && v > 0 ? round1(v * r) : '';
      markChanged();
    });
    h.addEventListener('input', function () {
      var r = ratio();
      if (r == null || !r) return;
      var v = parseFloat(h.value);
      w.value = isFinite(v) && v > 0 ? round1(v / r) : '';
      markChanged();
    });
  }

  function markChanged() {
    var a = $('btnReimport');
    if (last && a) a.classList.add('primary');
  }

  // Fattore da applicare al prossimo import: dalle misure se sono state
  // toccate, altrimenti da quello che dice il menu delle unità.
  function scaleFromFields() {
    if (!last || !last.size) return null;
    var w = parseFloat(($('importW') || {}).value);
    if (last.size.w > 0 && isFinite(w) && w > 0) {
      if (Math.abs(w - last.size.w) < 1e-6) return null;   // invariata
      return last.scale * (w / last.size.w);
    }
    // Un disegno tutto verticale non ha larghezza: comanda l'altezza.
    var h = parseFloat(($('importH') || {}).value);
    if (last.size.h > 0 && isFinite(h) && h > 0) {
      if (Math.abs(h - last.size.h) < 1e-6) return null;
      return last.scale * (h / last.size.h);
    }
    return null;
  }

  // ---- ingresso dei file -------------------------------------------------
  function readText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Impossibile leggere il file')); };
      r.readAsText(file);
    });
  }

  // I formati che il browser non sa leggere passano dal convertitore del
  // server, che restituisce sempre DXF.
  async function convertOnServer(file) {
    var form = new FormData();
    form.append('file', file, file.name);
    var res = await fetch('/api/import/cad', { method: 'POST', credentials: 'same-origin', body: form });
    var data = null;
    if ((res.headers.get('content-type') || '').indexOf('application/json') === 0) {
      data = await res.json().catch(function () { return null; });
    }
    if (res.status === 401) { api.toLogin(); throw new Error('Sessione scaduta'); }
    if (!res.ok) throw new Error((data && data.error) || ('Conversione fallita (HTTP ' + res.status + ')'));
    return data.dxf;
  }

  async function importFile(file) {
    if (!file) return;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var btn = $('btnImportCad');
    if (btn) btn.disabled = true;
    try {
      var dxf;
      if (ext === 'dxf') {
        dxf = await readText(file);
      } else {
        var box = $('importReport');
        if (box) {
          box.className = 'aurorNotice';
          box.textContent = 'Conversione di ' + file.name + ' in corso sul server…';
          box.hidden = false;
        }
        dxf = await convertOnServer(file);
      }
      place(dxf, file.name);
    } catch (e) {
      fail(e.message || 'Importazione fallita');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---- avvio -------------------------------------------------------------
  function init() {
    var btn = $('btnImportCad');
    var input = $('fileImportCad');
    if (!btn || !input) return;

    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      importFile(f);
    });

    var again = $('btnReimport');
    if (again) again.addEventListener('click', function () {
      if (!last) return;
      var st = global.state;
      if (!st || st.histIndex !== last.histIndex) {
        fail(tr('import.again.stale', 'Il disegno è cambiato dopo l\'importazione: annulla a mano e reimporta il file.'));
        again.hidden = true;
        last = null;
        return;
      }
      if (typeof global.undo !== 'function') return;
      var forced = scaleFromFields();
      var src = last;
      global.undo();                     // toglie l'importazione precedente
      if (typeof global.refreshUI === 'function') global.refreshUI();
      place(src.dxf, src.name, forced);
    });

    linkSizeFields();

    var units = $('importUnits');
    if (units) units.addEventListener('change', function () {
      // Cambiare unità da sole non fa niente finché non si rifà l'import:
      // il pulsante si mette in evidenza invece di lasciarlo credere.
      markChanged();
      // Le misure mostrate valgono per l'import fatto, non per quello che
      // verrà: si riallineano dopo.
    });

    // La tela accetta anche il trascinamento: è il gesto che uno prova
    // per primo con un file di disegno.
    var stage = document.querySelector('.canvasWrap');
    if (stage) {
      ['dragover', 'drop'].forEach(function (ev) {
        stage.addEventListener(ev, function (e) {
          e.preventDefault();
          if (ev === 'drop') {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f && /\.(dxf|dwg)$/i.test(f.name)) importFile(f);
          }
        });
      });
    }

    // Quali formati oltre al DXF: dipende da cosa c'è nel container.
    if (!api) return;
    api.get('/api/import/formats').then(function (cfg) {
      var accept = ['.dxf'].concat(cfg.formats || []);
      input.setAttribute('accept', accept.join(','));
      var hint = $('importHint');
      if (hint) {
        hint.textContent = cfg.converter
          ? tr('import.hint.full', 'DXF letto qui; DWG convertito sul server con ') + cfg.converter + '.'
          : tr('import.hint.dxfOnly', 'Solo DXF: nessun convertitore DWG disponibile in questa installazione.');
      }
    }).catch(function () { /* il DXF funziona comunque */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.StegoCadImport = { importFile: importFile, merge: merge };
})(window);
