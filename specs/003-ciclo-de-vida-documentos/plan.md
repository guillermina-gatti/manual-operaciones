# Plan 003 · Ciclo de vida de los documentos

- **Spec:** [spec.md](./spec.md) (HU15, la parte de cambiar áreas, y HU16)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (API de documentos) y [plan 002](../002-pantallas-documentos/plan.md) (pantallas)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** listo para implementar. Las decisiones están en la sección 9.1 y la pregunta abierta con Guille, en la 9.2.

En este plan, R1 a R14 son reglas de esta spec; P1 a P7, sus decisiones (spec, sección 10); E1 a E13, sus escenarios (sección 11, en el orden en que aparecen); D1 a D10, las decisiones de este plan (sección 9.1); y Q1, la pregunta que sigue abierta con Guille (sección 9.2). Las reglas y decisiones de otros planes se citan con su número y el plan ("R5 de la spec 001", "D8 del plan 002").

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | Cambiar áreas | E8 | Rol sin permiso |
| E2 | Subir una versión nueva | E9 | Documento archivado |
| E3 | Versión idéntica a la vigente | E10 | Una sola versión vigente |
| E4 | Versión nueva con fecha de revisión | E11 | Archivar sin confirmar |
| E5 | Falla al subir la versión nueva | E12 | Un empleado no ve el historial |
| E6 | El responsable pierde el acceso al cambiar las áreas | E13 | Historial de versiones |
| E7 | Archivar | | |

## 0. Punto de partida

**API (`apps/api/src/documents`)**

- Endpoints de la spec 001: `POST /api/documents`, `GET /api/documents`, `GET /api/documents/:id` y `GET /api/documents/:id/download`, con guards simulados (`x-user-id`, `x-user-role`) en `src/common/auth`.
- `DocumentUploadService` hace la carga en el orden "todo o nada" del plan 001 (sección 4): inspecciona el archivo, valida fecha, áreas, responsable y duplicados, hace `FileStorage.put`, abre una transacción, inserta, audita, encola **dentro** de la transacción y, si algo falla, compensa con `FileStorage.delete` en un `finally`.
- Piezas reutilizables:
  - `inspectFile` (R2 y R3 de la spec 001);
  - `canBeOwner` y `canView` en `document-access.policy.ts`;
  - `toHttpException` (D13 del plan 001: dependencia caída → 503);
  - `DocumentsRepository`, un puerto con `runInTransaction` y transacción opaca (D10 del plan 001);
  - `PrismaDocumentsRepository`, que ya traduce `P1000`, `P1017`, los timeouts y el corte de conexión de `pg` a `RepositoryUnavailableError`.
- Simulaciones vigentes, en `DocumentsModule`:
  - `FakeProcessingQueue`, que se puede configurar para fallar;
  - `InMemoryAreasDirectory` e `InMemoryUsersDirectory`;
  - `LoggerAuditLog`, con una sola acción, `DOCUMENT_UPLOAD`;
  - `InMemoryFileStorage`, que también se puede configurar para fallar.

**Base (`apps/api/prisma`, Prisma 7.10)**

- `Document` con `status` (`ACTIVE`, `ARCHIVED`) y `archivedAt`.
- `DocumentVersion` con `status` (`CURRENT`, `REPLACED`), `@@unique([documentId, versionNumber])` y `@@index([checksum])`.
- `Chunk` (de Guille, migración `20261022220000_add_chunks`): `documentId` copiado para actualizar sin joins, `areaIds uuid[]` como copia de `document_areas`, `isActive` con `false` por defecto ("true solo si documento ACTIVE + versión CURRENT + READY"), y el comentario en el esquema: "la carga (Matías) actualiza areaIds e isActive".
- **Índices escritos a mano:** la migración de Guille crea `chunks_embedding_idx` (HNSW) y `chunks_content_fts_idx` (texto completo), que `schema.prisma` no puede describir (sección 2.3).
- **No existe todavía** el índice de una sola versión `CURRENT` (M4 del plan 001).

**Procesamiento (Guille):** el worker que crea los fragmentos y pone `isActive` **no está en el repo** (ni en `develop` ni en las ramas remotas); solo está la tabla `chunks`. Hoy nadie escribe fragmentos. Lo que este plan le pide al worker está en la sección 3.4.

**Web (`apps/web`)**

- `DocumentDetail` muestra los datos, `DownloadButton` y, solo al ADMIN, el estado del procesamiento y "Archivado".
- `UploadDocumentForm` arma la carga con piezas sueltas y reutilizables:
  - `FileField` (valida al elegir, conserva el archivo);
  - `AreasField`;
  - `OwnerField` (candidatos por área; borra con aviso al responsable que dejó de ser válido, también si se pasa por "sin áreas", fix de T25 del plan 002).

  La fecha de revisión, en cambio, está escrita dentro del formulario, sin componente propio.
- `describeApiError` traduce los errores por contexto (`list`, `detail`, `download`, `upload`).

## 1. Endpoints nuevos

Todos llevan el prefijo `/api`, usan los guards de la spec 001, responden errores con el formato de NestJS y se documentan en Swagger (sección 9 de la spec). Los `id` se validan con `ParseUUIDPipe`: un id mal formado es 400 y no revela nada (como en el plan 001, 3.3).

**Orden de los controles, igual en todos:**
1. 401 o 403 (guards, R1);
2. 400 de formato (pipes y DTO);
3. 404 si no existe (R2);
4. 409 si está archivado (R11);
5. 400 de reglas (R3, R4, R7b);
6. 409 de duplicados (R6b, R8b de la spec 001);
7. escritura.

Así, el estado del documento se informa antes que los detalles de lo que se mandó.

### 1.1 `PATCH /api/documents/:id/areas`: cambiar áreas (R3, R4, R5)

