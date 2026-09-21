/* STEGO — client HTTP.
   Un solo posto in cui si parla col backend, così la gestione della
   sessione scaduta (401 → login) non va ripetuta a ogni chiamata. */
(function (global) {
  'use strict';

  function toLogin() {
    var next = encodeURIComponent(location.pathname + location.search);
    location.href = '/login.html?next=' + next;
  }

  async function request(method, url, body) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(url, opts);

    // 401 = sessione scaduta → si torna al login. Non vale per il login
    // stesso, dove 401 significa "credenziali sbagliate": rimandare alla
    // pagina di login da cui arriva la richiesta sarebbe un ciclo.
    if (res.status === 401 && url !== '/api/login' && location.pathname !== '/login.html') {
      toLogin();
      throw new Error('Sessione scaduta');
    }

    var data = null;
    if ((res.headers.get('content-type') || '').indexOf('application/json') === 0) {
      data = await res.json().catch(function () { return null; });
    }
    if (!res.ok) {
      var err = new Error((data && data.error) || ('Errore ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.StegoApi = {
    get:    function (u)    { return request('GET', u); },
    post:   function (u, b) { return request('POST', u, b === undefined ? {} : b); },
    put:    function (u, b) { return request('PUT', u, b === undefined ? {} : b); },
    patch:  function (u, b) { return request('PATCH', u, b === undefined ? {} : b); },
    del:    function (u)    { return request('DELETE', u); },
    toLogin: toLogin,
  };
})(window);
