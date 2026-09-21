const express     = require('express');
const rateLimit   = require('express-rate-limit');
const session     = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path    = require('path');
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db    = require('./db');
const auth  = require('./auth');

const app  = express();
const PORT       = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const DB_DIR = path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'stego.db'));

const CERT_PATH = process.env.CERT_PATH || '/app/certs/server.crt';
const KEY_PATH  = process.env.KEY_PATH  || '/app/certs/server.key';
const HAS_CERTS = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);

// Dietro nginx il rate limiter deve leggere X-Forwarded-For, altrimenti
// tutti i client condividono il contatore dell'IP del proxy.
const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);
if (TRUST_PROXY > 0) app.set('trust proxy', TRUST_PROXY);

// Senza SESSION_SECRET si genera un segreto casuale a ogni avvio: le sessioni
// non sopravvivono al riavvio, ma non si usa mai un segreto noto e pubblico.
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  SESSION_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[stego] SESSION_SECRET assente o troppo corto — generato segreto casuale temporaneo. Le sessioni verranno invalidate a ogni riavvio.');
}

// I disegni con immagini raster incorporate arrivano tranquillamente a
// qualche decina di MB: il limite di default (100kb) li rifiuterebbe.
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DB_DIR }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 'auto' → express-session decide per richiesta guardando req.secure
    // (che tiene conto di X-Forwarded-Proto). L'app risponde sia in HTTP
    // che in HTTPS: un booleano fisso romperebbe una delle due porte.
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
}));

// ── Rate limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Troppi tentativi, riprova tra 15 minuti' } });
const apiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 600 });
app.use('/api/login', loginLimiter);
app.use('/api/', apiLimiter);

// I browser mandano Accept: text/html,…,*/* anche per una navigazione
// normale, quindi req.accepts('json') non distingue nulla: si guarda il path.
const isApi = req => req.path.startsWith('/api/');

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    if (isApi(req)) return res.status(401).json({ error: 'Non autenticato' });
    return res.redirect('/login.html');
  }
  // Password da cambiare: nessuna API utilizzabile finché non è cambiata.
  // /api/me e /api/change-password restano accessibili per pilotare il modale.
  if (req.session.user.must_change_password) {
    if (isApi(req)) return res.status(403).json({ error: 'Password da cambiare', must_change_password: true });
    return res.redirect('/');
  }
  next();
}

// Autenticato ma senza il blocco "cambia password" — per /api/me e logout
function requireSession(req, res, next) {
  if (req.session?.user) return next();
  if (isApi(req)) return res.status(401).json({ error: 'Non autenticato' });
  res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.is_admin) return next();
  res.status(403).json({ error: 'Accesso non autorizzato' });
}

