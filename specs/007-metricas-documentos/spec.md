# Spec 007 · Métricas de documentos

- **Historia:** HU38 (panel de métricas), parte de la pareja C: las métricas de documentos que muestra el panel de la pareja B.
- **Responsable:** Matías Fauda (pareja C). **Lo consume:** Mayra (pareja B), en la tarjeta de documentos del panel `/metricas`.
- **Depende de:** spec 001 (documentos y áreas), spec 005 (estado de revisión) y el endpoint de métricas de procedimientos de la pareja B (`GET /api/metrics/procedures`), cuyas reglas de roles, filtros y errores se replican.
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

El panel de métricas de la pareja B muestra "Todavía no disponible" en la tarjeta de documentos, porque no existe el endpoint que la alimenta.

Esta feature agrega `GET /api/metrics/documents`, que devuelve cuántos documentos hay activos, cuántos están al día, por vencer o vencidos, cuántos tienen la versión vigente con error de procesamiento y cuántos se cargaron en un período, con los mismos filtros y las mismas reglas de acceso que las métricas de procedimientos.

## 2. Actores

- **ADMIN:** ve las métricas de todas las áreas, o de una.
- **SUPERVISOR:** ve las métricas de sus áreas, o de una de ellas.
- **EMPLOYEE:** no tiene acceso.
- **Panel de métricas (pareja B):** consume el endpoint.

## 3. Alcance

- El endpoint `GET /api/metrics/documents` con sus filtros `areaId`, `from` y `to`.
- Las reglas de acceso por rol y área.

## 4. Fuera de alcance

- La tarjeta del panel y su adaptador en la web: son de la pareja B, que se adapta a este contrato.
- Documentos consultados (`consulted`): hoy no se registra cuándo alguien abre o descarga un documento. Queda para una spec futura.
- Detalle por documento o por área en la respuesta: solo totales.
- Métricas del asistente de IA.

## 5. Flujo principal

El panel de la pareja B pide `GET /api/metrics/documents` con los filtros que eligió el usuario. La API valida el rol, calcula el alcance de áreas, cuenta los documentos y responde los totales. El panel los muestra en la tarjeta de documentos.

## 6. Reglas de negocio

- **R1 · Quién.** ADMIN y SUPERVISOR. Sin sesión: 401. EMPLOYEE: 403.
- **R2 · Alcance de áreas.** Las áreas del usuario se leen del directorio de usuarios en cada pedido, nunca de la sesión.
  - ADMIN sin `areaId`: todas las áreas. Con `areaId`: solo esa.
  - SUPERVISOR sin `areaId`: sus áreas. Con `areaId` de una de sus áreas: solo esa.
- **R3 · Área ajena o inexistente.** Un `areaId` que no existe, o que no es del SUPERVISOR, responde 404 "No se encontró el área", igual en los dos casos, como en las métricas de procedimientos.
- **R4 · Qué documentos cuentan.** Solo documentos `ACTIVE` que tienen al menos un área dentro del alcance. Un documento con varias áreas cuenta una sola vez en cada total. Los archivados no cuentan en ningún total.
- **R5 · Foto de hoy.** `active`, `upToDate`, `dueSoon`, `overdue` y `processingFailed` describen el estado de hoy, en hora de Argentina; el período no los cambia (decisión P1).
  - `active`: documentos activos del alcance.
  - `upToDate`, `dueSoon` y `overdue`: según el estado de revisión de la spec 005 (R1 de esa spec). Los tres suman `active`.
  - `processingFailed`: documentos activos cuya versión vigente tiene el procesamiento en error (decisión P2).
- **R6 · Cargados en el período.** `uploaded` cuenta los documentos activos del alcance cargados entre `from` y `to`, los dos días inclusive, en hora de Argentina. Sin `from` o sin `to`, ese lado queda sin límite; sin ninguno, cuenta todos.
- **R7 · Fechas.** `from` y `to` son opcionales, con formato `YYYY-MM-DD` y un día que exista. Si no: 400. Si `from` es posterior a `to`: 400 "La fecha de inicio no puede ser posterior a la fecha de fin".
- **R8 · Respuesta.** 200 con:

  ```json
  {
    "filters": { "areaId": null, "from": null, "to": null },
    "totals": {
      "active": 12,
      "upToDate": 8,
      "dueSoon": 3,
      "overdue": 1,
      "processingFailed": 0,
      "uploaded": 4
    }
  }
  ```

  `filters` repite los filtros recibidos, con `null` en los que no vinieron. Sin documentos en el alcance, todos los totales valen 0.
- **R9 · Errores.** Con el formato de NestJS. Si la base o el directorio de usuarios no responden: 503 "No se pudo completar la consulta de las métricas. Intentá de nuevo en unos minutos.". Cualquier otro error: 500, con la causa solo en el log.

## 7. Estados

