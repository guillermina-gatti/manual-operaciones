# Spec 014 · Métricas personales del empleado

- **Historia:** opcional de la pareja B, fuera del informe: la actividad propia del empleado, complemento de HU12 y HU38.
- **Responsable:** Mayra Limachi (pareja B).
- **Depende de:** spec 012 (ejecuciones) y spec 013 (reglas de período, áreas, 24 h y errores, que se reutilizan).
- **Estado:** implementada y en `develop` (08/11/2026). Esta spec se escribió después del código y refleja las decisiones tomadas durante el trabajo (sección 10).

## 1. Problema y objetivo

Un empleado no tiene dónde ver qué procedimientos dejó sin terminar ni cuánto le lleva cada uno. Las métricas de la spec 013 son para ADMIN y SUPERVISOR.

Esta feature agrega `GET /api/metrics/me`, con las métricas de las ejecuciones del propio empleado, y la página `/ejecuciones/mi-actividad`, con su resumen, las ejecuciones para retomar y sus procedimientos recientes.

## 2. Actores

- **EMPLOYEE:** ve solo sus propias ejecuciones.
- **ADMIN y SUPERVISOR:** no tienen acceso (403); usan las métricas de la spec 013.

## 3. Alcance

- El endpoint `GET /api/metrics/me` con sus filtros `areaId`, `from` y `to`.
- La página `/ejecuciones/mi-actividad` y el link "Ver mi actividad →" desde `/ejecuciones`.

## 4. Fuera de alcance

- **La comparación con el promedio de los demás:** queda pendiente, con las reglas de privacidad de la sección 10 para cuando se haga.
- **La actividad por semana.**
- Métricas personales para SUPERVISOR o ADMIN.
- El nombre real del procedimiento: como en la spec 013, la web usa los nombres de ejemplo hasta que el catálogo entregue el título.

## 5. Flujo principal

El empleado entra a `/ejecuciones/mi-actividad`, o toca "Ver mi actividad →" en `/ejecuciones`. Sin filtros en la dirección, la web pide el mes en curso hasta hoy, en hora de Argentina, de todas sus áreas. La API toma el usuario de la sesión, valida el área y responde. La página muestra su resumen, las ejecuciones que puede retomar (de cualquier fecha) y la tabla de sus procedimientos recientes.

## 6. Reglas de negocio

- **R1 · Quién.** Solo EMPLOYEE. Sin sesión: 401. ADMIN o SUPERVISOR: 403.
- **R2 · Solo sus datos.** El usuario sale siempre de la sesión. No hay parámetro de usuario: un `userId` (o cualquier propiedad de más) en la consulta es 400. La respuesta nunca incluye ids de usuarios.
- **R3 · Áreas activas.** Las áreas del empleado se leen de los directorios en cada pedido, nunca de la sesión, y solo cuentan las activas (`activeAreaIdsOf`). Sin `areaId`: todas sus áreas activas. Con `areaId` de una de ellas: solo esa. Un `areaId` ajeno, inactivo o que no existe: 404 "No se encontró el área", sin leer sus ejecuciones.
- **R4 · Procedimientos en el alcance.** Cuentan sus ejecuciones de procedimientos que hoy comparten un área del alcance. Si un procedimiento sale de sus áreas, desaparece de sus métricas y de la lista para retomar (abrirlo daría 404, spec 012).
- **R5 · Período.** Como en la spec 013: `from` y `to` opcionales, días de Argentina inclusive, aplicados al inicio de la ejecución; sin ellos, todas. `from > to` o un día que no existe: 400.
- **R6 · Sin avanzar.** Una ejecución en curso cuyo paso actual empezó hace más de 24 h (`staleAfterHours`) cuenta como abandonada en los totales y en la tabla, igual que en la spec 013. Al empleado se le muestra como **"Sin avanzar hace más de 24 h"**, nunca como "abandonada": la ejecución no se cierra y la puede retomar.
- **R7 · Totales.** `started = completed + inProgress + abandoned`. `avgCompletionMs`: el promedio de sus ejecuciones completadas del período, cada una con el mismo peso, o `null`.
- **R8 · Para retomar.** `resume` lista todas sus ejecuciones en curso, **sin importar el período**, con el paso actual (id, orden y título), el total de pasos, el inicio, el último avance (`lastActivityAt`, cuando empezó el paso actual) y `stale`. La más recientemente movida primero. Exactamente a las 24 h todavía no es `stale`.
- **R9 · Procedimientos.** Uno por procedimiento con ejecuciones en el período, el empezado más recientemente primero, con sus áreas, sus conteos, su tiempo medio, la última vez que lo empezó y el paso que más le lleva (`slowestStep`): el de mayor tiempo medio en la última versión que ejecutó; a igual tiempo, el primero; sin pasos terminados, `null`.
- **R10 · Respuesta.** 200 con `filters`, `staleAfterHours`, `areaIds` (sus áreas activas), `totals`, `resume` y `procedures`. Sin ejecuciones: totales en 0, `avgCompletionMs: null` y listas vacías.
- **R11 · Errores.** Si la base o los directorios no responden: 503 "No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.". Cualquier otro error: 500, con la causa solo en el log. Si el repositorio recibe un id de usuario vacío, falla sin consultar la base (sin ese filtro sumaría las ejecuciones de todos).

