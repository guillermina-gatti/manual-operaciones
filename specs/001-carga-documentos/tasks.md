# Tareas 001 · Carga y consulta de documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** T01 a T17 se pueden hacer ya. T18 a T21 están **BLOQUEADAS** por piezas compartidas que todavía no existen. T22 es la verificación final.

Convenciones:

- Una tarea = un commit. Las rutas son relativas a `apps/api/`.
- R1 a R14 son reglas de la spec; D1 a D12, decisiones del plan; M1 a M11, correcciones del modelo (plan 2.4).
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- Tests unitarios: `pnpm --filter api test <patrón>`. Tests de integración: `pnpm --filter api test:e2e <patrón>`.

### Repositorio de documentos

Según D10 (plan 5.6), `DocumentsRepository` es un puerto con `runInTransaction(fn)`: el contrato se escribe en T11 y los servicios se prueban con mocks. La implementación con Prisma, `PrismaDocumentsRepository`, es T18 y está bloqueada hasta que exista `PrismaService`.

---

## Tareas sin dependencias externas

### T01 · Instalar dependencias nuevas

- **Qué hace:** agrega `@aws-sdk/s3-request-presigner` (con la misma versión que `@aws-sdk/client-s3`) y `@types/multer` como dependencia de desarrollo.
- **Cubre:** plan sección 7; R12 (URL firmada); D6.
- **Archivos:** `package.json`, `pnpm-lock.yaml` (en la raíz del monorepo).
- **Verificación:** `pnpm --filter api add @aws-sdk/s3-request-presigner@<versión de client-s3>` y `pnpm --filter api add -D @types/multer`; después `pnpm --filter api build` y `pnpm --filter api test` siguen pasando. Revisar en `package.json` que las dos versiones de `@aws-sdk/*` coinciden.
- **Depende de:** —
- **Commit:** `chore(deps): agregar presigner de S3 y tipos de multer`

### T02 · Modelos de Prisma y migración `add_documents`

