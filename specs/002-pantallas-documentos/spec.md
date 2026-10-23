# Spec 002 · Pantallas de documentos

- **Historias:** HU13 (cargar documentos) y la consulta de HU15 (ver solo los documentos de mis áreas), del lado del frontend.
- **Responsable:** Matías Fauda (pareja C)
- **Depende de:** spec 001 (los endpoints `/api/documents`). Ver `specs/001-carga-documentos/plan.md`, sección 3.
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

La spec 001 construyó el backend de los documentos, pero nadie puede usarlo sin pantallas. Esta feature agrega al frontend las pantallas para que un administrador cargue documentos y para que cada usuario vea y descargue los documentos de sus áreas.

## 2. Actores

- **ADMIN:** carga documentos y ve todos, en cualquier estado.
- **SUPERVISOR y EMPLOYEE:** ven y descargan los documentos activos de sus áreas.

## 3. Alcance

- Listado de documentos visibles para el usuario, paginado.
- Detalle de un documento, con su botón de descarga.
- Formulario de carga de un documento nuevo (solo ADMIN).
- Mensajes claros para cada error que devuelve la API.

## 4. Fuera de alcance

- Login, registro y menú general de la aplicación (pareja A).
- Cambiar áreas, subir una versión nueva o archivar (HU15 y HU16, spec futura).
- Buscar dentro de los documentos (HU36) y avisos de vencimiento (HU37).
- El chat del asistente (Guille y HU20/HU21).

## 5. Flujos principales

**Consultar.** El usuario entra a Documentos y ve la lista de los que puede ver. Abre uno, ve sus datos y lo descarga.

**Cargar.** El ADMIN, desde Documentos, abre el formulario, elige el archivo, completa título, áreas, responsable y fecha de revisión, y lo envía. Si sale bien, ve el documento creado con el procesamiento "pendiente". Si falla, ve qué corregir sin perder lo que ya completó.

## 6. Reglas

- **F1 · Acceso por rol.** Solo el ADMIN ve el botón "Cargar documento" y puede abrir el formulario. Si otro rol entra a la dirección del formulario, ve un mensaje de que no tiene permiso. (La API igual lo rechaza: el frontend no es la protección real.)
- **F2 · Validación antes de enviar.** El formulario controla, antes de subir el archivo, lo mismo que la API: tipo PDF, `.txt` o `.md`; hasta 10 MB; título de 1 a 200 caracteres; al menos un área; responsable; fecha de revisión desde mañana; descripción de hasta 1000 caracteres. Así el usuario no espera una subida para enterarse de un error evidente.
- **F3 · Errores de la API.** Cada código tiene un mensaje entendible: 400 (indicando el campo), 403, 404, 409 (con un enlace al documento que ya tiene ese archivo), 413, 415 y 503 ("probá de nuevo en unos minutos").
- **F4 · No perder lo completado.** Si la carga falla, el formulario conserva lo que el usuario ya completó, incluido el archivo elegido.
- **F5 · Un solo envío.** Mientras se sube el archivo, el botón se desactiva y se muestra que está cargando, para no enviar dos veces.
- **F6 · Estado del procesamiento.** Solo el ADMIN ve, en el detalle, si el documento está pendiente, procesando, listo o con error. Los demás roles no lo ven.
- **F7 · Listado.** Se muestra como tarjetas, en la computadora y en el celular. Cada tarjeta tiene título, áreas, responsable, fecha de revisión y fecha de carga. Van del más nuevo al más viejo, 20 por página, con paginación por números de página.
- **F8 · Descarga.** El botón pide el enlace a la API en el momento del clic, porque el enlace vence a los 5 minutos.
- **F9 · Documento inexistente o ajeno.** Si la API responde 404, se muestra "No se encontró el documento", sin distinguir entre los dos casos.
- **F10 · Responsive.** Las pantallas se usan desde la computadora y desde el celular.
- **F11 · Elección del responsable.** El responsable se elige de una lista que muestra solo los usuarios que comparten al menos un área con las áreas elegidas, más los ADMIN. Si el ADMIN cambia las áreas y el responsable elegido deja de cumplir esa condición, la elección se borra y se pide elegir de nuevo. La lista la provee la pareja A; hasta que exista, se usa una lista simulada.
- **F12 · Rutas.** `/documentos` (listado), `/documentos/nuevo` (carga, solo ADMIN) y `/documentos/[id]` (detalle).
- **F13 · Después de cargar.** Si la carga sale bien, el usuario va al detalle del documento recién creado.
- **F14 · Salir del formulario.** Si el usuario sale del formulario con datos completados, no se le pide confirmación.

