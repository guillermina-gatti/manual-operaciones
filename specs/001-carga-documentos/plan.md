# Plan 001 · Carga y consulta de documentos

- **Spec:** [spec.md](./spec.md) (HU13 y la consulta de HU15)
- **Modelo de partida:** [modelo-propuesto.prisma](./modelo-propuesto.prisma)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** listo para implementar. Las decisiones están en la sección 9 y lo que depende de otras personas, en la sección 10.

En este plan, "spec P3" se refiere a una decisión de la spec; D1 a D13 son las decisiones del plan (sección 9) y A1 a A3, sus preguntas abiertas (sección 10).

## 0. Punto de partida

Estado actual de `apps/api`:

- NestJS 12 recién generado: solo `AppModule`, `AppController` y `AppService`.
- Prisma 7: generador `prisma-client` con salida en `src/generated/prisma` y `moduleFormat = "cjs"`. El `datasource` no tiene `url`, porque la URL sale de `prisma.config.ts` (`DATABASE_URL`). Todavía no hay modelos ni migraciones.
- Ya están instaladas, entre otras: `@aws-sdk/client-s3`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/adapter-pg`, `class-validator`, `class-transformer` y `@nestjs/platform-express` (trae `multer`).
- BullMQ y Redis son de Guille (HU14). Redis ya está en `docker-compose.yml` (`redis:7-alpine`, junto a `pgvector/pgvector:pg16`): lo agregó Guille en C-01.
- Tests: Jest y `ts-jest`. Los unitarios son `src/**/*.spec.ts` y los de integración, `test/**/*.e2e-spec.ts` (`pnpm --filter api test:e2e`).

**Lo que el plan da por hecho (lo entrega otra pareja, D7):**
- un `PrismaService` global;
- el prefijo `/api` en `main.ts`;
- un `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`;
- Swagger.

Si al implementar todavía no existen, se crean en una **tarea separada** y se avisa al equipo. Esta feature no los crea.

## 1. Módulos, servicios y controladores

Regla general: **los controladores no contienen reglas de negocio.** Reciben la petición, aplican los guards y el `FileInterceptor`, pasan DTOs ya validados al servicio y devuelven lo que el servicio responde. Todas las reglas (R1 a R14) viven en los servicios o en clases de dominio puras.

```
src/
├── storage/
│   ├── storage.module.ts            elige la implementación de FileStorage
│   ├── file-storage.ts              puerto: put, delete, getDownloadUrl
│   ├── s3-file-storage.ts           implementación real con S3
│   └── in-memory-file-storage.ts    para tests y desarrollo sin AWS
├── common/auth/                     (simulado hasta que llegue lo de la otra pareja; ver 5.1)
│   └── index.ts                     JwtAuthGuard, RolesGuard, @Roles(), @CurrentUser(), AuthUser, Role
└── documents/
    ├── documents.module.ts          cablea controlador, servicios y adaptadores de los puertos
    ├── documents.controller.ts      4 endpoints, sin lógica
    ├── document-upload.service.ts   orquesta la carga (R2 a R9, R14)
    ├── document-query.service.ts    listado, detalle y descarga (R10 a R13)
    ├── document-access.policy.ts    reglas puras de visibilidad (R5 y R10)
    ├── file-inspector.ts            reglas puras del archivo (R2 y R3) y SHA-256
    ├── documents.repository.ts      puerto: acceso a datos de documentos y runInTransaction (D10)
    ├── prisma-documents.repository.ts implementación con Prisma (usa el PrismaService compartido; bloqueada, ver 5.6)
    ├── dto/                         create-document.dto, list-documents.query, document.response, ...
    ├── ports/                       processing-queue, areas-directory, users-directory, audit-log
    └── adapters/                    implementaciones simuladas (y después las reales) de los puertos
