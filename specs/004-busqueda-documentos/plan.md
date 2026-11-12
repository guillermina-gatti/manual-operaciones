# Plan 004 · Búsqueda de documentos

- **Spec:** [spec.md](./spec.md) (HU36)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (API de documentos), [plan 002](../002-pantallas-documentos/plan.md) (pantallas) y [plan 003](../003-ciclo-de-vida-documentos/plan.md) (versiones, fragmentos activos e índices escritos a mano)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** revisado el 25/10/2026, listo para dividir en tareas. Las decisiones están en la sección 9.1, y la única pregunta abierta, que no bloquea, en la 9.2. A Guille se le avisa del índice nuevo (D15).

En este plan, R1 a R12 y F1 a F7 son reglas de esta spec; P0 a P6, sus decisiones (spec, sección 10); E1 a E13, sus escenarios (sección 11, en el orden en que aparecen); D1 a D16, las decisiones de este plan (sección 9.1); y Q3, la pregunta que sigue abierta (sección 9.2). Las reglas y decisiones de otros planes se citan con su número y el plan ("R10 de la spec 001", "D1 del plan 003").

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | Buscar por contenido | E8 | Un resultado por documento |
| E2 | Buscar por título | E9 | Búsqueda demasiado corta |
| E3 | Tildes y mayúsculas | E10 | Caracteres especiales |
| E4 | Variantes de una palabra | E11 | Sin resultados |
| E5 | Documento de otra área | E12 | Fragmento con HTML |
| E6 | Versión reemplazada | E13 | La búsqueda queda en la dirección |
| E7 | Documento archivado | | |

## 0. Punto de partida

**API (`apps/api/src/documents`)**

- `GET /api/documents` lista con `ListDocumentsQuery` (`page` desde 1, `limit` de 1 a 100, por defecto 20; D3 del plan 001) y responde `{ data: DocumentSummary[], total, page, limit }`, ordenado por `createdAt` y `id` descendentes.
- `DocumentQueryService` ya resuelve lo que la búsqueda necesita:
  - `viewerFor(user)`: el ADMIN sin áreas; el resto, con las áreas de `UsersDirectory` (D5 del plan 001). Si el directorio falla, el error se propaga y nunca se lista sin filtro;
  - `mapErrors` con `toHttpException` (D13 del plan 001): `RepositoryUnavailableError` → 503, cualquier otro error inesperado → 500.
- `document-access.policy.ts` tiene `canView` y `listWhere` (el `where` de Prisma del listado).
- `PrismaDocumentsRepository` ya usa `$queryRaw` con plantillas (`lockForUpdate`, `addVersion`) y traduce los fallos de conexión con `translate`.
- **Rutas del controlador:** `@Get(':id')` usa `ParseUUIDPipe`. Una ruta `GET /documents/search` declarada **después** de `:id` recibiría 400 ("search" no es un UUID): tiene que ir antes (sección 1).

**Base (`apps/api/prisma`)**

- `chunks` (migración `20261022220000_add_chunks`, de Guille): `content`, `page_number`, `area_ids uuid[]`, `is_active`, `document_id`, `document_version_id` y `chunk_index`.
- Índices escritos a mano en esa migración:
  - `chunks_embedding_idx`: HNSW sobre `embedding`;
  - `chunks_content_fts_idx`: GIN sobre `to_tsvector('spanish', content)`, con el comentario "respaldo sin IA (HU36)".
- **`chunks_content_fts_idx` no ignora tildes.** La configuración `spanish` pasa a minúsculas y reduce las palabras a su raíz (`procedimientos` → `proced`), pero `instrucción` e `instruccion` quedan como raíces distintas. Cumple la mitad de R5; la otra mitad es la sección 2.
- `schema.prisma` no describe esos índices. Toda migración nueva se crea con `--create-only` y se revisa para borrar cualquier `DROP INDEX` (D1 del plan 003). `test/documents/indexes.e2e-spec.ts` exige que los dos sigan existiendo.
- La extensión `unaccent` **no está instalada**. La imagen `pgvector/pgvector:pg16` de `docker-compose.yml` es la oficial de PostgreSQL con pgvector, así que trae `unaccent` entre sus extensiones de `contrib`: solo falta el `CREATE EXTENSION`.

**Procesamiento (Guille):** el worker sigue sin estar en el repo (Q1 del plan 003), así que nadie escribe fragmentos. Los tests los insertan con `seedProcessedVersion` (`test/documents/helpers.ts`), que hoy escribe siempre `"Fragmento N de prueba"` sin página: hay que ampliarla (sección 7.2).

**Web (`apps/web`)**

- `/documentos` es `app/documentos/page.tsx` (servidor) con `<Suspense>` y `DocumentList` (cliente). `DocumentList` lee `?pagina=` con `useSearchParams` y pide con `useApiResource`.
- `DocumentCard`, `Pagination` (enlaces a `/documentos?pagina=N`), `ScreenState` (cargando, vacío, error con "Reintentar") y `describeApiError(error, context)` ya existen.
- `e2e/support/mock-api.ts` intercepta `**/api/**` para la suite de Playwright con la API simulada.

## 1. Endpoint: `GET /api/documents/search`

Es un endpoint aparte, no un parámetro `q` en el listado (D1). Tiene otra forma de respuesta (el fragmento), otro orden (relevancia, no fecha) y `q` es obligatorio. El listado no cambia.

- **Prefijo y guards:** `/api`, `JwtAuthGuard` y `RolesGuard` del controlador, **sin** `@Roles` (R1: cualquier usuario con sesión).
- **Posición en el controlador:** se declara **antes** de `@Get(':id')` (sección 0). Un test de integración lo cubre: `GET /api/documents/search?q=caja` no puede responder 400 por el `ParseUUIDPipe`.
- **Swagger:** `@ApiResponse` por cada código, con las clases `DocumentSearchBody`, `DocumentSearchResult` y `SearchFragment`, como `DocumentListBody` (sección 9 de la spec).

### 1.1 Entrada: `SearchDocumentsQuery`

Extiende `ListDocumentsQuery`, así `page` y `limit` validan exactamente igual que en el listado (R10, D14):

| Campo | Regla | Regla de la spec |
| --- | --- | --- |
| `q` | Obligatorio. `@Transform` quita los espacios del principio y del final; después, `@IsString()` y `@Length(3, 100)`. `?q=a&q=b` llega como arreglo y falla en `@IsString` (400) | R4 |
| `page` | Entero desde 1; por defecto 1 | R10 |
| `limit` | Entero de 1 a 100; por defecto 20; `101` → 400 (D3 del plan 001) | R10 |

