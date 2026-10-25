# Spec 004 · Búsqueda de documentos

- **Historia:** HU36 (buscar dentro de los documentos).
- **Responsable:** Matías Fauda (pareja C)
- **Depende de:** spec 001 (documentos y visibilidad), spec 002 (listado), spec 003 (versiones y fragmentos activos) y la tabla `chunks` de Guille (ya está en `develop`).
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

Hoy un usuario solo puede recorrer el listado de documentos de a 20. Si busca "cómo se hace un cierre de caja", tiene que abrir documento por documento hasta encontrarlo.

Esta feature agrega un buscador que encuentra documentos por su título, su descripción y **su contenido**, y muestra el fragmento del texto donde aparece lo buscado. Cada usuario encuentra solo lo que ya puede ver.

## 2. Actores

- **ADMIN, SUPERVISOR y EMPLOYEE:** buscan entre los documentos que pueden ver.
- **Procesamiento (Guille):** genera los fragmentos de contenido en los que se busca. Sin fragmentos, un documento se encuentra solo por título y descripción.

## 3. Alcance

- Buscar por palabras en el título, la descripción y el contenido de la versión vigente.
- Mostrar, para cada documento encontrado, el fragmento donde aparece lo buscado y su página.
- El buscador en la pantalla de documentos.

## 4. Fuera de alcance

- Búsqueda por significado (semántica, con embeddings): es la base del asistente (Guille), no de este buscador.
- Filtros por área, fecha o responsable.
- Buscar en versiones reemplazadas o en documentos archivados.
- Sugerencias mientras se escribe (autocompletar).
- Avisos de vencimiento (HU37): spec 005.

## 5. Flujo principal

El usuario escribe en el buscador de `/documentos` y confirma (Enter o el botón). La lista pasa a mostrar los documentos que coinciden, del más relevante al menos relevante, cada uno con el fragmento del texto donde aparece la búsqueda. Al borrar la búsqueda, vuelve el listado normal.

## 6. Reglas de negocio

- **R1 · Quién.** Cualquier usuario con sesión puede buscar. Sin sesión: 401.
- **R2 · Dónde se busca.** En el título y la descripción del documento, y en el contenido de los fragmentos **activos** de su versión vigente. Un fragmento inactivo (versión reemplazada, documento archivado o sin procesar) nunca aparece.
- **R3 · Visibilidad.** La búsqueda devuelve solo documentos `ACTIVE` que el usuario puede ver: el ADMIN, todos; el resto, los que comparten al menos un área con él. Nunca aparece texto de un documento que el usuario no puede ver.
- **R4 · Texto de búsqueda.** Entre 3 y 100 caracteres, sin contar espacios al principio y al final. Si no: 400.
- **R5 · Tildes, mayúsculas y variantes.** La búsqueda no distingue tildes ni mayúsculas ("instruccion" encuentra "Instrucción") y reconoce variantes de una misma palabra en español ("procedimientos" encuentra "procedimiento").
- **R6 · Varias palabras.** Si se escriben varias palabras, el documento tiene que contener todas, aunque no estén juntas: todas las palabras tienen que estar entre el título y la descripción, o todas en un mismo fragmento del contenido (D16 del plan).
- **R7 · Un resultado por documento.** Cada documento aparece una sola vez, aunque coincida en varios fragmentos.
- **R8 · Fragmento coincidente.** Si la coincidencia está en el contenido, el resultado incluye el fragmento que mejor coincide, recortado alrededor de las palabras encontradas, con esas palabras marcadas, y su número de página si se conoce. Si solo coincide el título o la descripción, no hay fragmento.
- **R9 · Orden.** Del más relevante al menos relevante. Una coincidencia en el título pesa más que una en el contenido. A igual relevancia, el más nuevo primero.
- **R10 · Paginado.** Con `?page` y `?limit`, igual que el listado (por defecto 1 y 20; máximo 100). Formato: `{ data, total, page, limit }`.
- **R11 · Texto seguro.** El fragmento se muestra como texto: si el documento contiene HTML o código, no se ejecuta ni cambia la pantalla. Las palabras marcadas se indican sin HTML en la respuesta.
- **R12 · Errores.** Si la base no responde: 503, igual que en el resto de los documentos.

### Reglas de pantalla

- **F1 · Buscador.** Una caja arriba del listado de `/documentos`, visible para todos los roles. Se busca al confirmar (Enter o botón "Buscar"), no a cada tecla.
- **F2 · Validación.** Con menos de 3 caracteres, el buscador avisa y no busca.
- **F3 · La búsqueda en la dirección.** La búsqueda queda en la URL (`/documentos?q=...`), así se puede volver atrás o compartir el enlace.
- **F4 · Resultados.** Cada resultado es una tarjeta como las del listado, más el fragmento con las palabras resaltadas y "Página N" si se conoce.
- **F5 · Sin resultados.** "No encontramos documentos para «texto»", con la opción de borrar la búsqueda.
- **F6 · Volver al listado.** Un botón para borrar la búsqueda vuelve al listado completo.
- **F7 · Responsive.** Se usa desde la computadora y desde el celular.

## 7. Estados de pantalla

Buscando, con resultados, sin resultados y error (con opción de reintentar).

## 8. Casos borde

