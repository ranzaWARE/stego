FROM node:20-alpine AS base
# python3/make/g++ servono a compilare better-sqlite3; openssl al certificato
# self-signed dell'entrypoint; sqlite al backup notturno (.backup, WAL-safe).
RUN apk add --no-cache python3 make g++ openssl sqlite
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm install
RUN mkdir -p /app/data /app/certs
COPY entrypoint.sh /entrypoint.sh
COPY backup.sh /app/backup.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]

FROM base AS production
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data /app/certs
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/backup.sh
EXPOSE 3000 3443
ENTRYPOINT ["/entrypoint.sh"]
