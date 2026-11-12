# Spec 011 · Asistente: documentos que se contradicen

- **Historia:** **HU39:** "Como empleado, quiero saber si dos documentos se contradicen." Criterio: se prioriza el vigente; si persiste, se muestran ambas fuentes y se alerta al admin.
- **Responsable:** Matías Fauda (pareja C).
- **Depende de:**
  - **Spec 009:** `POST /api/chat/stream`, la orquestación compartida (`chat-pipeline.ts`), el retén de la marca `NO_INFO` (`NoInfoGate` en `chat-stream.service.ts`) y la pantalla del chat (`components/chat`).
  - **Spec 010:** el panel del chat en la ejecución (`ChatPanel`, `ExecutionChatPanel`) y el hook compartido `useChatConversation`. La contradicción se muestra igual en `/asistente` y en el panel.
  - **El chat de HU17 (Guille):** el estado `conflict` ya está previsto, pero nadie lo produce.

    **Verificado en código:**
    - `chat.contract.ts` declara `ChatResultStatus = 'answered' | 'no_info' | 'conflict' | 'ai_unavailable'`;
    - el enum `ChatStatus` de Prisma tiene `CONFLICT // documentos contradictorios (HU39)`, y `PrismaChatRepository` ya lo traduce (`STATUS_MAP`);
    - ni `finishChat` ni el prompt de `GeminiChatLlm` producen `conflict`: hoy una respuesta es `answered`, `no_info` o `ai_unavailable`;
    - en la web, `ChatMessage.tsx` muestra `conflict` igual que `no_info` (caja punteada, sin fuentes), y `useChatConversation.ts` descarta las fuentes de todo lo que no sea `answered`.
  - **La recuperación del chat (`PrismaChatRetrieval`):** solo trae fragmentos activos (`c.is_active`) de documentos `ACTIVE`, de su versión `CURRENT` y `READY`, y de las áreas del usuario (`c.area_ids && areaIds`), en la misma consulta SQL.
  - **Spec 005:** la sección "Por revisar" (`/documentos/por-revisar`, `PendingReviewLink` en `DocumentList`) como modelo de la sección "Alertas". **Spec 003 y 008:** el estado del documento, las versiones y los nombres históricos de los usuarios.
  - **El skill `pispiar-design`:** la sección "Chat", los tokens de `globals.css` y la voz de los textos.
- **Estado:** lista para planificar. Las decisiones de la etapa de aclaración están en la sección 10.

## 1. Problema y objetivo

Si dos documentos vigentes dicen cosas distintas sobre lo mismo (por ejemplo, el manual de compras dice que las compras de más de $500.000 las aprueba el gerente y la política de gastos dice que el director), hoy el asistente responde con uno de los dos, o mezcla los dos, y el empleado no se entera de que hay una contradicción. Nadie se entera, y el error en los documentos sigue ahí.

Esta feature hace que el asistente marque la contradicción cuando la encuentra entre los pasajes que recuperó. El empleado ve un aviso y las dos fuentes, para decidir con los dos documentos a la vista. El ADMIN recibe una alerta en una sección nueva, "Alertas", donde ve los dos documentos, la pregunta que la disparó y la fecha, y la marca como resuelta cuando corrige los documentos.

## 2. Actores

- **EMPLOYEE, SUPERVISOR y ADMIN:** consultan al asistente, desde `/asistente` o desde un paso (spec 010), y ven el aviso de contradicción.
- **ADMIN:** ve las alertas y las marca como resueltas.
- **Guille (pareja C):** dueña del chat de HU17. Esta spec agrega piezas a su módulo y hace cambios mínimos en su servicio y en el prompt (sección 12).
- **Pareja A (Camila):** dueña del menú y del inicio. Se le pide el enlace "Alertas" (sección 13).

## 3. Alcance

- **"Se prioriza el vigente"** como regla del asistente, que ya se cumple (R1).
- **La detección:** el modelo marca la contradicción con una señal al principio de la respuesta, como `NO_INFO`. La API la valida y responde `status: conflict` con las dos fuentes, en las dos rutas (R2 a R8).
- **El aviso en el chat**, con las dos fuentes, en `/asistente` y en el panel del paso (F1 a F4).
- **La alerta al ADMIN:**
  - una tabla nueva (sección 7.1);
  - las rutas para listar las alertas y marcarlas como resueltas (R10 a R16);
  - la sección "Alertas" en `/documentos/alertas`, con su acceso desde `/documentos` (F5 a F9).

## 4. Fuera de alcance

- **Contradicciones dentro de un mismo documento**, o entre versiones de un mismo documento (R1).
- **Buscar contradicciones por fuera de las consultas:** no hay un análisis de todo el catálogo. Una contradicción se detecta solo cuando una pregunta recupera los dos pasajes.
- **Contradicciones con documentos que el usuario no puede ver** (R9).
- **Avisos por email** u otro canal: la alerta se ve solo en la app (como en la spec 005, P3).
- **Corregir los documentos desde la alerta:** el ADMIN usa las pantallas de documentos (nueva versión, archivar) y después marca la alerta como resuelta.
- **Cambiar la forma de `ChatResult`, la tabla `conversations` o la tabla `messages`.**
- **El enlace "Alertas" en el menú y en el inicio:** lo agrega la pareja A (sección 13).
- **Los avisos para Guille de las specs 009 y 010** que siguen pendientes, en particular la visibilidad del chat (aviso 8 de la spec 009).

## 5. Flujos principales

**Preguntar y encontrar una contradicción.**
1. Una empleada de Compras pregunta "¿Quién aprueba una compra de $800.000?".
2. La recuperación trae pasajes vigentes del "Manual de compras" (v2) y de la "Política de gastos" (v1).
3. El modelo ve que dicen cosas incompatibles y empieza la respuesta con la marca `CONFLICT [S1] [S3]`, seguida de una explicación corta de lo que dice cada uno.
4. La API valida la marca, guarda la consulta como `CONFLICT`, registra la alerta y responde `status: conflict`. Las fuentes son los dos pasajes.
5. El chat muestra el aviso "Dos documentos dicen cosas distintas", la explicación con sus citas y las dos fuentes.

**Revisar la alerta.**
1. El ADMIN entra a Documentos y ve "Alertas (1)".
2. En "Alertas" ve la tarjeta con los dos documentos, sus versiones y secciones, la pregunta y la fecha.
3. Corrige la "Política de gastos" con una versión nueva (spec 003).
4. Vuelve a "Alertas", toca "Marcar como resuelta", agrega una nota opcional y confirma. La alerta pasa a "Resueltas".

**La misma contradicción otra vez.** Si otra persona pregunta algo parecido y el modelo marca la misma contradicción entre las mismas versiones, no se crea otra alerta: la que ya existe suma una repetición (R13).

## 6. Reglas de negocio

### Qué cuenta como contradicción