```

| Pieza | Responsabilidad |
| --- | --- |
| `DocumentsController` | Rutas, Swagger, `@Roles('ADMIN')` en la carga, `FileInterceptor('file')` con límites, `ParseUUIDPipe`. Llama a un método de servicio y devuelve su resultado. |
| `DocumentUploadService` | Ejecuta la carga en el orden de la sección 4: inspecciona el archivo, valida referencias y fecha, revisa duplicados, guarda en el almacenamiento, abre la transacción con `DocumentsRepository.runInTransaction`, encola y compensa si algo falla. Registra la auditoría. |
| `DocumentQueryService` | Listado paginado, detalle y URL de descarga. Siempre filtra por visibilidad antes de devolver algo. |
| `DocumentAccessPolicy` | Funciones puras: `canView(user, documentAreaIds)`, el `where` de Prisma para el listado según el usuario y `canBeOwner(owner, areaIds)` para R5. |
| `FileInspector` | Funciones puras: recibe `buffer` y `originalname`, devuelve `{ kind: 'pdf' \| 'txt' \| 'md', mimeType, extension, sizeBytes, checksum }` o lanza 400 o 415. |
| `DocumentsRepository` (puerto) y `PrismaDocumentsRepository` | Clase abstracta (D10) con `runInTransaction(fn)`, `findActiveByChecksum`, `createWithFirstVersion(tx, ...)`, `list(where, page, limit)` y `findByIdWithAreas`. `runInTransaction` envuelve el `prisma.$transaction` con timeout corto del paso 5 (sección 4), así los servicios no dependen de Prisma. `PrismaDocumentsRepository` la implementa con el `PrismaService` compartido y queda bloqueada hasta que exista (5.6). |
| `FileStorage` (puerto) y `S3FileStorage` | `put(key, buffer, contentType, checksum)`, `delete(key)` y `getDownloadUrl(key, fileName)`, que vence a los 300 s. |
| Puertos externos | `ProcessingQueue`, `AreasDirectory`, `UsersDirectory` y `AuditLog`. Se definen en la sección 5. |

`DocumentsModule` importa `StorageModule` y define con qué implementación se resuelve cada puerto, incluido `DocumentsRepository`. Es el **único lugar** que cambia cuando lleguen las implementaciones reales.

## 2. Modelo de datos

### 2.1 Modelos de Prisma que se agregan

En `apps/api/prisma/schema.prisma` se agregan, partiendo de `modelo-propuesto.prisma` y con las correcciones de 2.4:

- Enums `DocumentStatus`, `DocumentVersionStatus` y `ProcessingStatus`, sin cambios.
- `Document`, con `reviewDate` obligatorio.
- `DocumentArea`, sin cambios.
- `DocumentVersion`, con `storageKey` único, índice por `checksum` y sin la relación `chunks` hasta que exista `Chunk` (A2).

Versión corregida de lo que cambia:

```prisma
model Document {
  // ...igual al propuesto, salvo:
  reviewDate  DateTime       @map("review_date") @db.Date   // obligatoria (R4, spec P3)
  @@index([createdAt])                                       // orden del listado (R13)
}

