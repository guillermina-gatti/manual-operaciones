# Plan 006 · Procedimientos: borradores, áreas y visibilidad

- **Spec:** [spec.md](./spec.md) (HU09, HU10, HU11 y los adjuntos de los pasos)
- **Planes de referencia:** [plan 003](../003-ciclo-de-vida-documentos/plan.md) (versiones, índice parcial, repositorio con transacción) y el módulo `apps/api/src/executions` de Mayra (puertos, política, errores, tests)
- **Responsable:** Micaela Franco (pareja B)
- **Estado:** borrador para revisión (27/10/2026). Sin código ni cambios de esquema todavía.

En este plan, R1 a R23 son las reglas de la spec; P1 a P17, sus decisiones (sección 10); E1 a E34, sus escenarios (sección 12, en orden); y D1 a D14, las decisiones de este plan (sección 6). Las reglas de otras specs se citan con su número ("R12 de la spec 003").

| # | Escenario | # | Escenario | # | Escenario |
| --- | --- | --- | --- | --- | --- |
| E1 | Crear un procedimiento | E13 | Borrar el único borrador | E25 | Falla el directorio |
| E2 | Rol sin permiso o sin sesión | E14 | Borrar un borrador de uno publicado | E26 | Paginación inválida |
| E3 | Datos inválidos | E15 | Borrar una versión publicada | E27 | Versiones solo para el ADMIN |
| E4 | Agregar pasos | E16 | Borradores simultáneos | E28 | Adjuntar un archivo |
| E5 | Agregar un paso en una posición | E17 | Asignar áreas | E29 | Archivo inválido |
| E6 | Borrar un paso | E18 | Áreas inválidas | E30 | Falla el almacenamiento |
| E7 | Reordenar | E19 | Mover de área | E31 | Ver y descargar un adjunto |
| E8 | Reordenar con una lista incorrecta | E20 | El empleado ve solo sus áreas | E32 | Borrar un adjunto |
| E9 | Editar el borrador | E21 | Procedimiento de otra área | E33 | Herencia de adjuntos |
| E10 | Segundo borrador | E22 | Sin borradores, reemplazadas ni publicadas sin pasos | E34 | Límite de adjuntos |
| E11 | Borrador nuevo desde la vigente | E23 | El ADMIN ve todo | | |
| E12 | Editar una versión publicada | E24 | Usuario sin áreas | | |

## 0. Punto de partida

Verificado en `develop` (`bd163e7`).

**API (`apps/api/src`)**

- `common/auth/index.ts`: reexporta el login real de la Pareja A (`src/auth`): `JwtAuthGuard` (exige `Authorization: Bearer`, y lee el usuario y sus áreas activas de la base en cada pedido), `RolesGuard`, `@Roles()`, `@CurrentUser()` y `AuthUser { id, email, name, role, areaIds }`.
- `documents/ports/users-directory.ts` y `areas-directory.ts`, con sus adaptadores Prisma (`PrismaUsersDirectory`, `PrismaAreasDirectory`), que lanzan `RepositoryUnavailableError` si la base no responde.
- `executions/`: el modelo a seguir. Puertos abstractos, política de acceso en funciones puras, servicio con `mapErrors` y `toHttpException`, repositorio con transacción opaca, controlador sin lógica, respuestas campo por campo.
- `executions/ports/procedures-catalog.ts`: el puerto que va a consumir mi adaptador real (HU32).
- `storage/` (`StorageModule`, `FileStorage` con `put`, `delete` y `getDownloadUrl`) y `documents/file-inspector.ts` (`inspectFile`: PDF, `.txt` y `.md`, hasta 10 MB). Solo se usan, no se modifican.
- `app.module.ts` importa `DocumentsModule` y `ExecutionsModule`.

**Base (`apps/api/prisma`)**