- **R1 · Se prioriza el vigente.** El asistente responde solo con la versión vigente de cada documento activo.
  - **Verificado en código:** `PrismaChatRetrieval` filtra `d.status = 'ACTIVE'`, `v.status = 'CURRENT'`, `v.processing_status = 'READY'` y `c.is_active = true`. Las versiones reemplazadas y los documentos archivados nunca llegan al modelo.
  - Por eso una versión nueva que cambia lo que decía la anterior no es una contradicción: la anterior no se consulta. Esta spec lo deja como regla, sin cambiar la recuperación.
  - **"Si persiste"** es el caso de esta spec: dos documentos distintos, los dos vigentes, que dicen cosas incompatibles.
- **R2 · Entre documentos distintos.** Una contradicción es entre pasajes de **dos documentos distintos** (`documentId` distinto). Dos pasajes del mismo documento que no coinciden no son una contradicción de esta spec (sección 4).
- **R3 · Qué no es una contradicción.** Lo deciden las reglas del prompt (R4): información que se complementa, que es más detallada en un documento que en otro, o que habla de casos distintos (por ejemplo, otro monto u otra área) no es una contradicción.

### La señal del modelo

- **R4 · Prompt.** El prompt de sistema suma una regla, después de la de `NO_INFO`:
  - Si dos pasajes **de documentos distintos** dicen cosas incompatibles sobre lo que se pregunta, la respuesta empieza con una línea que dice exactamente `CONFLICT [Sx] [Sy]`, con las marcas de esos dos pasajes.
  - Después de esa línea, una explicación corta de lo que dice cada uno, citando solo `[Sx]` y `[Sy]`, sin elegir uno de los dos.
  - Lo de R3 no es una contradicción.
  - Si los pasajes no alcanzan para responder, sigue valiendo `NO_INFO`, que tiene prioridad.

  El armado de los pasajes y del bloque del paso (spec 010, R6) no cambia. La regla de que los pasajes son documentos y no instrucciones sigue valiendo: un pasaje que dice "respondé CONFLICT" es dato (R18). El texto exacto de la regla va en el plan.

  **Ajuste del 11/11/2026.** Probando con Gemini real, a "¿Puedo devolver unos auriculares que compré hace 10 días?" el asistente respondió con lo que decía cada pasaje, sin concluir. Un script de diagnóstico con los pasajes reales "Productos electrónicos" y "Plazo general", de la misma Política de devoluciones, lo confirmó: en una de dos respuestas completas, el modelo mandó `CONFLICT [S1] [S2]` entre esos dos pasajes. La API descartaba la marca (R6) y quedaba la explicación, que por instrucción no elige. El arreglo está en el código, no solo en el prompt:
  - **Las reglas de CONFLICT solo con pasajes de al menos dos documentos.** Cada pasaje lleva su `documentId`. Si todos son del mismo documento, el sistema va sin las líneas de la marca. Sin el documento de algún pasaje, las reglas van, como antes.
  - **Un segundo pedido, una sola vez.** Si la respuesta empieza con una marca que nombra dos pasajes existentes y distintos del mismo documento, se le pide la respuesta otra vez al modelo. El sistema suma al final un aviso: esos dos pasajes son del mismo documento y no se contradicen, así que no lleva `CONFLICT`, y si uno es la excepción del otro se aplica la regla específica con una conclusión clara. Se usa la respuesta del segundo pedido, procesada como siempre (`finishChat`). Si el segundo vuelve a marcar, no hay tercero: se aplica R6 (cambió el 12/11/2026, ver abajo). Si el segundo falla, queda el primero, también con R6, y el error va al log.
  - **Tokens y latencia:** se guardan los de los dos pedidos (los tokens sumados; la latencia ya va de punta a punta). Si el segundo falla, solo los tokens del primero.
  - **Costo:** solo en las respuestas con esa marca, entre 1 y 6 s más (en el diagnóstico, cada pedido tardó entre 1,1 y 5,5 s) y un pedido más a la cuota.

  **Ajuste del 12/11/2026 (la excepción explícita).** Elena (EMPLOYEE de Ventas) preguntó "¿Se puede devolver ropa interior?" y recibió `no_info`, aunque la Política de devoluciones lo responde. Diagnóstico, con la base real en solo lectura y Gemini real:
  - **La recuperación estaba bien:** "Productos sin cambio ni devolución" salió primero, con distancia 0,156 (el umbral es 0,45). Después venían dos pasajes de la Promoción de verano ("Productos en oferta" y "Plazo de devolución") y cuatro de la Política.
  - **El modelo respondía `NO_INFO`** (2 de 2 corridas), por el choque con la Promoción de verano: "El cliente puede devolver cualquier producto dentro de los 60 días". Sin los dos pasajes de la Promoción, respondía "No se puede devolver ropa interior… [S1]".
  - **Decisión:** que este caso termine en `conflict`, con las dos fuentes y la alerta al ADMIN, no en `no_info`.

  El prompt de sistema suma una línea, antes de la de `NO_INFO` (en `SYSTEM_START`):

  ```text
  - Si un pasaje responde directamente lo que se pregunta (nombra el producto, el caso o la persona), respondé con ese pasaje. Una regla general ("cualquier producto") no anula una excepción explícita. Respondé NO_INFO solo si ningún pasaje responde.
  ```

  Con los seis pasajes reales, Gemini respondió `CONFLICT [S1] [S3]` (la Política y la Promoción, documentos distintos) en 2 de 2 corridas, con la explicación. Lo procesan R5 a R8 como cualquier marca válida, y se registra la alerta. El documento "Promoción de verano" es ambiguo ("cualquier producto" no aclara las exclusiones de la Política): la alerta lo muestra para que su responsable lo aclare.

  **Ajuste del 12/11/2026.** "¿Se puede devolver ropa interior?" a veces terminaba con la explicación de un `CONFLICT [S1] [S3]` entre dos pasajes de la misma Política de devoluciones, sin conclusión. Como los pasajes recuperados eran de dos documentos (la Política y la Promoción de verano), el segundo pedido seguía llevando las reglas de `CONFLICT`, y el modelo podía volver a marcar; con R6 quedaba otra vez una explicación. Ahora:
  - **El segundo pedido va sin las reglas de CONFLICT**, aunque los pasajes sean de dos documentos o más, como cuando son todos de uno. Conserva el aviso de que esos dos pasajes no se contradicen.
  - **Si igual vuelve con una marca** (válida o no), se saca su línea y la respuesta es el resto del segundo pedido, procesado como siempre (`finishChat`). Nunca se usa la explicación del primero. Si sin esa línea no queda texto, la respuesta es `no_info`. No se registra ninguna alerta, y el caso queda en el log como advertencia ("El segundo pedido volvió con una marca CONFLICT…").
- **R5 · Marca válida.** La API acepta la marca solo si se cumple todo esto:
  - la primera línea de la respuesta, sin los espacios iniciales ni finales, es `CONFLICT [Sx] [Sy]`, con espacios simples y nada más en la línea;
  - `Sx` y `Sy` son pasajes de esta consulta y son distintos;
  - los dos pasajes son de documentos distintos (R2);
  - después de la línea queda texto.