El servicio recibe `q` ya recortado. No se quita ningún otro carácter: `"`, `&`, `|`, `!` y `:` llegan tal cual a la consulta, que los trata como texto (sección 3.3).

### 1.2 Salida: 200

```json
{
  "data": [
    {
      "id": "…", "title": "Manual de caja", "description": null, "status": "ACTIVE",
      "areaIds": ["…"], "ownerId": "…", "reviewDate": "2027-03-01",
      "createdById": "…", "createdAt": "…", "archivedAt": null,
      "currentVersion": { "id": "…", "versionNumber": 2, "originalFileName": "caja.pdf",
        "mimeType": "application/pdf", "processingStatus": "READY" },
      "fragment": {
        "parts": [
          { "text": "… al terminar el turno se hace el ", "match": false },
          { "text": "cierre", "match": true },
          { "text": " de ", "match": false },
          { "text": "caja", "match": true },
          { "text": " diario con el supervisor …", "match": false }
        ],
        "pageNumber": 4
      }
    }
  ],
  "total": 1, "page": 1, "limit": 20
}
```

- **`DocumentSearchResult`** = `DocumentSummary` (la misma forma que el listado, con `archivedAt`) + `fragment: SearchFragment | null`. La web reutiliza `DocumentCard` sin adaptar nada (F4).
- **`SearchFragment`**:
  - `parts: { text: string; match: boolean }[]`: el fragmento recortado, en orden. Las palabras encontradas son las partes con `match: true` (R8). Las partes son texto plano: no hay HTML en ningún lado de la respuesta (R11, sección 4);
  - `pageNumber: number | null`: la página del fragmento, o `null` si el worker no la conoce (R8).
- **`fragment: null`** cuando la coincidencia es solo en el título o la descripción (R8, E2).
- **Orden:** el de relevancia de la sección 3.4 (R9). La web no reordena.
- **`data` y `total` salen de la misma foto de la base** (D9): `total` cuenta documentos, no fragmentos (R7).
- **Una página que no existe** (por ejemplo `page=9` con 3 páginas) responde 200 con `data: []` y el `total` real, igual que el listado.
- **Búsqueda con solo palabras que el español ignora** ("de la para"): 200 con `data: []` y `total: 0` (caso borde de la sección 8).

### 1.3 Errores

Orden de los controles: 401 (guard), 400 (DTO) y, después, la consulta. No hay 403 ni 404: un documento que el usuario no puede ver simplemente no aparece (R3).

| Código | Cuándo | Regla |
| --- | --- | --- |
| 401 | Sin sesión | R1 |
| 400 | Falta `q`; tiene menos de 3 o más de 100 caracteres después de quitar los espacios; viene repetido; `page` o `limit` inválidos | R4, R10 |
| 503 | La base o el directorio de usuarios no responden (`RepositoryUnavailableError`, D13 del plan 001) | R12 |
| 500 | Cualquier otro error inesperado, con mensaje genérico y la causa en el log. **Ningún texto de búsqueda puede provocarlo** (E10, sección 3.3) | — |

`toHttpException` suma la operación `'búsqueda'` para el mensaje y el log.

## 2. Tildes (R5): `unaccent`, configuración propia e índice nuevo

### 2.1 Por qué una configuración de texto y no `unaccent(content)`

Hay dos formas de ignorar las tildes. Se elige la segunda (D2):

1. **`to_tsvector('spanish', unaccent(content))`.** No sirve para un índice: `unaccent(text)` es `STABLE`, no `IMMUTABLE`, y PostgreSQL rechaza funciones que no sean `IMMUTABLE` en un índice sobre una expresión. Habría que envolverla en una función propia marcada `IMMUTABLE`. Además, el resaltado (sección 4) trabajaría sobre el texto ya sin tildes, y el usuario vería "Instruccion tecnica" en vez del texto original.
2. **Una configuración de búsqueda propia, `es_unaccent`:** una copia de `spanish` en la que, antes de reducir cada palabra a su raíz, se le quitan las tildes con el diccionario `unaccent`. `to_tsvector('es_unaccent'::regconfig, content)` es `IMMUTABLE` (la forma con la configuración explícita), así que se puede indexar. Además, `ts_headline` recorre el texto **original** y marca "Instrucción" cuando se buscó "instruccion".

Con `es_unaccent`, R5 completo:

| Búsqueda | Texto | Las dos quedan como |
| --- | --- | --- |
| `instruccion` | `Instrucción` | `instruccion` (sin tilde, en minúsculas y como raíz) |
| `procedimientos` | `procedimiento` | `proced` |
| `TECNICA` | `técnica` | `tecnic` |

**Efectos conocidos, aceptados (D13):**

- `ñ` pasa a `n`: "año" y "ano" se encuentran entre sí. Es raro en un manual de operaciones y la alternativa sería no cumplir R5.
- La lista de palabras ignoradas de `spanish` tiene algunas con tilde. Las que, sin tilde, no están en la lista (por ejemplo, "también" → "tambien") pasan a contar como palabras. Solo agrega coincidencias; no genera errores.

### 2.2 La migración `add_document_search`

```sql
-- R5: buscar sin distinguir tildes (spec 004, plan 2)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION es_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, spanish_stem;

-- Índice de texto completo sin tildes. Prisma no lo describe: ver el comentario de Chunk en schema.prisma
CREATE INDEX "chunks_content_fts_es_unaccent_idx" ON "chunks"
  USING gin (to_tsvector('es_unaccent'::regconfig, "content"));
```

- **Las palabras con tilde** son las del tipo `word` (y sus partes, `hword` y `hword_part`). Las de solo letras ASCII (`asciiword`) ya no tienen tilde y siguen con `spanish_stem`, igual que en `spanish`.
- **`unaccent` es una extensión "trusted" desde PostgreSQL 13:** la puede instalar un usuario con permiso `CREATE` sobre la base, sin ser superusuario. En producción hay que confirmarlo (Q3).
- **Sin `CONCURRENTLY`.** Hoy `chunks` está vacía (no hay worker), así que crear el índice es instantáneo y no bloquea a nadie.
- **Prisma ignora las extensiones y las configuraciones de búsqueda** (no usamos la función preliminar `postgresqlExtensions`), así que no intenta borrarlas. Lo que sí intentaría borrar es el **índice**, igual que los dos de Guille (2.3).

### 2.3 Cómo se crea sin borrar `chunks_embedding_idx`

Es el mismo problema de la sección 2.3 del plan 003. `schema.prisma` no cambia en esta feature, pero `prisma migrate dev` compara la base con el esquema y trata los índices escritos a mano como sobrantes. **Los comandos de Prisma los corre el usuario, no el agente**, como en T01 del plan 003. Pasos:

