# Spec 006 · Procedimientos: borradores, áreas y visibilidad

- **Historias:** HU09 (procedimientos como borrador, con pasos ordenados y reordenables), HU10 (asignar procedimientos a áreas), HU11 (cada empleado ve solo los procedimientos de sus áreas) y, como última parte, los adjuntos de los pasos (HU09).
- **Responsable:** Micaela Franco (pareja B)
- **Depende de:** spec 005 de Mayra (ejecuciones; el puerto está en `apps/api/src/executions/ports/procedures-catalog.ts`), `docs/contracts/` (usuarios, áreas y matriz de permisos), `UsersDirectory` y `AreasDirectory` de la pareja A y, para los adjuntos, `StorageModule` e `inspectFile` de la pareja C (se usan sin modificarlos).
- **Habilita:** HU32 (publicar, historial, comparar y cambio crítico), que es lo que desbloquea el catálogo real de Mayra, y más adelante HU28, HU33 y HU38.
- **Estado:** borrador para revisión (27/10/2026). Las decisiones de la etapa de aclaración están en la sección 10; no quedan preguntas que bloqueen (sección 11). No hay código ni cambios de esquema todavía.

## 1. Problema y objetivo

Hoy el sistema no tiene procedimientos: las ejecuciones paso a paso (spec 005) trabajan contra un catálogo en memoria. Nadie puede escribir un procedimiento, ordenar sus pasos ni decidir qué áreas lo ven.

Esta feature permite al administrador **crear y editar procedimientos como borrador**, con pasos ordenados y reordenables; **asignarlos a una o varias áreas**; y hace que cada empleado vea **solo los procedimientos de sus áreas**. Siempre se cumple una condición: lo que ya se publicó no cambia; lo que se edita es una copia nueva (el borrador).

Publicar queda fuera (HU32). Por eso, al terminar esta spec, un empleado todavía no ve procedimientos reales: hace falta una versión `PUBLISHED`, que en esta etapa solo existe en los datos de prueba.

## 2. Actores

- **ADMIN:** crea procedimientos, edita borradores y sus pasos, borra borradores, asigna áreas y ve todo, incluidos los borradores y las versiones viejas.
- **SUPERVISOR y EMPLOYEE:** ven la versión vigente de los procedimientos de sus áreas. No ven borradores ni versiones reemplazadas, y no pueden modificar nada.
- **Ejecuciones (Mayra):** consume más adelante, por el puerto `ProceduresCatalog`, lo que esta feature guarda. No se toca su código.

## 3. Alcance

- Crear un procedimiento (con su primer borrador, la versión 1).
- Editar el título y la descripción de un borrador.
- Agregar, editar, borrar y reordenar los pasos de un borrador (título y descripción).
- Crear un borrador nuevo a partir de la versión vigente (la versión siguiente).
- Borrar un borrador.
- Asignar las áreas de un procedimiento (HU10).
- Listar y ver procedimientos según el rol y las áreas (HU11).
- **Al final:** adjuntar archivos a los pasos de un borrador, verlos, descargarlos y borrarlos.

## 4. Fuera de alcance

- Publicar una versión, el historial, comparar versiones y marcar un cambio crítico (HU32). La regla "no se puede publicar sin al menos un área" es de HU32.
- El adaptador real de `ProceduresCatalog` para Mayra (HU32) y `ProceduresService.getStepContext` (Contrato 3 con la pareja C): salen de esta base, pero son posteriores.
- El estado "pendiente de aprobación" y la aprobación (HU28), las propuestas de cambio (HU33) y las asignaciones (`assignments`).
- El panel de métricas (HU38) y los datos de demostración (HU41).
- Las pantallas del frontend: van en una spec aparte, sobre estos mismos endpoints.
- Borrar una versión publicada o reemplazada: nunca se puede.
- Archivar o desactivar un procedimiento.

## 5. Flujos principales

**Crear.** El ADMIN indica título y, si quiere, descripción. El sistema crea el procedimiento con su versión 1 en borrador, sin pasos y sin áreas.