- **R6 · Marca inválida.** "Empieza con la marca" es empezar, sin los espacios iniciales, con la palabra `CONFLICT` sola, seguida de un espacio, un salto de línea o el fin: una respuesta que empieza con "CONFLICTIVO" no es una marca (05/11/2026, al implementar). Si la respuesta empieza con la marca pero no cumple R5, **se trata como `answered`**:
  - se quita la primera línea;
  - el resto se procesa como hoy (citas y fuentes, `citedChunks`);
  - no se registra ninguna alerta, y el caso queda en el log como advertencia, con las marcas que trajo.

  Si sin esa línea no queda texto, la respuesta es `no_info` con `NO_INFO_TEXT`.

  **Ajuste del 11/11/2026:** una marca entre dos pasajes del mismo documento primero lleva a un segundo pedido al modelo (R4); R6 se aplica a la respuesta que queda.

  **Ajuste del 12/11/2026:** R6 no se aplica a una marca del segundo pedido: se saca su línea, sea válida o no, y queda el resto (R4).
- **R7 · La respuesta `conflict`.** Con una marca válida, el resultado es el `ChatResult` de siempre:
  - **`status`:** `conflict`;
  - **`answer`:** la explicación del modelo, sin la línea de la marca. Las marcas `[Sn]` de otros pasajes se quitan del texto, así la explicación cita solo los dos pasajes de la contradicción;
  - **`sources`:** exactamente los dos pasajes de la marca, uno de cada documento, **ordenados por su número de pasaje** (`S1` antes que `S3`). Así la web cruza las citas con las fuentes por orden, como en la spec 009 (F4, D14);
  - **se guarda** como `CONFLICT`, con esos dos fragmentos y sus dos versiones en `used_chunk_ids` y `used_version_ids`.

  `chat.contract.ts` no cambia: `conflict` ya existe, y esta regla define qué traen `answer` y `sources` en ese estado.
- **R8 · Las dos rutas.** `finishChat` (`chat-pipeline.ts`) detecta la marca, así `POST /api/chat` y `POST /api/chat/stream` responden lo mismo (R4 de la spec 009). Un test de paridad lo compara con una respuesta `conflict`.
  - **Streaming:** el retén de la marca (`NoInfoGate`, R6 de la spec 009) pasa a contemplar las dos marcas. No manda texto hasta descartar que la respuesta empieza con `NO_INFO` o con `CONFLICT`.
    - Si empieza con `CONFLICT`, retiene hasta el fin de la primera línea (o hasta que termine el modelo) y la valida con R5.
    - Con una marca válida, **no manda ningún `delta`**, y `done` llega con `conflict` (como `no_info`, R5 de la spec 009). La web muestra el resultado con `done` (D9).
    - Con una marca inválida (R6), manda el texto que sigue a la línea como `delta`, y `done` llega con `answered`.
    - **Ajuste del 11/11/2026:** con una marca entre dos pasajes del mismo documento, no manda nada. Al terminar el primer pedido, se hace el segundo (R4), con sus propios 15 s hasta la primera parte, y sus `delta` pasan por el retén como los del primero. Si el segundo falla, `done` llega con la respuesta del primero (R6), sin `delta`: la web muestra el resultado con `done`. Si el cliente corta durante el segundo, no se guarda nada (R11 de la spec 009).
    - **Ajuste del 12/11/2026:** en el segundo pedido, una marca no cierra el retén: se saca su línea y lo que sigue pasa por el retén como una respuesta nueva (un `NO_INFO` tampoco sale como `delta`). Los `delta` y `done` traen el mismo texto que `POST /api/chat`.
  - **Orden al cerrar:** guardar la consulta (`saveResult`), registrar la alerta (R12) y recién después mandar `done`. Si falla el registro de la alerta, R12.
  - **Corte del usuario:** si la web corta antes de `done`, no se guarda la consulta (R11 de la spec 009) y tampoco se registra la alerta.
  - **Errores de la IA:** si el modelo falla o se pasa un tiempo de espera, la respuesta es `ai_unavailable`, como hoy, aunque ya hubiera mandado la marca.

### Visibilidad

- **R9 · Solo con documentos que el usuario puede ver.** La recuperación filtra por las áreas del usuario en la consulta SQL. El modelo nunca recibe pasajes de documentos que el usuario no puede ver, así que:
  - una contradicción entre un documento visible y uno que el usuario no ve **no se detecta en su consulta**. Recibe la respuesta con lo que ve, como hoy;
  - la respuesta `conflict` nunca revela que existe un documento que el usuario no puede ver: las dos fuentes son de documentos que recuperó con sus áreas;
  - la misma contradicción se detecta cuando pregunta alguien que ve los dos documentos (por ejemplo, un SUPERVISOR de las dos áreas);
  - si el usuario perdió el área entre la respuesta y el clic en la fuente, el detalle del documento responde 404, como siempre (spec 001, R11).

  Esta spec no cambia la visibilidad del chat. Lo que queda pendiente es el aviso 8 de la spec 009 (sección 12).

### La alerta al ADMIN

- **R10 · Qué es una alerta.** Un registro en la tabla nueva (sección 7.1), con:
  - los dos documentos y la versión vigente de cada uno cuando se detectó;
  - los dos fragmentos (para mostrar su sección);
  - la pregunta que la disparó y el mensaje en el que quedó guardada;
  - la fecha de la primera detección, la de la última y cuántas veces se detectó;
  - su estado (abierta o resuelta) y, si está resuelta, cuándo, quién y una nota.

  La alerta **no guarda ni muestra quién hizo la pregunta** (D13): es sobre los documentos, no sobre la persona. El mensaje queda referenciado por su ID.
- **R11 · El par, siempre en el mismo orden.** El documento A es el de `id` menor y el B, el de `id` mayor, con sus versiones y fragmentos. Así "Manual de compras contra Política de gastos" y "Política de gastos contra Manual de compras" son el mismo par.
- **R12 · Se registra en las dos rutas.** Después de guardar una consulta `conflict`, el chat registra la alerta con el puerto nuevo (R17).
  - Si el registro falla, la respuesta al usuario sigue siendo `conflict` y el error queda en el log (nivel `error`). Las consultas guardadas como `CONFLICT` permiten rearmar la alerta (sección 8).
  - El texto del aviso del chat dice "Le avisamos al administrador" (F2).
- **R13 · Sin alertas repetidas** (D8). Hay **una sola alerta por par de versiones**: índice único por versión A y versión B.
  - **Misma contradicción, alerta abierta:** no se crea otra. La existente suma 1 a las repeticiones y actualiza la fecha de la última detección. La pregunta y la fecha de la primera detección no cambian.
  - **Misma contradicción, alerta resuelta:** no se reabre ni se crea otra. El ADMIN ya la revisó con esas mismas versiones (por ejemplo, decidió que no era una contradicción).
  - **Una versión nueva de uno de los dos documentos:** es otro par de versiones. Si la contradicción sigue, se crea una alerta nueva.
  - **Dos consultas al mismo tiempo:** el índice único lo resuelve. Una crea la alerta y la otra suma la repetición (insertar o actualizar en una sola sentencia).
