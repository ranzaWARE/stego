# 🦕 STEGO

**Un CAD 2D leggero che gira nel browser, con i progetti sul tuo server.**

Perché a volte vuoi solo disegnare delle linee, senza installare cinque
gigabyte di dinosauro.

E sì, si chiama come lo **Stegosauro**. Perché i dinosauri sono fighi.

---

## Cosa fa

- geometria di base: segmenti, archi, cerchi, polilinee, rettangoli, ellissi
- quote lineari e radiali, testi, immagini di sfondo
- **Break** (spezza con un click) e **Katana** (taglio a due punti)
- layer, snap (endpoint, midpoint, centro, intersezione, perpendicolare,
  tangente), griglia, ortho
- import DXF e DWG, export DXF, SVG, PNG e JSON
- progetti salvati sul server, uno spazio per utente
- tre temi: chiaro, scuro, e-ink

---

## Avvio

Lo stack è pensato per **Portainer → Stacks → Add stack → Repository**, con
il Traefik del nodo davanti: nessuna porta pubblicata sull'host, il TLS lo
termina il proxy con il suo wildcard.

Variabili dello stack:

| Variabile | Obbligatoria | Default | Cosa fa |
|---|---|---|---|
| `SESSION_SECRET` | sì | — | Segreto dei cookie di sessione (`openssl rand -hex 32`) |
| `STEGO_HOST` | no | `stego.app.local` | Nome con cui Traefik pubblica l'app |
| `TRAEFIK_NETWORK` | no | `edge` | Rete condivisa con Traefik |
| `BACKUP_CRON` | no | `0 2 * * *` | Quando gira il backup notturno del DB |
| `LDAP_*` | no | — | Directory LDAP, vedi [.env.example](.env.example) |
| `OIDC_*` | no | — | SSO OIDC, vedi [.env.example](.env.example) |

Senza `SESSION_SECRET` lo stack si rifiuta di partire: con un segreto
rigenerato a ogni avvio tutte le sessioni cadrebbero a ogni riavvio.

**Primo accesso:** utente `admin`, password `admin`. L'app chiede subito di
cambiarla e finché non è cambiata non è utilizzabile.

### In locale, senza proxy

```bash
docker compose -f docker-compose.dev.yml up -d   # http://localhost:8080
```

oppure, senza Docker:

```bash
cd backend && npm install && npm start           # http://localhost:3000
```

### Esposto direttamente, senza proxy davanti

Serve un certificato: `TLS_SELF_SIGNED=true` lo genera al primo avvio in
`/app/certs`, e l'app ascolta anche in HTTPS sulla 3443. In quel caso
`TRUST_PROXY=0`, altrimenti il rate limiter crede a un `X-Forwarded-For`
che nessuno sta scrivendo.

---

## Com'è fatto

| Cartella | Cosa contiene |
|---|---|
| `backend/` | API Express + SQLite, autenticazione, file statici |
| `backend/public/` | Il CAD: HTML, CSS AUROR, motore di disegno in JS |
| `backend/tests/` | Suite Node su DB e API |

Il disegno vive tutto nel browser: il server conserva progetti e utenti e
non interpreta mai la geometria. Un progetto salvato sul server e un file
`.json` esportato hanno lo stesso identico formato, quindi sono
interscambiabili.

### Formato di progetto

```json
{
  "layers": { "Layer 1": { "visible": true, "color": "#111827", "locked": false } },
  "activeLayer": "Layer 1",
  "segments": [
    { "id": "seg1", "a": { "x": 0, "y": 0 }, "b": { "x": 100, "y": 100 }, "layer": "Layer 1" }
  ]
}
```

JSON perché è facile da leggere, generare e convertire da altri formati.

## Importare un disegno

**Export / Import → Importa CAD**, oppure si trascina il file sulla tela.
Quello che entra si aggiunge al disegno aperto e si annulla con Undo.

| Formato | Come |
|---|---|
| **DXF** | Letto direttamente nel browser |
| **DWG** | Convertito in DXF sul server, poi letto come sopra |

Alla fine l'app dice cosa ha importato, layer per layer, e soprattutto
**cosa ha lasciato fuori**: meglio saperlo subito che accorgersene dopo.

### Cosa viene letto

Linee, cerchi, archi, polilinee (anche vecchio stile e con tratti curvi),
ellissi, testi e testi multilinea, blocchi — espansi con la loro
posizione, rotazione e scala — e le quote, che diventano geometria.
Le spline e gli archi di ellisse sono approssimati con polilinee. Layer,
colori per indice e colori a 24 bit arrivano con il resto.

Restano fuori: campiture, solidi, immagini raster incorporate e tutto ciò
che è tridimensionale. Le quote importate sono disegni, non quote
ricalcolabili.

Le unità del file (`$INSUNITS`) vengono convertite in millimetri. Se il
file non le dichiara si assumono millimetri e l'app lo segnala.

### DWG

Il container include `dwg2dxf` di **LibreDWG**, compilato durante la
costruzione dell'immagine. Regge bene i DWG fino a R2000 e in modo meno
prevedibile quelli più recenti: se un file non passa, la via più solida
resta esportare un DXF dal programma che l'ha prodotto.

#### Se la costruzione del convertitore fallisce

