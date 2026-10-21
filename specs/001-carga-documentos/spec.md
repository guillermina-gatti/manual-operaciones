# Spec 001 · Carga y consulta de documentos

- **Historias:** HU13 (cargar documentos) y la parte de consulta de HU15 (ver solo los documentos de mis áreas)
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** lista para planificar. Las decisiones tomadas en la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

El asistente de IA solo puede responder con información que la empresa haya cargado. Hoy no existe ninguna forma de cargar documentos: esta feature permite que un administrador suba los manuales y procedimientos de la empresa, indicando a qué áreas pertenecen, y que cada usuario pueda ver y descargar solo los documentos de sus áreas.

Al terminar, un documento cargado queda guardado, asociado a sus áreas y listo para que el procesamiento (HU14, de Guille) lo convierta en fragmentos para el asistente.

## 2. Actores

- **ADMIN:** carga documentos y ve todos los documentos.
- **SUPERVISOR y EMPLOYEE:** ven y descargan los documentos que comparten al menos un área con ellos.
- **Procesamiento (sistema):** recibe el aviso de que hay una versión nueva para procesar.

## 3. Alcance

- Cargar un documento nuevo con su archivo y sus datos.
- Listar los documentos visibles para el usuario.
- Ver el detalle de un documento.
- Descargar el archivo de un documento.

## 4. Fuera de alcance

- Procesar el archivo: extraer texto, dividirlo en fragmentos, calcular embeddings (HU14).
- Cambiar las áreas de un documento ya cargado (HU15, segunda parte).
- Subir una versión nueva o archivar un documento (HU16).
- Buscar dentro de los documentos (HU36).
- Avisos de documentos vencidos (HU37).
- Las pantallas del frontend. Van en una spec aparte, sobre estos mismos endpoints.

## 5. Flujos principales

**Carga.** El admin elige un archivo e indica título, áreas, responsable y fecha de revisión. El sistema valida todo, guarda el archivo, crea el documento con su primera versión y avisa al procesamiento. El admin recibe el documento creado, con el procesamiento en estado pendiente.

**Consulta.** Un usuario pide el listado y recibe solo los documentos visibles para él. Puede abrir uno y ver su detalle, y pedir la descarga: recibe un enlace temporal al archivo.

## 6. Reglas de negocio

- **R1 · Quién carga.** Solo un ADMIN puede cargar documentos. Sin sesión: 401. Con otro rol: 403.
- **R2 · Tipo de archivo.** Se aceptan PDF, texto plano (`.txt`) y Markdown (`.md`). El tipo se comprueba por el contenido del archivo, no solo por su extensión ni por lo que declare el navegador: un PDF tiene que empezar con `%PDF-`, y un `.txt` o `.md` tiene que ser texto UTF-8 válido, sin bytes nulos. Si no es un tipo aceptado: 415.
- **R3 · Tamaño.** El archivo pesa como máximo 10 MB. Si pesa más: 413. Un archivo vacío (0 bytes) se rechaza con 400.
- **R4 · Datos obligatorios.** Título (de 1 a 200 caracteres, sin contar espacios al principio y al final), al menos un área, el responsable y la fecha de revisión. La descripción es opcional, de hasta 1000 caracteres. Si falta un dato obligatorio o algún dato es inválido: 400, indicando qué campo falló.
- **R5 · Referencias válidas.** Todas las áreas indicadas tienen que existir. El responsable tiene que ser un usuario existente que pueda ver el documento: que comparta al menos un área con él o que sea ADMIN. Puede tener cualquier rol. Si no se cumple: 400.
- **R6 · Fecha de revisión.** Tiene que ser posterior a la fecha de carga. Se compara por día, en la zona horaria `America/Argentina/Buenos_Aires`: la fecha más temprana válida es mañana. Si no: 400.
- **R7 · Resultado de una carga correcta.** Se crea el documento en estado `ACTIVE`, con su versión 1 en estado `CURRENT` y el procesamiento en `PENDING`. Se encola el trabajo `process-document` con el `documentVersionId`. Respuesta: 201 con el documento creado.
- **R8 · Todo o nada.** Si falla cualquier paso de la carga, incluido el encolado del procesamiento, se deshace todo y la respuesta es 503: no queda un documento sin archivo, un archivo sin documento ni una versión que nadie va a procesar. El admin puede volver a intentar la carga.
- **R8b · Duplicados.** No se puede cargar un archivo cuyo contenido sea idéntico (misma huella SHA-256) al de una versión vigente de un documento `ACTIVE`. Respuesta: 409, indicando el id del documento que ya lo tiene. Si el documento existente está archivado, la carga se permite.
- **R9 · Nombre del archivo guardado.** El archivo se guarda con un nombre que genera el sistema. El nombre original se conserva solo como dato, para mostrarlo.
- **R10 · Visibilidad.** Un usuario ve un documento si el documento está `ACTIVE` y comparte al menos un área con él. Un ADMIN ve todos, cualquiera sea su estado.
- **R11 · Recurso ajeno o inexistente.** Pedir el detalle o la descarga de un documento que no existe, o que no es visible para el usuario, devuelve 404 en ambos casos. Así no se revela si el documento existe.
- **R12 · Descarga.** La descarga devuelve un enlace al archivo que vence a los 5 minutos. El enlace se genera solo después de comprobar R10. Se puede descargar cualquiera sea el estado del procesamiento (`PENDING`, `PROCESSING`, `READY` o `FAILED`): el archivo es válido aunque el asistente todavía no lo use.
- **R13 · Listado.** Paginado con `?page` y `?limit` (por defecto 1 y 20; máximo 100). Si `limit` es mayor a 100, o si `page` o `limit` no son válidos: 400. Ordenado del más nuevo al más viejo. Formato: `{ data, total, page, limit }`.
- **R14 · Auditoría.** Cada carga queda registrada en la auditoría (quién, qué documento, cuándo, resultado).