- Bloque "EQUIPO B" de Mayra al final del esquema: `Execution` y `ExecutionStep`, que referencian `procedureId`, `procedureVersionId` y `stepId` solo por ID.
- `previewFeatures = ["partialIndexes"]` activo: se puede declarar un índice único parcial en el esquema (como `executions_one_in_progress_idx` y `document_versions_one_current_idx`).
- Migraciones existentes hasta `20261026232335_add_executions`. Los 5 índices de `chunks` los exige `indexes.e2e-spec.ts`.

**Datos de prueba**

- Fixtures de usuarios y áreas con UUID fijos (`documents/adapters/fixtures.ts`) y `seedDirectoryFixtures` (`test/directory-fixtures.ts`). Fixtures de procedimientos de Mayra: "Cierre de caja" `1a000000-0000-4000-8000-000000000001` (Ventas) y "Recepción de mercadería" `…0002` (Operaciones).

## 1. API

Prefijo `/api`. Todas las rutas con `@UseGuards(JwtAuthGuard, RolesGuard)`. Los pasos (`steps`) y los adjuntos (`attachments`) están siempre dentro de una versión.

| Método y ruta | Rol | Respuesta | Regla |
| --- | --- | --- | --- |
| `POST /procedures` | ADMIN | 201 procedimiento con su versión 1 | R1, R2 |
| `GET /procedures` | todos | 200 `{ data, total, page, limit }` | R13, R15, R16 |
| `GET /procedures/:id` | todos | 200. ADMIN: datos, áreas y lista de versiones. Los demás: la vigente con sus pasos | R13, R14 |
| `PUT /procedures/:id/areas` | ADMIN | 200 con `{ areaIds }` | R11, R12, P18 |
| `POST /procedures/:id/versions` | ADMIN | 201 borrador nuevo | R3, R4 |
| `GET /procedures/:id/versions/:versionId` | ADMIN | 200 con sus pasos | R17 |
| `PATCH /procedures/:id/versions/:versionId` | ADMIN | 200 | R5, R9 |
| `DELETE /procedures/:id/versions/:versionId` | ADMIN | 204 | R10 |
| `POST …/versions/:versionId/steps` | ADMIN | 201 paso (`position` opcional) | R6, R7, R9 |
| `PATCH …/steps/:stepId` | ADMIN | 200 | R6, R9 |
| `DELETE …/steps/:stepId` | ADMIN | 204 | R7, R9 |
| `PUT …/versions/:versionId/steps/order` | ADMIN | 200 pasos en el orden nuevo (`{ stepIds }`) | R8, R9 |
| `POST …/steps/:stepId/attachments` | ADMIN | 201 adjunto (multipart `file`) | R18 a R20 |
| `DELETE …/steps/:stepId/attachments/:attachmentId` | ADMIN | 204 | R22 |
| `GET /procedures/:id/attachments/:attachmentId/download` | todos | 200 `{ url, expiresAt }` | R21 |

Errores: 400 (validación), 401, 403, 404 (mismo mensaje para inexistente y ajeno), 409 con `reason` (`DRAFT_ALREADY_EXISTS`, `NO_PUBLISHED_VERSION`, `VERSION_NOT_EDITABLE`, `STEP_LIMIT_REACHED`, `ATTACHMENT_LIMIT_REACHED`), 413, 415 y 503 (base, directorio o almacenamiento caídos).

## 2. Modelo de datos (propuesta; todavía no se aplica)