- **Qué hace:** agrega a `schema.prisma` los enums `DocumentStatus`, `DocumentVersionStatus` y `ProcessingStatus` y los modelos `Document`, `DocumentArea` y `DocumentVersion`, partiendo de `modelo-propuesto.prisma` con las correcciones del plan, y genera la migración.
- **Cubre:** R4 (`reviewDate` obligatoria, M1), R7 (estados), R8b (`@@index([checksum])`, M3), R9 (`storageKey @unique`, M2 y M6), R13 (`@@index([createdAt])`), D4 (`description` opcional, M7), M10 (`@db.Timestamptz(3)`). Sin `Chunk` ni la relación `chunks` (A2). Sin relaciones ni claves foráneas hacia usuarios y áreas (plan 2.1). Sin SQL manual (plan 2.2).
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_documents/migration.sql` (generado).
- **Verificación:** con `docker compose up -d`: `pnpm --filter api exec prisma validate`, `pnpm --filter api exec prisma migrate dev --name add_documents` y `pnpm --filter api build`. Revisar en el `migration.sql` generado: `review_date DATE NOT NULL`, índice único en `storage_key`, índices en `checksum` y `created_at`, columnas `TIMESTAMPTZ(3)`, ninguna `FOREIGN KEY` hacia tablas de usuarios o áreas, ningún `CREATE EXTENSION`.
- **Depende de:** —
- **Commit:** `feat(documents): agregar modelos y migración de documentos`

### T03 · `FileInspector`

- **Qué hace:** función pura que recibe `buffer` y `originalname` y devuelve `{ kind, mimeType, extension, sizeBytes, checksum }`, o lanza 400 (sin archivo o 0 bytes) o 415 (extensión no aceptada o contenido que no coincide). Ignora el `mimetype` del navegador.
- **Cubre:** R2, R3 (archivo vacío; el 413 lo da multer en T19), paso 3b del plan, SHA-256 para R8b.
- **Archivos:** `src/documents/file-inspector.ts`, `src/documents/file-inspector.spec.ts`.
- **Verificación (test primero):** `file-inspector.spec.ts` con: **extensión falsa** (`manual.pdf` sin `%PDF-` → 415); PDF válido → `kind: 'pdf'`, `mimeType: 'application/pdf'`; **carga de Markdown** (`guia.md` en UTF-8 válido → `kind: 'md'`); `.txt` válido; `.txt` con `\0` → 415; `.txt` con UTF-8 inválido → 415; `.docx` → 415; sin extensión → 415; archivo `undefined` → 400; buffer vacío → 400; `MANUAL.PDF` (extensión en mayúsculas) se acepta; `checksum` igual al SHA-256 conocido de un buffer fijo, en hexadecimal y minúsculas. `pnpm --filter api test file-inspector`.
- **Depende de:** —
- **Commit:** `feat(documents): agregar inspector de archivos`

### T04 · Simulación de autenticación

- **Qué hace:** crea `src/common/auth/index.ts`, que exporta `Role`, `AuthUser`, `JwtAuthGuard` simulado (lee `x-user-id` y `x-user-role`, 401 si faltan o el rol no es válido, error al construirse si `NODE_ENV === 'production'`), `RolesGuard`, `@Roles()` y `@CurrentUser()`.
- **Cubre:** R1 (401 y 403), plan 5.1. Las áreas del usuario no se leen de acá (D5).
- **Archivos:** `src/common/auth/index.ts`, `src/common/auth/index.spec.ts`.
- **Verificación (test primero):** `index.spec.ts` con un `ExecutionContext` armado a mano: sin cabeceras → `UnauthorizedException`; rol inválido → 401; con cabeceras → `request.user = { id, role }`; `RolesGuard` con `@Roles('ADMIN')` y un EMPLOYEE → `ForbiddenException`; con ADMIN → pasa; con `NODE_ENV = 'production'` el guard lanza. `pnpm --filter api test common/auth`.
- **Depende de:** —
- **Commit:** `feat(auth): agregar simulación de guards y decoradores de autenticación`

### T05 · `DocumentAccessPolicy`

- **Qué hace:** funciones puras `canView(viewer, document)`, `listWhere(viewer)` (el `where` de Prisma para el listado) y `canBeOwner(owner, areaIds)`.
- **Cubre:** R5 (responsable), R10 (visibilidad), D2 (quien no es ADMIN solo ve `ACTIVE`), D5 (las áreas del usuario llegan como parámetro).
- **Archivos:** `src/documents/document-access.policy.ts`, `src/documents/document-access.policy.spec.ts`.
- **Verificación (test primero):** `document-access.policy.spec.ts`: ADMIN ve un documento `ARCHIVED` sin áreas en común; EMPLOYEE de Ventas ve un `ACTIVE` de Ventas y Operaciones; EMPLOYEE de Ventas no ve uno de Operaciones; EMPLOYEE de Ventas no ve uno `ARCHIVED` de Ventas; `listWhere(admin)` no filtra; `listWhere(empleado)` filtra por `status: 'ACTIVE'` y `areas: { some: { areaId: { in: [...] } } }`; **responsable sin acceso** (EMPLOYEE solo de Operaciones para un documento de Ventas → `false`); responsable ADMIN sin áreas → `true`; responsable SUPERVISOR de un área compartida → `true`. `pnpm --filter api test document-access`.
- **Depende de:** T02 (tipo `DocumentWhereInput` del cliente generado), T04 (`Role`).
- **Commit:** `feat(documents): agregar política de acceso a documentos`

### T06 · Puerto `FileStorage` e `InMemoryFileStorage`

- **Qué hace:** define la clase abstracta `FileStorage` (`put(key, buffer, contentType, checksum)`, `delete(key)`, `getDownloadUrl(key, fileName)` → `{ url, expiresAt }`), el error `StorageUnavailableError`, la constante de 300 s y la implementación en memoria, que se puede configurar para fallar en cada método y guarda qué enlaces generó.
- **Cubre:** R8 (error traducido para el 503), R9 (la clave la da quien llama), R12 (vencimiento de 300 s), plan 5.5.
- **Archivos:** `src/storage/file-storage.ts`, `src/storage/in-memory-file-storage.ts`, `src/storage/in-memory-file-storage.spec.ts`.
- **Verificación (test primero):** `in-memory-file-storage.spec.ts`: `put` y después `has(key)`; `delete` lo quita; `getDownloadUrl` devuelve `expiresAt` = ahora + 300 s (con `jest.useFakeTimers().setSystemTime`) y queda registrado en `generatedLinks`; configurada para fallar, `put` lanza `StorageUnavailableError`. `pnpm --filter api test in-memory-file-storage`.
- **Depende de:** —
- **Commit:** `feat(storage): agregar puerto de almacenamiento y simulación en memoria`

### T07 · `S3FileStorage`, `StorageModule` y variables de entorno

- **Qué hace:** implementa `S3FileStorage` (`PutObjectCommand` con `ContentType`, `ContentLength` y `ChecksumSHA256` en base64; `DeleteObjectCommand`; `getSignedUrl` de `GetObjectCommand` con `ResponseContentDisposition: attachment; filename*=UTF-8''…` y `expiresIn: 300`), traduce los errores del SDK a `StorageUnavailableError`, y crea `StorageModule`: usa S3 si existe `S3_BUCKET` (D11); si no, en desarrollo usa la de memoria y avisa por el log, y en producción falla al arrancar. Valida las variables con `ConfigModule` y las documenta en `.env.example` sin valores.
- **Cubre:** R8, R9, R12, plan sección 6 y 5.5, D6 (`S3_ENDPOINT` y `S3_FORCE_PATH_STYLE` opcionales), spec sección 9 (ningún secreto en el repositorio).
- **Archivos:** `src/storage/s3-file-storage.ts`, `src/storage/storage.module.ts`, `.env.example`; `.gitignore` solo si `.env` no está ignorado.
- **Verificación:** el plan no prevé tests automáticos de `S3FileStorage` (D9). `pnpm --filter api build` y `pnpm --filter api lint` pasan; `git check-ignore apps/api/.env` confirma que `.env` está ignorado; `git grep -nE "AKIA|aws_secret"` no encuentra nada. La verificación contra el bucket real es parte de T22.
- **Depende de:** T01, T06.
- **Commit:** `feat(storage): agregar almacenamiento en S3 y selección por entorno`

### T08 · Puerto `ProcessingQueue` y `FakeProcessingQueue`

- **Qué hace:** define `ProcessingQueue.enqueue(documentVersionId)` y `QueueUnavailableError`; la simulación registra el aviso en el log, guarda los ids en memoria y se puede configurar para fallar.
- **Cubre:** R7 (encolado), R8 (falla del encolado → 503), plan 5.2.
- **Archivos:** `src/documents/ports/processing-queue.ts`, `src/documents/adapters/fake-processing-queue.ts`, `src/documents/adapters/fake-processing-queue.spec.ts`.
- **Verificación (test primero):** `fake-processing-queue.spec.ts`: `enqueue('v1')` deja `'v1'` en `enqueued`; con `failNext()` (o equivalente) lanza `QueueUnavailableError` y no guarda nada. `pnpm --filter api test fake-processing-queue`.
- **Depende de:** —
- **Commit:** `feat(documents): agregar puerto de cola de procesamiento y simulación`

### T09 · Puertos `AreasDirectory` y `UsersDirectory` con simulaciones

- **Qué hace:** define `AreasDirectory.findExistingIds(ids)` y `UsersDirectory.findById(id)` → `{ id, role, areaIds } | null`; implementaciones en memoria y `fixtures.ts` con Ventas, Operaciones, un ADMIN, y un SUPERVISOR y un EMPLOYEE por área, con UUID estables.
- **Cubre:** R5 (referencias), R10 (áreas del usuario actual), D5, plan 5.3.
- **Archivos:** `src/documents/ports/areas-directory.ts`, `src/documents/ports/users-directory.ts`, `src/documents/adapters/in-memory-areas-directory.ts`, `src/documents/adapters/in-memory-users-directory.ts`, `src/documents/adapters/fixtures.ts`, `src/documents/adapters/in-memory-directories.spec.ts`.
- **Verificación (test primero):** `in-memory-directories.spec.ts`: `findExistingIds([ventas, inexistente])` devuelve solo `[ventas]`; `findById` de un fixture devuelve sus áreas; de un id desconocido, `null`; se puede construir con datos propios del test. `pnpm --filter api test in-memory-directories`.
- **Depende de:** T04 (`Role`).
- **Commit:** `feat(documents): agregar directorios de áreas y usuarios simulados`

### T10 · Puerto `AuditLog` y `LoggerAuditLog`

- **Qué hace:** define `AuditLog.record(entry, tx?)` con `{ action, actorId, documentId?, result: 'SUCCESS' | 'FAILURE', detail?, at }`; la simulación escribe en el `Logger` de Nest en formato estructurado.
- **Cubre:** R14, M5, plan 5.4 (el dueño real queda en A1).
- **Archivos:** `src/documents/ports/audit-log.ts`, `src/documents/adapters/logger-audit-log.ts`, `src/documents/adapters/logger-audit-log.spec.ts`.
- **Verificación (test primero):** `logger-audit-log.spec.ts`: con un `Logger` espiado, `record(...)` lo llama una vez con un objeto que contiene `action`, `actorId`, `documentId`, `result` y `at`. `pnpm --filter api test logger-audit-log`.
- **Depende de:** —
- **Commit:** `feat(documents): agregar puerto de auditoría y simulación por log`

### T11 · Contrato de `DocumentsRepository`

- **Qué hace:** clase abstracta con `findActiveByChecksum(checksum)` → `{ documentId } | null`, `runInTransaction(fn)`, `createWithFirstVersion(tx, data)`, `list(where, page, limit)` → `{ data, total }` y `findByIdWithAreas(id)`, y los tipos de entrada y salida (D10, plan 5.6).
- **Cubre:** plan sección 1 (repositorio), D10, R7, R8, R8b, R13.
- **Archivos:** `src/documents/documents.repository.ts`.
- **Verificación:** solo tipos, sin lógica: `pnpm --filter api build` y `pnpm --filter api lint`. Lo prueban T14 a T16 (con mocks) y T18 (contra la base).
- **Depende de:** T02.
- **Commit:** `feat(documents): agregar contrato del repositorio de documentos`

### T12 · DTOs de entrada: `CreateDocumentDto` y `ListDocumentsQuery`

- **Qué hace:** `CreateDocumentDto` con `title` (se recorta y queda de 1 a 200), `areaIds` (UUID, uno o más; un valor suelto pasa a arreglo y se quitan los repetidos), `ownerId` (UUID), `reviewDate` (`YYYY-MM-DD`, fecha real) y `description` opcional (hasta 1000). `ListDocumentsQuery` con `page` (entero ≥ 1, por defecto 1) y `limit` (entero de 1 a 100, por defecto 20). Con `@ApiProperty` para Swagger.
- **Cubre:** R4, R13, D3 (`limit = 101` → error), D4, plan 3.1 y 3.2.
- **Archivos:** `src/documents/dto/create-document.dto.ts`, `src/documents/dto/list-documents.query.ts`, `src/documents/dto/create-document.dto.spec.ts`, `src/documents/dto/list-documents.query.spec.ts`.
- **Verificación (test primero):** con `plainToInstance` + `validate` (las mismas opciones que el `ValidationPipe` del plan): título `"  Manual  "` queda `"Manual"`; título de solo espacios falla; 201 caracteres falla; 200 pasa; `areaIds` vacío falla; `areaIds: 'uuid'` pasa a `['uuid']`; repetidos se eliminan; un área que no es UUID falla; `reviewDate: '2027-02-30'` y `'01/03/2027'` fallan; `description` de 1001 falla; campo extra falla (`forbidNonWhitelisted`); query vacía → `page 1`, `limit 20`; `limit=101`, `limit=0`, `page=0` y `page=abc` fallan. Cada error indica el campo. `pnpm --filter api test dto`.
- **Depende de:** —
- **Commit:** `feat(documents): agregar DTOs de carga y listado`

### T13 · DTO de respuesta y su mapeo

- **Qué hace:** `DocumentResponse` (con `currentVersion`) y `DocumentSummary`, más la función que convierte la entidad del repositorio a la respuesta: `reviewDate` como `YYYY-MM-DD` y sin `storageKey` ni `checksum`. Con `@ApiProperty`.
- **Cubre:** R7 (forma del 201), plan 3.1 a 3.3.
- **Archivos:** `src/documents/dto/document.response.ts`, `src/documents/dto/document.response.spec.ts`.
- **Verificación (test primero):** `document.response.spec.ts`: a partir de una entidad de ejemplo, la respuesta tiene exactamente las claves del JSON de plan 3.1, `reviewDate === '2027-03-01'`, `description: null` cuando no hay, y no aparecen `storageKey` ni `checksum`. `pnpm --filter api test document.response`.
- **Depende de:** T11.
- **Commit:** `feat(documents): agregar respuesta de documento`

### T14 · `DocumentUploadService`: validaciones previas a escribir

- **Qué hace:** primera parte de `upload(file, dto, actor)`: pasos 3b a 3f del plan. Inspecciona el archivo, compara `reviewDate` con hoy en `APP_TIMEZONE` (por defecto `America/Argentina/Buenos_Aires`), verifica áreas y responsable y revisa duplicados. Si algo falla, lanza la excepción de Nest correspondiente sin escribir nada.
- **Cubre:** R2, R3, R5, R6, R8b, D1; casos borde "el admin no pertenece al área" y "nombre original con rutas" (no se usa).
- **Archivos:** `src/documents/document-upload.service.ts`, `src/documents/document-upload.service.spec.ts`.
- **Verificación (test primero):** con todos los puertos y el repositorio como `jest.fn()` y el reloj fijado con `jest.useFakeTimers().setSystemTime`: **área inexistente** → 400 que nombra el área; **responsable sin acceso** → 400; responsable inexistente → 400; `reviewDate` de hoy → 400; de ayer → 400; de mañana → pasa; a las 23:30 de Buenos Aires (02:30 UTC del día siguiente) la fecha de "mañana" se calcula en Buenos Aires; **duplicado** → `ConflictException` con `existingDocumentId`; **extensión falsa** → 415; área en la que el ADMIN no está → se permite. En todos los rechazos, `FileStorage.put` y `runInTransaction` no se llaman. `pnpm --filter api test document-upload`.
- **Depende de:** T03, T05, T06, T09, T11, T12.
- **Commit:** `feat(documents): validar archivo, fecha y referencias en la carga`

### T15 · `DocumentUploadService`: escritura todo o nada y auditoría

- **Qué hace:** segunda parte de `upload`: pasos 4 a 7 del plan. Genera `documentId` y `versionId`, arma la clave `documents/{documentId}/{versionId}.{ext}`, hace `put`, abre la transacción, inserta, audita `SUCCESS` dentro de la transacción, encola como último paso, y si algo falla después del `put` hace `delete` en un `finally` y responde 503. Registra `FAILURE` con el código fuera de la transacción, también para los rechazos de T14. Recorta `originalFileName` a 255 caracteres.
- **Cubre:** R7, R8, R9, R14, plan sección 4 (orden, compensación, auditoría de fallos, mapeo de errores).
- **Archivos:** `src/documents/document-upload.service.ts`, `src/documents/document-upload.service.spec.ts`.
- **Verificación (test primero):** en el mismo spec: **carga correcta** → orden `put` → `runInTransaction` → `createWithFirstVersion` (con `ACTIVE`, versión 1 `CURRENT`, `PENDING`, `mimeType` detectado, clave con la extensión detectada y sin el nombre original) → `audit.record(SUCCESS, tx)` → `enqueue(versionId)`; devuelve la respuesta de T13. **Falla el almacenamiento** → 503 y no se llama a `runInTransaction`. Falla la base → 503 y `delete(key)`. **Falla el encolado** → 503 y `delete(key)`. Falla también el `delete` → sigue siendo 503 y se registra un error con `key`, `documentId` y la causa. Un rechazo de T14 (409) y un 503 registran `FAILURE` con su código. Nombre original de 300 caracteres → se guardan 255. `pnpm --filter api test document-upload`.
- **Depende de:** T08, T10, T13, T14.
- **Commit:** `feat(documents): guardar la carga con compensación y auditoría`

### T16 · `DocumentQueryService`: listado

- **Qué hace:** `list(user, query)` pide las áreas del usuario a `UsersDirectory`, arma el `where` con `DocumentAccessPolicy.listWhere` y devuelve `{ data, total, page, limit }`.
- **Cubre:** R10, R13, D2, D5.
- **Archivos:** `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`.
- **Verificación (test primero):** con mocks: la consulta por defecto llama a `repository.list` con `page 1` y `limit 20`; para un EMPLOYEE el `where` es el de la política, con sus áreas obtenidas de `UsersDirectory`; para un ADMIN no hay filtro; la respuesta tiene la forma `{ data, total, page, limit }` con `data` mapeado por T13. `pnpm --filter api test document-query`.
- **Depende de:** T05, T09, T11, T13.
- **Commit:** `feat(documents): agregar listado de documentos visibles`

### T17 · `DocumentQueryService`: detalle y descarga

- **Qué hace:** `findOne(user, id)` y `getDownloadUrl(user, id)`. Si el documento no existe o no es visible, lanzan el mismo `NotFoundException`. La descarga pide el enlace a `FileStorage` solo después de comprobar la visibilidad, para cualquier `processingStatus`.
- **Cubre:** R10, R11, R12, spec P5.
- **Archivos:** `src/documents/document-query.service.ts`, `src/documents/document-query.service.spec.ts`.
- **Verificación (test primero):** **documento de otra área** → 404 en detalle y en descarga, y `getDownloadUrl` del almacenamiento **nunca** se llama; documento inexistente → el mismo 404, con el mismo mensaje; **descarga permitida** con `PENDING` → devuelve `{ url, expiresAt }`; también con `FAILED`; ADMIN descarga un `ARCHIVED`. `pnpm --filter api test document-query`.
- **Depende de:** T06, T16.
- **Commit:** `feat(documents): agregar detalle y descarga de documentos`

---

## Tareas BLOQUEADAS

Estas tareas necesitan piezas compartidas que hoy no existen en `apps/api` (`main.ts` y `AppModule` están recién generados). Según D7, las entrega otra pareja; si no llegan, se crean en una tarea separada, fuera de esta lista, y se avisa al equipo.

| Pieza que falta | La necesitan |
| --- | --- |
| `PrismaService` global | T18, T19, T20, T21 |
| Prefijo `/api` en `main.ts` | T19, T20, T21 |
| `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) | T19, T20, T21 |
| Swagger configurado (`SwaggerModule`) | T19, T20 |