## 7. Estados

En esta feature los estados solo se asignan al crear; las transiciones llegan con HU14 y HU16.

| Entidad | Estado inicial | Lo cambia |
| --- | --- | --- |
| Documento | `ACTIVE` | HU16 (archivar) |
| Versión | `CURRENT` | HU16 (reemplazar) |
| Procesamiento | `PENDING` | HU14 (worker de Guille) |

## 8. Casos borde

- PDF con contraseña, dañado o escaneado sin texto: **se acepta** en la carga. Si no se puede leer, el procesamiento lo marca como `FAILED` (HU14).
- Archivo con extensión `.pdf` que en realidad es otra cosa: se rechaza (R2).
- Nombre original con caracteres raros, espacios o rutas (`../../x.pdf`): no afecta, porque no se usa para guardar (R9).
- El área existe, pero el admin no pertenece a ella: se permite, porque el ADMIN administra todas las áreas.
- Falla el almacenamiento de archivos: la carga falla entera (R8) y responde 503.
- Falla la cola después de guardar: se deshace todo (R8).
- Se sube un archivo idéntico a uno vigente: 409 (R8b).

## 9. Restricciones no funcionales

- Las respuestas de error siguen el formato estándar de NestJS (`statusCode`, `message`, `error`).
- Ningún secreto ni credencial de almacenamiento en el código ni en el repositorio.
- Los endpoints se documentan en Swagger.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 21/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Qué tipos de archivo se aceptan? | PDF, `.txt` y `.md`. Word queda fuera del MVP. | R2 |
| P2 · ¿Qué pasa con un archivo duplicado? | Se rechaza con 409 si coincide con un documento `ACTIVE`; se permite si el existente está archivado. | R8b |
| P3 · ¿La fecha de revisión es obligatoria? | Sí, sin valor por defecto. | R4, R6 |
| P4 · ¿Qué pasa si falla el encolado? | Se deshace toda la carga y se responde 503. | R8 |
| P5 · ¿Se descarga un documento sin procesar? | Sí, en cualquier estado del procesamiento. | R12 |
| P6 · ¿Quién puede ser responsable? | Un usuario que pueda ver el documento (comparte un área o es ADMIN), de cualquier rol. | R5 |
| P7 · ¿Se acepta una descripción? | Sí, opcional y de hasta 1000 caracteres. Tomada en el plan. | R4 |
| P8 · ¿Cómo se compara la fecha de revisión con la de carga? | Por día, en `America/Argentina/Buenos_Aires`: tiene que ser al menos mañana. Tomada en el plan. | R6 |
| P9 · ¿Quien no es ADMIN ve documentos archivados? | No: solo ve documentos `ACTIVE`. Tomada en el plan. | R10 |
| P10 · ¿Qué pasa si `limit` es mayor a 100? | Se responde 400, no se ajusta. Tomada en el plan. | R13 |

