const { test, done } = require('./_env');
const assert = require('assert');
const http = require('http');

const app = require('../server');
const db  = require('../db');

const server = http.createServer(app);
let base = '';

// Client minimo con barattolo dei cookie: le rotte sono tutte a sessione,
// quindi senza cookie non si prova nulla di utile.
function client() {
  let cookie = '';
  return async function call(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
      method, headers, redirect: 'manual',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    let data = null;
    if ((res.headers.get('content-type') || '').startsWith('application/json')) {
      data = await res.json().catch(() => null);
    }
    return { status: res.status, data, location: res.headers.get('location') };
  };
}

(async () => {
await new Promise(r => server.listen(0, '127.0.0.1', r));
base = 'http://127.0.0.1:' + server.address().port;

const admin = client();

await test('la configurazione pubblica è leggibile senza sessione', async () => {
  const r = await client()('GET', '/api/config');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ldap_enabled, false);
  assert.strictEqual(r.data.oidc_enabled, false);
  assert.ok(r.data.version);
});

await test('la config pubblica non lascia uscire segreti', async () => {
  const r = await client()('GET', '/api/config');
  const body = JSON.stringify(r.data);
  for (const leak of ['client_secret', 'bind_pass', 'password', 'secret']) {
    assert.ok(!body.includes(leak), `la config pubblica contiene "${leak}"`);
  }
});

await test('senza sessione le API rispondono 401 e le pagine reindirizzano', async () => {
  const anon = client();
  assert.strictEqual((await anon('GET', '/api/projects')).status, 401);
  const page = await anon('GET', '/');
  assert.strictEqual(page.status, 302);
  assert.strictEqual(page.location, '/login.html');
});

await test('credenziali sbagliate: 401, non un redirect', async () => {
  const r = await client()('POST', '/api/login', { username: 'admin', password: 'no' });
  assert.strictEqual(r.status, 401);
});

await test('il primo accesso admin segnala il cambio password obbligatorio', async () => {
  const r = await admin('POST', '/api/login', { username: 'admin', password: 'admin' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.must_change_password, 1);
});

await test('finché la password non cambia le API restano chiuse', async () => {
  const r = await admin('GET', '/api/projects');
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.must_change_password, true);
});

await test('/api/me resta accessibile: serve a pilotare il modale', async () => {
  const r = await admin('GET', '/api/me');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.must_change_password, 1);
});

await test('il cambio password rifiuta password corte e password attuale errata', async () => {
  assert.strictEqual((await admin('POST', '/api/change-password', { current: 'admin', next: 'corta' })).status, 400);
  assert.strictEqual((await admin('POST', '/api/change-password', { current: 'sbagliata', next: 'password-nuova' })).status, 401);
});

await test('cambiata la password, le API si aprono', async () => {
  const r = await admin('POST', '/api/change-password', { current: 'admin', next: 'password-nuova' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await admin('GET', '/api/projects')).status, 200);
});

let projectId = null;

await test('creazione, lettura e salvataggio di un progetto', async () => {
  const created = await admin('POST', '/api/projects', { title: 'Rilievo', data: { segments: [1] } });
  assert.strictEqual(created.status, 200);
  projectId = created.data.id;
  assert.ok(projectId);

  const saved = await admin('PUT', '/api/projects/' + projectId, { data: { segments: [1, 2, 3] } });
  assert.strictEqual(saved.status, 200);

  const read = await admin('GET', '/api/projects/' + projectId);
  assert.deepStrictEqual(read.data.data, { segments: [1, 2, 3] });
  assert.strictEqual(read.data.title, 'Rilievo', 'il titolo è andato perso salvando il solo disegno');
});