La compilazione di LibreDWG **non blocca la pubblicazione**: se non
riesce, l'immagine si costruisce lo stesso e l'app parte senza il
supporto DWG, dicendolo nella pagina di importazione. Per vedere il
motivo vero, con il log completo di quel solo pezzo:

```bash
docker build --target dwg --progress=plain ./backend
```

Le due cause tipiche:

- **il nodo non raggiunge github.com** (proxy aziendale): si scarica il
  tarball altrove e si usa `CAD_CONVERT_CMD`, oppure si costruisce
  l'immagine su una macchina che ha rete e la si pubblica;
- **memoria esaurita durante la compilazione**: i sorgenti generati di
  LibreDWG sono enormi e con molti core in parallelo il compilatore viene
  ucciso — dall'esterno si vede solo `exit code 1`. Si riduce il
  parallelismo con `--build-arg DWG_JOBS=1`.

Con `--build-arg DWG_REQUIRED=1` la costruzione fallisce invece di
proseguire senza convertitore, utile in un'immagine che deve averlo.

Chi ha **ODA File Converter** può usarlo al suo posto — è più affidabile
sui DWG recenti, ma è proprietario e non può essere distribuito
nell'immagine: si installa a parte e si indica con `ODA_CONVERTER_PATH`.
Con `CAD_CONVERT_CMD` si può collegare qualsiasi altro convertitore.

---

## Interfaccia

Lo scheletro e il tema vengono dal design system **AUROR**: header con
drawer di navigazione, dock strumenti, tela, inspector e barra di stato.
I file `backend/public/css/tokens.css` e `css/ui.css` sono la copia di
AUROR e non vanno modificati a mano. Bottoni, campi, schede, modali,
etichette e avvisi sono i componenti canonici (`.aurorBtn`, `.aurorInput`,
`.aurorSelect`, `.card`, `.aurorModal`, `.dsTag`, `.aurorNotice`); in
`css/app.css` sta solo ciò che è specifico del CAD — dock strumenti,
tela, inspector, barra di stato — e consuma soltanto token semantici.

### Colori e temi

Il foglio da disegno (`--paper`) segue il tema: bianco in chiaro e in
e-ink, scuro in tema scuro. I colori degli oggetti invece **non vengono
mai riscritti**: restano quelli scelti, e viene adattata solo la resa.

`js/ink.js` confronta ogni colore con il foglio su cui sta finendo e
interviene solo quando il contrasto non basta, ribaltando la luminosità e
tenendo tinta e saturazione. In pratica:

- una linea bianca si vede anche su carta bianca;
- una linea nera si vede anche su tela scura;
- un rosso resta rosso in entrambi i casi;
- export PNG e SVG e **stampa** vengono sempre resi su bianco, quindi un
  disegno fatto in tema scuro esce sulla carta come ci si aspetta.

Il DXF fa eccezione di proposito: è un formato di interscambio e porta i
colori esattamente come sono stati scelti.

---

## Autenticazione

- **Locale** — utenti nel database, password con hash scrypt e salt per utente.
- **LDAP / Active Directory** — bind con un service account, poi bind con le
  credenziali dell'utente.
- **OIDC / SSO** — Keycloak, Authentik, Zitadel e qualsiasi provider che
  pubblichi la discovery. Authorization code + PKCE; il client secret è
  facoltativo (client pubblico).

Tutti e tre si configurano dal pannello di amministrazione — che è anche il
posto da cui provarli senza uscire dall'app — oppure dalle variabili dello
stack. Gli account locali restano sempre utilizzabili: se la directory o il
provider non rispondono, l'amministratore entra comunque dal tab "Locale".

Sul provider va registrato come redirect URI `https://<STEGO_HOST>/auth/callback`.
Gli utenti che arrivano da LDAP o da OIDC vengono creati nel database senza
credenziali locali: servono solo a dare loro un ruolo e i propri progetti.

---

## Backup

Il container copia il database ogni notte in `/app/data/backups`
(`.backup` di sqlite3, quindi sicuro con il WAL attivo) e conserva gli
ultimi 30. Il volume da salvare è `stego_data`.

Ogni utente può inoltre esportare tutti i propri progetti in un singolo
file JSON da **Progetti → Esporta tutti**, e reimportarlo altrove.

---

## Scorciatoie

| Tasto | Azione |
|---|---|
| `Spazio` (tenuto) | Pan con il trascinamento |
| `Esc` | Chiude la polilinea in corso o annulla il comando |
| `Canc` / `Backspace` | Elimina la selezione |
| `Ctrl+C` / `Ctrl+V` | Copia / incolla la selezione |
| `Ctrl+S` | Salva il progetto sul server |

Annulla e ripeti stanno nell'inspector, in **Proprietà → Storico**. Le
lettere che compaiono nei tooltip degli strumenti (`L`, `R`, `C`…) non
sono ancora collegate a nulla.

Nella barra in basso si possono digitare coordinate assolute (`10,20`) o
relative (`@50,0`).

---

## Test

```bash
cd backend && npm install && npm test
```

Coprono hashing e verifica delle password, il gating del cambio password,
l'isolamento dei progetti tra utenti, il round-trip export/import e la
chiusura delle rotte di amministrazione.

---

## Licenza

MIT — vedi [LICENSE](LICENSE). Creato da **Marco RANZATO VIANELLO**.

https://buymeacoffee.com/ranzacoffee

I dinosauri approverebbero. 🦕
