const Database = require('better-sqlite3');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'stego.db');

// La cartella dei dati non è versionata (ci finiscono DB e backup) e
// sqlite non la crea: senza questo, un avvio fuori da Docker muore con
// "unable to open database file". Serve anche allo store delle sessioni,
// che scrive il suo sessions.db qui accanto.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username     TEXT PRIMARY KEY,
    password_hash TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    is_admin     INTEGER NOT NULL DEFAULT 0,
    is_active    INTEGER NOT NULL DEFAULT 1,
    source       TEXT NOT NULL DEFAULT 'local',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_login   TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Un progetto = un disegno completo nel formato JSON di STEGO
  -- (oggetti, layer, impostazioni). Il formato resta quello del file
  -- esportabile: il server non lo interpreta, lo conserva e basta.
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT 'Nuovo progetto',
    data       TEXT NOT NULL DEFAULT '{}',
    thumbnail  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(username);
`);

// ── Password hashing ──────────────────────────────────────────
// Formato: scrypt$<salt hex>$<hash hex>, salt casuale per utente.
const SCRYPT_KEYLEN = 64;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

// Confronto a tempo costante — niente timing attack sul confronto stringhe
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  let derived;
  try { derived = crypto.scryptSync(String(pw), salt, SCRYPT_KEYLEN).toString('hex'); }
  catch { return false; }
  return safeEqual(derived, hash);
}

// ── Seed: admin al primo avvio ────────────────────────────────
// Password iniziale 'admin' con must_change_password=1: finché non viene
// cambiata l'app non è utilizzabile.
const adminExists = db.prepare(`SELECT 1 FROM users WHERE username = 'admin'`).get();
if (!adminExists) {
  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, is_admin, source, must_change_password)
    VALUES ('admin', ?, 'Administrator', 1, 'local', 1)
  `).run(hashPassword('admin'));
  console.warn('[stego] Utente admin creato con password iniziale "admin" — va cambiata al primo accesso.');
}

// ── Users ─────────────────────────────────────────────────────
function getUsers() {
  return db.prepare(`
    SELECT username, display_name, is_admin, is_active, source, must_change_password, created_at, last_login
    FROM users ORDER BY is_admin DESC, username ASC
  `).all();
}

function getUserByUsername(username) {
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
}

// password null → utente esterno (LDAP): nessun hash locale, quindi
// nessuna credenziale locale utilizzabile per quell'account.
function createUser(username, password, displayName, isAdmin = 0, source = 'local') {
  if (db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(username)) {
    throw new Error('Utente già esistente');
  }
  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, is_admin, source, must_change_password)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(username, password == null ? null : hashPassword(password), displayName || username, isAdmin ? 1 : 0, source);
}

function updateUser(username, { displayName, isAdmin, isActive }) {
  const sets = [], vals = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
  if (isAdmin     !== undefined) { sets.push('is_admin = ?');     vals.push(isAdmin ? 1 : 0); }
  if (isActive    !== undefined) { sets.push('is_active = ?');    vals.push(isActive ? 1 : 0); }
  if (!sets.length) return;
  vals.push(username);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE username = ?`).run(...vals);
}

// mustChange=true → cambio obbligatorio al primo accesso (reset da admin).
function resetPassword(username, newPassword, mustChange = true) {
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = ? WHERE username = ?`)
    .run(hashPassword(newPassword), mustChange ? 1 : 0, username);
}

function deleteUser(username) {
  db.prepare(`DELETE FROM users WHERE username = ?`).run(username);
}

function countAdmins() {
  return db.prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND is_active = 1`).get().n;
}

function verifyPassword(username, password) {
  const user = db.prepare(`SELECT password_hash, is_active FROM users WHERE username = ? AND source = 'local'`).get(username);
  if (!user || !user.is_active || !user.password_hash) return false;
  return checkPassword(password, user.password_hash);
}

function mustChangePassword(username) {
  const u = db.prepare(`SELECT must_change_password FROM users WHERE username = ?`).get(username);
  return !!(u && u.must_change_password);
}

function touchLogin(username) {
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE username = ?`).run(username);
}