await test('il titolo viene troncato, non rifiutato', async () => {
  const r = await admin('POST', '/api/projects', { title: 'x'.repeat(400) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.title.length, 120);
  await admin('DELETE', '/api/projects/' + r.data.id);
});

await test('export e import fanno il giro completo', async () => {
  const exported = await admin('GET', '/api/projects-export');
  assert.strictEqual(exported.status, 200);
  assert.ok(exported.data.projects.length >= 1);
  const r = await admin('POST', '/api/projects-import', { projects: exported.data.projects });
  assert.strictEqual(r.data.imported, exported.data.projects.length);
  assert.strictEqual((await admin('POST', '/api/projects-import', { projects: 'non un array' })).status, 400);
});

// ---- utente non amministratore ---------------------------------------
const utente = client();

await test('un amministratore crea un utente locale', async () => {
  assert.strictEqual((await admin('POST', '/api/admin/users', { username: 'lea', password: 'corta' })).status, 400);
  const r = await admin('POST', '/api/admin/users', { username: 'lea', password: 'password-lunga', displayName: 'Lea' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await utente('POST', '/api/login', { username: 'lea', password: 'password-lunga' })).status, 200);
});

await test('i progetti di un utente non sono visibili né raggiungibili da un altro', async () => {
  assert.deepStrictEqual((await utente('GET', '/api/projects')).data, []);
  assert.strictEqual((await utente('GET', '/api/projects/' + projectId)).status, 404);
  assert.strictEqual((await utente('PUT', '/api/projects/' + projectId, { title: 'mio' })).status, 404);
  assert.strictEqual((await utente('DELETE', '/api/projects/' + projectId)).status, 404);
});

await test('le rotte di amministrazione sono chiuse a chi non è admin', async () => {
  for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/settings']]) {
    assert.strictEqual((await utente(m, p)).status, 403, p + ' accessibile a un utente normale');
  }
});

await test('la password di bind LDAP non torna mai al client', async () => {
  await admin('POST', '/api/admin/settings', { ldap_bind_pass: 'segreto-vero', ldap_url: 'ldap://esempio:389' });
  const r = await admin('GET', '/api/admin/settings');
  assert.strictEqual(r.data.ldap_bind_pass, '********');
  // Rimandare indietro il placeholder non deve sovrascrivere il valore.
  await admin('POST', '/api/admin/settings', { ldap_bind_pass: '********' });
  assert.strictEqual(db.getSetting('ldap_bind_pass'), 'segreto-vero');
});

await test('le impostazioni fuori elenco vengono ignorate', async () => {
  await admin('POST', '/api/admin/settings', { rotta_inventata: 'x' });
  assert.strictEqual(db.getSetting('rotta_inventata'), null);
});

await test('l\'ultimo amministratore attivo non può essere degradato né eliminato', async () => {
  assert.strictEqual((await admin('PATCH', '/api/admin/users/admin', { isAdmin: false })).status, 400);
  assert.strictEqual((await admin('DELETE', '/api/admin/users/admin')).status, 400);
});

// ---- OIDC ------------------------------------------------------------
await test('con OIDC disattivo l\'avvio del flusso viene rifiutato', async () => {
  const r = await client()('GET', '/api/oidc/start');
  assert.strictEqual(r.status, 400);
});

await test('il callback senza state valido non autentica nessuno', async () => {
  const c = client();
  const r = await c('GET', '/auth/callback?code=finto&state=inventato');
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.location, '/login.html?error=state');
  assert.strictEqual((await c('GET', '/api/projects')).status, 401);
});

await test('un errore del provider riporta al login, non in sessione', async () => {
  const r = await client()('GET', '/auth/callback?error=access_denied');
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.location, '/login.html?error=oidc');
});

await test('il client secret OIDC non torna mai al client', async () => {
  await admin('POST', '/api/admin/settings', {
    oidc_client_secret: 'segreto-oidc',
    oidc_issuer: 'https://id.esempio.local/realms/x',
    oidc_enabled: 'true',
  });
  const r = await admin('GET', '/api/admin/settings');
  assert.strictEqual(r.data.oidc_client_secret, '********');
  await admin('POST', '/api/admin/settings', { oidc_client_secret: '********' });
  assert.strictEqual(db.getSetting('oidc_client_secret'), 'segreto-oidc');

  // Abilitato ma non raggiungibile: la config pubblica lo annuncia, e la
  // discovery fallisce senza buttare giù niente.
  const pub = await client()('GET', '/api/config');
  assert.strictEqual(pub.data.oidc_enabled, true);
  assert.strictEqual((await client()('GET', '/api/oidc/start')).status, 400);
  await admin('POST', '/api/admin/settings', { oidc_enabled: 'false' });
});

await test('il logout chiude la sessione', async () => {
  assert.strictEqual((await utente('POST', '/api/logout')).status, 200);
  assert.strictEqual((await utente('GET', '/api/projects')).status, 401);
});

server.close();
done();
})();