**Editar el borrador.** El ADMIN cambia el título o la descripción del borrador, agrega pasos, los edita, los borra o los reordena. Un borrador puede quedar vacío o sin áreas.

**Editar uno ya publicado.** El ADMIN pide un borrador nuevo del procedimiento. El sistema crea la versión siguiente como copia de la vigente (mismos datos y pasos, con identificadores nuevos). Se edita esa copia; la vigente no cambia.

**Asignar áreas.** El ADMIN define a qué áreas pertenece el procedimiento. Las áreas son del procedimiento, no de una versión: el cambio vale para todas sus versiones.

**Consultar.** Cada usuario pide el listado y recibe solo lo que puede ver. El empleado abre un procedimiento y ve la versión vigente con sus pasos.

## 6. Reglas de negocio

**Procedimientos y borradores**

- **R1 · Quién modifica.** Solo un ADMIN puede crear procedimientos, editar borradores y sus pasos, borrar borradores y asignar áreas. Sin sesión: 401. Con otro rol: 403.
- **R2 · Crear.** Título de 1 a 200 caracteres (sin contar espacios al principio y al final) y descripción opcional de hasta 1000. Se crea el procedimiento con su versión 1 en `DRAFT`, sin pasos ni áreas. El ADMIN que lo crea queda como responsable (P10). Respuesta: 201. Si falta un dato obligatorio o alguno es inválido: 400, indicando qué campo falló.
- **R3 · Un solo borrador abierto.** Un procedimiento tiene como máximo una versión `DRAFT` en todo momento, también si dos pedidos llegan a la vez. Pedir un segundo borrador: 409 con `reason: "DRAFT_ALREADY_EXISTS"`.
- **R4 · Borrador nuevo desde la vigente.** Si el procedimiento tiene una versión `PUBLISHED` y ningún borrador abierto, se crea una versión nueva en `DRAFT` con el número siguiente al mayor existente, con el mismo título, descripción y pasos (mismo orden) que la vigente. Los pasos copiados tienen identificadores nuevos. La vigente no cambia. Respuesta: 201. Si no hay versión `PUBLISHED`: 409 con `reason: "NO_PUBLISHED_VERSION"`.
- **R5 · Editar el borrador.** Se pueden cambiar el título y la descripción de la versión (cada versión guarda los suyos, P11), con las mismas validaciones que en R2. El pedido tiene que traer al menos un campo (400 si no).

**Pasos**

- **R6 · Paso.** Título de 1 a 200 caracteres (sin contar espacios extremos) y descripción opcional de hasta 2000. Sin descripción, se devuelve como texto vacío. Un borrador admite hasta 50 pasos; el 51.º: 409 con `reason: "STEP_LIMIT_REACHED"`.
- **R7 · Orden contiguo.** Los pasos de una versión tienen orden 1, 2, …, n, sin huecos ni repetidos. Un paso nuevo va al final, o en la posición que se indique (de 1 a n + 1); los demás se corren. Al borrar un paso, los siguientes bajan un lugar.
- **R8 · Reordenar.** El pedido trae la lista completa de identificadores de paso en el orden nuevo. Tiene que contener exactamente los pasos del borrador, una vez cada uno; si falta alguno, sobra alguno o hay repetidos: 400 y el orden no cambia. Reordenar no cambia los identificadores de los pasos.

**Edición y borrado**

- **R9 · Solo se editan borradores.** Cambiar datos, agregar, editar, borrar o reordenar pasos de una versión `PUBLISHED` o `SUPERSEDED`: 409 con `reason: "VERSION_NOT_EDITABLE"`. La versión no cambia.
- **R10 · Borrar un borrador.** Se borra la versión `DRAFT` con sus pasos. Si el procedimiento no tiene ninguna otra versión, se borra también el procedimiento con sus áreas. Una versión `PUBLISHED` o `SUPERSEDED` no se borra nunca: 409 con `reason: "VERSION_NOT_EDITABLE"`. Respuesta: 204.

**Áreas (HU10)**