Para avisar a Guille: P1 (su procesamiento tiene que leer también `.md`) y P4 (no hace falta recuperar versiones que quedaron sin encolar).

## 11. Criterios de aceptación

```gherkin
Escenario: carga correcta
  Dado un ADMIN con sesión
  Cuando carga un PDF de 2 MB con título, el área Ventas, un responsable válido y una fecha de revisión futura
  Entonces la respuesta es 201
  Y el documento queda ACTIVE, con su versión 1 CURRENT y el procesamiento PENDING
  Y se encola process-document con el id de esa versión
  Y la carga queda registrada en la auditoría

Escenario: rol sin permiso
  Dado un EMPLOYEE con sesión
  Cuando intenta cargar un documento
  Entonces la respuesta es 403
  Y no se guarda ningún documento ni archivo

Escenario: extensión falsa
  Dado un ADMIN con sesión
  Cuando carga un archivo llamado manual.pdf cuyo contenido no empieza con %PDF-
  Entonces la respuesta es 415
  Y no se guarda ningún documento ni archivo

Escenario: archivo demasiado grande
  Dado un ADMIN con sesión
  Cuando carga un PDF de 11 MB
  Entonces la respuesta es 413
  Y no se guarda ningún documento ni archivo

Escenario: archivo duplicado
  Dado un documento ACTIVE cuya versión vigente tiene el archivo manual.pdf
  Y un ADMIN con sesión
  Cuando carga otro documento con exactamente el mismo archivo
  Entonces la respuesta es 409
  Y la respuesta indica el id del documento existente
  Y no se guarda ningún documento ni archivo nuevo

Escenario: carga de Markdown
  Dado un ADMIN con sesión
  Cuando carga un archivo guia.md con texto UTF-8 válido y datos correctos
  Entonces la respuesta es 201

Escenario: responsable sin acceso
  Dado un EMPLOYEE que pertenece solo a Operaciones
  Y un ADMIN con sesión
  Cuando carga un documento del área Ventas indicando a ese EMPLOYEE como responsable
  Entonces la respuesta es 400
  Y no se guarda ningún documento ni archivo

Escenario: área inexistente
  Dado un ADMIN con sesión
  Cuando carga un documento indicando un área que no existe
  Entonces la respuesta es 400
  Y no se guarda ningún documento ni archivo

Escenario: falla el almacenamiento
  Dado un ADMIN con sesión
  Y el almacenamiento de archivos no responde
  Cuando carga un documento válido
  Entonces la respuesta es 503
  Y no se guarda ningún documento

Escenario: listado filtrado por área
  Dado un documento del área Ventas y otro del área Operaciones
  Y un EMPLOYEE que pertenece solo a Ventas
  Cuando pide el listado de documentos
  Entonces recibe solo el documento de Ventas
  Y total es 1

Escenario: documento de otra área
  Dado un documento del área Operaciones
  Y un EMPLOYEE que pertenece solo a Ventas
  Cuando pide el detalle o la descarga de ese documento
  Entonces la respuesta es 404
  Y no se genera ningún enlace de descarga

Escenario: falla el encolado
  Dado un ADMIN con sesión
  Y la cola de procesamiento no responde
  Cuando carga un documento válido
  Entonces la respuesta es 503
  Y no queda guardado ningún documento ni archivo

Escenario: descarga permitida
  Dado un documento del área Ventas
  Y un EMPLOYEE que pertenece a Ventas
  Y el procesamiento de su versión está PENDING
  Cuando pide la descarga
  Entonces recibe un enlace que vence a los 5 minutos
```
