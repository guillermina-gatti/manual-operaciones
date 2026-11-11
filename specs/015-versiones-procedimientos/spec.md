# Spec 015 · Versiones inmutables de procedimientos: publicar, historial, comparar y cambio crítico

- **Historia:** HU32 (5 puntos). Urgente: desbloquea el catálogo real de Mayra y, con él, HU33.
- **Responsable:** Micaela Franco (pareja B)
- **Depende de:** spec 006 (borradores, pasos y áreas; sus reglas R3, R4, R9 y R10 se usan tal cual), `docs/contracts/permissions-matrix.md` (solo el ADMIN publica), `UsersDirectory` de documentos (para el nombre de quien publicó) y el puerto `ProceduresCatalog` de Mayra (`executions/ports/procedures-catalog.ts`), que no se modifica. **Dependencia con Mayra:** para `/metricas` ella agrega `title` (el título del procedimiento) a `CatalogProcedureVersion` en el puerto; el adaptador de esta spec lo llena. Si el puerto todavía no lo tiene cuando se escriba el adaptador, este funciona sin título y llenarlo queda como tarea pendiente (D17).
- **Habilita:** HU33 (propuestas de cambio), HU28 (aprobación), HU38 (métricas por versión) y el catálogo real de ejecuciones.
- **Estado:** implementada (10/11/2026), Partes 1 y 2. Mejora visual de la pantalla del ADMIN (11/11/2026, pedido de Matías, boceto aprobado por el equipo): D21 a D26, R14, E24 a E29, T22 a T27 (solo front). Las preguntas de la aclaración pasaron a la sección 10 (D10 a D17); la prueba visual de la Parte 1 sumó D18 a D20 (pantalla). Los e2e los corre Micaela. Pendiente: el título del procedimiento en el catálogo cuando Mayra lo agregue al puerto (D17).

## 1. Problema y objetivo

La spec 006 permite escribir un procedimiento como borrador, pero ese borrador no llega a nadie: no hay forma de **publicarlo**. Sin publicar, ningún empleado ve procedimientos reales y las ejecuciones de Mayra siguen contra un catálogo en memoria.

Esta feature agrega el ciclo de vida de una versión: el ADMIN **publica** un borrador; la versión publicada queda **inmutable** con su propia copia de pasos; para cambiarla se crea una versión nueva; se puede ver el **historial**, **comparar** dos versiones y marcar un **cambio crítico** al publicar. La condición que no cambia nunca: **lo ya publicado no se modifica**; una ejecución que empezó con una versión la termina con esa misma versión, aunque después se publique otra.

## 2. Actores

- **ADMIN:** publica borradores, marca el cambio crítico, ve el historial y el detalle de cualquier versión y compara dos versiones. Es el único que opera sobre versiones (matriz de permisos: "Aprobar y publicar versiones" solo ADMIN).
- **SUPERVISOR y EMPLOYEE:** no publican ni ven historial ni versiones puntuales (403). Siguen viendo solo la versión vigente de sus áreas por el detalle del procedimiento (spec 006, R13).
- **Ejecuciones (Mayra) y propuestas de cambio (HU33):** consumen lo publicado por el puerto `ProceduresCatalog`. No se toca su código.

## 3. Alcance

**Parte 1 · publicar, inmutabilidad, nueva versión e historial**
- Publicar un borrador (con las condiciones de R3), con la anterior publicada pasando a reemplazada.
- La versión publicada y la reemplazada no se editan; conservan sus pasos.
- Crear una versión nueva desde la publicada (ya existe, spec 006 R4): aquí se verifica junto con publicar y se muestra en el historial.
- Historial de versiones de un procedimiento.
- Detalle de una versión con sus pasos (lo necesita la pantalla de solo lectura y comparar).
- Pantalla `/procedimientos/[id]`: línea de tiempo de versiones, "Publicar" con confirmación, versión publicada en solo lectura y "Crear nueva versión".
- **Al final de la Parte 1:** el adaptador real del puerto `ProceduresCatalog` de Mayra (`findPublished` y `findVersion`), sin tocar `executions/` (D12).

**Parte 2 · comparar y cambio crítico**
- Marcar un cambio crítico, con un resumen corto, al publicar; se ve en el historial.
- Comparar dos versiones: pasos agregados, quitados y modificados (API y pantalla).

