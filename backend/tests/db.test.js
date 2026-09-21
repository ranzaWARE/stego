const { test, done } = require('./_env');
const assert = require('assert');
const db = require('../db');

(async () => {

await test('l\'admin viene creato al primo avvio e deve cambiare password', () => {
  const admin = db.getUserByUsername('admin');
  assert.ok(admin, 'utente admin assente');
  assert.strictEqual(admin.is_admin, 1);
  assert.ok(db.mustChangePassword('admin'), 'il flag di cambio password non è attivo');
  assert.ok(db.verifyPassword('admin', 'admin'), 'la password iniziale non verifica');
});

await test('l\'hash è scrypt con salt diverso per ogni utente', () => {
  const a = db.hashPassword('stessa-password');
  const b = db.hashPassword('stessa-password');
  assert.ok(a.startsWith('scrypt$'));
  assert.notStrictEqual(a, b, 'due hash della stessa password coincidono: salt non casuale');
});

await test('una password sbagliata non passa', () => {
  assert.strictEqual(db.verifyPassword('admin', 'sbagliata'), false);
});

await test('un utente esterno non ha credenziali locali utilizzabili', () => {
  db.createUser('dalla.directory', null, 'Utente LDAP', 0, 'ldap');
  // Il vecchio bug era passare null all'hash: diventava l'hash della
  // stringa "null", uguale per tutti e usabile come password letterale.
  assert.strictEqual(db.verifyPassword('dalla.directory', 'null'), false);
  assert.strictEqual(db.getUserByUsername('dalla.directory').password_hash, null);
});

await test('un utente disattivato non autentica più', () => {
  db.createUser('mario', 'password-lunga', 'Mario', 0, 'local');
  assert.ok(db.verifyPassword('mario', 'password-lunga'));
  db.updateUser('mario', { isActive: false });
  assert.strictEqual(db.verifyPassword('mario', 'password-lunga'), false);
  db.updateUser('mario', { isActive: true });
});

await test('il reset password obbliga il cambio al primo accesso', () => {
  db.resetPassword('mario', 'nuova-password', true);
  assert.ok(db.verifyPassword('mario', 'nuova-password'));
  assert.ok(db.mustChangePassword('mario'));
  db.resetPassword('mario', 'scelta-da-lui', false);
  assert.strictEqual(db.mustChangePassword('mario'), false);
});

await test('i progetti restano dentro il proprio utente', () => {
  db.createProject('p1', 'mario', 'Capannone', { segments: [1, 2] }, null);
  db.createProject('p2', 'admin', 'Altro', {}, null);
  assert.strictEqual(db.getProjectsByUser('mario').length, 1);
  assert.strictEqual(db.getProject('p2', 'mario'), null, 'un utente legge il progetto di un altro');
  assert.strictEqual(db.deleteProject('p2', 'mario'), false, 'un utente cancella il progetto di un altro');
});

await test('il disegno torna indietro identico a come è entrato', () => {
  const data = { segments: [{ id: 'a', a: { x: 0, y: 0 }, b: { x: 10, y: 5 } }], layers: { 'Layer 1': { visible: true } } };
  db.createProject('p3', 'mario', 'Round trip', data, null);
  assert.deepStrictEqual(db.getProject('p3', 'mario').data, data);
});

await test('la lista dei progetti non porta il disegno', () => {
  const row = db.getProjectsByUser('mario')[0];
  assert.strictEqual(row.data, undefined, 'la lista contiene il campo data');
  assert.ok(typeof row.size === 'number');
});

await test('il salvataggio aggiorna solo i campi passati', () => {
  db.saveProject('p1', 'mario', { title: 'Capannone B' });
  const p = db.getProject('p1', 'mario');
  assert.strictEqual(p.title, 'Capannone B');
  assert.deepStrictEqual(p.data, { segments: [1, 2] }, 'il disegno è stato azzerato da un salvataggio di solo titolo');
});

await test('import: stesso id sovrascrive, id nuovo crea, e l\'utente è chi importa', () => {
  db.upsertProjectFromImport({ id: 'p1', title: 'Reimportato', data: {} }, 'mario');
  db.upsertProjectFromImport({ id: 'nuovo', title: 'Nuovo', data: {} }, 'mario');
  // L'archivio può contenere username altrui: non deve contare.
  db.upsertProjectFromImport({ id: 'rubato', title: 'X', data: {}, username: 'admin' }, 'mario');
  assert.strictEqual(db.getProject('p1', 'mario').title, 'Reimportato');
  assert.ok(db.getProject('nuovo', 'mario'));
  assert.strictEqual(db.getProject('rubato', 'admin'), null);
});

await test('countAdmins vede solo gli amministratori attivi', () => {
  const before = db.countAdmins();
  db.createUser('admin2', 'password-lunga', 'Secondo', 1, 'local');
  assert.strictEqual(db.countAdmins(), before + 1);
  db.updateUser('admin2', { isActive: false });
  assert.strictEqual(db.countAdmins(), before);
});

await test('le statistiche contano utenti, progetti e byte', () => {
  const s = db.getStats();
  assert.ok(s.users >= 3);
  assert.ok(s.projects >= 3);
  assert.ok(s.bytes > 0);
  assert.ok(Array.isArray(s.perUser));
});

done();
})();
