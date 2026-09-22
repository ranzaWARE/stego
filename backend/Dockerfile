# ── Convertitore DWG ──────────────────────────────────────────
# LibreDWG non è pacchettizzato né in Alpine né in Debian, quindi si
# compila qui. Sta in uno stage a parte: nell'immagine finale arriva solo
# il binario dwg2dxf, e lo stage resta in cache finché non cambia versione.
#
# Ogni passo è una RUN a sé: se qualcosa non va, il log dice *quale*
# invece di riportare una catena di comandi lunga una riga.
#
# La compilazione NON è bloccante: un nodo senza accesso a GitHub o con
# poca memoria non deve impedire di pubblicare l'app. Se fallisce, il
# convertitore semplicemente non c'è e la pagina di importazione lo dice.
# Per pretendere invece che ci sia:
#   docker build --build-arg DWG_REQUIRED=1 ...
#
# Di base NON si compila niente: l'immagine usa il dwg2dxf già pronto in
# backend/vendor/bin/ (LibreDWG 0.14, x86_64, statico). Con DWG_BUILD=1
# si compila dai sorgenti — serve su architetture diverse da x86_64, o
# per cambiare versione — e il binario compilato ha la precedenza.
FROM node:20-alpine AS dwg
ARG LIBREDWG_VERSION=0.14
# Due lavori in parallelo: i file generati di LibreDWG sono enormi e con
# -j$(nproc) su un nodo con tanti core e poca RAM gcc viene ucciso dall'OOM
# killer — che dall'esterno si vede solo come "exit code 1".
ARG DWG_JOBS=2
ARG DWG_REQUIRED=0
ARG DWG_BUILD=0

RUN mkdir -p /out && touch /out/.keep
RUN if [ "$DWG_BUILD" = "1" ]; then apk add --no-cache build-base curl; fi

WORKDIR /src
RUN set -eu; \
    if [ "$DWG_BUILD" != "1" ]; then echo "[dwg] compilazione non richiesta: si usa il binario in vendor/"; exit 0; fi; \
    url="https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.xz"; \
    echo "[dwg] scarico $url"; \
    if ! curl -fsSL --retry 3 --retry-delay 2 "$url" -o src.tar.xz; then \
      echo "[dwg] ATTENZIONE: download fallito (rete o proxy del nodo di build)"; \
      if [ "$DWG_REQUIRED" = "1" ]; then exit 1; fi; \
      exit 0; \
    fi; \
    tar xf src.tar.xz --strip-components=1

# --disable-docs evita di tirarsi dietro texlive. Non si aggiunga
# --disable-json per alleggerire: dwgadd.c chiama dwg_read_json comunque
# e la compilazione si ferma lì. Questa combinazione è stata provata.
RUN set -eu; \
    [ -f configure ] || { echo "[dwg] sorgente assente, salto"; exit 0; }; \
    echo "[dwg] configure"; \
    ./configure --disable-shared --disable-bindings --disable-python \
                --disable-dependency-tracking --disable-docs \
      || { echo "[dwg] ATTENZIONE: configure fallito"; tail -30 config.log 2>/dev/null || true; \
           if [ "$DWG_REQUIRED" = "1" ]; then exit 1; fi; exit 0; }

RUN set -eu; \
    [ -f Makefile ] || { echo "[dwg] niente da compilare, salto"; exit 0; }; \
    echo "[dwg] compilo con -j${DWG_JOBS}"; \
    if make -j"${DWG_JOBS}" && [ -x programs/dwg2dxf ]; then \
      strip programs/dwg2dxf; \
      cp programs/dwg2dxf /out/dwg2dxf; \
      /out/dwg2dxf --version; \
    else \
      echo "[dwg] ATTENZIONE: compilazione fallita — l'immagine verrà costruita senza supporto DWG"; \
      if [ "$DWG_REQUIRED" = "1" ]; then exit 1; fi; \
    fi; \
    exit 0

FROM node:20-alpine AS base
# python3/make/g++ servono a compilare better-sqlite3; openssl al certificato
# self-signed dell'entrypoint; sqlite al backup notturno (.backup, WAL-safe).
RUN apk add --no-cache python3 make g++ openssl sqlite
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm install
RUN mkdir -p /app/data /app/certs
# Prima l'eventuale binario depositato a mano, poi quello compilato: se
# lo stage ne ha prodotto uno vince lui. Si copiano le cartelle e non i
# file, così una vendor/bin/ o una /out vuote non fanno fallire la COPY.
COPY vendor/bin/ /usr/local/bin/
COPY --from=dwg /out/ /usr/local/bin/
COPY entrypoint.sh /entrypoint.sh
COPY backup.sh /app/backup.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]

FROM base AS production
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data /app/certs
COPY vendor/bin/ /usr/local/bin/
COPY --from=dwg /out/ /usr/local/bin/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/backup.sh; \
    [ -f /usr/local/bin/dwg2dxf ] && chmod +x /usr/local/bin/dwg2dxf || true
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]