- **R14 · Ver las alertas.** `GET /api/conflict-alerts`, solo **ADMIN** (D11). Ni los SUPERVISOR ni los responsables de los documentos las ven.
  - **Filtros:** `status` (`OPEN` por defecto, o `RESOLVED`), `page` y `limit`, con los nombres y las reglas de paginación del listado (spec 001, R13: `limit` de 1 a 100, 20 por defecto).
  - **Orden:** las abiertas, por la última detección, de la más nueva a la más vieja; las resueltas, por la fecha de resolución, de la más nueva a la más vieja.
  - **Cada alerta trae:**
    - `id` y `status`;
    - `documents`: los dos, A y B, cada uno con `id`, el título actual, `status` (`ACTIVE` o `ARCHIVED`), el número de la versión de la alerta, la sección del fragmento (`Sin sección` si no tiene, o si el fragmento ya no existe) y `isCurrentVersion` (si esa versión sigue siendo la vigente);
    - `question`;
    - `firstDetectedAt`, `lastDetectedAt` y `occurrences`;
    - `resolvedAt`, `resolvedBy` (`{ id, name, isActive }`, como las referencias de la spec 008) y `resolutionNote`, o `null` si está abierta.
  - **La forma:** `{ data, total, openTotal, page, limit }`, como el listado: `data` son las alertas, `total` las del filtro pedido y `openTotal` las abiertas, para el acceso de F5.
  - **Errores:** sin sesión, 401; SUPERVISOR o EMPLOYEE, 403; un parámetro inválido o de más, 400; la base no responde, 503.
- **R15 · Marcar como resuelta.** `POST /api/conflict-alerts/:id/resolve`, solo **ADMIN**, con `note` opcional, de hasta 500 caracteres (D12). Una nota vacía o solo con espacios se guarda como `null`.
  - Pasa la alerta a `RESOLVED` con la fecha, el ADMIN y la nota, y responde 200 con la alerta como en R14.
  - **Errores:**
    - `id` que no es UUID: 400;
    - alerta que no existe: 404 "No se encontró la alerta";
    - alerta ya resuelta: 409 "La alerta ya está resuelta" (D12);
    - sin sesión, 401; otro rol, 403; la base no responde, 503.
  - Una alerta resuelta no se reabre (R13).
- **R16 · Auditoría.** Cada "Marcar como resuelta" queda en la auditoría de documentos (el `AuditLog` de la spec 005, R12): quién, qué alerta, qué documentos, cuándo y el resultado.
- **R17 · Los documentos de la alerta cambian.** La alerta no cambia sola (D15):
  - si se archiva uno de los documentos, la alerta sigue abierta y lo muestra como "Archivado";
  - si se sube una versión nueva, la alerta sigue abierta y muestra "Hay una versión nueva" (`isCurrentVersion: false`), para que el ADMIN la cierre después de revisar. Una versión nueva no garantiza que se haya corregido la contradicción;
  - los documentos no se borran (spec 003), así que la alerta siempre los encuentra.
- **R18 · Una marca en un documento no dispara alertas a voluntad.** Un pasaje cuyo texto pide responder `CONFLICT` es dato y no instrucción (R4). Aun si el modelo lo siguiera, R5 exige dos documentos distintos, y R13 deja como mucho una alerta por par de versiones.

### Piezas

- **R19 · Qué se agrega en el chat** (`apps/api/src/chat`), como en las specs 009 y 010:
  - **la detección en `chat-pipeline.ts`:** `CONFLICT_MARKER`, el análisis de la marca (R5 y R6) como función pura exportada, y su uso en `finishChat`. `Outcome` suma un campo opcional con el par de fragmentos de la contradicción. Sin la marca, `finishChat` hace exactamente lo de hoy;
  - **el retén de las dos marcas** en `chat-stream.service.ts` (R8);
  - **un puerto nuevo, `ConflictAlertRecorder`,** con su adaptador de Prisma, que registra la alerta de R12 y R13 en una sola sentencia;
  - **una función compartida** que las dos rutas llaman después de `saveResult`. Si el resultado es `conflict`, registra la alerta y captura su error (R12).
- **R20 · Qué se agrega en documentos** (`apps/api/src/documents/conflict-alerts`, como `documents/metrics` de la spec 007):
  - el controlador de R14 y R15, el servicio, el repositorio (puerto y adaptador de Prisma) y los DTO;
  - la regla del orden del par (R11), como función pura, que también usa el adaptador del chat;
  - `documents.module.ts` solo suma lo nuevo.
- **R21 · Cambios mínimos en lo de Guille** (sección 12):
  - **`gemini-chat-llm.ts`:** la regla nueva del prompt de sistema (R4). Es el único cambio del prompt, y cambia la respuesta de las dos rutas solo cuando el modelo encuentra una contradicción;
  - **`chat.service.ts`:** una dependencia opcional (`@Optional()`), el `ConflictAlertRecorder`, y en `ask` la llamada a la función de R19 después de `saveResult`. Sin contradicción, `ask` hace exactamente lo de hoy;
  - **`chat.module.ts`:** el proveedor del puerto nuevo.

  `chat.service.spec.ts` y los tests de paridad de las specs 009 y 010 pasan sin modificarlos.

### Reglas de pantalla

- **F1 · El estado en la web.** `useChatConversation` guarda las fuentes también con `conflict` (hoy solo con `answered`). `/asistente` y el panel del paso (spec 010) lo muestran igual, porque usan el mismo `ChatMessage`.
- **F2 · El aviso.** La burbuja de la respuesta, con `conflict`:
  - **Arriba, una caja** de fondo `durazno` y texto `durazno-texto`, con el ícono ⚠ (`aria-hidden`) y el título "Dos documentos dicen cosas distintas". Debajo, en la misma caja: "Revisá las dos fuentes antes de seguir. Le avisamos al administrador para que lo revise." El estado se lee en el texto, no solo en el color;
  - **después, la explicación del modelo** (`answer`), con las citas numeradas de la spec 009 (F4);
  - **al final, "Las dos fuentes"**, con los dos botones de fuente de `ChatSources` ("1 Manual de compras · v2 · Aprobaciones"), que abren el detalle de cada documento.
- **F3 · Accesibilidad.** La región `aria-live` de la spec 009 (F8) anuncia "Dos documentos dicen cosas distintas" y la explicación sin las marcas. El título del aviso no es un encabezado de la página: es texto en negrita dentro de la burbuja.
- **F4 · En el panel del paso.** El mismo aviso, en el ancho de la columna del asistente (spec 010, F3). Las dos fuentes se apilan.
- **F5 · Acceso a "Alertas".** En `/documentos`, solo para el ADMIN, junto a "Por revisar": un botón secundario "Alertas (n)", con `n` = `openTotal` y `aria-label` "Alertas: n abiertas". Igual que `PendingReviewLink` (spec 005, F2):
  - no se muestra mientras carga;
  - si falla, el ADMIN ve "Alertas" sin número.
