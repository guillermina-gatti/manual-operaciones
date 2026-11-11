# PispIAr — Interactive Operations Manual

A web platform that works as a company's operations manual: each person sees the documents and procedures of their area, runs procedures step by step, and asks an AI assistant that answers only from the internal documents, citing its sources.

> [!NOTE]
> Final project of the IntegrarTEC 2026 course, built by a team of six people in three pairs.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup from scratch](#setup-from-scratch)
- [Environment variables](#environment-variables)
  - [API](#api)
  - [Web](#web)
- [Development users](#development-users)
- [Running tests](#running-tests)
- [Project structure](#project-structure)
- [Specifications (Spec-Driven Development)](#specifications-spec-driven-development)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [How we work](#how-we-work)
  - [Prisma migrations convention](#prisma-migrations-convention)
- [Team](#team)
- [License](#license)

## Features

Screen routes are shown as they appear in the app (the UI is in Spanish).

| Feature | What it does | Where |
|---|---|---|
| Authentication and roles | Login with a short-lived access token and a rotating refresh token. Roles `ADMIN`, `SUPERVISOR` and `EMPLOYEE`, scoped by area | `/login` |
| Documents | Upload PDF, TXT and MD files; versions, area changes and archiving; download through a signed link | `/documentos`, `/documentos/nuevo`, `/documentos/[id]` |
| Search | Full-text search over document content and titles, with highlighted fragments | `/documentos?q=` |
| Review reminders | "Vence pronto" and "Vencido" labels, the list of documents to review, and "Marcar como revisado" | `/documentos/por-revisar` |
| Procedures and executions | Run a procedure step by step and record progress. Procedures are managed through the API; the authoring screen is in progress | `/ejecuciones` |
| Metrics | Document and procedure metrics by area | `/metricas` |
| AI assistant | RAG answers with citations, streamed as they are generated. Permissions are applied in the database before the model sees any content. If the AI is unavailable, it offers a link to the search without AI | `/asistente` |
| Questions from a step | The "¿Dudas con este paso?" panel asks the assistant with the current step as context | `/ejecuciones/[id]` |
| Contradictions and alerts | When two documents contradict each other, the chat shows both sources and an alert is created for the `ADMIN`, who can resolve it | `/documentos/alertas` |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 12 (REST API, Swagger at `/api/docs`) |
| Database | PostgreSQL 16 with pgvector, Prisma 7 |
| Queue and cache | Redis 7, BullMQ (document processing worker, login rate limiter) |
| AI | Google Gemini through the AI SDK (chat and embeddings) |
| File storage | S3 or S3-compatible; in memory during development |
| Testing | Jest and Supertest (API), Vitest (web), Playwright (browser) |
| CI | GitHub Actions |

## Getting started

### Prerequisites

- Node.js 24 or later
- pnpm 12 (the version is pinned in `packageManager`)
- Git
- Docker Desktop, running

### Setup from scratch

1. Clone the repository.

   ```bash
   git clone https://github.com/guillermina-gatti/manual-operaciones.git
   cd manual-operaciones
   ```

2. Start PostgreSQL (`db`, with pgvector) and Redis (`redis`).

   ```bash
   docker compose up -d
   ```

3. Install dependencies.

   ```bash
   pnpm install
   ```

4. Create the API and web environment files, then fill in the API values (see [Environment variables](#environment-variables)). The API reads `apps/api/.env`, not a `.env` at the repository root.

   ```bash
   cp .env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

   ```powershell
   Copy-Item .env.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

5. Apply the database migrations.

   ```bash
   pnpm --filter api exec prisma migrate deploy
   ```

6. Generate the Prisma client (`pnpm install` already runs it, but run it again after pulling schema changes).

   ```bash
   pnpm --filter api exec prisma generate
   ```

7. Load the development areas and users (see [Development users](#development-users)).

   ```bash
   pnpm --filter api exec prisma db seed
   ```

8. Start the API on http://localhost:3000.

   ```bash
   pnpm dev:api
   ```

9. In another terminal, start the web on http://localhost:3001.

   ```bash
   pnpm --filter web exec next dev --port 3001
   ```

The web forwards `/api` to the backend (rewrite in `apps/web/next.config.ts`).

> [!NOTE]
> Use the command in step 9 rather than `pnpm --filter web dev`. That script sets `NEXT_PUBLIC_REAL_AUTH=false` with POSIX syntax, which fails in the Windows shell. The session mode comes from `apps/web/.env.local` instead (see [Web](#web)).

## Environment variables

Only names are listed here. Never commit `.env` files or real keys.

### API

File: `apps/api/.env` (template: `.env.example`).

| Name | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Development database (`manual`) | Yes |
| `TEST_DATABASE_URL` | Integration test database (`manual_test`) | For integration tests |
| `JWT_SECRET` | Signs the access tokens | Yes |
| `REDIS_URL` | Redis for the processing queue and the login rate limiter | Yes |
| `TEST_REDIS_URL` | Redis for integration tests | For integration tests |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini key for the chat and the embeddings | For the assistant and document processing |
| `GEMINI_CHAT_MODEL` | Chat model ID; defaults to `gemini-2.5-flash` | Yes with new keys (see note) |
| `AI_PROVIDER` | Listed in `.env.example`, but the code does not read it | No |
| `S3_BUCKET` | Bucket for uploaded files; without it, files stay in memory | Yes in production |
| `AWS_REGION` | Bucket region | When `S3_BUCKET` is set |
| `S3_ENDPOINT` | Endpoint of an S3-compatible provider | No |
| `S3_FORCE_PATH_STYLE` | `true` or `false`, depending on the provider | No |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials, if no role or identity is used | When `S3_BUCKET` is set and there is no role |
| `PORT` | API port; defaults to `3000` | No |
| `APP_TIMEZONE` | Company time zone; defaults to `America/Argentina/Buenos_Aires` | No |
| `REDIS_KEY_PREFIX` | Prefix for Redis keys | No |
| `PROCESSING_WORKER_ENABLED` | `false` turns off the document processing worker | No |

> [!NOTE]
> With a new Gemini key you must set `GEMINI_CHAT_MODEL`: the default (`gemini-2.5-flash`) is not available for new keys. For example, `gemini-3.8-flash`, the model Google's own error message suggests. Google's models change often, so check the available ones in the Gemini documentation.

### Web

File: `apps/web/.env.local` (template: `apps/web/.env.example`).

| Name | Purpose | Required |
|---|---|---|
| `API_URL` | Backend that Next forwards `/api` to, without `/api` at the end. Defaults to `http://localhost:3000` in development | Yes for `pnpm build` and in production |
| `NEXT_PUBLIC_REAL_AUTH` | `false` shows the development session switcher; anything else (or unset) shows the real login screen | No |

## Development users

The seed (step 7) loads the areas Ventas and Operaciones and five users. It is idempotent, and it must be run again after `prisma migrate reset`.

| Name | Email | Role | Area |
|---|---|---|---|
| Ana Administradora | `admin@fixtures.test` | `ADMIN` | None (the role sees every area) |
| Sergio Supervisor de Ventas | `supervisorventas@fixtures.test` | `SUPERVISOR` | Ventas |
| Elena Empleada de Ventas | `empleadoventas@fixtures.test` | `EMPLOYEE` | Ventas |
| Sofía Supervisora de Operaciones | `supervisoroperaciones@fixtures.test` | `SUPERVISOR` | Operaciones |
| Emilio Empleado de Operaciones | `empleadooperaciones@fixtures.test` | `EMPLOYEE` | Operaciones |

The seed prints the development password when it finishes.

> [!WARNING]
> These users and their password are for development only. The seed refuses to run with `NODE_ENV=production` or against a database outside `localhost`, so they are never seeded in production.

## Running tests

| Suite | Command |
|---|---|
| API unit tests | `pnpm --filter api test` |
| API integration tests | `pnpm --filter api test:e2e` |
| Web unit tests | `pnpm --filter web test` |
| Playwright, mocked API (desktop and mobile) | `pnpm --filter web test:e2e` |
| Playwright, real API | `pnpm --filter web test:e2e:integracion` |
| Lint (API and web) | `pnpm lint` |

- **API integration tests** run against `manual_test` (`TEST_DATABASE_URL`) and need Docker running.
- **Playwright** starts its own web server on port 3001 (3002 with `NEXT_PUBLIC_REAL_AUTH=true`), so stop any other `next dev` first.
- **Playwright against the real API** needs the API running against `manual_test` and the test users loaded:

  ```bash
  pnpm --filter api seed:fixtures
  ```

> [!WARNING]
> Every run of `pnpm --filter api test:e2e` resets `manual_test` with `prisma migrate reset --force`. The setup refuses to run unless the database is local and its name ends in `_test`. When an AI agent launches it, Prisma asks for explicit user consent.

## Project structure

```text
apps/
  api/      NestJS API, Prisma schema and migrations, unit and integration tests
  web/      Next.js app, Vitest and Playwright tests
docs/
  contracts/   agreements between pairs (API contracts, permissions)
  deploy/      deployment inventory, architecture and budget
specs/      one folder per feature (Spec-Driven Development)
DESIGN.md   design system for the web
```

## Specifications (Spec-Driven Development)

Each feature has a folder in [`specs/`](./specs/) with `spec.md` (what and why), `plan.md` (how) and `tasks.md` (steps and status).

> [!NOTE]
> The specs are written in Spanish.

| Spec | Topic |
|---|---|
| [001](./specs/001-carga-documentos/) | Document upload and retrieval |
| [002](./specs/002-pantallas-documentos/) | Document screens |
| [003](./specs/003-ciclo-de-vida-documentos/) | Document lifecycle: versions, areas, archiving |
| [004](./specs/004-busqueda-documentos/) | Document search |
| [005](./specs/005-avisos-vencimiento/) | Review reminders |
| [006](./specs/006-procedimientos/) | Procedures: drafts, areas and visibility |
| [007](./specs/007-metricas-documentos/) | Document metrics |
| [008](./specs/008-documentos-referencias-historicas/) | Historical references in documents |
| [009](./specs/009-asistente-streaming/) | Assistant: streaming and search fallback |
| [010](./specs/010-asistente-contexto-paso/) | Assistant: asking from a procedure step |
| [011](./specs/011-asistente-contradicciones/) | Assistant: contradicting documents |

## Known limitations

> [!WARNING]
> **Downloads need S3.** Without `S3_BUCKET`, the API stores files in memory: they are lost on restart, and the download link is a `memory://` URL that the browser cannot open. The bucket is pending the deployment (see [`docs/deploy/`](./docs/deploy/)).

> [!NOTE]
> **The first login may return 503.** If Redis fails while the first logins arrive, the login rate limiter fails closed with HTTP 503. Try again.

- **Citations are matched by order.** Sources don't say which `[Sn]` marker they belong to; the web pairs them in order and, if the counts don't match, shows the text without markers.

## Documentation

All of these are in Spanish.

- [Tool choices](./docs/justificacion.md): what we use, why, and which alternatives we evaluated.
- [Use of AI](./docs/uso-de-ia.md): how we used AI during development and what the product's AI does.
- [Contracts between pairs](./docs/contracts/) and [deployment](./docs/deploy/).
- [Design system](./DESIGN.md).
- API reference: Swagger at `/api/docs` with the API running.

## How we work

- **Branches:** `main` is the stable version and `develop` is the integration branch. Each task goes in a branch from `develop` (`feat/...`, `fix/...`, `docs/...`).
- **Pull requests:** every change reaches `develop` through a pull request, with at least one approval from someone in another pair and green CI.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), all in English: a type (`feat`, `fix`, `docs`, `test`, `refactor`, `style`, `chore`), an optional scope and an imperative description. For example: `feat(documents): add review reminders`.

### Prisma migrations convention

Some database objects are written by hand in the migrations because Prisma cannot describe them. A new migration generated by Prisma may include `DROP` statements for them. To keep them:

1. Create the migration without applying it (from the repository root).

   ```bash
   pnpm --filter api exec prisma migrate dev --create-only --name <name>
   ```

2. Review the generated SQL in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`.
3. Remove any `DROP INDEX` (or `DROP EXTENSION`, `DROP TEXT SEARCH CONFIGURATION`, `DROP CONSTRAINT`) statement for the objects in step 4, unless it is an intended, approved change.
4. Check that these objects are kept:
   - `chunks_embedding_idx`: HNSW semantic search (pgvector). Hand-written in `add_chunks`.
   - `chunks_content_fts_idx`: Spanish full-text search. Hand-written in `add_chunks`.
   - `chunks_content_fts_es_unaccent_idx`: accent-insensitive full-text search, with the `unaccent` extension and the `es_unaccent` text search configuration. Hand-written in `add_document_search`.
   - `document_versions_one_current_idx`: one `CURRENT` version per document. Declared in `schema.prisma` through the `partialIndexes` preview feature, so it is checked as well.
   - The three `CHECK` constraints of `document_conflict_alerts` (`..._occurrences_check`, `..._pair_order_check`, `..._resolution_check`). Hand-written in `add_document_conflict_alerts`.

   `apps/api/test/documents/indexes.e2e-spec.ts` verifies that they all still exist (it resets `manual_test`, see [Running tests](#running-tests)):

   ```bash
   pnpm --filter api test:e2e test/documents/indexes
   ```

5. Apply the reviewed migration, then regenerate the Prisma client.

   ```bash
   pnpm --filter api exec prisma migrate deploy
   pnpm --filter api exec prisma generate
   ```

> [!WARNING]
> Never apply a migration with `prisma migrate dev`: it can generate and apply SQL that nobody reviewed. Use it only with `--create-only` (step 1), and apply with `prisma migrate deploy`.

## Team

Three pairs, each one owning an area of the system.

| Member | GitHub | Area |
|---|---|---|
| Magali Aldana Suarez | [@Nat-magui](https://github.com/Nat-magui) | Authentication, users and CI |
| Camila Ferro | [@camilamfrr](https://github.com/camilamfrr) | Authentication, users and CI |
| Micaela Franco | [@MicaelaFranco](https://github.com/MicaelaFranco) | Procedures and frontend |
| Mayra Limachi | [@maylimachi](https://github.com/maylimachi) | Procedures and frontend |
| Matías Fauda | [@matiasfauda23](https://github.com/matiasfauda23) | Documents and AI assistant |
| Guillermina Gatti | [@guillermina-gatti](https://github.com/guillermina-gatti) | Documents and AI assistant |

## License

[MIT](./LICENSE)