model DocumentVersion {
  // ...igual al propuesto, salvo:
  storageKey  String  @unique @map("storage_key")  // documents/{documentId}/{versionId}.{pdf|txt|md}
  mimeType    String  @map("mime_type") @db.VarChar(100)    // tipo detectado, no el del navegador
  checksum    String  @db.Char(64)                          // SHA-256 en hexadecimal, minúsculas
  // chunks Chunk[]  → se agrega junto con Chunk (A2)
  @@index([checksum])                                       // R8b
}
```

Con usuarios y áreas, de otras parejas, la relación es **solo por ID** (`ownerId`, `createdById`, `uploadedById` y `DocumentArea.areaId`). No hay relaciones de Prisma ni claves foráneas hacia sus tablas.

### 2.2 SQL que se agrega a mano en la migración

La migración `add_documents` **no lleva SQL manual**: todo lo de 2.1 lo genera Prisma. Se crea y aplica con `prisma migrate dev --name add_documents`.

**Pendiente para otras specs:**
- **HU16:** el índice único parcial que asegura que haya como máximo una versión `CURRENT` por documento (M4):
  ```sql
  CREATE UNIQUE INDEX document_versions_one_current_idx
    ON document_versions (document_id) WHERE status = 'CURRENT';
  ```
  En HU13 siempre se crea una sola versión, así que hoy no puede haber dos. Hay que agregarlo cuando HU16 permita reemplazar versiones.
- **Con Guille (A2):** el SQL de `Chunk` (`CREATE EXTENSION IF NOT EXISTS vector`, el índice HNSW y el índice FTS) va en su migración. `CREATE EXTENSION` tiene que ir **al principio**, antes del `CREATE TABLE chunks`.

### 2.3 Qué guarda una carga correcta

| Tabla | Filas |
| --- | --- |
| `documents` | 1, con `status = ACTIVE`, `title` sin espacios al principio ni al final, `ownerId`, `reviewDate` y `createdById` = admin |
| `document_areas` | 1 por área, sin repetidas |
| `document_versions` | 1, con `versionNumber = 1`, `status = CURRENT`, `processingStatus = PENDING`, `storageKey`, `originalFileName`, `mimeType` detectado, `sizeBytes`, `checksum` y `uploadedById` |

### 2.4 Errores del modelo y diferencias con la spec

El fragmento se evaluó como si estuviera dentro de `schema.prisma`. Los tipos nativos y `type: Gin` son válidos con `provider = "postgresql"`. No hay errores de sintaxis. Sí hay diferencias de fondo:

| # | Qué pasa | Regla | Corrección |
| --- | --- | --- | --- |
| M1 | `reviewDate` es opcional (`DateTime?`), pero la spec la exige | R4, spec P3 | Hacerla obligatoria: `DateTime @db.Date` |
| M2 | El comentario de `storageKey` dice `.pdf`, pero también se aceptan `.txt` y `.md` | R2, spec P1 | Usar `documents/{documentId}/{versionId}.{ext}`, con `ext` según el tipo detectado |
| M3 | No hay índice por `checksum`, y la búsqueda de duplicados recorrería toda la tabla | R8b | Agregar `@@index([checksum])` |
| M4 | Nada impide que un documento tenga dos versiones `CURRENT` | R7 | Pendiente para HU16 (2.2) |
| M5 | No hay ningún modelo de auditoría | R14 | Puerto `AuditLog`; el dueño queda abierto (A1) |
| M6 | `storageKey` no es único | R9 | Agregar `@unique` |
| M7 | `description` no aparece en la spec | — | Se mantiene opcional, de hasta 1000 caracteres (D4) |
| M8 | La dimensión del vector no está decidida. El proveedor es Gemini, que por defecto devuelve 3072 dimensiones, y el índice HNSW de pgvector admite hasta 2000 | — | Se propone `outputDimensionality` 768, a confirmar con Guille (A2). Bloquea la migración de `Chunk` |
| M9 | El comentario de `ARCHIVED` dice que "no se muestra a empleados", pero R10 solo habla de áreas | R10 | Quienes no son ADMIN solo ven documentos `ACTIVE` (D2) |
| M10 | Las fechas se guardan como `timestamp(3)` sin zona horaria | — | Usar `@db.Timestamptz(3)` en `createdAt`, `updatedAt`, `archivedAt` y `processedAt`, para no depender de la zona horaria del servidor |
| M11 | Sobre `Chunk`: "la carga actualiza `areaIds` e `isActive`". Al cargar todavía no hay fragmentos | — | No aplica en HU13. Queda para HU15 (cambiar áreas) y HU16 |

## 3. Endpoints

Todas las rutas llevan el prefijo `/api`. Los errores usan el formato estándar de NestJS (`statusCode`, `message`, `error`). Todos los endpoints se documentan en Swagger (`@ApiTags('documents')`, `@ApiBearerAuth`, `@ApiResponse` por cada código; la carga lleva además `@ApiConsumes('multipart/form-data')`).

### 3.1 `POST /api/documents`: cargar un documento

- **Rol:** ADMIN (R1).
- **Entrada:** `multipart/form-data`.
  - `file`: el archivo (obligatorio).
  - `title`: string; se quitan los espacios del principio y del final y queda de 1 a 200 caracteres.
  - `areaIds`: UUID, uno o más. Se repite el campo una vez por área; un solo valor se convierte en arreglo y se eliminan los repetidos.
  - `ownerId`: UUID.
  - `reviewDate`: `YYYY-MM-DD`, una fecha real.
  - `description`: opcional, hasta 1000 caracteres.
- **Respuesta 201** (R7):
  ```json
  { "id": "…", "title": "…", "description": null, "status": "ACTIVE",
    "areaIds": ["…"], "ownerId": "…", "reviewDate": "2027-03-01",
    "createdById": "…", "createdAt": "…", "archivedAt": null,
    "currentVersion": { "id": "…", "versionNumber": 1, "status": "CURRENT",
      "originalFileName": "manual.pdf", "mimeType": "application/pdf",
      "sizeBytes": 2097152, "processingStatus": "PENDING", "createdAt": "…" } }
  ```
  No se devuelven `storageKey` ni `checksum`.

  `archivedAt` (`string | null`): la fecha y hora en que se archivó el documento, en ISO 8601 (por ejemplo `"2026-10-24T13:30:00.000Z"`), o `null` si está activo. En la carga siempre es `null`. Lo devuelven también el listado (3.2) y el detalle (3.3), que tienen la misma forma. **Agregado en la spec 003 (T03).**
- **Errores:**

| Código | Cuándo | Regla |
| --- | --- | --- |
| 401 | No hay sesión | R1 |
| 403 | Hay sesión, pero el rol no es ADMIN | R1 |
| 413 | El archivo pesa más de 10 MB (lo corta multer) | R3 |
| 400 | Falta un campo o es inválido; `message` dice qué campo falló | R4 |
| 400 | Falta `file`, o el archivo pesa 0 bytes | R3, R4 |
| 415 | La extensión no se acepta, o el contenido no coincide con el tipo | R2 |
| 400 | La fecha de revisión no es posterior a la de carga | R6 |
| 400 | Un área no existe, o el responsable no existe o no puede ver el documento | R5 |
| 409 | El mismo contenido ya está en la versión vigente de un documento `ACTIVE` | R8b |
| 503 | Falla el almacenamiento, la base o el encolado; se deshace todo | R8 |

Para el 409, la respuesta agrega dos campos al formato estándar: `{ statusCode: 409, message, error: "Conflict", reason: "DUPLICATE", existingDocumentId }`. `reason` dice qué tipo de conflicto es, para que la web elija el mensaje; en la carga siempre es `"DUPLICATE"`, y la spec 003 suma otros valores en sus propios endpoints. **`reason` agregado en la spec 003 (T03).**

### 3.2 `GET /api/documents?page=&limit=`: listar documentos

- **Rol:** cualquier usuario con sesión.
- **Entrada:** `page` es un entero desde 1 (por defecto 1). `limit` es un entero de 1 a 100 (por defecto 20).
- **Respuesta 200** (R13): `{ data: DocumentSummary[], total, page, limit }`, ordenado por `createdAt` descendente y, en caso de empate, por `id`. `DocumentSummary` es igual al detalle, pero con una versión resumida.
  - El ADMIN ve todos los documentos.
  - El resto ve los documentos `ACTIVE` que comparten al menos un área con él (R10, D2).
  - `data` y `total` salen de la misma consulta filtrada (`findMany` + `count` en un `$transaction`).
- **Errores:** 401 sin sesión. 400 si `page` o `limit` no son válidos, por ejemplo `limit=101` (D3).

### 3.3 `GET /api/documents/:id`: ver el detalle

- **Rol:** cualquier usuario con sesión.
- **Entrada:** `id` UUID (`ParseUUIDPipe`).
- **Respuesta 200:** igual al 201 de la carga.
- **Errores:** 401. 404 si el documento no existe o no es visible para el usuario, sin distinguir entre los dos casos (R10, R11). 400 si el id no es un UUID: no revela nada, porque un id mal formado no puede existir.

### 3.4 `GET /api/documents/:id/download`: descargar

- **Rol:** cualquier usuario con sesión.
- **Respuesta 200** (R12): `{ "url": "https://…", "expiresAt": "…" }`, con un vencimiento de 5 minutos desde ahora. Funciona con cualquier `processingStatus`.

  Se devuelve JSON y no un redirect 302 para que el frontend pueda pedirlo con su token y abrir el enlace después.
- **Errores:** 401. 404, igual que en el detalle (R11). El enlace **solo** se genera después de comprobar la visibilidad (R10).

## 4. Orden de los pasos de la carga (R8, todo o nada)

Los guards de Nest corren **antes** que los interceptores. Por eso el 401 y el 403 se resuelven sin leer el archivo. El `FileInterceptor` usa `memoryStorage()` con `limits: { fileSize: 10 * 1024 * 1024, files: 1 }`. Si el archivo se pasa de tamaño, multer corta la lectura y Nest responde 413. Hasta el paso 4 no se escribe nada en ningún lado.

| # | Paso | Si falla |
| --- | --- | --- |
| 1 | `JwtAuthGuard` + `RolesGuard('ADMIN')` | 401 o 403. No hay nada que deshacer |
| 2 | Multer lee el archivo a memoria, con el límite de 10 MB | 413 |
| 3a | `ValidationPipe` sobre `CreateDocumentDto` (R4) | 400, con el campo que falló |
| 3b | `FileInspector`: sin archivo o vacío da 400. Después se mira la extensión de `originalname` en minúsculas: `.pdf` tiene que empezar con `%PDF-`; `.txt` y `.md` tienen que ser UTF-8 válido (`TextDecoder` con `fatal: true`) sin `\0`. Otra extensión, o un contenido que no coincide, da 415 (R2). Se ignora el `mimetype` del navegador. Se calcula el SHA-256 | 400 o 415 |
| 3c | `reviewDate` > fecha de hoy en la zona horaria de la empresa (R6, D1) | 400 |
| 3d | `AreasDirectory.findExistingIds(areaIds)` tiene que devolver todas las áreas (R5) | 400, con las áreas que no existen |
| 3e | `UsersDirectory.findById(ownerId)`: el usuario tiene que existir y además ser ADMIN o compartir al menos un área (R5) | 400 |
| 3f | Chequeo de duplicados: `findActiveByChecksum(checksum)` busca una versión `CURRENT` cuyo documento esté `ACTIVE` (R8b) | 409, con `existingDocumentId` |
| 4 | Se generan `documentId` y `versionId` con `crypto.randomUUID()`, la clave `documents/{documentId}/{versionId}.{ext}` (R9), y se hace `FileStorage.put` | 503. No hay nada que deshacer |
| 5 | Se abre `DocumentsRepository.runInTransaction(async tx => …)`, que usa `prisma.$transaction` con un timeout corto (D10) | |
| 5a | Se insertan `documents`, `document_areas` y `document_versions` (R7) | 503: rollback y `FileStorage.delete(key)` |
| 5b | `AuditLog.record({ action: 'DOCUMENT_UPLOAD', actorId, documentId, result: 'SUCCESS', at }, tx)` (R14) | 503: rollback y `delete` |
| 5c | `ProcessingQueue.enqueue(versionId)`, el **último paso dentro de la transacción**, con timeout (R7) | 503: rollback y `delete` |
| 6 | Commit | Si falla después de encolar: 503 y `delete`. El trabajo encolado apunta a una versión que no existe (A3) |
| 7 | Respuesta 201 con el documento creado | — |

**Duplicados simultáneos.** En el MVP alcanza con el chequeo del paso 3f. Si dos administradores suben el mismo archivo exactamente al mismo tiempo, las dos cargas pueden pasar. Se acepta ese riesgo para el MVP.

**Por qué se encola dentro de la transacción y no después del commit.** Si el encolado falla, el rollback de la base es atómico: no hay que borrar filas a mano, y ese borrado también podría fallar y dejar una versión que nadie va a procesar. El único caso que queda es un trabajo cuya versión no se guardó (falla el commit, o el encolado venció por timeout pero en realidad llegó a la cola). Lo resuelve el worker, según el acuerdo con Guille (A3).

**Compensación del almacenamiento.** Ante cualquier error después del paso 4, se ejecuta `FileStorage.delete(key)` en un `finally`. Si el `delete` también falla, la respuesta sigue siendo 503, y se registra un error con `key`, `documentId` y la causa para limpiarlo a mano. Es el único residuo posible: un objeto sin documento, que nadie puede ver ni descargar.

**Auditoría de los fallos (R14).** Cuando la carga falla después de llegar al servicio (pasos 3 a 6), se registra `result: 'FAILURE'` con el motivo (código HTTP), **fuera** de la transacción y después del rollback, como mejor esfuerzo. Los 401, 403 y 413 no llegan al servicio; quién los audita depende de A1.

**Mapeo de errores.** `FileStorage` y `ProcessingQueue` traducen sus errores técnicos a `StorageUnavailableError` y `QueueUnavailableError`. Esos errores, y `RepositoryUnavailableError`, al que el repositorio traduce los fallos de conexión o timeout de Prisma, se convierten en `ServiceUnavailableException` (503). Cualquier otro error inesperado responde 500 con un mensaje genérico; en los dos casos se compensa con `delete`, se audita `FAILURE` con el código y la causa va al log. Las reglas de negocio lanzan directamente las excepciones de Nest (`BadRequestException`, `UnsupportedMediaTypeException`, `ConflictException`).

## 5. Qué se simula y cómo se reemplaza

Patrón común: nuestro código depende de **puertos**, es decir, clases abstractas que también funcionan como token de inyección. No depende de las implementaciones de otras parejas. `DocumentsModule` elige qué implementación corresponde a cada puerto, y reemplazar una simulación es cambiar **una línea** de `providers` en ese módulo.

### 5.1 Autenticación

La otra pareja entrega `JwtAuthGuard`, `RolesGuard`, `@Roles()` y `@CurrentUser()`.

- Nuestro código importa **solo** de `src/common/auth/index.ts`, nunca de una ruta interna.
- Mientras tanto, ese archivo exporta simulaciones con la misma forma:
  - `AuthUser = { id: string; role: Role }`, con `Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'`.
  - Un `JwtAuthGuard` simulado lee las cabeceras `x-user-id` y `x-user-role` y responde 401 si faltan. Lanza un error al arrancar si `NODE_ENV === 'production'`.
  - `RolesGuard` y `@Roles()` simulados.
