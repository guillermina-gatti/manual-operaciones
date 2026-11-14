
# syntax=docker/dockerfile:1

# A-21B.2 — Construcción de la API
FROM node:24-bookworm-slim AS builder

WORKDIR /workspace

# Prisma requiere OpenSSL para detectar el entorno correctamente.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Misma versión de pnpm que el proyecto.
RUN npm install --global pnpm@12.11.2

# Archivos necesarios del workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# API, configuración de Prisma y esquema.
COPY apps/api ./apps/api

# Manifiesto web necesario para resolver el workspace.
# No se compila ni se copia el frontend al contenedor final.
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

# Generar Prisma Client y compilar NestJS.
RUN pnpm --filter api build

# Prisma Client ya fue generado durante el build.
# Evitamos ejecutar nuevamente el postinstall de la API.
RUN pnpm --filter api --prod deploy /workspace/deploy-api --ignore-scripts

# Reconstruimos bcrypt para que funcione en Linux.
RUN pnpm --dir /workspace/deploy-api rebuild bcrypt

# A-21B.6b — Dependencias reproducibles del migrador
FROM node:24-bookworm-slim AS migrator-builder

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@12.11.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/migrator/package.json ./apps/migrator/package.json

RUN pnpm install --frozen-lockfile --filter prisma-migrator...

RUN pnpm --filter prisma-migrator --prod deploy /workspace/deploy-migrator

# A-21B.6b — Imagen one-off de migraciones Prisma
FROM node:24-bookworm-slim AS migrator

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=migrator-builder --chown=node:node \
    /workspace/deploy-migrator/node_modules ./node_modules

COPY --from=migrator-builder --chown=node:node \
    /workspace/deploy-migrator/package.json ./package.json

COPY --chown=node:node apps/api/prisma.config.ts ./prisma.config.ts

COPY --chown=node:node apps/api/prisma/schema.prisma ./prisma/schema.prisma

COPY --chown=node:node apps/api/prisma/migrations ./prisma/migrations

USER node

ENTRYPOINT ["./node_modules/.bin/prisma"]
CMD ["--help"]

# A-21B.2 — Imagen de ejecución
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencias de producción y código compilado.
COPY --from=builder --chown=node:node \
    /workspace/deploy-api/node_modules ./node_modules

COPY --from=builder --chown=node:node \
    /workspace/apps/api/dist ./dist

COPY --from=builder --chown=node:node \
    /workspace/apps/api/package.json ./package.json

# No ejecutar la API como root.
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