### T18 · BLOQUEADA · `PrismaDocumentsRepository`

- **Motivo del bloqueo:** se inyecta el `PrismaService` compartido, que no existe.
- **Qué hace:** implementa el contrato de T11 con Prisma: `findActiveByChecksum` (versión `CURRENT` de un documento `ACTIVE`), `runInTransaction` (`$transaction` con timeout corto), `createWithFirstVersion` (documento, áreas y versión en el `tx`), `list` (`findMany` + `count` en un `$transaction`, orden `createdAt desc, id desc`) y `findByIdWithAreas`. Traduce los fallos de conexión y de timeout de Prisma (también el timeout de la transacción) a `RepositoryUnavailableError`; los demás errores no se traducen.
- **Cubre:** R7, R8b (con archivados permitidos), R13 (orden y total), plan 2.3 y 3.2.
- **Archivos:** `src/documents/prisma-documents.repository.ts`, `test/documents/documents.repository.e2e-spec.ts`.
- **Verificación (test primero):** contra la base de tests (`DATABASE_URL` de tests y `prisma migrate reset --force` antes de la suite): `createWithFirstVersion` deja las filas de plan 2.3; `findActiveByChecksum` encuentra un `ACTIVE` y devuelve `null` si está `ARCHIVED`; `list` ordena del más nuevo al más viejo, desempata por `id` y `total` respeta el `where`; un error dentro de `runInTransaction` no deja filas; una transacción que supera el timeout rechaza con `RepositoryUnavailableError`, y un error que no es de conexión ni de timeout (por ejemplo, una violación de unicidad) se propaga sin traducir. `pnpm --filter api test:e2e documents.repository`.
- **Depende de:** T02, T11; `PrismaService`.
- **Commit:** `feat(documents): agregar repositorio de documentos con Prisma`

