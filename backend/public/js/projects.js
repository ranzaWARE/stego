/* STEGO — progetti sul server.

   Il CAD continua a lavorare sul suo `state` in memoria e sull'autosave
   locale: qui sopra ci va l'archivio lato server, che è quello che
   sopravvive al browser e segue l'utente da una macchina all'altra.

   Aggancio: pushHist() è già il punto in cui ogni modifica passa
   (marca state.dirty e riscrive l'autosave locale). Lo si avvolge invece
   di sparpagliare chiamate in tutta l'interfaccia. */
(function (global) {
  'use strict';

  var api = global.StegoApi;
  var LAST_KEY = 'stego_last_project';
  var AUTOSAVE_MS = 4000;

  var current = null;      // { id, title }
  var dirty = false;
  var saving = false;
  var timer = null;

  // ---- stato visibile in barra ----------------------------------------
  function setState(kind) {
    var el = document.getElementById('saveState');
    if (!el) return;
    var label = {
      idle:   '',
      dirty:  global.t ? global.t('project.state.dirty')  : 'modifiche non salvate',
      saving: global.t ? global.t('project.state.saving') : 'salvataggio…',
      saved:  global.t ? global.t('project.state.saved')  : 'salvato',
    }[kind];
    el.setAttribute('data-state', kind);
    el.textContent = label || '';
  }

  function setProjectLabel() {
    var el = document.getElementById('projName');
    if (!el) return;
    el.textContent = current ? current.title
      : (global.t ? global.t('project.none') : 'Nessun progetto');
  }

  // ---- contenuto del disegno -------------------------------------------
  // snapshot() è la funzione di STEGO che serializza tutto il disegno:
  // stesso formato del file .json esportabile, così un progetto salvato
  // sul server e uno salvato su file restano interscambiabili.
  function currentData() {
    return typeof global.snapshot === 'function' ? global.snapshot() : {};
  }

  function applyData(data) {
    if (typeof global.restore !== 'function') return false;
    global.restore(data || {});
    if (typeof global.draw === 'function') global.draw();
    if (typeof global.refreshUI === 'function') global.refreshUI();
    return true;
  }

  // Miniatura per la lista: le due tele (statica + overlay) rimpicciolite.
  // Un fallimento qui non deve mai impedire un salvataggio.
  function capture() {
    var a = document.getElementById('cStatic');
    var b = document.getElementById('c');
    if (!a) return null;
    var w = 192, h = Math.round(w * (a.height || 3) / (a.width || 4));
    var off = document.createElement('canvas');
    off.width = w; off.height = h;
    var cx = off.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(a, 0, 0, w, h);
    if (b) cx.drawImage(b, 0, 0, w, h);
    return off.toDataURL('image/jpeg', 0.6);
  }

  function thumbnail() {
    try {
      var Ink = global.StegoInk;
      // In tema scuro la tela è scura: la miniatura finirebbe illeggibile
      // sulla scheda e cambierebbe aspetto a ogni cambio di tema. Si
      // ridisegna su bianco, si cattura, e si rimette com'era.
      if (Ink && Ink.paperIsDark() && typeof global.draw === 'function') {
        var shot = null;
        Ink.withPaper(Ink.EXPORT_PAPER, function () { global.draw(); shot = capture(); });
        global.draw();
        return shot;
      }
      return capture();
    } catch (e) { return null; }
  }

  // ---- salvataggio ------------------------------------------------------
  async function save(opts) {
    opts = opts || {};
    if (!current) { return opts.silent ? null : saveAs(); }
    if (saving) return;
    saving = true;
    setState('saving');
    try {
      await api.put('/api/projects/' + current.id, {
        title: current.title,
        data: currentData(),
        thumbnail: thumbnail(),
      });
      dirty = false;
      if (global.state) global.state.dirty = false;
      setState('saved');
      if (!opts.silent && global.AurorToast) {
        global.AurorToast.show({ message: global.t ? global.t('project.toast.saved') : 'Progetto salvato', tone: 'success' });
      }
    } catch (e) {
      setState('dirty');
      if (global.AurorToast) global.AurorToast.show({ message: e.message, tone: 'danger' });
    } finally {
      saving = false;
    }
  }

  function scheduleAutosave() {
    if (!current) return;
    clearTimeout(timer);
    timer = setTimeout(function () { save({ silent: true }); }, AUTOSAVE_MS);
  }

  function markDirty() {
    dirty = true;
    setState('dirty');
    scheduleAutosave();
  }

  // ---- ciclo di vita del progetto ---------------------------------------
  async function create(title) {
    var p = await api.post('/api/projects', {
      title: title,
      data: currentData(),
      thumbnail: thumbnail(),
    });
    current = { id: p.id, title: p.title };
    remember();
    dirty = false;
    setProjectLabel();
    setState('saved');
    return p;
  }

  async function open(id) {
    var p = await api.get('/api/projects/' + id);
    if (!applyData(p.data)) throw new Error('Impossibile caricare il disegno');
    current = { id: p.id, title: p.title };
    remember();
    dirty = false;
    setProjectLabel();
    setState('idle');
    return p;
  }

  async function remove(id) {
    await api.del('/api/projects/' + id);
    if (current && current.id === id) {
      current = null;
      forget();
      setProjectLabel();
      setState('idle');
    }
  }

  function list() { return api.get('/api/projects'); }

  function saveAs() {
    var input = document.getElementById('saveAsName');
    if (input) input.value = current ? current.title : '';
    if (global.AurorModal) global.AurorModal.open('saveAsModal');
  }

  async function saveAsConfirm(title) {
    title = (title || '').trim();
    if (!title) return false;
    // Progetto già aperto → "salva come" crea una copia, non rinomina:
    // altrimenti si perderebbe la versione da cui si è partiti.
    await create(title);
    if (global.AurorModal) global.AurorModal.close('saveAsModal');
    if (global.AurorToast) {
      global.AurorToast.show({ message: global.t ? global.t('project.toast.created') : 'Progetto creato', tone: 'success' });
    }
    return true;
  }

  function detach() {           // "Nuovo": tela pulita, nessun progetto aperto
    current = null;
    forget();
    setProjectLabel();
    setState('idle');
  }

  function remember() { try { localStorage.setItem(LAST_KEY, current.id); } catch (e) {} }
  function forget()   { try { localStorage.removeItem(LAST_KEY); } catch (e) {} }
  function lastId()   { try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; } }

  // ---- aggancio a pushHist ---------------------------------------------
  // pushHist è globale (i file del CAD sono concatenati nello scope
  // globale): riassegnarlo intercetta anche le chiamate interne.
  function hook() {
    if (typeof global.pushHist !== 'function' || global.pushHist.__stegoHooked) return;
    var inner = global.pushHist;
    function wrapped() {
      var r = inner.apply(this, arguments);
      markDirty();
      return r;
    }
    wrapped.__stegoHooked = true;
    global.pushHist = wrapped;
  }

  global.StegoProjects = {
    init: function () {
      hook();
      setProjectLabel();
      setState('idle');
    },
    save: save, saveAs: saveAs, saveAsConfirm: saveAsConfirm,
    create: create, open: open, remove: remove, list: list,
    detach: detach, lastId: lastId,
    get current() { return current; },
    get dirty() { return dirty; },
  };
})(window);
