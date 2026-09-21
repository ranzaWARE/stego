const ldap = require('ldapjs');
const db   = require('./db');

// Le impostazioni LDAP vivono nel DB (pannello admin) e ricadono
// sull'ambiente: le variabili dello stack danno la configurazione
// iniziale, l'admin la corregge senza ricostruire il container.
function getLdapConfig() {
  return {
    enabled:      (db.getSetting('ldap_enabled') ?? process.env.LDAP_ENABLED) === 'true',
    url:          db.getSetting('ldap_url')          || process.env.LDAP_URL || '',
    bindDN:       db.getSetting('ldap_bind_dn')      || process.env.LDAP_BIND_DN || '',
    bindPassword: db.getSetting('ldap_bind_pass')    || process.env.LDAP_BIND_PASSWORD || '',
    searchBase:   db.getSetting('ldap_search_base')  || process.env.LDAP_SEARCH_BASE || '',
    searchFilter: db.getSetting('ldap_search_filter')|| process.env.LDAP_SEARCH_FILTER || '(sAMAccountName={{username}})',
    // Le directory interne usano quasi sempre certificati self-signed.
    rejectUnauthorized: (db.getSetting('ldap_tls_reject') || process.env.LDAP_TLS_REJECT_UNAUTHORIZED) !== 'false',
  };
}

async function ldapAuthenticate(username, password) {
  const cfg = getLdapConfig();
  if (!cfg.url) throw new Error('LDAP non configurato');

  return new Promise((resolve, reject) => {
    const tlsOptions = { rejectUnauthorized: cfg.rejectUnauthorized };
    const adminClient = ldap.createClient({ url: cfg.url, tlsOptions, timeout: 8000, connectTimeout: 8000 });
    adminClient.on('error', err => reject(new Error(`LDAP connection: ${err.message}`)));

    adminClient.bind(cfg.bindDN, cfg.bindPassword, err => {
      if (err) { adminClient.destroy(); return reject(new Error(`LDAP bind: ${err.message}`)); }

      const filter = cfg.searchFilter.replace('{{username}}', ldap.escapeFilter(username));
      const opts = { filter, scope: 'sub', attributes: ['dn', 'sAMAccountName', 'displayName', 'mail', 'cn'] };

      adminClient.search(cfg.searchBase, opts, (err, res) => {
        if (err) { adminClient.destroy(); return reject(new Error(`LDAP search: ${err.message}`)); }
        let entry = null;
        res.on('searchEntry', e => { entry = e; });
        res.on('error', e => { adminClient.destroy(); reject(new Error(e.message)); });
        res.on('end', () => {
          adminClient.destroy();
          if (!entry) return reject(new Error('Utente non trovato'));

          const userDN = entry.dn.toString();
          const attrs  = entry.pojo?.attributes || [];
          const get    = name => attrs.find(a => a.type === name)?.values?.[0] || '';

          // Secondo bind con le credenziali dell'utente: è lì che la
          // password viene davvero verificata.
          const userClient = ldap.createClient({ url: cfg.url, tlsOptions, timeout: 8000, connectTimeout: 8000 });
          userClient.on('error', e => reject(new Error(e.message)));
          userClient.bind(userDN, password, err => {
            userClient.destroy();
            if (err) return reject(new Error('Password non valida'));

            const uname = get('sAMAccountName') || username;
            // Sincronizza l'utente in locale per potergli assegnare is_admin
            // e appendergli i progetti. source='ldap' → niente hash locale.
            if (!db.getUserByUsername(uname)) {
              try { db.createUser(uname, null, get('displayName') || get('cn') || uname, 0, 'ldap'); } catch {}
            }
            db.touchLogin(uname);
            const local = db.getUserByUsername(uname);
            if (local && !local.is_active) return reject(new Error('Account disabilitato'));
            resolve({
              username: uname,
              displayName: get('displayName') || get('cn') || uname,
              email: get('mail') || '',
              source: 'ldap',
              is_admin: local?.is_admin || 0,
            });
          });
        });
      });
    });
  });
}


// ── OIDC (Keycloak e compatibili) ─────────────────────────────
// Si parte dalla discovery (`/.well-known/openid-configuration`) invece
// che dai percorsi di Keycloak: gli endpoint cambiano da un provider
// all'altro, il documento di discovery no.
const crypto = require('crypto');

// undici serve solo per poter disattivare la verifica TLS su QUESTE
// richieste e non sull'intero processo (NODE_TLS_REJECT_UNAUTHORIZED
// spegnerebbe la verifica anche per LDAPS e per qualsiasi altra fetch).
let UndiciAgent = null;
try { ({ Agent: UndiciAgent } = require('undici')); } catch {}