### T19 · BLOQUEADA · `DocumentsModule` y `POST /api/documents`

- **Motivo del bloqueo:** el módulo resuelve el repositorio con T18 (`PrismaService`); la ruta depende del prefijo `/api`; la validación del DTO, del `ValidationPipe` global; y los decoradores de Swagger solo se pueden revisar con Swagger configurado.
- **Qué hace:** crea `DocumentsModule` (importa `StorageModule` y elige cada puerto: `FakeProcessingQueue`, directorios en memoria, `LoggerAuditLog`, `PrismaDocumentsRepository`), lo registra en `AppModule`, y crea `DocumentsController` con la carga: `JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`, `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 MB, files: 1 } })`, Swagger (`@ApiTags`, `@ApiBearerAuth`, `@ApiConsumes('multipart/form-data')`, `@ApiResponse` por código). Sin lógica: llama a `DocumentUploadService.upload`. También el arnés de integración: crear la app, reemplazar el guard (`overrideGuard`) y los puertos por simulaciones configurables, y limpiar la base entre tests.
- **Cubre:** R1, R3 (413 por multer), R7, plan 3.1 y paso 1 a 2 del plan 4, spec sección 9 (Swagger).
- **Archivos:** `src/documents/documents.module.ts`, `src/documents/documents.controller.ts`, `src/app.module.ts`, `test/documents/helpers.ts`, `test/documents/upload.e2e-spec.ts`.
- **Verificación (test primero):** `upload.e2e-spec.ts`: **rol sin permiso** (EMPLOYEE → 403) y sin cabeceras → 401, en los dos casos sin filas ni objetos; **carga correcta** (PDF de 2 MB, Ventas, responsable válido, fecha futura) → 201 con la forma de plan 3.1, filas de plan 2.3 en la base, objeto en el almacenamiento simulado, `versionId` en la cola simulada y auditoría `SUCCESS` registrada. `pnpm --filter api test:e2e upload`. Revisar que el endpoint aparezca en `/api/docs` (o la ruta que use la otra pareja).
- **Depende de:** T04, T07, T08, T09, T10, T15, T18; `PrismaService`, prefijo `/api`, `ValidationPipe`, Swagger.
- **Commit:** `feat(documents): agregar endpoint de carga de documentos`