1. **Usuario:** `pnpm --filter api exec prisma migrate dev --create-only --name add_document_search`. Como el esquema no cambió, el `migration.sql` generado puede venir vacío o **solo con `DROP INDEX "chunks_embedding_idx"` y `DROP INDEX "chunks_content_fts_idx"`**.
2. **Usuario y agente, juntos:** revisan el `migration.sql`. **Se borra cualquier `DROP INDEX`** y se pega el SQL de 2.2. El archivo final tiene que tener solo eso.
3. **Usuario:** recién ahí, `pnpm --filter api exec prisma migrate deploy` para aplicarla y `pnpm --filter api exec prisma generate`. **No** se aplica con `prisma migrate dev`: volvería a comparar con el esquema y podría generar otra migración con los `DROP INDEX`.
4. **`indexes.e2e-spec.ts` suma lo nuevo** a lo que exige después de `prisma migrate reset`:
   - el índice `chunks_content_fts_es_unaccent_idx` en `pg_indexes`;
   - la configuración `es_unaccent` en `pg_ts_config`;
   - la extensión `unaccent` en `pg_extension`.

   Si una migración futura borra cualquiera de los tres índices de `chunks`, la PR falla.
5. **El comentario de `Chunk` en `schema.prisma`** suma el índice nuevo a la lista de los que no se pueden borrar (pasos 1 a 3 del comentario actual).

Son las decisiones D3 y D15. **Este plan no borra ni cambia ningún índice de Guille:** `chunks_content_fts_idx` sigue como está (2.4).

### 2.4 El índice de Guille (D15)

El índice de texto completo es suyo, y la spec pide acordarlo antes de migrar. Había tres opciones:

| Opción | Qué pasa | A favor | En contra |
| --- | --- | --- | --- |
| **A. Agregar uno nuevo y dejar el suyo** (la elegida) | `chunks_content_fts_es_unaccent_idx` junto a `chunks_content_fts_idx` | No toca nada de lo que ella usa; no hay ningún `DROP` | El worker mantiene dos índices GIN por cada fragmento que inserta. Hoy no importa (no hay worker y el volumen es chico) |
| B. Reemplazar el suyo en la misma migración | `DROP INDEX chunks_content_fts_idx` y el índice nuevo | Un solo índice | Si su asistente busca con `to_tsvector('spanish', content)`, deja de usar índice sin que ningún test lo note |
| C. Cambiar la definición conservando el nombre | Se borra y se crea `chunks_content_fts_idx` sobre `es_unaccent` | El test de índices no cambia | Mismo riesgo que B, y además oculta el cambio: el nombre ya no describe lo que hay |

**Decisión (D15):** A. La migración de esta feature agrega `chunks_content_fts_es_unaccent_idx` y no toca `chunks_content_fts_idx` ni `chunks_embedding_idx`.

- **Se le avisa a Guille.** Si prefiere B o C, se hace después, **en una migración aparte aprobada por ella**, que en la misma PR actualiza `indexes.e2e-spec.ts` y el comentario de `schema.prisma`.
- Su comentario dice que el índice era el "respaldo sin IA (HU36)", o sea, para esta feature. Si el asistente usa la búsqueda por palabras como respaldo, conviene que también pase a `es_unaccent`, así la búsqueda y el asistente encuentran lo mismo. Va en el mismo aviso.

## 3. La consulta SQL

### 3.1 Dónde vive

- **`DocumentsRepository.search(params)`** (puerto) y su implementación en `PrismaDocumentsRepository`, el único lugar que conoce SQL (D10 del plan 001).
  - `params = { text, scope, page, limit }`;
  - devuelve `{ data: { record: DocumentRecord; fragment: { markedText: string; pageNumber: number | null } | null }[]; total }`.
- **La regla de visibilidad sigue en la política.** `document-access.policy.ts` suma `searchScope(viewer)`, que devuelve:
  - `{ areaIds: null }` para el ADMIN: sin filtro de áreas;
  - `{ areaIds: [...] }` para el resto: un usuario sin áreas da `[]` y no encuentra nada.

  El repositorio solo traduce ese objeto a SQL; no decide quién ve qué. El estado `ACTIVE` se exige siempre, también al ADMIN (R3, E7).
- **`DocumentQueryService.search(user, query)`** une las piezas: `viewerFor`, `searchScope`, `repository.search`, `buildFragment` (sección 4.2) y `toDocumentSummary`, dentro del mismo `mapErrors` que las demás consultas.

### 3.2 Dos lecturas, una sola foto

Todo corre en **una transacción de solo lectura `REPEATABLE READ`** (`prisma.$transaction(fn, { isolationLevel: 'RepeatableRead' })`), así las dos lecturas ven la misma base (D9):

1. **El ranking** (3.4): una consulta `$queryRaw` que devuelve, para la página pedida, el `id` de cada documento, su fragmento marcado y la página, más el `total`.
2. **Los datos de las tarjetas:** `document.findMany({ where: { id: { in: ids } }, include: documentInclude })`, el mismo `include` y el mismo `toRecord` del listado. Se reordena en memoria según el orden de la consulta 1.

Si un documento se archivara entre las dos lecturas, la foto compartida evita que aparezca en una y no en la otra.

Antes de la consulta 1, si `numnode(plainto_tsquery('es_unaccent', :text)) = 0` (solo quedaron palabras ignoradas), se devuelve `{ data: [], total: 0 }` sin buscar. Así no se recorre el índice con una búsqueda vacía.

### 3.3 Cómo se arma la búsqueda sin operadores (E10)

Dos protecciones distintas:

- **Contra la inyección de SQL:** el texto va **siempre como parámetro**, con la plantilla `` $queryRaw`…${text}…` `` y fragmentos de `Prisma.sql` y `Prisma.empty`. Nunca se usa `$queryRawUnsafe` ni se arma SQL concatenando texto.
- **Contra los operadores de búsqueda: `plainto_tsquery`** (D4).
  - Toma el texto como texto: ignora toda la puntuación (`"`, `&`, `|`, `!`, `:`, `(`, `'`, `<->`, `*`), saca las palabras ignoradas y une las que quedan con "y", que es R6.
  - `"caja & | ! :"` queda como `'caj'`, y `"cierre de caja"`, como `'cierr' & 'caj'`.
  - **No** se usa `to_tsquery`, porque interpreta la sintaxis y un texto mal formado es un error de la base (500).
  - **Tampoco** `websearch_to_tsquery`, porque interpreta comillas (frase exacta), `-palabra` (excluir) y `or`: el texto del usuario cambiaría el significado de la búsqueda.

