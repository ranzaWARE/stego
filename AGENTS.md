# STEGO — note per chi ci lavora

CAD 2D che gira nel browser, con progetti e utenti su un backend Express +
SQLite. Distribuito come stack Docker dietro il Traefik del nodo.

## Mappa

| Percorso | Cosa c'è |
|---|---|
| `backend/server.js` | Rotte HTTP: sessione, progetti, amministrazione, callback OIDC |
| `backend/db.js` | Schema SQLite, hashing password, CRUD utenti e progetti |
| `backend/auth.js` | Autenticazione locale, LDAP, OIDC (discovery + PKCE) |
| `backend/public/js/` | Motore CAD (`core`, `geometry`, `draw`, `tools`, …) + guscio (`app`, `projects`, `api`) |
| `backend/public/css/` | `tokens.css` e `ui.css` sono AUROR, `app.css` è STEGO |
| `auror/` | Design system di riferimento — **fuori da git**, sorgente di verità per scheletro e tema |

## Regole

- **I file del CAD non sono moduli.** `core.js`, `draw.js`, `ui_logic.js` e
  compagni vengono concatenati dal browser nello scope globale: `state`,
  `snapshot`, `restore`, `draw`, `pushHist` sono globali. Il guscio si
  aggancia lì (`projects.js` avvolge `pushHist`), non con gli import.
- **Nessun colore fuori dai token.** `css/app.css` consuma solo i token
  semantici di AUROR. Unica eccezione dichiarata: `--paper`, il foglio da
  disegno, che non è una superficie dell'interfaccia ma il supporto del
  disegno, e cambia col tema.
- **I colori degli oggetti non si riscrivono mai.** Sono dati dell'utente:
  si adatta la resa, in `js/ink.js`. Ogni nuovo `strokeStyle`/`fillStyle`
  che disegna roba dell'utente passa per `StegoInk.ink(colore)`; chi
  disegna su un supporto diverso da quello a schermo (export PNG, SVG,
  stampa, miniature) usa `StegoInk.onPaper(colore, '#ffffff')` oppure
  `StegoInk.withPaper(...)`. Griglia e righelli usano `StegoInk.grid()`.
- **`css/tokens.css` e `css/ui.css` sono copie di AUROR**: si riallineano
  da `auror/`, non si modificano a mano.
- **Si usano i componenti canonici, non se ne riscrivono di uguali.**
  Bottone `.aurorBtn` (+ `.primary` / `.danger` / `.active`), campo
  `.aurorInput`, menu `.aurorSelect`, icona in bottone `.btnIco`, bottone
  icona di riga `.iconBtnSm`, etichette `.dsTag` e `.verTag`, schede
  `.card` / `.cardHeader` / `.cardBody`, modali `.aurorModal` + `AurorModal`,
  avvisi `.aurorNotice`, notifiche `AurorToast`. In `css/app.css` una classe
  AUROR si può solo **specializzare nel contesto** (`.inspector .row`,
  `.layerItem .iconBtnSm svg`), mai ridefinire nuda.
- **Eccezioni accettate**, sul modello del `DECISIONS.md` di AUROR:
  `--paper` e i tre soli `border-radius:999px` del selettore di colore
  circolare (sono forme, non chrome); il menu contestuale della tela
  (`.ctxMenu`), che non ha un componente corrispondente.
- **`auror/` non va versionato** — vedi `.gitignore`.
- Il formato di progetto salvato sul server è identico a quello del file
  `.json` esportato. Se cambia `snapshot()`, cambia anche il formato dei
  progetti già salvati: serve una migrazione o un fallback in `restore()`.

## TODO

### Import CAD — cosa resta da fare

L'importazione c'è: `public/js/dxf-import.js` legge il DXF nel browser,
`convert.js` converte i binari sul server. Quello che manca:

- **Entità non lette**: campiture (HATCH), solidi (SOLID, 3DFACE),
  immagini raster (IMAGE), e tutto ciò che è 3D. Oggi vengono contate e
  dichiarate nel resoconto, che è meglio del silenzio ma non è leggerle.
- **Quote**: arrivano come geometria espandendo il loro blocco. Per farne
  quote vive di STEGO andrebbero letti i punti di definizione (10/13/14)
  e ricostruite con `addDim`.
- **Tavolozza ACI**: ci sono i primi nove colori e i grigi finali, il
  resto ricade sul colore del layer. La tavolozza completa è di 255 voci.
- **OCS**: l'estrusione (codice 210) è ignorata. Un disegno fatto su un
  piano di costruzione specchiato arriva specchiato.
- **DWG recenti**: LibreDWG è discontinuo da R2018 in su. L'alternativa
  è ODA File Converter, che però non si può mettere nell'immagine.

### Sicurezza della sessione

Al login la sessione non viene rigenerata (`req.session.regenerate`): un
cookie di sessione piazzato prima dell'accesso resta valido anche dopo
(session fixation). Vale per tutti e tre i metodi — locale, LDAP, OIDC —
ed è una decina di righe in `/api/login` e in `/auth/callback`. Da fare
con un ambiente in cui si possano eseguire i test: sbagliare l'ordine fra
`regenerate` e `save` rompe l'accesso in modo silenzioso.

### Altro

- Le lettere nei tooltip degli strumenti (`L`, `R`, `C`, `A`, `P`, `D`,
  `T`, `V`) non sono collegate a niente: o si implementano le scorciatoie
  o si tolgono dai tooltip in `js/i18n.js`.
- Le stringhe EN di `js/i18n.js` sono incomplete rispetto alle IT.
- I colori di selezione e snap sono ancora valori fissi in `draw.js` e
  `selection.js` (blu `#3b82f6`, ambra `#f59e0b`): sono chrome, non
  oggetti, quindi non passano da `StegoInk` — ma andrebbero portati sui
  token AUROR e verificati sul foglio scuro.
- `js/ink.js` non è coperto da test: la mappatura si presta bene a una
  suite (contrasto minimo garantito, colori già leggibili non toccati,
  idempotenza su doppio passaggio).