### T20 · BLOQUEADA · Endpoints de consulta

- **Motivo del bloqueo:** igual que T19 (módulo con `PrismaService`, `/api`, `ValidationPipe` para `ListDocumentsQuery`, Swagger).
- **Qué hace:** agrega al controlador `GET /api/documents`, `GET /api/documents/:id` y `GET /api/documents/:id/download`, con `JwtAuthGuard`, `ParseUUIDPipe` y Swagger. Sin lógica: llaman a `DocumentQueryService`.
- **Cubre:** R10, R11, R12, R13, D2, D3, plan 3.2 a 3.4.
- **Archivos:** `src/documents/documents.controller.ts`, `test/documents/query.e2e-spec.ts`.
- **Verificación (test primero):** `query.e2e-spec.ts`: **listado filtrado por área** (EMPLOYEE de Ventas recibe solo el de Ventas, `total = 1`); paginación (`page=2&limit=1`), orden del más nuevo al más viejo y `limit=101` → 400; un EMPLOYEE no ve un `ARCHIVED` de su área; **documento de otra área** → 404 en detalle y en descarga, y el almacenamiento simulado no generó ningún enlace; id que no es UUID → 400; **descarga permitida** con `PENDING` → `url` y `expiresAt` unos 300 s después de ahora; sin cabeceras → 401. `pnpm --filter api test:e2e query`.
- **Depende de:** T17, T19.
- **Commit:** `feat(documents): agregar endpoints de listado, detalle y descarga`