La búsqueda se escribe **en línea en cada lugar donde se usa**, no en un CTE aparte: `plainto_tsquery(regconfig, text)` con un parámetro se calcula una sola vez al planificar, como una constante, y así el planificador puede usar el índice GIN. La expresión del fragmento tiene que ser **exactamente** la del índice, `to_tsvector('es_unaccent'::regconfig, content)`; un test lo comprueba con `EXPLAIN` (7.2).

### 3.4 La consulta

`:tsq` es `plainto_tsquery('es_unaccent'::regconfig, ${text})`, repetido en línea. `:scope` es el filtro de áreas de 3.1; con el ADMIN se reemplaza por `Prisma.empty`.

```sql
WITH visible AS (
  -- R3: solo ACTIVE, para todos los roles; y, si no es ADMIN, que comparta un área
  SELECT d.id, d.created_at, dv.id AS version_id,
         to_tsvector('es_unaccent'::regconfig, d.title) AS title_vector,
         setweight(to_tsvector('es_unaccent'::regconfig, d.title), 'A') ||
         setweight(to_tsvector('es_unaccent'::regconfig, coalesce(d.description, '')), 'B')
           AS doc_vector
  FROM documents d
  JOIN document_versions dv ON dv.document_id = d.id AND dv.status = 'CURRENT'
  WHERE d.status = 'ACTIVE'
    -- :scope (solo si no es ADMIN)
    AND EXISTS (SELECT 1 FROM document_areas da
                WHERE da.document_id = d.id AND da.area_id = ANY(${areaIds}::uuid[]))
),
best_chunk AS (
  -- R2 y R7: el fragmento activo de la versión vigente que mejor coincide, uno por documento
  SELECT DISTINCT ON (c.document_id)
         c.document_id, c.id AS chunk_id, c.page_number,
         ts_rank(to_tsvector('es_unaccent'::regconfig, c.content), :tsq) AS chunk_rank
  FROM chunks c
  JOIN visible v ON v.id = c.document_id AND v.version_id = c.document_version_id
  WHERE c.is_active
    AND to_tsvector('es_unaccent'::regconfig, c.content) @@ :tsq   -- usa el índice
    -- :scope (solo si no es ADMIN): también las áreas copiadas en el fragmento
    AND c.area_ids && ${areaIds}::uuid[]
  ORDER BY c.document_id, chunk_rank DESC, c.chunk_index
),
hits AS (
  SELECT v.id, v.created_at, b.chunk_id, b.page_number,
         v.title_vector @@ :tsq AS in_title,
         (CASE WHEN v.doc_vector @@ :tsq THEN ts_rank(v.doc_vector, :tsq) ELSE 0 END)
           + coalesce(b.chunk_rank, 0) AS rank
  FROM visible v
  LEFT JOIN best_chunk b ON b.document_id = v.id
  WHERE v.doc_vector @@ :tsq OR b.chunk_id IS NOT NULL
)
SELECT t.total, p.id, p.page_number,
       -- R8 y R11: el fragmento completo con marcadores; el recorte lo hace buildFragment (4.2)
       ts_headline('es_unaccent'::regconfig,
                   translate(c.content, U&'\E000\E001', ''),
                   :tsq,
                   'HighlightAll=true, StartSel=' || U&'\E000' || ', StopSel=' || U&'\E001')
         AS marked_text
FROM (SELECT count(*) AS total FROM hits) t
LEFT JOIN LATERAL (
  SELECT * FROM hits
  ORDER BY in_title DESC, rank DESC, created_at DESC, id DESC   -- R9
  LIMIT ${limit} OFFSET ${(page - 1) * limit}
) p ON true
LEFT JOIN chunks c ON c.id = p.chunk_id
ORDER BY p.in_title DESC, p.rank DESC, p.created_at DESC, p.id DESC;
```

Qué resuelve cada parte:

| Parte | Regla | Cómo |
| --- | --- | --- |
| Título y descripción juntos | R2, R6 | `doc_vector` une los dos (título con peso `A`, descripción con `B`). Un documento coincide si **todas** las palabras están entre su título y su descripción, **o** todas en un mismo fragmento (D7, D16) |
| Solo fragmentos activos de la vigente | R2, E6, E7 | `c.is_active` **y**, además, que el fragmento sea de la versión `CURRENT` de un documento `ACTIVE` (el `JOIN` con `visible`). `is_active` alcanzaría si el worker cumple el plan 003 (3.4); la segunda condición es una defensa por si un fragmento quedó activo por error (D5) |
| Visibilidad | R3, E5 | `document_areas` decide (la misma regla que `listWhere`). Para quien no es ADMIN, además `c.area_ids && :areaIds`: si la copia de áreas del fragmento estuviera desactualizada, solo se pierde la coincidencia en el contenido; nunca se muestra texto de un documento ajeno (D5) |
| Un resultado por documento | R7, E8 | `DISTINCT ON (c.document_id)` deja el fragmento con más `ts_rank`; a igual rango, el primero del documento (`chunk_index`) |
| Orden | R9 | 1) `in_title`: todas las palabras están en el título; 2) `rank`: título (peso 1,0), descripción (0,4) y contenido (0,1, el peso por defecto de un vector sin `setweight`); 3) `created_at` descendente; 4) `id`, para que el orden no cambie entre páginas (D6) |
| Paginado y total | R10 | `count(*)` sobre todos los resultados y `LIMIT`/`OFFSET` en el `LATERAL`. La fila de `total` existe siempre, aunque la página esté vacía |
| Fragmento | R8 | `ts_headline` **solo** para los fragmentos de la página (como mucho `limit`), no para todos los resultados |
| Índice | Sección 9 de la spec | El filtro de `best_chunk` usa la expresión del índice de 2.2 |

**Los títulos y descripciones no tienen índice** (D10). `visible` calcula su vector en cada búsqueda. Con el volumen esperado (cientos de documentos) es despreciable al lado de los fragmentos. Si algún día molesta, se agrega un índice GIN sobre esa expresión en `documents`, con el cuidado de D1 del plan 003.

## 4. Las palabras marcadas, sin HTML (R8, R11)

### 4.1 Por qué no el `ts_headline` por defecto

`ts_headline` sin opciones tiene dos problemas para esta spec:

- **Marca con HTML:** devuelve `<b>cierre</b>`. La web tendría que insertarlo como HTML (`dangerouslySetInnerHTML`), y entonces un `<script>` del documento también se insertaría (contra R11).
- **Borra las etiquetas del documento:** el analizador reconoce `<script>` como una etiqueta y, al armar el fragmento recortado, la cambia por un espacio. E12 pide **ver** `<script>alert(1)</script>` como texto, y vería solo `alert(1)`.

