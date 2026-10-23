# Spec 003 · Ciclo de vida de los documentos

- **Historias:** HU15 (asignar áreas a cada documento: la parte de cambiarlas) y HU16 (reemplazar o archivar documentos).
- **Responsable:** Matías Fauda (pareja C)
- **Depende de:** spec 001 (tablas y endpoints de documentos), spec 002 (pantallas) y la tabla `chunks` de Guille (ya está en `develop`).
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

Hoy un documento, una vez cargado, no se puede cambiar. Si el manual se actualiza, si se cargó en el área equivocada o si deja de usarse, el administrador no tiene forma de corregirlo, y el asistente de IA seguiría respondiendo con información vieja.

Esta feature permite al administrador **cambiar las áreas** de un documento, **subir una versión nueva** del archivo y **archivar** un documento. Siempre se cumple una condición: el asistente solo usa la información **vigente** y de las **áreas correctas**.

## 2. Actores

- **ADMIN:** cambia áreas, sube versiones nuevas y archiva.
- **SUPERVISOR y EMPLOYEE:** no pueden hacer ninguna de estas acciones. Ven el resultado: un documento que cambió de área aparece o desaparece de su listado, y uno archivado deja de verse.
- **Procesamiento (Guille):** procesa la versión nueva, igual que con la primera.

## 3. Alcance

- Cambiar las áreas de un documento existente.
- Subir una versión nueva de un documento (reemplazar el archivo).
- Archivar un documento.
- Ver el historial de versiones de un documento (solo ADMIN).
- Las pantallas para hacer todo esto, dentro del detalle del documento.

## 4. Fuera de alcance

- Editar título, descripción o responsable de un documento existente (decisión P5). La fecha de revisión solo se cambia al subir una versión nueva (R7b).
- Desarchivar un documento (decisión P1). Para recuperarlo, se vuelve a cargar: la spec 001 acepta un archivo idéntico al de un documento archivado.
- Borrar documentos o versiones definitivamente.
- Comparar versiones entre sí.
- La búsqueda (HU36) y los avisos de vencimiento (HU37): spec 004.

## 5. Flujos principales

**Cambiar áreas.** El ADMIN, desde el detalle, cambia las áreas del documento y guarda. Desde ese momento, el documento y todos sus fragmentos para el asistente pertenecen a las áreas nuevas.

**Subir versión nueva.** El ADMIN, desde el detalle, elige un archivo nuevo y lo sube. La versión anterior queda reemplazada, la nueva queda vigente y pasa a procesarse. El documento conserva su identidad: mismo título, mismas áreas, mismo enlace.

**Archivar.** El ADMIN, desde el detalle, archiva el documento. Deja de verse para los demás roles y el asistente deja de usarlo.

## 6. Reglas de negocio