### T21 · BLOQUEADA · Escenarios de carga restantes y nombres con tildes

- **Motivo del bloqueo:** necesita la app de T19 corriendo contra PostgreSQL con `PrismaService`, `/api` y `ValidationPipe`.
- **Qué hace:** completa los escenarios de carga de la spec en integración. La lógica ya está en T14 y T15, así que estos tests **deberían pasar al escribirlos** (son de regresión); el que puede fallar es el de tildes (D8), que es el que justifica el cambio: `defParamCharset: 'utf8'` en el `FileInterceptor` o convertir el nombre de latin1 a UTF-8.
- **Cubre:** R2, R3, R5, R8, R8b, R9, D8; casos borde de spec sección 8.
- **Archivos:** `test/documents/upload.e2e-spec.ts`; `src/documents/documents.controller.ts` (o el servicio) solo si falla el test de D8.
- **Verificación:** agregar a `upload.e2e-spec.ts`, cada uno comprobando que no quedan filas ni objetos nuevos cuando corresponde: **extensión falsa** → 415; **archivo demasiado grande** (11 MB) → 413; **archivo duplicado** → 409 con `existingDocumentId`; duplicado de un documento `ARCHIVED` (insertado directo en la base) → 201; **carga de Markdown** → 201; **responsable sin acceso** → 400; **área inexistente** → 400; campo faltante → 400 que nombra el campo; **falla el almacenamiento** → 503 sin filas; **falla el encolado** → 503, sin filas y sin el objeto; `originalname` `../../x.pdf` → la clave guardada no lo contiene; `Instrucción técnica.pdf` → `originalFileName` se guarda con tildes. Primero se escribe el de tildes y se corre: si falla, se hace el cambio. `pnpm --filter api test:e2e upload`.
- **Depende de:** T19.
- **Commit:** `test(documents): cubrir escenarios de carga y nombres con tildes`

