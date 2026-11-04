# Spec 009 · Asistente: respuesta en streaming y respaldo con la búsqueda

- **Historias:**
  - **HU20:** "Como empleado, quiero ver la respuesta a medida que se genera." Criterio: la respuesta se transmite en streaming.
  - **HU36, la parte que falta:** ante un timeout o un error de la IA, el chat ofrece la búsqueda sin IA. La búsqueda ya existe (spec 004).
- **Responsable:** Matías Fauda (pareja C).
- **Depende de:**
  - De Guille (pareja C), ya en `develop`: el chat de HU17 (PR #38 y #39) en `apps/api/src/chat`.
    - `POST /api/chat` recibe `message`, `conversationId` y `context` y responde de una vez con `conversationId`, `messageId`, `status`, `answer` y `sources`.
    - Recupera fragmentos con pgvector y responde con Gemini (`gemini-2.5-flash`, `generateText` del AI SDK 7).
    - Los tipos están en `chat.contract.ts` ("Contrato 4" del informe).
    - **Verificado en código:** la orquestación (embedding de la pregunta, recuperación, umbral de relevancia, marca `NO_INFO`, citas `[S1]` y guardado) está en `ChatService.run`, que es privado. `citedChunks`, `toSources` y `unavailable` no se exportan. Esta spec la extrae sin cambiar el comportamiento (R14, D8).
  - De la spec 004: la búsqueda en `/documentos?q=…`, de 3 a 100 caracteres (`SEARCH_MIN` y `SEARCH_MAX`).
  - De la spec 002: el cliente HTTP de la web (`apps/web/lib/api/client.ts`), que hoy solo lee respuestas JSON.
  - Del skill `pispiar-design`: la sección "Chat" y los tokens de `globals.css`.
  - **Pedidos a otros** (sección 12): a Guille, que `POST /api/chat` sume `searchUrl`; a la pareja A (Camila), el enlace "Asistente" en el menú. Ninguno bloquea esta spec.
  - **Nota:** la rama local `feat/documentos-referencias-historicas` todavía no tiene el PR #39. Antes de empezar hay que traer `develop`.
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

El asistente responde de una vez. Con Gemini, una respuesta con citas tarda varios segundos, y mientras tanto el usuario no ve nada. Cuando la IA falla o tarda demasiado, la API responde `status: ai_unavailable` con el texto "Podés buscar directamente en los documentos", pero sin nada para hacer clic. Además, no existe la pantalla del chat en la web.

Esta feature agrega:
- una ruta que transmite la respuesta en partes, con la misma respuesta final que la ruta actual;
- un enlace a la búsqueda sin IA cuando la IA no está disponible;
- la pantalla del chat en `/asistente`, que muestra la respuesta a medida que llega, las fuentes citadas, el "No encontré" y el error con el enlace a la búsqueda.

## 2. Actores

- **ADMIN, SUPERVISOR y EMPLOYEE:** consultan al asistente sobre los documentos vigentes de sus áreas (matriz de permisos, "Asistente de IA"). La recuperación por área la sigue haciendo el chat de Guille, sin cambios (sección 4).
- **Guille (pareja C):** dueña del chat de HU17. No es actor del sistema. Esta spec agrega piezas a su módulo, extrae su orquestación sin cambiar el comportamiento y le hace pedidos (sección 12).
- **Pareja A (Camila):** dueña del menú y de la sesión. Agrega el enlace al chat en el menú (sección 12).

## 3. Alcance

- **Ruta nueva `POST /api/chat/stream`:** recibe lo mismo que `POST /api/chat` y transmite la respuesta con eventos SSE. Al final manda la respuesta completa con la misma forma que la ruta actual, más `searchUrl` si la IA no está disponible.
- **Orquestación compartida:** la de `ChatService.run` pasa a funciones exportadas que usan las dos rutas, sin cambiar el comportamiento de `POST /api/chat` (R14).
- **Modelo:** un método de streaming en el puerto `ChatLlm` y su implementación en el adaptador de Gemini.
- **Enlace a la búsqueda (HU36):** `searchUrl` en las respuestas `ai_unavailable` de la ruta nueva, con el enlace a `/documentos?q=<pregunta>`.
- **Cliente HTTP de la web:** un método `stream` nuevo en `lib/api/client.ts`, sin cambiar nada de lo que ya existe.
- **La pantalla del chat en `/asistente`,** con la sección "Chat" del skill `pispiar-design`: mensajes, respuesta que aparece de a partes, fuentes citadas, "No encontré" y el error con el enlace a la búsqueda. Se entra desde un acceso en `/documentos` mientras el menú no tenga el enlace.

## 4. Fuera de alcance

- **HU21:** el contexto del paso. El campo `context` se sigue aceptando y no se usa, como hoy.
- **HU39:** las contradicciones (`status: conflict`).
- **Cambiar qué fragmentos puede recuperar cada usuario** (visibilidad del chat) y el valor de `validFrom`: los corrige Guille (sección 12).
- **Cambiar el comportamiento o la respuesta de `POST /api/chat`.**
  - `searchUrl` en esa ruta lo agrega Guille (sección 12).
  - Del archivo de su servicio solo se mueve la orquestación (R14).
  - No se modifican `chat.contract.ts`, `ChatController`, `chat.dto.ts`, los adaptadores de Prisma ni `chat.service.spec.ts`.
- **Historial de conversaciones:** no hay endpoint para listarlas. Cada visita a la pantalla empieza una conversación nueva.
- **Una vez terminada la respuesta:** la valoración (HU25, de Guille), las sugerencias de preguntas y el contacto sugerido (`suggestedContact`, que hoy la API nunca arma).
- **El panel "FUENTE 1" con la cita resaltada** del skill: la respuesta no trae el texto del fragmento, y el enlace al pasaje (`url`) está pendiente de HU18.
- **El hornero y sus ilustraciones:** todavía no están en `apps/web/public`.
- **Un botón para detener la respuesta.** Salir de la pantalla sí corta el pedido (R11).
- **El enlace en el menú de la aplicación:** lo agrega la pareja A (sección 12).

## 5. Flujos principales

**Preguntar y ver la respuesta de a partes.**
1. El usuario entra a `/asistente`, escribe su pregunta y toca "Preguntar". Su mensaje aparece a la derecha.
2. La web abre `POST /api/chat/stream`. La API valida el pedido y la sesión, resuelve la conversación y empieza a transmitir.
3. La API busca los fragmentos de las áreas del usuario y le pide la respuesta al modelo. A medida que el modelo genera texto, la API lo manda en partes y la web lo agrega a la burbuja de respuesta.
4. Al terminar, la API manda la respuesta completa: estado, texto y fuentes. La web muestra el texto final con las citas numeradas y los botones de las fuentes, y cada botón abre el detalle del documento.

**No hay información.** Si no hay fragmentos relevantes o el modelo responde `NO_INFO`, no se transmite texto. La respuesta final llega con `status: no_info` y la web muestra "No encontré…" en una caja punteada.

**La IA falla o tarda demasiado (HU36).** Si falla el embedding o el modelo, o se pasa el tiempo (R9), la respuesta final llega con `status: ai_unavailable`, el texto de siempre y `searchUrl`. La web descarta el texto parcial, si llegó algo, y muestra el error con el enlace "Buscar en los documentos sin el asistente", que abre `/documentos?q=…` con la búsqueda hecha.

**Se corta la conexión.** Si la transmisión termina sin la respuesta final, la web muestra que la respuesta se cortó. Ofrece el enlace a la búsqueda, armado por la web con la misma regla que la API (R8), y la opción de volver a preguntar.

## 6. Reglas de negocio

### Ruta nueva

- **R1 · Ruta.** `POST /api/chat/stream`, con sesión (`JwtAuthGuard`). El cuerpo es el mismo de `POST /api/chat` (`ChatRequestDto`): `message` de 1 a 2.000 caracteres, `conversationId` opcional y `context` opcional, que se acepta y no se usa. `POST /api/chat` no cambia.
- **R2 · Errores antes de transmitir.** Todo lo que se puede saber antes del primer evento responde en JSON, con el formato de NestJS, sin abrir la transmisión:
  - pedido inválido: 400;
  - sin sesión o sesión vencida: 401;
  - conversación que no existe o es de otro usuario: 404;
  - la base no responde al resolver la conversación: 503, con "El asistente no está disponible en este momento".
- **R3 · Formato de la transmisión.** Si el pedido es válido, la API responde 200 con estos encabezados:
  - `Content-Type: text/event-stream; charset=utf-8`;
  - `Cache-Control: no-cache, no-transform`;
  - `X-Accel-Buffering: no`.

  Manda eventos SSE en el cuerpo de la respuesta del POST. Cada evento tiene una línea `event:`, una línea `data:` con JSON en una sola línea, y una línea vacía:

  ```text
  event: start
  data: {"conversationId":"7f3c…"}

  event: delta
  data: {"text":"El plazo es de "}

  event: delta
  data: {"text":"5 días [S2]."}

  event: done
  data: {"conversationId":"7f3c…","messageId":"a1b2…","status":"answered","answer":"El plazo es de 5 días [S2].","sources":[{…}]}
  ```

  - `start`: uno solo, primero, con el `conversationId` (nuevo o el que vino).
  - `delta`: cero o más, con el texto nuevo, en orden. Solo con `status: answered`.
  - `done`: la respuesta final, con **la misma forma que `POST /api/chat`** (`ChatResult`), más `searchUrl` cuando corresponde (R8).
  - `error`: `{ "statusCode": 503, "message": "…" }`, si algo falla después de abrir la transmisión y no se puede armar `done` (por ejemplo, la base no responde al guardar el mensaje).
  - Siempre hay **un solo evento final**, `done` o `error`, y después la API cierra la transmisión.
  - Las líneas que empiezan con `:` son comentarios. El cliente ignora los comentarios y los eventos que no conoce.
- **R4 · Mismo resultado que la ruta actual.** Ante la misma pregunta, los mismos fragmentos y la misma respuesta del modelo, `done` trae lo mismo que respondería `POST /api/chat`:
  - el mismo `status`;
  - el mismo `answer` (`NO_INFO_TEXT` o `UNAVAILABLE_TEXT` cuando corresponde);
  - las mismas `sources`, que son solo las que el modelo citó, o todas si no citó ninguna;
  - el mismo mensaje guardado.

  La única diferencia es `searchUrl` con `ai_unavailable`, hasta que Guille lo agregue a su ruta. Las dos rutas usan las mismas funciones (R14), y un test compara sus respuestas (sección 9).
- **R5 · El texto transmitido es la respuesta.** Con `status: answered`, los `delta` unidos forman el `answer` de `done`, salvo los espacios al principio y al final. Con `no_info` o `ai_unavailable` no se manda ningún `delta` después de detectarlo, y la web usa el `answer` de `done`.
- **R6 · La marca `NO_INFO` nunca llega a la web.** El modelo responde exactamente `NO_INFO` cuando los pasajes no alcanzan. La API no manda texto hasta tener, sin los espacios iniciales, al menos tantos caracteres como la marca y comprobar que no empieza con ella, o hasta que termine el modelo. Si empieza con la marca, no manda ningún `delta`, y `done` llega con `no_info`.
- **R7 · Se guarda igual que hoy.** Cada consulta que llega a `done` deja un mensaje en la conversación, con los mismos datos que guarda `POST /api/chat`: pregunta, respuesta, estado, fragmentos y versiones usados, modelo, tokens y latencia. La latencia se mide hasta `done`. Una consulta cortada por el usuario no se guarda (R11).

### Respaldo con la búsqueda (HU36)

- **R8 · Enlace a la búsqueda.** Toda respuesta `done` con `status: ai_unavailable` de la ruta nueva trae `searchUrl`. Es una ruta relativa de la web, `/documentos?q=<texto>`:
  - el texto es la pregunta sin espacios al principio ni al final y con los espacios internos (incluidos los saltos de línea) reducidos a uno;
  - si pasa de 100 caracteres (`SEARCH_MAX` de la spec 004), se recorta en el último espacio antes del carácter 100, o en el 100 si no hay espacios;
  - se codifica con `encodeURIComponent`;
  - si queda con menos de 3 caracteres (`SEARCH_MIN`), el enlace es `/documentos`, sin `q`.

  El campo se **agrega** en el tipo de respuesta de la ruta nueva; `chat.contract.ts` no cambia (D9). Las otras respuestas no lo traen. La web aplica la misma regla para armar el enlace cuando no llegó `done` (F5).

### Tiempos y cortes

- **R9 · Tiempos de espera.** La API corta el pedido al modelo y responde `done` con `ai_unavailable` (R8) en estos casos:
  - el embedding de la pregunta tarda más de 15 s;
  - el modelo no manda el primer texto en 15 s;
  - el modelo pasa más de 15 s sin mandar texto nuevo;
  - la generación completa pasa de 60 s (D12).

  Un fallo del modelo a mitad de la respuesta también termina en `ai_unavailable`, aunque ya se haya mandado texto.
- **R10 · Un fallo después de transmitir texto.** Si el modelo falla, o se pasa un tiempo de R9, después de haber mandado `delta`, `done` llega con `ai_unavailable`, `UNAVAILABLE_TEXT`, sin fuentes y con `searchUrl`, y se guarda como `ai_unavailable` (R7). La web descarta el texto parcial (F5).
- **R11 · El usuario corta.** Si la web cierra la conexión antes de `done` (porque salió de la pantalla o cerró la pestaña), la API corta el pedido al modelo, no manda más eventos y **no guarda el mensaje** (D13). La conversación, si se creó en ese pedido, queda sin ese mensaje.

### Piezas del módulo de chat

- **R12 · Puerto del modelo.** `ChatLlm` suma un método de streaming que recibe lo mismo que `answer` (la pregunta y los pasajes) y una señal para cortar. Devuelve el texto en partes y, al terminar, lo mismo que `answer`: texto completo, modelo y tokens. El método **no es abstracto** y trae una implementación por defecto que llama a `answer` y entrega el texto en una sola parte. Así las clases que ya extienden `ChatLlm` (el `FakeLlm` de los tests de Guille) siguen compilando sin cambios.
- **R13 · Adaptador de Gemini.** `GeminiChatLlm` implementa el método nuevo con `streamText` del AI SDK. Usa el mismo modelo, el mismo prompt de sistema y el mismo armado de los pasajes que `answer`, y corta con la señal de R9 y R11.
- **R14 · Extracción de la orquestación.** El cuerpo de `ChatService.run` y lo que hace `ask` después de resolver la conversación pasan a funciones exportadas de un archivo nuevo del módulo, que usan las dos rutas.
  - `ChatService.ask` y `run` siguen existiendo, con la misma firma, y hacen exactamente lo mismo, en el mismo orden.
  - `chat.service.ts` sigue exportando lo que exporta hoy (`ChatService`, `ChatUser`, `TOP_K`, `MAX_COSINE_DISTANCE`, `NO_INFO_MARKER`, `NO_INFO_TEXT` y `UNAVAILABLE_TEXT`), así sus imports no cambian.
  - `chat.service.spec.ts` pasa **sin modificarlo**.
  - Qué se mueve exactamente queda en la sección 12, para Guille.
- **R15 · Qué más se agrega en el módulo.**
  - En `apps/api/src/chat` se agregan: el controlador de la ruta nueva, el servicio de streaming, el método del puerto (R12), su implementación en el adaptador (R13) y el armado de `searchUrl` (R8).
  - `chat.module.ts` solo suma el controlador y el servicio nuevos.
  - Fuera de R14, no se cambia nada existente del módulo.

### Reglas de pantalla

- **F1 · Dónde está.** La pantalla del chat está en `/asistente`.
  - Solo se ve con sesión, como el resto de la web.
  - Usa siempre la ruta nueva (R1).
  - Mientras el menú no tenga el enlace (lo agrega la pareja A), se entra desde un acceso "Preguntale al asistente" arriba del listado de `/documentos` (D11).
- **F2 · Cabecera.** Como en el skill: fondo `celeste` (el color del asistente) y el título "El hornero". Abajo va el alcance: "Responde solo con lo vigente de tus áreas y cita la fuente".
  - No se muestra "● Conectado": no hay un estado de conexión real.
  - No hay imagen del hornero hasta que esté en `public`.
- **F3 · Mensajes.**
  - La pregunta va en una burbuja `bosque` a la derecha, con texto blanco.
  - La respuesta va a la izquierda, sobre blanco. Mientras llegan los `delta`, el texto crece en la misma burbuja.
  - Las marcas `[S1]` se muestran tal cual hasta `done`; con `done` se reemplazan por las citas numeradas (F4).
- **F4 · Fuentes y citas.**
  - Con `done` y `answered`, la web junta las marcas `[Sn]` del texto, sin repetir y de menor a mayor, y las cruza en ese orden con `sources` (D14). La primera marca es la cita 1, la segunda la cita 2, y así.
  - Si la cantidad de marcas distintas no coincide con la de fuentes, el texto queda sin citas (se quitan las marcas) y las fuentes se muestran igual, debajo.
  - Las fuentes se muestran como botones "1 Manual de compras · v2 · Aprobaciones", con el título, la versión y la sección. Cada uno abre el detalle del documento (`/documentos/<documentId>`, spec 002).
  - No se muestra `validFrom` mientras Guille no lo corrija (sección 12).
- **F5 · Estados de la respuesta.**
  - **`no_info`:** el texto de `answer` ("No encontré información suficiente…") en una caja de borde punteado, sin fuentes.
  - **`ai_unavailable`:** se borra el texto parcial y se muestra `answer` con el enlace "Buscar «<texto>» en los documentos", que lleva a `searchUrl`.
  - **Corte:** si la transmisión termina sin `done` ni `error`, o hay un error de red, se borra el texto parcial y se muestra "Se cortó la respuesta". Lleva el enlace a la búsqueda, armado por la web con la regla de R8, y "Volver a preguntar".
  - **`error` o un 503:** igual que el corte, con "El asistente no pudo responder".
  - **Una 400 o una 404 de la conversación:** el mensaje del error. Con la 404, se empieza una conversación nueva al volver a preguntar.
- **F6 · Escribir y enviar.**
  - Un área de texto con la etiqueta "Tu pregunta", de hasta 2.000 caracteres, con contador.
  - El botón "Preguntar" con ✦ es el botón de IA del skill: fondo `naranja-boton` y texto blanco.
  - Enter envía y Shift+Enter agrega una línea. No se puede enviar vacío.
  - Mientras hay una respuesta en curso, el botón queda deshabilitado y se puede escribir la próxima pregunta.
- **F7 · Conversación.** La primera pregunta va sin `conversationId`. Las siguientes van con el `conversationId` de `start`. La conversación vive mientras la pantalla esté abierta; al volver a entrar, empieza otra. Hay un botón "Nueva conversación" que la vacía.
- **F8 · Accesibilidad.**
  - La burbuja que se está generando lleva `aria-busy="true"` y no se anuncia parte por parte.
  - Al llegar `done`, una región `aria-live="polite"` anuncia la respuesta completa, o el "No encontré", o el error con el enlace.
  - Foco visible, botones de solo ícono con `aria-label`, y el estado nunca se da solo con color.
- **F9 · Sesión.** La web pide la ruta nueva con el método `stream` del cliente HTTP (D10). Pone los mismos encabezados de sesión que `request` y, ante un 401 antes de transmitir, renueva la sesión una vez y repite el pedido.
- **F10 · Diseño y responsive.**
  - Se usan las clases de los tokens de `globals.css`, sin colores en hexadecimal.
  - Debajo de 1024 px ocupa todo el ancho, con el campo de texto abajo. Se usa desde la computadora y el celular.

## 7. Estados

Esta feature no agrega estados de la respuesta: usa los de `ChatResultStatus` (`answered`, `no_info`, `ai_unavailable`; `conflict` queda para HU39). La transmisión pasa por estos estados, vistos desde la web:

`enviando` → (`start`) → `recibiendo` → (`done`) → `respondida` / `sin información` / `IA no disponible`

Desde `enviando` o `recibiendo` también puede terminar en `cortada` (sin evento final o error de red) o en `con error` (evento `error`, o 400, 404 o 503).

## 8. Casos borde

- **El modelo responde `NO_INFO` precedido de espacios o un salto de línea:** no se manda ningún `delta`; `done` llega con `no_info` (R6).
- **El modelo responde algo que empieza con "NO" pero no es la marca** (por ejemplo, "Normalmente…"): se espera a tener 7 caracteres, se comprueba y se manda todo junto en el primer `delta`.
- **El modelo responde menos de 7 caracteres en total** (por ejemplo, "Sí [S1]" sin la marca): se manda al terminar, en un solo `delta`.
- **El usuario no tiene áreas:** sin llamar a la IA, `start` y `done` con `no_info`, como hoy en `POST /api/chat`.
- **Falla el embedding de la pregunta, o tarda más de 15 s:** `start` y `done` con `ai_unavailable` y `searchUrl`, sin consultar los fragmentos.
- **El modelo manda el primer texto a los 14 s y después uno cada 10 s:** no se corta por inactividad; se corta a los 60 s en total si no terminó (R9).
- **El modelo se corta a mitad:** la web ya mostró parte del texto, lo borra y muestra el error con el enlace (R10, F5).
- **Una pregunta de 1.500 caracteres:** `searchUrl` lleva los primeros 100 caracteres, cortados en un espacio (R8).
- **Una pregunta de 2 caracteres ("ok"):** `searchUrl` es `/documentos`.
- **Una pregunta con `&`, `#`, tildes o saltos de línea:** el enlace va codificado, con los saltos de línea como espacios (R8), y la búsqueda ignora las tildes (spec 004).
- **El modelo cita `[S2]` y `[S5]`:** son las citas 1 y 2, en el orden de `sources` (F4).
- **El modelo cita `[S9]` y hay 6 pasajes:** `sources` no la incluye (como hoy), las marcas no coinciden con las fuentes y la web muestra el texto sin citas y las fuentes debajo (F4).
- **El modelo no cita ninguna marca:** `sources` trae todos los fragmentos recuperados (como hoy) y la web los muestra debajo, sin citas en el texto.
- **La conversación es de otro usuario:** 404 antes de transmitir (R2).
- **El token vence a mitad de la transmisión:** la transmisión sigue, porque la sesión se validó al empezar.
- **El proxy de Next (`/api/:path*`) o un proxy intermedio junta los eventos y los manda al final:** se evita con los encabezados de R3. Se verifica en la tarea de verificación con la web y la API reales.
- **El usuario envía otra pregunta mientras llega una respuesta:** no puede; el botón está deshabilitado hasta el evento final (F6).
- **El usuario sale de la pantalla mientras llega la respuesta:** la web corta el pedido, la API corta el modelo y no guarda nada (R11).
- **La base no responde al guardar el mensaje, después de transmitir:** evento `error` con 503; la web muestra el error con el enlace (F5).
- **`POST /api/chat` con la IA caída:** sigue respondiendo como hoy, sin `searchUrl`, hasta que Guille lo agregue (sección 12).

## 9. Restricciones no funcionales

- **Las mismas de las specs anteriores:** errores con el formato de NestJS, ningún secreto en el repositorio, la clave de Gemini solo en el entorno (`GOOGLE_GENERATIVE_AI_API_KEY`).
- **Swagger:** la ruta nueva figura con su cuerpo, `text/event-stream` como respuesta 200, la lista de eventos y los errores de R2.
- **Sin dependencias nuevas.** La API usa `streamText` del AI SDK 7, que ya está, y sus modelos simulados (`ai/test`) en los tests. La web lee la transmisión con `fetch` y `ReadableStream`, no con `EventSource`, que no admite POST ni encabezados de autorización.
- **Tiempo hasta el primer texto:** que se vea texto antes que con la ruta actual. Se mide en la tarea de verificación, con un documento real y la clave de desarrollo.
- **El filtro por área se aplica antes de llamar al modelo,** como hoy (matriz de permisos). Esta spec no lo cambia.
- **Tests:**
  - `chat.service.spec.ts` pasa **sin cambios**, antes y después de la extracción.
  - Un test compara las respuestas de las dos rutas en los mismos casos (R4), con el servicio y por HTTP.
  - Ningún test llama a Gemini: se usa un `ChatLlm` simulado que transmite en partes.
- **Archivos de otros:**
  - De Guille se tocan solo `chat.service.ts` (la extracción de R14), `ports/chat-llm.ts` (R12), `adapters/gemini-chat-llm.ts` (R13) y `chat.module.ts` (R15).
  - De `lib/api/client.ts` solo se agrega el método `stream`.
  - No se tocan los archivos de las parejas A y B (sesión, menú, `layout`, ejecuciones).

## 10. Decisiones

Tomadas por el responsable antes de escribir la spec (04/11/2026):

| Decisión | Regla |
| --- | --- |
| D1 · Una ruta nueva, `POST /api/chat/stream`; la actual queda igual | R1, R14 |
| D2 · Eventos SSE en la respuesta del POST, leídos en la web con `fetch` y `ReadableStream` (`EventSource` no admite POST) | R3, sección 9 |
| D3 · Al final, la respuesta completa con la misma forma que la ruta actual | R3, R4 |
| D4 · En el módulo de chat solo se agregan la ruta, el método de streaming del puerto y su adaptador de Gemini (más la extracción de D8) | R12 a R15 |
| D5 · `ai_unavailable` trae un enlace a `/documentos?q=<pregunta>`, agregando un campo, y la pantalla lo muestra | R8, F5 |
| D6 · La pantalla del chat sigue la sección "Chat" del skill `pispiar-design` | F2 a F10 |
| D7 · HU21, HU39, la visibilidad del chat y `validFrom` quedan fuera; se le avisa a Guille | Secciones 4 y 12 |

Tomadas en la etapa de aclaración (clarify) el 04/11/2026:

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D8 · ¿Cómo se reutiliza la orquestación sin duplicarla? | Se extrae de `ChatService.run` a funciones exportadas, sin cambiar el comportamiento. Los tests de Guille pasan sin modificarlos, y un test compara las respuestas de las dos rutas. Lo que se movió queda en los avisos | R4, R14, sección 12 |
| D9 · ¿Cómo llega `searchUrl` a `POST /api/chat`? | Se lo pedimos a Guille. Mientras tanto, solo la ruta nueva lo trae (en su propio tipo, sin tocar `chat.contract.ts`), y la web arma el enlace cuando no llega | R8, F5, sección 12 |
| D10 · ¿Cómo lee la web la transmisión con la sesión? | Un método `stream` nuevo en `lib/api/client.ts`; lo que ya existe no cambia | F9 |
| D11 · ¿Dónde se monta la pantalla? | En `/asistente`. El enlace del menú se lo pedimos a la pareja A (Camila); mientras tanto, un acceso desde `/documentos` | F1, sección 12 |
| D12 · ¿Qué tiempo de espera tiene la transmisión? | 15 s hasta el primer texto, 15 s como máximo sin texto nuevo y 60 s en total; 15 s para el embedding de la pregunta | R9 |
| D13 · Si el usuario corta antes de `done`, ¿qué se guarda? | Nada: se corta el modelo y no se guarda el mensaje | R7, R11 |
| D14 · ¿Cómo se cruza cada marca `[Sn]` con su fuente? | La web, por orden: marcas sin repetir, de menor a mayor, contra `sources`. Si no coinciden, sin citas en el texto. Se le sugiere a Guille un campo `ref` | F4, sección 12 |

## 11. Criterios de aceptación

```gherkin
Escenario: la respuesta aparece de a partes
  Dado un EMPLOYEE de Ventas con sesión
  Y un documento vigente de Ventas que dice "el plazo es de 5 días"
  Cuando pregunta "¿Cuál es el plazo?" en /asistente
  Entonces ve su pregunta a la derecha
  Y ve el texto de la respuesta crecer antes de que termine
  Y al terminar ve "El plazo es de 5 días" con la cita 1
  Y el botón de la fuente 1 abre el detalle del documento

Escenario: las dos rutas responden lo mismo
  Dados los mismos fragmentos y la misma respuesta del modelo
  Cuando se pregunta por POST /api/chat/stream y por POST /api/chat
  Entonces el evento done trae el mismo status, answer y sources que la respuesta de POST /api/chat
  Y las dos guardan el mismo mensaje
  Y los delta unidos forman el answer

Escenario: la ruta actual no cambia
  Cuando se pide POST /api/chat
  Entonces responde de una vez, como antes
  Y los tests de chat.service.spec.ts pasan sin modificarlos

Escenario: formato de la transmisión
  Cuando se pide POST /api/chat/stream con una pregunta válida
  Entonces la respuesta es 200 con Content-Type text/event-stream
  Y el primer evento es start con el conversationId
  Y el último es done o error, uno solo
  Y después la API cierra la transmisión

Escenario: sin información
  Dado que ningún fragmento de las áreas del usuario supera el umbral de relevancia
  Cuando pregunta algo
  Entonces no llega ningún delta
  Y done llega con status no_info
  Y la pantalla muestra "No encontré información suficiente…" en una caja punteada

Escenario: la marca NO_INFO nunca se ve
  Dado que el modelo responde "NO_INFO"
  Cuando el usuario pregunta
  Entonces no llega ningún delta con "NO"
  Y done llega con status no_info

Escenario: la IA no está disponible
  Dado que el modelo no responde
  Cuando el usuario pregunta "¿Cómo cierro la caja?"
  Entonces done llega con status ai_unavailable y searchUrl "/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F"
  Y la pantalla muestra el error con el enlace "Buscar «¿Cómo cierro la caja?» en los documentos"
  Y al tocarlo se abre /documentos con la búsqueda hecha

Escenario: el modelo tarda demasiado
  Dado que el modelo no manda el primer texto en 15 segundos
  Cuando el usuario pregunta
  Entonces la API corta el pedido al modelo
  Y done llega con status ai_unavailable y searchUrl

Escenario: el modelo deja de mandar texto
  Dado que el modelo mandó una parte y pasan 15 segundos sin texto nuevo
  Cuando se cumple el tiempo
  Entonces la API corta el pedido al modelo
  Y la pantalla borra el texto parcial y muestra el error con el enlace a la búsqueda
  Y el mensaje queda guardado como ai_unavailable

Escenario: se corta la conexión
  Dado que la transmisión termina sin evento final
  Cuando la web lo detecta
  Entonces muestra "Se cortó la respuesta" con el enlace a la búsqueda y "Volver a preguntar"

Escenario: el usuario sale de la pantalla
  Dado una respuesta en curso
  Cuando el usuario sale de /asistente
  Entonces la web corta el pedido
  Y la API corta el pedido al modelo
  Y no se guarda el mensaje

Escenario: enlace con una pregunta larga
  Dada una pregunta de 1.500 caracteres y la IA no disponible
  Cuando llega done
  Entonces searchUrl lleva como mucho 100 caracteres de la pregunta, cortados en un espacio

Escenario: errores antes de transmitir
  Cuando se pide POST /api/chat/stream sin sesión
  Entonces la respuesta es 401 en JSON
  Y con un message vacío la respuesta es 400
  Y con el conversationId de otro usuario la respuesta es 404, sin abrir la transmisión

Escenario: la conversación sigue
  Dado que el usuario hizo una pregunta y recibió la respuesta
  Cuando hace otra pregunta
  Entonces el pedido lleva el conversationId del evento start
  Y con "Nueva conversación" la próxima pregunta va sin conversationId

Escenario: citas por orden
  Dado que el modelo cita [S2] y [S5] y sources trae esos dos fragmentos
  Cuando llega done
  Entonces el texto muestra las citas 1 y 2
  Y la cita 1 corresponde a la primera fuente

Escenario: acceso al chat
  Dado un usuario con sesión en /documentos
  Cuando toca "Preguntale al asistente"
  Entonces se abre /asistente

Escenario: accesible con lector de pantalla
  Dado un usuario con lector de pantalla
  Cuando llega una respuesta de a partes
  Entonces no se anuncia cada parte
  Y al terminar se anuncia la respuesta completa
```

## 12. Avisos para Guille

### Lo que se movió de `chat.service.ts` (D8)

Va a un archivo nuevo, `apps/api/src/chat/chat-pipeline.ts`, sin cambiar el código salvo para exportarlo y recibir las dependencias como parámetros:

1. **Las constantes** `TOP_K`, `MAX_COSINE_DISTANCE`, `NO_INFO_MARKER`, `NO_INFO_TEXT` y `UNAVAILABLE_TEXT`, y el tipo `ChatUser`. `chat.service.ts` las vuelve a exportar, así los imports de siempre (incluido el de `chat.service.spec.ts`) no cambian.
2. **El tipo `Outcome`** y las funciones `unavailable`, `citedChunks` y `toSources`, que antes no se exportaban.
3. **Del cuerpo de `run`, la preparación:** sin áreas → `no_info`; el embedding de la pregunta, que si falla da `ai_unavailable`; la recuperación con `TOP_K` y el filtro por `MAX_COSINE_DISTANCE`, que sin fragmentos da `no_info`; y el armado de los pasajes `S1`, `S2`… Queda como `prepareChat(embeddings, retrieval, user, question)`.
4. **Del cuerpo de `run`, el cierre:** la marca `NO_INFO` y las citas. Queda como `finishChat(llmAnswer, chunks)`.
5. **De `ask`, lo que va después de resolver la conversación:** guardar el mensaje (`saveMessage`, con la latencia) y armar el `ChatResult`. Queda como `saveResult(repository, conversationId, question, outcome, startedAt)`.

`ChatService.ask` y `run` quedan con la misma firma y llaman a esas funciones en el mismo orden de antes: resolver la conversación, preparar, `llm.answer` con el mismo `try/catch`, cerrar y guardar. Los tests de `chat.service.spec.ts` pasan sin cambios, y un test nuevo compara las dos rutas.

### Pedidos

6. **`searchUrl` en `POST /api/chat` (D9).** Que `ai_unavailable` traiga `searchUrl` también en tu ruta, como en la nueva (R8), y el campo opcional en `ChatResult` de `chat.contract.ts`. La función que lo arma queda exportada para reutilizarla. Mientras tanto, la pantalla no lo necesita: usa la ruta nueva y, si falta, arma el enlace.
7. **Revisar la extracción** en el PR (punto 1 a 5) y, si preferís otra forma, cambiarla en un PR tuyo.

### Para corregir (fuera de esta spec)

8. **Visibilidad distinta de Documentos.** El chat recupera con las áreas de la sesión (`user.areaIds`), que solo trae las activas, y no usa `document-access.policy`.
   - Un ADMIN sin áreas recibe siempre `no_info`, aunque en Documentos ve todo.
   - Un EMPLOYEE de un área inactiva no encuentra en el chat lo que sí ve en Documentos (E22 de la spec 008).

   Sugerencia: usar la misma regla que la búsqueda (`searchScope` de la spec 004).
9. **`validFrom` sale de `review_date`,** que es la próxima fecha de revisión (spec 005), no la fecha desde la que el documento está vigente. Mientras tanto, la pantalla no lo muestra (F4).
10. **Errores de la base sin mapear.** Si la base no responde al recuperar o al guardar, `POST /api/chat` responde 500, no 503. La ruta nueva responde 503 (R2, R3).
11. **El embedding de la pregunta no tiene tiempo de espera** en `POST /api/chat`: si Gemini no responde, el pedido queda colgado. La ruta nueva lo limita a 15 s (R9).
12. **Citas sin referencia.** `ChatSource` no dice a qué marca `[Sn]` corresponde. La web la deduce por orden (D14); un campo `ref` lo haría seguro.
13. **Campos sin usar:** `suggestedContact` nunca se arma con `no_info`, y `url` de las fuentes queda vacía (TODO de HU18).

## 13. Aviso para la pareja A (Camila)

14. **Enlace "Asistente" en el menú (D11).** La pantalla del chat está en `/asistente`. Pedimos el enlace en el menú (`SessionControls` o el menú lateral del diseño, cuando exista) para todos los roles con sesión. Mientras tanto, se entra desde `/documentos`.
