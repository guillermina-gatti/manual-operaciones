# Tareas 004 · Búsqueda de documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (25/10/2026):** por empezar. T01 a T08 son el backend; T09 a T15, las pantallas; T16 a T18, Playwright; T19 está **bloqueada** por el worker de Guille; T20 es la verificación.

Convenciones:

- Una tarea = un commit. Las rutas de backend son relativas a `apps/api/` y las de frontend a `apps/web/`, salvo que digan otra cosa.
- R1 a R12 y F1 a F7 son reglas de la spec; E1 a E13, sus escenarios (tabla al principio del plan); D1 a D16, las decisiones del plan (sección 9.1); Q3, la pregunta abierta, que no bloquea (sección 9.2). Las reglas y decisiones de otros planes se citan con su plan ("D1 del plan 003", "T06 de la spec 003").
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **Commits:** tipo en inglés, ámbito `api` o `web`, descripción en español y en infinitivo.
- **"Avisar al equipo antes de mergear"** marca solo las tareas que tocan archivos que usan otras parejas: `schema.prisma`, `prisma/migrations`, `main.ts`, `layout.tsx`, `ci.yml`, el README y los `.env.example`. En esta spec, solo T01.
- **Comandos de Prisma:** `prisma migrate dev`, `prisma migrate deploy` y `prisma generate` los corre el usuario, no el agente. El agente escribe el test y se detiene; el usuario crea la migración con `migrate dev --create-only`, se revisa el SQL juntos, y el usuario la aplica con `migrate deploy` y `generate` (T01; plan, sección 2.3).
- Tests:
  - backend: `pnpm --filter api test <patrón>` y `pnpm --filter api test:e2e <patrón>`. Los de integración resetean `manual_test` antes de la suite, y Prisma pide la confirmación explícita del usuario cuando lo corre un agente de IA;
  - frontend: `pnpm --filter web test <patrón>`, `pnpm --filter web test:e2e <patrón>` y `pnpm --filter web test:e2e:integracion`.
- **Fragmentos de prueba:** mientras no exista el worker, los tests de integración insertan el contenido con `seedProcessedVersion`, que se amplía en T06 con el texto y la página de cada fragmento.

---

## Backend

### T01 · Migración: búsqueda sin tildes

- **Qué hace:**
  - **El agente:** amplía `test/documents/indexes.e2e-spec.ts` y suma `chunks_content_fts_es_unaccent_idx` a la lista de índices del comentario de `Chunk` en `schema.prisma` (los que una migración nueva no puede borrar). Y **se detiene**: no corre ningún comando de Prisma.
  - **El usuario:** crea la migración `add_document_search` con `--create-only`, la revisa junto con el agente y la aplica con `migrate deploy` y `generate`.
- **Cubre:** R5; D2, D3, D13, D15; plan secciones 2.1 a 2.4.
- **Archivos:** `prisma/schema.prisma` (solo el comentario), `prisma/migrations/<fecha>_add_document_search/migration.sql` (la crea el usuario), `test/documents/indexes.e2e-spec.ts`.
- **Verificación:**
  1. **Agente, test primero**, `test/documents/indexes.e2e-spec.ts`:
     - `pg_indexes` tiene `chunks_embedding_idx`, `chunks_content_fts_idx`, `chunks_content_fts_es_unaccent_idx` y `document_versions_one_current_idx`;
     - `pg_ts_config` tiene `es_unaccent` y `pg_extension` tiene `unaccent`;
     - R5 en la base: `to_tsvector('es_unaccent', 'Instrucción técnica') @@ plainto_tsquery('es_unaccent', 'instruccion tecnica')` y `to_tsvector('es_unaccent', 'procedimiento') @@ plainto_tsquery('es_unaccent', 'procedimientos')` dan `true`.

     Sin la migración nueva falla, porque no existen ni el índice ni la configuración. El agente escribe el test, cambia el comentario y **se detiene**.
  2. **Usuario:** `pnpm --filter api exec prisma migrate dev --create-only --name add_document_search`.
  3. **Usuario y agente, juntos:** revisan `migration.sql`. Tiene que tener **solo** el SQL de la sección 2.2 del plan:
     - `CREATE EXTENSION IF NOT EXISTS unaccent`;
     - `CREATE TEXT SEARCH CONFIGURATION es_unaccent` y su `ALTER … MAPPING`;
     - `CREATE INDEX "chunks_content_fts_es_unaccent_idx"`.

     **Ningún `DROP INDEX`**: si Prisma generó `DROP INDEX "chunks_embedding_idx"` o `DROP INDEX "chunks_content_fts_idx"`, se borran esas líneas (D3, D15).
  4. **Usuario:** `pnpm --filter api exec prisma migrate deploy` y `pnpm --filter api exec prisma generate`. No `migrate dev` (plan, sección 2.3, paso 3).
  5. Con la migración aplicada, se corren `pnpm --filter api test` y `pnpm --filter api test:e2e`, con la confirmación del usuario. El test nuevo pasa y los demás siguen pasando.
