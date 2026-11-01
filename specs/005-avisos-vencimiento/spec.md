# Spec 005 · Avisos de vencimiento de documentos

- **Historia:** HU37 (avisos de documentos con la fecha de revisión vencida o por vencer).
- **Responsable:** Matías Fauda (pareja C)
- **Depende de:** spec 001 (fecha de revisión y responsable), spec 002 (pantallas), spec 003 (versión nueva con fecha de revisión, R7b) y el login real de la pareja A (usuario, rol y áreas en cada pedido).
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

Cada documento tiene una fecha de revisión y un responsable, pero hoy nadie se entera cuando esa fecha llega. Un manual puede quedar desactualizado meses sin que nadie lo note, y el asistente de IA seguiría respondiendo con él.

Esta feature avisa al responsable y a los administradores cuando un documento está por vencer o ya venció, les muestra en un solo lugar qué tienen que revisar, y les permite confirmar que un documento sigue vigente sin tener que subir el archivo de nuevo.

## 2. Actores

- **ADMIN:** ve los avisos de todos los documentos y puede marcar cualquiera como revisado.
- **Responsable** (de cualquier rol): ve los avisos de los documentos de los que es responsable y puede marcarlos como revisados.
- **SUPERVISOR y EMPLOYEE que no son responsables:** no ven avisos. Siguen viendo los documentos como hasta ahora.

## 3. Alcance

- Calcular el estado de revisión de cada documento: al día, por vencer o vencido.
- Mostrarlo como etiqueta en el listado y en el detalle, a quien corresponde.
- Una sección "Por revisar" con los documentos que necesitan revisión.
- La acción "Marcar como revisado", que pone una fecha de revisión nueva sin cambiar el archivo.
- Guardar quién hizo la última revisión y cuándo.

## 4. Fuera de alcance

- Avisos por email, notificaciones del navegador o del celular.
- Tareas programadas que corren solas (por ejemplo, todos los días).
- Configurar el plazo de aviso por documento o por área.
- Editar título, descripción, áreas o responsable desde "Marcar como revisado".
- Las métricas de documentos para el panel de la pareja B (decisión P8): se acuerdan aparte con Mayra.

## 5. Flujos principales

**Ver qué revisar.** El responsable o un ADMIN entra a Documentos y ve, en cada documento suyo, si vence pronto o ya venció. En la sección "Por revisar" encuentra todos juntos, los vencidos primero.

**Confirmar que sigue vigente.** Abre el documento, lo revisa y, si sigue estando bien, toca "Marcar como revisado" y elige la próxima fecha de revisión. El aviso desaparece.

**Actualizarlo.** Si el documento cambió, sube una versión nueva con una fecha de revisión nueva (spec 003). Eso también cuenta como revisión.

## 6. Reglas de negocio

- **R1 · Estado de revisión.** Para un documento `ACTIVE`, con "hoy" en hora de Argentina:
  - **Vencido:** la fecha de revisión es anterior a hoy.
  - **Por vencer:** la fecha de revisión es hoy o cae dentro de los próximos 30 días.
  - **Al día:** la fecha de revisión es posterior a hoy + 30 días.