- **R1 · Quién.** Solo un ADMIN puede cambiar áreas, subir versiones o archivar. Sin sesión: 401. Con otro rol: 403.
- **R2 · Documento inexistente.** Si el documento no existe: 404.
- **R3 · Áreas válidas.** Las áreas nuevas siguen las mismas reglas que en la carga: al menos una, todas tienen que existir (400 si no).
- **R4 · Responsable con acceso.** Si después del cambio el responsable ya no comparte ningún área con el documento y no es ADMIN, el cambio se rechaza con 400. El ADMIN puede elegir un responsable nuevo en la misma operación, que tiene que cumplir la misma regla que en la carga (R5 de la spec 001).
- **R5 · Áreas del asistente.** Al cambiar las áreas, los fragmentos de **todas** las versiones del documento quedan con las áreas nuevas, en la misma operación. Nunca queda un fragmento con las áreas viejas.
- **R6 · Versión nueva: archivo.** El archivo nuevo sigue las mismas reglas que en la carga: PDF, `.txt` o `.md`, hasta 10 MB, comprobado por contenido (415, 413).
- **R6b · Versión idéntica.** Si el archivo nuevo es idéntico (misma huella SHA-256) al de la versión vigente del mismo documento, se rechaza con 409 y un mensaje que lo aclara. No se crea ninguna versión.
- **R7 · Versión nueva: resultado.** La versión anterior pasa a `REPLACED` y sus fragmentos dejan de estar activos. La nueva se crea con el número siguiente, en `CURRENT` y con el procesamiento `PENDING`, y se encola para procesar. Respuesta: 201 con el documento actualizado.
- **R7b · Fecha de revisión.** Al subir una versión nueva, el ADMIN puede indicar una fecha de revisión nueva, opcional. Si la indica, sigue las reglas de la carga (desde mañana, en hora de Argentina; 400 si no). Si no la indica, queda la que estaba.
- **R8 · Una sola vigente.** Un documento tiene como máximo una versión `CURRENT` en todo momento. (Es el índice pendiente M4 del plan 001.)
- **R9 · Todo o nada.** Si cualquier paso falla (almacenamiento, base o cola), no queda nada a medias: la versión anterior sigue vigente y activa, y el archivo nuevo se borra. Respuesta: 503.
- **R10 · Archivar.** El documento pasa a `ARCHIVED` y todos sus fragmentos dejan de estar activos. Los SUPERVISOR y EMPLOYEE dejan de verlo (ya lo dice la regla R10 de la spec 001), y el ADMIN lo sigue viendo marcado como "Archivado".
- **R11 · Documento archivado.** Archivar es definitivo: no se puede desarchivar. Sobre un documento archivado no se puede cambiar áreas, subir versiones ni volver a archivar: 409.
- **R12 · Historial.** Solo el ADMIN puede ver la lista de versiones de un documento: número, nombre del archivo, fecha, quién la subió, estado y estado del procesamiento. Cada versión se puede descargar. Para los demás roles, el historial y la descarga de una versión que no es la vigente responden 403, y en la pantalla no se muestran.
- **R13 · Auditoría.** Cada cambio de áreas, versión nueva y archivo queda registrado en la auditoría (quién, qué documento, cuándo, resultado).
- **R14 · Confirmación para archivar.** En la pantalla, archivar pide confirmación ("¿Seguro que querés archivar este documento? Va a dejar de verse para los demás usuarios y no se puede deshacer."), porque no tiene vuelta atrás.

## 7. Estados

| Entidad | Transiciones permitidas | Las causa |
| --- | --- | --- |
| Documento | `ACTIVE` → `ARCHIVED` | Archivar (R10) |
| Versión | `CURRENT` → `REPLACED` | Subir versión nueva (R7) |
| Fragmentos | activos → inactivos | Versión reemplazada (R7) o documento archivado (R10) |

Toda transición que no esté en la tabla es inválida. `ARCHIVED` es un estado final (R11).

## 8. Casos borde

- La versión nueva es idéntica a la vigente (mismo contenido): 409 (R6b).
- La versión nueva es idéntica a la de **otro** documento activo: 409, como en la carga (R8b de la spec 001).
- La versión anterior todavía se está procesando cuando llega la nueva: la anterior pasa igual a `REPLACED`. Si el procesamiento de la anterior termina después, sus fragmentos tienen que quedar inactivos (coordinar con Guille).
- Se cambian las áreas mientras una versión se está procesando: los fragmentos que se creen después tienen que tomar las áreas nuevas (coordinar con Guille).
- Se archiva un documento cuya versión se está procesando: los fragmentos que se creen después tienen que quedar inactivos.
- Dos administradores suben una versión nueva al mismo tiempo: solo una puede quedar vigente (R8).

## 9. Restricciones no funcionales

- Las mismas de la spec 001: errores con el formato de NestJS, ningún secreto en el repositorio, endpoints en Swagger.
- Las pantallas siguen las reglas de la spec 002: mensajes claros, sin perder lo completado ante un error, y uso en celular.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 23/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Se puede desarchivar? | No. Archivar es definitivo; para recuperarlo se vuelve a cargar | R11, sección 4 |
| P2 · ¿Y si el responsable pierde el acceso al cambiar las áreas? | Se rechaza con 400; se puede elegir otro responsable en la misma operación | R4 |
| P3 · ¿Versión nueva idéntica a la vigente? | Se rechaza con 409 | R6b |
| P4 · ¿Se puede cambiar la fecha de revisión al subir una versión? | Sí, opcional | R7b |
| P5 · ¿Editar título, descripción y responsable? | No, queda fuera de esta spec | Sección 4 |
| P6 · ¿Archivar pide confirmación? | Sí | R14 |
| P7 · ¿Quién ve el historial de versiones? | Solo el ADMIN | R12 |