- **F6 · La sección.** `/documentos/alertas`, solo para el ADMIN (D14). Otro rol ve el aviso de acceso de la sesión (`RequireRole` de la pareja A, sin cambiarlo).
  - "← Volver a Documentos", título "Alertas" y subtítulo "Documentos vigentes que, según el asistente, se contradicen."
  - Dos píldoras de filtro: "Abiertas (n)" y "Resueltas". La activa va en `bosque` con texto blanco; la inactiva, blanca con borde. El filtro queda en la URL (`?estado=resueltas`).
  - Paginada como el listado de documentos.
- **F7 · La tarjeta de una alerta.** Una tarjeta blanca (radio 16 px, borde), con:
  - **los dos documentos lado a lado** (apilados debajo de 1024 px). Cada uno muestra el título, que enlaza a su detalle, "v2 · Aprobaciones" en `texto-suave` y, si corresponde, "● Archivado" (`gris-reemplazada`) o "Hay una versión nueva" (`durazno`);
  - **"Pregunta que la disparó:"** y la pregunta entre comillas, recortada a tres líneas, con el texto completo en el `title`;
  - **los metadatos** en `texto-suave`, 14 px, con las fechas en hora de Argentina (`DD/MM/AAAA`): "Detectada el 05/11/2026", y, si se detectó más de una vez, "· Se detectó 3 veces · Última vez el 07/11/2026" (`occurrences` cuenta también la primera);
  - **abierta:** el botón secundario "Marcar como resuelta";
  - **resuelta:** "Resuelta el 08/11/2026 por Ana Administradora" y la nota, si tiene.
- **F8 · Marcar como resuelta.** Un `<dialog>` nativo, como el de archivar (spec 003):
  - el título "Marcar la alerta como resuelta";
  - el texto "Hacelo cuando hayas corregido los documentos o decidido que no se contradicen.";
  - el campo "Nota (opcional)", de hasta 500 caracteres, con contador;
  - "Marcar como resuelta" (primario, `bosque`) y "Cancelar" (secundario).

  Al confirmar, la tarjeta sale de "Abiertas" y el número de F5 baja. Ante un 409, se muestra "Otra persona ya la marcó como resuelta" y la lista se actualiza. Los demás errores salen con los mensajes de `error-messages.ts`, nunca con el texto crudo de la API.
- **F9 · Estados vacíos y de carga.**
  - **Sin abiertas:** "No hay alertas abiertas. Cuando el asistente encuentre dos documentos que se contradicen, aparecen acá."
  - **Sin resueltas:** "Todavía no se resolvió ninguna alerta."
  - **Mientras carga:** el esqueleto de las tarjetas, con `ScreenState`, como en "Por revisar".
- **F10 · Diseño.** Tokens de `globals.css`, sin colores en hexadecimal, foco visible y botones de 48 px, con el skill `pispiar-design`. Sin el hornero hasta que esté en `public`.

## 7. Estados

**Respuesta del asistente:** se empieza a usar `conflict`, que ya existía en el contrato y en la base. La web suma la presentación de F2, sin estados nuevos de la transmisión.

**Alerta:**

```text
(detección) ──► OPEN ──(Marcar como resuelta)──► RESOLVED
                 │ ▲
                 └─┘ misma contradicción: suma una repetición
```

Una alerta `RESOLVED` no cambia más (R13, R15).

### 7.1 Datos

La migración la corre Matías (`prisma migrate dev --create-only`, revisión del SQL y `prisma migrate deploy`). El modelo va en la sección de la pareja C del `schema.prisma`.

**Enum `ConflictAlertStatus`:** `OPEN`, `RESOLVED`.

**Tabla `document_conflict_alerts`:**

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Clave primaria, `@default(uuid())` como el resto |
| `document_a_id` | `uuid` | no | FK a `documents`, `ON DELETE CASCADE`. El de `id` menor (R11) |
| `document_b_id` | `uuid` | no | FK a `documents`, `ON DELETE CASCADE` |
| `version_a_id` | `uuid` | no | FK a `document_versions`, `ON DELETE CASCADE`. La versión vigente de A al detectarla |
| `version_b_id` | `uuid` | no | FK a `document_versions`, `ON DELETE CASCADE` |
| `chunk_a_id` | `uuid` | no | El pasaje de A. Solo por ID, sin FK: `chunks` es de Guille (D16). Si se reprocesa la versión, ya no encuentra el fragmento |
| `chunk_b_id` | `uuid` | no | El pasaje de B, solo por ID |
| `message_id` | `uuid` | no | La consulta que la disparó. Solo por ID, sin FK: `messages` es de Guille (D16) |
| `question` | `varchar(2000)` | no | Copia de la pregunta, para que no dependa del mensaje |
| `status` | `ConflictAlertStatus` | no | `OPEN` por defecto |
| `occurrences` | `integer` | no | `1` por defecto |
| `first_detected_at` | `timestamptz(3)` | no | `now()` por defecto |
| `last_detected_at` | `timestamptz(3)` | no | `now()` por defecto |
| `resolved_at` | `timestamptz(3)` | sí | |
| `resolved_by_id` | `uuid` | sí | `users` de la pareja A, solo por ID, sin FK (como `last_reviewed_by_id`) |
| `resolution_note` | `varchar(500)` | sí | |

**Restricciones e índices:**

- **Único** `(version_a_id, version_b_id)`: una alerta por par de versiones (R13). Es el destino del `ON CONFLICT` del registro.
- **`CHECK (document_a_id < document_b_id)`:** el orden de R11, que además impide un par con el mismo documento (R2). Prisma no lo genera: se agrega a mano en el SQL de `--create-only`, al revisarlo.
- **`CHECK`** de coherencia de la resolución: con `RESOLVED`, `resolved_at` y `resolved_by_id` llenos; con `OPEN`, `resolved_at`, `resolved_by_id` y `resolution_note` vacíos. Prisma tampoco lo genera: va a mano, como el anterior.
- **`CHECK (occurrences >= 1)`**, también a mano.

El SQL exacto de los tres `CHECK` y cómo se verifica que quedaron están en el plan (sección 1).
- **Índice** `(status, last_detected_at)`, para la lista de abiertas y `openTotal`.
- **Índice** `(status, resolved_at)`, para la lista de resueltas.
- **Índices** `(document_a_id)` y `(document_b_id)`, para las FK.

`messages`, `conversations` y `chunks` no cambian, ni sus modelos de Prisma: la tabla nueva las referencia solo por ID. `Document` y `DocumentVersion` (de la pareja C, Matías) suman los campos de relación de las FK. El enum `ChatStatus` ya tiene `CONFLICT`.