- **R2 · Archivados.** Un documento `ARCHIVED` no tiene estado de revisión ni avisos.
- **R3 · Se calcula al consultar.** El estado se calcula en cada consulta a partir de la fecha de revisión; no se guarda ni lo actualiza una tarea programada (decisión P7).
- **R4 · Quién ve los avisos.** El estado de revisión solo se le muestra al ADMIN y al responsable de ese documento. Para cualquier otro usuario, el documento se ve como hasta ahora, sin estado de revisión.
- **R5 · Sección "Por revisar".** Lista los documentos `ACTIVE` por vencer o vencidos que el usuario puede revisar: el ADMIN, todos; cualquier otro usuario, aquellos de los que es responsable. Orden: los vencidos primero, y dentro de cada grupo, por fecha de revisión de la más antigua a la más nueva. Paginada como el listado (spec 001, R13).
- **R6 · Quién puede marcar como revisado.** El ADMIN o el responsable del documento. Sin sesión: 401. Cualquier otro usuario que puede ver el documento: 403. Un documento que no existe o que el usuario no puede ver: 404 (spec 001, R11).
- **R7 · Marcar como revisado: datos.** Se indica una fecha de revisión nueva, obligatoria, con las mismas reglas que en la carga: desde mañana, en hora de Argentina (spec 001, R6). Si no: 400.
- **R8 · Marcar como revisado: resultado.** Cambia solo la fecha de revisión y registra la última revisión (quién y cuándo). No crea una versión, no toca el archivo ni los fragmentos del asistente. Respuesta: 200 con el documento actualizado.
- **R9 · Documento archivado.** No se puede marcar como revisado un documento archivado: 409.
- **R10 · Versión nueva.** Subir una versión nueva con fecha de revisión (spec 003, R7b) también registra la última revisión. Sin fecha nueva, la última revisión no cambia.
- **R11 · Última revisión.** El detalle muestra, al ADMIN y al responsable, cuándo y quién hizo la última revisión. Un documento que nunca se revisó no la muestra.
- **R12 · Auditoría.** Cada "Marcar como revisado" queda en la auditoría: quién, qué documento, cuándo, la fecha anterior, la nueva y el resultado.
- **R13 · Errores.** Si la base no responde: 503, como en el resto de los documentos.

### Reglas de pantalla

- **F1 · Etiquetas.** En las tarjetas del listado y en el detalle, a quien corresponde (R4): "Vencido" (rojo) o "Vence pronto" (ámbar), siempre con la palabra, nunca solo el color. "Al día" no lleva etiqueta.
- **F2 · Acceso a "Por revisar".** Desde Documentos, para el ADMIN y para quien sea responsable de algún documento, con la cantidad de documentos pendientes.
- **F3 · Lista "Por revisar".** Las mismas tarjetas del listado, con su etiqueta y la fecha de revisión. Sin pendientes: "No tenés documentos para revisar".
- **F4 · Marcar como revisado.** En el detalle, para el ADMIN y el responsable, en un documento `ACTIVE`: un campo de fecha (desde mañana) y el botón "Marcar como revisado". Al terminar, el detalle se actualiza y avisa "Revisión registrada".
- **F5 · Errores.** Cada código con su mensaje, como en las specs anteriores (spec 002, F3), sin perder la fecha elegida.
- **F6 · Responsive.** Todo se usa desde la computadora y desde el celular.

## 7. Estados

| Estado de revisión | Condición | Lo cambia |
| --- | --- | --- |
| Al día | Faltan más de 30 días | El paso del tiempo |
| Por vencer | Faltan 30 días o menos | El paso del tiempo; marcar como revisado o una versión nueva lo devuelve a Al día |
| Vencido | La fecha ya pasó | Marcar como revisado o una versión nueva lo devuelve a Al día |

## 8. Casos borde

- La fecha de revisión es hoy: "Por vencer" (R1).
- La fecha nueva elegida al marcar como revisado cae dentro de los próximos 30 días: se acepta, y el documento queda "Por vencer" (R7).
- El responsable pierde el acceso a las áreas del documento: deja de poder verlo, y con eso deja de ver sus avisos; el ADMIN los sigue viendo.
- El responsable es un ADMIN: ve el aviso una sola vez, no duplicado.
- Dos personas marcan el mismo documento como revisado casi a la vez: queda la última fecha guardada, y las dos quedan en la auditoría.
- Un usuario es responsable de documentos en varias áreas: "Por revisar" los muestra todos juntos.

## 9. Restricciones no funcionales