---

## Verificación final

### T22 · Verificación de la feature

- **Qué hace:** corre todos los tests, confirma que cada escenario de la spec tiene su test (tabla de abajo, se marca cada fila), y hace la verificación manual con S3 del plan 8.3. Si se hace antes de que se desbloqueen T18 a T21, los escenarios que solo tienen test de integración quedan marcados como pendientes.
- **Cubre:** spec sección 11 completa; plan 8.3.
- **Archivos:** `specs/001-carga-documentos/tasks.md` (se marca la tabla y se anota el resultado de la verificación manual).
- **Verificación:**
  1. `pnpm --filter api lint`, `pnpm --filter api build`, `pnpm --filter api test` y `pnpm --filter api test:e2e`: todo en verde.
  2. Revisar la tabla escenario → test: cada fila tiene al menos un test que existe y pasa.
  3. Con la API levantada contra el bucket de desarrollo (`S3_BUCKET` definida, credenciales solo en `.env` local):
     1. Cargar un PDF y comprobar en S3 que el objeto está en `documents/{documentId}/{versionId}.pdf` con `ContentType: application/pdf`.
     2. Pedir la descarga, abrir la `url` y comprobar que el archivo baja con su nombre original.
     3. Pasados 5 minutos, abrir la misma `url` y comprobar que S3 la rechaza.
     4. Con `FakeProcessingQueue` configurada para fallar, cargar un documento: 503, y el objeto no quedó en el bucket.
