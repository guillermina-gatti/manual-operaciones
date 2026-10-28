# Tareas 006 · Procedimientos: borradores, áreas y visibilidad

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Micaela Franco (pareja B)
- **Estado (27/10/2026):** HU09 terminada: T01 a T11 hechas, con el e2e de T11 en verde. Siguen T12 en adelante (áreas y visibilidad), sin empezar. Los adjuntos siguen como pregunta abierta para el equipo.

Convenciones:

- Una tarea = un commit, con Conventional Commits y alcance `procedures` (`feat(procedures): …`, `test(procedures): …`, `docs(specs): …`). Las rutas de backend son relativas a `apps/api/`.
- R1 a R23 son las reglas de la spec; P1 a P17, sus decisiones; E1 a E34, sus escenarios; D1 a D14, las decisiones del plan. Trazabilidad: regla → escenario → tarea → test → resultado.
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- **"Avisar al equipo antes de mergear"** marca las tareas que tocan archivos que usan otras parejas: `schema.prisma`, `prisma/migrations` y `app.module.ts`.
- **Comandos de Prisma:** `prisma migrate dev`, `prisma migrate deploy` y `prisma generate` los corre Micaela, no el agente. Cuando una tarea cambia `schema.prisma`, el agente hace el cambio, escribe el test y se detiene; Micaela crea la migración con `migrate dev --create-only`, se revisa el SQL juntos (borrando cualquier `DROP INDEX "chunks_..."`) y ella la aplica.
- Tests: backend con `pnpm --filter api test <patrón>`; los de integración con `pnpm --filter api test:e2e <patrón>`, que resetea `manual_test` y corre Micaela en su terminal. Nunca se toca la base `manual`.
- No se modifica código de otras parejas. Si algo ajeno necesita un cambio, se le avisa a esa persona.
- Después de cada tarea: `pnpm --filter api lint` y `pnpm --filter api test` en verde.

---

## Documentación

### T01 · Spec, plan y tareas

- **Qué hace:** escribe `spec.md`, `plan.md` y `tasks.md` de la spec 006.
- **Cubre:** todas las reglas (trazabilidad).
- **Archivos:** `specs/006-procedimientos/*`.
- **Verificación:** Micaela revisa; no quedan preguntas críticas abiertas (spec, sección 11). Commit: `docs(specs): add spec 006 for procedures and versions`.

---

## HU09 · Borradores con pasos

### T02 · Tablas e índices (avisar al equipo antes de mergear)

- **Qué hace:**
  - **El agente:** agrega en el bloque de la pareja B de `schema.prisma` el enum de estado de versión y `Procedure`, `ProcedureVersion`, `Step` y `ProcedureArea`, con el índice único parcial `procedure_versions_one_draft_idx`; escribe el test; y **se detiene**.
  - **Micaela:** crea la migración `add_procedures` con `--create-only`, revisa el SQL junto con el agente y la aplica.
