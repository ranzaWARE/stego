/* AUROR — overlays: modal + toast.
   AurorModal.open(id) / .close(id) / .confirm({...})
   AurorToast.show({ message, tone, action, onAction, duration })

   The modal traps focus and restores it on close, because a dialog the
   keyboard can walk out of is not a dialog. Esc and scrim clicks close it
   unless the element carries [data-locked]. */
(function (global) {
  'use strict';

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var lastFocus = null;

  function scrimFor(el) {
    var s = document.querySelector('.aurorScrim[data-for="' + el.id + '"]');
    if (!s) {
      s = document.createElement('div');
      s.className = 'aurorScrim';
      s.setAttribute('data-for', el.id);
      document.body.appendChild(s);
      s.addEventListener('click', function () {
        if (!el.hasAttribute('data-locked')) close(el.id);
      });
    }
    return s;
  }

  function open(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    lastFocus = document.activeElement;
    scrimFor(el).setAttribute('data-open', '');
    el.setAttribute('data-open', '');
    var first = el.querySelector(FOCUSABLE);
    if (first) first.focus();
  }

  function close(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.removeAttribute('data-open');
    var s = document.querySelector('.aurorScrim[data-for="' + el.id + '"]');
    if (s) s.removeAttribute('data-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  function openModals() {
    return Array.prototype.slice.call(document.querySelectorAll('.aurorModal[data-open]'));
  }

  document.addEventListener('keydown', function (e) {
    var open_ = openModals();
    if (!open_.length) return;
    var el = open_[open_.length - 1];
    if (e.key === 'Escape' && !el.hasAttribute('data-locked')) { close(el); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.slice.call(el.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Declarative wiring: [data-modal-open="id"] and [data-modal-close]
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-modal-open]');
    if (o) { open(o.getAttribute('data-modal-open')); return; }
    var c = e.target.closest('[data-modal-close]');
    if (c) { var m = c.closest('.aurorModal'); if (m) close(m); }
  });

  global.AurorModal = { open: open, close: close };

  /* ---- Toast ---- */
  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>',
    danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v6M12 16.5v.5"></path></svg>',
    neutral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 11v5M12 7.5v.5"></path></svg>'
  };

  function stack() {
    var s = document.querySelector('.aurorToastStack');
    if (!s) {
      s = document.createElement('div');
      s.className = 'aurorToastStack';
      s.setAttribute('role', 'status');
      s.setAttribute('aria-live', 'polite');
      document.body.appendChild(s);
    }
    return s;
  }

  function show(opts) {
    opts = opts || {};
    var tone = opts.tone || 'neutral';
    var el = document.createElement('div');
    el.className = 'aurorToast' + (tone !== 'neutral' ? ' aurorToast--' + tone : '');
    el.innerHTML = (ICONS[tone] || ICONS.neutral) + '<span class="toastMsg"></span>';
    el.querySelector('.toastMsg').textContent = opts.message || '';
    if (opts.action) {
      var b = document.createElement('button');
      b.className = 'toastAct';
      b.type = 'button';
      b.textContent = opts.action;
      b.addEventListener('click', function () {
        if (opts.onAction) opts.onAction();
        dismiss(el);
      });
      el.appendChild(b);
    }
    stack().appendChild(el);
    // An offered action needs time to be taken; a bare confirmation does not.
    var life = opts.duration || (opts.action ? 8000 : 4000);
    var timer = setTimeout(function () { dismiss(el); }, life);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { timer = setTimeout(function () { dismiss(el); }, 2000); });
    return el;
  }

  function dismiss(el) {
    if (!el || el.hasAttribute('data-leaving')) return;
    el.setAttribute('data-leaving', '');
    setTimeout(function () { el.remove(); }, 200);
  }

  global.AurorToast = { show: show, dismiss: dismiss };
})(window);