- **Depende de:** T01 a T21 (con T18 a T21 desbloqueadas para cerrarla del todo).
- **Commit:** `docs(specs): registrar verificación de carga y consulta de documentos`

#### Escenario → test

| Escenario de la spec | Test unitario | Test de integración | ✔ |
| --- | --- | --- | --- |
| Carga correcta | `document-upload.service.spec.ts` (T15) | `upload.e2e-spec.ts` (T19) | ☐ |
| Rol sin permiso | `common/auth/index.spec.ts` (T04) | `upload.e2e-spec.ts` (T19) | ☐ |
| Extensión falsa | `file-inspector.spec.ts` (T03) | `upload.e2e-spec.ts` (T21) | ☐ |
| Archivo demasiado grande | — (lo corta multer) | `upload.e2e-spec.ts` (T21) | ☐ |
| Archivo duplicado | `document-upload.service.spec.ts` (T14) | `upload.e2e-spec.ts` (T21), `documents.repository.e2e-spec.ts` (T18) | ☐ |
| Carga de Markdown | `file-inspector.spec.ts` (T03) | `upload.e2e-spec.ts` (T21) | ☐ |
| Responsable sin acceso | `document-access.policy.spec.ts` (T05), `document-upload.service.spec.ts` (T14) | `upload.e2e-spec.ts` (T21) | ☐ |
| Área inexistente | `document-upload.service.spec.ts` (T14) | `upload.e2e-spec.ts` (T21) | ☐ |
| Falla el almacenamiento | `document-upload.service.spec.ts` (T15) | `upload.e2e-spec.ts` (T21) | ☐ |
| Listado filtrado por área | `document-access.policy.spec.ts` (T05), `document-query.service.spec.ts` (T16) | `query.e2e-spec.ts` (T20) | ☐ |
| Documento de otra área | `document-query.service.spec.ts` (T17) | `query.e2e-spec.ts` (T20) | ☐ |
| Falla el encolado | `document-upload.service.spec.ts` (T15) | `upload.e2e-spec.ts` (T21); manual 8.3.4 (T22) | ☐ |
| Descarga permitida | `document-query.service.spec.ts` (T17) | `query.e2e-spec.ts` (T20); manual 8.3.2 y 8.3.3 (T22) | ☐ |

Reglas sin escenario propio en la spec, para no perderlas de vista: R4 (T12, T21), R6 (T14), R9 (T15, T21, manual 8.3.1), R13 (T12, T16, T18, T20), R14 (T10, T15, T19).

---

## Orden y dependencias

```
T01 ─┐
     └─ T07 ◄─ T06
T02 ─┬─ T05 ◄─ T04 ─ T09
     └─ T11 ─ T13
T03, T08, T10, T12 (sueltas)

T14 ◄─ T03, T05, T06, T09, T11, T12
T15 ◄─ T08, T10, T13, T14
T16 ◄─ T05, T09, T11, T13
T17 ◄─ T06, T16

BLOQUEADAS: T18 ◄─ T02, T11 · T19 ◄─ T15, T18, T07 · T20 ◄─ T17, T19 · T21 ◄─ T19
T22 ◄─ todas
```
