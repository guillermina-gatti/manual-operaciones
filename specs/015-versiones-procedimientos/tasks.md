# Tareas 015 · Versiones inmutables de procedimientos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Micaela Franco (pareja B)
- **Estado (10/11/2026):** **Partes 1 y 2 terminadas** (T01 a T21). API: 1967 tests unitarios, lint y build en verde; los e2e (`versions-indexes`, `versions` y `catalog`) están escritos y los corre Micaela al final. Web: 1572 tests, lint y build en verde. Tras la prueba visual de la Parte 1 se corrigieron tres errores del front (historial que no se actualizaba al cambiar el borrador, texto de "reemplazada" en la primera publicación y estado real de la versión en la lista de procedimientos). Pendiente: llenar `title` en el catálogo cuando Mayra lo agregue al puerto (T14). El comparar contra Postgres se prueba por HTTP en `versions.e2e-spec.ts`; no hizo falta `versions.repository.e2e-spec.ts`.
- **Estructura final de la API (commit `refactor(procedures)`):** cada archivo con una responsabilidad y menos de 100 líneas. Donde las tareas dicen `procedure-versions.service.ts`, son `procedure-publish.service.ts` (publicar) y `procedure-history.service.ts` (historial y detalle, y luego comparar en su propio servicio); donde dicen `prisma-versions.repository.ts`, son `prisma-publish.repository.ts` (publicar) y `prisma-versions.repository.ts` (historial y detalle), con `publish.repository.ts` y `versions.repository.ts` como puertos y `prisma-version-rows.ts` y `version-operation.ts` con lo común.

Convenciones:

- Una tarea = un commit (a veces dos: test y código), con Conventional Commits y alcance `procedures` o `web`. Las rutas de backend son relativas a `apps/api/`, las de front a `apps/web/`.
- R1 a R14 son las reglas de la spec; E1 a E32, sus escenarios; D1 a D28, sus decisiones; PD1 a PD8, las decisiones del plan. Trazabilidad: regla → escenario → tarea → test → resultado (tabla al final).
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa. Un test por criterio, con AAA, `describe` por clase o método y mocks con `jest.fn().mockResolvedValue(...)` limpiados entre tests. En el front, `getByRole` y `getByLabel`, nunca esperas por tiempo fijo.
- Nunca se modifica un test existente para que pase: si una tarea tiene que cambiar uno, se avisa antes.
- **"Avisar al equipo antes de mergear"** marca las tareas que tocan `schema.prisma` o `prisma/migrations`.
- **Prisma:** `migrate dev`, `migrate deploy`, `generate` y `db seed` los corre Micaela cuando la tarea lo dice. La migración se crea con `--create-only`, se revisa el SQL (se borra cualquier `DROP INDEX "chunks_..."`) y recién después se aplica.
- **Tests de integración:** `pnpm --filter api test:e2e <patrón>` resetea `manual_test` y lo corre Micaela en su terminal. Nunca se toca la base `manual`.
- No se modifica código de otras parejas (`executions/`, `documents/`, `chat/`, `common/auth/`, `components/documents/*`, `components/ui/*`).
- Después de cada tarea: `pnpm --filter api lint` y `pnpm --filter api test` (y, si toca el front, `pnpm --filter web lint` y `pnpm --filter web test`) en verde.

---

## Documentación

### T01 · Spec, plan y tareas

- **Qué hace:** `spec.md`, `plan.md` y `tasks.md` de la spec 015, con las preguntas de la aclaración respondidas (D10 a D17).
- **Cubre:** todas las reglas (R1 a R13).
- **Archivos:** `specs/015-versiones-procedimientos/*`.
- **Verificación:** sin preguntas críticas abiertas; cada regla de la spec figura en la tabla de trazabilidad.
- **Estado:** hecha (10/11/2026).

---

## Parte 1 · publicar, inmutabilidad, nueva versión, historial

### T02 · Tablas e índices (avisar al equipo antes de mergear)

- **Qué hace:**
  - **El agente:** agrega solo líneas nuevas en el bloque de la pareja B de `schema.prisma` (columnas de publicación, `is_critical`, `change_summary`, `step_key` con valor por defecto en la base y los dos índices únicos; plan sección 2), crea la migración con `--create-only` y **se detiene**.
  - **Micaela:** revisa el SQL junto con el agente (relleno `step_key = id`, sin `DROP INDEX "chunks_..."`) y lo aplica.