Esta feature no cambia estados: solo cuenta los de las specs 001 (documento), 004 (procesamiento de la versión) y 005 (revisión).

## 8. Casos borde

- Un documento con áreas Ventas y Operaciones, y un SUPERVISOR de las dos: cuenta una vez.
- El mismo documento con `areaId` de Ventas: cuenta; con `areaId` de un área que no tiene: no cuenta.
- Un documento cargado el `to` a las 23:30 de Argentina (ya el día siguiente en UTC): cuenta en `uploaded`.
- Un documento cargado en el período y después archivado: no cuenta en ningún total (R4).
- Un documento cuya versión vigente todavía no se procesó: cuenta en `active` y en su estado de revisión, no en `processingFailed`.
- Un SUPERVISOR sin áreas: todos los totales en 0.

## 9. Restricciones no funcionales

- Las mismas de las specs anteriores: errores con el formato de NestJS, endpoint en Swagger, ningún secreto en el repositorio.
- Los nombres de los campos de R8 son el contrato con la pareja B: no se cambian sin acordarlo.
- No se modifican archivos de la pareja B (`src/executions`, `apps/web/lib/metrics`, `apps/web/components/metrics`).

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 30/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Qué filtran `from` y `to`? | Solo `uploaded`; los demás totales son la foto de hoy | R5, R6 |
| P2 · ¿Qué es "error de procesamiento"? | Documentos activos cuya versión vigente está en error, hoy | R5 |
| P3 · ¿Roles, áreas y errores? | Iguales a las métricas de procedimientos | R1 a R3, R7, R9 |
| P4 · ¿Cuentan los archivados? | No | R4 |
| P5 · ¿Un documento con varias áreas? | Cuenta una vez | R4 |
| P6 · ¿Y "consultados"? | Fuera de esta spec: no se registran las consultas | Sección 4 |
| P7 · ¿Qué forma tiene la respuesta? | `filters` + `totals`, como la de procedimientos, con los campos de R8 | R8 |

Para la pareja B (Mayra): el adaptador de la web hoy espera `{ active, consulted, processingFailed }`, una forma que su propio código marca como propuesta. Este contrato la reemplaza: tienen que adaptar `DocumentMetrics` y la tarjeta a R8.

## 11. Criterios de aceptación

```gherkin
Escenario: el ADMIN ve los totales de todas las áreas
  Dado un documento de Ventas al día, uno de Operaciones por vencer y uno de Ventas vencido
  Cuando un ADMIN pide las métricas sin filtros
  Entonces la respuesta es 200
  Y active es 3, upToDate es 1, dueSoon es 1 y overdue es 1

Escenario: el SUPERVISOR ve solo sus áreas
  Dados documentos activos en Ventas y en Operaciones
  Y un SUPERVISOR que pertenece solo a Ventas
  Cuando pide las métricas sin filtros
  Entonces los totales cuentan solo los documentos de Ventas

Escenario: filtro por área
  Dados documentos activos en Ventas y en Operaciones
  Cuando un ADMIN pide las métricas con areaId de Operaciones
  Entonces los totales cuentan solo los documentos de Operaciones
  Y filters.areaId es el de Operaciones

Escenario: área ajena
  Dado un SUPERVISOR que pertenece solo a Ventas
  Cuando pide las métricas con areaId de Operaciones
  Entonces la respuesta es 404 "No se encontró el área"

Escenario: un empleado no tiene acceso
  Dado un EMPLOYEE con sesión
  Cuando pide las métricas de documentos
  Entonces la respuesta es 403

Escenario: documento con varias áreas
  Dado un documento activo con las áreas Ventas y Operaciones
  Cuando un ADMIN pide las métricas sin filtros
  Entonces active es 1

Escenario: los archivados no cuentan
  Dado un documento archivado con la fecha de revisión vencida
  Cuando un ADMIN pide las métricas
  Entonces no cuenta en active, overdue ni uploaded

Escenario: error de procesamiento
  Dado un documento activo cuya versión vigente tiene el procesamiento en error
  Y otro cuya versión vigente todavía no se procesó
  Cuando un ADMIN pide las métricas
  Entonces processingFailed es 1

Escenario: cargados en el período
  Dados documentos cargados el 1/10, el 15/10 y el 31/10
  Cuando un ADMIN pide las métricas con from 2026-10-10 y to 2026-10-31
  Entonces uploaded es 2
  Y active sigue contando los tres

Escenario: fechas inválidas
  Cuando un ADMIN pide las métricas con from 2026-10-31 y to 2026-10-01
  Entonces la respuesta es 400
  Y si pide from 2026-02-30, la respuesta es 400

Escenario: sin documentos
  Dado un área sin documentos
  Cuando un ADMIN pide las métricas con su areaId
  Entonces la respuesta es 200 con todos los totales en 0
```