- **Rol:** ADMIN (R1).
- **Entrada:** JSON.
  - `areaIds`: UUID, al menos uno, sin repetidos (R3, las mismas reglas del `CreateDocumentDto`).
  - `ownerId`: UUID, **opcional**. El responsable nuevo, si el ADMIN elige otro en la misma operación (R4, P2).
- **Reglas, con el documento ya leído:**
  - todas las áreas existen (`AreasDirectory.findExistingIds`, R3);
  - el responsable que va a quedar (el nuevo si vino, si no el actual) existe y cumple `canBeOwner` con las áreas nuevas (R4 y R5 de la spec 001).
- **Escritura, en una transacción:**
  - se reemplazan las filas de `document_areas`;
  - se actualiza `ownerId` si vino;
  - se copian las áreas nuevas a **todos** los fragmentos del documento, de todas las versiones (R5);
  - se registra la auditoría (R13).
- **Respuesta 200:** el documento actualizado, con la misma forma que el detalle (`DocumentResponse`).
- **Errores:**

| Código | Cuándo | Regla |
| --- | --- | --- |
| 401 / 403 | Sin sesión / rol que no es ADMIN | R1 |
| 400 | `id` que no es UUID; `areaIds` vacío o mal formado; `ownerId` mal formado | R3 |
| 404 | El documento no existe | R2 |
| 409 | El documento está archivado | R11 |
| 400 | Un área no existe (`areaIds: no existen las áreas …`) | R3 |
| 400 | El responsable no existe, o no comparte ningún área y no es ADMIN (`ownerId: …`) | R4 |
| 503 | Falla la base | R9 por analogía, D13 del plan 001 |

Los mensajes de los 400 empiezan con el nombre del campo, como en la carga, para que la web los asigne a su campo (plan 002, 5.1).

### 1.2 `POST /api/documents/:id/versions`: subir una versión nueva (R6 a R9)

- **Rol:** ADMIN (R1).
- **Entrada:** `multipart/form-data`.
  - `file`: el archivo (obligatorio). Mismas reglas que la carga: `FileInterceptor` con 10 MB y `defParamCharset: 'utf8'`, e `inspectFile` (R6).
  - `reviewDate`: `YYYY-MM-DD`, **opcional**. Si viene, desde mañana en hora de Argentina (R7b, D1 del plan 001). Si no, queda la que estaba.
- **Respuesta 201:** el documento actualizado (`DocumentResponse`), con `currentVersion` = la versión nueva (`versionNumber` n+1, `CURRENT`, `PENDING`) (R7).
- **Errores:**

| Código | Cuándo | Regla |
| --- | --- | --- |
| 401 / 403 | Sin sesión / rol que no es ADMIN | R1 |
| 413 | El archivo pesa más de 10 MB | R6 |
| 400 | Falta el archivo, está vacío, o `reviewDate` mal formada o no posterior a hoy | R6, R7b |
| 415 | Extensión no aceptada o contenido que no coincide | R6 |
| 404 | El documento no existe | R2 |
| 409 | El documento está archivado (`reason: "ARCHIVED"`) | R11 |
| 409 | El archivo es idéntico al de la versión vigente de **este** documento (`reason: "IDENTICAL_TO_CURRENT"`, "El archivo es igual a la versión vigente") | R6b |
| 409 | El archivo es idéntico a la versión vigente de **otro** documento activo (`reason: "DUPLICATE"`, con `existingDocumentId`) | R8b de la spec 001 |
| 409 | Otra versión nueva se confirmó al mismo tiempo y el índice de una sola `CURRENT` la rechazó (`reason: "CONCURRENT_VERSION"`): solo si falla el bloqueo de la sección 5 | R8 |
| 503 | Falla el almacenamiento, la base o la cola; no queda nada a medias | R9 |

El campo `reason` en los 409 permite que la web muestre un mensaje distinto para cada caso (D7). El 409 de la carga de la spec 001 no lo tiene: se agrega también ahí (`reason: "DUPLICATE"`), sin quitar `existingDocumentId`.

### 1.3 `POST /api/documents/:id/archive`: archivar (R10, R11)

- **Rol:** ADMIN (R1).
- **Entrada:** sin cuerpo. Es una acción, no la edición de un campo: no hay otro valor posible para `status` (D5).
- **Escritura, en una transacción:**
  - `status = ARCHIVED` y `archivedAt = ahora`;
  - todos los fragmentos del documento con `isActive = false`;
  - la auditoría (R13).
- **Respuesta 200:** el documento actualizado (`DocumentResponse`, `status: "ARCHIVED"`). El ADMIN lo sigue viendo; los demás roles reciben 404 desde ese momento (R10 de la spec 001).
- **Errores:**

| Código | Cuándo | Regla |
| --- | --- | --- |
| 401 / 403 | Sin sesión / rol que no es ADMIN | R1 |
| 400 | `id` que no es UUID | — |
| 404 | El documento no existe | R2 |
| 409 | El documento ya está archivado (`reason: "ARCHIVED"`) | R11 |
| 503 | Falla la base | R9 |

### 1.4 `GET /api/documents/:id/versions`: historial (R12)

- **Rol:** ADMIN. Para otro rol, 403, aunque el documento no exista: el guard corre antes, así un EMPLOYEE no puede averiguar qué ids existen.
- **Respuesta 200:** `{ data: VersionHistoryItem[] }`, de la más nueva a la más vieja (`versionNumber` descendente). Cada item:

  ```json
  { "id": "…", "versionNumber": 3, "status": "CURRENT",
    "originalFileName": "manual.pdf", "mimeType": "application/pdf", "sizeBytes": 2097152,
    "processingStatus": "PENDING", "uploadedById": "…", "createdAt": "…" }
  ```

  No se devuelven `storageKey` ni `checksum`, como en la spec 001. Funciona también con documentos archivados.
- **Errores:** 401, 403 (R12), 400 (id), 404 (R2) y 503.

### 1.5 `GET /api/documents/:id/versions/:versionId/download`: descargar una versión (R12)