## 7. Estados

No cambia estados: lee los de la spec 012. "Sin avanzar" se calcula en cada pedido.

## 8. Casos borde

- Dos empleadas de Ventas con ejecuciones mezcladas: cada una ve solo las suyas.
- Una ejecución en curso desde antes del período: no cuenta en los totales, pero aparece en "Para retomar".
- Su única área se desactiva: 200 con todo en 0, y 404 si pide esa área.
- Un procedimiento que se movió a un área que no es suya: desaparece de la tabla y de "Para retomar".
- Una ejecución con el paso actual empezado hace exactamente 24 h: todavía en curso.

## 9. Restricciones no funcionales

- Las mismas de las specs 012 y 013.
- El texto "abandonada" no aparece en ningún lugar de la página para el empleado, tampoco en etiquetas para lectores de pantalla.
- La página reutiliza los filtros y los tiles de `/metricas` sin cambiar cómo se ve `/metricas`.

## 10. Decisiones

Tomadas por Mayra el 06/11/2026 y el 08/11/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Quién la ve? | Solo EMPLOYEE; ADMIN y SUPERVISOR, 403 | R1 |
| P2 · ¿De quién son los datos? | Siempre del usuario de la sesión; nunca un parámetro | R2 |
| P3 · ¿Dónde va en la web? | Una página nueva, `/ejecuciones/mi-actividad`, no dentro de `/metricas` | Sección 3 |
| P4 · ¿Cómo se llama a la abandonada? | "Sin avanzar hace más de 24 h", en durazno y no en rosa: el empleado la puede retomar | R6 |
| P5 · ¿"Para retomar" depende del período? | No: todas sus ejecuciones en curso | R8 |
| P6 · ¿Comparación con los demás? | Pendiente. Cuando se haga: solo ejecuciones completadas de **otros** usuarios; al menos 5 ejecuciones de al menos 3 personas, si no `null`; ventana fija de los últimos 90 días, sin importar `from` y `to`; redondeada al minuto; sin nombres ni cantidad de personas | Sección 4 |
| P7 · ¿Actividad por semana? | Pendiente | Sección 4 |

Las reglas de P6 también están escritas al principio de `apps/api/src/executions/metrics/my-metrics.ts`.

## 11. Criterios de aceptación

```gherkin
Escenario: solo sus ejecuciones
  Dadas ejecuciones de Elena y de otra empleada de Ventas
  Cuando Elena pide GET /api/metrics/me
  Entonces los totales cuentan solo las de Elena
  Y la respuesta no contiene ningún id de usuario

Escenario: no se puede pedir otro usuario
  Cuando Elena pide GET /api/metrics/me?userId=<otra empleada>
  Entonces la respuesta es 400

Escenario: un área que no es suya
  Cuando Elena, de Ventas, pide areaId de Operaciones
  Entonces la respuesta es 404 "No se encontró el área"

Escenario: para retomar sin importar el período
  Dada una ejecución en curso de Elena empezada el 01/09
  Cuando pide from=2026-10-10 y to=2026-10-31
  Entonces esa ejecución no cuenta en los totales
  Y aparece en resume

Escenario: sin avanzar hace más de 24 h
  Dada una ejecución de Elena con el paso actual empezado hace 30 horas
  Cuando pide sus métricas
  Entonces los totales tienen abandoned 1
  Y en resume esa ejecución tiene stale true
  Y la página muestra "Sin avanzar hace más de 24 h" y nunca "abandonada"

Escenario: otros roles
  Cuando un ADMIN o un SUPERVISOR pide GET /api/metrics/me
  Entonces la respuesta es 403
```
