# ── Convertitore DWG ──────────────────────────────────────────
# LibreDWG non è pacchettizzato né in Alpine né in Debian, quindi si
# compila qui. Sta in uno stage a parte: nell'immagine finale arriva solo
# il binario dwg2dxf, e lo stage resta in cache finché non cambia versione.
#
# Ogni passo è una RUN a sé: se qualcosa non va, il log dice *quale*
# invece di riportare una catena di comandi lunga una riga.
#
# La compilazione NON è bloccante. Il DWG è un di più — DXF e tutto il
# resto dell'app funzionano comunque — e un nodo senza accesso a GitHub o
# con poca memoria non deve impedire di pubblicare l'applicazione. Se
# fallisce, il binario semplicemente non c'è: l'app se ne accorge da sola
# e la pagina di importazione lo scrive. Per pretendere invece che ci sia:
#   docker build --build-arg DWG_REQUIRED=1 ...
FROM node:20-alpine AS dwg
ARG LIBREDWG_VERSION=0.14
# Due lavori in parallelo: i file generati di LibreDWG sono enormi e con
# -j$(nproc) su un nodo con tanti core e poca RAM gcc viene ucciso dall'OOM
# killer — che dall'esterno si vede solo come "exit code 1".
ARG DWG_JOBS=2
ARG DWG_REQUIRED=0

RUN mkdir -p /out
RUN apk add --no-cache build-base curl

WORKDIR /src
RUN set -eu; \
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
# Si copia la cartella, non il file: se la compilazione del convertitore è
# saltata, /out è vuota e la COPY non fallisce.
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
COPY --from=dwg /out/ /usr/local/bin/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]