- **R11 · Asignar áreas.** El ADMIN define el conjunto de áreas del procedimiento; el pedido reemplaza el conjunto anterior. Puede ser vacío. No puede tener repetidos, y todas las áreas tienen que existir (400 si no). Un área inactiva solo se acepta si el procedimiento ya la tenía: agregar una inactiva que no tenía es 400, conservarla es válido y quitarla también (P13). Se puede cambiar sin importar el estado de sus versiones, incluso si hay un borrador abierto. Como mucho 100 áreas por pedido. Los repetidos se rechazan por formato (400 nombrando el campo `areaIds`); las inexistentes y las inactivas nuevas, consultando el estado de las áreas (400). Si el pedido trae varios defectos, o un procedimiento inexistente con áreas inválidas, gana el 400.
- **R12 · Efecto inmediato.** El cambio de áreas rige desde el pedido siguiente: un usuario que pierde un área recibe 404 en ese procedimiento, también si tiene una ejecución en curso (acuerdo con la spec 005, P17).

**Visibilidad (HU11)**

- **R13 · Qué ve cada rol.** El ADMIN ve todos los procedimientos y todas sus versiones. SUPERVISOR y EMPLOYEE ven un procedimiento solo si tiene una versión `PUBLISHED` con al menos un paso y comparten al menos un área con él; ven únicamente la versión vigente (la `PUBLISHED` más reciente) con sus pasos, nunca un `DRAFT` ni un `SUPERSEDED`. Una versión publicada sin pasos cuenta como sin versión publicada, igual que en el catálogo de ejecuciones (P17).
- **R14 · Recurso ajeno o inexistente.** Pedir el detalle de un procedimiento que no existe, que es de otra área o que no tiene versión publicada (para quien no es ADMIN) devuelve 404, con el mismo mensaje en todos los casos. Así no se revela si existe.
- **R15 · Áreas de la base.** Las áreas del usuario se leen del directorio en cada pedido, nunca de la sesión ni del navegador. Un usuario que el directorio no conoce, o sin áreas, no ve ningún procedimiento. Si el directorio o la base no responden: 503; nunca se concede acceso por defecto.
- **R16 · Listado.** Paginado con `?page` y `?limit` (por defecto 1 y 20; máximo 100). Si `limit` es mayor a 100, o `page` o `limit` no son válidos: 400. Ordenado del más nuevo al más viejo. Formato: `{ data, total, page, limit }`. Cada ítem muestra los datos de la versión vigente (el ADMIN, que ve también los que no se publicaron, ve los del borrador) y las áreas del procedimiento; al ADMIN se le indica además si tiene un borrador abierto.
- **R17 · Versiones solo para el ADMIN.** Las rutas que muestran una versión puntual, incluido un borrador, son solo del ADMIN. Para los demás roles: 403.

**Adjuntos (última parte)**

- **R18 · Adjuntar.** El ADMIN adjunta un archivo a un paso de un borrador. El archivo sigue las mismas reglas que en documentos (`inspectFile`): PDF, `.txt` o `.md`, comprobado por contenido, hasta 10 MB; tipo no aceptado: 415; más grande: 413; vacío: 400 (P14).
- **R19 · Cantidad.** Hasta 5 adjuntos por paso; el 6.º: 409 con `reason: "ATTACHMENT_LIMIT_REACHED"`.
- **R20 · Todo o nada.** Si falla el almacenamiento o la base al adjuntar, la respuesta es 503 y no queda ni el archivo guardado ni el adjunto registrado. El nombre con que se guarda lo genera el sistema; el original solo se conserva como dato para mostrarlo.
- **R21 · Ver y descargar.** Los adjuntos se ven y se descargan con las mismas reglas de visibilidad que el paso (R13, R14). La descarga devuelve un enlace que vence a los 5 minutos y se genera solo después de comprobar el acceso.
- **R22 · Borrar un adjunto.** Solo el ADMIN, y solo de un paso de un borrador; el archivo se borra del almacenamiento cuando ninguna versión lo usa. En una versión `PUBLISHED` o `SUPERSEDED`: 409 con `reason: "VERSION_NOT_EDITABLE"`.
- **R23 · Herencia.** Al crear un borrador desde la vigente (R4), sus pasos conservan los adjuntos, compartiendo el archivo guardado. Borrar un adjunto en el borrador no cambia ni borra el de la versión publicada (P14).