## 4. Fuera de alcance

- **Aprobación:** el estado "pendiente de aprobación" y quién aprueba son HU28. HU32 no produce ese estado y no lo agrega al enum: lo agrega HU28 (D10).
- Propuestas de cambio (HU33), asignaciones, métricas (HU38) y datos de demostración (HU41).
- `ProceduresService.getStepContext` (Contrato 3 con la pareja C).
- Despublicar, volver a una versión vieja como vigente o borrar una versión publicada o reemplazada: nunca se puede.
- Que SUPERVISOR o EMPLOYEE vean el historial o versiones puntuales (D4).
- Notificar a nadie cuando se publica un cambio crítico.
- Adjuntos de los pasos (spec 006, última parte): quedan como están.

## 5. Flujos principales

**Publicar.** El ADMIN abre el borrador, comprueba que tenga pasos y áreas y toca "Publicar". Confirma, puede marcar "Cambio crítico" y escribir un resumen corto. El sistema pasa el borrador a publicada y la publicada anterior a reemplazada, en un solo paso indivisible.

**Corregir algo ya publicado.** El ADMIN toca "Crear nueva versión": se crea la versión N + 1 como borrador, con copia de los pasos de la vigente. Edita esa copia; la publicada no cambia. Cuando termina, publica.

**Ver el historial.** El ADMIN ve las versiones de un procedimiento, de la más nueva a la más vieja, con estado, fecha, quién publicó y si fue un cambio crítico con su resumen.

**Comparar.** El ADMIN elige dos versiones y ve qué pasos se agregaron, cuáles se quitaron y cuáles se modificaron.

## 6. Reglas de negocio

- **R1 · Quién.** Publicar, ver el historial, ver una versión puntual y comparar son solo del ADMIN. Sin sesión: 401. Con otro rol: 403, antes de mirar si el recurso existe (spec 006, R17).
- **R2 · Publicar.** `POST /api/procedures/:id/versions/:versionId/publish`. Pasa la versión de `DRAFT` a `PUBLISHED`, guarda quién y cuándo (`publishedById`, `publishedAt`, en UTC) y responde 200 con la versión publicada. El cuerpo es opcional: `{ isCritical?: boolean, changeSummary?: string }` (R5).
- **R3 · Condiciones para publicar.** La versión tiene que (a) existir y ser de ese procedimiento, (b) estar en `DRAFT`, (c) tener al menos un paso y (d) el procedimiento tiene que tener al menos un área. Si no se cumple, no cambia nada:
  - no existe o es de otro procedimiento: 404, con el mismo mensaje (no se revela cuál);
  - no está en `DRAFT` (ya publicada o reemplazada): 409 con `reason: "VERSION_NOT_DRAFT"`;
  - sin pasos: 409 con `reason: "NO_STEPS"`;
  - el procedimiento sin áreas: 409 con `reason: "NO_AREAS"` (anticipado en la spec 006, P6; D13).
