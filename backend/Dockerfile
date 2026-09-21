# ── Convertitore DWG ──────────────────────────────────────────
# LibreDWG non è pacchettizzato né in Alpine né in Debian, quindi si
# compila qui. Sta in uno stage a parte: nell'immagine finale arriva solo
# il binario dwg2dxf, e questo stage resta in cache finché non cambia la
# versione. La prima costruzione richiede qualche minuto.
# Stessa base dell'immagine di runtime, così la libc è la stessa.
FROM node:20-alpine AS dwg
ARG LIBREDWG_VERSION=0.14
RUN apk add --no-cache build-base curl
WORKDIR /src
RUN curl -fsSL "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.xz" -o src.tar.xz \
 && tar xf src.tar.xz --strip-components=1 \
 && ./configure --disable-shared --disable-bindings --disable-python --disable-dependency-tracking \
 && make -j"$(nproc)" \
 && strip programs/dwg2dxf \
 && programs/dwg2dxf --version

FROM node:20-alpine AS base
# python3/make/g++ servono a compilare better-sqlite3; openssl al certificato
# self-signed dell'entrypoint; sqlite al backup notturno (.backup, WAL-safe).
RUN apk add --no-cache python3 make g++ openssl sqlite
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm install
RUN mkdir -p /app/data /app/certs
COPY --from=dwg /src/programs/dwg2dxf /usr/local/bin/dwg2dxf
COPY entrypoint.sh /entrypoint.sh
COPY backup.sh /app/backup.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]

FROM base AS production
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data /app/certs
COPY --from=dwg /src/programs/dwg2dxf /usr/local/bin/dwg2dxf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]