## 7. Estados de pantalla

Cada pantalla contempla: cargando, con datos, vacío (por ejemplo, "Todavía no hay documentos en tus áreas") y error.

## 8. Casos borde

- Lista vacía: mensaje y, para el ADMIN, el botón para cargar el primero.
- Nombre de archivo muy largo o con tildes: se muestra recortado y con las tildes bien.
- La API no responde: mensaje de error con opción de reintentar.
- El usuario sale del formulario con datos completados: los datos se pierden, sin aviso (F14).
- El ADMIN elige áreas en las que no hay ningún usuario: la lista de responsables muestra solo a los ADMIN.

## 9. Restricciones no funcionales

- Next.js y Tailwind, como el resto del frontend.
- El frontend nunca llama a S3 directamente para subir: todo pasa por la API.
- Ningún secreto en el frontend.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 23/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P1 · ¿Cómo se elige al responsable? | Lista de usuarios que comparten un área con el documento, más los ADMIN. Simulada hasta que la pareja A exponga la lista | F11 |
| P2 · ¿Qué rutas usan las pantallas? | En español: `/documentos`, `/documentos/nuevo` y `/documentos/[id]` | F12 |
| P3 · ¿Tabla o tarjetas? | Tarjetas, en la computadora y en el celular | F7 |
| P4 · ¿Quién ve el estado del procesamiento? | Solo el ADMIN | F6 |
| P5 · ¿Se avisa al salir del formulario? | No | F14 |
| P6 · ¿Paginación con números o "Ver más"? | Números de página | F7 |
| P7 · ¿A dónde va el usuario después de cargar? | Al detalle del documento creado | F13 |

Para la pareja A: la pantalla de carga necesita una lista de usuarios activos filtrable por área, por ejemplo `GET /api/users?areaIds=...`, que devuelva `{ id, name, role }` y sea visible para ADMIN.

## 11. Criterios de aceptación

```gherkin
Escenario: el admin carga un documento
  Dado un ADMIN en el formulario de carga
  Cuando elige un PDF de 2 MB, completa todos los campos y envía
  Entonces va al detalle del documento creado
  Y ve el procesamiento "pendiente"

Escenario: un empleado no ve la opción de cargar
  Dado un EMPLOYEE en el listado de documentos
  Entonces no ve el botón "Cargar documento"

Escenario: el responsable se elige entre quienes pueden ver el documento
  Dado un ADMIN en el formulario de carga
  Y un EMPLOYEE que pertenece solo a Operaciones
  Cuando elige el área Ventas
  Entonces la lista de responsables no muestra a ese EMPLOYEE
  Y sí muestra a los ADMIN

Escenario: el responsable deja de ser válido al cambiar las áreas
  Dado un ADMIN que eligió el área Ventas y un responsable de Ventas
  Cuando cambia el área a Operaciones
  Entonces la elección del responsable se borra
  Y se le pide elegir de nuevo

Escenario: archivo inválido antes de subir
  Dado un ADMIN en el formulario de carga
  Cuando elige un archivo .docx o uno de 11 MB
  Entonces ve el error junto al campo del archivo
  Y el formulario no se envía

Escenario: archivo duplicado
  Dado un ADMIN que envía un archivo que ya tiene un documento activo
  Cuando la API responde 409
  Entonces ve un mensaje con un enlace al documento existente
  Y el formulario conserva lo que completó

Escenario: la API no está disponible
  Dado un ADMIN que envía el formulario
  Cuando la API responde 503
  Entonces ve "probá de nuevo en unos minutos"
  Y el formulario conserva lo que completó

Escenario: listado de un empleado
  Dado un EMPLOYEE de Ventas
  Cuando entra a Documentos
  Entonces ve solo los documentos que devuelve la API, del más nuevo al más viejo

Escenario: un empleado no ve el estado del procesamiento
  Dado un EMPLOYEE de Ventas
  Cuando abre el detalle de un documento de Ventas
  Entonces no ve el estado del procesamiento

Escenario: lista vacía
  Dado un usuario sin documentos en sus áreas
  Cuando entra a Documentos
  Entonces ve "Todavía no hay documentos en tus áreas"

Escenario: descarga
  Dado un usuario en el detalle de un documento
  Cuando toca "Descargar"
  Entonces el frontend pide el enlace a la API en ese momento y abre el archivo

Escenario: documento ajeno
  Dado un usuario que abre la dirección de un documento de otra área
  Cuando la API responde 404
  Entonces ve "No se encontró el documento"
```