- **R4 · Una sola publicada.** Un procedimiento tiene como máximo una versión `PUBLISHED` en todo momento, también si dos pedidos llegan a la vez. Al publicar, la `PUBLISHED` anterior (si hay) pasa a `SUPERSEDED` en la misma operación que publica la nueva: o se hacen las dos cosas o ninguna. Si dos ADMIN publican a la vez el mismo borrador, uno gana y el otro recibe 409 `VERSION_NOT_DRAFT`. La vigente sigue siendo la `PUBLISHED` más reciente (spec 006, sección 7).
- **R5 · Cambio crítico.** Al publicar se puede marcar `isCritical: true`. Con `isCritical: true`, `changeSummary` es obligatorio: de 1 a 300 caracteres sin contar espacios extremos (400 si falta o excede). Sin cambio crítico, el resumen es opcional con el mismo límite. `isCritical` por defecto es `false`. La marca y el resumen se guardan con la versión y no cambian después.
- **R6 · Inmutabilidad.** Una versión `PUBLISHED` o `SUPERSEDED` no se modifica: ni su título y descripción, ni sus pasos, ni el cambio crítico y su resumen. Editarla, agregar, editar, borrar o reordenar pasos: 409 con `reason: "VERSION_NOT_EDITABLE"` (spec 006, R9, que no cambia). Tampoco se borra (spec 006, R10).
- **R7 · Copia propia de pasos.** Cada versión tiene sus propios pasos, con identificadores propios. Al crear el borrador N + 1 desde la vigente (spec 006, R4) los pasos se copian con identificadores nuevos y la vigente no cambia. Cada paso tiene además una **clave de paso** (`step_key`, UUID) que genera el paso nuevo y que las copias conservan: es lo que permite reconocer "el mismo paso" entre versiones (R10). La clave no se expone en las respuestas y no cambia nunca. Los pasos de una versión publicada o reemplazada son siempre los mismos: mismo orden, mismos títulos y descripciones, mismos identificadores.
- **R8 · Historial.** `GET /api/procedures/:id/versions`: las versiones del procedimiento, de la más nueva a la más vieja, paginado con `?page` y `?limit` (por defecto 1 y 20; máximo 100; si no son válidos: 400), formato `{ data, total, page, limit }`. Cada ítem: `id`, `versionNumber`, `status`, `title`, `createdAt`, `publishedAt` (`null` si no se publicó), `publishedBy` (`{ id, name }` o `null`), `isCritical`, `changeSummary` (o `null`) y `stepCount`. Incluye el borrador si lo hay. El nombre sale del directorio de usuarios; si no lo conoce, `name` es `null` y `id` se conserva. Procedimiento inexistente: 404.
- **R9 · Detalle de una versión.** `GET /api/procedures/:id/versions/:versionId`: los mismos datos que el ítem del historial, la descripción y los pasos ordenados (`id`, `order`, `title`, `description`). Sirve para cualquier estado. No existe o es de otro procedimiento: 404, mismo mensaje.
- **R10 · Comparar.** `GET /api/procedures/:id/versions/compare?from=<versionId>&to=<versionId>`. Compara `from` con `to` y responde `{ from, to, added, removed, modified, unchanged }`:
  - `added`: pasos que están en `to` y no en `from`;
  - `removed`: pasos que están en `from` y no en `to`;
  - `modified`: pasos que están en las dos y cambiaron; cada ítem trae el paso antes y después y `changedFields` (`title`, `description` y/o `order`);
  - `unchanged`: cantidad de pasos iguales.
  Los pasos se reconocen como "el mismo" entre versiones por su clave de paso, que se conserva al copiar (R7, D11). `from` y `to` iguales: 400. Alguna de las dos no existe o es de otro procedimiento: 404, mismo mensaje. Vale para cualquier estado, incluido el borrador.
- **R11 · Qué no cambia al publicar.** Publicar no cambia los pasos, el título ni la descripción de ninguna versión; no cambia las áreas del procedimiento; no cambia las ejecuciones en curso (siguen con su versión, aunque ya sea `SUPERSEDED`); y no cambia lo que ve un SUPERVISOR o un EMPLOYEE más allá de pasar a ver la nueva vigente.
- **R12 · Catálogo de ejecuciones.** Lo publicado es lo que lee el catálogo de Mayra, por el puerto `ProceduresCatalog`, que no se modifica. El adaptador real (en esta spec, D12) cumple:
  - `findPublished(procedureId)`: la vigente (la `PUBLISHED` más reciente) con sus pasos ordenados, o `null` si el procedimiento no existe, no tiene versión publicada o la publicada no tiene pasos (spec 006, P17);
  - `findVersion(versionId)`: cualquier versión, también la `SUPERSEDED` y el borrador, con sus pasos ordenados, o `null` si no existe;
  - en ambos, `areaIds` son las áreas **actuales** del procedimiento, iguales para todas sus versiones;
  - cada paso trae `id`, `order` y `title`;
  - **título del procedimiento:** si `CatalogProcedureVersion` ya tiene `title` (lo agrega Mayra), el adaptador lo llena con el título de esa versión; si todavía no lo tiene, el adaptador funciona sin él y llenarlo queda como tarea pendiente (D17).
  El adaptador no cambia nada en `executions/`: el cambio de una línea en `executions.module.ts` lo hace Mayra.