- Las áreas del usuario **no** se leen del token: se piden a `UsersDirectory` (D5).
- **Reemplazo:** `index.ts` pasa a reexportar los guards y decoradores reales, y se borran las simulaciones. Los tests de integración ya reemplazan el guard con `overrideGuard(JwtAuthGuard)` y no cambian.

### 5.2 Cola de procesamiento

Guille expone `ProcessingService.enqueue`.

- Puerto: `abstract class ProcessingQueue { abstract enqueue(documentVersionId: string): Promise<void> }`.
- Ahora: `FakeProcessingQueue` registra el aviso en el log y guarda los IDs en memoria para que los tests puedan revisarlos. Se le puede configurar que falle.
- **Reemplazo:** `ProcessingServiceQueueAdapter` implementa `ProcessingQueue` delegando en `ProcessingService.enqueue(documentVersionId)`. En `DocumentsModule` se importa `ProcessingModule` y se cambia `{ provide: ProcessingQueue, useClass: FakeProcessingQueue }` por el adaptador. El nombre del trabajo (`process-document`) y su contenido (`{ documentVersionId }`) los arma el servicio de Guille.

### 5.3 Áreas y usuarios

Sus tablas son de otra pareja; con ellas nos relacionamos solo por ID.

- Puertos:
  - `AreasDirectory.findExistingIds(ids: string[]): Promise<string[]>`
  - `UsersDirectory.findById(id): Promise<{ id; role; areaIds: string[] } | null>`, que se usa para el responsable (R5) y para las áreas del usuario actual (R10).