### 4.2 Cómo se marca y se recorta

1. **En SQL** (sección 3.4): `ts_headline` con `HighlightAll=true` devuelve el fragmento **completo y sin cambios**, con cada palabra encontrada entre dos marcadores: `U+E000` al principio y `U+E001` al final. Son caracteres Unicode de uso privado; no aparecen en un texto normal. Para estar seguros, `translate` los quita del contenido **antes** de marcar, así un documento no puede inyectar marcas falsas. Con `HighlightAll=true` las etiquetas no se reemplazan: el texto vuelve tal cual.
2. **En Node**, `buildFragment(markedText, { maxWords: 30 })` (función pura en `src/documents/search-fragment.ts`):
   - separa el texto en partes `{ text, match }` según los marcadores;
   - elige la ventana de 30 palabras con **más palabras marcadas** (a igualdad, la primera), contando como palabra cada secuencia sin espacios, sin cortar nunca una palabra marcada;
   - recorta y agrega `…` al principio o al final si se cortó texto;
   - devuelve `parts` sin ningún marcador.
3. **La respuesta** lleva `parts` (sección 1.2): texto plano, con `match` indicando qué resaltar. No hay HTML ni marcadores en el JSON (D8).

Por qué recortar en Node y no con las opciones `MaxWords` y `MinWords` de `ts_headline`: esas opciones solo funcionan sin `HighlightAll`, y sin `HighlightAll` vuelve el problema de las etiquetas (4.1).

### 4.3 Cómo lo dibuja la web

`MatchFragment` (cliente) recorre `parts`:

```tsx
<p className="…">
  {parts.map((part, i) =>
    part.match ? <mark key={i} className="…">{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>,
  )}
</p>
```

- **Siempre texto de React:** React escapa todo lo que va como hijo. `<script>alert(1)</script>` se ve como esos caracteres y no crea ningún elemento.
- **Ningún `dangerouslySetInnerHTML`** en el componente. Un test de componente lo asegura (7.3).
- **`<mark>`** con colores de Tailwind que se lean en modo claro y oscuro.
- **"Página N"** debajo del fragmento, solo si `pageNumber` no es `null` (F4).

## 5. Pantallas

### 5.1 Piezas

```
apps/web/
├── components/documents/
│   ├── DocumentList.tsx           con ?q= válido, muestra SearchResults; si no, el listado de siempre
│   ├── SearchBox.tsx              nuevo: caja, "Buscar", "Borrar búsqueda" y el aviso de F2
│   ├── SearchResults.tsx          nuevo: pide la búsqueda y muestra sus cuatro estados
│   ├── SearchResultCard.tsx       nuevo: DocumentCard + MatchFragment + "Página N"
│   ├── MatchFragment.tsx          nuevo: el fragmento con <mark> (4.3)
│   └── Pagination.tsx             suma `query` para conservar ?q= en los enlaces
└── lib/
    ├── api/documents.ts           suma searchDocuments y sus tipos
    ├── api/error-messages.ts      suma el contexto 'search'
    └── documents/search-rules.ts  nuevo: SEARCH_MIN = 3, SEARCH_MAX = 100 y parseSearchParam
```

| Pieza | Responsabilidad |
| --- | --- |
| `SearchBox` | Un `<form role="search">` con `<input type="search" aria-label="Buscar documentos" maxLength={100}>` y el botón "Buscar". Busca solo al enviar, con Enter o el botón (F1), no a cada tecla. Arranca con el `q` de la URL |
| `parseSearchParam(value)` | Función pura: quita los espacios del principio y del final y devuelve `{ kind: 'none' }`, `{ kind: 'invalid', text }` o `{ kind: 'valid', text }` con los mismos límites que la API (`SEARCH_MIN`, `SEARCH_MAX`, con un comentario que apunta a `SearchDocumentsQuery`) |
| `DocumentList` | Lee `q` y `pagina` con `useSearchParams` (ya está dentro del `<Suspense>` de la página). Siempre muestra `SearchBox` arriba (F1, para todos los roles) y el botón "Cargar documento" del ADMIN. Debajo: `SearchResults` si `q` es válido; el listado actual si no |
| `SearchResults` | `useApiResource` con la clave `search?q=…&page=…&user=…`, para que cambiar de usuario de prueba vuelva a pedir. Muestra los estados de 5.3 y la paginación |
| `searchDocuments(q, page, signal)` | `GET /api/documents/search?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}` |

### 5.2 La búsqueda en la dirección (F3, F6, E13)

**La URL es la única fuente de verdad** (D11). Ningún estado de React guarda los resultados.

- **Buscar:** `router.push('/documentos?q=' + encodeURIComponent(texto))`, sin `pagina`, así toda búsqueda nueva empieza en la página 1. Al ser `push`, el botón "atrás" vuelve a la búsqueda anterior o al listado.
- **Paginar:** `/documentos?q=caja&pagina=2`. `Pagination` recibe `query` y lo agrega a cada enlace; sin `query`, los enlaces del listado no cambian.
- **Recargar o compartir el enlace:** `DocumentList` lee `q` de la URL y vuelve a pedir la misma búsqueda (E13).
- **Borrar la búsqueda (F6):** "Borrar búsqueda" junto a la caja (visible solo con una búsqueda activa) y en el estado "sin resultados" (F5). Las dos hacen `router.push('/documentos')`: vuelve el listado completo en la página 1.
- **`q` inválido en la URL** (por ejemplo `?q=ca`, escrito a mano): no se busca (F2). La caja muestra `ca` con el aviso de F2, y debajo se ve el listado normal.
- **Sincronía de la caja:** al cambiar `q` en la URL (atrás o adelante), la caja muestra el valor nuevo. `SearchBox` se monta con `key={q}`.

### 5.3 Estados (sección 7 de la spec)