Va en el bloque de la pareja B de `schema.prisma`, solo líneas nuevas. Las tablas propias se relacionan entre sí (con `onDelete: Cascade`, como `DocumentArea`); con `users` y `areas` solo por ID.

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `procedures` | `id`, `owner_id`, `created_at`, `updated_at` | El título y la descripción están en la versión (P11) |
| `procedure_versions` | `id`, `procedure_id`, `version_number`, `status` (`DRAFT`, `PUBLISHED`, `SUPERSEDED`), `title`, `description`, `created_by_id`, `created_at`, `updated_at` | `@@unique([procedureId, versionNumber])` e índice único parcial `procedure_versions_one_draft_idx` sobre `procedure_id` donde `status = 'DRAFT'` (R3) |
| `steps` | `id`, `procedure_version_id`, `step_order`, `title`, `description` | `@@unique([procedureVersionId, stepOrder])`. Cada versión tiene sus propias filas (la publicada conserva su copia) |
| `procedure_areas` | `procedure_id`, `area_id` | Clave compuesta. Las áreas son del procedimiento (R11, P17) |
| `step_attachments` (última parte) | `id`, `step_id`, `storage_key`, `original_file_name`, `mime_type`, `size_bytes`, `checksum`, `created_at` | `storage_key` **sin** índice único: una versión nueva comparte el archivo (R23, D12) |

Las fechas son `Timestamptz(3)`; los identificadores, `uuid`. El campo de HU32 "cambio crítico" y la marca de publicación (`published_at`) se agregan en su migración. `executions` y `execution_steps` de Mayra no se tocan.

## 3. Acceso

Funciones puras en `procedure-access.policy.ts`, con tests unitarios, como `document-access.policy.ts` y `execution-access.policy.ts`:

- `canManage(role)`: solo ADMIN (R1).
- `canViewProcedure(viewer, procedure)`: ADMIN siempre; los demás si el procedimiento tiene una versión `PUBLISHED` con al menos un paso y comparten un área (R13).
- `listFilter(viewer)`: el filtro de Prisma para el listado (R13, R16); el repositorio solo lo traduce.

Las áreas se leen de `UsersDirectory` en cada pedido (R15). El ADMIN no las necesita. Para los demás se consulta siempre al directorio, aunque el procedimiento no exista, para que el tiempo de respuesta no revele cuáles existen. Un usuario desconocido para el directorio tiene áreas `[]`. Si el directorio falla, el error se propaga como 503: nunca se lista sin filtro.

## 4. Errores

`procedures/http-errors.ts` (propio) traduce con `toHttpException`: las `HttpException` de negocio (404, 409, 400) pasan tal cual; `ProceduresRepositoryUnavailableError`, `StorageUnavailableError` y `RepositoryUnavailableError` (directorios) son 503; todo lo demás, 500. La causa va al log, nunca a la respuesta. Un solo mensaje de 404 para procedimiento y versión ("No se encontró el procedimiento").

## 5. Estructura de archivos

```
apps/api/src/procedures/
  procedures.module.ts            procedures.controller.ts
  procedure.service.ts            procedure-draft.service.ts   (borradores y pasos)
  procedure-areas.service.ts      (asignación de áreas)
  procedure-access.policy.ts      step-order.ts                (funciones puras de orden)
  procedures.repository.ts        prisma-procedures.repository.ts
  http-errors.ts
  dto/        create-procedure, update-version, create-step, update-step,
              reorder-steps, set-areas, list-procedures.query, *.response
  (última parte) attachment.service.ts, step-attachments en el repositorio
apps/api/test/procedures/         helpers.ts, indexes, repository y e2e por tema
specs/006-procedimientos/         spec.md, plan.md, tasks.md
```

Cada archivo `.ts` lleva su `.spec.ts` al lado. El módulo usa `{ provide: UsersDirectory, useClass: PrismaUsersDirectory }` y lo mismo para `AreasDirectory`, como `ExecutionsModule`. `ProceduresModule` se registra en `app.module.ts` (una línea) y, en la última parte, importa `StorageModule`.

## 6. Decisiones del plan

