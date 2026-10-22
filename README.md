# Manual de Operaciones Interactivo 

Plataforma web que funciona como manual de operaciones para una empresa. Cada
persona ve solo los procedimientos de su área, los recorre paso a paso y puede
consultar a un asistente de IA que responde usando únicamente los manuales
internos, citando de qué documento sacó la información.

> Proyecto final del curso [nombre del curso] · Equipo de 6 integrantes.

## Qué hace

- Login con access token corto y refresh token rotativo.
- Roles (administrador, supervisor, empleado) y áreas.
- Procedimientos con pasos ordenados y registro de avance.
- Carga y procesamiento de documentos PDF y de texto.
- Asistente con RAG: respuestas con cita a la fuente y filtrado por permisos
  aplicado en la base de datos, antes de que el modelo vea el contenido.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | NestJS (API REST, Swagger) |
| Base de datos | PostgreSQL + pgvector |
| IA | Google Gemini API |
| Infraestructura | AWS |
| Testing | Jest, Supertest, Playwright |
| CI/CD | GitHub Actions |

## Estructura

\`\`\`
apps/
  api/   # NestJS
  web/   # Next.js
\`\`\`

## Cómo correrlo localmente

Requisitos: Node 24, pnpm, Git y Docker Desktop (abierto).

\`\`\`bash
git clone https://github.com/guillermina-gatti/manual-operaciones.git
cd manual-operaciones
pnpm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
docker compose up -d      # levanta Postgres con pgvector
\`\`\`

En dos terminales distintas:

\`\`\`bash
pnpm dev:api                    # http://localhost:3000
pnpm --filter web dev -p 3001   # http://localhost:3001
\`\`\`

Tests: `pnpm --filter api test` y `pnpm --filter api test:e2e`.

## Cómo trabajamos

- `main`: versión estable. `develop`: integración.
- Cada tarea va en una rama que sale de `develop` (`feat/...`, `fix/...`,
  `docs/...`) y vuelve por pull request con 1 aprobación y el CI en verde.
- Commits con prefijo: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.

## Equipo

| Integrante | Área |
|---|---|
| [Nombre] | Autenticación, usuarios y CI |
| [Nombre] | Autenticación, usuarios y CI |
| [Nombre] | Procedimientos y frontend |
| [Nombre] | Procedimientos y frontend |
| [Nombre] | Documentos y asistente de IA |
| [Nombre] | Documentos y asistente de IA |

## Licencia

[MIT](./LICENSE)