- **Cubre:** R4, R5, R7, R8; D5, D11; PD3.
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/<fecha>_add_procedure_versions/migration.sql`, `test/procedures/versions-indexes.e2e-spec.ts`.
- **Verificación, test primero (integración):** `pg_indexes` tiene `procedure_versions_one_published_idx` y los 5 índices de `chunks`; insertar con SQL una segunda `PUBLISHED` del mismo procedimiento falla con violación de unicidad; un paso insertado sin `step_key` recibe uno; los pasos que ya existían quedan con `step_key = id`. Sin la migración, el test falla.

### T03 · `createDraft` conserva la clave de paso

- **Qué hace:** al copiar los pasos de la vigente, `createDraft` copia también `stepKey`; los pasos de la copia siguen teniendo ids nuevos. Se exporta `lockProcedure` (PD2).
- **Cubre:** R7; E7; D11.
- **Archivos:** `src/procedures/prisma-procedures.repository.ts` y su `.spec.ts` (se agrega un caso; los existentes no cambian).
- **Verificación, test primero:** el borrador copiado tiene los mismos `stepKey` y ids distintos que la vigente; la vigente no cambia.

### T04 · Errores y DTOs

- **Qué hace:** operaciones nuevas en `http-errors.ts` (`publish`, `listVersions`, `getVersion`, `compareVersions`); `PublishVersionDto` (`isCritical` booleano, `changeSummary` sin espacios extremos, de 1 a 300; la parte "obligatorio si es crítico" se completa en T15); `ListVersionsQuery` (`page` y `limit`); `VersionHistoryItemResponse` y `VersionDetailResponse` con `toXResponse`.
- **Cubre:** R2, R8, R9, R13; D1, D3, D9.
- **Archivos:** `src/procedures/http-errors.ts` (+ spec), `src/procedures/dto/publish-version.dto.ts`, `dto/list-versions.query.ts`, `dto/version-history.response.ts` y sus `.spec.ts`.
- **Verificación, test primero:** `{}` es válido; `isCritical` no booleano o un campo desconocido, 400; `limit=101`, 400; la respuesta trae solo los campos de R8 y fechas ISO UTC; el 503 y el 500 no filtran la causa.

### T05 · Repositorio de versiones: publicar y leer

- **Qué hace:** puerto `VersionsRepository` y `PrismaVersionsRepository`: `publish` (transacción con bloqueo, R4), `list` (paginado), `findVersion` (con pasos) y `findForCompare`. Traduce la violación del índice de una sola `PUBLISHED` al rechazo `NOT_A_DRAFT`.
- **Cubre:** R3, R4, R6, R7, R8, R9; E1, E2, E3, E4, E5, E8, E9, E18, E20; D5.
- **Archivos:** `src/procedures/versions.repository.ts`, `src/procedures/prisma-versions.repository.ts` y su `.spec.ts`; `test/procedures/versions.repository.e2e-spec.ts`.
- **Verificación, test primero:** unitario con el `PrismaService` simulado (rechazos `NOT_FOUND`, `NOT_A_DRAFT`, `NO_STEPS`, `NO_AREAS`; la anterior pasa a `SUPERSEDED`; la base caída lanza `ProceduresRepositoryUnavailableError`). Integración (la corre Micaela): una sola `PUBLISHED` tras publicar la 2.ª; dos publicaciones a la vez, una gana; orden y `total` del historial; la versión de otro procedimiento es `NOT_FOUND`.

### T06 · Servicio: publicar

- **Qué hace:** `ProcedureVersionsService.publish(user, procedureId, versionId, dto)`: `canManage` (403), llamada al repositorio, 404 único (`procedureNotFound`), 409 con `reason` y `toHttpException`.
- **Cubre:** R1, R2, R3, R4, R5, R6, R11; E1, E2, E3, E4, E5, E15, E16, E20; D1, D13, D16.
- **Archivos:** `src/procedures/procedure-versions.service.ts` y su `.spec.ts`.
- **Verificación, test primero:** EMPLOYEE y SUPERVISOR, 403 sin llamar al repositorio; borrador válido, devuelve la versión publicada; `NOT_A_DRAFT`, `NO_STEPS` y `NO_AREAS`, 409 con su `reason`; `NOT_FOUND`, 404 con el mismo mensaje para procedimiento inexistente y versión ajena; repositorio caído, 503.

### T07 · Servicio: historial y detalle

- **Qué hace:** `listVersions` y `getVersion`: 403 para otros roles, 404 único, y el nombre de quien publicó con `UsersDirectory.findById` (una vez por persona; sin nombre, `name: null`).
- **Cubre:** R1, R8, R9; E8, E9, E15, E16; D6; PD5.
- **Archivos:** `src/procedures/procedure-versions.service.ts` y su `.spec.ts`.
- **Verificación, test primero:** historial en orden descendente con `{ data, total, page, limit }`; dos versiones del mismo publicador, un solo pedido al directorio; usuario desconocido, `name: null` y el `id` se conserva; detalle de una `SUPERSEDED` con sus pasos; versión de otro procedimiento, 404.

### T08 · Controlador de versiones (Parte 1)

- **Qué hace:** `POST /procedures/:id/versions/:versionId/publish`, `GET /procedures/:id/versions` y `GET /procedures/:id/versions/:versionId`, con `ParseUUIDPipe`, `@Roles('ADMIN')` y Swagger con todos sus códigos; el módulo suma el controlador, el servicio, `VersionsRepository` y `UsersDirectory`.
- **Cubre:** R1, R2, R8, R9, R13; E1, E8, E9, E15, E17.
- **Archivos:** `src/procedures/procedure-versions.controller.ts` y su `.spec.ts`, `src/procedures/procedures.module.ts` (+ spec).
- **Verificación, test primero:** detrás del guard real: sin sesión 401, EMPLOYEE 403, id inválido 400, cuerpo con un campo desconocido 400, publicar 200, historial 200 con el formato de página.

### T09 · Integración de la Parte 1

- **Qué hace:** e2e con la aplicación completa, solo flujos críticos.
- **Cubre:** E1, E2, E3, E4, E5, E6, E7, E8, E15, E16, E17, E18.
- **Archivos:** `test/procedures/versions.e2e-spec.ts` (con los helpers de `test/procedures/`).
- **Verificación (la corre Micaela):** publicar y ver la anterior `SUPERSEDED`; 409 `VERSION_NOT_EDITABLE` al editar la publicada y la publicada conserva título y pasos; 409 `NO_STEPS` y `NO_AREAS`; 409 `VERSION_NOT_DRAFT` al publicar dos veces; nueva versión que copia los pasos sin cambiar la publicada; 404 con la versión de otro procedimiento; 403 con EMPLOYEE; 400 con un id inválido y un cuerpo inválido.

### T10 · Front: cliente de la API y funciones puras

- **Qué hace:** `lib/api/procedure-versions.ts` (`listVersions`, `getVersion`, `publishVersion`, `compareVersions`, con tipos y mensajes de error en voseo) y `lib/procedures/versions.ts` (tono del punto por estado, texto "Cambio crítico", orden de la línea de tiempo).
- **Cubre:** R2, R8, R9, R10; E1, E8, E9.
- **Archivos:** `lib/api/procedure-versions.ts`, `lib/procedures/versions.ts`, `tests/lib/api/procedure-versions.test.ts`, `tests/lib/procedures/versions.test.ts`.
- **Verificación, test primero:** cada función llama a su ruta con el método y el cuerpo correctos; un 409 con `reason` se traduce al mensaje correspondiente; el tono: borrador azul, publicada verde, reemplazada gris.

### T11 · Front: línea de tiempo de versiones

- **Qué hace:** sección "Versiones" de `/procedimientos/[id]`: `useVersions` (carga el historial y sus estados) y `VersionTimeline` (lista ordenada con punto + texto por estado, fecha, quién publicó y chip "Cambio crítico" con su resumen).
- **Cubre:** R8; E8, E10.
- **Archivos:** `components/procedures/useVersions.ts`, `VersionTimeline.tsx`, `tests/components/procedures/VersionTimeline.test.tsx`.
- **Verificación, test primero:** `getByRole('list', { name: 'Versiones' })` con un ítem por versión; el estado dicho con texto y no solo con color; el chip solo en las críticas; estados de carga, vacío y error con `ScreenState`.

### T12 · Front: publicar con confirmación

- **Qué hace:** `usePublishVersion` y `PublishVersion`: botón "Publicar" en el borrador, confirmación ("¿Publicar la versión N? La versión vigente pasa a reemplazada.") y los errores 409 con su mensaje (sin pasos, sin áreas).
- **Cubre:** R2, R3; E1, E3, E4.
- **Archivos:** `components/procedures/usePublishVersion.ts`, `PublishVersion.tsx`, `tests/components/procedures/PublishVersion.test.tsx`.
- **Verificación, test primero:** confirmar llama a la API una vez (doble click, una sola llamada) y avisa; cancelar no llama; 409 `NO_STEPS` y `NO_AREAS` muestran su mensaje.

### T13 · Front: versión publicada en solo lectura y "Crear nueva versión"

- **Qué hace:** `VersionReadOnly` (título, descripción y pasos en solo lectura de una versión publicada o reemplazada, con `getVersion`) y el botón "Crear nueva versión" (usa `POST /versions`). `ProcedureEditor` decide qué mostrar según el estado.
- **Cubre:** R6, R7; E6, E7.
- **Archivos:** `components/procedures/VersionReadOnly.tsx`, `ProcedureEditor.tsx`, `tests/components/procedures/VersionReadOnly.test.tsx` (y el test del editor, con un caso nuevo; los existentes no cambian).
- **Verificación, test primero:** la publicada no muestra formularios ni botones de edición; "Crear nueva versión" llama a la API y abre el borrador; 409 `DRAFT_ALREADY_EXISTS` muestra su mensaje.

### T14 · Adaptador real del catálogo de ejecuciones

- **Qué hace:** `PrismaProceduresCatalog` implementa `ProceduresCatalog` (`findPublished` y `findVersion`) sin tocar `executions/` (PD8, plan sección 7). Si el puerto ya tiene `title`, lo llena; si no, funciona sin él y se anota como pendiente.
- **Cubre:** R12; E19, E21, E22, E23; D12, D17.
- **Archivos:** `src/procedures/adapters/prisma-procedures-catalog.ts` y su `.spec.ts`; `test/procedures/catalog.e2e-spec.ts`.
- **Verificación, test primero:** `findPublished` devuelve la vigente con sus pasos ordenados y las áreas actuales, `null` sin publicada o con la publicada sin pasos; `findVersion` devuelve también la `SUPERSEDED`; id inexistente, `null`; la base caída lanza `CatalogUnavailableError`. **Pendiente (se completa cuando Mayra agregue `title` al puerto):** llenar el título con el de la versión.

---

## Parte 2 · cambio crítico y comparar

### T15 · Cambio crítico

- **Qué hace:** `PublishVersionDto` exige `changeSummary` cuando `isCritical` es verdadero (`@ValidateIf`); `publish` guarda la marca y el resumen; el historial y el detalle los devuelven.
- **Cubre:** R5, R8; E10, E11; D14.
- **Archivos:** `src/procedures/dto/publish-version.dto.ts`, `src/procedures/prisma-versions.repository.ts`, `src/procedures/procedure-versions.service.ts` y sus `.spec.ts`.
- **Verificación, test primero:** crítico sin resumen, con espacios o de 301 caracteres, 400 indicando el campo; crítico con resumen, queda guardado y aparece en el historial; no crítico, resumen opcional.

### T16 · Función de comparación

- **Qué hace:** `compareVersions(from, to)` pura: `added`, `removed`, `modified` (con `changedFields` entre `title`, `description` y `order`) y `unchanged`, reconociendo los pasos por su clave.
- **Cubre:** R10; E12, E13.
- **Archivos:** `src/procedures/version-compare.ts` y su `.spec.ts`.
- **Verificación, test primero:** dos listas iguales (todo `unchanged`); un paso agregado, uno quitado y uno con otra descripción; un paso que solo cambia de lugar (`["order"]`); ambos vacíos; un paso con título y descripción cambiados (`["title", "description"]`).

### T17 · Comparar: servicio y endpoint

- **Qué hace:** `compareVersions` en el servicio (400 si `from` y `to` son iguales, 404 único, 403 para otros roles) y `GET /procedures/:id/versions/compare?from&to` en el controlador, antes de `:versionId`; `CompareVersionsQuery` y `CompareResponse`.
- **Cubre:** R1, R10, R13; E12, E13, E14, E15, E16.
- **Archivos:** `src/procedures/procedure-versions.service.ts`, `procedure-versions.controller.ts`, `dto/compare-versions.query.ts`, `dto/compare.response.ts` y sus `.spec.ts`.
- **Verificación, test primero:** `from` igual a `to`, 400; una versión ajena o inexistente, 404 con el mismo mensaje; EMPLOYEE, 403; la ruta `compare` no se confunde con un id; el resultado trae los pasos con `id`, `order`, `title` y `description` y no expone la clave.

### T18 · Integración de la Parte 2

- **Qué hace:** e2e del cambio crítico y de comparar.
- **Cubre:** E10, E11, E12, E13, E14, E15, E16.
- **Archivos:** `test/procedures/versions.e2e-spec.ts` (casos nuevos), `test/procedures/versions.repository.e2e-spec.ts` (comparar contra Postgres).
- **Verificación (la corre Micaela):** publicar como crítico y verlo en el historial con su resumen; 400 con un crítico sin resumen; comparar dos versiones con un paso agregado, uno quitado y uno modificado; 400 con la misma versión; 404 con una de otro procedimiento; 403 con EMPLOYEE.

### T19 · Front: cambio crítico al publicar

- **Qué hace:** `PublishVersion` suma el checkbox "Es un cambio crítico" y el campo "Resumen del cambio" (obligatorio solo si está marcado); la línea de tiempo muestra el chip y el resumen.
- **Cubre:** R5, R8; E10, E11; D14.
- **Archivos:** `components/procedures/PublishVersion.tsx`, `VersionTimeline.tsx` y sus tests (casos nuevos).
- **Verificación, test primero:** marcar el checkbox muestra el campo; confirmar sin resumen marca el error y no llama a la API; con resumen, el cuerpo trae `isCritical: true` y `changeSummary`.

### T20 · Front: comparar dos versiones

- **Qué hace:** `useCompareVersions`, `CompareVersions` (dos selectores de versión y el botón "Comparar") y `CompareResult` (agregados, quitados y modificados, cada uno con su título y cantidad).
- **Cubre:** R10; E12, E13, E14.
- **Archivos:** `components/procedures/useCompareVersions.ts`, `CompareVersions.tsx`, `CompareResult.tsx`, `tests/components/procedures/CompareVersions.test.tsx`.
- **Verificación, test primero:** elegir la misma versión en los dos selectores no permite comparar; el resultado nombra los pasos agregados, quitados y modificados (con qué cambió); sin diferencias, lo dice; errores con `ScreenState`.

### T21 · Verificación y evidencia

- **Qué hace:** repasa que todo esté en verde y que la spec refleje lo construido; pasos para probar en `localhost:3001`.
- **Verificación:**
  - `pnpm --filter api lint`, `test` y `build`; `pnpm --filter web lint`, `test` y `build` (con `API_URL`), sin errores;
  - Micaela corre `pnpm --filter api test:e2e`: los tests nuevos y todos los existentes pasan, incluido `indexes.e2e-spec.ts`;
  - Swagger lista las rutas nuevas con todos sus códigos;
  - el diff no tiene cambios fuera de alcance (`executions/`, `documents/`, `chat/`, `common/auth/` y `components/documents/` sin tocar);
  - la spec está actualizada (estado y decisiones nuevas).

---

## Trazabilidad: regla → escenario → tarea → test → resultado

Se completa la columna "Resultado" a medida que cada test pasa.

| Regla | Escenarios | Tareas | Tests | Resultado |
| --- | --- | --- | --- | --- |
| R1 · Quién | E15 | T06, T07, T08, T17 | `procedure-publish.service.spec.ts`, `procedure-history.service.spec.ts`, `procedure-versions.controller.spec.ts`, `versions.e2e-spec.ts` | unitarios ✔ (10/11); e2e escrito, lo corre Micaela |
| R2 · Publicar | E1, E10 | T04, T05, T06, T08, T10, T12 | `publish-version.dto.spec.ts`, `prisma-publish.repository.spec.ts`, `procedure-publish.service.spec.ts`, `PublishVersion.test.tsx` | API ✔ y front ✔ (10/11) |
| R3 · Condiciones | E3, E4, E5, E16 | T05, T06, T09, T12 | `prisma-publish.repository.spec.ts`, `procedure-publish.service.spec.ts`, `versions.e2e-spec.ts` | unitarios ✔ (10/11); e2e escrito |
| R4 · Una sola publicada | E2, E18, E20 | T02, T05, T09 | `versions-indexes.e2e-spec.ts`, `versions.e2e-spec.ts`, `prisma-publish.repository.spec.ts` | unitarios ✔ (10/11); e2e escrito |
| R5 · Cambio crítico | E10, E11 | T04, T15, T19 | `publish-version.dto.spec.ts`, `procedure-publish.service.spec.ts`, `PublishVersion.test.tsx` | API ✔ y front ✔ (10/11); e2e escrito |
| R6 · Inmutabilidad | E6 | T05, T09, T13 | `versions.e2e-spec.ts`, `VersionReadOnly.test.tsx`, `ProcedureEditor.versions.test.tsx` | front ✔ (10/11); e2e escrito |
| R7 · Copia propia de pasos | E6, E7 | T02, T03, T09, T13 | `prisma-procedures.repository.spec.ts`, `versions-indexes.e2e-spec.ts`, `versions.e2e-spec.ts`, `StartDraft.test.tsx`, `snapshot.versions.test.ts` | unitarios ✔ y front ✔ (10/11); e2e escrito |
| R8 · Historial | E8 | T04, T05, T07, T08, T10, T11 | `version-history.response.spec.ts`, `prisma-versions.repository.spec.ts`, `procedure-history.service.spec.ts`, `VersionTimeline.test.tsx`, `VersionsSection.test.tsx` | API ✔ y front ✔ (10/11) |
| R9 · Detalle de una versión | E9 | T04, T07, T08, T13 | `version-detail.response.spec.ts`, `procedure-history.service.spec.ts`, `procedure-versions.controller.spec.ts`, `VersionReadOnly.test.tsx` | API ✔ y front ✔ (10/11) |
| R10 · Comparar | E12, E13, E14 | T16, T17, T18, T20 | `version-compare.spec.ts`, `procedure-compare.service.spec.ts`, `compare-versions.query.spec.ts`, `compare.response.spec.ts`, `procedure-versions.controller.spec.ts`, `versions.e2e-spec.ts`, `CompareResult.test.tsx`, `CompareVersions.test.tsx` | API ✔ y front ✔ (10/11); e2e escrito |
| R11 · Qué no cambia al publicar | E19 | T06, T09, T14 | `procedure-publish.service.spec.ts`, `versions.e2e-spec.ts`, `catalog.e2e-spec.ts` | unitarios ✔ (10/11); e2e escrito |
| R12 · Catálogo de ejecuciones | E19, E21, E22, E23 | T14 | `prisma-procedures-catalog.spec.ts`, `catalog.e2e-spec.ts` | unitario ✔ (10/11, 12 tests); e2e escrito; `title` pendiente de Mayra |
| R13 · Formato y errores | E16, E17, E20 | T04, T08, T09 | `http-errors.spec.ts`, `procedure-versions.controller.spec.ts`, `versions.e2e-spec.ts` | unitarios ✔ (10/11); e2e escrito |
| R14 · Pantalla del ADMIN | E24 a E29 | T22 a T27 | `ConfirmDialog.test.tsx`, `AreaChipsField.test.tsx`, `StepsEditor.test.tsx`, `DraftForm.test.tsx`, `ProcedureList.test.tsx`, `ProcedureEditor.test.tsx` | web ✔ (11/11); prueba en el navegador pendiente |

---

## Parte 3 · mejora visual de la pantalla del ADMIN (solo front, 11/11/2026)

Pedido de Matías, boceto aprobado por el equipo. R14, D21 a D26, E24 a E29. La API, `components/documents/` y la vista de SUPERVISOR y EMPLOYEE no se tocan. Los tests existentes que cambian de texto o de lugar se ajustan porque cambió el comportamiento (la spec va primero); no se tocan para "hacerlos pasar".

### T22 · Cartel de confirmación
- **Qué hace:** `ConfirmDialog`: `<dialog>` modal con encabezado salvia, "!" rojo, "Cancelar" y "Sí, borrar".
- **Cubre:** D25; E26, E27. **Archivos:** `components/procedures/ConfirmDialog.tsx` y `tests/components/procedures/ConfirmDialog.test.tsx`.
- **Verificación, test primero:** `role="dialog"` con nombre y descripción; Esc y "Cancelar" cierran sin confirmar; "Sí, borrar" confirma; con `busy` los botones se deshabilitan.

### T23 · Pasos: fila salvia, tachito y "+ Agregar paso"
- **Qué hace:** `StepItem` con fondo salvia y los botones en una línea; el tachito abre el cartel; `AddStep` con borde punteado; el título "Pasos" sin "de 50".
- **Cubre:** D23, D24, D25; E26, E28. **Archivos:** `StepItem.tsx`, `StepActions.tsx`, `AddStep.tsx`, `StepsEditor.tsx`, `DraftSections.tsx`, `design.tsx` y sus tests.
- **Verificación, test primero:** "Borrar el paso X" abre el cartel y no llama a la API; "Sí, borrar" llama y renumera; "+ Agregar paso" abre el formulario.

### T24 · Chips de áreas seleccionables
- **Qué hace:** `AreaChipsField`: casillas con forma de chip, "(inactiva)", con el estilo de `AreaChips` de HU11 (sin modificar `components/documents/`).
- **Cubre:** D22, D26; E29. **Archivos:** `AreaChipsField.tsx` y su test.

### T25 · Tarjeta "Borrador"
- **Qué hace:** `DraftForm` con título y descripción lado a lado, las áreas, "Guardar cambios" (título, descripción y áreas) y el tachito "Descartar borrador" con el cartel; mientras es borrador no hay sección "Áreas" aparte.
- **Cubre:** D22, D25; E25, E27. **Archivos:** `DraftForm.tsx`, `DiscardDraft.tsx`, `useDraftActions.ts`, `DraftSections.tsx`, `ProcedureEditorBody.tsx` y sus tests.

### T26 · Pantalla única al crear
- **Qué hace:** al crear, `ProcedureList` muestra el borrador en lugar del formulario, sin "Abrir el borrador".
- **Cubre:** D21; E24. **Archivos:** `CreateProcedureForm.tsx`, `ProcedureList.tsx`, `ProcedureEditor.tsx`, `ProcedureEditorBody.tsx` y sus tests.

### T27 · Verificación
- lint, tests y build de web y de api en verde; prueba en el navegador como `admin@fixtures.test`.
- **Resultado (11/11/2026):** web 1678 tests, lint, `tsc` y build en verde; API 2093 tests unitarios, lint y build en verde. Pendiente: la prueba en el navegador (la hace Micaela). Los e2e de la API no se tocaron. Lo que decía esta parte sobre la lista (se actualizaba solo al crear y al descartar) quedó reemplazado por D28 (Parte 4).

## Parte 4 · Dos fallos de la prueba en el navegador (12/11/2026)

R15, D27, D28, E30 a E32. Solo front; la API no se toca.

### T28 · "+ Crear otro procedimiento"
- **Qué hace:** `ProcedureList` muestra, arriba del borrador, el botón secundario que vuelve al formulario vacío y pide la lista otra vez.
- **Cubre:** D27; E30. **Archivos:** `ProcedureList.tsx` y `ProcedureList.refresh.test.tsx`.
- **Verificación, test primero:** el botón está con el borrador a la vista y no con el formulario; tras tocarlo, el título está vacío, no hay "Borrador" y se pidió la lista otra vez.

### T29 · La lista sigue al borrador
- **Qué hace:** `ProcedureEditorBody` avisa (`onChanged`) al guardar el borrador, publicar y crear una versión; `useProcedureList` conserva las tarjetas mientras llega la respuesta nueva.
- **Cubre:** D28; E31, E32. **Archivos:** `ProcedureEditorBody.tsx`, `ProcedureEditor.tsx`, `ProcedureList.tsx`, `useProcedureList.ts` y `ProcedureList.refresh.test.tsx`.
- **Verificación, test primero:** tras guardar el título la lista muestra el título nuevo; mientras la respuesta no llega no hay "Cargando procedimientos…"; tras publicar se pide la lista otra vez.