## 7. Estados

| Entidad | Transiciones permitidas en esta spec | Las causa |
| --- | --- | --- |
| Versión | (nueva) → `DRAFT` | Crear el procedimiento (R2) o un borrador desde la vigente (R4) |
| Versión | `DRAFT` → (eliminada) | Borrar el borrador (R10) |
| Procedimiento | (eliminado) | Borrar su único borrador (R10) |

Fuera de esta spec, y definidas por HU32: `DRAFT` → `PUBLISHED` (publicar) y `PUBLISHED` → `SUPERSEDED` (cuando se publica una versión más nueva). Aquí `PUBLISHED` y `SUPERSEDED` existen solo en los datos de prueba. La vigente es la `PUBLISHED` más reciente.

Toda transición que no esté en la tabla es inválida: una versión `PUBLISHED` o `SUPERSEDED` no vuelve a `DRAFT` ni se borra (R9, R10).

## 8. Casos borde

- Un borrador sin pasos o sin áreas es válido; la validación de publicar es de HU32.
- Dos ADMIN piden un borrador nuevo del mismo procedimiento a la vez: solo uno se crea, el otro recibe 409 (R3).
- Se reordena con una lista armada antes de que otro ADMIN agregara o borrara un paso: 400, el orden no cambia (R8).
- Se borra un paso mientras otro pedido lo reordena: los pedidos se aplican uno después del otro; ninguno deja el orden con huecos (R7).
- El título trae espacios al principio o al final: se recortan; uno de solo espacios es inválido (R2).
- Un identificador que no es un UUID: 400.
- Un empleado pide una versión por su identificador, aunque sea la vigente: 403 (R17); el detalle del procedimiento ya le muestra la vigente.
- Se cambian las áreas mientras alguien ejecuta el procedimiento: rige desde el pedido siguiente (R12).
- Se desactiva un área que tiene procedimientos asignados: los procedimientos la conservan; el ADMIN puede mantenerla o quitarla, pero no volver a agregarla (R11).
- El procedimiento solo tiene un borrador y se borra: desaparece el procedimiento con sus áreas, sus pasos y sus adjuntos (R10).
- Una versión publicada sin pasos no se muestra a SUPERVISOR ni a EMPLOYEE (R13).
- Falla el directorio de usuarios mientras se lista: 503, no se lista sin filtro (R15).
- Se pierde la conexión al almacenar un adjunto: 503 y nada a medias (R20).

## 9. Restricciones no funcionales