// ── Settings ──────────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Projects ──────────────────────────────────────────────────
// La lista non porta mai `data`: un disegno con immagini può pesare
// megabyte e la sidebar ne mostra decine.
function getProjectsByUser(username) {
  return db.prepare(`
    SELECT id, title, thumbnail, created_at, updated_at,
           LENGTH(data) AS size
    FROM projects WHERE username = ? ORDER BY updated_at DESC
  `).all(username);
}

function getProject(id, username) {
  const row = username
    ? db.prepare(`SELECT * FROM projects WHERE id = ? AND username = ?`).get(id, username)
    : db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (!row) return null;
  let data;
  try { data = JSON.parse(row.data); } catch { data = {}; }
  return { ...row, data };
}

function createProject(id, username, title, data, thumbnail) {
  db.prepare(`INSERT INTO projects (id, username, title, data, thumbnail) VALUES (?, ?, ?, ?, ?)`)
    .run(id, username, title || 'Nuovo progetto', JSON.stringify(data || {}), thumbnail || null);
  return getProject(id, username);
}

function saveProject(id, username, { title, data, thumbnail }) {
  const sets = [], vals = [];
  if (title     !== undefined) { sets.push('title = ?');     vals.push(title); }
  if (data      !== undefined) { sets.push('data = ?');      vals.push(JSON.stringify(data || {})); }
  if (thumbnail !== undefined) { sets.push('thumbnail = ?'); vals.push(thumbnail || null); }
  if (!sets.length) return true;
  sets.push("updated_at = datetime('now')");
  vals.push(id, username);
  return db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND username = ?`).run(...vals).changes > 0;
}

function deleteProject(id, username) {
  return db.prepare(`DELETE FROM projects WHERE id = ? AND username = ?`).run(id, username).changes > 0;
}

// Export completo dei progetti di un utente (archivio ZIP lato server).
function getProjectsForExport(username) {
  return db.prepare(`SELECT * FROM projects WHERE username = ? ORDER BY created_at ASC`).all(username);
}

// Import: stesso id → sovrascrive, id assente → crea. L'utente è sempre
// quello che sta importando, mai quello scritto nell'archivio.
function upsertProjectFromImport(p, username) {
  const existing = db.prepare(`SELECT 1 FROM projects WHERE id = ? AND username = ?`).get(p.id, username);
  if (existing) {
    db.prepare(`UPDATE projects SET title=?, data=?, thumbnail=?, updated_at=datetime('now') WHERE id=? AND username=?`)
      .run(p.title || 'Progetto', typeof p.data === 'string' ? p.data : JSON.stringify(p.data || {}), p.thumbnail || null, p.id, username);
  } else {
    db.prepare(`INSERT INTO projects (id, username, title, data, thumbnail, created_at) VALUES (?,?,?,?,?,COALESCE(?, datetime('now')))`)
      .run(p.id, username, p.title || 'Progetto', typeof p.data === 'string' ? p.data : JSON.stringify(p.data || {}), p.thumbnail || null, p.created_at || null);
  }
}

// ── Stats (pannello admin) ────────────────────────────────────
function getStats() {
  const users    = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  const projects = db.prepare(`SELECT COUNT(*) AS n FROM projects`).get().n;
  const bytes    = db.prepare(`SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM projects`).get().n;
  const perUser  = db.prepare(`
    SELECT u.username, u.display_name, COUNT(p.id) AS projects,
           COALESCE(SUM(LENGTH(p.data)), 0) AS bytes, u.last_login
    FROM users u LEFT JOIN projects p ON p.username = u.username
    GROUP BY u.username ORDER BY projects DESC, u.username ASC
  `).all();
  return { users, projects, bytes, perUser };
}

module.exports = {
  // users
  getUsers, getUserByUsername, createUser, updateUser, resetPassword, deleteUser,
  countAdmins, verifyPassword, touchLogin, hashPassword, mustChangePassword,
  // settings
  getSetting, setSetting, getAllSettings,
  // projects
  getProjectsByUser, getProject, createProject, saveProject, deleteProject,
  getProjectsForExport, upsertProjectFromImport,
  // stats
  getStats,
  // handle grezzo, usato dai test e dal backup
  _db: db,
};
