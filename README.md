# Manual de Operaciones Interactivo 

Plataforma web que funciona como manual de operaciones para una empresa. Cada
persona ve solo los procedimientos de su área, los recorre paso a paso y puede
consultar a un asistente de IA que responde usando únicamente los manuales
internos, citando de qué documento sacó la información.

> Proyecto final del curso IntegrarTec · Equipo de 6 integrantes.

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

```
apps/
  api/   # NestJS
  web/   # Next.js
docs/    # justificación de herramientas y uso de IA
specs/   # especificaciones de cada funcionalidad
```

## Cómo correrlo localmente

Requisitos: Node 24, pnpm, Git y Docker Desktop (abierto).

```bash
git clone https://github.com/guillermina-gatti/manual-operaciones.git
cd manual-operaciones
pnpm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
docker compose up -d      # levanta los servicios de datos (Postgres con pgvector)
```

En dos terminales distintas:

```bash
pnpm dev:api                    # http://localhost:3000
pnpm --filter web dev -p 3001   # http://localhost:3001
```

La web reenvía `/api` al backend (rewrite de `apps/web/next.config.ts`). Si la API no está en
`http://localhost:3000`, definí `API_URL` en `apps/web/.env.local` (ver `apps/web/.env.example`).
Para compilar la web (`pnpm build`) hace falta crear `apps/web/.env` con `API_URL=http://localhost:3000`: sin esa variable, el build falla.

Tests: `pnpm --filter api test` y `pnpm --filter api test:e2e`.

### Datos de desarrollo (seed)

Carga en la base de desarrollo las áreas Ventas y Operaciones y cinco usuarios de prueba (un ADMIN y,
por cada área, un SUPERVISOR y un EMPLOYEE), con los mismos UUID que usan el selector de sesión de la
web y los tests. Sin estos datos, la API no reconoce ningún área ni usuario.

```bash
pnpm --filter api exec prisma db seed
```

Se puede correr las veces que haga falta: no duplica nada. Es **solo para desarrollo**: los usuarios no
tienen contraseña válida y el seed se niega a correr con `NODE_ENV=production` o contra una base que no
esté en `localhost`. Después de `prisma migrate reset` hay que volver a correrlo.

## Documentación

- [Justificación de herramientas](./docs/justificacion.md): qué usamos, por qué y qué alternativas evaluamos.
- [Uso de IA](./docs/uso-de-ia.md): cómo usamos la IA en el desarrollo y qué hace la del producto.
- [Especificaciones](./specs/): qué se construye en cada funcionalidad y cómo.
- Documentación de la API: Swagger en `/api/docs` con el backend corriendo.

## Cómo trabajamos

- `main`: versión estable. `develop`: integración.
- Cada tarea va en una rama que sale de `develop` (`feat/...`, `fix/...`,
  `docs/...`) y vuelve por pull request con 1 aprobación y el CI en verde.
- Commits con prefijo: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Los pull requests los revisa alguien de otra pareja, para que todos conozcan el sistema completo.

### Convención para migraciones de Prisma

Prisma puede generar instrucciones `DROP INDEX` sobre índices de `chunks` que no
corresponden al cambio intencional (por ejemplo, el índice HNSW de pgvector y el
de texto completo). Para evitar perderlos, seguimos este procedimiento:

1. Generar la migración sin aplicarla todavía (desde la raíz del monorepo):
   ```bash
   pnpm --filter api exec prisma migrate dev --create-only --name <nombre>
   ```
2. Revisar el SQL generado en
   `apps/api/prisma/migrations/<timestamp>_<nombre>/migration.sql`.
3. Eliminar cualquier instrucción `DROP INDEX "chunks_..."` que no sea un
   cambio intencional y autorizado.
4. Verificar que se conserven los siguientes índices:
   - `chunks_embedding_idx` — búsqueda semántica HNSW (pgvector)
   - `chunks_content_fts_idx` — búsqueda de texto completo en español
   - `chunks_area_ids_idx` — GIN sobre el array de UUID de áreas
   - `chunks_document_id_idx` — B-tree sobre `document_id`
5. Aplicar la migración solo después de la revisión:
   ```bash
   pnpm --filter api exec prisma migrate dev
   ```

## Equipo

Tres parejas, cada una dueña de un área del sistema.

| Integrante | GitHub | Área |
|---|---|---|
| Magali Aldana Suarez | [@Nat-magui](https://github.com/Nat-magui) | Autenticación, usuarios y CI |
| Camila Ferro | [@camilamfrr](https://github.com/camilamfrr) | Autenticación, usuarios y CI |
| Micaela Franco | [@MicaelaFranco](https://github.com/MicaelaFranco) | Procedimientos y frontend |
| Mayra Limachi | [@maylimachi](https://github.com/maylimachi) | Procedimientos y frontend |
| Matías Fauda | [@matiasfauda23](https://github.com/matiasfauda23) | Documentos y asistente de IA |
| Guillermina Gatti | [@guillermina-gatti](https://github.com/guillermina-gatti) | Documentos y asistente de IA |

## Licencia

[MIT](./LICENSE)