- Las respuestas de error siguen el formato estándar de NestJS (`statusCode`, `message`, `error`; en los 409, además `reason`).
- Identificadores UUID y fechas ISO 8601 en UTC.
- Los endpoints se documentan en Swagger, con todos sus códigos de respuesta.
- Toda validación se hace en el servidor. Rol no alcanza: para los recursos con áreas se comprueba también el área, para no exponer recursos ajenos.
- Las respuestas no incluyen campos internos que el usuario no necesita.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 27/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿En qué idioma se escribe? | Las specs, en español. El código y los comentarios, en inglés, como `executions`. Los mensajes de error HTTP, en español, porque los ve el usuario (P16) | Plan, sección 6 |
| P2 · ¿Qué es un borrador? | Una versión N + 1 en estado `DRAFT`, con máximo un borrador abierto por procedimiento | R3, R4 |
| P3 · ¿Qué pasa con la versión anterior al publicar? | Pasa a `SUPERSEDED` y sigue accesible para ejecuciones (Mayra). La vigente es la última `PUBLISHED` | Sección 7 |
| P4 · ¿"Pendiente de aprobación"? | Fuera de alcance: es HU28 | Sección 4 |
| P5 · ¿Quién crea y edita borradores? | Solo el ADMIN | R1 |
| P6 · ¿Cuándo se asignan las áreas? | La tabla de áreas va en la migración de HU09 y los endpoints en HU10. Un borrador puede no tener áreas; publicar sin al menos una se rechaza en HU32 | R11 |
| P7 · ¿Se pueden borrar? | Un borrador sí; una versión publicada, nunca | R10 |
| P8 · ¿Qué son los adjuntos? | Archivos subidos (confirmado por Matías), con `StorageModule` e `inspectFile` de documentos, sin modificarlos. Van como últimas tareas | R18 a R23 |
| P9 · ¿Qué límites tienen los pasos? | Título 200, descripción 2000 y hasta 50 pasos por borrador | R6 |
| P10 · ¿Quién es el responsable? | El ADMIN que crea el procedimiento. El nombre y el email que pide el Contrato 3 se leen más adelante, con una ampliación del directorio de la pareja A | R2 |
| P11 · ¿Título y descripción son del procedimiento o de la versión? | De cada versión: una publicada no cambia cuando se edita el borrador | R5, R16 |
| P12 · ¿Crear un borrador desde la vigente entra en esta spec? | Sí. En los tests, la versión publicada se inserta a mano | R4 |
| P13 · ¿Se asignan áreas inactivas? | Solo las que el procedimiento ya tenía. Agregar una inactiva nueva es 400 (igual que una inexistente), conservarla o quitarla es válido. Alinea con A-06.2 (`docs/contracts/A-06.2-listado-areas.md`, líneas 72 a 74) y con la matriz de permisos (`docs/contracts/permissions-matrix.md`, línea 95: "agregar un área inactiva devuelve `400`, igual que una inexistente; una referencia histórica ya asociada se conserva") | R11 |
| P14 · ¿Qué tipos, tamaño y cantidad de adjuntos, y cómo se heredan? | Los tipos de `inspectFile` (PDF, `.txt`, `.md`), hasta 10 MB y 5 por paso. Al crear un borrador se comparte el archivo guardado y se borra solo cuando ninguna versión lo usa | R18, R19, R22, R23 |
| P15 · ¿Cómo se reordena? | Con la lista completa de pasos en el orden nuevo | R8 |
| P16 · ¿En qué idioma van los mensajes de error HTTP? | En español, como `documents` y `executions`; comentarios e identificadores en inglés | Sección 9 |
| P17 · ¿Cómo se alinea con la spec 005 de Mayra? | El puerto `ProceduresCatalog` es el de `executions/ports/procedures-catalog.ts`. `areaIds` son las áreas actuales del procedimiento, iguales en `findPublished` y en `findVersion`. Un procedimiento que cambia de área da 404 al empleado que la perdió, también con una ejecución en curso. Una versión sin pasos cuenta como sin versión publicada. `findVersion` devuelve versiones reemplazadas. El adaptador real va con HU32 | R12, R13, plan 7 |
| P18 · ¿Qué devuelve `PUT /procedures/:id/areas`? | 200 con `{ areaIds }`, las áreas que quedaron, ordenadas. Un conjunto vacío es válido | R11 |
| P19 · ¿Cómo se valida el pedido de áreas? | Formato en el DTO (arreglo de UUID, sin repetidos, hasta 100) y estado de las áreas (existencia e `isActive`) con `AreasDirectory.findByIds`. El orden de los chequeos es: rol (403), formato (400), existencia de las áreas (400), área inactiva nueva (400) y por último el procedimiento (404) | R11 |
| D16 · ¿Cómo se autentica ahora que está el login real de la Pareja A? | El servidor exige `Authorization: Bearer <jwt>` y rechaza con 401 los headers `x-user-id` y `x-user-role`. El rol y las áreas salen de la base en cada pedido. Los tests de controlador corren detrás del guard real con `real-auth.ts` de Mayra; los e2e firman los tokens con `signTestJwt` de Camila. Swagger pasa de los headers a Bearer. No cambia ninguna regla de negocio ni ninguna respuesta de las rutas | R1, R15 |
| P20 · ¿Qué pasa con las áreas inactivas y la sesión? | El guard excluye las áreas inactivas de `user.areaIds` (`jwt-auth.guard.ts`, líneas 73 a 78), y la matriz lo documenta: SUPERVISOR y EMPLOYEE no acceden a procedimientos vinculados solo a áreas inactivas (`docs/contracts/permissions-matrix.md`, líneas 149 a 151). Para HU11 se decide si se usa `user.areaIds` o `UsersDirectory`; hoy el directorio no filtra las inactivas (`prisma-users-directory.ts`). No se modifica código ajeno: la regla se acuerda con las parejas A y C | R11, R13, R15 |

