/* STEGO — conversione dei formati CAD binari.

   Il DXF lo legge il browser. Il DWG no: è un formato binario chiuso di
   Autodesk e non esiste un lettore JavaScript su cui si possa contare.
   Qui il file viene passato a un convertitore esterno che lo riscrive in
   DXF, e da lì prosegue per la stessa strada di tutti gli altri.

   Convertitori cercati, in ordine:
   1. CAD_CONVERT_CMD — comando indicato a mano, con {in} e {out}
   2. dwg2dxf (LibreDWG) — quello compilato nell'immagine
   3. ODA File Converter — se qualcuno l'ha installato: regge i DWG
      recenti molto meglio, ma è proprietario e non si può distribuire. */
const { execFile } = require('child_process');
const fs   = require('fs/promises');
const os   = require('os');
const path = require('path');

const TIMEOUT_MS = Number(process.env.CAD_CONVERT_TIMEOUT_MS || 120000);

let cached = null;   // { name, kind } — risolto una volta sola

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function which(bin) {
  try {
    await run('sh', ['-c', `command -v ${bin}`]);
    return true;
  } catch { return false; }
}

// Quale convertitore c'è, se c'è. Il risultato viene tenuto: cambiarlo
// richiede comunque di ricostruire o riavviare il container.
async function detect() {
  if (cached !== null) return cached;

  if (process.env.CAD_CONVERT_CMD) {
    cached = { kind: 'custom', name: 'comando configurato' };
    return cached;
  }
  if (await which('dwg2dxf')) {
    // Non basta che il file ci sia: deve anche partire. Un binario per
    // un'altra architettura, o senza permesso di esecuzione, esiste ma
    // non funziona — meglio accorgersene qui che alla prima conversione,
    // quando l'utente ha già caricato il suo file.
    try {
      const { stdout, stderr } = await run('dwg2dxf', ['--version']);
      const version = String(stdout || stderr || '').split('\n')[0].trim();
      cached = { kind: 'libredwg', name: version || 'LibreDWG' };
      return cached;
    } catch (e) {
      console.warn('[import] dwg2dxf è presente ma non si avvia (architettura diversa? permessi?):',
        String(e.stderr || e.message || '').split('\n')[0]);
    }
  }
  if (process.env.ODA_CONVERTER_PATH) {
    cached = { kind: 'oda', name: 'ODA File Converter' };
    return cached;
  }
  cached = { kind: null, name: '' };
  return cached;
}

function formats(conv) {
  return conv && conv.kind ? ['.dwg'] : [];
}

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'stego-cad-'));
}

// Converte un buffer in testo DXF. Il nome originale serve solo per
// l'estensione: il file viene riscritto con un nome nostro, così un nome
// ostile non arriva mai alla riga di comando.
async function toDxf(buffer, originalName) {
  const conv = await detect();
  if (!conv.kind) {
    const e = new Error('Nessun convertitore DWG disponibile in questa installazione.');
    e.status = 501;
    throw e;
  }

  const ext = (path.extname(originalName || '') || '.dwg').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const dir = await tempDir();
  const inFile  = path.join(dir, 'in' + (ext || '.dwg'));
  const outFile = path.join(dir, 'out.dxf');

  try {
    await fs.writeFile(inFile, buffer);

    if (conv.kind === 'custom') {
      // Il comando arriva dalla configurazione dell'installazione, non da
      // una richiesta: i segnaposto sono gli unici valori che cambiano.
      const cmd = process.env.CAD_CONVERT_CMD
        .replace('{in}', inFile)
        .replace('{out}', outFile);
      await run('sh', ['-c', cmd]);
    } else if (conv.kind === 'libredwg') {
      await run('dwg2dxf', ['-o', outFile, inFile]);
    } else if (conv.kind === 'oda') {
      // ODAFileConverter <inDir> <outDir> <outVer> <outType> <recurse> <audit>
      await run(process.env.ODA_CONVERTER_PATH, [dir, dir, 'ACAD2018', 'DXF', '0', '1']);
      // Scrive con lo stesso nome del file di ingresso ma estensione .dxf
      const produced = path.join(dir, 'in.dxf');
      try { await fs.rename(produced, outFile); } catch { /* controllato sotto */ }
    }

    let dxf;
    try {
      dxf = await fs.readFile(outFile, 'utf8');
    } catch {
      const e = new Error('Il convertitore non ha prodotto un DXF: il file potrebbe essere di una versione DWG non supportata.');
      e.status = 422;
      throw e;
    }
    if (!dxf.trim()) {
      const e = new Error('Il DXF prodotto è vuoto.');
      e.status = 422;
      throw e;
    }
    return dxf;
  } catch (err) {
    if (err.status) throw err;
    if (err.killed) {
      const e = new Error('Conversione interrotta: ha superato il tempo massimo.');
      e.status = 504;
      throw e;
    }
    const e = new Error('Conversione fallita: ' + String(err.stderr || err.message || '').split('\n')[0]);
    e.status = 422;
    throw e;
  } finally {
    // Il file di ingresso può essere grande e non serve più a nessuno.
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { detect, toDxf, formats, _reset: () => { cached = null; } };