- **Rol:** ADMIN. Para otro rol, 403 (R12). Los demás siguen descargando la vigente con el endpoint de la spec 001, `GET /api/documents/:id/download`, que no cambia.
- **Respuesta 200:** `{ url, expiresAt }`, igual que la descarga de la spec 001 (enlace firmado de 5 minutos, R12 de la spec 001).
- **Errores:** 401, 403, 400 (ids), 404 si el documento no existe o la versión no es de ese documento (R2), y 503.

### 1.6 Cambios en lo que ya existe

- **`DocumentResponse` y `DocumentSummary`** (detalle, carga y listado): se agrega `archivedAt: string | null`, la fecha y hora en ISO 8601 en que se archivó, o `null` si está activo, para mostrar desde cuándo está archivado. El resto no cambia. Queda documentado en el plan 001, sección 3.1.
- **El 409 de la carga** suma `reason: "DUPLICATE"` (sección 1.2).
- **`AuditAction`** suma `DOCUMENT_AREAS_CHANGE`, `DOCUMENT_VERSION_UPLOAD` y `DOCUMENT_ARCHIVE` (R13). Los fallos se auditan como en la carga: `FAILURE` con el código HTTP, fuera de la transacción, como mejor esfuerzo (plan 001, sección 4).
- **`toHttpException`** suma las operaciones `'cambio de áreas'`, `'versión nueva'` y `'archivo'` para el mensaje y el log.

## 2. Modelo de datos y migración

### 2.1 Qué cambia en `schema.prisma`

No hacen falta columnas nuevas: `Document.status`, `Document.archivedAt`, `DocumentVersion.status`, `Chunk.areaIds` y `Chunk.isActive` ya existen. Cambia:

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  moduleFormat    = "cjs"
  previewFeatures = ["partialIndexes"] // índice de una sola CURRENT (R8, M4 del plan 001)
}