- **Depende de:** —
- **Nota:** toca `schema.prisma` y las migraciones. **Avisar al equipo antes de mergear**: suma un tercer índice escrito a mano sobre `chunks` (D3). Además, **avisar a Guille** del índice nuevo; si prefiere reemplazar el suyo o cambiar su definición, se hace después en una migración aparte aprobada por ella (D15).
- **Commit:** `feat(api): agregar la búsqueda sin tildes sobre los fragmentos`

### T02 · DTO de la búsqueda

- **Qué hace:** crea `SearchDocumentsQuery`, que extiende `ListDocumentsQuery` y suma `q`: obligatorio; `@Transform` quita los espacios del principio y del final; después `@IsString()` y `@Length(3, 100)`.
- **Cubre:** R4, R10; D14; plan sección 1.1.
- **Archivos:** `src/documents/dto/search-documents.query.ts`, `src/documents/dto/search-documents.query.spec.ts`.
- **Verificación:** test primero, `search-documents.query.spec.ts`:
  - **E9:** `"ca"` y `"  ca  "` → error;
  - `"caj"` pasa; 100 caracteres pasan y 101 no;
  - sin `q` → error; `q` repetido (arreglo) → error;
  - el valor llega recortado (`"  caja "` → `"caja"`);
  - `page` y `limit` como en `ListDocumentsQuery`: por defecto 1 y 20; `limit=101` → error;
  - campos de más, rechazados por `forbidNonWhitelisted`.
- **Depende de:** —
- **Commit:** `feat(api): validar el texto de búsqueda`
- **Estado:** hecha.

### T03 · Política: qué puede encontrar cada usuario

- **Qué hace:** `document-access.policy.ts` suma `searchScope(viewer)`:
  - ADMIN → `{ areaIds: null }` (sin filtro de áreas);
  - el resto → `{ areaIds: [...] }` con sus áreas.

  El estado `ACTIVE` lo exige la consulta para todos, también para el ADMIN (R3).
- **Cubre:** R3; D5; plan sección 3.1.
- **Archivos:** `src/documents/document-access.policy.ts`, `src/documents/document-access.policy.spec.ts`.
- **Verificación:** test primero, en `document-access.policy.spec.ts`:
  - ADMIN → `{ areaIds: null }`;
  - EMPLOYEE y SUPERVISOR → sus áreas;
  - un usuario sin áreas → `{ areaIds: [] }`;
  - los tests de `canView`, `listWhere` y `canBeOwner` siguen pasando sin cambios.
- **Depende de:** —
- **Commit:** `feat(api): definir qué documentos puede encontrar cada usuario`
- **Estado:** hecha.

### T04 · Fragmento con las palabras marcadas

- **Qué hace:** crea `buildFragment(markedText, { maxWords: 30 })`, una función pura:
  - separa el texto en partes `{ text, match }` según los marcadores `U+E000` y `U+E001`;
  - elige la ventana de 30 palabras con más palabras marcadas (a igualdad, la primera), sin cortar nunca una palabra marcada;
  - agrega `…` al principio o al final solo donde se cortó texto;
  - devuelve las partes sin ningún marcador.
- **Cubre:** R8, R11; D8; plan sección 4.2.
- **Archivos:** `src/documents/search-fragment.ts`, `src/documents/search-fragment.spec.ts`.
- **Verificación:** test primero, `search-fragment.spec.ts`:
  - marcadores → partes con `match: true` y `false`, en orden;
  - un texto de 100 palabras con una marca en la 60 → ventana alrededor de la marca, con `…` a los dos lados;
  - con marcas en dos zonas, gana la ventana con más marcas;
  - un fragmento corto queda entero y sin `…`;
  - dos palabras marcadas seguidas; una marca pegada a puntuación (`«caja»,`);
  - **E12:** `<script>alert(1)</script> caja` → `<script>alert(1)</script>` queda literal en una parte sin marcar;
  - ningún `U+E000` ni `U+E001` en la salida.
- **Depende de:** —
- **Commit:** `feat(api): marcar las palabras encontradas en el fragmento`
- **Estado:** hecha.

### T05 · Contrato de la búsqueda

- **Qué hace:**
  - el puerto `DocumentsRepository` suma `search({ text, scope, page, limit })`, que devuelve `{ data: { record, fragment: { markedText, pageNumber } | null }[], total }`, con sus tipos;
  - `document.response.ts` suma `SearchFragment` (`parts`, `pageNumber`) y `DocumentSearchResult` (`DocumentSummary` + `fragment`), con `@ApiProperty` para Swagger;
  - `toHttpException` acepta la operación `'búsqueda'`.

  `PrismaDocumentsRepository.search` lanza "no implementado", así el proyecto compila mientras llega T06.
- **Cubre:** R8, R12; plan secciones 1.2, 1.3 y 3.1; D13 del plan 001.
- **Archivos:** `src/documents/documents.repository.ts`, `src/documents/prisma-documents.repository.ts`, `src/documents/dto/document.response.ts`, `src/documents/http-errors.ts`, `src/documents/http-errors.spec.ts`.
- **Verificación:**
  - test primero, `http-errors.spec.ts`: el 503 con la operación `'búsqueda'` tiene su mensaje;
  - `pnpm --filter api exec tsc --noEmit` sin errores, y `pnpm --filter api test` sigue pasando.