- Un documento recién cargado, todavía sin procesar: se encuentra por título y descripción, no por contenido.
- La palabra aparece en una versión reemplazada pero no en la vigente: no se encuentra (R2).
- La palabra aparece en un documento archivado: no se encuentra (R3).
- Búsqueda con caracteres especiales (`"`, `&`, `|`, `!`, `:`): se tratan como texto, nunca como operadores, y no provocan un error 500.
- Búsqueda con palabras muy comunes que el español ignora ("de", "la", "para"): si solo quedan esas palabras, no hay resultados, sin error.
- Un fragmento con HTML (`<script>`): se muestra como texto (R11).

## 9. Restricciones no funcionales

- Las mismas de las specs anteriores: errores con el formato de NestJS, endpoints en Swagger, ningún secreto en el repositorio.
- La búsqueda usa el índice de texto completo de `chunks`; no recorre todos los fragmentos uno por uno.

## 10. Decisiones

Tomadas en la etapa de aclaración (clarify) el 25/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| P0 · ¿Una spec o dos para HU36 y HU37? | Dos: esta (búsqueda) y la 005 (vencimientos). El chat pasa a la 006 | — |
| P1 · ¿Dónde busca? | Título, descripción y contenido de los fragmentos | R2 |
| P2 · ¿Importan las tildes? | No: las ignora | R5 |
| P3 · ¿Qué muestra cada resultado? | El documento, el fragmento con las palabras marcadas y la página | R8, F4 |
| P4 · ¿Qué documentos encuentra cada uno? | Los mismos que puede ver, solo activos y en su versión vigente | R2, R3 |
| P5 · ¿Dónde está el buscador? | Arriba del listado de `/documentos` | F1 |
| P6 · ¿Mínimo de caracteres? | 3 | R4, F2 |

**Para coordinar con Guille (P2):** el índice de texto completo de `chunks` (`chunks_content_fts_idx`) hoy no ignora tildes. Para cumplir R5 hace falta la extensión `unaccent` y un índice nuevo. Como el índice es suyo, se agrega uno nuevo sin tocar los de Guille (`chunks_content_fts_idx` y `chunks_embedding_idx`) y se le avisa. Si prefiere otra opción (reemplazar el suyo o cambiar su definición), se hace después, en una migración aparte aprobada por ella (D15 del plan).

## 11. Criterios de aceptación

```gherkin
Escenario: buscar por contenido
  Dado un documento de Ventas con un fragmento activo que dice "cierre de caja diario" en la página 4
  Y un EMPLOYEE de Ventas con sesión
  Cuando busca "cierre de caja"
  Entonces el documento aparece en los resultados
  Y el resultado muestra el fragmento con "cierre" y "caja" marcados y "Página 4"

Escenario: buscar por título
  Dado un documento de Ventas titulado "Manual de facturación", todavía sin procesar
  Cuando un EMPLOYEE de Ventas busca "facturación"
  Entonces el documento aparece en los resultados, sin fragmento

Escenario: tildes y mayúsculas
  Dado un documento con el texto "Instrucción técnica"
  Cuando un usuario que puede verlo busca "instruccion tecnica"
  Entonces el documento aparece en los resultados

Escenario: variantes de una palabra
  Dado un documento con el texto "procedimiento de devolución"
  Cuando un usuario que puede verlo busca "procedimientos"
  Entonces el documento aparece en los resultados

Escenario: documento de otra área
  Dado un documento de Operaciones que contiene "inventario"
  Y un EMPLOYEE que pertenece solo a Ventas
  Cuando busca "inventario"
  Entonces no recibe ese documento ni ningún fragmento suyo

Escenario: versión reemplazada
  Dado un documento cuya versión 1 decía "tarifa vieja" y cuya versión 2 vigente no lo dice
  Cuando un ADMIN busca "tarifa vieja"
  Entonces el documento no aparece

Escenario: documento archivado
  Dado un documento archivado que contiene "procedimiento antiguo"
  Cuando un ADMIN busca "procedimiento antiguo"
  Entonces el documento no aparece

Escenario: un resultado por documento
  Dado un documento con cinco fragmentos que contienen "stock"
  Cuando un usuario que puede verlo busca "stock"
  Entonces el documento aparece una sola vez

Escenario: búsqueda demasiado corta
  Dado un usuario en /documentos
  Cuando escribe "ca" y confirma
  Entonces ve un aviso de que hacen falta al menos 3 caracteres
  Y no se hace la búsqueda
  Y si se pide a la API, la respuesta es 400

Escenario: caracteres especiales
  Dado un usuario con sesión
  Cuando busca "caja & | ! :"
  Entonces la respuesta no es un error 500

Escenario: sin resultados
  Dado un usuario en /documentos
  Cuando busca "xyzxyz"
  Entonces ve "No encontramos documentos para «xyzxyz»"
  Y puede borrar la búsqueda para volver al listado

Escenario: fragmento con HTML
  Dado un documento con un fragmento que contiene "<script>alert(1)</script> caja"
  Cuando un usuario que puede verlo busca "caja"
  Entonces ve el texto "<script>alert(1)</script>" como texto
  Y no se ejecuta nada

Escenario: la búsqueda queda en la dirección
  Dado un usuario que buscó "caja"
  Cuando recarga la página
  Entonces sigue viendo los resultados de "caja"
```