- **R13 · Áreas de la base y errores.** Las reglas del equipo se mantienen: ids UUID (un id que no lo es: 400), fechas ISO 8601 en UTC, errores estándar de NestJS (`statusCode`, `message`, `error`; en los 409, además `reason`), validación en el servidor, y si la base no responde: 503 sin cambios a medias.
- **R14 · Pantalla del ADMIN (solo front, D21 a D26).** En `/procedimientos` y `/procedimientos/[id]` el ADMIN ve una pantalla única con el borrador: la tarjeta "Borrador" (título y descripción lado a lado, áreas como chips seleccionables, "Guardar cambios" y el tachito para descartar), "Pasos", "Versiones" con "Publicar" y la lista. Borrar un paso y descartar el borrador piden confirmación en un cartel modal. La API no cambia; la vista de SUPERVISOR y EMPLOYEE (spec 006) tampoco.

## 7. Estados

| Entidad | Transición permitida | La causa |
| --- | --- | --- |
| Versión | (nueva) → `DRAFT` | Crear el procedimiento o un borrador desde la vigente (spec 006, R2 y R4) |
| Versión | `DRAFT` → (eliminada) | Borrar el borrador (spec 006, R10) |
| Versión | `DRAFT` → `PUBLISHED` | Publicar (R2, R3) |
| Versión | `PUBLISHED` → `SUPERSEDED` | Publicar una versión más nueva del mismo procedimiento (R4) |

**Toda transición que no esté en la tabla es inválida.** En particular: `PUBLISHED` o `SUPERSEDED` no vuelven a `DRAFT`; `SUPERSEDED` no vuelve a `PUBLISHED`; un `DRAFT` no pasa directo a `SUPERSEDED`; una `PUBLISHED` o `SUPERSEDED` no se publica de nuevo (409 `VERSION_NOT_DRAFT`) ni se borra (409 `VERSION_NOT_EDITABLE`).

"Pendiente de aprobación" (`DRAFT` → pendiente → `PUBLISHED`) llega con HU28, que agrega el valor al enum y sus transiciones: hoy publicar es directo (D10).

## 8. Casos borde

- Publicar un borrador de un procedimiento que nunca tuvo publicada: no hay nada que reemplazar; queda como única `PUBLISHED`.
- Dos ADMIN publican el mismo borrador a la vez: uno gana, el otro recibe 409 `VERSION_NOT_DRAFT` (R4).
- Se publica un borrador y, a la vez, otro ADMIN pide un borrador nuevo desde la vigente: la copia sale de la `PUBLISHED` que haya en ese momento; nunca queda un procedimiento con dos publicadas ni con dos borradores.
- Falla la base a mitad de publicar: 503 y no cambia nada; no quedan dos `PUBLISHED` ni ninguna (R4).
- Se publica una versión y una ejecución de Mayra tiene en curso la anterior: la ejecución sigue con su versión `SUPERSEDED` (R11).
- Un ADMIN pide el historial de un procedimiento con una sola versión (el borrador): lista de un ítem.
- Se compara una versión con el borrador: sirve; los pasos del borrador son los que tiene en ese momento.
- Se compara `from` y `to` con los mismos pasos: `added`, `removed` y `modified` vacíos y `unchanged` con la cantidad.
- Un paso solo cambió de lugar: aparece en `modified` con `changedFields: ["order"]`.
- Un resumen de solo espacios: inválido (R5).
- Una versión de otro procedimiento en la ruta: 404, igual que una inexistente (R3, R9, R10).
- `isCritical` que no es booleano, o campos que no existen en el cuerpo: 400.

## 9. Restricciones no funcionales

- Respuestas de error en el formato estándar de NestJS, con `reason` en los 409; los mensajes, en español (spec 006, P16).
- Identificadores UUID y fechas ISO 8601 en UTC.
- Todos los endpoints documentados en Swagger con todos sus códigos.
- Toda validación en el servidor; el rol y los guards son los reales (`JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`).
- Publicar es atómico (R4): una transacción con bloqueo del procedimiento, y un índice único parcial en la base que impide dos `PUBLISHED` (decisión D5).
- Las respuestas no incluyen campos internos.
- Los archivos nuevos son cortos y de una responsabilidad (servicio de versiones, controlador de versiones y repositorio de versiones aparte), sin agrandar los del módulo.

## 10. Decisiones

Tomadas el 10/11/2026 por ser menores; la regla correspondiente las usa.

