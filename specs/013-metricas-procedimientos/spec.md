# Spec 013 · Métricas de procedimientos

- **Historia:** HU38 (panel de métricas), parte de la pareja B: las métricas de las ejecuciones de procedimientos y el panel `/metricas`.
- **Responsable:** Mayra Limachi (pareja B). **Lo consumen:** ADMIN y SUPERVISOR en `/metricas`; la pareja C replica sus reglas de roles, filtros y errores en las métricas de documentos (spec 007).
- **Depende de:** spec 012 (ejecuciones) y el puerto `ProceduresCatalog` (versiones y pasos). En el panel también se muestran las métricas de documentos (spec 007) y, cuando exista, las del asistente (pareja C).
- **Estado:** implementada y en `develop`. Esta spec se escribió después del código, el 08/11/2026, y refleja las decisiones tomadas durante el trabajo (sección 10).

## 1. Problema y objetivo

Un administrador o un supervisor necesita saber qué procedimientos se usan, cuántas ejecuciones se completan, cuánto tardan y en qué paso se traban o se abandonan.

Esta feature agrega `GET /api/metrics/procedures`, que agrupa las ejecuciones del período por procedimiento y por versión, con los números de cada paso, y el panel `/metricas` que los muestra con filtros por área y por fechas.

## 2. Actores

- **ADMIN:** ve las métricas de todas las áreas, o de una.
- **SUPERVISOR:** ve las métricas de sus áreas activas, o de una de ellas.
- **EMPLOYEE:** no tiene acceso (403); ve solo su actividad en la spec 014.

## 3. Alcance

- El endpoint `GET /api/metrics/procedures` con sus filtros `areaId`, `from` y `to`.
- Las reglas de acceso por rol y área, y la definición de ejecución abandonada.
- El panel `/metricas`: filtros, resumen general, tiempo por procedimiento, detalle por área con los pasos de cada versión, y las tarjetas de documentos y asistente de la pareja C.

## 4. Fuera de alcance

- Los procedimientos sin ejecuciones en el período: no aparecen (decisión P3).
- La duración mínima y máxima de las ejecuciones, el tiempo medio exacto del total, el tiempo por versión y el resumen por área para el selector: no están en la respuesta. La web no muestra esas columnas.
- El nombre del procedimiento: la API solo da su id; la web usa los nombres de ejemplo hasta que el catálogo entregue el título.
- Las métricas del asistente: dependen de `GET /api/metrics/assistant` de la pareja C, que no existe al 08/11/2026.
- Ver quién hizo cada ejecución: la respuesta nunca incluye usuarios.

## 5. Flujo principal

El ADMIN o SUPERVISOR entra a `/metricas`. Sin filtros en la dirección, la web pide el mes en curso hasta hoy, en hora de Argentina, de todas sus áreas. La API valida el rol, calcula el alcance, agrega las ejecuciones que empezaron en el período y responde. El panel muestra los números; al cambiar un filtro, la dirección cambia y se vuelve a pedir.

## 6. Reglas de negocio

- **R1 · Quién.** ADMIN y SUPERVISOR. Sin sesión: 401. EMPLOYEE: 403.
- **R2 · Alcance de áreas.** Las áreas del usuario se leen de los directorios en cada pedido, nunca de la sesión. Solo cuentan las activas (`activeAreaIdsOf`); un usuario inactivo no tiene ninguna.
  - ADMIN sin `areaId`: todos los procedimientos. Con `areaId`: los que tienen esa área.
  - SUPERVISOR sin `areaId`: los procedimientos que comparten un área activa con él. Con `areaId` de una de sus áreas activas: solo esa.
- **R3 · Área ajena.** Un SUPERVISOR que pide un `areaId` que no es de sus áreas activas (ajena, inactiva o que no existe): 404 "No se encontró el área". Un ADMIN con un área que no existe: 200 con todo en 0.
- **R4 · Áreas actuales.** Un procedimiento entra en el alcance por las áreas que tiene hoy, en todas sus versiones. Si se mueve de área, sus ejecuciones pasadas se ven desde el área nueva.
- **R5 · Período.** `from` y `to` son opcionales, con formato `YYYY-MM-DD` y un día que exista; si no, 400. Si `from` es posterior a `to`: 400 "La fecha de inicio no puede ser posterior a la fecha de fin". El período se aplica al inicio de la ejecución, con los dos días inclusive y en hora de Argentina (`APP_TIMEZONE`). Sin `from` o sin `to`, ese lado queda sin límite; sin ninguno, cuentan todas. "Este mes" es solo el valor por defecto de la web.
- **R6 · Abandonada.** Una ejecución en curso cuyo paso actual empezó hace más de 24 h (`staleAfterHours`, fijo para el MVP) cuenta como abandonada en ese paso. No se cierra: el empleado la puede retomar.
- **R7 · Conteos.** Por procedimiento, por versión y en el total: `started = completed + inProgress + abandoned`, los tres excluyentes. `completionRate = completed / started`, o `null` sin ejecuciones. `avgCompletionMs` del procedimiento: el promedio de duración de sus ejecuciones completadas, o `null`.
- **R8 · Pasos.** Cada versión trae todos sus pasos en orden, con `reached` (ejecuciones que lo empezaron), `finished`, `avgDurationMs` (o `null` si nadie lo terminó), `abandoned` y `abandonRate = abandoned / reached` (o `null`). Un paso que nadie alcanzó tiene ceros y `null`.
- **R9 · Versiones.** Cada procedimiento trae sus versiones con ejecuciones en el período, la de la ejecución más reciente primero. Una versión que el catálogo no conoce se deja afuera y se registra en el log.
- **R10 · Orden.** Los procedimientos más empezados primero; a igual cantidad, por id.
- **R11 · Respuesta.** 200 con `filters` (los recibidos, `null` en los que no vinieron), `staleAfterHours`, `areaIds` (las áreas por las que puede filtrar: `null` para el ADMIN), `totals` y `procedures`. Nunca incluye usuarios.
- **R12 · Errores.** Con el formato de NestJS. Si la base, el catálogo o los directorios no responden: 503 "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.". Cualquier otro error: 500, con la causa solo en el log.