model DocumentVersion {
  // …sin cambios…
  @@unique([documentId, versionNumber])
  // R8: como máximo una versión CURRENT por documento. Declarado acá (no a mano en el SQL)
  // para que Prisma no lo borre en la próxima migración.
  @@unique([documentId], map: "document_versions_one_current_idx", where: { status: "CURRENT" })
  // …
}
```

**Probado sin tocar el repo ni la base.** Sobre una copia de `schema.prisma` en un directorio temporal:
- `prisma validate` lo da por válido;
- `prisma migrate diff --from-empty --to-schema <copia> --script`, que no se conecta a ninguna base, genera exactamente el índice de M4:

```sql
CREATE UNIQUE INDEX "document_versions_one_current_idx" ON "document_versions"("document_id") WHERE ("status" = 'CURRENT');
```

`partialIndexes` es una función **preliminar** (preview) de Prisma 7.10. Se acepta en D2.

### 2.2 La migración `add_document_lifecycle`

- Se crea con `prisma migrate dev --create-only --name add_document_lifecycle` y **se revisa el SQL antes de aplicarla**, por lo de 2.3.
- Debe contener solo el `CREATE UNIQUE INDEX` de arriba.
- Si alguna base ya tuviera dos `CURRENT` en un mismo documento, el índice no se puede crear y la migración falla en vez de dejar datos inconsistentes. Hoy no puede pasar, porque toda carga crea una sola versión.
- **Antes de aplicarla en una base con datos**, se corre una consulta que lo confirma:

  ```sql
  SELECT document_id FROM document_versions WHERE status = 'CURRENT' GROUP BY document_id HAVING count(*) > 1;
  ```

  Tiene que dar 0 filas.

### 2.3 El problema de los índices escritos a mano

- **El problema:** `prisma migrate dev` compara la base con `schema.prisma` y genera lo necesario para que coincidan. Un índice que existe en la base y no en el esquema lo trata como sobrante, y **la migración nueva incluye un `DROP INDEX`**. Hoy hay dos así, de la migración de Guille:
  - `chunks_embedding_idx` (HNSW sobre `embedding`): Prisma no tiene el tipo `Hnsw` y `embedding` es `Unsupported`;
  - `chunks_content_fts_idx` (GIN sobre `to_tsvector('spanish', content)`): Prisma no describe índices sobre expresiones.

  Si se borraran, el asistente perdería la búsqueda semántica (HU17) y la de texto completo (HU36) sin que ningún test de esta feature lo note.
- **Lo que hace este plan:**
  1. **El índice nuevo (M4) no se escribe a mano:** se declara en el esquema (2.1). Así no se suma un tercer índice a este problema.
  2. **Toda migración nueva se crea con `--create-only`** y se revisa. Si aparece `DROP INDEX "chunks_embedding_idx"` o `DROP INDEX "chunks_content_fts_idx"`, se borra esa línea antes de aplicarla.
  3. **Un test de integración lo vigila:** después de `prisma migrate reset` (el `global-setup` de los tests), consulta `pg_indexes` y exige que existan los tres índices: los dos de Guille y el de M4. Si una migración los borra, el test falla en la PR.
  4. En `schema.prisma` se deja un comentario sobre `Chunk` que explica el paso 2, para quien cree la próxima migración.
- Es la decisión D1.

## 3. Fragmentos (chunks) en la misma transacción

### 3.1 Qué significa cada columna

| Columna | Valor correcto en todo momento |
| --- | --- |
| `chunks.area_ids` | las áreas actuales del documento (`document_areas`) |
| `chunks.is_active` | `true` solo si el documento está `ACTIVE`, la versión es `CURRENT` y está `READY` |

Esta feature es dueña de los cambios que pueden volver falsa alguna de esas dos cosas. Por eso los hace **en la misma transacción** que el cambio del documento: nunca hay un momento confirmado en que el documento diga una cosa y sus fragmentos otra.

### 3.2 Qué hace cada operación sobre `chunks`

| Operación | Sentencia sobre `chunks` (dentro de la transacción) | Regla |
| --- | --- | --- |
| Cambiar áreas | `UPDATE chunks SET area_ids = :nuevas WHERE document_id = :id`: **todas** las versiones, también las reemplazadas | R5 |
| Versión nueva | `UPDATE chunks SET is_active = false WHERE document_version_id = :anterior` | R7 |
| Archivar | `UPDATE chunks SET is_active = false WHERE document_id = :id` | R10 |

- Con Prisma son `tx.chunk.updateMany(...)`, que funciona aunque `Chunk` tenga una columna `Unsupported`. Viven en `PrismaDocumentsRepository`, el único lugar que conoce Prisma (D10 del plan 001).
- La versión nueva **no** activa nada: nace `PENDING` y sin fragmentos. Los activa el worker al terminar (3.4).
- Si la transacción se deshace (R9), estas sentencias también se deshacen. Por eso, en E5, la versión 1 queda `CURRENT` **con sus fragmentos activos**.

### 3.3 El bloqueo del documento

Las tres operaciones empiezan la transacción con:

```sql
SELECT id, status FROM documents WHERE id = :id FOR UPDATE
```

- **Serializa las operaciones sobre un mismo documento.** Dos versiones nuevas, o una versión nueva y un archivo, no se pisan (sección 5).
- **El estado se vuelve a leer bajo el bloqueo.** Si otro ADMIN lo archivó un instante antes, la operación responde 409 (R11) en vez de escribir sobre un documento archivado.
- **Coordina con el worker:** es la fila que el worker también bloquea (3.4).

El bloqueo dura lo que la transacción, con el timeout corto del plan 001, de 5 segundos. Si no se consigue a tiempo, la transacción vence y la respuesta es 503 (D3).

### 3.4 Qué tiene que garantizar el worker de Guille (casos borde de la sección 8)

El problema es el orden. El worker lee el documento, tarda (extrae texto, calcula embeddings) y recién después inserta los fragmentos. Si mientras tanto el ADMIN cambió las áreas, reemplazó la versión o archivó el documento, los fragmentos nuevos saldrían con datos viejos, y la `UPDATE` de esta feature ya pasó y no los alcanza.

**Propuesta para el worker**, que amplía la de la spec (sección 10). Al terminar de procesar una versión, en **una** transacción:

1. **`SELECT … FROM documents WHERE id = :documentId FOR SHARE`:** el mismo documento que bloquean las operaciones de 3.3. Con esto, o el worker confirma antes y la operación del ADMIN ve y actualiza sus fragmentos, o confirma después y lee el estado ya cambiado. Nunca en el medio.
2. **Volver a leer, bajo ese bloqueo:** el estado del documento, sus áreas en `document_areas` y el estado de la versión. **No** usar lo que traía el trabajo de la cola ni lo que leyó al empezar.
3. **Insertar los fragmentos** con `area_ids` = las áreas leídas en el paso 2 (cubre "se cambian las áreas mientras una versión se está procesando") y con `is_active` = (documento `ACTIVE` y versión `CURRENT`). Esto cubre dos casos borde: "la anterior pasa a REPLACED mientras se procesa" y "se archiva mientras se procesa".
4. **Poner la versión en `READY`**, o `FAILED`, en la misma transacción.
5. **Si la versión ya no existe**, descartar el trabajo sin error: es el caso de A3 del plan 001, con `jobId = documentVersionId`.

Con esto, los tres casos borde de "coordinar con Guille" quedan cubiertos sin que esta feature tenga que volver a tocar los fragmentos después. Es la pregunta Q1. Mientras el worker no exista, los tests de integración insertan fragmentos a mano para simular una versión procesada (sección 7.2).

## 4. Versión nueva: orden de los pasos (R9, todo o nada)

Se reutiliza el orden de la carga (plan 001, sección 4). Cambian dos cosas: se parte de un documento que ya existe, y dentro de la transacción se reemplaza la versión vigente en vez de crear el documento.

| # | Paso | Si falla |
| --- | --- | --- |
| 1 | `JwtAuthGuard` + `RolesGuard('ADMIN')` | 401 o 403. No hay nada que deshacer |
| 2 | Multer lee el archivo a memoria, con el límite de 10 MB | 413 |
| 3a | `ValidationPipe` sobre `CreateVersionDto` (`reviewDate` opcional) | 400 |
| 3b | `inspectFile`: sin archivo o vacío da 400; tipo o contenido que no coincide da 415; se calcula el SHA-256 (R6) | 400 o 415 |
| 3c | Si vino `reviewDate`: posterior a hoy en la zona de la empresa (R7b) | 400 |
| 3d | `findByIdWithAreas(id)`: no existe → 404 (R2); `ARCHIVED` → 409 (R11) | 404 o 409 |
| 3e | `findActiveByChecksum(checksum)`: si es **este** documento → 409 `IDENTICAL_TO_CURRENT` (R6b); si es **otro** → 409 `DUPLICATE` (R8b de la spec 001) | 409 |
| 4 | `versionId = randomUUID()`, clave `documents/{documentId}/{versionId}.{ext}` (R9 de la spec 001), `FileStorage.put` | 503. No hay nada que deshacer |
| 5 | `runInTransaction` (timeout corto) | |
| 5a | `lockForUpdate(tx, id)` (3.3) y nueva lectura: si ya está `ARCHIVED` → 409 (R11); si la vigente ya tiene el mismo checksum → 409 (R6b) | 409: rollback y `delete` |
| 5b | La versión `CURRENT` pasa a `REPLACED` y sus fragmentos a `is_active = false` (R7, 3.2) | 503: rollback y `delete` |
| 5c | Se crea la versión `versionNumber = máximo + 1`, `CURRENT`, `PENDING`; si vino `reviewDate`, se actualiza el documento (R7, R7b) | 503: rollback y `delete`. Si choca con un índice único: 409 `CONCURRENT_VERSION` (sección 5) |
| 5d | `AuditLog.record({ action: 'DOCUMENT_VERSION_UPLOAD', … }, tx)` (R13) | 503: rollback y `delete` |
| 5e | `ProcessingQueue.enqueue(versionId)`, el **último paso dentro de la transacción** (R7, D12 del plan 001) | 503: rollback y `delete` |
| 6 | Commit | Si falla después de encolar: 503 y `delete`. El trabajo encolado apunta a una versión que no existe y el worker lo descarta (3.4, paso 5) |
| 7 | 201 con el documento actualizado | — |

**Por qué los pasos 3d y 3e se repiten en 5a.** Afuera de la transacción son baratos y evitan subir un archivo que se va a rechazar. Adentro, bajo el bloqueo, son los que valen: entre el paso 3 y el 5 otro ADMIN pudo archivar el documento o subir ese mismo archivo.

**La versión anterior no se borra del almacenamiento.** Su archivo sigue en `documents/{documentId}/{versionIdAnterior}.{ext}`, porque el historial permite descargarla (R12). Lo único que se borra al fallar es el archivo **nuevo** (R9).

**Reutilización sin duplicar código.** Antes de escribir el servicio nuevo, se mueven de `DocumentUploadService` a una clase compartida, `DocumentWriteSteps`, sin cambiar su comportamiento:
- la validación de la fecha;
- la de las áreas;
- la del responsable;
- la de duplicados;
- `storage.put` con compensación;
- la auditoría de fallos.

Los tests de la spec 001 son la red de seguridad de ese movimiento: tienen que seguir pasando sin cambios. El servicio nuevo, `DocumentLifecycleService`, usa esas piezas para las tres operaciones.

**Cambiar áreas y archivar** siguen el mismo esquema, sin almacenamiento:
1. leer el documento (404, 409);
2. validar (400);
3. transacción con bloqueo, nueva lectura del estado, escritura del documento y de los fragmentos, y auditoría;
4. commit.

Si falla la base, 503 y no cambia nada.

### Puerto del repositorio: métodos nuevos

`DocumentsRepository` suma estos métodos, y los servicios siguen sin depender de Prisma (D10 del plan 001):

| Método | Qué hace |
| --- | --- |
| `lockForUpdate(tx, id)` | `SELECT … FOR UPDATE` del documento y lo devuelve con sus áreas y su versión vigente (o `null`) |
| `replaceAreas(tx, id, areaIds, ownerId?)` | reemplaza `document_areas`, actualiza `ownerId` si vino y copia las áreas a los fragmentos (R5) |
| `addVersion(tx, id, version, reviewDate?)` | reemplaza la vigente, desactiva sus fragmentos, crea la nueva con el número siguiente (R7, R7b) |
| `archive(tx, id, at)` | `ARCHIVED`, `archivedAt` y fragmentos inactivos (R10) |
| `listVersions(id)` | el historial, de la más nueva a la más vieja (R12) |
| `findVersion(documentId, versionId)` | una versión de ese documento, para su descarga (R12) |

`PrismaDocumentsRepository` traduce `P2002` sobre `document_versions_one_current_idx` o sobre `(document_id, version_number)` a un error propio, `ConcurrentVersionError`, que el servicio convierte en 409 `CONCURRENT_VERSION`. Los demás `P2002` siguen pasando sin traducir, como hasta ahora.

## 5. Dos versiones nuevas al mismo tiempo (R8)

Hay tres capas. Cada una alcanza sola para que nunca haya dos `CURRENT`; juntas también dan un resultado claro:

1. **Bloqueo del documento (3.3):** la segunda transacción espera a que termine la primera. Al seguir, ve como vigente la versión que acaba de crear la primera, la reemplaza y crea la siguiente.
   - Resultado: versiones 1 (`REPLACED`), 2 (`REPLACED`) y 3 (`CURRENT`).
   - Las dos cargas responden 201 y las dos quedan en el historial.
   - Si los dos administradores subieron el **mismo** archivo, la segunda ve en 5a que es idéntico a la vigente y responde 409 `IDENTICAL_TO_CURRENT` (R6b).
2. **Índice parcial único (2.1):** si alguna vez una escritura no tomara el bloqueo (otro código, un script, el worker), la base rechaza la segunda `CURRENT`. Esa transacción se deshace y la respuesta es 409 `CONCURRENT_VERSION`.
3. **`@@unique([documentId, versionNumber])`:** ya existe; impide además que las dos versiones tengan el mismo número.

El escenario E10 pide "una sola versión CURRENT"; con la capa 1 las dos subidas se aceptan en orden. Que la segunda reciba 409 en vez de quedar vigente se descartó en D3.

## 6. Pantallas

### 6.1 Dónde van las acciones en el detalle

Solo para el ADMIN y solo si el documento está `ACTIVE`, el detalle (`DocumentDetail`) suma, debajo de los datos y junto a "Descargar", una fila de acciones:

```
[ Descargar ]  [ Cambiar áreas ]  [ Subir versión nueva ]  [ Archivar ]
```

- **"Cambiar áreas" y "Subir versión nueva"** abren un panel **dentro del detalle**, debajo de los datos, de a uno por vez. No son pantallas aparte: el ADMIN ve el documento mientras lo cambia, y en el celular el panel ocupa el ancho de la pantalla (F10 del plan 002). Es la decisión D8.
- **"Archivar"** abre la confirmación (6.4).
- **Documento archivado:** el ADMIN ve "Archivado desde 23/10/2026" y **ninguna** de las tres acciones (R11). Sigue pudiendo descargar y ver el historial.
- **SUPERVISOR y EMPLOYEE:** no ven la fila de acciones ni el historial (R1, R12). Tampoco se pide nada que no puedan usar.
- **Después de una acción correcta:**
  - el detalle se vuelve a pedir (`reload` del hook de T08 del plan 002);
  - el panel se cierra;
  - aparece un aviso breve con `role="status"` ("Áreas actualizadas", "Versión 2 cargada", "Documento archivado").
- **Ante un error:** el panel queda abierto con todo lo completado (F4 del plan 002).

### 6.2 Cambiar áreas: `ChangeAreasForm`

- **Reutiliza:**
  - `AreasField` (T19 del plan 002), con las áreas actuales ya marcadas;
  - `OwnerField` (T20 y T25 del plan 002), con el responsable actual elegido.

  `OwnerField` ya hace lo que pide R4: si con las áreas nuevas el responsable deja de ser válido, lo borra y pide elegir otro con el aviso "…Elegí otro". Así el ADMIN elige el nuevo en la misma operación (P2).
- **Validación antes de enviar:** al menos un área y un responsable elegido, con los mensajes de `validateUpload` del plan 002.
- **El envío:** manda `ownerId` solo si cambió.
- **Errores:**
  - 400 por campo (`areaIds`, `ownerId`), como en la carga;
  - 409 "El documento fue archivado. Ya no se puede modificar.";
  - 404 "No se encontró el documento.";
  - 503.

### 6.3 Subir versión nueva: `NewVersionForm`

- **Reutiliza `FileField`:** valida al elegir y conserva el archivo ante un error.
- **La fecha de revisión** hoy está escrita dentro de `UploadDocumentForm`. Se mueve a un componente propio, `ReviewDateField` (etiqueta, `min` en mañana en Buenos Aires y su error), y lo usan los dos formularios. Acá es **opcional**: "Nueva fecha de revisión (opcional)", con la fecha actual como ayuda debajo.
- **Validación:** `validateFile` (T12 del plan 002), y la fecha solo si se completó, con la misma regla.
- **Mientras sube:** el botón queda deshabilitado con "Cargando…" (F5 del plan 002).
- **Errores, según el `reason` del 409:**

| Respuesta | Mensaje |
| --- | --- |
| 409 `IDENTICAL_TO_CURRENT` | "Este archivo es igual a la versión vigente." |
| 409 `DUPLICATE` | "Ya existe otro documento con este mismo archivo." + enlace al existente (como E6 del plan 002) |
| 409 `ARCHIVED` | "El documento fue archivado. Ya no se puede modificar." |
| 409 `CONCURRENT_VERSION` | "Otra persona subió una versión al mismo tiempo. Recargá el documento y volvé a intentar." |
| 413 / 415 / 400 | junto al campo, como en la carga |
| 503 | "Probá de nuevo en unos minutos", sin perder el archivo |

### 6.4 Archivar con confirmación (R14)

- **Un `<dialog>` nativo** (`showModal()`): el navegador ya resuelve el foco, la tecla Escape y lo que queda detrás.
- **El texto de la spec:** "¿Seguro que querés archivar este documento? Va a dejar de verse para los demás usuarios y no se puede deshacer."
- **Dos botones:**
  - **"Cancelar"**, que tiene el foco al abrir, para que un Enter apurado no archive. Cierra el diálogo sin pedir nada a la API (E11);
  - **"Archivar"**, en rojo. Hace el `POST`, queda deshabilitado con "Archivando…" mientras espera, y al terminar cierra el diálogo y vuelve a pedir el detalle.
- **Si falla:** el error se muestra dentro del diálogo, que queda abierto.

### 6.5 Historial (R12): `VersionHistory`

- **Solo para el ADMIN**, debajo del detalle. Se pide a `GET /api/documents/:id/versions` recién al abrir la sección "Historial de versiones", que empieza cerrada: el detalle no hace un pedido de más.
- **Una fila por versión,** de la más nueva a la más vieja:
  - número;
  - nombre del archivo, recortado y completo en `title`;
  - fecha (`formatCreatedAt`);
  - quién la subió (`usersDirectory.getNames`);
  - estado ("Vigente" o "Reemplazada");
  - procesamiento (`ProcessingStatusBadge`);
  - "Descargar".

  En el celular cada fila es una tarjeta (F10).
- **La descarga** usa `DownloadButton` con una prop nueva, `versionId`: con ella pide `GET /api/documents/:id/versions/:versionId/download`, también en cada clic y sin guardar el enlace (F8 del plan 002).

### 6.6 Cambios en `lib/api`

- **`lib/api/documents.ts`** suma `changeAreas`, `uploadVersion`, `archiveDocument`, `listVersions` y `getVersionDownloadUrl`, con sus tipos, y `archivedAt` en `DocumentResponse`.
- **`ApiError`** suma `reason?: string`, leído del cuerpo del 409.
- **`describeApiError`** suma los contextos `'areas'`, `'version'` y `'archive'`, con los mensajes de 6.2 a 6.4.

## 7. Estrategia de pruebas

Mismo criterio que los planes anteriores:
- reglas en tests unitarios;
- base real en integración;
- pantallas en tests de componentes;
- navegador real en Playwright.

Cada escenario tiene al menos un test de API y uno de pantalla.

### 7.1 Tests unitarios (API, Jest)

| Qué se prueba | Casos |
| --- | --- |
| `DocumentWriteSteps` (lo movido de la carga) | Los tests de `document-upload.service.spec.ts` de la spec 001 pasan **sin cambios** |
| `DocumentLifecycleService.changeAreas` | Orden de los pasos con mocks; 404; 409 archivado (R11); 400 área inexistente (R3); **E6**: el responsable pierde el acceso → 400 y no se abre la transacción; con `ownerId` nuevo válido → pasa; auditoría `SUCCESS` y `FAILURE` |
| `DocumentLifecycleService.addVersion` | Orden de la tabla de la sección 4 con mocks; **E3**: idéntica a la vigente → 409 `IDENTICAL_TO_CURRENT` sin `put`; idéntica a otro documento → 409 `DUPLICATE`; **E4**: `reviewDate` futura se pasa al repositorio; ausente → no se toca; hoy → 400; **E5**: falla la cola → 503, rollback y `delete` del archivo nuevo; falla el almacenamiento → 503 sin transacción; archivado bajo el bloqueo (5a) → 409 y `delete`; `ConcurrentVersionError` → 409 `CONCURRENT_VERSION` |
| `DocumentLifecycleService.archive` | 404; 409 si ya está archivado; auditoría |
| `DocumentQueryService` (historial) | `listVersions` y la descarga de una versión que no es de ese documento → 404 |
| DTOs | `ChangeAreasDto` (`areaIds` ≥ 1, UUID, sin repetidos; `ownerId` opcional) y `CreateVersionDto` (`reviewDate` opcional, `YYYY-MM-DD`) |

### 7.2 Tests de integración (API, Supertest + PostgreSQL real)

En `test/documents/lifecycle.e2e-spec.ts`, con la base de tests (`manual_test`, reseteada antes de la suite). Una ayuda, `seedProcessedVersion`, inserta fragmentos con SQL para simular una versión procesada (`READY`, fragmentos activos con sus áreas), porque el worker todavía no existe (3.4).

| Escenario | Qué comprueba contra la base |
| --- | --- |
| **E1** cambiar áreas | 200; `document_areas` = Operaciones; **todos** los fragmentos, también los de una versión `REPLACED`, con `area_ids = {Operaciones}`; el EMPLOYEE de Ventas recibe 404 en el detalle y no lo ve en el listado; el de Operaciones sí |
| **E2** versión nueva | 201; v1 `REPLACED` con fragmentos `is_active = false`; v2 `CURRENT`, `PENDING`; `FakeProcessingQueue.enqueued` = [id de v2]; el objeto de v2 está en `InMemoryFileStorage` y el de v1 sigue |
| **E3** idéntica | 409 `IDENTICAL_TO_CURRENT`; sigue habiendo una sola versión; ningún objeto nuevo en el almacenamiento |
| **E4** con fecha | `review_date` = la nueva; sin fecha, queda la anterior |
| **E5** falla la cola | `failNext()` → 503; v1 sigue `CURRENT` **y sus fragmentos activos**; no hay v2; el objeto nuevo no quedó |
| **E6** responsable sin acceso | 400 con `ownerId: …`; `document_areas` sigue en Ventas y los fragmentos no cambiaron |
| **E7** archivar | 200 `ARCHIVED` con `archived_at`; todos los fragmentos inactivos; EMPLOYEE de Ventas → 404; ADMIN → 200 con `status: "ARCHIVED"` |
| **E8** rol sin permiso | EMPLOYEE → 403 en los tres endpoints de escritura y en el historial; nada cambió en la base |
| **E9** archivado | cambiar áreas y subir versión → 409 `ARCHIVED`; volver a archivar → 409; nada cambió |
| **E10** una sola vigente | dos `POST …/versions` simultáneos (`Promise.all`) → los dos 201, versiones 2 y 3, **una sola** `CURRENT` (la 3). Además: insertar a mano una segunda `CURRENT` falla por `document_versions_one_current_idx` (prueba que el índice existe) |
| **E12** historial de un empleado | `GET …/versions` como EMPLOYEE → 403; `GET …/versions/:v/download` → 403 |
| **E13** historial | tres versiones → 200, en orden 3, 2, 1, con su estado; la descarga de cada una → 200 con `url` |
| Índices (2.3) | `pg_indexes` tiene `chunks_embedding_idx`, `chunks_content_fts_idx` y `document_versions_one_current_idx` |
| Archivar mientras se reemplaza | archivar y subir versión en paralelo: termina `ARCHIVED` con exactamente una `CURRENT` y todos los fragmentos inactivos, sea cual sea el orden |

### 7.3 Tests de componentes (web, Vitest)

| Qué se prueba | Escenarios y casos |
| --- | --- |
| `DocumentDetail` | Acciones e historial solo para el ADMIN y solo si está `ACTIVE`; archivado → sin acciones, con "Archivado desde…" (**E9**); EMPLOYEE → sin historial ni pedido a `/versions` (**E12**) |
| `ChangeAreasForm` | **E1**: marca Operaciones y envía `areaIds`; **E6**: al desmarcar Ventas, el responsable de Ventas se borra con el aviso y no se puede enviar sin elegir otro; 400 `ownerId` junto al campo; 409 archivado |
| `NewVersionForm` | **E2**: envía el archivo; **E4**: con fecha la manda, sin fecha no; **E3**: 409 `IDENTICAL_TO_CURRENT` con su mensaje; 409 `DUPLICATE` con el enlace; **E5**: 503 sin perder el archivo; F5: un solo envío |
| `ArchiveDialog` | **E7**: "Archivar" hace el `POST`; **E11**: "Cancelar" cierra sin ningún pedido; el texto de R14; el foco empieza en "Cancelar" |
| `VersionHistory` | **E13**: tres versiones en orden, con estado y "Descargar" por versión; la descarga pide `/versions/:v/download` en cada clic |
| `ReviewDateField` | `min` en mañana; opcional en la versión nueva y obligatoria en la carga (los tests de `UploadDocumentForm` siguen pasando) |
| `describeApiError` | Cada `reason` del 409 en cada contexto; nunca el texto técnico |

### 7.4 Playwright

- **Con la API simulada**, en `e2e/ciclo-de-vida.spec.ts`, en escritorio y celular:
  - **E1**, **E2** (con `areaIds` y `file` en el pedido), **E3**, **E4**, **E5**, **E6** y **E7** (confirma, ve "Archivado" y no ve las acciones);
  - **E8**: un EMPLOYEE no ve acciones;
  - **E9**, **E11** (cancelar no hace ningún pedido), **E12** y **E13** (descarga real por versión, como E11 del plan 002).
- **Contra la API real**, en `e2e/integracion/ciclo-de-vida.spec.ts`:
  - **E1** de punta a punta (cambiar a Operaciones; la EMPLOYEE de Ventas deja de verlo y el de Operaciones lo ve);
  - **E2** (subir la versión 2 desde la pantalla y verla `CURRENT` en el historial);
  - **E7** (archivar con confirmación y que la EMPLOYEE deje de verlo).

  Cada corrida usa archivos con contenido distinto (`e2e/support/files.ts`) y títulos `[e2e] …`, como en T26 del plan 002.

### 7.5 Escenario → test

| Escenario | Unitario (API) | Integración (API) | Componente (web) | Playwright |
| --- | --- | --- | --- | --- |
| E1 · Cambiar áreas | `changeAreas` | ✔ fragmentos de todas las versiones | `ChangeAreasForm` | simulada + real |
| E2 · Versión nueva | `addVersion` | ✔ REPLACED, fragmentos, cola | `NewVersionForm` | simulada + real |
| E3 · Versión idéntica | `addVersion` | ✔ 409, sin versión nueva | `NewVersionForm` | simulada |
| E4 · Versión con fecha | `addVersion` | ✔ `review_date` | `NewVersionForm`, `ReviewDateField` | simulada |
| E5 · Falla al subir | `addVersion` | ✔ rollback y fragmentos activos | `NewVersionForm` | simulada |
| E6 · Responsable sin acceso | `changeAreas` | ✔ 400 sin cambios | `ChangeAreasForm` | simulada |
| E7 · Archivar | `archive` | ✔ ARCHIVED, fragmentos, visibilidad | `ArchiveDialog`, `DocumentDetail` | simulada + real |
| E8 · Rol sin permiso | guards (spec 001) | ✔ 403 en todo | `DocumentDetail` | simulada |
| E9 · Documento archivado | los tres métodos | ✔ 409 | `DocumentDetail` | simulada |
| E10 · Una sola vigente | `ConcurrentVersionError` | ✔ concurrencia real + índice | — | — (no se reproduce en el navegador) |
| E11 · Archivar sin confirmar | — | — | `ArchiveDialog` | simulada |
| E12 · Empleado sin historial | — | ✔ 403 | `DocumentDetail` | simulada |
| E13 · Historial | `listVersions` | ✔ orden y descargas | `VersionHistory` | simulada |

## 8. Dependencias nuevas

Ninguna:
- el índice parcial es una función preliminar de Prisma 7.10, que ya está instalado;
- el `<dialog>` es del navegador;
- todo lo demás reutiliza lo que ya está.

## 9. Decisiones y pregunta abierta

### 9.1 Decisiones

Tomadas en la revisión del plan el 23/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · ¿Cómo evitamos que una migración nueva borre `chunks_embedding_idx` y `chunks_content_fts_idx`? | Toda migración nueva se crea con `--create-only` y se revisa antes de aplicarla, y un test de integración exige que existan los índices (2.3). Si en algún momento Prisma puede describirlos, se pasan al esquema. **Afecta a todo el equipo: avisar antes de mergear** | R5, R8 |
| D2 · ¿Aceptamos `previewFeatures = ["partialIndexes"]` (preview de Prisma 7.10)? | Sí: genera el SQL exacto (probado con `prisma migrate diff`) y evita sumar un tercer índice a mano. Si algún día cambia, el índice pasa a SQL manual con el cuidado de D1. **Afecta a todo el equipo: avisar antes de mergear** | R8 |
| D3 · Dos versiones nuevas a la vez: ¿se aceptan las dos en orden o la segunda recibe 409? | Se aceptan en orden, con el bloqueo de 3.3: las dos son cargas válidas, la última queda vigente y las dos quedan en el historial. El 409 `CONCURRENT_VERSION` queda solo como red de seguridad del índice (sección 5) | R8 |
| D4 · Cambiar las áreas a las mismas que ya tiene | 200 con el documento, sin escribir ni auditar: no cambió nada | R3, R13 |
| D5 · ¿Archivar como `POST /:id/archive` o como `PATCH /:id` con `status`? | `POST /:id/archive`: es una acción con efectos (fragmentos, auditoría) y no hay otro valor posible para `status` (P1) | R10, R11 |
| D6 · ¿Se borran del almacenamiento los archivos de versiones reemplazadas o de documentos archivados? | No: el historial los descarga (R12) y la spec deja fuera los borrados definitivos (sección 4 de la spec) | R12 |
| D7 · ¿Se agrega `reason` a los 409, también al de la carga existente? | Sí (1.2): la web necesita distinguir cuatro 409 distintos. Es un campo extra y no rompe a nadie | R6b, R11, R8 |
| D8 · ¿Las acciones del detalle son paneles dentro del detalle o pantallas aparte? | Paneles dentro del detalle (6.1): se ve el documento mientras se cambia y no suma rutas. Si los paneles quedan largos en el celular, se pasa a rutas (`/documentos/[id]/areas`, `/documentos/[id]/version`) sin cambiar los formularios | — |
| D9 · El dueño de la auditoría (A1 del plan 001) sigue abierto | Seguir con `LoggerAuditLog` y sumar las tres acciones nuevas (1.6); la implementación real las hereda | R13 |
| D10 · ¿El ADMIN puede descargar una versión vieja de un documento archivado? | Sí: el ADMIN ve todo (R10 de la spec 001) y el historial sigue disponible después de archivar | R10, R12 |

### 9.2 Pregunta abierta

| # | Pregunta | Con quién | Propuesta |
| --- | --- | --- | --- |
| Q1 | ¿El worker puede garantizar lo de la sección 3.4 (bloquear la fila del documento con `FOR SHARE`, volver a leer áreas y estados bajo el bloqueo, insertar fragmentos y `READY` en una sola transacción, descartar versiones que no existen)? | Guille | Sí, es lo mínimo para cubrir los tres casos borde de la sección 8 sin que esta feature vuelva a tocar los fragmentos. Se acuerda antes de que el worker se mergee; mientras tanto, los tests simulan fragmentos con SQL (7.2) |