// ── Pagine ────────────────────────────────────────────────────
// Le pagine dell'app stanno dietro la sessione; login e asset no.
// La static va dichiarata dopo, altrimenti servirebbe index.html
// prima che il guard possa reindirizzare al login.
app.get(['/', '/index.html'], requireSession, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin.html', requireAuth, requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ──────────────────────────────────────────────────────
// Config pubblica: dice alla pagina di accesso quali metodi mostrare.
// Non deve contenere nulla di segreto: la legge chiunque, senza sessione.
app.get('/api/config', (req, res) => {
  const ldap = auth.getLdapConfig();
  const oidc = auth.getOidcConfig();
  res.json({
    ldap_enabled: !!ldap.enabled,
    ldap_server: ldap.enabled ? ldap.url : '',
    oidc_enabled: !!oidc.enabled,
    oidc_label: oidc.enabled ? (oidc.label || 'SSO') : '',
    brand: db.getSetting('brand_name') || 'STEGO',
    version: require('./package.json').version,
  });
});

// ── OIDC ──────────────────────────────────────────────────────
// Il redirect_uri deve essere identico a quello registrato sul provider.
// Se non è configurato si ricava dalla richiesta: dietro il proxy, host e
// schema arrivano da X-Forwarded-* (vedi trust proxy).
function oidcRedirectUri(req) {
  const cfg = auth.getOidcConfig();
  if (cfg.redirectUri) return cfg.redirectUri;
  return `${req.protocol}://${req.get('host')}/auth/callback`;
}

app.get('/api/oidc/start', async (req, res) => {
  try {
    const { url, state, verifier } = await auth.oidcAuthUrl(oidcRedirectUri(req));
    req.session.oidc = { state, verifier };
    // La sessione va scritta prima del redirect: senza il cookie, al
    // ritorno lo state non combacerebbe con niente.
    req.session.save(err => {
      if (err) return res.status(500).json({ error: 'Sessione non salvata' });
      res.json({ redirect: url });
    });
  } catch (e) {
    console.error('[oidc] avvio fallito:', e.message, e.cause || '');
    res.status(400).json({ error: e.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, error: providerError, error_description } = req.query;
  const pending = req.session.oidc;
  delete req.session.oidc;   // lo state vale una volta sola

  if (providerError) {
    console.error(`[oidc] il provider ha rifiutato la richiesta: ${providerError} — ${error_description || ''}`);
    return res.redirect('/login.html?error=oidc');
  }
  if (!pending || !state || state !== pending.state) {
    console.error('[oidc] state non valido: sessione scaduta, cookie non ricevuto, o richiesta rigiocata');
    return res.redirect('/login.html?error=state');
  }
  try {
    const user = await auth.oidcExchange(code, oidcRedirectUri(req), pending.verifier);
    user.must_change_password = 0;   // la password non è nostra
    req.session.user = user;
    res.redirect('/');
  } catch (e) {
    // e.message da solo, per un fetch fallito, è il generico "fetch failed"
    // di Node: la causa vera (DNS, connessione rifiutata, certificato non
    // fidato, timeout) sta in e.cause e senza stamparla è introvabile.
    console.error('[oidc] callback fallito:', e.message, e.cause || '');
    res.redirect('/login.html?error=oidc');
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password, method } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username e password richiesti' });
  try {
    const user = await auth.authenticate(username, password, method);
    user.must_change_password = db.mustChangePassword(user.username) ? 1 : 0;
    req.session.user = user;
    res.json({ ok: true, user, must_change_password: user.must_change_password });
  } catch {
    res.status(401).json({ error: 'Credenziali non valide' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireSession, (req, res) => {
  const u = req.session.user;
  const local = db.getUserByUsername(u.username);
  res.json({
    username: u.username,
    displayName: local?.display_name || u.displayName || u.username,
    source: u.source,
    is_admin: local?.is_admin || 0,
    must_change_password: db.mustChangePassword(u.username) ? 1 : 0,
  });
});

app.post('/api/change-password', requireSession, async (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const u = req.session.user;
  if (u.source !== 'local') return res.status(400).json({ error: 'Password gestita dal provider di identità' });
  if (!nextPw || String(nextPw).length < 8) return res.status(400).json({ error: 'La nuova password deve avere almeno 8 caratteri' });
  if (!db.verifyPassword(u.username, current)) return res.status(401).json({ error: 'Password attuale errata' });
  db.resetPassword(u.username, nextPw, false);
  req.session.user.must_change_password = 0;
  res.json({ ok: true });
});

// ── Progetti ──────────────────────────────────────────────────
const MAX_TITLE = 120;
const clampTitle = t => String(t || 'Nuovo progetto').slice(0, MAX_TITLE);

app.get('/api/projects', requireAuth, (req, res) =>
  res.json(db.getProjectsByUser(req.session.user.username)));

app.post('/api/projects', requireAuth, (req, res) => {
  const { title, data, thumbnail } = req.body || {};
  const id = uuidv4();
  res.json(db.createProject(id, req.session.user.username, clampTitle(title), data || {}, thumbnail));
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const p = db.getProject(req.params.id, req.session.user.username);
  if (!p) return res.status(404).json({ error: 'Progetto non trovato' });
  res.json(p);
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const { title, data, thumbnail } = req.body || {};
  const patch = {};
  if (title     !== undefined) patch.title = clampTitle(title);
  if (data      !== undefined) patch.data = data;
  if (thumbnail !== undefined) patch.thumbnail = thumbnail;
  const ok = db.saveProject(req.params.id, req.session.user.username, patch);
  if (!ok) return res.status(404).json({ error: 'Progetto non trovato' });
  res.json({ ok: true });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const ok = db.deleteProject(req.params.id, req.session.user.username);
  if (!ok) return res.status(404).json({ error: 'Progetto non trovato' });
  res.json({ ok: true });
});

// Export/import dei propri progetti come singolo JSON — il backup che
// l'utente si porta via, distinto da quello del volume lato server.
app.get('/api/projects-export', requireAuth, (req, res) => {
  const rows = db.getProjectsForExport(req.session.user.username);
  res.setHeader('Content-Disposition', 'attachment; filename="stego-progetti.json"');
  res.json({ format: 'stego-export', version: 1, exported_at: new Date().toISOString(), projects: rows });
});

app.post('/api/projects-import', requireAuth, (req, res) => {
  const { projects } = req.body || {};
  if (!Array.isArray(projects)) return res.status(400).json({ error: 'Archivio non valido' });
  let n = 0;
  for (const p of projects) {
    if (!p || !p.id) continue;
    db.upsertProjectFromImport(p, req.session.user.username);
    n++;
  }
  res.json({ ok: true, imported: n });
});

// ── Amministrazione ───────────────────────────────────────────
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => res.json(db.getStats()));

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => res.json(db.getUsers()));

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, displayName, isAdmin } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username e password richiesti' });
  if (String(password).length < 8) return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });
  try {
    db.createUser(username, password, displayName, isAdmin ? 1 : 0, 'local');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/admin/users/:username', requireAuth, requireAdmin, (req, res) => {
  const target = db.getUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'Utente non trovato' });
  const { displayName, isAdmin, isActive } = req.body || {};
  // Togliere i diritti (o disattivare) l'ultimo admin attivo chiuderebbe
  // fuori tutti dal pannello, senza modo di rientrare.
  const losingAdmin = (isAdmin === false || isActive === false) && target.is_admin && target.is_active;
  if (losingAdmin && db.countAdmins() <= 1) {
    return res.status(400).json({ error: 'Deve restare almeno un amministratore attivo' });
  }
  db.updateUser(req.params.username, { displayName, isAdmin, isActive });
  res.json({ ok: true });
});