- Las mismas de las specs anteriores: errores con el formato de NestJS, endpoints en Swagger, ningún secreto en el repositorio.
- "Hoy" siempre en hora de Argentina, también en los tests, que no pueden depender de la hora en que corren.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 30/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Cuándo está "por vencer"? | 30 días o menos; vencido cuando la fecha ya pasó | R1 |
| P2 · ¿Quién ve los avisos? | El responsable y los ADMIN | R4, R5 |
| P3 · ¿Dónde se ven? | En la app: etiquetas y la sección "Por revisar"; sin email | F1 a F3 |
| P4 · ¿Cómo se resuelve un aviso? | "Marcar como revisado" con una fecha nueva, además de una versión nueva | R7, R8, R10 |
| P5 · ¿Quién puede marcarlo como revisado? | El ADMIN y el responsable, solo la fecha | R6, R8 |
| P6 · ¿Los archivados tienen avisos? | No | R2 |
| P7 · ¿Cómo se calcula? | En el momento de cada consulta | R3 |
| P8 · ¿Métricas para el panel de la pareja B? | Fuera de esta spec; se acuerdan después con Mayra | Sección 4 |

Para la pareja B (Mayra): con esta spec queda disponible el estado de revisión de cada documento; si quieren las cantidades (al día, por vencer y vencidos) para el panel de métricas, acordamos el contrato en una spec aparte.

## 11. Criterios de aceptación

```gherkin
Escenario: documento por vencer
  Dado un documento activo cuya fecha de revisión es dentro de 10 días
  Y su responsable con sesión
  Cuando abre el listado de documentos
  Entonces ve el documento con la etiqueta "Vence pronto"

Escenario: documento vencido
  Dado un documento activo cuya fecha de revisión fue hace 5 días
  Cuando un ADMIN abre su detalle
  Entonces ve la etiqueta "Vencido"

Escenario: documento al día
  Dado un documento activo cuya fecha de revisión es dentro de 90 días
  Cuando su responsable abre el listado
  Entonces el documento no tiene etiqueta de revisión

Escenario: la fecha de revisión es hoy
  Dado un documento activo cuya fecha de revisión es hoy, en hora de Argentina
  Cuando su responsable abre el listado
  Entonces ve la etiqueta "Vence pronto"

Escenario: un empleado que no es responsable no ve avisos
  Dado un documento vencido del área Ventas cuyo responsable es otra persona
  Y un EMPLOYEE de Ventas con sesión
  Cuando abre el listado y el detalle
  Entonces ve el documento sin etiqueta de revisión
  Y no ve "Marcar como revisado"

Escenario: sección "Por revisar"
  Dado un documento vencido, uno por vencer y uno al día, los tres con el mismo responsable
  Cuando el responsable abre "Por revisar"
  Entonces ve el vencido primero y después el por vencer
  Y no ve el que está al día

Escenario: el ADMIN ve todos los pendientes
  Dados documentos por vencer de distintos responsables
  Cuando un ADMIN abre "Por revisar"
  Entonces los ve todos

Escenario: marcar como revisado
  Dado un documento vencido
  Y su responsable con sesión
  Cuando marca el documento como revisado con una fecha dentro de 6 meses
  Entonces la fecha de revisión pasa a ser esa
  Y el documento queda al día
  Y la versión vigente y su archivo no cambian
  Y el detalle muestra que lo revisó él, hoy

Escenario: fecha inválida
  Dado un documento vencido
  Cuando el responsable intenta marcarlo como revisado con la fecha de hoy
  Entonces la respuesta es 400
  Y la fecha de revisión no cambia

Escenario: sin permiso para marcar como revisado
  Dado un documento de Ventas cuyo responsable es otra persona
  Y un EMPLOYEE de Ventas con sesión
  Cuando intenta marcarlo como revisado
  Entonces la respuesta es 403

Escenario: documento archivado
  Dado un documento archivado con la fecha de revisión vencida
  Cuando un ADMIN abre "Por revisar"
  Entonces no lo ve
  Y si intenta marcarlo como revisado, la respuesta es 409

Escenario: una versión nueva también cuenta como revisión
  Dado un documento vencido
  Cuando un ADMIN sube una versión nueva con una fecha de revisión dentro de un año
  Entonces el documento queda al día
  Y el detalle muestra la última revisión con esa fecha y ese ADMIN

Escenario: sin pendientes
  Dado un usuario responsable de documentos que están todos al día
  Cuando abre "Por revisar"
  Entonces ve "No tenés documentos para revisar"
```
