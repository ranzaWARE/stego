/* STEGO — importazione di disegni CAD.

   Il DXF si legge qui nel browser (js/dxf-import.js). Il DWG è un formato
   binario chiuso: il file va al server, che lo converte in DXF con
   LibreDWG e lo rimanda indietro, e da lì il percorso è lo stesso.

   Quello che entra non sovrascrive mai il disegno aperto: si aggiunge,
   e resta annullabile con Undo come qualsiasi altra modifica. */
(function (global) {
  'use strict';

  var api = global.StegoApi;

  function $(id) { return document.getElementById(id); }
  function tr(key, fallback) { return global.t ? global.t(key) : fallback; }

  function toast(message, tone) {
    if (global.AurorToast) global.AurorToast.show({ message: message, tone: tone || 'neutral' });
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

  // ---- resoconto ---------------------------------------------------------
  function report(parsed, fileName) {
    var box = $('importReport');
    if (!box) return;
    var s = parsed.stats;
    var lines = [];
    lines.push('<strong>' + escapeHtml(fileName) + '</strong> — ' +
      s.imported + ' ' + (s.imported === 1 ? 'oggetto importato' : 'oggetti importati') +
      ' su ' + Object.keys(parsed.layers).length + ' layer.');

    var by = Object.keys(s.byType).sort().map(function (k) { return k + ' ' + s.byType[k]; });
    if (by.length) lines.push('<span class="mono">' + escapeHtml(by.join(' · ')) + '</span>');

    var sk = Object.keys(s.skipped).sort().map(function (k) { return k + ' ' + s.skipped[k]; });
    if (sk.length) lines.push('Non importato: ' + escapeHtml(sk.join(' · ')) + '.');

    parsed.warnings.forEach(function (w) { lines.push(escapeHtml(w)); });

    box.className = 'aurorNotice' + (sk.length || parsed.warnings.length ? ' aurorNotice--warn' : ' aurorNotice--success');
    box.innerHTML = lines.join('<br>');
    box.hidden = false;
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
      var parsed = global.StegoDXF.parse(dxf);
      if (!parsed.stats.imported) {
        fail('Il file è stato letto ma non conteneva geometria importabile.');
        return;
      }
      merge(parsed);
      report(parsed, file.name);
      toast(parsed.stats.imported + ' oggetti importati', 'success');
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