- Ahora: `InMemoryAreasDirectory` e `InMemoryUsersDirectory`, con datos fijos de ejemplo (Ventas, Operaciones, un ADMIN, un SUPERVISOR y EMPLOYEE de cada área, con UUID estables) en `documents/adapters/fixtures.ts`. Los tests los cargan con sus propios datos.
- **Reemplazo:** adaptadores que deleguen en los servicios que exponga la otra pareja, o, si no exponen ninguno, que consulten sus tablas con `PrismaService` en modo solo lectura. Es el mismo cambio de una línea en `DocumentsModule`.

### 5.4 Auditoría

- Puerto: `AuditLog.record(entry, tx?)`.
- Ahora: `LoggerAuditLog` escribe en el log de Nest, en formato estructurado.
- **Reemplazo:** la implementación real, cuando se resuelva A1, sin tocar `DocumentUploadService`.

### 5.5 Almacenamiento

`FileStorage` tiene dos implementaciones: `S3FileStorage`, la real, e `InMemoryFileStorage`, para los tests y para desarrollar sin AWS. `StorageModule` elige `S3FileStorage` si está definida `S3_BUCKET` (D11). Si no está, en desarrollo usa la de memoria y avisa por el log; en producción falla al arrancar.

### 5.6 Repositorio de documentos