| Estado | Qué se ve |
| --- | --- |
| Validación (F2, E9) | Con menos de 3 caracteres, debajo de la caja: "Escribí al menos 3 caracteres para buscar.", con `role="alert"` y unido al campo con `aria-describedby`. **No** se navega ni se pide nada. El aviso desaparece al seguir escribiendo |
| Buscando | `ScreenState kind="loading"` con "Buscando…" y las tarjetas esqueleto del listado. La caja sigue usable |
| Con resultados (F4) | "N resultados para «texto»" (o "1 resultado"), en una región `aria-live="polite"` para que el lector de pantalla lo anuncie. Grilla de `SearchResultCard` (mismas columnas que el listado) y paginación si hay más de 20 |
| Sin resultados (F5, E11) | `ScreenState kind="empty"` con "No encontramos documentos para «texto»" y el botón "Borrar búsqueda". El texto va como texto de React, nunca como HTML |
| Error | `describeApiError(error, 'search')` con "Reintentar" cuando corresponde. El contexto `'search'` suma un solo mensaje propio: el 400, "Revisá el texto de búsqueda: tiene que tener entre 3 y 100 caracteres.", que solo aparecería si la validación de la web y la de la API no coincidieran. Los demás códigos usan los mensajes de siempre (503, sin conexión, 500) |
| Página que no existe | Como en el listado: "Esta página no existe", con un enlace a la primera página **de la búsqueda** |

### 5.4 Celular (F7)

- `SearchBox` es una columna en el celular (caja y botón a todo el ancho) y una fila desde `sm:`.
- Los controles miden al menos 44 px de alto, como en el resto (F10 del plan 002).
- El fragmento usa `break-words`, para que una palabra o una dirección larga no genere desplazamiento horizontal.
- Playwright lo comprueba en el proyecto `Pixel 7` (7.4).

## 6. Qué no cambia

- **`GET /api/documents` y su `DocumentList` sin `q`** siguen como están. Los tests de las specs 001 a 003 tienen que pasar sin cambios.
- **El worker** no necesita nada nuevo: el índice es sobre una expresión, así que PostgreSQL lo mantiene solo al insertar. Lo que sí sigue pendiente es la Q1 del plan 003 (`is_active` correcto); la búsqueda se defiende igual (D5).
- **La búsqueda no resalta el título** (D12): F4 pide el fragmento. Si se quiere después, es el mismo `parts` aplicado al título.

## 7. Estrategia de pruebas

El mismo criterio que los planes anteriores:

- reglas en tests unitarios;
- base real en integración;
- pantallas en tests de componentes;
- navegador real en Playwright.

Cada escenario tiene al menos un test de API y uno de pantalla.

### 7.1 Tests unitarios (API, Jest)

| Qué se prueba | Casos |
| --- | --- |
| `SearchDocumentsQuery` | **E9**: `"ca"` y `"  ca  "` → error; `"caj"` pasa; 100 caracteres pasa y 101 no; sin `q`; `q` repetido (arreglo); el valor llega recortado; `page` y `limit` igual que `ListDocumentsQuery` (`limit=101` → error) |
| `searchScope` | ADMIN → `{ areaIds: null }`; EMPLOYEE y SUPERVISOR → sus áreas; usuario desconocido → `[]` |
| `buildFragment` | Marcadores → partes; ventana de 30 palabras con más marcas; `…` solo donde se cortó; un fragmento corto queda entero; dos palabras marcadas seguidas; marca pegada a puntuación (`«caja»,`); **E12**: `<script>alert(1)</script>` queda literal en una parte; ningún `U+E000` ni `U+E001` en la salida |
| `DocumentQueryService.search` | Pide primero el visor y después busca; con el directorio caído → 503 y **nunca** llama a `repository.search` (no se busca sin filtro); `RepositoryUnavailableError` → 503; error inesperado → 500 genérico; sin fragmento → `fragment: null`; arma `{ data, total, page, limit }` |
| `toHttpException` | La operación `'búsqueda'` en el mensaje y el log |

### 7.2 Tests de integración (API, Supertest + PostgreSQL real)

En `test/documents/search.e2e-spec.ts`, con la base de tests (reseteada antes de la suite, así se aplica la migración de 2.2).

**`seedProcessedVersion` se amplía** con dos opciones: `contents?: string[]` (el texto de cada fragmento) y `pageNumbers?: (number | null)[]`. Sin ellas sigue escribiendo `"Fragmento N de prueba"`, así los tests del plan 003 no cambian. Es la única forma de tener contenido mientras no exista el worker (plan 003, 3.4).

| Escenario | Preparación | Qué comprueba |
| --- | --- | --- |
| **E1** contenido | Documento de Ventas; `seedProcessedVersion` con `"…se hace el cierre de caja diario…"` en la página 4 | EMPLOYEE de Ventas busca `cierre de caja` → 200; está el documento; `fragment.pageNumber = 4`; las partes con `match: true` son `cierre` y `caja`; no hay marcadores en el JSON |
| **E2** título | Documento "Manual de facturación" **sin** `seedProcessedVersion` (`PENDING`, sin fragmentos) | Busca `facturación` → está, con `fragment: null`. Además: una coincidencia en la descripción también da `fragment: null` |
| **E3** tildes | Fragmento `"Instrucción técnica"` | `instruccion tecnica` y `INSTRUCCIÓN` lo encuentran; las partes marcadas **conservan** la tilde (`Instrucción`) |
| **E4** variantes | Fragmento `"procedimiento de devolución"` | `procedimientos` lo encuentra |
| **E5** otra área | Documento de Operaciones con `"inventario"` en un fragmento y en el título de otro | EMPLOYEE de Ventas → `total: 0`, y el cuerpo de la respuesta no contiene ni el id ni la palabra; EMPLOYEE de Operaciones y ADMIN lo encuentran |
| **E6** versión reemplazada | v1 con `"tarifa vieja"` procesada; versión nueva subida **con el endpoint real** (`POST …/versions`, que desactiva los fragmentos de v1) y v2 procesada con `"tarifa nueva"` | ADMIN busca `tarifa vieja` → no está. **Defensa (D5):** un fragmento de una versión `REPLACED` insertado a mano con `is_active = true` tampoco aparece |
| **E7** archivado | Documento con `"procedimiento antiguo"`, archivado **con el endpoint real** (`POST …/archive`) | ADMIN → no está, ni por contenido ni por título. **Defensa:** un documento archivado con fragmentos `is_active = true` puestos a mano tampoco aparece |
| **E8** un resultado | Cinco fragmentos con `"stock"` | `data.length = 1` y `total = 1`; el fragmento elegido es el de más rango y, a igualdad, el de menor `chunk_index` |
| **E9** corta | — | `ca`, `"  ca  "`, 101 caracteres, sin `q` → 400. Sin cabeceras → 401 (R1) |
| **E10** especiales | Documento con `"caja"` | `caja & \| ! :` → 200 y lo encuentra. También `"caja"` con comillas, `caja:*`, `!!caja`, `(caja`, `caja <-> cierre`, `\` y `'; DROP TABLE documents; --` → nunca 500, y `documents` sigue existiendo |
| **E11** sin resultados | — | `xyzxyz` → 200, `data: []`, `total: 0` |
| **E12** HTML | Fragmento `"<script>alert(1)</script> caja"` | Al unir las partes aparece literal `<script>alert(1)</script>`; no hay `<b>` ni ninguna etiqueta que no estuviera en el texto |
| R6 varias palabras | Un fragmento con `"cierre"` y otro con `"caja"` (del mismo documento) | `cierre caja` no lo encuentra por contenido (D7, D16). Con las dos palabras en el título, sí |
| R9 orden | A: título "Cierre de caja", creado antes; B: solo contenido con `"cierre de caja"`, más nuevo; C y D: el mismo contenido, creados en distinto momento | A primero (título); entre C y D, el más nuevo primero |
| R10 paginado | 25 documentos que coinciden | `page=2` → 5 resultados, `total = 25`; `page=9` → `data: []`, `total = 25`; `limit=101` → 400 |
| Palabras ignoradas | — | `de la para` → 200, `data: []` (caso borde de la sección 8) |
| Ruta | — | `GET /api/documents/search?q=caja` → 200, no el 400 del `ParseUUIDPipe` de `:id` |
| Índice (sección 9 de la spec) | Fragmentos cargados; `SET LOCAL enable_seqscan = off` dentro de una transacción | `EXPLAIN` de la consulta de `best_chunk` menciona `chunks_content_fts_es_unaccent_idx` |