- **D1 · Idioma.** Código, comentarios e identificadores en inglés; specs en español; mensajes de error HTTP en español (P1, P16).
- **D2 · Borrador como fila.** Un borrador es una fila de `procedure_versions` con `DRAFT`. La unicidad (R3) la garantiza el índice parcial, declarado en el esquema, no a mano en el SQL (como en el plan 003). La violación se reconoce por el nombre del índice, como `isUniqueViolationOn` de Mayra.
- **D3 · Serializar.** Crear un borrador toma el número siguiente bajo `SELECT … FOR UPDATE` de la fila del procedimiento, dentro de una transacción; así dos pedidos simultáneos no calculan el mismo número y el índice parcial queda como red de seguridad (R3, E16).
- **D4 · Orden sin huecos.** Agregar, borrar y reordenar pasos ocurre en una transacción con la versión bloqueada. Con `unique(versión, orden)` no deferrable, reordenar se hace en dos pasadas: primero se pasan a órdenes negativos, después a los definitivos. Los identificadores no cambian (R7, R8). La lógica pura (insertar, quitar, validar la lista) vive en `step-order.ts`.
- **D5 · Copia al crear borrador.** Todo en una transacción: crear la versión, copiar los pasos con `randomUUID()` nuevos y, en la última parte, los adjuntos (R4, R23).
- **D6 · Borrado.** `DELETE` de una versión `DRAFT` en una transacción; si era la única, se borra también el procedimiento (cascada de pasos y áreas). Una versión que no es `DRAFT` responde 409 antes de tocar nada (R9, R10).
- **D7 · Puertos ajenos.** Se reutilizan `UsersDirectory` y `AreasDirectory` de `documents/ports`. El directorio de áreas valida que existan (R11); no se modifica ninguno de los dos.
- **D8 · Errores y códigos propios.** Mi `http-errors.ts` y mi copia de los códigos de Prisma que significan "base caída" (`P1000`, `P1001`, `P1002`, `P1008`, `P1017`, `P2024`, `P2028` y el corte de `pg`). Quedan duplicados con los de `documents` y `executions`; se propone extraerlos más adelante, sin tocar el código de otros ahora.
- **D9 · Paginación propia.** `ListProceduresQuery` (`page` por defecto 1, `limit` por defecto 20, máximo 100) con las mismas reglas que la de documentos, sin importarla.
- **D10 · Respuestas.** Mapeo campo por campo: no se devuelven `ownerId` ni claves de almacenamiento. Las fechas, en ISO 8601 UTC.
- **D11 · Tests.** Unitarios para cada regla con mocks (`jest.fn().mockResolvedValue(...)`, AAA, un `describe` por clase o método); e2e solo para flujos críticos y errores (401, 403, 404, 400, 409, 503) y para la concurrencia de E16. Cada test crea sus datos y limpia solo sus tablas (`TRUNCATE`). Las versiones `PUBLISHED` y `SUPERSEDED` se insertan por SQL o con Prisma en los helpers, porque publicar es de HU32.
- **D12 · Adjuntos compartidos.** Al crear un borrador, las filas de `step_attachments` copian el mismo `storage_key`. Borrar un adjunto borra el archivo solo si no queda otra fila con esa clave. Subir sigue el orden "todo o nada" de documentos: inspeccionar el archivo, `FileStorage.put`, insertar la fila, y compensar con `FileStorage.delete` si algo falla. La clave la genera el sistema.
- **D13 · Descargas.** `GET …/attachments/:attachmentId/download` está abierto a todos los roles y aplica R13 y R14 sobre la versión vigente; `FileStorage.getDownloadUrl` se llama solo después de comprobar el acceso (R21).
- **D14 · Datos de demostración.** El seed de HU41 va a reutilizar los UUID de procedimientos de Mayra (`1a…`, `1b…`, `1c…`).
- **D15 · Reemplazo de áreas.** `setAreas(procedureId, areaIds)` del repositorio corre en una transacción: bloquea la fila del procedimiento (`FOR UPDATE`), borra sus áreas y inserta las nuevas; si el procedimiento no existe devuelve `null` y no escribe. El bloqueo evita que dos pedidos simultáneos choquen en la clave compuesta; gana el último. El servicio vive en `procedure-areas.service.ts` y no en el de borradores, que solo depende del repositorio. `http-errors.ts` también traduce el `RepositoryUnavailableError` del directorio a 503 (P19).
- **D16 · Login real en los tests.** Con el login de la Pareja A (`JwtAuthGuard` con Bearer), los tests de procedimientos se adaptan igual que los de Mayra y sin tocar código ajeno. Los specs de controlador usan `realAuthProviders()`, `bearer()` y `SPEC_USERS` de `test/executions/real-auth.ts`. El spec del módulo hace `overrideGuard(JwtAuthGuard)`, porque el `AuthModule` global no está en juego ahí. Los e2e firman los tokens con `signTestJwt` de `test/auth/helpers.ts`. Swagger pasa de `x-user-*` a Bearer (`@ApiBearerAuth()`). No hay cambio de comportamiento.