- **Depende de:** T03
- **Commit:** `feat(api): definir el contrato de la búsqueda`
- **Estado:** hecha.

### T06 · Repositorio: la consulta de búsqueda

- **Qué hace:** implementa `PrismaDocumentsRepository.search` como en la sección 3 del plan:
  - una transacción de solo lectura `REPEATABLE READ` con dos lecturas: el ranking con `$queryRaw` y las tarjetas con `findMany` + `documentInclude`, reordenadas según el ranking (D9);
  - antes, si `numnode(plainto_tsquery(…)) = 0`, devuelve `{ data: [], total: 0 }` sin buscar;
  - el texto **siempre** como parámetro de la plantilla, con `plainto_tsquery('es_unaccent'::regconfig, …)` en línea en cada uso; los filtros opcionales con `Prisma.sql` y `Prisma.empty`; nunca `$queryRawUnsafe` (D4);
  - la consulta de la sección 3.4: `visible`, `best_chunk`, `hits`, el `total` y la página en el `LATERAL`;
  - `ts_headline` con `HighlightAll=true` y los marcadores `U+E000`/`U+E001`, sobre el contenido sin esos caracteres (`translate`), solo para los fragmentos de la página.

  Además, `seedProcessedVersion` suma `contents?: string[]` y `pageNumbers?: (number | null)[]`. Sin ellos escribe lo mismo que antes, así los tests de la spec 003 no cambian.