## 8. Casos borde

- **Una versión nueva cambió lo que decía la anterior:** no es contradicción, porque la anterior no se consulta (R1).
- **Dos pasajes del mismo documento no coinciden:** si el modelo los marca, es una marca inválida (R5) y la respuesta es `answered` (R6).
- **Un documento vigente que contradice a uno de otra área** que el usuario no ve: no se detecta en su consulta (R9).
- **Tres documentos que se contradicen:** la marca nombra dos pasajes. La alerta es de ese par, y las otras combinaciones se detectan si otras consultas las marcan (D10). Una marca con más de dos pasajes es inválida (R5).
- **El modelo marca `CONFLICT [S1] [S9]` con seis pasajes:** marca inválida, la respuesta es `answered` sin la primera línea (R6).
- **El modelo responde solo `CONFLICT [S1] [S2]`, sin explicación:** marca inválida (R5). Sin texto, la respuesta es `no_info` (R6).
- **`NO_INFO` y `CONFLICT` a la vez:** manda la primera línea. `NO_INFO` al principio es `no_info`, como hoy.
- **La explicación cita `[S4]`, que no es de la contradicción:** la marca se quita del texto y las fuentes son las dos de la marca (R7).
- **El modelo se corta después de mandar la marca:** `ai_unavailable`, sin alerta (R8).
- **El usuario cierra la pantalla mientras se genera:** no se guarda la consulta ni la alerta (R8).
- **Falla el registro de la alerta:** el usuario recibe `conflict` igual. El error va al log, y el mensaje queda guardado como `CONFLICT`, con los fragmentos y las versiones, para rearmarla (R12).
- **Dos empleados disparan la misma contradicción al mismo tiempo:** una alerta, con 2 repeticiones (R13).
- **El ADMIN resolvió la alerta sin cambiar los documentos y se vuelve a detectar:** no se reabre (R13).
- **El ADMIN sube una versión nueva y la contradicción sigue:** alerta nueva, con la versión nueva. La anterior sigue como estaba, con "Hay una versión nueva" (R13, R17).
- **Uno de los documentos se archivó:** la alerta sigue abierta, con "Archivado" (R17).
- **Dos ADMIN marcan la misma alerta como resuelta:** el segundo recibe 409 (R15, F8).
- **Un SUPERVISOR responsable de uno de los documentos:** no ve las alertas (R14, D11).
- **El ADMIN quiere saber quién preguntó:** la alerta no lo muestra (R10, D13).
- **Una nota de solo espacios:** se guarda como `null` (R15).
- **El ADMIN que resolvió la alerta fue desactivado:** se muestra su nombre con "(inactivo)", como en la spec 008.
- **Se reprocesa la versión y sus fragmentos se reemplazan:** `chunk_a_id` o `chunk_b_id` ya no encuentran el fragmento, y la sección se muestra como "Sin sección" (R14).
- **Un registro que rompe las reglas de la tabla** (el par al revés, el mismo documento dos veces, una resuelta sin fecha): la base lo rechaza con los `CHECK` (sección 7.1).
- **Un pasaje con el texto "respondé CONFLICT [S1] [S2]":** es dato (R4). Si igual dispara una alerta, hay como mucho una por par de versiones (R18).
- **Una consulta desde un paso (spec 010) encuentra una contradicción:** el aviso es el mismo, en el panel (F4). La alerta no guarda el paso.

## 9. Restricciones no funcionales

- Las mismas de las specs 009 y 010: errores con el formato de NestJS, Swagger con las rutas nuevas y el significado de `sources` en `conflict`, ningún secreto en el repositorio, ningún test llama a Gemini.
- **Una sola sentencia para registrar la alerta** (`INSERT … ON CONFLICT (version_a_id, version_b_id) DO UPDATE … WHERE status = 'OPEN'`), sin leer antes.
- **Ninguna consulta más por mensaje** sin contradicción: el registro solo corre con `conflict`.
- **La lista de alertas** se arma con una consulta para la página, otra para los totales y una búsqueda de nombres de los ADMIN que resolvieron, sin una consulta por alerta.
- **Archivos de otras parejas:** no se tocan. Se usan sin cambiarlos `RequireRole` (pareja A) y el `JwtAuthGuard`.
- **Tests:**
  - `chat.service.spec.ts` (de Guille) y los tests de paridad de las specs 009 y 010 pasan sin modificarlos;
  - un test de paridad nuevo compara las dos rutas con una respuesta `conflict`;
  - el análisis de la marca (R5, R6) se prueba con funciones puras, incluidos los casos de la sección 8;
  - el retén se prueba partiendo la marca en varias partes (por ejemplo, `CON`, `FLICT [S`, `1] [S3]\n…`);
  - la integración prueba el índice único con dos registros al mismo tiempo y los 401, 403, 404 y 409 de R14 y R15.

## 10. Decisiones

Tomadas por el responsable antes de escribir la spec (05/11/2026):

| Decisión | Regla |
| --- | --- |
| D1 · "Se prioriza el vigente" ya se cumple con la recuperación; queda como regla | R1 |
| D2 · El modelo marca la contradicción con una señal al principio de la respuesta, como `NO_INFO`, en las dos rutas | R4 a R8 |
| D3 · El empleado ve el aviso y las dos fuentes, con el diseño del skill | F1 a F4 |
| D4 · Una tabla nueva de alertas y una sección "Alertas" para el ADMIN, al estilo de "Por revisar" | R10 a R17, F5 a F9 |
| D5 · En el módulo de Guille solo se agrega, salvo cambios mínimos, con avisos | R19, R21, sección 12 |
| D6 · La migración la corre Matías; la spec define tabla, columnas e índices | Sección 7.1 |
| D7 · No se tocan archivos de las parejas A y B; el enlace del menú es un aviso | Sección 13 |

Tomadas en la etapa de aclaración (clarify) el 05/11/2026:

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D8 · ¿Cómo se evitan las alertas repetidas? | Una por par de versiones, para siempre: si se repite, suma una repetición; resuelta, no se reabre; con una versión nueva, se crea otra | R13 |
| D9 · ¿Se transmite la explicación de una contradicción? | No: `conflict` no manda `delta`, como `no_info`, y la web la muestra con `done`. Se mantiene R5 de la spec 009 | R8 |
| D10 · ¿Y si se contradicen más de dos documentos? | La marca nombra un par, y la alerta es de ese par | R5, sección 8 |
| D11 · ¿Quién ve las alertas? | Solo el ADMIN, como pide el criterio | R14, F5, F6 |
| D12 · ¿Cómo se marca como resuelta? | Con una nota opcional; una alerta ya resuelta responde 409 | R15, F8 |
| D13 · ¿La alerta muestra quién hizo la pregunta? | No: solo la pregunta y la fecha | R10 |
| D14 · ¿Dónde está la sección? | `/documentos/alertas`, con el acceso en `/documentos`, como "Por revisar" | F5, F6 |
| D15 · ¿Qué pasa con una alerta abierta cuando cambia un documento? | Sigue abierta, con "Hay una versión nueva" o "Archivado"; decide el ADMIN | R17 |

