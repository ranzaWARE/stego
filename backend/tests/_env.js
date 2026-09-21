// Ambiente comune alle suite: un DB usa e getta per ogni esecuzione, così
// i test non toccano mai i dati veri e non dipendono dall'ordine.
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stego-test-'));
process.env.DB_PATH = path.join(dir, 'stego.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';
process.env.NODE_ENV = 'test';
process.env.LDAP_ENABLED = 'false';
process.env.TRUST_PROXY = '0';
// Senza questo il server proverebbe a servire i certificati di /app/certs
process.env.CERT_PATH = path.join(dir, 'nope.crt');
process.env.KEY_PATH  = path.join(dir, 'nope.key');

process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

// ---- micro-harness ----------------------------------------------------
let passed = 0;
const failures = [];

async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}

function done() {
  console.log(`\n  ${passed} passati, ${failures.length} falliti`);
  if (failures.length) process.exit(1);
}

module.exports = { test, done, dir };