- **Cubre:** R3, R7, R11; D2, D4; plan sección 2.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_procedures/migration.sql` (la crea Micaela), `test/procedures/indexes.e2e-spec.ts`.
- **Verificación, test primero:** `pg_indexes` tiene `procedure_versions_one_draft_idx` y los 5 índices de `chunks`; insertar con SQL un segundo `DRAFT` del mismo procedimiento falla con violación de unicidad; insertar dos pasos con el mismo orden en una versión también falla. Sin la migración, el test falla.

### T03 · Funciones puras de orden de pasos

- **Qué hace:** `step-order.ts`: insertar un paso en una posición, quitar uno y validar la lista completa de un reordenamiento.
- **Cubre:** R7, R8; E5, E6, E7, E8; D4.
- **Archivos:** `src/procedures/step-order.ts` y su `.spec.ts`.
- **Verificación, test primero:** posición 1, intermedia y n + 1; posición 0 o n + 2 inválida; quitar el primero, uno del medio y el último; lista incompleta, con repetidos, con un id ajeno y vacía.

### T04 · Política de acceso

- **Qué hace:** `procedure-access.policy.ts`: `canManage`, `canViewProcedure` y el filtro del listado.
- **Cubre:** R1, R13, R14; E2, E20, E21, E22, E23, E24; D11.
- **Archivos:** `src/procedures/procedure-access.policy.ts` y su `.spec.ts`.
- **Verificación, test primero:** ADMIN ve todo; EMPLOYEE y SUPERVISOR ven solo con área compartida y versión `PUBLISHED` con pasos; sin áreas no ve nada; solo `DRAFT`, solo `SUPERSEDED` y `PUBLISHED` sin pasos se niegan.

### T05 · DTOs

- **Qué hace:** DTOs de crear procedimiento, editar versión, crear y editar paso (`position` opcional al crear), reordenar, asignar áreas y paginación del listado, con class-validator y Swagger. En editar versión y editar paso ambos campos son opcionales: que el pedido traiga al menos uno (R5) lo comprueba el servicio (T08 y T09), porque `@IsOptional()` desactiva todos los validadores de una propiedad ausente.
- **Cubre:** R2, R5, R6, R8, R11, R16; E3, E9, E18, E26; D9.
- **Archivos:** `src/procedures/dto/*.ts` y sus `.spec.ts`.
- **Verificación, test primero:** título vacío, solo espacios y de 201 caracteres; recorte de espacios; descripción de 1001 (procedimiento) y 2001 (paso); `position` menor a 1; lista de ids que no son UUID; áreas repetidas; `limit` 101, `page` 0 y texto; un cambio vacío (`{}`) es válido para el DTO de editar versión y de editar paso.

### T06 · Repositorio de procedimientos y versiones

- **Qué hace:** puerto `ProceduresRepository` con errores propios y su adaptador Prisma: crear procedimiento con su versión 1, buscar por id, crear borrador desde la vigente (copiando pasos con ids nuevos, con `FOR UPDATE` del procedimiento), editar título y descripción del borrador y borrar un borrador (y el procedimiento si era la única versión). Traducción de errores de disponibilidad y de la violación del índice parcial. El listado paginado con filtro de visibilidad no está acá: es de T14.
- **Cubre:** R2, R3, R4, R5, R9, R10; E1, E9, E10, E11, E12, E13, E14, E15, E16; D2, D3, D5, D6, D8.
- **Archivos:** `src/procedures/procedures.repository.ts`, `prisma-procedures.repository.ts` y sus `.spec.ts`; `test/procedures/helpers.ts` y `test/procedures/procedures.repository.e2e-spec.ts`.
- **Verificación, test primero (integración):** los casos de las reglas contra la base de tests, incluido que dos pedidos simultáneos dejan un solo `DRAFT`.

### T07 · Repositorio de pasos

- **Qué hace:** agregar un paso (al final o en una posición), editar, borrar y reordenar, en una transacción con la versión bloqueada; reordenar en dos pasadas (órdenes negativos y luego definitivos).
- **Cubre:** R6, R7, R8, R9; E4 a E8; D4.
- **Archivos:** `src/procedures/prisma-procedures.repository.ts` y `test/procedures/steps.repository.e2e-spec.ts`.
- **Verificación, test primero (integración):** orden 1 a n sin huecos tras agregar, borrar y reordenar; los ids no cambian; el límite de 50 pasos; una versión `PUBLISHED` no se modifica.

### T08 · Servicio de procedimientos y borradores

- **Qué hace:** casos de uso de crear procedimiento, editar el borrador, crear un borrador nuevo y borrar un borrador; reglas de estado (R9); mapeo de errores a 404, 409 y 503.
- **Cubre:** R1 a R5, R9, R10; E1, E3, E9 a E15; D1, D8.
- **Archivos:** `src/procedures/procedure-draft.service.ts`, `src/procedures/http-errors.ts` y sus `.spec.ts`.
- **Verificación, test primero:** con el repositorio simulado, cada `reason` 409 (`DRAFT_ALREADY_EXISTS`, `NO_PUBLISHED_VERSION`, `VERSION_NOT_EDITABLE`); un cambio sin título ni descripción responde 400 sin llamar al repositorio (R5); la base caída da 503, un error inesperado da 500 y la causa no sale en la respuesta.

### T09 · Servicio de pasos

- **Qué hace:** casos de uso de agregar, editar, borrar y reordenar pasos, usando `step-order.ts` y el límite de pasos.
- **Cubre:** R6 a R9; E4 a E8, E12; D4.
- **Archivos:** `src/procedures/procedure-draft.service.ts` y su `.spec.ts`.
- **Verificación, test primero:** `STEP_LIMIT_REACHED`; `VERSION_NOT_EDITABLE` en cada operación sobre una versión no `DRAFT`; editar un paso sin título ni descripción responde 400 sin llamar al repositorio; una lista de reordenamiento que no es la de los pasos del borrador responde 400 (`INVALID_ORDER`), y una posición fuera de rango también (`INVALID_POSITION`). Ambas las decide el repositorio dentro de la transacción, con la versión bloqueada: la lista solo se puede comparar con los pasos reales bajo el bloqueo, así que el servicio no puede rechazarla antes de llamarlo.

### T10 · Respuestas, controlador y módulo (avisar al equipo antes de mergear)

- **Qué hace:** clases de respuesta con mapeo campo por campo, `ProceduresController` (rutas de borradores y pasos, con Swagger y todos sus códigos), `ProceduresModule` con el repositorio de Prisma y el servicio de borradores, y una línea en `app.module.ts`. `UsersDirectory` y `AreasDirectory` se agregan al módulo en HU10 y HU11, cuando se usen.
- **Cubre:** R1, R17; E2, E27; D7, D10.
- **Archivos:** `src/procedures/dto/*.response.ts`, `procedures.controller.ts`, `procedures.module.ts`, `app.module.ts` y los `.spec.ts` correspondientes.
- **Verificación, test primero:** las respuestas no incluyen campos internos; la app arranca con el módulo nuevo; `GET /api/docs` lista las rutas.

### T11 · Pruebas de integración de HU09

- **Qué hace:** e2e de los flujos críticos de borradores y pasos con la aplicación completa y la base de tests.
- **Cubre:** E1 a E16.
- **Archivos:** `test/procedures/app-helpers.ts` y `test/procedures/drafts.e2e-spec.ts`.
- **Verificación:** 201 al crear; 401 sin sesión y 403 con SUPERVISOR y EMPLOYEE; 400 con datos inválidos; 404 con el mismo mensaje para un procedimiento inexistente y para una versión de otro procedimiento; 409 con `reason` en segundo borrador y en versión publicada; 204 al borrar; la versión publicada conserva sus pasos (E11); un solo `DRAFT` con pedidos simultáneos (E16). Los corre Micaela.

---

## HU10 · Áreas

### T12 · Servicio de áreas

- **Qué hace:** asignar el conjunto de áreas con `AreasDirectory.findExistingIds` (existencia), reemplazando el anterior, sin importar el estado de las versiones. `setAreas` en el repositorio, con bloqueo (D15).
- **Cubre:** R11, R12; E17, E18; D7, D15.
- **Archivos:** `src/procedures/procedure-areas.service.ts`, `src/procedures/procedures.repository.ts`, `src/procedures/prisma-procedures.repository.ts`, `src/procedures/http-errors.ts` y sus `.spec.ts`.
- **Verificación, test primero:** área inexistente → 400 sin llamar al repositorio; conjunto vacío válido; reemplazo completo; procedimiento inexistente → 404; no toca versiones ni pasos; dos pedidos simultáneos terminan con uno de los dos conjuntos completos; directorio o base caídos → 503. Los repetidos los rechaza el DTO (T13).

### T13 · Endpoint de áreas y su integración

- **Qué hace:** `PUT /procedures/:id/areas` en el controlador, con Swagger y su DTO (arreglo de UUID, sin repetidos, hasta 100) y su respuesta; `AreasDirectory` en el módulo con el adaptador Prisma; y su e2e.
- **Cubre:** R11, R12; E17, E18, E19 (la mitad de las áreas; la otra mitad, en T17); P18, P19.
- **Archivos:** `src/procedures/dto/set-areas.dto.ts`, `src/procedures/dto/areas.response.ts`, `src/procedures/procedures.controller.ts`, `src/procedures/procedures.module.ts`, `test/procedures/areas.e2e-spec.ts` y sus `.spec.ts`.
- **Verificación:** asignar y reasignar; 400 con área inexistente, repetida o con formato inválido, sin cambios; 401 y 403; 404 con procedimiento inexistente; mover un procedimiento publicado de Ventas a Operaciones deja sus áreas en Operaciones. Los corre Micaela.

---

## HU11 · Visibilidad

### T14 · Consultas de listado y detalle

- **Qué hace:** en el repositorio, listado paginado con el filtro de visibilidad (versión vigente y, para el ADMIN, el borrador) y detalle con la vigente o con todas las versiones.
- **Cubre:** R13, R14, R16; E20 a E23, E26; D9.
- **Archivos:** `src/procedures/prisma-procedures.repository.ts`, `test/procedures/visibility.repository.e2e-spec.ts`.
- **Verificación, test primero (integración):** orden del más nuevo al más viejo, `total` correcto, `PUBLISHED` sin pasos excluida para los no ADMIN, `SUPERSEDED` y `DRAFT` nunca visibles para ellos.

### T15 · Servicio de listado y detalle

- **Qué hace:** casos de uso de listar y ver un procedimiento; áreas desde el directorio en cada pedido (consulta aunque el id no exista); mismo 404 para inexistente y ajeno.
- **Cubre:** R13 a R16; E20 a E26.
- **Archivos:** `src/procedures/procedure.service.ts` y su `.spec.ts`.
- **Verificación, test primero:** usuario desconocido para el directorio → lista vacía y 404; directorio caído → 503 sin listar; el mensaje de 404 es idéntico para inexistente y ajeno.

### T16 · Endpoints de consulta

- **Qué hace:** `GET /procedures` y `GET /procedures/:id` para todos los roles, y `GET …/versions/:versionId` solo para ADMIN, con Swagger.
- **Cubre:** R13, R16, R17; E20, E23, E27.
- **Archivos:** `src/procedures/procedures.controller.ts` y su `.spec.ts`.
- **Verificación, test primero:** `@Roles('ADMIN')` en la ruta de versiones; formato `{ data, total, page, limit }`; `ParseUUIDPipe` en los ids.

### T17 · Prueba de integración de HU11

- **Qué hace:** e2e de la visibilidad con la aplicación completa: la prueba que pide HU11.
- **Cubre:** E19 a E27.
- **Archivos:** `test/procedures/visibility.e2e-spec.ts`.
- **Verificación:** EMPLOYEE de Ventas ve solo lo de Ventas; el detalle de otra área responde 404, idéntico al de un id inexistente (estado y cuerpo); sin borradores ni reemplazadas; ADMIN ve todo; sin áreas ve lista vacía; 400 con `limit=101`; 403 en la ruta de versiones; al pasar un procedimiento de Ventas a Operaciones, el EMPLOYEE de Ventas recibe 404 y el de Operaciones lo ve (E19). Los corre Micaela.

### T18 · Verificación de HU09, HU10 y HU11

- **Qué hace:** repasa que todo esté en verde y que la spec refleje lo construido.
- **Verificación:**
  - `pnpm --filter api lint`, `pnpm --filter api test` y `pnpm --filter api build` sin errores;
  - Micaela corre `pnpm --filter api test:e2e`: los tests nuevos y todos los existentes pasan, incluido `indexes.e2e-spec.ts`;
  - Swagger lista todas las rutas con sus códigos;
  - el diff no tiene cambios fuera de alcance (`documents/`, `executions/` y `common/auth/` sin tocar);
  - la spec está actualizada (estado y decisiones nuevas).

---

## Adjuntos de los pasos (última parte)

### T19 · Tabla de adjuntos (avisar al equipo antes de mergear)

- **Qué hace:**
  - **El agente:** agrega `StepAttachment` al esquema (sin índice único en `storage_key`); escribe el test; y **se detiene**.
  - **Micaela:** crea la migración `add_step_attachments` con `--create-only`, revisa el SQL junto con el agente y la aplica.
- **Cubre:** R18, R23; D12.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_step_attachments/migration.sql` (la crea Micaela), `test/procedures/indexes.e2e-spec.ts`.
- **Verificación, test primero:** la tabla existe, borrar un paso borra sus adjuntos (cascada), dos filas pueden compartir `storage_key`, y los índices de `chunks` siguen.

### T20 · Repositorio de adjuntos

- **Qué hace:** crear, listar y borrar adjuntos; contar los de un paso; copiar las filas al crear un borrador; saber si otra fila usa la misma clave.
- **Cubre:** R19, R22, R23; E32, E33, E34; D12.
- **Archivos:** `src/procedures/prisma-procedures.repository.ts` y `test/procedures/attachments.repository.e2e-spec.ts`.
- **Verificación, test primero (integración):** el límite de 5 por paso; un borrador nuevo copia las filas con la misma clave; borrar en el borrador no toca la fila de la versión publicada.

### T21 · Servicio de subida

- **Qué hace:** inspeccionar el archivo con `inspectFile`, comprobar que el paso es de un borrador y el límite, `FileStorage.put`, insertar la fila y compensar con `FileStorage.delete` si algo falla.
- **Cubre:** R18, R19, R20; E28, E29, E30, E34; D12.
- **Archivos:** `src/procedures/attachment.service.ts` y su `.spec.ts`.
- **Verificación, test primero:** 415 (contenido que no es PDF con extensión `.pdf`), 413 (más de 10 MB), 400 (vacío); `ATTACHMENT_LIMIT_REACHED`; si falla el almacenamiento o la base, 503 y no queda archivo huérfano.

### T22 · Servicio de descarga y borrado

- **Qué hace:** descargar con acceso comprobado antes de pedir el enlace; borrar un adjunto de un borrador y, si ninguna versión lo usa, el archivo; heredar adjuntos al crear un borrador (R4).
- **Cubre:** R21, R22, R23; E31, E32, E33; D12, D13.
- **Archivos:** `src/procedures/attachment.service.ts`, `src/procedures/procedure-draft.service.ts` y sus `.spec.ts`.
- **Verificación, test primero:** no se pide el enlace si el acceso se niega (404); `VERSION_NOT_EDITABLE` al borrar de una versión publicada; el archivo compartido no se borra mientras otra versión lo use.

### T23 · Endpoints de adjuntos

- **Qué hace:** `POST …/attachments` (multipart `file`, `FileInterceptor` con el límite de 10 MB), `DELETE …/attachments/:attachmentId` y `GET /procedures/:id/attachments/:attachmentId/download`; `ProceduresModule` importa `StorageModule`.
- **Cubre:** R18 a R22; D13.
- **Archivos:** `src/procedures/procedures.controller.ts`, `procedures.module.ts` y sus `.spec.ts`.
- **Verificación, test primero:** Swagger documenta el cuerpo multipart; los roles de cada ruta; `ParseUUIDPipe`.

### T24 · Pruebas de integración de adjuntos

- **Qué hace:** e2e de adjuntos con la aplicación completa y un almacenamiento en memoria que se puede hacer fallar.
- **Cubre:** E28 a E34.
- **Archivos:** `test/procedures/attachments.e2e-spec.ts`.
- **Verificación:** 201 al adjuntar; 415, 413 y 400; 503 sin archivo ni fila; descarga con enlace para el EMPLOYEE de Ventas y 404 para el de Operaciones; 409 al borrar de una versión publicada; la versión publicada conserva su adjunto (E33); 409 al sexto adjunto. Los corre Micaela.

### T25 · Verificación final

- **Qué hace:** repite la verificación de T18 incluyendo los adjuntos y deja la spec en estado "implementada".
- **Verificación:** lint, tests, build y e2e en verde; todos los criterios de aceptación (E1 a E34) con su test; sin cambios fuera de alcance; spec, plan y tareas al día con lo construido.