## 7. Estados

Esta feature no cambia estados: cuenta los de la spec 012. "Abandonada" no es un estado guardado, se calcula en cada pedido con R6.

## 8. Casos borde

- Un procedimiento con áreas Ventas y Operaciones: cuenta una vez en el total, y aparece en la tarjeta de cada área en el panel.
- Una ejecución que empezó el `to` a las 23:30 de Argentina (ya el día siguiente en UTC): cuenta.
- Un paso empezado hace 23 h: en curso. Hace 25 h: abandonado.
- Un SUPERVISOR cuya única área se desactiva: 200 con todo en 0, y 404 si pide esa área.
- Un procedimiento que se movió de Ventas a Operaciones: el supervisor de Ventas deja de verlo en el pedido siguiente.
- Dos versiones de un procedimiento en el período: cada una con sus propios pasos.

## 9. Restricciones no funcionales

- Errores con el formato de NestJS; endpoint en Swagger (etiqueta `metrics`).
- Los campos de la respuesta no se cambian sin acordarlo: la pareja C replica sus reglas.
- Las agregaciones se hacen en la base, en una transacción `RepeatableRead`, para que todas las consultas vean la misma foto.
- Panel con el diseño de `DESIGN.md`; ningún número solo con color, filtros en la dirección para que una vista se pueda compartir.
- No se modifican archivos compartidos: el control de acceso del panel es local (`MetricsAccess`), sin tocar `RequireRole`.

## 10. Decisiones

Aprobadas por Mayra el 27/10/2026, salvo que diga otra fecha.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Qué es abandonada? | Un paso en curso por más de 24 h, fijo (constante, no parámetro) | R6 |
| P2 · ¿Una abandonada se cierra? | No: sigue en curso y se puede retomar | R6 |
| P3 · ¿Aparecen los procedimientos sin ejecuciones? | No; el puerto `ProceduresCatalog` no cambia | Sección 4 |
| P4 · ¿Agrupado cómo? | Por procedimiento y por versión, con sus pasos | R8, R9 |
| P5 · ¿Un SUPERVISOR pide un área ajena? | 404, como cualquier recurso ajeno | R3 |
| P6 · ¿Áreas inactivas? | No cuentan para el SUPERVISOR (01/11/2026) | R2, R3 |
| P7 · ¿Acceso en la web? | Un guard local para ADMIN y SUPERVISOR; no se toca `RequireRole` | Sección 9 |
| P8 · ¿Métricas de la pareja C? | Un puerto en la web (`lib/metrics/`); documentos conectado el 04/11/2026; asistente con un adaptador vacío hasta que exista su endpoint | Sección 4 |
| P9 · ¿Período por defecto? | En la web, el mes en curso hasta hoy; en la API, sin límites | R5 |

## 11. Criterios de aceptación

```gherkin
Escenario: el ADMIN ve todos los procedimientos
  Dadas ejecuciones de "Cierre de caja" (Ventas) y de "Recepción de mercadería" (Operaciones)
  Cuando un ADMIN pide GET /api/metrics/procedures sin filtros
  Entonces la respuesta es 200 con los dos procedimientos
  Y areaIds es null

Escenario: el SUPERVISOR ve solo sus áreas
  Dado un SUPERVISOR de Ventas
  Cuando pide las métricas sin filtros
  Entonces solo aparece "Cierre de caja"

Escenario: área ajena
  Dado un SUPERVISOR de Ventas
  Cuando pide las métricas con areaId de Operaciones
  Entonces la respuesta es 404 "No se encontró el área"

Escenario: un paso abandonado
  Dada una ejecución cuyo paso 2 empezó hace 25 horas
  Y otra cuyo paso 2 empezó hace 23 horas
  Cuando un ADMIN pide las métricas
  Entonces el procedimiento tiene abandoned 1 e inProgress 1
  Y el paso 2 tiene abandonRate 0,5 sobre las que lo alcanzaron

Escenario: días de Argentina
  Dada una ejecución que empezó el 31/03 a las 23:30 de Argentina
  Cuando un ADMIN pide from=2026-03-01 y to=2026-03-31
  Entonces esa ejecución cuenta

Escenario: EMPLOYEE no tiene acceso
  Cuando un EMPLOYEE pide GET /api/metrics/procedures
  Entonces la respuesta es 403
```