Para coordinar con Guille: los casos borde de la sección 8 sobre versiones que se procesan mientras se reemplazan, cambian de área o se archivan. Propuesta: que su worker, al terminar, revise el estado actual del documento y de la versión antes de activar los fragmentos.

## 11. Criterios de aceptación

```gherkin
Escenario: cambiar áreas
  Dado un documento de Ventas con su versión procesada
  Y un ADMIN con sesión
  Cuando cambia las áreas a Operaciones
  Entonces el documento y todos sus fragmentos quedan en Operaciones
  Y un EMPLOYEE de Ventas deja de verlo
  Y un EMPLOYEE de Operaciones lo ve

Escenario: subir una versión nueva
  Dado un documento con su versión 1 vigente y procesada
  Y un ADMIN con sesión
  Cuando sube un PDF nuevo
  Entonces la versión 1 queda REPLACED y sus fragmentos inactivos
  Y la versión 2 queda CURRENT con el procesamiento PENDING
  Y se encola process-document con el id de la versión 2

Escenario: versión idéntica a la vigente
  Dado un documento con su versión 1 vigente
  Cuando un ADMIN sube exactamente el mismo archivo
  Entonces la respuesta es 409
  Y no se crea ninguna versión

Escenario: versión nueva con fecha de revisión
  Dado un documento con fecha de revisión vencida
  Cuando un ADMIN sube una versión nueva indicando una fecha de revisión futura
  Entonces el documento queda con la fecha nueva

Escenario: falla al subir la versión nueva
  Dado un documento con su versión 1 vigente
  Y la cola de procesamiento no responde
  Cuando un ADMIN sube una versión nueva
  Entonces la respuesta es 503
  Y la versión 1 sigue CURRENT y con sus fragmentos activos
  Y no queda guardado el archivo nuevo

Escenario: el responsable pierde el acceso al cambiar las áreas
  Dado un documento de Ventas cuyo responsable es un EMPLOYEE de Ventas
  Cuando un ADMIN cambia las áreas a Operaciones sin elegir otro responsable
  Entonces la respuesta es 400
  Y el documento sigue en Ventas

Escenario: archivar
  Dado un documento activo de Ventas
  Cuando un ADMIN toca "Archivar" y confirma
  Entonces el documento queda ARCHIVED y todos sus fragmentos inactivos
  Y un EMPLOYEE de Ventas deja de verlo
  Y el ADMIN lo ve marcado como "Archivado"

Escenario: rol sin permiso
  Dado un EMPLOYEE con sesión
  Cuando intenta cambiar áreas, subir una versión o archivar
  Entonces la respuesta es 403
  Y el documento no cambia

Escenario: documento archivado
  Dado un documento archivado
  Cuando un ADMIN intenta cambiar sus áreas o subir una versión
  Entonces la respuesta es 409
  Y el documento no cambia

Escenario: una sola versión vigente
  Dado un documento con su versión 1 vigente
  Cuando dos ADMIN suben una versión nueva al mismo tiempo
  Entonces el documento termina con una sola versión CURRENT

Escenario: archivar sin confirmar
  Dado un ADMIN en el detalle de un documento activo
  Cuando toca "Archivar" y después "Cancelar"
  Entonces el documento sigue activo

Escenario: un empleado no ve el historial
  Dado un EMPLOYEE de Ventas en el detalle de un documento de Ventas
  Entonces no ve el historial de versiones
  Y si pide el historial a la API, la respuesta es 403

Escenario: historial de versiones
  Dado un documento con tres versiones
  Cuando un ADMIN abre su historial
  Entonces ve las tres, de la más nueva a la más vieja, con su estado
  Y puede descargar cualquiera de ellas
```
