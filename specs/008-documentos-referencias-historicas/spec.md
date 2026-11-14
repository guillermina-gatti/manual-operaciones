# Spec 008 · Referencias históricas en Documentos

- **Historia:** acuerdo A-06.4 con la pareja A (nombres históricos incluidos en Documentos, `docs/contracts/A-06.4-nombres-historicos.md`) y la parte de Documentos de A-06.2 y A-06.3 (áreas y usuarios inactivos).
- **Responsable:** Matías Fauda (pareja C).
- **Depende de:**
  - Specs 001 (carga, R5), 002 (pantallas), 003 (cambio de áreas, R3 y R4; historial de versiones, R12), 004 (búsqueda) y 005 (última revisión, R4 y R11).
  - De la pareja A, ya en `develop`: `isActive` en usuarios y áreas, `GET /api/areas` (catálogo con activas e inactivas), `GET /api/users?areaIds=...` (candidatos activos, solo ADMIN) y la conexión del formulario de documentos a esos endpoints (PR #24 a #28).
  - De la pareja A, la ampliación de los directorios internos de Documentos (`apps/api/src/documents/ports`):
    - `UsersDirectory.findById(id)` con `name`. **Verificado en código:** ya está en `develop` (A-13, PR #30) y devuelve `id`, `name`, `role`, `areaIds` e `isActive`.
    - `AreasDirectory.findByIds(ids)` con `id`, `name` e `isActive`, incluidas las inactivas. **Verificado en código:** ya está en `develop` (A-13, PR #30), junto a `findExistingIds`. Según el puerto, los IDs que no existen se omiten.
    - `UsersDirectory.findByIds(ids)`, que incluye los inactivos. **Pendiente:** todavía no existe en el puerto. Esta spec no supone nada de él más allá de lo acordado (que recibe IDs y que incluye a los inactivos). **Pendiente confirmar con la pareja A** qué devuelve con un ID que no existe (decisión P6).
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

Las respuestas de Documentos solo traen IDs: `ownerId`, `areaIds`, `review.lastReviewedById` y, en el historial, `uploadedById`. La web resuelve los nombres de las personas con `usersDirectory.getNames`, que todavía lee fixtures, y los de las áreas con `GET /api/areas`. Con usuarios reales, el responsable y quien revisó aparecen como "—". Además, desde que existen usuarios y áreas inactivos, nada impide asignarle a un documento un responsable inactivo o un área inactiva, y el campo de responsable borra al responsable actual si ya no figura entre los candidatos.

Esta feature hace que las respuestas de Documentos traigan los nombres y el estado (activo o inactivo) de las personas y áreas que referencian, solo a quien ya puede ver ese documento; que la web los use en lugar de los fixtures y del catálogo de áreas; que la API rechace asignaciones nuevas inactivas sin borrar las históricas; y que el campo de responsable conserve al responsable actual.

## 2. Actores

- **ADMIN:** carga documentos y cambia sus áreas y su responsable. Ve todos los documentos, la última revisión y el historial de versiones.
- **Responsable** (de cualquier rol): ve la última revisión de sus documentos (spec 005, R4).
- **SUPERVISOR y EMPLOYEE:** ven los documentos de sus áreas como hasta ahora, ahora con los nombres del responsable y de las áreas.
- **Pareja A:** amplía los directorios internos y mantiene los endpoints de áreas y candidatos. No es actor del sistema, pero esta spec depende de su trabajo.

## 3. Alcance

- Nombre y estado del responsable, de las áreas y de quien hizo la última revisión en el listado, la búsqueda, el detalle, "Por revisar" y las respuestas de las escrituras que devuelven un documento.
- Nombre y estado de quien subió cada versión, en el historial de versiones.
- Rechazo con 400 de un responsable nuevo inactivo y de las áreas inactivas que se agregan, en la carga y en el cambio de áreas.
- Conservación de las asociaciones históricas inactivas que el documento ya tiene.
- En la web: mostrar esos nombres desde la respuesta, con "(inactivo)" o "(inactiva)", y dejar de usar `getNames` y `GET /api/areas` en las pantallas de consulta de Documentos.
- `OwnerField`: al editar, conservar el responsable actual aunque esté inactivo o no sea candidato, y pedir los candidatos solo con las áreas activas.

## 4. Fuera de alcance

- Cambiar la visibilidad de los documentos: siguen valiendo `canView`, `listWhere`, `searchScope` y `pendingReviewWhere` como están (decisión D3). **11/11/2026:** la visibilidad la cambió la pareja A con A-SEC: un área inactiva ya no da acceso (D3 actualizada). Esta spec no toca las políticas; solo se alinea.
- Un endpoint público para resolver nombres de usuarios (`GET /api/users/names`): descartado en A-06.4.
- Modificar los puertos y adaptadores de los directorios internos (`ports/users-directory.ts`, `ports/areas-directory.ts` y sus adaptadores): son de la pareja A.
- Modificar `GET /api/areas`, `GET /api/users` y los archivos de `apps/web/lib/directory`. `getNames` queda sin uso en Documentos y lo quita la pareja A en un PR suyo (decisión P8).
- Sacar `ownerId`, `areaIds`, `review.lastReviewedById` y `uploadedById` de las respuestas (decisión P1): si sobran, se ve en otra spec.
- Activar o desactivar usuarios y áreas, y qué pasa con la sesión de un usuario desactivado.
- Reemplazar automáticamente a un responsable inactivo o quitar áreas inactivas de los documentos.
- `createdById`: la web no lo muestra; sigue siendo solo un ID.
- Nombres de personas en Procedimientos, Ejecuciones o el asistente (A-06.4: contrato aparte con la pareja B).

## 5. Flujos principales

**Ver un documento.** Un usuario abre el listado, la búsqueda, "Por revisar" o el detalle. La API busca los documentos visibles como hasta ahora y, para los que devuelve, resuelve en lote con los directorios internos el nombre y el estado del responsable, de las áreas y, si corresponde, de quien hizo la última revisión. La web los muestra tal como llegan, con "(inactivo)" o "(inactiva)" en los que ya no están activos.

**Cargar un documento.** El ADMIN elige áreas (solo se ofrecen las activas) y un responsable (solo candidatos activos). Si igual llega a la API un área o un responsable inactivo, la API responde 400 y no guarda nada.

**Cambiar las áreas.** El ADMIN abre el formulario: las áreas actuales aparecen marcadas, también las inactivas, con "(inactiva)", y el responsable actual aparece elegido, también si está inactivo, con "(inactivo)". Puede sacar áreas, agregar áreas activas y elegir otro responsable activo. Las áreas inactivas que deja marcadas y el responsable que no cambia se conservan. Si el responsable actual deja de tener acceso a las áreas nuevas, la API lo rechaza (spec 003, R4) y el formulario lo muestra en el campo, para que elija otro.

## 6. Reglas de negocio

- **R1 · Referencias con nombre.** Cada referencia a una persona o un área se devuelve como `{ id, name, isActive }`, con el nombre y el estado **actuales** de esa persona o área (no los de cuando se asignó). Los campos nuevos se **agregan** y los IDs de antes se mantienen (decisión P1):

  ```json
  {
    "ownerId": "…",
    "owner": { "id": "…", "name": "Ana Pérez", "isActive": false },
    "areaIds": ["…"],
    "areas": [{ "id": "…", "name": "Ventas", "isActive": true }],
    "review": {
      "status": "OVERDUE",
      "lastReviewedAt": "2026-10-01T13:00:00.000Z",
      "lastReviewedById": "…",
      "lastReviewedBy": { "id": "…", "name": "Juan Gómez", "isActive": true }
    }
  }
  ```

  `areas` va en el mismo orden que `areaIds`. `review.lastReviewedBy` es `null` cuando `lastReviewedById` es `null`.
- **R2 · Dónde.** Llevan `owner`, `areas` y, dentro de `review`, `lastReviewedBy`:
  - el listado (`GET /documents`), la búsqueda (`GET /documents/search`), el detalle (`GET /documents/:id`) y "Por revisar" (`GET /documents/pending-review`) (decisión P2);
  - todas las escrituras que responden un documento: la carga (`POST /documents`), el cambio de áreas (`PATCH /documents/:id/areas`), la versión nueva (`POST /documents/:id/versions`), "Marcar como revisado" (`POST /documents/:id/review`) y archivar (`POST /documents/:id/archive`), con la misma forma que el detalle (decisiones P3 y P4).

  Además, cada versión del historial (`GET /documents/:id/versions`) lleva `uploadedBy: { id, name, isActive }`, sin sacar `uploadedById` (decisión P3).
- **R3 · Visibilidad.** Las referencias salen solo dentro de documentos que el usuario ya puede ver, con las políticas actuales (D3). Desde A-SEC (11/11/2026), para EMPLOYEE y SUPERVISOR solo cuentan sus áreas activas; el ADMIN ve todos. `review.lastReviewedBy` sale solo dentro de `review`, que solo reciben el ADMIN y el responsable (spec 005, R4). El historial lo ve solo el ADMIN (spec 003, R12). No se agrega ningún dato de personas fuera de `id`, `name` e `isActive`: ni email, ni rol, ni áreas.
- **R4 · Inactivos en las respuestas.** Un responsable, un área, un revisor o quien subió una versión, inactivos, se devuelven igual, con `isActive: false`. Desactivar a una persona no cambia qué documentos ven los demás ni quién recibe `review`. **11/11/2026 (D3, A-SEC):** desactivar un **área** sí cambia quién ve el documento: esa área deja de dar acceso a sus EMPLOYEE y SUPERVISOR. La referencia al área se conserva igual, con `isActive: false`, para quien todavía lo ve.
- **R5 · Responsable inactivo en una asignación nueva.** En la carga (`POST /documents`) y en el cambio de áreas cuando viene un `ownerId` distinto del actual (`PATCH /documents/:id/areas`), si el responsable existe pero está inactivo: 400 `ownerId: el responsable está inactivo`. No se guarda nada.
- **R6 · El responsable se valida como inactivo solo cuando cambia.** Si el cambio de áreas no trae `ownerId`, o trae el mismo que el actual, no se mira si el responsable actual está activo: se conserva aunque esté inactivo. Lo que sí se sigue aplicando, cambie o no, es la R4 de la spec 003: el responsable tiene que compartir un área con las áreas nuevas o ser ADMIN; si no, 400 (decisión P5).
- **R7 · Áreas inactivas agregadas.** En la carga, todas las áreas son agregadas. En el cambio de áreas, son agregadas las de `areaIds` que el documento no tiene hoy. Si alguna agregada existe pero está inactiva: 400 `areaIds: están inactivas las áreas <ids>`. No se guarda nada.
- **R8 · Áreas históricas.** En el cambio de áreas, las áreas inactivas que el documento ya tiene y que siguen en `areaIds` se conservan sin error. Las que no vienen en `areaIds` se quitan, como hoy: una vez quitada, un área inactiva no se puede volver a agregar (R7).
- **R9 · Nada se borra solo.** Desactivar un usuario o un área no cambia el responsable ni las áreas de ningún documento. Solo cambian cuando un ADMIN los cambia.
- **R10 · Orden de las validaciones.** Se mantienen las actuales y se agregan las nuevas en este orden: las áreas existen (spec 001, R5) → las áreas agregadas están activas (R7) → el responsable existe (spec 001, R5) → si es un responsable nuevo, está activo (R5) → el responsable comparte un área con el documento o es ADMIN (spec 001, R5; spec 003, R4). Para ese último paso cuentan **solo las áreas activas** del documento (D6, 11/11/2026). Con A-SEC un área inactiva no da acceso, así que no alcanza para ser responsable. Vale en la carga y en el cambio de áreas, también cuando el responsable no cambia (P5). Si no comparte ninguna activa y no es ADMIN: el 400 de siempre, `ownerId: el responsable no comparte ningún área con el documento`. En la carga, un área inactiva ya se rechaza antes (R7), así que no puede ser la única compartida. Hasta el 11/11/2026 contaba cualquier área del documento, activa o inactiva.
- **R11 · Sin cambios reales.** El cambio de áreas con las mismas áreas y el mismo responsable sigue respondiendo el documento sin escribir ni validar (spec 003), aunque tenga áreas o responsable inactivos.
- **R12 · Referencia que no se encuentra.** Si el directorio no encuentra un usuario o un área referenciados (por ejemplo, por un dato viejo), la referencia se devuelve igual, con `name: null` e `isActive: false`. No es un error (decisión P6).
- **R13 · Errores.** Si un directorio interno no responde al armar una respuesta o al validar: 503, con el mismo mensaje que hoy tiene cada operación. En las escrituras, un 503 quiere decir que no se guardó nada. Las 400 nuevas se auditan como fallo, igual que las demás 400 de la carga y del cambio de áreas.

### Reglas de pantalla

- **F1 · Nombres desde la respuesta.** El listado, la búsqueda, "Por revisar", el detalle y el historial muestran el responsable, las áreas, quien hizo la última revisión y quien subió cada versión con los nombres de la respuesta. Esas pantallas dejan de llamar a `usersDirectory.getNames` y a `GET /api/areas` (decisión P7). Los formularios de carga y de cambio de áreas siguen pidiendo `GET /api/areas`, para ofrecer las áreas.
- **F2 · Inactivos.** Una persona inactiva se muestra como "Nombre (inactivo)"; un área inactiva, como "Nombre (inactiva)", igual que hoy `displayAreaName`. Siempre con la palabra, no solo con un estilo.
- **F3 · Sin nombre.** Una referencia con `name: null` (R12) se muestra "—", como hoy, sin "(inactivo)".
- **F4 · `OwnerField` al editar.** En el cambio de áreas, el responsable actual del documento siempre figura en la lista y queda elegido aunque esté inactivo o no esté entre los candidatos, con "(inactivo)" si corresponde. No se borra al cambiar las áreas ni al llegar los candidatos. Solo cambia si el ADMIN elige otro. El formulario sigue mandando `ownerId` solo si cambió (plan 003, 6.2). Si el responsable actual deja de tener acceso a las áreas nuevas, el 400 de la API (R6) se muestra en el campo (F7).
- **F5 · `OwnerField` en la carga.** Sin cambios: no hay responsable actual, se ofrecen solo los candidatos activos y el aviso E4 sigue igual.
- **F6 · Candidatos con áreas inactivas.** `OwnerField` pide los candidatos (`GET /api/users?areaIds=...`) solo con las áreas **activas** elegidas, porque ese endpoint responde 400 si alguna es inactiva. Si entre las elegidas no queda ninguna activa, no los pide, ofrece solo al responsable actual y avisa "Para elegir otro responsable, marcá al menos un área activa" (decisión P9).
- **F7 · Errores nuevos.** Las 400 de R5, R6 y R7 se muestran en el campo que corresponde (responsable o áreas), sin perder lo elegido, como los demás errores de la carga y del cambio de áreas (spec 002, F3).
- **F8 · Responsive.** Todo se usa desde la computadora y desde el celular, como hasta ahora.

## 7. Estados

Esta feature no agrega estados. Usa el `isActive` de usuarios y áreas, que administra la pareja A.

## 8. Casos borde

- Un documento cuyo responsable se desactivó: todos los que ven el documento ven "Ana Pérez (inactivo)". El documento sigue en "Por revisar" del ADMIN. El responsable no lo ve porque un usuario inactivo no puede iniciar sesión ni seguir usando una sesión abierta; eso lo controla la pareja A (login, renovación de la sesión y `JwtAuthGuard`), no esta spec.
- Un documento con las áreas Ventas (activa) y Compras (inactiva): un EMPLOYEE de Ventas lo ve, con "Ventas, Compras (inactiva)". Un EMPLOYEE que solo es de Compras ya no lo ve: el detalle responde 404 y no aparece en el listado ni en la búsqueda (D3, actualizada el 11/11/2026).
- Un documento cuya única área, Compras, está inactiva: solo lo ve el ADMIN, con "Compras (inactiva)" (D3, 11/11/2026). Al editarlo, `OwnerField` no pide candidatos hasta que el ADMIN marque un área activa (F6).
- Cambio de áreas que deja Compras (inactiva) y agrega Operaciones (activa): se acepta (R8). Los candidatos se piden solo con Operaciones (F6).
- Cambio de áreas que saca Compras (inactiva) y la vuelve a mandar en el mismo pedido: no es agregada, porque el documento todavía la tiene; se acepta.
- Cambio de áreas que agrega Logística (inactiva): 400 aunque el documento conserve otras áreas activas (R7).
- Cambio de áreas sin `ownerId`, con el responsable actual inactivo y que sigue compartiendo un área con las áreas nuevas: se acepta (R6).
- Cambio de áreas sin `ownerId`, con el responsable actual (activo o inactivo) que deja de compartir un área con las áreas nuevas: 400, como hoy (R6; spec 003, R4).
- Un documento con Ventas y Compras, y Compras se desactiva. Su responsable es Bruno, que solo es de Compras. Un cambio de áreas sin `ownerId` da 400 de acceso, aunque se conserve Compras: el área inactiva no cuenta (D6, 11/11/2026). El ADMIN tiene que elegir otro responsable en el mismo cambio.
- El mismo documento, con un `ownerId` nuevo que solo comparte Compras (inactiva): 400 de acceso (D6). Con uno que comparte Ventas, se acepta, aunque también sea de Compras.
- Carga con un responsable que solo es de Compras (inactiva): no se puede elegir Compras, porque R7 la rechaza; con otras áreas, no comparte ninguna y da 400 de acceso.
- El ADMIN elige como responsable nuevo a alguien inactivo (por ejemplo, con un pedido armado a mano): 400 (R5).
- El ADMIN vuelve a elegir al mismo responsable actual inactivo: no es un cambio; se acepta (R6).
- Quien hizo la última revisión se desactivó: el ADMIN y el responsable ven "Revisado por Juan Gómez (inactivo)".
- Quien subió una versión se desactivó: el ADMIN ve "Juan Gómez (inactivo)" en el historial.
- Un área inactiva se renombra: la respuesta trae el nombre nuevo (R1).
- Un `ownerId` que el directorio ya no encuentra: `owner` llega con `name: null` y la web muestra "—" (R12, F3).
- Un documento con 20 áreas en una página de 100 documentos: la API resuelve los nombres en lote, no uno por documento (sección 9).

## 9. Restricciones no funcionales

- Las mismas de las specs anteriores: errores con el formato de NestJS, endpoints en Swagger, ningún secreto en el repositorio.
- Los nombres se resuelven en lote por respuesta (con `findByIds`), no con un pedido por documento ni por referencia. Para eso hace falta `UsersDirectory.findByIds`, que todavía no existe (ver "Depende de").
- Las respuestas se arman campo por campo, como hoy (`toDocumentFields`): nunca se copia el objeto del directorio entero.
- No se modifican los archivos de la pareja A: `apps/api/src/documents/ports/*-directory.ts` y sus adaptadores, `apps/api/src/areas`, `apps/api/src/users` y `apps/web/lib/directory`.
- Los nombres de los campos nuevos (R1, R2) son contrato con la pareja A y con la web: no se cambian sin avisar.
- Los tests no dependen de los fixtures de nombres de la web.

## 10. Decisiones

Acordadas con la pareja A (A-06.4, 31/10/2026 y 01/11/2026) antes de escribir esta spec:

| Decisión | Regla |
| --- | --- |
| D1 · Las respuestas de Documentos traen `{ id, name, isActive }` del responsable, las áreas y quien hizo la última revisión, en lugar de un endpoint de nombres | R1 a R4, F1 |
| D2 · Se rechazan con 400 el responsable inactivo y las áreas inactivas agregadas; las asociaciones históricas se conservan y el responsable se valida solo cuando cambia | R5 a R9 |
| D3 · La visibilidad de los documentos no cambia. **Actualizada el 11/11/2026:** con A-SEC (pareja A) y la matriz de permisos A-02, las áreas inactivas no dan acceso. EMPLOYEE y SUPERVISOR ven solo los documentos de sus áreas activas (`viewerFor` usa las áreas activas de la sesión); el ADMIN sigue viendo todos. Las referencias históricas se conservan (R4). Esta spec no cambia las políticas; se alinea con la pareja A | R3, R4, R10, sección 4 |
| D4 · `OwnerField` conserva el responsable actual al editar y lo muestra con "(inactivo)" | F4 |
| D5 · La web deja de usar `getNames` (fixtures) para los nombres de Documentos | F1 |

Tomada el 11/11/2026, después de A-SEC (era Q2):

| Decisión | Regla |
| --- | --- |
| D6 · Para validar al responsable, tiene que compartir al menos un área **activa** con el documento, o ser ADMIN. Las áreas inactivas no cuentan, porque con A-SEC no dan acceso: un responsable que solo compartía un área inactiva pasaba la validación pero no veía su documento. Vale para la carga y para el cambio de áreas, también si el responsable no cambia (P5). Si no cumple, 400 con el mismo mensaje que hoy | R10; R4 de la spec 003 |

Tomadas en la etapa de aclaración (clarify) el 02/11/2026:

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Qué forma tienen los campos nuevos? | Se agregan `owner`, `areas` y `review.lastReviewedBy`; `ownerId`, `areaIds` y `review.lastReviewedById` se mantienen | R1 |
| P2 · ¿La búsqueda también trae los nombres? | Sí, como el listado | R2, F1 |
| P3 · ¿Qué son "las versiones"? | Las dos cosas: el historial trae `uploadedBy` en cada versión, y la respuesta de la versión nueva trae los nombres como el detalle | R2, F1 |
| P4 · ¿Las escrituras también traen los nombres? | Sí, todas las que responden `DocumentResponse`, con la misma forma que el detalle | R2 |
| P5 · ¿Sigue valiendo la R4 de la spec 003 para el responsable que no cambia? | Sí. "Se valida solo cuando cambia" se refiere a que esté activo; el acceso a las áreas nuevas se sigue validando. `OwnerField` no lo borra: el 400 se muestra en el campo | R6, F4, F7 |
| P6 · ¿Qué se devuelve si el directorio no encuentra una referencia? | La referencia, con `name: null` e `isActive: false`; la web muestra "—". **Pendiente:** confirmar con la pareja A qué devuelve `UsersDirectory.findByIds` con un ID que no existe | R12, F3 |
| P7 · ¿Las pantallas siguen pidiendo `GET /api/areas`? | No las de consulta (listado, búsqueda, "Por revisar", detalle): usan `areas` de la respuesta. Los formularios lo siguen pidiendo | F1 |
| P8 · ¿Qué pasa con `getNames`? | Documentos deja de usarlo; el método y sus fixtures quedan, y los quita la pareja A en un PR suyo. Se les avisa | F1, sección 4 |
| P9 · ¿Cómo pide `OwnerField` los candidatos con un área inactiva? | Solo con las áreas activas elegidas; sin ninguna activa, no los pide y ofrece solo al responsable actual | F6 |

## 11. Criterios de aceptación

```gherkin
Escenario: el listado trae los nombres
  Dado un documento activo del área Ventas cuyo responsable es Ana Pérez
  Y un EMPLOYEE de Ventas con sesión
  Cuando pide el listado de documentos
  Entonces el documento trae ownerId y owner con id, name "Ana Pérez" e isActive true
  Y areaIds y areas con id, name "Ventas" e isActive true

Escenario: la búsqueda trae los nombres
  Dado un documento de Ventas que contiene "caja", cuyo responsable, Ana Pérez, está inactivo
  Cuando un EMPLOYEE de Ventas busca "caja"
  Entonces ve el resultado con "Ana Pérez (inactivo)" como responsable

Escenario: responsable inactivo en el detalle
  Dado un documento de Ventas cuyo responsable, Ana Pérez, está inactivo
  Cuando un EMPLOYEE de Ventas abre el detalle
  Entonces ve "Ana Pérez (inactivo)" como responsable

Escenario: área inactiva en el listado
  Dado un documento con las áreas Ventas y Compras, y Compras está inactiva
  Cuando un EMPLOYEE de Compras abre el listado
  Entonces ve el documento
  Y ve las áreas "Ventas, Compras (inactiva)"

Escenario: quien revisó, solo para el ADMIN y el responsable
  Dado un documento de Ventas revisado por Juan Gómez, que después se desactivó
  Cuando su responsable abre el detalle
  Entonces ve "Revisado por Juan Gómez (inactivo)"
  Y si un EMPLOYEE de Ventas que no es el responsable pide el detalle, la respuesta no trae review

Escenario: "Por revisar" trae los nombres
  Dado un documento vencido cuyo responsable está inactivo
  Cuando un ADMIN abre "Por revisar"
  Entonces ve el documento con "(inactivo)" junto al nombre del responsable

Escenario: el historial trae quién subió cada versión
  Dado un documento con dos versiones, la primera subida por un ADMIN que después se desactivó
  Cuando un ADMIN abre el historial
  Entonces cada versión trae uploadedById y uploadedBy
  Y la primera muestra "(inactivo)" junto al nombre de quien la subió

Escenario: las escrituras responden con los nombres
  Dado un documento de Ventas
  Cuando un ADMIN lo marca como revisado
  Entonces la respuesta trae owner, areas y review.lastReviewedBy con el nombre del ADMIN
  Y el detalle se actualiza sin mostrar "—"

Escenario: la web no usa los fixtures ni el catálogo de áreas
  Dado un documento cuyo responsable no está en los fixtures de la web
  Cuando un usuario que lo puede ver abre el listado y el detalle
  Entonces ve el nombre que trae la respuesta
  Y la web no pide GET /api/areas para mostrarlo

Escenario: referencia que el directorio no encuentra
  Dado un documento cuyo ownerId no corresponde a ningún usuario
  Cuando un ADMIN abre el detalle
  Entonces owner llega con name null e isActive false
  Y la web muestra "—" como responsable

Escenario: carga con responsable inactivo
  Dado un usuario de Ventas inactivo
  Cuando un ADMIN carga un documento de Ventas con ese usuario como responsable
  Entonces la respuesta es 400 "ownerId: el responsable está inactivo"
  Y no se guarda nada

Escenario: carga con un área inactiva
  Dada el área Compras inactiva
  Cuando un ADMIN carga un documento con las áreas Ventas y Compras
  Entonces la respuesta es 400 con el id de Compras en el mensaje
  Y no se guarda nada

Escenario: cambio de áreas que conserva un área inactiva
  Dado un documento con las áreas Ventas y Compras, y Compras está inactiva
  Cuando un ADMIN cambia las áreas a Compras y Operaciones
  Entonces la respuesta es 200
  Y el documento queda con Compras y Operaciones

Escenario: cambio de áreas que agrega un área inactiva
  Dado un documento del área Ventas
  Y el área Logística inactiva
  Cuando un ADMIN cambia las áreas a Ventas y Logística
  Entonces la respuesta es 400
  Y las áreas del documento no cambian

Escenario: el responsable inactivo se conserva si no cambia
  Dado un documento de Ventas y Operaciones cuyo responsable, de Ventas, está inactivo
  Cuando un ADMIN cambia las áreas a Ventas sin mandar ownerId
  Entonces la respuesta es 200
  Y el responsable sigue siendo el mismo

Escenario: el responsable que no cambia igual necesita acceso
  Dado un documento de Ventas cuyo responsable, de Ventas, está inactivo
  Cuando un ADMIN cambia las áreas a Operaciones sin mandar ownerId
  Entonces la respuesta es 400
  Y el formulario muestra el error en el campo de responsable, sin borrarlo

Escenario: elegir un responsable nuevo inactivo
  Dado un documento de Ventas
  Y un usuario de Ventas inactivo que no es el responsable
  Cuando un ADMIN cambia las áreas mandando a ese usuario como ownerId
  Entonces la respuesta es 400 "ownerId: el responsable está inactivo"
  Y el responsable no cambia

Escenario: desactivar no borra referencias
  Dado un documento con responsable Ana Pérez y el área Compras
  Cuando la pareja A desactiva a Ana Pérez y a Compras
  Entonces el documento sigue teniendo a Ana Pérez como responsable y a Compras entre sus áreas

Escenario: OwnerField conserva al responsable inactivo
  Dado un documento cuyo responsable, Ana Pérez, está inactivo
  Cuando un ADMIN abre el cambio de áreas
  Entonces el campo de responsable muestra "Ana Pérez (inactivo)" elegido
  Y al marcar otra área el responsable sigue elegido
  Y al guardar sin elegir otro, el pedido no manda ownerId

Escenario: OwnerField permite elegir otro
  Dado un documento cuyo responsable está inactivo
  Cuando un ADMIN elige en el campo de responsable a un candidato activo y guarda
  Entonces el pedido manda el ownerId nuevo
  Y el detalle muestra al responsable nuevo

Escenario: candidatos solo con las áreas activas
  Dado un documento con las áreas Ventas y Compras, y Compras está inactiva
  Cuando un ADMIN abre el cambio de áreas
  Entonces la web pide los candidatos solo con Ventas
  Y si desmarca Ventas, no pide candidatos, ofrece solo al responsable actual y avisa que marque un área activa

Escenario: el responsable tiene que compartir un área activa (D6, 11/11/2026)
  Dado un documento de Ventas y Compras cuyo responsable, Bruno, solo es de Compras
  Y Compras está inactiva
  Cuando el ADMIN cambia las áreas sin elegir otro responsable
  Entonces la respuesta es 400 "ownerId: el responsable no comparte ningún área con el documento"
  Y si elige como responsable a Carla, de Ventas y Compras, el cambio se acepta

Escenario: un área inactiva no da acceso (D3, actualizado el 11/11/2026)
  Dado un documento cuya única área, Compras, está inactiva
  Cuando un EMPLOYEE de Compras abre el listado, el detalle o la búsqueda
  Entonces no ve el documento: no está en el listado ni en la búsqueda, y el detalle responde 404
  Y el ADMIN sí lo ve, con "Compras (inactiva)"
  Y si el documento también tiene Ventas (activa), un EMPLOYEE de Ventas lo ve, con "Ventas, Compras (inactiva)"
```