function getOidcConfig() {
  return {
    enabled:      (db.getSetting('oidc_enabled') ?? process.env.OIDC_ENABLED) === 'true',
    issuer:       (db.getSetting('oidc_issuer')       || process.env.OIDC_ISSUER || '').replace(/\/+$/, ''),
    clientId:      db.getSetting('oidc_client_id')     || process.env.OIDC_CLIENT_ID || '',
    clientSecret:  db.getSetting('oidc_client_secret') || process.env.OIDC_CLIENT_SECRET || '',
    // Vuoto = si ricava dalla richiesta; va comunque registrato identico
    // sul provider, altrimenti il redirect viene rifiutato.
    redirectUri:   db.getSetting('oidc_redirect_uri')  || process.env.OIDC_REDIRECT_URI || '',
    label:         db.getSetting('oidc_label')         || process.env.OIDC_LABEL || 'SSO',
    // Un provider interno con CA aziendale non è fidato da Node, che non
    // eredita il trust store del sistema: la soluzione giusta è
    // NODE_EXTRA_CA_CERTS, questa è l'ultima spiaggia.
    tlsReject:    (db.getSetting('oidc_tls_reject') || process.env.OIDC_TLS_REJECT_UNAUTHORIZED) !== 'false',
  };
}

function dispatcherFor(cfg) {
  if (cfg.tlsReject || !UndiciAgent) return undefined;
  return new UndiciAgent({ connect: { rejectUnauthorized: false } });
}

// La discovery cambia di rado: tenerla per qualche minuto evita una
// richiesta in più a ogni login senza rendere impossibile correggere una
// configurazione sbagliata.
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
let discoveryCache = { issuer: null, at: 0, doc: null };

async function discover(cfg) {
  if (!cfg.issuer) throw new Error('OIDC: issuer non configurato');
  const fresh = discoveryCache.doc && discoveryCache.issuer === cfg.issuer
    && (Date.now() - discoveryCache.at) < DISCOVERY_TTL_MS;
  if (fresh) return discoveryCache.doc;

  const url = `${cfg.issuer}/.well-known/openid-configuration`;
  const res = await fetch(url, { dispatcher: dispatcherFor(cfg) });
  if (!res.ok) throw new Error(`OIDC discovery ${url}: HTTP ${res.status}`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery: documento privo di authorization_endpoint o token_endpoint');
  }
  discoveryCache = { issuer: cfg.issuer, at: Date.now(), doc };
  return doc;
}

function forgetDiscovery() { discoveryCache = { issuer: null, at: 0, doc: null }; }

// PKCE: anche con un client confidenziale costa due righe e toglie di
// mezzo l'intercettazione del codice di autorizzazione.
function pkcePair() {
  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function oidcAuthUrl(redirectUri) {
  const cfg = getOidcConfig();
  if (!cfg.enabled) throw new Error('OIDC non abilitato');
  if (!cfg.clientId) throw new Error('OIDC: client_id non configurato');
  const doc = await discover(cfg);
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = pkcePair();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { url: `${doc.authorization_endpoint}?${params}`, state, verifier };
}

async function oidcExchange(code, redirectUri, verifier) {
  const cfg = getOidcConfig();
  const doc = await discover(cfg);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    dispatcher: dispatcherFor(cfg),
  });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}: ${tokens.error || ''} ${tokens.error_description || ''}`);

  // I claim di profilo stanno nell'id_token: l'access_token non è
  // garantito essere un JWT, e quando lo è può non portarli. Se manca
  // l'id_token si ripiega su userinfo, che è sempre standard.
  let claims = null;
  if (tokens.id_token) {
    claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
  } else if (tokens.access_token && doc.userinfo_endpoint) {
    const ui = await fetch(doc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      dispatcher: dispatcherFor(cfg),
    });
    if (!ui.ok) throw new Error(`userinfo HTTP ${ui.status}`);
    claims = await ui.json();
  }
  if (!claims) throw new Error('risposta priva di id_token e di userinfo utilizzabile');

  const username = claims.preferred_username || claims.email || claims.sub;
  if (!username) throw new Error('nessun claim utilizzabile come username (preferred_username/email/sub)');

  // Stesso trattamento degli utenti LDAP: si sincronizza in locale per
  // poter assegnare is_admin, senza credenziali locali utilizzabili.
  if (!db.getUserByUsername(username)) {
    try { db.createUser(username, null, claims.name || username, 0, 'oidc'); } catch {}
  }
  const local = db.getUserByUsername(username);
  if (local && !local.is_active) throw new Error('Account disabilitato');
  db.touchLogin(username);
  return {
    username,
    displayName: claims.name || username,
    email: claims.email || '',
    source: 'oidc',
    is_admin: local?.is_admin || 0,
  };
}

async function localAuthenticate(username, password) {
  if (!db.verifyPassword(username, password)) throw new Error('Credenziali non valide');
  db.touchLogin(username);
  const user = db.getUserByUsername(username);
  return {
    username: user.username,
    displayName: user.display_name,
    source: 'local',
    is_admin: user.is_admin,
    must_change_password: user.must_change_password ? 1 : 0,
  };
}

// method non passato → prova prima il locale, poi LDAP se abilitato.
// Gli account locali restano sempre utilizzabili: se l'AD non risponde,
// l'amministratore entra comunque.
async function authenticate(username, password, method) {
  if (method === 'local') return localAuthenticate(username, password);
  if (method === 'ldap')  return ldapAuthenticate(username, password);
  try { return await localAuthenticate(username, password); }
  catch (e) {
    if (getLdapConfig().enabled) return ldapAuthenticate(username, password);
    throw e;
  }
}

module.exports = {
  authenticate, localAuthenticate, ldapAuthenticate, getLdapConfig,
  getOidcConfig, oidcAuthUrl, oidcExchange, forgetDiscovery,
};