## 11. Preguntas abiertas

Ninguna bloquea esta spec. Dependencias a coordinar, que no cambian su comportamiento:

- **Pareja A:** ampliar el directorio de usuarios para leer nombre y email del responsable. Hace falta recién para `getStepContext` (Contrato 3), no para HU09 a HU11.
- **Pareja C (Matías):** `inspectFile` no acepta imágenes y `FileStorage` no tiene "copiar". Si hacen falta imágenes en los adjuntos, se le pide a él; no se modifica su código.
- **Mayra:** al crear el adaptador real (HU32), el cambio de una línea en `executions.module.ts` lo hace ella.

## 12. Criterios de aceptación

```gherkin
# --- HU09 · crear y editar borradores ---

Escenario: E1 · crear un procedimiento
  Dado un ADMIN con sesión
  Cuando crea el procedimiento "Cierre de caja" con una descripción
  Entonces la respuesta es 201
  Y el procedimiento queda con su versión 1 en DRAFT, sin pasos y sin áreas

Escenario: E2 · rol sin permiso o sin sesión
  Dado un EMPLOYEE con sesión
  Cuando intenta crear un procedimiento, agregar un paso o asignar áreas
  Entonces la respuesta es 403
  Y no se guarda ningún cambio
  Y la misma petición sin sesión responde 401

Escenario: E3 · datos inválidos
  Dado un ADMIN con sesión
  Cuando crea un procedimiento con el título vacío, de solo espacios o de más de 200 caracteres
  Entonces la respuesta es 400, indicando el campo
  Y no se crea nada

Escenario: E4 · agregar pasos
  Dado un borrador sin pasos
  Cuando el ADMIN agrega tres pasos, uno después del otro
  Entonces los pasos quedan con orden 1, 2 y 3
  Y el paso sin descripción la devuelve como texto vacío

Escenario: E5 · agregar un paso en una posición
  Dado un borrador con los pasos A, B y C
  Cuando el ADMIN agrega el paso X en la posición 2
  Entonces el orden queda A, X, B, C con los números 1 a 4

Escenario: E6 · borrar un paso
  Dado un borrador con los pasos A, B y C
  Cuando el ADMIN borra el paso B
  Entonces quedan A y C con los números 1 y 2

Escenario: E7 · reordenar
  Dado un borrador con los pasos A, B y C
  Cuando el ADMIN envía el orden C, A, B
  Entonces los pasos quedan en ese orden con los números 1 a 3
  Y cada paso conserva su identificador

Escenario: E8 · reordenar con una lista incorrecta
  Dado un borrador con los pasos A, B y C
  Cuando el ADMIN envía una lista a la que le falta B, o con A repetido, o con un paso ajeno
  Entonces la respuesta es 400
  Y el orden no cambia

Escenario: E9 · editar el borrador
  Dado un borrador con título "Cierre"
  Cuando el ADMIN cambia el título a "Cierre de caja"
  Entonces el borrador queda con el título nuevo
  Y un pedido sin ningún campo responde 400

Escenario: E10 · segundo borrador
  Dado un procedimiento con un borrador abierto
  Cuando el ADMIN pide otro borrador
  Entonces la respuesta es 409 con reason "DRAFT_ALREADY_EXISTS"

Escenario: E11 · borrador nuevo desde la vigente
  Dado un procedimiento con la versión 1 PUBLISHED y tres pasos
  Cuando el ADMIN pide un borrador nuevo
  Entonces se crea la versión 2 en DRAFT con los mismos tres pasos, con identificadores nuevos
  Y al editar o borrar pasos de la versión 2, la versión 1 conserva sus tres pasos

Escenario: E12 · editar una versión publicada
  Dado un procedimiento con una versión PUBLISHED
  Cuando el ADMIN intenta cambiar sus datos o agregar, borrar o reordenar sus pasos
  Entonces la respuesta es 409 con reason "VERSION_NOT_EDITABLE"
  Y la versión no cambia

Escenario: E13 · borrar el único borrador
  Dado un procedimiento recién creado, solo con su versión 1 en DRAFT y áreas asignadas
  Cuando el ADMIN borra el borrador
  Entonces la respuesta es 204
  Y el procedimiento, sus pasos y sus áreas dejan de existir

Escenario: E14 · borrar un borrador de un procedimiento publicado
  Dado un procedimiento con la versión 1 PUBLISHED y la versión 2 en DRAFT
  Cuando el ADMIN borra la versión 2
  Entonces la versión 1 sigue PUBLISHED con sus pasos
  Y el procedimiento sigue existiendo

Escenario: E15 · borrar una versión publicada
  Dado un procedimiento con una versión PUBLISHED o SUPERSEDED
  Cuando el ADMIN intenta borrarla
  Entonces la respuesta es 409 con reason "VERSION_NOT_EDITABLE"
  Y la versión sigue existiendo

Escenario: E16 · borradores simultáneos
  Dado un procedimiento con una versión PUBLISHED y sin borrador
  Cuando dos ADMIN piden un borrador nuevo al mismo tiempo
  Entonces el procedimiento termina con un solo DRAFT
  Y uno de los pedidos responde 409

# --- HU10 · áreas ---

Escenario: E17 · asignar áreas
  Dado un procedimiento sin áreas
  Cuando el ADMIN asigna Ventas y Operaciones
  Entonces el procedimiento queda en las dos áreas
  Y reasignar solo Ventas lo deja únicamente en Ventas

Escenario: E18 · áreas inválidas
  Dado un procedimiento en Ventas
  Cuando el ADMIN envía un área inexistente o un área repetida
  Entonces la respuesta es 400
  Y el procedimiento sigue en Ventas

Escenario: E19 · mover de área
  Dado un procedimiento publicado de Ventas y un EMPLOYEE de Ventas que lo ve
  Cuando el ADMIN lo pasa a Operaciones
  Entonces el EMPLOYEE de Ventas recibe 404 en su pedido siguiente
  Y un EMPLOYEE de Operaciones lo ve
  (HU10 verifica el cambio de áreas en la base. Que el EMPLOYEE de Ventas reciba 404 y el de Operaciones lo vea se prueba con los GET de HU11, en T17.)

Escenario: E35 · agregar un área inactiva
  Dado un procedimiento en Ventas y un área inactiva que no tiene asignada
  Cuando el ADMIN asigna Ventas y esa área inactiva
  Entonces la respuesta es 400
  Y el procedimiento sigue únicamente en Ventas

Escenario: E36 · conservar un área que quedó inactiva
  Dado un procedimiento publicado, con un borrador abierto, en Ventas y en un área que después quedó inactiva
  Cuando el ADMIN asigna Ventas, esa área y Operaciones
  Entonces la respuesta es 200 y el procedimiento queda en las tres
  Y las versiones y sus pasos no cambian

Escenario: E37 · quitar un área inactiva y no poder volver a agregarla
  Dado un procedimiento en Ventas y en un área inactiva
  Cuando el ADMIN asigna solo Ventas
  Entonces la respuesta es 200 y el procedimiento queda en Ventas
  Y si después asigna Ventas y esa área inactiva, la respuesta es 400

Escenario: E38 · gana el 400
  Dado un procedimiento que no existe
  Cuando el ADMIN asigna un área inactiva, o una inexistente junto con una inactiva
  Entonces la respuesta es 400 (con "no existe" si alguna no existe) y no 404

# --- HU11 · visibilidad ---

Escenario: E20 · el empleado ve solo sus áreas
  Dado un procedimiento publicado de Ventas y otro de Operaciones
  Cuando un EMPLOYEE de Ventas pide el listado
  Entonces ve solo el de Ventas
  Y la respuesta tiene la forma { data, total, page, limit }

Escenario: E21 · procedimiento de otra área
  Dado un procedimiento publicado de Operaciones
  Cuando un EMPLOYEE de Ventas pide su detalle
  Entonces la respuesta es 404
  Y es idéntica, en estado y mensaje, a la de un procedimiento que no existe

Escenario: E22 · el empleado no ve borradores, reemplazadas ni publicadas sin pasos
  Dado un procedimiento de Ventas con la versión 1 SUPERSEDED, la 2 PUBLISHED y la 3 DRAFT
  Cuando un EMPLOYEE de Ventas pide su detalle
  Entonces ve la versión 2 con sus pasos
  Y un procedimiento que solo tiene un DRAFT le responde 404
  Y uno cuya única versión PUBLISHED no tiene pasos le responde 404

Escenario: E23 · el ADMIN ve todo
  Dado procedimientos de varias áreas, algunos solo en borrador
  Cuando un ADMIN pide el listado y el detalle
  Entonces los ve todos, con sus versiones
  Y el listado le indica cuáles tienen un borrador abierto

Escenario: E24 · usuario sin áreas
  Dado un EMPLOYEE sin áreas, o que el directorio no conoce
  Cuando pide el listado
  Entonces recibe una lista vacía
  Y su pedido de un detalle responde 404

Escenario: E25 · falla el directorio
  Dado un directorio de usuarios que no responde
  Cuando un EMPLOYEE pide el listado
  Entonces la respuesta es 503
  Y no se devuelve ningún procedimiento

Escenario: E26 · paginación inválida
  Cuando se pide el listado con limit=101, page=0 o un valor que no es un número
  Entonces la respuesta es 400

Escenario: E27 · versiones solo para el ADMIN
  Dado un EMPLOYEE con sesión
  Cuando pide una versión de un procedimiento por su identificador
  Entonces la respuesta es 403

# --- Adjuntos (última parte) ---

Escenario: E28 · adjuntar un archivo
  Dado un paso de un borrador
  Cuando el ADMIN adjunta un PDF válido
  Entonces la respuesta es 201
  Y el paso lista el adjunto con su nombre original

Escenario: E29 · archivo inválido
  Dado un paso de un borrador
  Cuando el ADMIN adjunta un archivo con extensión .pdf cuyo contenido no es un PDF, o uno de más de 10 MB, o uno vacío
  Entonces las respuestas son 415, 413 y 400
  Y no se guarda nada

Escenario: E30 · falla el almacenamiento
  Dado un almacenamiento que no responde
  Cuando el ADMIN adjunta un archivo
  Entonces la respuesta es 503
  Y no queda ni el archivo ni el adjunto registrado

Escenario: E31 · ver y descargar un adjunto
  Dado un procedimiento publicado de Ventas con un adjunto en un paso
  Cuando un EMPLOYEE de Ventas pide la descarga
  Entonces recibe un enlace que vence a los 5 minutos
  Y un EMPLOYEE de Operaciones recibe 404

Escenario: E32 · borrar un adjunto
  Dado un adjunto en un paso de un borrador
  Cuando el ADMIN lo borra
  Entonces desaparece del paso y, si ninguna versión lo usa, del almacenamiento
  Y si el paso es de una versión publicada, la respuesta es 409 con reason "VERSION_NOT_EDITABLE"

Escenario: E33 · herencia de adjuntos
  Dado un procedimiento publicado cuyo paso tiene un adjunto
  Cuando el ADMIN crea un borrador y borra ese adjunto en el borrador
  Entonces la versión publicada sigue teniendo el adjunto y se puede descargar

Escenario: E34 · límite de adjuntos
  Dado un paso de un borrador con 5 adjuntos
  Cuando el ADMIN intenta adjuntar otro
  Entonces la respuesta es 409 con reason "ATTACHMENT_LIMIT_REACHED"
```