- **Cubre:** R2, R3, R5, R6, R7, R8, R9, R10, R11; D4, D5, D6, D7, D9, D10, D16; plan secciones 3.2 a 3.4 y 4.2 (paso 1).
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/helpers.ts`, `test/documents/search.repository.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/search.repository.e2e-spec.ts`, con la base de tests:
  - **E3 y E4:** `instruccion tecnica` encuentra "Instrucción técnica" y `procedimientos` encuentra "procedimiento"; el texto marcado conserva la tilde;
  - **E5:** con el alcance de Ventas no aparece un documento de Operaciones; con `areaIds: null` (ADMIN), sí;
  - **E7:** un documento `ARCHIVED` no aparece ni con `areaIds: null`, ni por título ni por contenido;
  - **defensa (D5):** un fragmento `is_active = true` de una versión `REPLACED`, uno de un documento `ARCHIVED` y uno con `area_ids` de otra área no aparecen;
  - **E8:** cinco fragmentos con "stock" → un solo resultado, con el fragmento de más rango y, a igualdad, el de menor `chunk_index`;
  - **D16:** "cierre" y "caja" en dos fragmentos distintos → no aparece; las dos en el título → aparece; una en el título y otra en la descripción → aparece;
  - **R9:** coincidencia en el título antes que solo en el contenido; a igual rango, el más nuevo primero; el orden es el mismo en dos corridas;
  - **R10:** 25 documentos → `page=2, limit=20` da 5 y `total = 25`; `page=9` da `data: []` y `total = 25`;
  - solo palabras ignoradas (`de la para`) → `{ data: [], total: 0 }`;
  - **E10:** `caja & | ! :`, `caja:*`, `!!caja`, `(caja`, `caja <-> cierre`, `\` y `'; DROP TABLE documents; --` no lanzan error, y `documents` sigue existiendo;
  - **E12:** `markedText` contiene `<script>alert(1)</script>` literal y `caja` entre los marcadores. Si `ts_headline` no acepta los marcadores sin comillas en sus opciones, se pasan entre comillas dobles; es lo primero que comprueba este test (plan, sección 4.2);
  - un marcador `U+E000` dentro del contenido no aparece en `markedText` fuera de una palabra encontrada;
  - **índice (sección 9 de la spec):** con `SET LOCAL enable_seqscan = off`, el `EXPLAIN` del filtro de `best_chunk` menciona `chunks_content_fts_es_unaccent_idx`;
  - los tests de `lifecycle.repository.e2e-spec.ts` siguen pasando con `seedProcessedVersion` ampliada.
- **Depende de:** T01, T05
- **Commit:** `feat(api): buscar documentos por título, descripción y contenido`
- **Estado:** hecha. `ts_headline` acepta los marcadores sin comillas (escritos con `chr(57344)` y `chr(57345)`). El test del índice corre el `EXPLAIN` con el alcance del ADMIN y con `enable_seqscan` y `enable_nestloop` apagados: con pocos datos, el planificador prefiere ir a los fragmentos por versión o por `area_ids` (otros índices, que tampoco recorren la tabla). Así el test prueba que la expresión de la consulta es la del índice.

### T07 · Servicio: la búsqueda

- **Qué hace:** `DocumentQueryService.search(user, query)`:
  1. `viewerFor(user)` y `searchScope(viewer)`;
  2. `repository.search`;
  3. por cada resultado, `toDocumentSummary` + `fragment`: `buildFragment(markedText)` con su `pageNumber`, o `null` si no hubo coincidencia en el contenido;
  4. `{ data, total, page, limit }`.

  Todo dentro de `mapErrors` con la operación `'búsqueda'`.
- **Cubre:** R3, R8, R10, R12; D8; plan sección 3.1; D13 del plan 001.
- **Archivos:** `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`.
- **Verificación:** test primero, con los puertos simulados con `jest.fn()`:
  - pide primero el visor y después busca, con el alcance de la política;
  - si el directorio de usuarios falla → 503 y **nunca** llama a `repository.search`;
  - `RepositoryUnavailableError` → 503; un error inesperado → 500 con mensaje genérico;
  - **E2:** sin coincidencia en el contenido → `fragment: null`;
  - **E1:** con `markedText` y `pageNumber: 4` → `fragment.parts` sin marcadores y `pageNumber: 4`;
  - arma `{ data, total, page, limit }` con los valores de la consulta.
- **Depende de:** T02, T03, T04, T05
- **Commit:** `feat(api): armar los resultados de la búsqueda`
- **Estado:** hecha. Suma `toDocumentSearchResult` en `dto/document.response.ts`, campo por campo como `toDocumentSummary`, en vez de hacer spread de una instancia de clase (aviso `no-misused-spread` de oxlint).

### T08 · Endpoint: `GET /documents/search`

- **Qué hace:** suma a `DocumentsController` `GET /documents/search` con `SearchDocumentsQuery`, **declarado antes de `@Get(':id')`**, sin `@Roles` y con Swagger (`DocumentSearchBody` y `@ApiResponse` por cada código: 200, 400, 401, 503).
- **Cubre:** R1 a R12; D1, D5, D7, D16; plan sección 1; E1 a E12 a nivel API.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/search.e2e-spec.ts`.
- **Verificación:** test primero, `test/documents/search.e2e-spec.ts`, con Supertest y la base de tests (plan, sección 7.2):
  - **ruta:** `GET /api/documents/search?q=caja` → 200, no el 400 del `ParseUUIDPipe`;
  - **E1:** el EMPLOYEE de Ventas busca `cierre de caja` → el documento, con `fragment.pageNumber = 4`, `cierre` y `caja` con `match: true`, y ningún marcador en el JSON;
  - **E2:** "Manual de facturación" sin procesar → aparece con `fragment: null`; una coincidencia solo en la descripción, también `null`;
  - **E3** y **E4**, como en la tabla del plan;
  - **E5:** el EMPLOYEE de Ventas → `total: 0`, y el cuerpo no contiene ni el id ni la palabra; el de Operaciones y el ADMIN lo encuentran;
  - **E6:** versión nueva subida **con el endpoint real** (`POST …/versions`) y v2 procesada con "tarifa nueva" → el ADMIN no encuentra `tarifa vieja`;
  - **E7:** documento archivado **con el endpoint real** (`POST …/archive`) → el ADMIN no lo encuentra;
  - **E8:** cinco fragmentos con "stock" → `data.length = 1`, `total = 1`;
  - **E9:** `ca`, `"  ca  "`, 101 caracteres y sin `q` → 400; sin cabeceras → 401 (R1);
  - **E10:** `caja & | ! :` → 200 y lo encuentra; los demás textos especiales de T06 → nunca 500;
  - **E11:** `xyzxyz` → 200, `data: []`, `total: 0`;
  - **E12:** al unir las partes aparece literal `<script>alert(1)</script>`, sin `<b>` ni ninguna etiqueta que no estuviera en el texto;
  - **R10:** `limit=101` → 400;
  - los tests de `query.e2e-spec.ts` (listado y detalle) siguen pasando.
- **Depende de:** T06, T07
- **Commit:** `feat(api): exponer la búsqueda de documentos`
- **Estado:** hecha.

## Frontend

### T09 · Reglas de la búsqueda en la web

- **Qué hace:** crea `lib/documents/search-rules.ts` con `SEARCH_MIN = 3`, `SEARCH_MAX = 100` (con un comentario que apunta a `SearchDocumentsQuery`) y `parseSearchParam(value)`, que quita los espacios del principio y del final y devuelve `{ kind: 'none' }`, `{ kind: 'invalid', text }` o `{ kind: 'valid', text }`.
- **Cubre:** R4, F2; D11; plan sección 5.1.
- **Archivos:** `lib/documents/search-rules.ts`, `tests/lib/documents/search-rules.test.ts`.
- **Verificación:** test primero:
  - `null` y `""` → `none`;
  - `"  ca "` → `invalid` con `"ca"`;
  - `" caja "` → `valid` con `"caja"`;
  - 100 caracteres → `valid`; 101 → `invalid`.
- **Depende de:** —
- **Commit:** `feat(web): validar el texto de búsqueda`
- **Estado:** hecha. Un texto vacío o con solo espacios da `none` (no hay búsqueda); la caja de T13 igual muestra el aviso de F2 si se envía así.

### T10 · Llamada a la API y mensajes de error

- **Qué hace:**
  - `lib/api/documents.ts` suma `searchDocuments(q, page, signal)` → `GET /api/documents/search?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`, y los tipos `SearchFragment`, `DocumentSearchResult` y `DocumentSearchResponse`;
  - `describeApiError` suma el contexto `'search'`, con el mensaje del 400: "Revisá el texto de búsqueda: tiene que tener entre 3 y 100 caracteres.".
- **Cubre:** R4, R12; plan secciones 1.2 y 5.3.
- **Archivos:** `lib/api/documents.ts`, `lib/api/error-messages.ts`, `lib/api/index.ts`, `tests/lib/api/documents.test.ts`, `tests/lib/api/error-messages.test.ts`.
- **Verificación:** test primero:
  - `searchDocuments('cierre & caja', 2)` pide `/api/documents/search?q=cierre%20%26%20caja&page=2&limit=20`;
  - `describeApiError` en `'search'`: el 400 con su mensaje; 503, sin conexión y 500 con los de siempre; nunca el texto técnico;
  - los contextos anteriores no cambian.
- **Depende de:** T08 (contrato de la API)
- **Commit:** `feat(web): agregar la llamada de búsqueda a la API`

### T11 · Paginación que conserva la búsqueda

- **Qué hace:** `Pagination` suma la prop opcional `query`. Con ella, los enlaces son `/documentos?q=<codificado>&pagina=N` y la página 1 es `/documentos?q=<codificado>`. Sin ella, los enlaces no cambian.
- **Cubre:** F3; D11; plan sección 5.2.
- **Archivos:** `components/documents/Pagination.tsx`, `tests/components/documents/Pagination.test.tsx`.
- **Verificación:** test primero:
  - con `query="caja"`, "Siguiente" lleva a `/documentos?q=caja&pagina=2` y la página 1 a `/documentos?q=caja`;
  - un `query` con `&` y espacios se codifica;
  - los tests anteriores de `Pagination` pasan sin cambios.
- **Depende de:** —
- **Commit:** `feat(web): conservar la búsqueda al paginar`

### T12 · Fragmento resaltado

- **Qué hace:** crea `MatchFragment`: recorre `parts` y pone las que tienen `match` en `<mark>` (colores legibles en modo claro y oscuro), siempre como texto de React y sin `dangerouslySetInnerHTML`. Con `pageNumber`, muestra "Página N" debajo. El texto usa `break-words`.
- **Cubre:** R8, R11; F4, F7; D8; plan sección 4.3.
- **Archivos:** `components/documents/MatchFragment.tsx`, `tests/components/documents/MatchFragment.test.tsx`.
- **Verificación:** test primero:
  - **E1:** `cierre` y `caja` dentro de `<mark>`, el resto fuera; "Página 4";
  - sin `pageNumber` (`null`), no aparece "Página";
  - **E12:** con `<script>alert(1)</script> caja`, `container.querySelector('script')` es `null` y el texto se ve literal;
  - el código del componente no contiene `dangerouslySetInnerHTML` (el test lee el archivo).
- **Depende de:** T10 (tipos)
- **Commit:** `feat(web): mostrar el fragmento con las palabras resaltadas`

### T13 · Caja de búsqueda

- **Qué hace:** crea `SearchBox`:
  - `<form role="search">` con `<input type="search" aria-label="Buscar documentos" maxLength={100}>` y el botón "Buscar", que arranca con el `q` de la URL;
  - al enviar (Enter o el botón), si `parseSearchParam` da `invalid`, muestra "Escribí al menos 3 caracteres para buscar." con `role="alert"` y `aria-describedby`, y no navega; si da `valid`, `router.push('/documentos?q=' + encodeURIComponent(texto))`;
  - el aviso desaparece al seguir escribiendo; escribir no busca;
  - con una búsqueda activa, "Borrar búsqueda" → `router.push('/documentos')`;
  - una columna en el celular y una fila desde `sm:`, con controles de al menos 44 px.
- **Cubre:** F1, F2, F3, F6, F7; R4; D11; plan secciones 5.2 a 5.4.
- **Archivos:** `components/documents/SearchBox.tsx`, `tests/components/documents/SearchBox.test.tsx`.
- **Verificación:** test primero, con `vi.mock` de `next/navigation`:
  - **E9:** `ca` + Enter → el aviso con `role="alert"` y `router.push` **no** se llama;
  - `caja` + "Buscar" → `push('/documentos?q=caja')`; con Enter, lo mismo;
  - escribir sin enviar no llama a `push` (F1);
  - `cierre & caja` → `push('/documentos?q=cierre%20%26%20caja')`;
  - `"  caja  "` → se busca `caja`;
  - "Borrar búsqueda" solo aparece con `q` y lleva a `/documentos`;
  - arranca con el valor recibido.
- **Depende de:** T09
- **Commit:** `feat(web): agregar la caja de búsqueda`

### T14 · Resultados de la búsqueda

- **Qué hace:**
  - crea `SearchResultCard`: `DocumentCard` + `MatchFragment` (si hay `fragment`);
  - crea `SearchResults`: pide `searchDocuments` con `useApiResource` (clave `search?q=…&page=…&user=…`) y muestra los estados de la sección 5.3 del plan: "Buscando…", "N resultados para «texto»" (`aria-live="polite"`), la grilla de tarjetas con `Pagination` (con `query`), "No encontramos documentos para «texto»" con "Borrar búsqueda", "Esta página no existe" con un enlace a la primera página de la búsqueda, y el error con "Reintentar".
- **Cubre:** R8, R9, R10; F4, F5, F6; plan secciones 5.1 y 5.3; spec sección 7.
- **Archivos:** `components/documents/SearchResultCard.tsx`, `components/documents/SearchResults.tsx`, `tests/components/documents/SearchResults.test.tsx`.
- **Verificación:** test primero, con `vi.mock` de `@/lib/api`:
  - mientras espera, "Buscando…";
  - **E1:** la tarjeta con el fragmento resaltado y "Página 4";
  - **E2:** la tarjeta sin fragmento ni página;
  - muestra los resultados en el orden de la API, sin reordenar;
  - "1 resultado" y "3 resultados para «caja»";
  - **E11:** "No encontramos documentos para «xyzxyz»" y "Borrar búsqueda", que lleva a `/documentos`;
  - un texto con `<b>` en la búsqueda se ve literal en el mensaje de E11;
  - 503 → mensaje y "Reintentar", que vuelve a pedir;
  - con `page=2` pide `page=2`; con más de 20 resultados, la paginación conserva `q`.
- **Depende de:** T10, T11, T12
- **Commit:** `feat(web): mostrar los resultados de la búsqueda`

### T15 · Buscar desde el listado

- **Qué hace:** `DocumentList`:
  - muestra `SearchBox` arriba, para todos los roles (con `key={q}`, para que la caja siga a la URL al ir atrás o adelante), y el botón "Cargar documento" del ADMIN, como antes;
  - con `q` válido, muestra `SearchResults`; sin `q`, el listado de siempre;
  - con `q` inválido en la URL, muestra el aviso de F2 en la caja, no busca y muestra el listado normal.
- **Cubre:** F1, F2, F3, F6; D11; plan sección 5.2; E13.
- **Archivos:** `components/documents/DocumentList.tsx`, `tests/components/documents/DocumentList.search.test.tsx` (aparte de `DocumentList.test.tsx`, para no cambiar sus mocks; ese sigue pasando sin cambios).
- **Verificación:** test primero:
  - con `?q=caja` llama a `searchDocuments` y **no** a `listDocuments`;
  - **E13:** montado de nuevo con `?q=caja` (como al recargar), vuelve a pedir la misma búsqueda;
  - con `?q=ca`, no llama a `searchDocuments`, muestra el aviso y el listado;
  - sin `q`, todo igual que antes;
  - EMPLOYEE, SUPERVISOR y ADMIN ven la caja; solo el ADMIN, "Cargar documento";
  - al cambiar `q` en la URL, la caja muestra el valor nuevo.
- **Depende de:** T13, T14
- **Commit:** `feat(web): buscar desde el listado de documentos`

## Tests en el navegador (Playwright)

### T16 · API simulada para la búsqueda

- **Qué hace:** `mockApi` suma el handler `search` para `/api/documents/search`, atendido **antes** que el detalle `/api/documents/:id`, y `searchResponse(...)` para armar respuestas con `fragment`.
- **Cubre:** plan sección 7.4.
- **Archivos:** `e2e/support/mock-api.ts`, `e2e/smoke.spec.ts`.
- **Verificación:**
  - un caso nuevo en `e2e/smoke.spec.ts`: con `search` simulado, el EMPLOYEE busca `caja` y ve un resultado, sin pedidos sin atender (`unhandled` vacío);
  - `pnpm --filter web test:e2e` sigue pasando completo.
- **Depende de:** T15
- **Commit:** `test(web): simular la API de búsqueda`

### T17 · Escenarios de búsqueda en el navegador

- **Qué hace:** cubre en Playwright, con la API simulada, en escritorio y celular, los escenarios de la búsqueda.
- **Cubre:** E1, E2, E9, E10, E11, E12, E13; F1, F3, F5, F6, F7.
- **Archivos:** `e2e/busqueda.spec.ts`.
- **Verificación:** se escriben los tests y pasan en los dos proyectos. Si pasan de entrada, se rompe a propósito una regla por escenario, de a una, para comprobar que su test falla, y se restaura.
  - **E1:** busca `cierre de caja` → el fragmento con `cierre` y `caja` en `<mark>` y "Página 4";
  - **E2:** un resultado sin fragmento;
  - **E9:** `ca` + Enter → el aviso y **ningún** pedido a `/api/documents/search`;
  - **E10:** `caja & | ! :` → el pedido lleva el texto codificado y se ven los resultados;
  - **E11:** "No encontramos documentos para «xyzxyz»" → "Borrar búsqueda" → el listado completo en `/documentos`;
  - **E12:** el fragmento muestra `<script>alert(1)</script>` como texto y `page.on('dialog')` nunca se dispara;
  - **E13:** después de buscar, `page.reload()` muestra los mismos resultados; "atrás" vuelve al listado;
  - F3: abrir `/documentos?q=caja&pagina=2` pide `page=2`;
  - F7: en el celular, `document.documentElement.scrollWidth <= window.innerWidth` con un fragmento de palabras largas.
- **Depende de:** T16
- **Commit:** `test(web): cubrir la búsqueda en el navegador`

### T18 · Búsqueda por título contra la API real

- **Qué hace:** prueba de Playwright contra la API real, levantada contra la base de tests como en T28 de la spec 003 (`DATABASE_URL=<TEST_DATABASE_URL> pnpm dev:api`): el ADMIN carga un documento con un título único (`[e2e] Manual de facturación <id de la corrida>`) y lo encuentra **por título** desde la caja.
- **Cubre:** E2 de punta a punta; R1, R3; D1 (la ruta antes de `:id`, a través del rewrite).
- **Archivos:** `e2e/integracion/busqueda.spec.ts`.
- **Verificación:** con Docker, la API levantada así y `pnpm --filter web test:e2e:integracion`:
  - el ADMIN busca `facturación <id de la corrida>` y ve el documento recién cargado, sin fragmento;
  - la EMPLOYEE de Operaciones hace la misma búsqueda sobre un documento de Ventas y ve "No encontramos documentos para «…»";
  - los tests de integración de las specs 002 y 003 siguen pasando.
- **Depende de:** T17
- **Commit:** `test(web): probar la búsqueda por título contra la API real`

## Tareas bloqueadas

### T19 · Búsqueda por contenido de punta a punta — BLOQUEADA

- **Bloqueada por:** el worker de Guille todavía no existe (Q1 del plan 003). Sin worker no hay fragmentos, y la web no tiene acceso a la base para insertarlos.
- **Qué hace:** prueba de Playwright contra la API real **con el worker real**: el ADMIN carga un PDF cuyo contenido incluye "cierre de caja diario" en la página 4, espera a que el procesamiento termine (`READY`) y lo busca desde la caja. Además, sube una versión nueva sin esa frase y comprueba que deja de encontrarse.
- **Cubre:** E1, E3 y E6 de punta a punta; R2, R5, R8.
- **Archivos:** `e2e/integracion/busqueda.spec.ts`, `e2e/support/files.ts` (un PDF con texto en una página conocida).
- **Verificación:** con Docker, la API, el worker y `pnpm --filter web test:e2e:integracion`:
  - **E1:** el fragmento muestra `cierre` y `caja` resaltados y "Página 4";
  - **E3:** `instruccion` encuentra un PDF que dice "Instrucción";
  - **E6:** después de la versión nueva, la frase vieja ya no se encuentra.
- **Depende de:** T18 y el worker de Guille
- **Commit:** `test(web): probar la búsqueda por contenido con el procesamiento real`

## Verificación final

### T20 · Verificación de la feature

- **Qué hace:** corre todo, confirma que cada escenario tiene sus tests (tabla de abajo, se marca cada fila), revisa los índices y la búsqueda en el celular, y anota el resultado. No depende de T19: se cierra con T01 a T18 y se vuelve a correr cuando se desbloquee.
- **Cubre:** spec sección 11 completa; plan sección 7.
- **Archivos:** `specs/004-busqueda-documentos/tasks.md` (se marca la tabla y se anota el resultado).
- **Verificación:**
  1. **Backend:** `pnpm --filter api lint`, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api test` y `pnpm --filter api test:e2e`: todo en verde.
  2. **Frontend:** `pnpm --filter web lint`, `pnpm --filter web build`, `pnpm --filter web test` y `pnpm --filter web test:e2e`: todo en verde.
  3. **Contra la API real:** con Docker y la API levantada como en T18, `pnpm --filter web test:e2e:integracion` en verde. Incluye los tests de las specs 002 y 003.
  4. **Índices (D3, D15):** `indexes.e2e-spec.ts` en verde: siguen `chunks_embedding_idx` y `chunks_content_fts_idx`, y existen `chunks_content_fts_es_unaccent_idx`, `es_unaccent` y `unaccent`.
  5. **Tabla:** cada fila tiene sus tests, buscados por nombre, y pasan.
  6. **Celular:** a 375 px de ancho, la caja, los resultados y el estado "sin resultados" no tienen desplazamiento horizontal.
- **Depende de:** T01 a T18
- **Commit:** `docs(api): verificar la búsqueda de documentos`

#### Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright | ✔ |
| --- | --- | --- | --- | --- | --- |
| E1 · Buscar por contenido | `search-fragment.spec.ts` (T04); `document-query.service.spec.ts` › E1 (T07) | `search.e2e-spec.ts` › E1 (T08) | `MatchFragment.test.tsx` › E1 (T12); `SearchResults.test.tsx` › E1 (T14) | `busqueda.spec.ts` › E1 (T17); real: T19 (bloqueada) | ☐ |
| E2 · Buscar por título | `document-query.service.spec.ts` › E2 (T07) | `search.e2e-spec.ts` › E2 (T08) | `SearchResults.test.tsx` › E2 (T14) | `busqueda.spec.ts` › E2 (T17); `integracion/busqueda.spec.ts` (T18) | ☐ |
| E3 · Tildes y mayúsculas | — | `indexes.e2e-spec.ts` › R5 (T01); `search.repository.e2e-spec.ts` › E3 (T06); `search.e2e-spec.ts` › E3 (T08) | — (lo resuelve la base) | real: T19 (bloqueada) | ☐ |
| E4 · Variantes de una palabra | — | `indexes.e2e-spec.ts` › R5 (T01); `search.repository.e2e-spec.ts` › E4 (T06); `search.e2e-spec.ts` › E4 (T08) | — (lo resuelve la base) | — | ☐ |
| E5 · Documento de otra área | `document-access.policy.spec.ts` › `searchScope` (T03) | `search.repository.e2e-spec.ts` › E5 y defensa (T06); `search.e2e-spec.ts` › E5 (T08) | — (lo resuelve la API) | `integracion/busqueda.spec.ts` (T18) | ☐ |
| E6 · Versión reemplazada | — | `search.repository.e2e-spec.ts` › defensa (T06); `search.e2e-spec.ts` › E6, con el endpoint real (T08) | — | real: T19 (bloqueada) | ☐ |
| E7 · Documento archivado | `document-access.policy.spec.ts` (T03) | `search.repository.e2e-spec.ts` › E7 y defensa (T06); `search.e2e-spec.ts` › E7, con el endpoint real (T08) | — | — | ☐ |
| E8 · Un resultado por documento | — | `search.repository.e2e-spec.ts` › E8 (T06); `search.e2e-spec.ts` › E8 (T08) | — | — | ☐ |
| E9 · Búsqueda demasiado corta | `search-documents.query.spec.ts` (T02) | `search.e2e-spec.ts` › E9 (T08) | `search-rules.test.ts` (T09); `SearchBox.test.tsx` › E9 (T13); `DocumentList.search.test.tsx` (T15) | `busqueda.spec.ts` › E9 (T17) | ☐ |
| E10 · Caracteres especiales | — | `search.repository.e2e-spec.ts` › E10 (T06); `search.e2e-spec.ts` › E10 (T08) | `SearchBox.test.tsx` (codificación, T13); `documents.test.ts` (T10) | `busqueda.spec.ts` › E10 (T17) | ☐ |
| E11 · Sin resultados | — | `search.e2e-spec.ts` › E11 (T08) | `SearchResults.test.tsx` › E11 (T14) | `busqueda.spec.ts` › E11 (T17) | ☐ |
| E12 · Fragmento con HTML | `search-fragment.spec.ts` › E12 (T04) | `search.repository.e2e-spec.ts` › E12 (T06); `search.e2e-spec.ts` › E12 (T08) | `MatchFragment.test.tsx` › E12 (T12) | `busqueda.spec.ts` › E12 (T17) | ☐ |
| E13 · La búsqueda queda en la dirección | — | — | `DocumentList.search.test.tsx` › E13 (T15); `Pagination.test.tsx` (T11) | `busqueda.spec.ts` › E13 (T17) | ☐ |

Reglas y decisiones sin escenario propio, para no perderlas de vista:

| Regla o decisión | Tests que la cubren |
| --- | --- |
| R1 · Sin sesión | `search.e2e-spec.ts` › 401 (T08) |
| R9 · Orden | `search.repository.e2e-spec.ts` › R9 (T06) |
| R10 · Paginado | `search-documents.query.spec.ts` (T02); `search.repository.e2e-spec.ts` › R10 (T06); `Pagination.test.tsx` (T11) |
| R12 · 503 | `document-query.service.spec.ts` (T07); `http-errors.spec.ts` (T05) |
| Sección 9 de la spec · uso del índice | `search.repository.e2e-spec.ts` › `EXPLAIN` (T06) |
| D3, D15 · Índices de `chunks` | `indexes.e2e-spec.ts` (T01) |
| D16 · Dónde tienen que estar las palabras | `search.repository.e2e-spec.ts` › D16 (T06) |
| Caso borde: solo palabras ignoradas | `search.repository.e2e-spec.ts` (T06) |

---

## Orden y dependencias

```
Backend
T01 (migración, la aplica el usuario)
T02 · T03 · T04 (sueltas)
T05 ◄─ T03
T06 ◄─ T01, T05
T07 ◄─ T02, T03, T04, T05
T08 ◄─ T06, T07

Frontend
T09 (suelta) · T11 (suelta)
T10 ◄─ T08 · T12 ◄─ T10 · T13 ◄─ T09
T14 ◄─ T10, T11, T12
T15 ◄─ T13, T14

Playwright
T16 ◄─ T15 · T17 ◄─ T16 · T18 ◄─ T17

BLOQUEADA: T19 ◄─ T18 y el worker de Guille
T20 ◄─ T01 a T18 (se vuelve a correr cuando se desbloquee T19)
```