## 7. Contrato con ejecuciones (para HU32)

El adaptador real de `ProceduresCatalog` no se hace en esta spec, pero el modelo tiene que alcanzar para hacerlo. Lo que dice el puerto y cómo lo cubre este modelo:

| Puerto (Mayra) | Cómo lo resuelve el modelo |
| --- | --- |
| `findPublished(procedureId)` | La `PUBLISHED` de mayor `version_number`, con sus pasos por `step_order`. Si no hay, o no tiene pasos: `null` |
| `findVersion(versionId)` | Una `PUBLISHED` o `SUPERSEDED` por su id; las reemplazadas también se devuelven. Un `DRAFT` no se ejecutó nunca: `null` |
| `areaIds` | Las de `procedure_areas` hoy, iguales en `findPublished` y `findVersion` |
| `steps: [{ id, order, title }]` | Las filas de `steps` de esa versión |
| Base caída | `CatalogUnavailableError` (503 en el servicio de Mayra) |

El cambio de una línea en `executions.module.ts` (`useClass: …`) lo hace Mayra cuando el adaptador exista. Los tests de ejecuciones sobrescriben `ProceduresCatalog` con el catálogo en memoria, así que esta spec no los afecta.

## 8. Riesgos y coordinación

- **Migraciones.** Se crean con `prisma migrate dev --create-only`; se revisa el SQL y se borra cualquier `DROP INDEX "chunks_..."`; el test de índices exige `chunks_embedding_idx`, `chunks_content_fts_idx`, `chunks_content_fts_es_unaccent_idx`, `chunks_area_ids_idx` y `chunks_document_id_idx`. La migración de sesiones de Camila (`20261025004346`) ordena antes de `add_executions`: hay que hablarlo con ella antes de mergear.
- **`schema.prisma` y `app.module.ts`** los usan todas las parejas: avisar al equipo antes de mergear estos cambios (T02, T10 y T19 de las tareas).
- **Autenticación real (D16).** El rol viene siempre de `@CurrentUser()` y las áreas, del directorio. El helper `authHeaders` de los e2e está en un solo lugar (`test/procedures/app-helpers.ts`) y firma los tokens con `signTestJwt`.
- **Adjuntos.** `inspectFile` no acepta imágenes y `FileStorage` no copia: si hacen falta imágenes o copia real, se le pide a Matías (sección 11 de la spec).
- **Responsable.** El nombre y el email para el Contrato 3 necesitan una ampliación del directorio de la pareja A; no bloquea HU09 a HU11.

## 9. Orden de implementación

1. Esquema y migración (T02), con el test de índices primero.
2. Funciones puras: orden de pasos y política de acceso (T03, T04) y DTOs (T05).
3. Repositorio Prisma (T06, T07) y servicios (T08, T09), controlador y módulo (T10), e2e de borradores (T11).
4. HU10: áreas (T12, T13).
5. HU11: visibilidad (T14 a T17) y verificación (T18).
6. Adjuntos (T19 a T25), al final.

Cada tarea es un commit con el alcance `procedures` (por ejemplo, `feat(procedures): add procedures, versions and steps tables`).