El `PrismaService` compartido todavía no existe (D7), y sin él no se puede escribir un repositorio concreto. Para no bloquear los servicios, el repositorio también es un puerto (D10).

- Puerto: `abstract class DocumentsRepository` con `runInTransaction(fn)`, `findActiveByChecksum(checksum)`, `createWithFirstVersion(tx, data)`, `list(where, page, limit)` y `findByIdWithAreas(id)`. El `tx` que recibe `fn` es opaco para los servicios: solo lo pasan a `createWithFirstVersion` y a `AuditLog.record`.
- Ahora: no hay simulación en memoria. Los tests unitarios de `DocumentUploadService` y `DocumentQueryService` lo reemplazan con `jest.fn()`.
- **Bloqueado:** `PrismaDocumentsRepository`, la implementación con el `PrismaService` compartido, y por lo tanto el cableado de `DocumentsModule` y los tests de integración, hasta que exista `PrismaService`.
- **Reemplazo:** cuando exista `PrismaService`, se agrega `PrismaDocumentsRepository` y en `DocumentsModule` se declara `{ provide: DocumentsRepository, useClass: PrismaDocumentsRepository }`. Los servicios no cambian.

## 6. Almacenamiento en S3

- **Bucket privado**, con Block Public Access activado y cifrado del lado del servidor (SSE-S3, el que S3 usa por defecto).
- **Clave:** `documents/{documentId}/{versionId}.{pdf|txt|md}`. La genera siempre el sistema (R9). El nombre original solo se guarda en `originalFileName` (hasta 255 caracteres, se recorta si es más largo) y nunca se usa en rutas. Por eso `../../x.pdf` no tiene ningún efecto.
- **Subida:** `PutObjectCommand` con `ContentType` igual al tipo detectado, `ContentLength` y `ChecksumSHA256` (el SHA-256 en base64), para que S3 rechace el archivo si llega dañado.
- **Descarga:** `getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition }), { expiresIn: 300 })`. `ResponseContentDisposition` es `attachment; filename*=UTF-8''<originalFileName codificado>`, así el archivo se descarga con su nombre original. `expiresAt` se calcula como ahora + 300 s. Los 300 s son una constante del código, porque los fija la spec.
- **Permisos de IAM** (rol de la instancia EC2): `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre `arn:aws:s3:::<bucket>/documents/*`. El worker de Guille necesita `s3:GetObject`.
- **Variables de entorno** (solo los nombres). Se validan al arrancar con `ConfigModule` y se documentan en un `.env.example` sin valores:
  - `AWS_REGION`
  - `S3_BUCKET` (D11)
  - `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`: **solo para desarrollo local**. En EC2 se usa el rol de la instancia, y el SDK las encuentra solo, sin código adicional.
  - `S3_ENDPOINT` y `S3_FORCE_PATH_STYLE`: opcionales, para un S3 local como MinIO (D6).
  - `APP_TIMEZONE`: opcional; si no está, se usa `America/Argentina/Buenos_Aires` (D1).
  - `DATABASE_URL`: ya existe.
- Hay que confirmar que `.env` esté en `.gitignore`. Ningún secreto va al repositorio (sección 9 de la spec).

## 7. Dependencias nuevas

| Paquete | Tipo | Por qué |
| --- | --- | --- |
| `@aws-sdk/s3-request-presigner` | dependencia | Genera las URLs firmadas de 5 minutos (R12). `@aws-sdk/client-s3` ya está instalado y la versión tiene que coincidir con la suya |
| `@types/multer` | dependencia de desarrollo | Tipos de `Express.Multer.File` para el `FileInterceptor`. Multer ya viene con `@nestjs/platform-express` |

No hacen falta paquetes para detectar el tipo de archivo (como `file-type`). R2 se cumple con una comparación de bytes y con `TextDecoder`, que ya trae Node. BullMQ y Redis los instala Guille.

## 8. Estrategia de pruebas

### 8.1 Tests unitarios

Son `src/**/*.spec.ts`. Usan los puertos simulados con `jest.fn()` y no tocan la red ni la base.

| Qué se prueba | Escenarios de la spec y casos extra |
| --- | --- |
| `FileInspector` | **Extensión falsa** (`manual.pdf` sin `%PDF-` da 415); **carga de Markdown** (`.md` en UTF-8 válido); `.txt` con bytes nulos o UTF-8 inválido da 415; extensión `.docx` da 415; archivo vacío da 400; mayúsculas en la extensión; SHA-256 correcto |
| `DocumentAccessPolicy` | R10 (ADMIN ve todo; los demás, solo los `ACTIVE` que comparten un área); R5 (**responsable sin acceso**, responsable ADMIN sin áreas, responsable SUPERVISOR de un área compartida) |
| `DocumentUploadService` | **Carga correcta**: orden de las llamadas, estados de R7, `enqueue` con el `versionId`, auditoría con `SUCCESS`. **Área inexistente** da 400. Fecha de hoy o pasada da 400 (R6), con el reloj simulado. **Duplicado** da 409 con `existingDocumentId`. **Falla el almacenamiento**: 503 y no se abre la transacción. Falla la base: 503 y `delete`. **Falla el encolado**: 503, rollback y `delete`. Falla también el `delete`: sigue siendo 503 y se registra el error. Auditoría con `FAILURE` |
| `DocumentQueryService` | Valores por defecto de `page` y `limit`; documento no visible da 404 y **nunca se llama** a `getDownloadUrl`; la descarga funciona en `PENDING` y `FAILED` |
| DTOs | Validación de `CreateDocumentDto`: título con espacios, 201 caracteres, `areaIds` vacío o con un solo valor, fecha mal formada |

### 8.2 Tests de integración

Son `test/documents/*.e2e-spec.ts`. Usan Supertest con la app real y **PostgreSQL real** en Docker, en una base aparte para tests: `DATABASE_URL` apunta a otra base, y antes de la suite se corre `prisma migrate reset --force`. La autenticación, el almacenamiento (`InMemoryFileStorage`), la cola y los directorios se reemplazan con simulaciones configurables. Cubren los **13 escenarios de la spec**, más R13:

- Carga correcta: 201; en la base quedan las filas de 2.3; el objeto está en el almacenamiento simulado; la cola simulada recibió el `versionId`.
- Rol sin permiso (EMPLOYEE) da 403, y sin cabeceras da 401. En los dos casos no hay filas ni objetos.
- Extensión falsa da 415; PDF de 11 MB da 413; duplicado da 409 con `existingDocumentId`. En los tres no hay filas ni objetos nuevos.
- Duplicado de un documento `ARCHIVED` (se inserta directo en la base): da 201.
- Carga de Markdown da 201. Responsable sin acceso da 400. Área inexistente da 400.
- Falla el almacenamiento: 503 y no hay filas. Falla el encolado: 503, no hay filas y no queda el objeto.
- Listado filtrado por área: el EMPLOYEE de Ventas recibe solo el documento de Ventas y `total = 1`. También: paginación, orden y `limit=101` da 400.
- Documento de otra área: el detalle y la descarga dan 404, y el almacenamiento simulado no generó ningún enlace.
- Descarga permitida con `PENDING`: hay `url` y `expiresAt` cae unos 300 s después de ahora.
- Nombre de archivo con tildes: `originalFileName` se guarda bien (D8).

### 8.3 Verificación manual con el bucket de desarrollo

`S3FileStorage` no tiene tests automáticos. Se verifica a mano, una vez, con la API levantada contra el bucket de desarrollo:

1. Cargar un PDF y comprobar en S3 que el objeto está en `documents/{documentId}/{versionId}.pdf` con el `ContentType` correcto.
2. Pedir la descarga, abrir la `url` y comprobar que el archivo baja con su nombre original.
3. Pasados 5 minutos, volver a abrir la misma `url` y comprobar que S3 la rechaza.
4. Forzar un fallo del encolado (`FakeProcessingQueue` configurada para fallar) y comprobar que el objeto no quedó en el bucket.

## 9. Decisiones

Tomadas en la revisión del plan el 21/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · R6: ¿"posterior a la fecha de carga" se compara por día, y en qué zona horaria? | Por día: `reviewDate` tiene que ser al menos mañana, en `America/Argentina/Buenos_Aires`, configurable con `APP_TIMEZONE` | R6 |
| D2 · ¿Los usuarios que no son ADMIN ven documentos `ARCHIVED`? | No: ya ahora se filtra `status = ACTIVE` para ellos | R10 |
| D3 · `limit > 100`: ¿400 o se ajusta a 100? | 400 | R13 |
| D4 · ¿Se acepta `description` en la carga? | Sí, opcional y de hasta 1000 caracteres | R4 |
| D5 · ¿`@CurrentUser()` trae las áreas del usuario? | No se depende de eso: se piden a `UsersDirectory` | R5, R10 |
| D6 · ¿S3 local para desarrollo o el bucket real? | El bucket real de desarrollo, con `InMemoryFileStorage` para los tests. MinIO queda opcional mediante `S3_ENDPOINT`, sin tocar el código | R12 |
| D7 · `PrismaService`, el prefijo `/api`, `ValidationPipe` y Swagger | Son de otra pareja y el plan asume que existen. Si al implementar no existen, se crean en una tarea separada y se avisa al equipo | — |
| D8 · Nombres de archivo con tildes (multer puede leer `originalname` como latin1) | Se cubre con un test. Si pasa, se usa la opción `defParamCharset: 'utf8'` de multer o se convierte el nombre de latin1 a UTF-8 antes de guardarlo | R9 |
| D9 · Simplificaciones del MVP | Sin advisory lock ni test de concurrencia para duplicados; sin CHECK en la base; el índice de una sola versión `CURRENT` queda para HU16; `S3FileStorage` se verifica a mano | R8b, R7 |
| D10 · ¿Cómo se escriben y prueban los servicios si todavía no existe `PrismaService`? | `DocumentsRepository` pasa a ser un puerto (clase abstracta) con `runInTransaction(fn)`, y los servicios se prueban con mocks. La implementación con Prisma (`PrismaDocumentsRepository`) queda bloqueada hasta que exista `PrismaService` (5.6). Tomada al dividir las tareas | R7, R8, R8b, R13 |
| D11 · ¿Qué variable de entorno indica el bucket? El plan proponía `S3_DOCUMENTS_BUCKET`, pero `.env.example` ya tenía `S3_BUCKET` | Se reutiliza `S3_BUCKET`, sin agregar una variable nueva: es el mismo bucket privado que lee el worker de Guille, y nuestros objetos ya se separan por el prefijo `documents/` (sección 6). Dos nombres para el mismo bucket se desincronizarían. Tomada al implementar T07 | R9, R12 |
| D12 · ¿Quién pone el timeout del encolado (paso 5c)? | El adaptador real de la cola, el de Guille (`ProcessingServiceQueueAdapter`, 5.2), no `DocumentUploadService`. El límite general lo da el timeout corto de `runInTransaction` (D10, T18). Si el encolado vence, el adaptador lanza `QueueUnavailableError`, así la carga responde 503 y se deshace todo. Se suma a A3. Tomada al implementar T15 | R7, R8 |
| D13 · ¿Qué responden las consultas (listado, detalle y descarga) si falla una dependencia? | Lo mismo que la carga: el mapeo de errores de la sección 4 se mueve a `src/documents/http-errors.ts` y lo usan los dos servicios. `StorageUnavailableError`, `QueueUnavailableError` y `RepositoryUnavailableError` dan 503; cualquier otro error inesperado, 500; en los dos casos con mensaje genérico y la causa en el log. El 404 de R11 pasa sin cambios. Las implementaciones reales de `AreasDirectory` y `UsersDirectory` (5.3) traducen sus fallos de conexión a `RepositoryUnavailableError`. Tomada después de T17 | R8, R10, R11, R12, R13 |

## 10. Preguntas abiertas

Dependen de otras personas.

| # | Pregunta | Con quién | Propuesta |
| --- | --- | --- | --- |
| A1 | ¿Quién es dueño de la auditoría (R14)? ¿Va a haber una tabla `audit_logs` común? ¿Se auditan también los 401, 403 y 413? | Equipo | Que la defina la pareja de seguridad o administración como servicio común. Mientras tanto usamos el puerto `AuditLog` con `LoggerAuditLog`. Si nadie la toma, la agregamos nosotros (`actorId`, `action`, `entityId`, `result`, `detail`, `createdAt`). Los 401, 403 y 413 los audita, si hace falta, un interceptor global, no esta feature. Nota: la implementación real de `AuditLog` tiene que traducir sus fallos de base a `RepositoryUnavailableError` (o a un error propio equivalente que la carga reconozca) para responder 503; si no, un fallo de la auditoría responde 500 |
| A2 | ¿`Chunk` entra en nuestra migración? | Guille | No: lo agrega Guille en su migración cuando defina la dimensión del vector (M8), junto con `CREATE EXTENSION`, HNSW y FTS. Ahí se agrega también `chunks Chunk[]` en `DocumentVersion` |
| A3 | El worker tiene que soportar un trabajo cuya versión no existe (sección 4) | Guille | Usar `jobId = documentVersionId`, así encolar dos veces lo mismo no crea dos trabajos. Si no encuentra la versión, que reintente con backoff y después descarte el trabajo sin error. Además (D12): el adaptador de la cola tiene que tener un timeout propio y traducir el vencimiento a `QueueUnavailableError`; si el encolado vence pero el trabajo igual llega a la cola, es este mismo caso de una versión que no existe. Se avisa junto con los puntos spec P1 y spec P4 |