| Decisión | Detalle | Regla |
| --- | --- | --- |
| D1 · Motivos de los 409 | Nuevos: `VERSION_NOT_DRAFT`, `NO_STEPS` y `NO_AREAS`. Se reutiliza `VERSION_NOT_EDITABLE` para editar o borrar lo publicado | R3, R6 |
| D2 · Historial paginado | Se pagina como todos los listados del equipo, aunque suele ser corto | R8 |
| D3 · Largo del resumen | De 1 a 300 caracteres sin espacios extremos | R5 |
| D4 · Quién ve versiones | Solo el ADMIN (matriz de permisos y spec 006, R17). SUPERVISOR y EMPLOYEE no ven historial; como la ruta es de ADMIN, un procedimiento "de otra área" no se distingue: para otros roles gana el 403 | R1 |
| D5 · Una sola publicada | Se garantiza con transacción más índice único parcial `procedure_versions_one_published_idx` (`status = PUBLISHED`), igual que el borrador | R4 |
| D6 · Quién publicó | La respuesta trae `{ id, name }`; el nombre sale de `UsersDirectory.findById`; si no lo conoce, `name` es `null` | R8 |
| D7 · Cómo se pide comparar | Con `?from` y `?to` en la ruta `versions/compare`, antes de `versions/:versionId` en el controlador | R10 |
| D8 · Cuerpo de publicar | Opcional; `{}` publica sin cambio crítico. Campos desconocidos: 400 (el `ValidationPipe` global) | R2, R5 |
| D9 · Mensajes | En español, con el mismo patrón de `http-errors.ts` del módulo | R13 |
| D10 · "Pendiente de aprobación" | No se agrega al enum: lo agrega HU28 junto con sus transiciones. Queda nombrado como futuro en la sección 7 | Sección 7 |
| D11 · Reconocer "el mismo paso" | Columna nueva `steps.step_key` (UUID). El paso nuevo genera una; las copias la conservan. En la migración, los pasos existentes quedan con `step_key = id`. No cambia a Mayra: su `ExecutionStep.stepId` sigue siendo el id del paso de la versión | R7, R10 |
| D12 · Adaptador del catálogo | Va dentro de HU32, como última tarea de la Parte 1: solo `findPublished` y `findVersion` sobre Prisma. No se toca `executions/`; Mayra cambia su línea de `executions.module.ts` | R12 |
| D13 · Publicar sin áreas | 409 con `reason: "NO_AREAS"` | R3 |
| D14 · Resumen del cambio | Obligatorio solo si es cambio crítico; opcional si no lo es | R5 |
| D15 · Detalle de una versión | Se incluye `GET …/versions/:versionId` con sus pasos; HU11 lo reutiliza | R9 |
| D16 · Quién ve versiones | Solo el ADMIN. SUPERVISOR y EMPLOYEE reciben 403, también si el recurso no existe. El 404 es "no existe" o "la versión no es de ese procedimiento" | R1 |
| D17 · Título en el catálogo | Mayra agrega `title` a `CatalogProcedureVersion` para `/metricas`; el adaptador lo llena con el título de la versión. Si el puerto aún no lo tiene, el adaptador funciona sin título y llenarlo queda como tarea pendiente | R12 |
| D18 · Historial al día en la pantalla | Cuando cambian el título, la descripción o los pasos del borrador, la pantalla pide el historial otra vez y deja a la vista la lista anterior mientras llega la nueva, para que el conteo de pasos de la línea de tiempo no quede viejo | R8 |
| D19 · Estado real en la lista | La copia local del procedimiento guarda el estado de su versión (la pantalla lo aprende del historial); la lista de `/procedimientos` y el editor muestran el mismo texto: "Versión N · borrador", "publicada" o "reemplazada" | R6, R8 |
| D20 · Texto de la confirmación | "La versión vigente pasa a reemplazada" solo se dice si hay una versión publicada; en la primera publicación dice "Va a ser la versión vigente" | R4 |
| D21 · Pantalla única | Al crear un procedimiento, en `/procedimientos` el formulario de creación pasa a mostrar el borrador recién creado (editable) y la lista de abajo se actualiza. Desaparece el paso intermedio "Procedimiento creado. Abrir el borrador". Al descartar el borrador vuelve el formulario de creación | R14 |
| D22 · Tarjeta "Borrador" | Título y Descripción lado a lado desde `sm` (uno abajo del otro en el celular); las áreas son chips seleccionables dentro de la misma tarjeta; "Guardar cambios" guarda título, descripción y áreas (solo llama a la API por lo que cambió); "Descartar borrador" pasa a un botón con ícono de tachito rojo y `aria-label="Descartar borrador"`. Mientras la versión es borrador no hay sección "Áreas" ni "Guardar áreas" aparte; una versión que no es borrador sigue con su sección "Áreas" (spec 006, HU10) | R14 |
| D23 · Pasos | El título es "Pasos", sin "N de 50". El límite de 50 sigue en la API; al llegar a 50 la pantalla lo dice y no ofrece "+ Agregar paso" | R14 |
| D24 · Fila de paso | Fondo salvia, número en círculo verde (el mismo de HU11), botones ↑, ↓, "Editar" y tachito rojo con `aria-label="Borrar el paso <título>"`. "+ Agregar paso" es un botón con borde punteado que abre el formulario del paso | R14 |
| D25 · Cartel de confirmación | Borrar un paso y descartar el borrador piden confirmación en un `<dialog>` modal (`aria-modal="true"`, foco atrapado, Esc cierra, "Cancelar" con el foco inicial). Encabezado salvia, círculo rojo con "!", título "¿Borrar el paso «X»?" o "¿Descartar el borrador?", botones "Cancelar" y "Sí, borrar" (rojo). Texto del paso: "Se quita del borrador y los demás pasos se vuelven a numerar. No se puede deshacer." Texto de descartar: dice lo que pasa de verdad (se borra el borrador con sus pasos y, si es la única versión, el procedimiento con sus áreas) | R14 |
| D26 · Áreas inactivas | Un área inactiva se muestra como "Nombre (inactiva)", solo si el procedimiento ya la tiene; una inactiva nueva no se puede marcar (la API diría 400) | R14 |