**`indexes.e2e-spec.ts`** suma `chunks_content_fts_es_unaccent_idx`, la configuración `es_unaccent` y la extensión `unaccent` (2.3).

El 503 (R12) se prueba en los tests unitarios con el repositorio simulado, como en las demás consultas (D13 del plan 001).

### 7.3 Tests de componentes (web, Vitest)

| Qué se prueba | Escenarios y casos |
| --- | --- |
| `parseSearchParam` | `null` → `none`; `"  ca "` → `invalid`; `"caja"` → `valid` recortado; 101 caracteres → `invalid` |
| `SearchBox` | **E9**: `ca` + Enter → aviso con `role="alert"` y `router.push` **no** se llama; `caja` + botón → `push('/documentos?q=caja')`; Enter también busca; escribir no busca (F1); el texto se codifica (`cierre & caja` → `q=cierre%20%26%20caja`); "Borrar búsqueda" → `push('/documentos')` |
| `DocumentList` con `?q=` | Con `q` válido llama a `searchDocuments` y no a `listDocuments`; con `q` inválido no llama a `searchDocuments` y muestra el aviso y el listado; sin `q`, todo igual que antes (los tests del plan 002 pasan sin cambios) |
| `SearchResults` | "Buscando…"; **E1**: tarjeta con el fragmento y "Página 4"; **E2**: sin fragmento ni página; **E11**: "No encontramos documentos para «xyzxyz»" y "Borrar búsqueda"; error 503 con "Reintentar", que vuelve a pedir; `?pagina=2` pide `page=2`; "N resultados para «texto»" |
| `MatchFragment` | Las partes con `match` van en `<mark>`; **E12**: con `<script>alert(1)</script> caja`, `container.querySelector('script')` es `null` y el texto se ve literal; un texto con `«` y `»` del usuario no rompe nada |
| `Pagination` | Con `query`, los enlaces son `/documentos?q=caja&pagina=2` y la página 1 es `/documentos?q=caja`; sin `query`, los de siempre |
| `describeApiError` | El contexto `'search'`: 400 con su mensaje; 503, 0 y 500 con los de siempre |

### 7.4 Playwright

- **Con la API simulada**, en `e2e/busqueda.spec.ts`, en escritorio y celular. `mock-api.ts` suma la respuesta de `/api/documents/search` y `searchResponse(...)` para armarla:
  - **E1**: busca `cierre de caja` → ve el fragmento con `<mark>` en las dos palabras y "Página 4";
  - **E2**: resultado sin fragmento;
  - **E9**: `ca` → aviso y **ninguna** petición a `/api/documents/search`;
  - **E10**: `caja & | ! :` → la petición lleva el texto codificado y la pantalla muestra resultados;
  - **E11**: sin resultados → "Borrar búsqueda" vuelve al listado;
  - **E12**: el fragmento muestra `<script>alert(1)</script>` como texto y `page.on('dialog')` nunca se dispara;
  - **E13**: después de buscar, `page.reload()` muestra los mismos resultados; "atrás" vuelve al listado;
  - F3: abrir `/documentos?q=caja&pagina=2` directamente pide `page=2`;
  - F7: en el celular, `document.documentElement.scrollWidth <= window.innerWidth` con un fragmento de palabras largas.
- **Contra la API real**, en `e2e/integracion/busqueda.spec.ts`: el ADMIN carga un documento con un título único (`[e2e] Manual de facturación <id de la corrida>`) y lo encuentra **por título** desde la caja (E2 de punta a punta: rewrite, codificación de `q` y ruta antes de `:id`). La búsqueda **por contenido** de punta a punta queda bloqueada por el worker, como T29 del plan 003: sin worker no hay fragmentos y la web no tiene acceso a la base para insertarlos.

### 7.5 Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright |
| --- | --- | --- | --- | --- |
| E1 · Contenido | `buildFragment` | ✔ fragmento, marcas y página | `SearchResults`, `MatchFragment` | simulada (real: bloqueada por el worker) |
| E2 · Título | `search` (`fragment: null`) | ✔ sin fragmento | `SearchResults` | simulada + real |
| E3 · Tildes | — | ✔ y las marcas conservan la tilde | — (lo resuelve la base) | — |
| E4 · Variantes | — | ✔ | — (lo resuelve la base) | — |
| E5 · Otra área | `searchScope` | ✔ ni el documento ni su texto | — (lo resuelve la API) | — |
| E6 · Versión reemplazada | — | ✔ con el endpoint real + defensa | — | — |
| E7 · Archivado | `searchScope` (ACTIVE para todos) | ✔ con el endpoint real + defensa | — | — |
| E8 · Un resultado | — | ✔ `total = 1` | — | — |
| E9 · Corta | DTO | ✔ 400 | `SearchBox`, `parseSearchParam` | simulada |
| E10 · Especiales | — | ✔ nunca 500 | `SearchBox` (codificación) | simulada |
| E11 · Sin resultados | — | ✔ | `SearchResults` | simulada |
| E12 · HTML | `buildFragment` | ✔ literal | `MatchFragment` | simulada |
| E13 · En la dirección | — | — | `DocumentList`, `Pagination` | simulada |

E3 a E8 no tienen test de pantalla propio porque la pantalla no decide nada en ellos: muestra lo que devuelve la API, y eso ya lo cubren E1, E2 y E11.

