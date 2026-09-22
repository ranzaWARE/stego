# Convertitore DWG

`bin/dwg2dxf` — **LibreDWG 0.14**, collegato staticamente, x86_64.

Viene copiato in `/usr/local/bin/` dell'immagine durante la costruzione.
È questo che fa funzionare l'importazione dei DWG senza dover compilare
niente sul nodo.

| | |
|---|---|
| Versione | LibreDWG 0.14 |
| Sorgente | <https://github.com/LibreDWG/libredwg/releases/download/0.14/libredwg-0.14.tar.xz> |
| Architettura | x86_64 |
| Collegamento | statico (nessuna dipendenza dinamica, gira anche su Alpine/musl) |
| sha256 | `cfc85a83c7456bbb2c818e56954512c40a6ad7f0e80d858f2a08aeb9ca07ab23` |

Provato su: DWG R2000, R2007, R2013 e R2018 dei file di test di LibreDWG,
tutti convertiti in DXF con le entità leggibili da `public/js/dxf-import.js`.

Verificato in esercizio dentro il container Alpine il 2026-09-23: un
eseguibile collegato staticamente non ha bisogno del loader di glibc,
quindi gira su musl senza adattamenti.

## Se non parte

L'app esegue `dwg2dxf --version` all'avvio: se il binario non parte si
comporta come se non ci fosse e scrive il motivo nel log del container.
Succede se il nodo non è x86_64. In quel caso si compila dai sorgenti,
mettendo `DWG_BUILD=1` nelle variabili dello stack.

## Come rifarlo

Su una macchina con Docker, dentro questa cartella (`backend/vendor/bin/`):

```bash
docker run --rm -v "$PWD:/out" alpine:3.20 sh -c '
  apk add --no-cache build-base curl &&
  curl -fsSL https://github.com/LibreDWG/libredwg/releases/download/0.14/libredwg-0.14.tar.xz -o s.tar.xz &&
  mkdir -p /b && tar xf s.tar.xz -C /b --strip-components=1 && cd /b &&
  ./configure --disable-shared --disable-bindings --disable-python \
              --disable-dependency-tracking --disable-docs &&
  make -j2 && strip programs/dwg2dxf && cp programs/dwg2dxf /out/'
```

Un binario compilato su Alpine è già adatto così com'è. Se invece lo si
compila su una distribuzione glibc, va collegato **staticamente**,
altrimenti nell'immagine cerca `/lib64/ld-linux-x86-64.so.2` e non parte.

## Licenza

LibreDWG è GPL-3.0; STEGO è MIT. Sono due programmi distinti: STEGO lo
invoca come processo esterno (`backend/convert.js`), non lo collega.
Chi ridistribuisce questo binario deve accompagnarlo con i sorgenti o
con l'indicazione di dove prenderli: la riga "Sorgente" qui sopra.