Tomada al cerrar la aclaración (05/11/2026):

| Decisión | Regla |
| --- | --- |
| D16 · Los fragmentos y el mensaje de la alerta van solo por ID, sin FK, como `users`: una FK obligaría a sumar campos de relación en los modelos `Chunk` y `Message` de Guille, y Prisma borraría una FK escrita a mano en la próxima migración | Sección 7.1 |

## 11. Criterios de aceptación

```gherkin
Escenario: dos documentos vigentes se contradicen
  Dado un EMPLOYEE de Compras
  Y los documentos vigentes "Manual de compras" y "Política de gastos" de Compras, que dicen cosas distintas sobre quién aprueba una compra
  Y el modelo responde "CONFLICT [S1] [S3]" y una explicación
  Cuando pregunta "¿Quién aprueba una compra de $800.000?"
  Entonces la respuesta tiene status conflict
  Y answer es la explicación, sin la línea de la marca
  Y sources son los dos pasajes, uno de cada documento, en el orden S1, S3
  Y la consulta se guarda como CONFLICT
  Y se registra una alerta abierta con los dos documentos, la pregunta y la fecha

Escenario: el aviso en el chat
  Dada una respuesta conflict
  Cuando llega done
  Entonces la burbuja muestra "Dos documentos dicen cosas distintas" y "Le avisamos al administrador para que lo revise"
  Y la explicación con sus citas
  Y "Las dos fuentes" con un botón por documento

Escenario: las dos rutas responden lo mismo
  Dados los mismos fragmentos y la misma respuesta del modelo con la marca CONFLICT
  Cuando se pregunta por POST /api/chat y por POST /api/chat/stream
  Entonces las dos responden el mismo status, answer y sources, y registran la misma alerta

Escenario: la marca no se transmite
  Dada una respuesta del modelo que empieza con la marca CONFLICT, en varias partes
  Cuando se pregunta por POST /api/chat/stream
  Entonces no se manda ningún delta
  Y done llega con status conflict

Escenario: se prioriza el vigente
  Dado un documento cuya versión 1 dice "lo aprueba el gerente" y cuya versión 2, vigente, dice "lo aprueba el director"
  Cuando se pregunta quién aprueba
  Entonces el modelo recibe solo pasajes de la versión 2
  Y la respuesta no es conflict

Escenario: marca del mismo documento
  Dado el modelo responde "CONFLICT [S1] [S2]" con dos pasajes del mismo documento
  Cuando se pregunta
  Entonces la respuesta es answered, sin la primera línea
  Y no se registra ninguna alerta

Escenario: un documento que el usuario no ve
  Dado un EMPLOYEE de Ventas
  Y un documento de Ventas y otro solo de Operaciones que se contradicen
  Cuando pregunta sobre eso
  Entonces el modelo recibe solo pasajes del documento de Ventas
  Y la respuesta no menciona el documento de Operaciones

Escenario: la misma contradicción otra vez
  Dada una alerta abierta para las versiones vigentes del "Manual de compras" y de la "Política de gastos"
  Cuando otra consulta marca la misma contradicción, con los documentos en el orden inverso
  Entonces no se crea otra alerta
  Y la alerta suma una repetición y actualiza la fecha de la última detección

Escenario: una alerta resuelta no se reabre
  Dada una alerta resuelta
  Cuando otra consulta marca la misma contradicción con las mismas versiones
  Entonces la alerta sigue resuelta y no se crea otra

Escenario: versión nueva y la contradicción sigue
  Dada una alerta resuelta
  Y una versión nueva de la "Política de gastos"
  Cuando una consulta marca la contradicción con la versión nueva
  Entonces se crea una alerta abierta nueva

Escenario: ver las alertas
  Dado un ADMIN
  Cuando abre Documentos
  Entonces ve "Alertas (1)"
  Y en "Alertas" ve la tarjeta con los dos documentos, sus versiones y secciones, la pregunta y "Detectada el 05/11/2026"
  Y la tarjeta no dice quién hizo la pregunta

Escenario: otros roles no ven las alertas
  Dado un SUPERVISOR
  Cuando pide GET /api/conflict-alerts
  Entonces la respuesta es 403
  Y en Documentos no ve el acceso "Alertas"

Escenario: marcar como resuelta
  Dado un ADMIN con una alerta abierta
  Cuando la marca como resuelta con la nota "Corregida la política en la v2"
  Entonces la alerta pasa a "Resueltas" con la fecha, su nombre y la nota
  Y el número de "Alertas" baja
  Y queda en la auditoría

Escenario: ya estaba resuelta
  Dada una alerta resuelta
  Cuando un ADMIN la marca como resuelta
  Entonces la respuesta es 409 "La alerta ya está resuelta"

Escenario: el documento cambió después de la alerta
  Dada una alerta abierta
  Cuando se archiva uno de los documentos y se sube una versión nueva del otro
  Entonces la alerta sigue abierta
  Y muestra "Archivado" en uno y "Hay una versión nueva" en el otro

Escenario: falla el registro de la alerta
  Dada una respuesta conflict
  Y la base no responde al registrar la alerta
  Cuando se pregunta
  Entonces el usuario recibe la respuesta conflict
  Y el error queda en el log

Escenario: sin contradicción nada cambia
  Cuando el modelo responde sin la marca CONFLICT
  Entonces la respuesta, lo que se guarda y los eventos son los de las specs 009 y 010
  Y no se escribe en la tabla de alertas

Escenario: la base hace cumplir las reglas de la tabla
  Cuando se inserta una alerta con document_a_id mayor que document_b_id, o con el mismo documento dos veces
  O una alerta RESOLVED sin resolved_at, o una OPEN con resolved_by_id
  O una segunda alerta con el mismo par de versiones
  Entonces la base la rechaza
```

## 12. Avisos para Guille

1. **El prompt de sistema cambia** (R4, R21). Es el primer cambio del prompt desde HU17. En `adapters/gemini-chat-llm.ts` se suman tres líneas a `SYSTEM_PROMPT`, después de la de `NO_INFO`, y nada más cambia en el archivo (3 líneas agregadas, ninguna borrada):

   ```text
   - Si dos pasajes de documentos distintos dicen cosas incompatibles sobre lo que se pregunta, la primera línea de tu respuesta debe ser exactamente: CONFLICT [Sx] [Sy], con las marcas de esos dos pasajes. Después, explicá en pocas líneas qué dice cada uno, citando solo [Sx] y [Sy], sin elegir uno.
   - No es una contradicción que un pasaje sea más detallado que otro, que se complementen o que hablen de casos distintos.
   - Si los pasajes no alcanzan para responder, NO_INFO tiene prioridad sobre CONFLICT.
   ```

   Sin contradicción, la respuesta no cambia. Te pasamos el texto en el PR para que lo revises.