## 8. Dependencias nuevas

Ninguna:

- `unaccent` viene con PostgreSQL (`contrib`) y ya está en la imagen de `docker-compose.yml`;
- `plainto_tsquery`, `ts_rank` y `ts_headline` son de PostgreSQL;
- `<mark>` es del navegador;
- todo lo demás reutiliza lo que ya está.

## 9. Decisiones y preguntas abiertas

### 9.1 Decisiones

D1 a D14, propuestas al escribir el plan y aceptadas en su revisión, el 25/10/2026. D15 y D16 salen de las preguntas Q1 y Q2 de esa primera versión, cerradas en la misma revisión.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · ¿Endpoint nuevo o `?q=` en `GET /api/documents`? | Endpoint nuevo, `GET /api/documents/search`, declarado antes de `:id` (sección 1). Otra respuesta (con `fragment`), otro orden y `q` obligatorio; el listado y sus tests no cambian | R1, R4, R10 |
| D2 · ¿Cómo se ignoran las tildes? | Con una configuración de búsqueda propia, `es_unaccent` (`unaccent` + `spanish_stem`), y no con `unaccent(content)`: esa función no se puede indexar porque no es `IMMUTABLE`, y el fragmento se vería sin tildes (2.1) | R5 |
| D3 · ¿Cómo se cambia el índice de texto completo sin romper nada? | Se **agrega** `chunks_content_fts_es_unaccent_idx` y no se toca ningún índice de Guille. La migración se crea con `--create-only`, se borra cualquier `DROP INDEX` y el test de índices suma lo nuevo (2.3). Qué pasa con `chunks_content_fts_idx` lo decide Guille (D15). **Afecta a todo el equipo: avisar antes de mergear** | R5, sección 9 de la spec |
| D4 · ¿Cómo se convierte el texto en una búsqueda? | `plainto_tsquery`, con el texto como parámetro de `$queryRaw`. No `to_tsquery` (su sintaxis da 500) ni `websearch_to_tsquery` (interpreta comillas, `-` y `or`) (3.3) | R6, caso borde de la sección 8 |
| D5 · ¿Alcanza con `is_active` para saber qué fragmentos se buscan? | No se depende solo de eso: además se exige que el fragmento sea de la versión `CURRENT` de un documento `ACTIVE` y, para quien no es ADMIN, que sus `area_ids` compartan un área. Si algo falla, lo que se pierde es una coincidencia, nunca se muestra texto ajeno | R2, R3 |
| D6 · ¿Cómo se ordena? | Primero los que tienen todas las palabras en el título; después por `ts_rank` con pesos (título 1,0, descripción 0,4, contenido 0,1); después el más nuevo; y por último `id`, para que el orden sea estable entre páginas | R9 |
| D7 · ¿Dónde tienen que estar todas las palabras? | Todas entre el título y la descripción, o todas en un mismo fragmento. Una palabra en el título y otra en el contenido, o en dos fragmentos distintos, no alcanza (D16) | R6 |
| D8 · ¿Cómo viajan las palabras marcadas? | Como `parts: { text, match }[]`, armadas en Node a partir de marcadores Unicode de uso privado (`U+E000`, `U+E001`) que pone `ts_headline` con `HighlightAll=true`. El recorte de 30 palabras lo hace `buildFragment`. Ni HTML ni marcadores en la respuesta (sección 4) | R8, R11 |
| D9 · ¿Cómo se asegura que `data` y `total` coincidan? | Las dos lecturas (ranking y tarjetas) van en una transacción de solo lectura `REPEATABLE READ`, y el `total` sale de la misma consulta que la página (3.2) | R10 |
| D10 · ¿Hace falta un índice en `documents` para título y descripción? | No por ahora: con cientos de documentos es despreciable. Si hiciera falta, sería un índice escrito a mano, con el cuidado de D1 del plan 003 | Sección 9 de la spec |
| D11 · ¿Dónde vive el estado de la búsqueda en la web? | Solo en la URL (`?q=` y `?pagina=`). Buscar y borrar hacen `router.push`; un `q` inválido escrito a mano muestra el aviso y el listado normal (5.2) | F2, F3, F6 |
| D12 · ¿Se resalta también el título? | No: F4 pide el fragmento. Se puede agregar después con el mismo formato | F4 |
| D13 · `unaccent` hace que "año" encuentre "ano", y algunas palabras ignoradas con tilde dejan de ignorarse | Se acepta: es raro en estos documentos y solo agrega coincidencias. La alternativa sería no cumplir R5 | R5 |
| D14 · ¿`page` y `limit` validan igual que el listado? | Sí: `SearchDocumentsQuery` extiende `ListDocumentsQuery` (1 a 100, por defecto 20; `101` → 400) | R10 |
| D15 · El índice de texto completo es de Guille: ¿agregamos uno nuevo (A), reemplazamos el suyo (B) o cambiamos su definición conservando el nombre (C)? (era Q1) | A: se agrega `chunks_content_fts_es_unaccent_idx` sin tocar `chunks_content_fts_idx` ni `chunks_embedding_idx` (2.4). Se le avisa a Guille; si prefiere B o C, se hace después en una migración aparte aprobada por ella. **Afecta a todo el equipo: avisar antes de mergear** | R5 |
| D16 · R6 dice "aunque no estén juntas": ¿dónde tienen que estar todas las palabras? (era Q2) | Todas entre el título y la descripción, o todas en un mismo fragmento del contenido; R6 de la spec se actualizó con ese texto. Cruzar campos (una palabra en el título y otra en el contenido) obliga a buscar fragmentos con **cualquiera** de las palabras y combinar después, sin aprovechar tan bien el índice. Cruzar fragmentos deja sin un fragmento que muestre todas las palabras (R8). Es lo que implementa D7 | R6, R8 |

### 9.2 Pregunta abierta

Q3 conserva su número de la primera versión del plan, para que coincida con las referencias ya escritas. Q1 y Q2 pasaron a D15 y D16.

| # | Pregunta | Con quién | Propuesta |
| --- | --- | --- | --- |
| Q3 | ¿El usuario con el que corren las migraciones en producción puede hacer `CREATE EXTENSION unaccent`? **Para el deploy, no bloquea:** en desarrollo y en los tests la extensión ya está disponible | Equipo (quien administre la base de producción) | Debería: `unaccent` es "trusted" desde PostgreSQL 13 y alcanza con el permiso `CREATE` sobre la base. Se comprueba en la primera base de preview. Si no se puede, un administrador la instala una vez antes del deploy y el `IF NOT EXISTS` de la migración no hace nada |
