/* STEGO — guscio dell'applicazione (AUROR).
   Tema, drawer di navigazione, sessione, modali di progetto e account.
   Il disegno non passa mai di qui: questo file sa solo chi è l'utente e
   quale progetto è aperto. */
(function (global) {
  'use strict';

  var api  = global.StegoApi;
  var proj = global.StegoProjects;
  var me   = null;

  function $(id) { return document.getElementById(id); }
  function tr(key, fallback) { return global.t ? global.t(key) : fallback; }

  function toast(message, tone) {
    if (global.AurorToast) global.AurorToast.show({ message: message, tone: tone || 'neutral' });
  }

  // ---- Tema (chiaro / scuro / e-ink) ------------------------------------
  // La chiave è condivisa con le altre pagine AUROR: chi cambia tema nel
  // CAD lo ritrova al login e nel pannello admin.
  function initTheme() {
    var btn = $('themeToggle');
    if (!btn) return;
    var order = ['light', 'dark', 'eink'];
    function apply(t) {
      if (t === 'dark' || t === 'eink') document.documentElement.setAttribute('data-theme', t);
      else document.documentElement.removeAttribute('data-theme');
      // La tela va ridisegnata: griglia e assi leggono i token del tema.
      if (typeof global.draw === 'function') global.draw();
    }
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'light';
      var next = order[(order.indexOf(cur) + 1) % order.length];
      apply(next);
      try { localStorage.setItem('auror-theme', next); } catch (e) {}
    });
    global.addEventListener('storage', function (e) {
      if (e.key === 'auror-theme' && e.newValue) apply(e.newValue);
    });
  }

  // ---- Drawer di navigazione (sotto i 900px) ----------------------------
  function initNav() {
    var hdr = document.querySelector('.dsHeader');
    var btn = $('navToggle');
    if (!hdr || !btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !hdr.hasAttribute('data-nav-open');
      if (open) hdr.setAttribute('data-nav-open', ''); else hdr.removeAttribute('data-nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (hdr.hasAttribute('data-nav-open') && !hdr.contains(e.target)) {
        hdr.removeAttribute('data-nav-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- Sessione ---------------------------------------------------------
  async function loadMe() {
    me = await api.get('/api/me');
    var name = me.displayName || me.username;
    var nameEl = $('userName'), initEl = $('userInitial');
    if (nameEl) nameEl.textContent = name;
    if (initEl) initEl.textContent = (name[0] || '?').toUpperCase();
    var admin = $('navAdmin');
    if (admin) admin.hidden = !me.is_admin;
    var accName = $('accountName'), accSrc = $('accountSource');
    if (accName) accName.textContent = name + ' (' + me.username + ')';
    if (accSrc) {
      accSrc.textContent = me.source === 'ldap'
        ? tr('account.source.ldap', 'Account della directory LDAP')
        : tr('account.source.local', 'Account locale');
    }
    // Il cambio password blocca tutto il resto: il modale è data-locked,
    // quindi non si chiude né con Esc né cliccando fuori.
    if (me.must_change_password) {
      var btnPwd = $('btnChangePwd');
      if (btnPwd) btnPwd.hidden = true;
      if (global.AurorModal) global.AurorModal.open('pwdModal');
    }
    return me;
  }

  async function initConfig() {
    try {
      var cfg = await api.get('/api/config');
      if (cfg.brand) {
        var w = $('brandWord'), m = document.querySelector('.dsBrandMark');
        if (w) w.textContent = cfg.brand;
        if (m) m.textContent = (cfg.brand[0] || 'S').toUpperCase();
        document.title = cfg.brand;
      }
    } catch (e) { /* la config pubblica non è vitale per disegnare */ }
  }

  // ---- Cambio password --------------------------------------------------
  function initPassword() {
    var btn = $('btnPwdSave');
    if (!btn) return;
    var err = $('pwdError');
    function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }

    btn.addEventListener('click', async function () {
      if (err) err.hidden = true;
      var cur = $('pwdCurrent').value, next = $('pwdNext').value, rep = $('pwdRepeat').value;
      if (next.length < 8)  return fail(tr('password.tooShort', 'La nuova password deve avere almeno 8 caratteri'));
      if (next !== rep)     return fail(tr('password.mismatch', 'Le due password non coincidono'));
      try {
        await api.post('/api/change-password', { current: cur, next: next });
        if (global.AurorModal) global.AurorModal.close('pwdModal');
        $('pwdCurrent').value = $('pwdNext').value = $('pwdRepeat').value = '';
        var btnPwd = $('btnChangePwd');
        if (btnPwd) btnPwd.hidden = false;
        toast(tr('password.changed', 'Password aggiornata'), 'success');
        me = await api.get('/api/me');
      } catch (e) { fail(e.message); }
    });

    var open = $('btnChangePwd');
    if (open) open.addEventListener('click', function () {
      if (global.AurorModal) { global.AurorModal.close('accountModal'); global.AurorModal.open('pwdModal'); }
    });
  }

  // ---- Account ----------------------------------------------------------
  function initAccount() {
    var pill = $('uiUserPill');
    if (pill) pill.addEventListener('click', function () {
      if (global.AurorModal) global.AurorModal.open('accountModal');
    });
    var out = $('btnLogout');
    if (out) out.addEventListener('click', async function () {
      // Un disegno non salvato andrebbe perso senza rimedio: il server
      // non l'ha mai visto e l'autosave locale resta su questa macchina.
      if (proj && proj.dirty && proj.current) await proj.save({ silent: true });
      try { await api.post('/api/logout'); } catch (e) {}
      location.href = '/login.html';
    });
  }

  // ---- Progetti ---------------------------------------------------------
  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
    if (isNaN(d)) return iso;
    return d.toLocaleString();
  }

  var TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';

  async function renderProjects() {
    var listEl = $('projList'), emptyEl = $('projEmpty');
    if (!listEl) return;
    listEl.innerHTML = '';
    var rows = [];
    try { rows = await proj.list(); } catch (e) { toast(e.message, 'danger'); return; }
    if (emptyEl) emptyEl.hidden = rows.length > 0;

    rows.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'projItem';
      if (proj.current && proj.current.id === p.id) item.setAttribute('aria-current', 'true');

      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'projOpen';
      openBtn.innerHTML =
        (p.thumbnail ? '<img class="projThumb" alt="" src="' + p.thumbnail + '">' : '<span class="projThumb"></span>') +
        '<span class="projMeta"><span class="projName"></span><span class="projWhen"></span></span>';
      openBtn.querySelector('.projName').textContent = p.title;
      openBtn.querySelector('.projWhen').textContent = fmtWhen(p.updated_at);
      openBtn.addEventListener('click', async function () {
        try {
          await proj.open(p.id);
          if (global.AurorModal) global.AurorModal.close('projModal');
          toast(tr('project.toast.opened', 'Progetto aperto') + ': ' + p.title, 'success');
        } catch (e) { toast(e.message, 'danger'); }
      });

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'iconBtnSm projDel';
      del.title = tr('project.delete', 'Elimina progetto');
      del.innerHTML = TRASH_ICON;
      del.addEventListener('click', async function (e) {
        e.stopPropagation();
        if (!confirm(tr('project.deleteConfirm', 'Eliminare definitivamente questo progetto?') + '\n\n' + p.title)) return;
        try { await proj.remove(p.id); renderProjects(); toast(tr('project.toast.deleted', 'Progetto eliminato'), 'success'); }
        catch (err) { toast(err.message, 'danger'); }
      });

      item.appendChild(openBtn);
      item.appendChild(del);
      listEl.appendChild(item);
    });
  }

  function initProjects() {
    proj.init();

    var open = $('navProjects');
    if (open) open.addEventListener('click', function () {
      if (global.AurorModal) global.AurorModal.open('projModal');
      renderProjects();
    });

    var save = $('navSave');
    if (save) save.addEventListener('click', function () { proj.save(); });

    var saveAs = $('navSaveAs');
    if (saveAs) saveAs.addEventListener('click', function () { proj.saveAs(); });

    var ok = $('btnSaveAsOk');
    if (ok) ok.addEventListener('click', async function () {
      try {
        await proj.saveAsConfirm($('saveAsName').value);
        renderProjects();
      } catch (e) { toast(e.message, 'danger'); }
    });

    var nuovo = $('btnProjNew');
    if (nuovo) nuovo.addEventListener('click', function () {
      proj.detach();
      if (global.AurorModal) global.AurorModal.close('projModal');
      proj.saveAs();
    });

    var exp = $('btnProjExport');
    if (exp) exp.addEventListener('click', function () { location.href = '/api/projects-export'; });

    var imp = $('btnProjImport'), impFile = $('fileProjImport');
    if (imp && impFile) {
      imp.addEventListener('click', function () { impFile.click(); });
      impFile.addEventListener('change', function () {
        var f = impFile.files && impFile.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = async function () {
          try {
            var archive = JSON.parse(String(r.result || ''));
            var res = await api.post('/api/projects-import', { projects: archive.projects || [] });
            toast(tr('project.toast.imported', 'Progetti importati') + ': ' + res.imported, 'success');
            renderProjects();
          } catch (e) { toast(e.message, 'danger'); }
          impFile.value = '';
        };
        r.readAsText(f);
      });
    }

    // Ctrl+S salva sul server invece di aprire il salva-pagina del browser.
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        proj.save();
      }
    });

    // Riapre l'ultimo progetto della sessione precedente. Se è stato
    // cancellato altrove si resta sulla tela vuota, senza errori in faccia.
    var last = proj.lastId();
    if (last) proj.open(last).catch(function () {});
  }

  // ---- Avvio ------------------------------------------------------------
  function boot() {
    // Il browser stampa la tela così com'è: senza questo, in tema scuro
    // finirebbe sulla carta un rettangolo nero.
    if (global.StegoInk) global.StegoInk.bindPrint(function () {
      if (typeof global.draw === 'function') global.draw();
    });
    initTheme();
    initNav();
    initAccount();
    initPassword();
    initProjects();
    initConfig();
    loadMe().catch(function (e) {
      if (e && e.status !== 401) toast(e.message, 'danger');
    });
  }

  // I file del CAD sono `defer`: a DOMContentLoaded il disegno è già
  // inizializzato e pushHist esiste, quindi l'aggancio trova tutto pronto.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