## 11. Preguntas abiertas

Las siete preguntas de la aclaración (10/11/2026) están respondidas y pasaron a la sección 10 (D10 a D17). **No queda ninguna pregunta crítica abierta.** Dependencias a coordinar, que no cambian el comportamiento:

- **Mayra:** agregar `title` a `CatalogProcedureVersion` (D17) y cambiar la línea de `executions.module.ts` cuando exista el adaptador (D12). Mientras el puerto no tenga `title`, el adaptador funciona sin él.
- **HU28 (aprobación):** va a agregar `PENDING_APPROVAL` al enum y sus transiciones (D10); este diseño no lo impide.
- **HU11:** reutiliza `GET …/versions/:versionId` (D15).

## 12. Criterios de aceptación

```gherkin
# --- Parte 1 · publicar, inmutabilidad, nueva versión, historial ---

Escenario: E1 · publicar un borrador
  Dado un ADMIN con sesión y un procedimiento con un borrador de 2 pasos y una área
  Cuando publica el borrador
  Entonces la respuesta es 200 y la versión queda PUBLISHED
  Y trae quién la publicó y cuándo, en UTC
  Y el procedimiento tiene una sola versión PUBLISHED

Escenario: E2 · la anterior pasa a reemplazada
  Dado un procedimiento con la versión 1 PUBLISHED y un borrador 2 con un paso
  Cuando el ADMIN publica la versión 2
  Entonces la versión 2 queda PUBLISHED
  Y la versión 1 queda SUPERSEDED
  Y sigue habiendo una sola PUBLISHED

Escenario: E3 · una versión sin pasos no se publica
  Dado un borrador sin pasos
  Cuando el ADMIN intenta publicarlo
  Entonces la respuesta es 409 con reason "NO_STEPS"
  Y el borrador sigue en DRAFT

Escenario: E4 · un procedimiento sin áreas no se publica
  Dado un borrador con pasos en un procedimiento sin áreas
  Cuando el ADMIN intenta publicarlo
  Entonces la respuesta es 409 con reason "NO_AREAS"
  Y el borrador sigue en DRAFT

Escenario: E5 · solo se publica un borrador
  Dado una versión PUBLISHED y una SUPERSEDED
  Cuando el ADMIN intenta publicar cada una
  Entonces ambas respuestas son 409 con reason "VERSION_NOT_DRAFT"
  Y ninguna cambia de estado

Escenario: E6 · la versión publicada no se edita (lo que NO cambia)
  Dado una versión PUBLISHED con tres pasos
  Cuando el ADMIN intenta cambiar su título, o agregar, editar, borrar o reordenar un paso
  Entonces cada respuesta es 409 con reason "VERSION_NOT_EDITABLE"
  Y la versión conserva su título, su descripción y sus tres pasos, con los mismos identificadores y el mismo orden

Escenario: E7 · crear una nueva versión desde la publicada
  Dado una versión PUBLISHED con tres pasos
  Cuando el ADMIN crea una versión nueva
  Entonces se crea la versión siguiente en DRAFT con una copia de los tres pasos, con identificadores nuevos
  Y la versión PUBLISHED conserva sus tres pasos sin cambios
  Y editar el borrador no cambia la PUBLISHED

Escenario: E8 · historial
  Dado un procedimiento con la versión 1 SUPERSEDED, la 2 PUBLISHED y la 3 DRAFT
  Cuando el ADMIN pide el historial
  Entonces recibe { data, total: 3, page, limit } con la versión 3, la 2 y la 1, en ese orden
  Y cada ítem trae número, estado, fecha, quién publicó, si fue cambio crítico y su resumen

Escenario: E9 · detalle de una versión
  Dado una versión SUPERSEDED con dos pasos
  Cuando el ADMIN pide su detalle
  Entonces recibe sus datos y sus dos pasos ordenados

# --- Parte 2 · cambio crítico y comparar ---

Escenario: E10 · publicar como cambio crítico
  Dado un borrador listo para publicar
  Cuando el ADMIN lo publica con isCritical true y el resumen "Cambia el límite de caja"
  Entonces la versión queda PUBLISHED con isCritical true y ese resumen
  Y el historial lo muestra como cambio crítico, con el resumen

Escenario: E11 · el cambio crítico exige resumen
  Dado un borrador listo para publicar
  Cuando el ADMIN intenta publicarlo con isCritical true sin resumen, con un resumen de solo espacios o de más de 300 caracteres
  Entonces la respuesta es 400, indicando el campo
  Y el borrador sigue en DRAFT

Escenario: E12 · comparar dos versiones
  Dado la versión 1 con los pasos A, B y C, y la versión 2 con A, B con otra descripción y D
  Cuando el ADMIN compara la 1 con la 2
  Entonces D figura como agregado
  Y C figura como quitado
  Y B figura como modificado, con changedFields ["description"]
  Y A cuenta como sin cambios

Escenario: E13 · un paso que solo cambia de lugar
  Dado dos versiones con los mismos pasos, y uno cambió de posición
  Cuando el ADMIN las compara
  Entonces ese paso figura como modificado con changedFields ["order"]

Escenario: E14 · comparar una versión consigo misma
  Dado una versión
  Cuando el ADMIN compara from y to con el mismo identificador
  Entonces la respuesta es 400

# --- Transversales ---

Escenario: E15 · rol sin permiso o sin sesión
  Dado un SUPERVISOR o un EMPLOYEE con sesión
  Cuando intenta publicar, pedir el historial, el detalle de una versión o comparar
  Entonces cada respuesta es 403, también si el procedimiento no existe
  Y la misma petición sin sesión responde 401
  Y no se guarda ningún cambio

Escenario: E16 · inexistente o de otro procedimiento
  Dado un ADMIN con sesión
  Cuando usa un procedimiento inexistente, o una versión que es de otro procedimiento, al publicar, ver el detalle o comparar
  Entonces la respuesta es 404, con el mismo mensaje en todos los casos

Escenario: E17 · datos inválidos
  Dado un ADMIN con sesión
  Cuando manda un id que no es UUID, isCritical que no es booleano o un campo que no existe
  Entonces la respuesta es 400, indicando qué falló
  Y no cambia nada

Escenario: E18 · dos publicaciones a la vez
  Dado un borrador listo
  Cuando dos ADMIN lo publican al mismo tiempo
  Entonces uno recibe 200 y el otro 409 con reason "VERSION_NOT_DRAFT"
  Y el procedimiento queda con una sola PUBLISHED

Escenario: E19 · lo publicado y las ejecuciones (lo que NO cambia)
  Dado una ejecución de Mayra en curso con la versión 1
  Cuando el ADMIN publica la versión 2
  Entonces la versión 1 queda SUPERSEDED y sigue legible con sus pasos
  Y la ejecución sigue con la versión 1
  Y findPublished devuelve la versión 2 y findVersion devuelve la 1

Escenario: E20 · falla la base al publicar
  Dado un borrador listo
  Cuando la base deja de responder a mitad de publicar
  Entonces la respuesta es 503
  Y no quedan dos PUBLISHED ni ninguna: el estado anterior se conserva

Escenario: E21 · el catálogo de ejecuciones lee lo publicado
  Dado un procedimiento en Ventas con la versión 1 SUPERSEDED y la 2 PUBLISHED con dos pasos
  Cuando el catálogo pide findPublished del procedimiento
  Entonces recibe la versión 2 con sus dos pasos ordenados y las áreas actuales del procedimiento
  Y findVersion de la versión 1 devuelve la 1 con sus pasos, también reemplazada
  Y findVersion de un id que no existe devuelve null

Escenario: E22 · sin versión publicada utilizable el catálogo dice null
  Dado un procedimiento con solo un borrador, o con una PUBLISHED sin pasos
  Cuando el catálogo pide findPublished
  Entonces devuelve null, como si no tuviera versión publicada

Escenario: E23 · el título en el catálogo
  Dado el puerto ProceduresCatalog con title en CatalogProcedureVersion
  Cuando el catálogo pide findPublished o findVersion
  Entonces el resultado trae el título de esa versión
  Y si el puerto todavía no tiene title, el adaptador devuelve lo mismo sin él

Escenario: E24 · crear muestra el borrador en la misma pantalla
  Dado un ADMIN en /procedimientos
  Cuando crea un procedimiento con título "Recepción de mercadería"
  Entonces la misma pantalla muestra el borrador con "Versión 1 · borrador"
  Y no aparece "Abrir el borrador" y la lista de abajo incluye el procedimiento nuevo

Escenario: E25 · guardar cambios guarda título, descripción y áreas
  Dado un borrador con el área Operaciones, y el ADMIN marca Ventas y cambia el título
  Cuando aprieta "Guardar cambios"
  Entonces se guardan el título y las áreas, y el aviso dice "Cambios guardados."
  Y si no cambió nada, dice "No hay cambios para guardar." y no llama a la API

Escenario: E26 · borrar un paso pide confirmación
  Dado un borrador con los pasos "Revisar el remito" y "Contar las cajas"
  Cuando el ADMIN aprieta el tachito de "Contar las cajas"
  Entonces aparece el cartel "¿Borrar el paso «Contar las cajas»?" y todavía no se llamó a la API
  Y "Cancelar" o Esc lo cierran sin borrar
  Y "Sí, borrar" borra el paso y los demás se vuelven a numerar

Escenario: E27 · descartar el borrador pide confirmación
  Dado un borrador abierto
  Cuando el ADMIN aprieta el tachito "Descartar borrador"
  Entonces aparece "¿Descartar el borrador?" y "Sí, borrar" lo descarta
  Y la versión publicada del procedimiento conserva sus pasos

Escenario: E28 · pasos sin límite a la vista
  Dado un borrador con 2 pasos
  Entonces el título es "Pasos" (sin "2 de 50") y "+ Agregar paso" abre el formulario del paso

Escenario: E29 · áreas inactivas
  Dado un procedimiento con el área "Compras" inactiva y el área "Ventas" activa
  Entonces el borrador muestra "Compras (inactiva)" y "Ventas"
  Y una inactiva que el procedimiento no tiene no aparece para marcarla
```

## 13. Trazabilidad

Se completa al escribir el plan y las tareas (`plan.md` y `tasks.md`): regla → escenario → tarea → test → resultado.

| Regla | Escenarios |
| --- | --- |
| R1 | E15 |
| R2 | E1, E10 |
| R3 | E3, E4, E5, E16 |
| R4 | E2, E18, E20 |
| R5 | E10, E11 |
| R6 | E6 |
| R7 | E6, E7 |
| R8 | E8 |
| R9 | E9 |
| R10 | E12, E13, E14 |
| R11 | E19 |
| R12 | E19, E21, E22, E23 |
| R13 | E16, E17, E20 |
| R14 | E24, E25, E26, E27, E28, E29 |
