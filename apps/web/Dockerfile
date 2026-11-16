# syntax=docker/dockerfile:1

# A-21 — M1: Construcción productiva de la Web (Next.js standalone)
FROM node:24-bookworm-slim AS builder

WORKDIR /workspace

# Misma versión de pnpm que el proyecto.
RUN npm install --global pnpm@12.11.2

# Manifiestos del workspace para resolución determinista desde el lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/migrator/package.json ./apps/migrator/package.json
COPY apps/web ./apps/web

# Instala únicamente las dependencias del paquete web sin ejecutar el postinstall de api.
RUN pnpm install --frozen-lockfile --filter web...

# API_URL es obligatoria en el build productivo de Next.js (HTTPS, absoluta, sin /api).
ARG API_URL
ENV API_URL=${API_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web build

# A-21 — M1: Imagen de ejecución mínima (Next.js standalone)
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Artefacto standalone autohospedado e incluye sólo las trazas necesarias de node_modules.
COPY --from=builder --chown=node:node \
    /workspace/apps/web/.next/standalone ./

COPY --from=builder --chown=node:node \
    /workspace/apps/web/.next/static ./apps/web/.next/static

COPY --from=builder --chown=node:node \
    /workspace/apps/web/public ./apps/web/public

# No ejecutar el contenedor como root.
USER node

EXPOSE 3001

CMD ["node", "apps/web/server.js"]