app.post('/api/admin/users/:username/reset-password', requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });
  if (!db.getUserByUsername(req.params.username)) return res.status(404).json({ error: 'Utente non trovato' });
  db.resetPassword(req.params.username, password, true);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:username', requireAuth, requireAdmin, (req, res) => {
  const target = db.getUserByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'Utente non trovato' });
  if (target.username === req.session.user.username) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  if (target.is_admin && target.is_active && db.countAdmins() <= 1) {
    return res.status(400).json({ error: 'Deve restare almeno un amministratore attivo' });
  }
  db.deleteUser(req.params.username);
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const all = db.getAllSettings();
  // I segreti non tornano mai al client: si possono solo riscrivere.
  if (all.ldap_bind_pass)     all.ldap_bind_pass = '********';
  if (all.oidc_client_secret) all.oidc_client_secret = '********';
  res.json(all);
});

app.post('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const allowed = [
    'brand_name',
    'ldap_enabled', 'ldap_url', 'ldap_bind_dn', 'ldap_bind_pass',
    'ldap_search_base', 'ldap_search_filter', 'ldap_tls_reject',
    'oidc_enabled', 'oidc_issuer', 'oidc_client_id', 'oidc_client_secret',
    'oidc_redirect_uri', 'oidc_label', 'oidc_tls_reject',
  ];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    // Il placeholder rimandato indietro dal form non deve sovrascrivere
    // il segreto vero con otto asterischi.
    if ((k === 'ldap_bind_pass' || k === 'oidc_client_secret') && v === '********') continue;
    db.setSetting(k, v);
  }
  // L'issuer o il TLS possono essere cambiati proprio perché sbagliati:
  // tenersi la discovery in cache vorrebbe dire non vedere la correzione.
  auth.forgetDiscovery();
  res.json({ ok: true });
});

// Prova di connessione LDAP con le impostazioni salvate — dice se il bind
// del service account funziona prima che ci sbatta contro un utente.
app.post('/api/admin/ldap-test', requireAuth, requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Servono username e password di un utente di test' });
  try {
    const user = await auth.ldapAuthenticate(username, password);
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/oidc-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { url } = await auth.oidcAuthUrl(oidcRedirectUri(req));
    res.json({ ok: true, redirect_uri: oidcRedirectUri(req), authorization_endpoint: url.split('?')[0] });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message + (e.cause ? ` (${e.cause.code || e.cause.message})` : '') });
  }
});

// ── Server ────────────────────────────────────────────────────
// Caso normale: il TLS lo termina il reverse proxy davanti allo stack e
// qui si parla HTTP sulla PORT. Il cookie di sessione resta corretto
// perché secure:'auto' guarda X-Forwarded-Proto (vedi trust proxy).
// Se invece ci sono certificati — container esposto direttamente — si
// aggiunge l'ascolto HTTPS, senza togliere quello in chiaro.
if (require.main === module) {
  if (HAS_CERTS) {
    https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
      .listen(HTTPS_PORT, () => console.log(`STEGO HTTPS :${HTTPS_PORT}`));
  }
  app.listen(PORT, () => console.log(`STEGO HTTP :${PORT}`));
}

module.exports = app;