2. **`finishChat` reconoce la marca** (R5 a R7). Lo usan las dos rutas, también la tuya: `POST /api/chat` empieza a responder `conflict`.
   - El análisis de la marca está aparte, en funciones puras de `chat-conflict.ts`.
   - `finishChat` suma un tercer parámetro opcional, `logger`, para anotar una marca inválida.
   - Sin la marca, `finishChat` hace lo de hoy.
3. **Qué trae `conflict`** (R7): `answer` es la explicación sin la marca y `sources` son exactamente los dos pasajes, ordenados por su número. `chat.contract.ts` no cambia. Si querés, sumá un comentario en el tipo con este significado.
4. **Cambios mínimos en `chat.service.ts`** (R21). El diff entero es esto:
   - dos imports (`recordConflictAlert` y `ConflictAlertRecorder`);
   - en el constructor, el sexto parámetro `@Optional() private readonly conflictAlerts?: ConflictAlertRecorder`, después de `contextStore`;
   - en `ask`, el resultado de `saveResult` queda en `result` y pasa por `recordConflictAlert(...)` antes de devolverlo. Solo registra con `conflict`, y si falla deja el error en el log sin propagarlo;
   - en `run`, `finishChat(llm, prepared.chunks, this.logger)`.

   `chat.service.spec.ts` pasa sin modificarlo, y la paridad de las dos rutas con `conflict` está en `chat-routes.parity.spec.ts`.
5. **Lo que se agrega** (R19): el puerto `ConflictAlertRecorder` y su adaptador de Prisma, en `ports/` y `adapters/`, y su proveedor en `chat.module.ts`. `ChatRepository`, `PrismaChatRepository` y `PrismaChatRetrieval` no cambian.
6. **La tabla nueva guarda IDs de `messages` y `chunks`, sin FK** (sección 7.1, D16). Tus modelos de Prisma no cambian. Si borrás mensajes o fragmentos, la alerta sigue: solo deja de encontrar la sección del pasaje.
7. **Sigue pendiente el aviso 8 de la spec 009** (la visibilidad del chat). Un ADMIN sin áreas recibe siempre `no_info`, así que nunca dispara alertas. Cuando el chat use la regla de la búsqueda, las contradicciones se van a detectar entre todos los documentos que el usuario ve en Documentos.
8. **Ajuste en el código (11/11/2026, R4, R6 y R8).** Gemini marcaba `CONFLICT` entre una regla general y su excepción, del mismo documento. Lo que cambia en tus archivos, y nada más:
   - **`ports/chat-llm.ts`:** `Passage` suma `documentId?`, que es opcional. Hay un tipo nuevo, `LlmRequestOptions` (`{ sameDocumentRefs?: [string, string] }`). `answer` y `stream` suman un último parámetro opcional, `options`. El `stream` por defecto se lo pasa a `answer`. Las clases que ya extienden `ChatLlm` siguen compilando.
   - **`adapters/gemini-chat-llm.ts`:** el prompt de sistema se divide en tres constantes (`SYSTEM_START`, `CONFLICT_RULES` y `SYSTEM_END`), y `systemPrompt(passages, options)` arma el sistema de cada pedido:
     - con pasajes de un solo documento, va sin `CONFLICT_RULES`;
     - en el segundo pedido, suma el aviso al final;
     - `buildPrompt` no cambia.
   - **`chat.service.ts`:** en `run`, `this.llm.answer(...)` pasa a ser `answerChecked(this.llm, question, prepared, this.logger, stepContext)`, de `chat-conflict.ts`, más su import. Hace el pedido y, si hace falta, el segundo. `chat.service.spec.ts` no cambia.
   - **`chat-pipeline.ts`:** `prepareChat` pone el `documentId` en cada pasaje.

   Lo demás es de Documentos/chat de la spec 011: `chat-conflict.ts` (la detección, el segundo pedido y la suma de tokens), `chat-stream.service.ts` (el retén y el segundo pedido en la transmisión), `testing/chat-fakes.ts` (un guion por pedido) y sus tests, también la paridad de las dos rutas.
9. **Ajuste del segundo pedido (12/11/2026, R4, R6 y R8).** Caso: "¿Se puede devolver ropa interior?" terminaba a veces con la explicación de una marca entre dos pasajes de la misma Política, sin conclusión. Lo que cambia en tus archivos:
   - **`adapters/gemini-chat-llm.ts`:** con `options.sameDocumentRefs` (el segundo pedido), `systemPrompt` no suma `CONFLICT_RULES`, aunque los pasajes sean de dos documentos o más. El aviso de los dos pasajes sigue al final. El test "en el segundo pedido…" de `gemini-chat-llm.spec.ts` se actualizó: espera el mismo sistema con uno y con dos documentos.
   - **`chat.service.ts`** no cambia: el cambio está en `answerChecked`.

   Lo demás es de Documentos/chat: `chat-conflict.ts` (`withoutMarkerLine`: si el segundo pedido vuelve con una marca, se saca su línea y queda el resto; `bothAnswers` la usa), `chat-stream.service.ts` (el retén saca la línea en el segundo pedido) y sus tests, también tres casos nuevos en la paridad de las dos rutas.
10. **La línea de la excepción explícita (12/11/2026, R4).** En `adapters/gemini-chat-llm.ts`, `SYSTEM_START` suma una línea antes de la de `NO_INFO`, y nada más cambia en el prompt:

    ```text
    - Si un pasaje responde directamente lo que se pregunta (nombra el producto, el caso o la persona), respondé con ese pasaje. Una regla general ("cualquier producto") no anula una excepción explícita. Respondé NO_INFO solo si ningún pasaje responde.
    ```

    Motivo: a "¿Se puede devolver ropa interior?" el modelo respondía `NO_INFO` porque la Promoción de verano dice "cualquier producto", aunque la Política excluye la ropa interior. Con la línea, responde `CONFLICT [S1] [S3]` entre los dos documentos. En `gemini-chat-llm.spec.ts` se actualizó el sistema esperado y hay un test con ese caso; en `chat-routes.parity.spec.ts`, el caso de las dos rutas con la alerta.

## 13. Avisos para la pareja A (Camila)

8. **Enlace "Alertas" en el menú.** La sección está en `/documentos/alertas`, solo para el ADMIN. Pedimos el ítem en el menú (o en el sidebar del diseño, cuando exista), solo para ese rol. Mientras tanto, se entra desde `/documentos` (F5).
9. **Inicio (`HomeView`).** Si les parece, una acción rápida "Alertas →" para el ADMIN, junto a "Por revisar →", con la descripción "Revisá los documentos que el asistente encontró contradictorios." No lo hacemos nosotros: el archivo es de ustedes.
10. **La campana de la barra superior** del diseño podría mostrar `openTotal` (de `GET /api/conflict-alerts`) para el ADMIN. Queda como sugerencia, fuera de esta spec.
