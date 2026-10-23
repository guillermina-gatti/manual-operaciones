# Tareas 002 · Pantallas de documentos

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Matías Fauda (pareja C)
- **Estado (23/10/2026):** ninguna tarea empezada. T01 a T26 se pueden hacer ya; T27 a T30 están **bloqueadas** por piezas de la pareja A; T31 es la verificación final.

Convenciones:

- Una tarea = un commit. Las rutas son relativas a `apps/web/`, salvo que digan otra cosa.
- F1 a F14 son reglas de la spec; E1 a E12, sus escenarios (tabla al principio del plan); D1 a D7, las decisiones del plan; Q1, Q2 y Q6, las preguntas que siguen abiertas con la pareja A (plan, sección 9).
- "Test primero" quiere decir: se escribe el test, se corre y falla; se hace el cambio y pasa.
- Tests de componentes: `pnpm --filter web test <patrón>`. Tests de Playwright: `pnpm --filter web test:e2e <patrón>`.
- Antes de escribir código que use una API de Next, leer la guía correspondiente en `node_modules/next/dist/docs/` (`AGENTS.md`).
- Ningún componente importa de una ruta interna de `lib/session`, `lib/api` o `lib/directory`: siempre del `index.ts` de la carpeta (plan, sección 3).

---

## Configuración

### T01 · Instalar y configurar Vitest con Testing Library

- **Qué hace:** instala las dependencias de desarrollo para los tests de componentes, configura Vitest con jsdom y el alias `@/*` (con la opción `resolve.tsconfigPaths` de Vite), y deja un test de ejemplo que corre.
- **Cubre:** plan secciones 6 y 7.1.
- **Archivos:** `package.json` (dependencias y script `test`), `pnpm-lock.yaml` (en la raíz), `vitest.config.mts`, `tests/setup.ts` (importa `@testing-library/jest-dom/vitest` y limpia el DOM después de cada test), `tests/example.test.tsx`.
- **Verificación:**
  1. `pnpm --filter web add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom`.
  2. `tests/example.test.tsx` tiene dos tests: uno renderiza un `<button>` con texto y comprueba con `getByRole('button')` y `toBeInTheDocument()` que jsdom, React y jest-dom funcionan; el otro importa `@/next.config` y comprueba que el alias se resuelve. Se escriben antes de la configuración: sin `vitest.config.mts` fallan (`document is not defined` y `Failed to resolve import "@/next.config"`).
  3. `pnpm --filter web test` pasa, y `pnpm --filter web lint` y `pnpm --filter web build` siguen pasando.
- **Depende de:** —
- **Commit:** `chore(deps): configurar Vitest y Testing Library en web`

## Base

### T02 · Rewrite de `/api` al backend

- **Qué hace:** agrega en `next.config.ts` el rewrite de `/api/:path*` a `${API_URL}/api/:path*`, con `http://localhost:3000` por defecto en desarrollo y error al arrancar (y al hacer el build) en producción si falta `API_URL`. Documenta en el README cómo se configura, con la convención de puertos que ya usa: API en el 3000 y web en el 3001.
- **Cubre:** plan sección 2; spec sección 9 (ningún secreto en el frontend); D3.
- **Archivos:** `next.config.ts`, `lib/config/api-url.ts` (función `resolveApiUrl(env)`, para poder probarla), `.env.example` (nuevo, con `API_URL=` sin valor), `.gitignore` (agrega `!.env.example`, porque ignora `.env*`), `README.md` de la raíz (una nota sobre el rewrite y `API_URL`).
- **Verificación:**
  1. Test primero, `tests/lib/config/api-url.test.ts`: con `API_URL` definida devuelve ese valor sin la barra final; sin `API_URL` (o vacía) en desarrollo devuelve `http://localhost:3000`; sin `API_URL` en producción lanza un error; el nombre de la variable no empieza con `NEXT_PUBLIC_`.
  2. Manual: Docker levantado, API con `pnpm dev:api`, web con `pnpm --filter web dev -p 3001`; `curl -i http://localhost:3001/api/documents` responde **401** con `x-powered-by: Express` (lo devuelve la API a través del rewrite, porque faltan las cabeceras), y con `x-user-id` y `x-user-role` responde 200.
  3. `pnpm --filter web build` sin `API_URL` falla con "Falta API_URL"; con `API_URL=http://localhost:3000 pnpm --filter web build` pasa y no deja `localhost:3000` en `.next/static` (`grep -rl "localhost:3000" .next/static` vacío).
- **Depende de:** T01
- **Nota:** toca archivos compartidos (README.md): avisar al equipo antes de mergear. Desde esta tarea, `pnpm build` de la raíz necesita `API_URL` definida para la web.
- **Commit:** `feat(web): reenviar /api al backend con un rewrite`

### T03 · `ApiError` y cliente HTTP

- **Qué hace:** crea `ApiError` y `createApiClient(getAuthHeaders)`, que pide a URLs relativas de `/api`, agrega las cabeceras de autenticación que recibe y traduce las respuestas de error de Nest. El cliente recibe la función de cabeceras por parámetro, así no depende de la sesión (que se conecta en T05).
- **Cubre:** plan secciones 2 y 3.2; F3 (la forma del error); F8 y la spec sección 9 (todo pasa por la API, nunca por S3).
- **Archivos:** `lib/api/api-error.ts`, `lib/api/client.ts`, `lib/api/index.ts`.
- **Verificación:** test primero, `tests/lib/api/client.test.ts`, con `fetch` simulado (`vi.stubGlobal`):
  - pide a `/api/...` (relativa) y suma las cabeceras de `getAuthHeaders()`;
  - un 2xx devuelve el JSON;
  - un error con `message` como texto y como arreglo da `ApiError` con `status` y `messages`;
  - un 409 conserva `existingDocumentId`;
  - un fallo de red y una respuesta que no es JSON dan `status: 0`;
  - con `FormData` no fija `Content-Type`.
- **Depende de:** T01
- **Commit:** `feat(web): agregar el cliente HTTP de la API`

### T04 · Mensajes de los errores de la API

- **Qué hace:** crea `describeApiError(error, context)`, que traduce cada `ApiError` a un mensaje en español y, en la carga, asigna los 400 al campo que nombran.
- **Cubre:** F3, F9; plan sección 5.1.
- **Archivos:** `lib/api/error-messages.ts`, `lib/api/index.ts`.
- **Verificación:** test primero, `tests/lib/api/error-messages.test.ts`, una fila por código de la tabla 5.1:
  - 400 con `"title must be shorter than or equal to 200 characters"` → error en `title`; `"ownerId: el responsable no existe"` → error en `ownerId`; un texto sin campo → aviso general;
  - 401, 403, 404 ("No se encontró el documento", igual en `detail` y `download`), 409 (mensaje y `existingDocumentId`), 413 y 415 (en `file`), 503 ("Probá de nuevo en unos minutos"), 500 y `status: 0`;
  - ningún mensaje devuelto contiene el texto en inglés de la API.
- **Depende de:** T03
- **Commit:** `feat(web): traducir los errores de la API a mensajes claros`

### T05 · Sesión simulada

- **Qué hace:** crea la interfaz de la sesión (`SessionUser`, `useSession`, `getAuthHeaders`) y su simulación con `localStorage` (`sim-session`), que queda desactivada en producción (nunca hay usuario ni cabeceras). Crea los datos fijos de usuarios y áreas, con los mismos UUID que la API. Conecta la sesión al cliente HTTP y al `layout.tsx`, que pasa a `lang="es"` y a un título propio.
- **Cubre:** plan secciones 3.1 y 3.3 (fixtures); D2; base de F1 y F6.
- **Archivos:** `lib/session/session.ts`, `lib/session/simulated-session.tsx`, `lib/session/index.ts`, `lib/directory/fixtures.ts`, `lib/api/index.ts` (exporta `apiClient = createApiClient(getAuthHeaders)`), `app/layout.tsx`.
- **Verificación:** test primero, `tests/lib/session/simulated-session.test.tsx`:
  - **no funciona en producción:** con `vi.stubEnv('NODE_ENV', 'production')` y un `sim-session` válido guardado, `useSession()` da `{ user: null, status: 'disabled' }`, `getAuthHeaders()` da `{}` y `apiClient` pide sin `x-user-id` ni `x-user-role`. No se lanza un error, porque `next build` corre en modo producción y se rompería; `API_URL=http://localhost:3000 pnpm --filter web build` tiene que seguir pasando;
  - sin `sim-session`, `useSession()` da `user: null` y `getAuthHeaders()` da `{}`;
  - con el ID del EMPLOYEE de Ventas, da ese usuario y `{ 'x-user-id', 'x-user-role': 'EMPLOYEE' }`;
  - un ID que no está en los fixtures se trata como sin sesión;
  - `tests/lib/directory/fixtures.test.ts`: los UUID son los de `apps/api/src/documents/adapters/fixtures.ts` (copiados como texto en el test, con un comentario que apunta al archivo de la API).
- **Depende de:** T03
- **Nota:** toca archivos compartidos (README.md, .env.example de la raíz, app/layout.tsx): avisar al equipo antes de mergear.
- **Commit:** `feat(web): agregar la sesión simulada`

### T06 · Selector de usuario de prueba

- **Qué hace:** agrega `DevSessionSwitcher`, que permite elegir con qué usuario simulado navegar y no se renderiza en producción. Sin sesión, las pantallas muestran "Elegí un usuario de prueba".
- **Cubre:** plan sección 3.1; D2.
- **Archivos:** `components/session/DevSessionSwitcher.tsx`, `app/layout.tsx`.
- **Verificación:** test primero, `tests/components/session/DevSessionSwitcher.test.tsx`: lista los usuarios de los fixtures con su rol; elegir uno escribe `sim-session` y actualiza `useSession()`; con `NODE_ENV=production` no renderiza nada.
- **Depende de:** T05
- **Nota:** toca archivos compartidos (README.md, .env.example de la raíz, app/layout.tsx): avisar al equipo antes de mergear.
- **Commit:** `feat(web): agregar el selector de usuario de prueba`

### T07 · Directorios simulados de usuarios y áreas

- **Qué hace:** crea las interfaces `UsersDirectory` (`listOwnerCandidates`, `getNames`) y `AreasDirectory` (`listAreas`), sus simulaciones sobre los fixtures (con una demora corta) y la función pura `filterOwnerCandidates`.
- **Cubre:** F11; plan secciones 1 y 3.3; Q1 y Q2 (simulación mientras tanto); caso borde "áreas sin usuarios".
- **Archivos:** `lib/directory/users-directory.ts`, `lib/directory/areas-directory.ts`, `lib/directory/fake-users-directory.ts`, `lib/directory/fake-areas-directory.ts`, `lib/directory/index.ts`, `lib/documents/owner-candidates.ts`.
- **Verificación:** test primero:
  - `tests/lib/documents/owner-candidates.test.ts`: **E3** (con Ventas no aparece el EMPLOYEE de Operaciones y sí el ADMIN); con Ventas y Operaciones aparecen los dos; con un área sin usuarios, solo los ADMIN.
  - `tests/lib/directory/fake-directories.test.ts`: `listAreas` devuelve Ventas y Operaciones; `getNames` devuelve los nombres pedidos y omite los IDs desconocidos.
- **Depende de:** T05
- **Commit:** `feat(web): agregar directorios simulados de usuarios y áreas`

### T08 · Hook de pedidos `useApiResource`

- **Qué hace:** crea el hook que pide un recurso y expone `status` (`loading`, `success`, `error`), `data`, `error` y `reload`. Ignora la respuesta de un pedido viejo si cambió la clave (por ejemplo, la página).
- **Cubre:** plan sección 5.2 (estados de pantalla); D7.
- **Archivos:** `lib/api/use-api-resource.ts`, `lib/api/index.ts`.
- **Verificación:** test primero, `tests/lib/api/use-api-resource.test.tsx` con `renderHook`: empieza en `loading`; pasa a `success` con los datos; un `ApiError` pasa a `error`; `reload` vuelve a pedir; si la clave cambia antes de que llegue la primera respuesta, solo queda la segunda.
- **Depende de:** T03
- **Commit:** `feat(web): agregar el hook de pedidos a la API`

### T09 · Llamadas a `/api/documents`

- **Qué hace:** define los tipos de la respuesta (copiados de `apps/api/src/documents/dto/document.response.ts`) y las cuatro llamadas: `listDocuments`, `getDocument`, `getDownloadUrl` y `uploadDocument`.
- **Cubre:** plan sección 2; F7 (`limit=20`), F8.
- **Archivos:** `lib/api/documents.ts`, `lib/api/index.ts`.
- **Verificación:** test primero, `tests/lib/api/documents.test.ts`, con el cliente simulado:
  - `listDocuments(2)` pide `/api/documents?page=2&limit=20`;
  - `getDocument` y `getDownloadUrl` arman la URL con el `id`;
  - `uploadDocument` manda `FormData` con `file`, `title`, `ownerId`, `reviewDate`, **un `areaIds` por área** y `description` solo si no está vacía.
- **Depende de:** T03
- **Commit:** `feat(documents): agregar las llamadas a la API de documentos`

### T10 · Componentes base de la interfaz

- **Qué hace:** crea `ScreenState` (cargando, vacío y error con "Reintentar"), `FieldError` y `Button`, con controles de al menos 44 px de alto.
- **Cubre:** spec sección 7; F10; plan sección 5.2.
- **Archivos:** `components/ui/ScreenState.tsx`, `components/ui/FieldError.tsx`, `components/ui/Button.tsx`.
- **Verificación:** test primero, `tests/components/ui/ui.test.tsx`: `ScreenState` en error muestra el mensaje con `role="alert"` y "Reintentar" llama a `onRetry`; en cargando tiene `aria-busy`; `FieldError` queda asociado al campo con `aria-describedby`; `Button` deshabilitado no dispara `onClick`.
- **Depende de:** T01
- **Commit:** `feat(web): agregar los componentes base de la interfaz`

### T11 · Fechas y paginación

- **Qué hace:** crea las funciones puras `formatReviewDate`, `formatCreatedAt`, `pageNumbers` y `parsePageParam`.
- **Cubre:** F7; plan sección 1.
- **Archivos:** `lib/documents/format.ts`, `lib/documents/pagination.ts`.
- **Verificación:** test primero, `tests/lib/documents/format.test.ts` y `pagination.test.ts`:
  - `formatReviewDate('2027-03-01')` da `01/03/2027` aunque la zona del proceso sea `America/Argentina/Buenos_Aires` (no se corre al 28/02);
  - `formatCreatedAt` muestra la hora de Buenos Aires;
  - `pageNumbers(1, 1)` da `[1]`, y `pageNumbers(6, 12)` da `[1, '…', 5, 6, 7, '…', 12]`;
  - `parsePageParam` da 1 con `null`, `'abc'`, `'0'`, `'-2'` y `'1.5'`, y 3 con `'3'`.
- **Depende de:** T01
- **Commit:** `feat(documents): agregar el formato de fechas y la paginación`

### T12 · Reglas de validación de la carga

- **Qué hace:** crea `upload-rules.ts` con los límites de la API, `tomorrowIn(timeZone, now)` y `validateUpload(values, today)`, que devuelve los errores por campo.
- **Cubre:** F2; plan sección 5.3; D1 del plan 001.
- **Archivos:** `lib/documents/upload-rules.ts`, `lib/documents/review-date.ts`, `lib/documents/validate-upload.ts`.
- **Verificación:** test primero, `tests/lib/documents/validate-upload.test.ts`:
  - **E5:** `.docx` y 11 MB dan error en `file`;
  - 0 bytes da error; exactamente 10 MB y `.PDF` en mayúsculas pasan; `.txt` y `.md` pasan;
  - título vacío, con solo espacios y de 201 dan error; de 200 pasa;
  - sin áreas y sin responsable dan error;
  - descripción de 1001 da error; de 1000 pasa;
  - `tomorrowIn` con el reloj simulado a las 23:59 y a las 00:00 de Buenos Aires (y en UTC con otro día) da la fecha correcta; la fecha de hoy da error y la de mañana pasa.
- **Depende de:** T01
- **Commit:** `feat(documents): validar la carga antes de enviarla`

## Pantallas

### T13 · Tarjeta de documento

- **Qué hace:** crea `DocumentCard`, con título (enlace al detalle), nombres de las áreas, responsable, fecha de revisión y fecha de carga. Al ADMIN le muestra "Archivado" si corresponde. Recibe los nombres ya resueltos; si falta uno, muestra "—".
- **Cubre:** F7, F10; caso borde "nombre largo o con tildes".
- **Archivos:** `components/documents/DocumentCard.tsx`.
- **Verificación:** test primero, `tests/components/documents/DocumentCard.test.tsx`: muestra los cinco datos; el enlace va a `/documentos/{id}`; un título y un nombre de archivo largos con tildes se recortan y conservan el texto completo, con las tildes, en `title`; "Archivado" aparece solo para el ADMIN; sin el nombre del responsable muestra "—".
- **Depende de:** T11
- **Commit:** `feat(documents): agregar la tarjeta de documento`

### T14 · Paginación por números

- **Qué hace:** crea `Pagination`, con enlaces a `?pagina=N`, anterior, siguiente y puntos suspensivos. No se muestra si hay una sola página.
- **Cubre:** F7; P6.
- **Archivos:** `components/documents/Pagination.tsx`.
- **Verificación:** test primero, `tests/components/documents/Pagination.test.tsx`: con 45 documentos hay 3 páginas; la actual tiene `aria-current="page"`; "Anterior" no está en la primera y "Siguiente" no está en la última; los enlaces apuntan a `?pagina=N`; con 20 o menos no se renderiza.
- **Depende de:** T11
- **Commit:** `feat(documents): agregar la paginación por números`

### T15 · Listado de documentos

- **Qué hace:** crea `DocumentList` y `app/documentos/page.tsx`. Lee `?pagina=`, pide la página, resuelve los nombres con los directorios y muestra cargando, tarjetas, vacío y error. "Cargar documento" solo para el ADMIN.
- **Cubre:** F1, F7, F10, F12; spec secciones 7 y 8 (lista vacía, la API no responde).
- **Archivos:** `components/documents/DocumentList.tsx`, `components/documents/DocumentListSkeleton.tsx`, `app/documentos/page.tsx`.
- **Verificación:** test primero, `tests/components/documents/DocumentList.test.tsx`, con `vi.mock` de `@/lib/api`, `@/lib/session`, `@/lib/directory` y `next/navigation`:
  - **E2:** un EMPLOYEE no ve "Cargar documento"; un ADMIN sí, con enlace a `/documentos/nuevo`;
  - **E8:** muestra exactamente las tarjetas de la respuesta y en el mismo orden;
  - **E10:** con `data: []`, "Todavía no hay documentos en tus áreas"; el ADMIN ve además "Cargar el primer documento";
  - cargando mientras la respuesta no llega; con 503 o `status: 0`, mensaje y "Reintentar" vuelve a pedir;
  - `?pagina=2` pide `page=2`; una página mayor que el total muestra "Esta página no existe" con enlace a la primera.
  - Además: `pnpm --filter web build` pasa (comprueba que `useSearchParams` está dentro de `<Suspense>`, como exige `cacheComponents`).
- **Depende de:** T04, T05, T07, T08, T09, T10, T13, T14
- **Commit:** `feat(documents): agregar el listado de documentos`

### T16 · Botón de descarga

- **Qué hace:** crea `DownloadButton`, que en cada clic pide el enlace a la API y lo abre con `window.location.assign`. Mientras espera queda deshabilitado con "Preparando…".
- **Cubre:** F8; spec sección 9 (el enlace firmado lo da la API).
- **Archivos:** `components/documents/DownloadButton.tsx`.
- **Verificación:** test primero, `tests/components/documents/DownloadButton.test.tsx`:
  - **E11:** el clic llama a `getDownloadUrl(id)` y `location.assign` recibe la `url`; dos clics → dos llamadas (nunca se guarda el enlace);
  - deshabilitado mientras espera;
  - 404 → "No se encontró el documento"; 503 → "Probá de nuevo en unos minutos", debajo del botón.
- **Depende de:** T04, T09, T10
- **Commit:** `feat(documents): agregar la descarga de documentos`

### T17 · Detalle de documento

- **Qué hace:** crea `DocumentDetail`, `ProcessingStatusBadge` y `app/documentos/[id]/page.tsx`. Muestra los datos, el archivo, la descarga y, solo al ADMIN, el estado del procesamiento. Con 404 o un `id` que no es UUID, "No se encontró el documento".
- **Cubre:** F6, F9, F10, F12; D6; spec sección 7.
- **Archivos:** `components/documents/DocumentDetail.tsx`, `components/documents/ProcessingStatusBadge.tsx`, `app/documentos/[id]/page.tsx`.
- **Verificación:** test primero, `tests/components/documents/DocumentDetail.test.tsx`:
  - **E1 (parte):** el ADMIN ve "Pendiente" con `processingStatus: PENDING`; los cuatro estados tienen su texto;
  - **E9:** un EMPLOYEE no ve el estado del procesamiento;
  - **E12:** con 404, "No se encontró el documento";
  - con `id = 'abc'`, el mismo mensaje y **no** se llama a `getDocument`;
  - cargando y error con "Reintentar".
  - Además: `pnpm --filter web build` pasa.
- **Depende de:** T04, T05, T07, T08, T09, T10, T11, T16
- **Commit:** `feat(documents): agregar el detalle de documento`

### T18 · Restricción por rol

- **Qué hace:** crea `RequireRole`, que muestra "No tenés permiso para cargar documentos" con un enlace a `/documentos` si el rol de la sesión no está permitido, sin montar el contenido.
- **Cubre:** F1.
- **Archivos:** `components/session/RequireRole.tsx`.
- **Verificación:** test primero, `tests/components/session/RequireRole.test.tsx`: con ADMIN renderiza el contenido; con SUPERVISOR y EMPLOYEE muestra el mensaje y el contenido **no se monta** (un hijo con `useEffect` espiado no se ejecuta); sin sesión, "Elegí un usuario de prueba".
- **Depende de:** T05
- **Commit:** `feat(web): restringir pantallas por rol`

### T19 · Campos de archivo y áreas

- **Qué hace:** crea `FileField` (valida el archivo apenas se elige y muestra su nombre recortado y su tamaño) y `AreasField` (casillas con las áreas del directorio).
- **Cubre:** F2, F4, F10.
- **Archivos:** `components/documents/FileField.tsx`, `components/documents/AreasField.tsx`.
- **Verificación:** test primero, `tests/components/documents/upload-fields.test.tsx`:
  - **E5:** al elegir un `.docx` o un archivo de 11 MB, el error aparece junto al campo;
  - el `<input>` tiene `accept=".pdf,.txt,.md"`; un nombre largo con tildes se recorta y queda completo en `title`;
  - si el padre vuelve a renderizar con el mismo `File`, el input no se resetea;
  - `AreasField` marca y desmarca áreas, y muestra su error.
- **Depende de:** T07, T10, T12
- **Commit:** `feat(documents): agregar los campos de archivo y áreas`

### T20 · Campo del responsable

- **Qué hace:** crea `OwnerField`, que pide los candidatos cada vez que cambian las áreas, se deshabilita sin áreas ("Elegí primero las áreas") y borra la elección que deja de ser válida, con un aviso.
- **Cubre:** F11; D5; caso borde "áreas sin usuarios".
- **Archivos:** `components/documents/OwnerField.tsx`.
- **Verificación:** test primero, `tests/components/documents/OwnerField.test.tsx`:
  - sin áreas, deshabilitado con "Elegí primero las áreas";
  - **E3:** con Ventas, no aparece el EMPLOYEE de Operaciones y sí los ADMIN;
  - **E4:** con Ventas y un responsable de Ventas, al pasar a Operaciones la elección se borra (`onChange('')`) y aparece "El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro";
  - si el responsable sigue siendo válido (por ejemplo, un ADMIN), no se borra;
  - un área sin usuarios muestra solo a los ADMIN; si falla el directorio, mensaje y "Reintentar".
- **Depende de:** T07, T08, T10
- **Commit:** `feat(documents): agregar la elección del responsable`

### T21 · Formulario de carga: validación, envío y redirección

- **Qué hace:** crea `UploadDocumentForm` con estado controlado y `onSubmit`: valida todo antes de enviar, evita el doble envío y, con el 201, limpia el estado y va al detalle. Crea `app/documentos/nuevo/page.tsx` con `RequireRole`.
- **Cubre:** F1, F2, F5, F12, F13, F14; D4 (se limpia después de una carga correcta).
- **Archivos:** `components/documents/UploadDocumentForm.tsx`, `app/documentos/nuevo/page.tsx`.
- **Verificación:** test primero, `tests/components/documents/UploadDocumentForm.test.tsx`:
  - **E1:** con todos los campos válidos y un PDF de 2 MB, `uploadDocument` recibe los valores y, con el 201, `router.push('/documentos/{id}')`;
  - **E5:** con un `.docx`, no se llama a `uploadDocument`; con varios campos inválidos, se muestran todos y el foco va al primero;
  - **F5:** mientras espera, el botón está deshabilitado con "Cargando…"; un doble clic hace una sola llamada;
  - el `<input type="date">` tiene `min` en mañana;
  - no hay `beforeunload` registrado (F14).
- **Depende de:** T09, T12, T18, T19, T20
- **Commit:** `feat(documents): agregar el formulario de carga`

### T22 · Formulario de carga: errores de la API

- **Qué hace:** muestra los errores de la API en el formulario según la tabla 5.1, sin borrar nada de lo completado: los 400 junto a su campo, el 409 con el enlace al documento existente, 413 y 415 en el archivo, y 403 y 503 arriba.
- **Cubre:** F3, F4.
- **Archivos:** `components/documents/UploadDocumentForm.tsx`, `components/documents/FormErrorBanner.tsx`.
- **Verificación:** test primero, en `tests/components/documents/UploadDocumentForm.test.tsx`:
  - **E6:** con 409, "Ya existe un documento con este mismo archivo" y el enlace a `/documentos/{existingDocumentId}`; todos los campos y el archivo siguen;
  - **E7:** con 503, "Probá de nuevo en unos minutos"; los campos siguen y un segundo envío vuelve a llamar a la API;
  - 400 con `"ownerId: …"` → error junto al responsable; 413 y 415 → error junto al archivo; 403 → "No tenés permiso para cargar documentos";
  - el aviso tiene `role="alert"`.
- **Depende de:** T04, T21
- **Commit:** `feat(documents): mostrar los errores de la carga`

## Tests en el navegador (Playwright)

### T23 · Configurar Playwright

- **Qué hace:** configura Playwright con `next dev -p 3001` como `webServer` (D3) y los proyectos `escritorio` (Chromium, 1280×800) y `celular` (`Pixel 7`). Agrega los helpers para fijar la sesión (`page.addInitScript` con `sim-session`), simular la API (`page.route('**/api/**')`) y generar archivos de prueba. El proyecto `integracion` se define aparte y no corre por defecto.
- **Cubre:** F10; plan sección 7.2.
- **Archivos:** `playwright.config.ts`, `e2e/support/session.ts`, `e2e/support/mock-api.ts`, `e2e/support/files.ts`, `e2e/smoke.spec.ts`, `package.json` (scripts `test:e2e` y `test:e2e:integracion`), `.gitignore` (`test-results/`, `playwright-report/`).
- **Verificación:**
  1. `pnpm --filter web exec playwright install chromium`.
  2. `e2e/smoke.spec.ts`: con la sesión del ADMIN y la API simulada con un documento, `/documentos` muestra su tarjeta. Pasa en `escritorio` y en `celular`.
  3. `pnpm --filter web test:e2e` corre solo `escritorio` y `celular` (`playwright test --project=escritorio --project=celular`). El proyecto `integracion` tiene su propio script, `pnpm --filter web test:e2e:integracion` (`playwright test --project=integracion`): Playwright corre todos los proyectos si no se le indican, así que agregar `--project=integracion` a `test:e2e` correría los tres.
- **Depende de:** T15
- **Commit:** `test(web): configurar Playwright`

### T24 · Escenarios de consulta en el navegador

- **Qué hace:** cubre en Playwright los escenarios de consulta, con la API simulada.
- **Cubre:** E2, E8, E9, E10, E11, E12; F1, F6, F7, F8, F9, F10.
- **Archivos:** `e2e/consulta.spec.ts`.
- **Verificación:** se escriben los tests de la tabla 7.2 del plan y pasan en los dos proyectos:
  - **E2:** EMPLOYEE en `/documentos` sin "Cargar documento"; en `/documentos/nuevo` ve el mensaje de F1;
  - **E8:** las tarjetas son las de la respuesta y en su orden; "2" lleva a `?pagina=2` y se pide `page=2`;
  - **E9:** EMPLOYEE en el detalle no ve el estado del procesamiento;
  - **E10:** "Todavía no hay documentos en tus áreas";
  - **E11:** el clic en "Descargar" hace el pedido a `/download` en ese momento y llega el evento `download` (la `url` simulada responde con `Content-Disposition: attachment`);
  - **E12:** con 404, "No se encontró el documento".
- **Depende de:** T17, T23
- **Commit:** `test(documents): cubrir la consulta de documentos en el navegador`

### T25 · Escenarios de carga en el navegador

- **Qué hace:** cubre en Playwright los escenarios de carga, con la API simulada.
- **Cubre:** E1, E3, E4, E5, E6, E7; F2, F3, F4, F5, F11, F13; D4.
- **Archivos:** `e2e/carga.spec.ts`.
- **Verificación:** se escriben los tests de la tabla 7.2 del plan y pasan en los dos proyectos:
  - **E1:** ADMIN carga un PDF de 2 MB (`setInputFiles`) y termina en `/documentos/{id}` con "Pendiente"; el pedido fue `multipart/form-data` con `areaIds` repetido y las cabeceras `x-user-id` y `x-user-role`; al volver a "Cargar documento", el formulario está vacío;
  - **E3** y **E4:** las opciones del `<select>` del responsable según las áreas;
  - **E5:** `.docx` y 11 MB muestran el error y **no** sale ningún `POST /api/documents`;
  - **E6:** con 409, el enlace lleva al existente y, al volver atrás, los campos y el archivo siguen;
  - **E7:** con 503, el mensaje; los campos siguen y un segundo envío (con la ruta ya en 201) funciona.
- **Depende de:** T22, T23
- **Commit:** `test(documents): cubrir la carga de documentos en el navegador`

### T26 · Prueba de integración con la API real

- **Qué hace:** agrega unas pocas pruebas de Playwright contra la API real (PostgreSQL en Docker, API en el puerto 3000 sin `S3_BUCKET`), para comprobar el rewrite y el contrato.
- **Cubre:** plan sección 2 (riesgo del tamaño de la carga) y 7.2; E1, E8, E11, E12 de punta a punta.
- **Archivos:** `e2e/integracion/documentos.spec.ts`, `playwright.config.ts` (proyecto `integracion`).
- **Verificación:** `docker compose up -d`, `pnpm dev:api` y `pnpm --filter web test:e2e:integracion`:
  - ADMIN carga un PDF de 2 MB y llega al detalle con "Pendiente";
  - ADMIN carga un PDF de **exactamente 10 MB** y recibe 201;
  - EMPLOYEE de Ventas ve el documento de Ventas y no el de Operaciones; al abrir el de Operaciones por URL, "No se encontró el documento";
  - el clic en "Descargar" hace el pedido a `/download` y recibe 200 (no se abre la URL `memory://`).
  - Cada corrida genera archivos con contenido distinto, para no chocar con el 409 de una corrida anterior.
- **Depende de:** T24, T25
- **Commit:** `test(documents): probar las pantallas contra la API real`

## Tareas bloqueadas

Necesitan piezas de la pareja A que todavía no existen. Se hacen cuando lleguen; ninguna cambia los componentes, solo los `index.ts` de la sección 3 del plan o el origen de los nombres.

### T27 · Nombres de áreas y responsable desde la respuesta — BLOQUEADA

- **Bloqueada por:** la API de documentos todavía devuelve solo `areaIds` y `ownerId` (Q1). Para agregar `areas: [{ id, name }]` y `owner: { id, name }`, los `AreasDirectory` y `UsersDirectory` reales del backend tienen que exponer los nombres, y eso depende de la pareja A.
- **Qué hace:** actualiza los tipos de `lib/api/documents.ts`; `DocumentList` y `DocumentDetail` dejan de usar `getNames` y `listAreas` para mostrar nombres.
- **Cubre:** F7; Q1.
- **Archivos:** `lib/api/documents.ts`, `components/documents/DocumentList.tsx`, `components/documents/DocumentDetail.tsx`, sus tests, `e2e/support/mock-api.ts`.
- **Verificación:** test primero: en `DocumentList.test.tsx` y `DocumentDetail.test.tsx`, los nombres salen de la respuesta y **no** se llama a `getNames`. Siguen pasando T24 y T26.
- **Depende de:** T15, T17
- **Commit:** `feat(documents): mostrar los nombres que devuelve la API`

### T28 · Áreas reales: `GET /api/areas` — BLOQUEADA

- **Bloqueada por:** nadie expone todavía la lista de áreas (Q2).
- **Qué hace:** crea `HttpAreasDirectory`, que llama a `GET /api/areas` con `apiClient`, y lo exporta desde `lib/directory/index.ts` en lugar de la simulación.
- **Cubre:** F2 (al menos un área); Q2.
- **Archivos:** `lib/directory/http-areas-directory.ts`, `lib/directory/index.ts`.
- **Verificación:** test primero, `tests/lib/directory/http-areas-directory.test.ts`: pide `/api/areas` y devuelve `{ id, name }[]`; un error llega como `ApiError`. Siguen pasando los tests de componentes y T26.
- **Depende de:** T07
- **Commit:** `feat(web): leer las áreas desde la API`

### T29 · Responsables reales: `GET /api/users?areaIds=` — BLOQUEADA

- **Bloqueada por:** la pareja A todavía no expone la lista de usuarios filtrable por área (spec sección 10, P1).
- **Qué hace:** crea `HttpUsersDirectory`, que llama a `GET /api/users?areaIds=…` (un parámetro por área) con `apiClient`, y lo exporta desde `lib/directory/index.ts`. Se confirma con la pareja A que la respuesta incluye a los ADMIN; si no, se completa con `filterOwnerCandidates`.
- **Cubre:** F11; P1.
- **Archivos:** `lib/directory/http-users-directory.ts`, `lib/directory/index.ts`.
- **Verificación:** test primero, `tests/lib/directory/http-users-directory.test.ts`: arma la URL con un `areaIds` por área; devuelve `{ id, name, role }[]`; los ADMIN están en el resultado. Siguen pasando `OwnerField.test.tsx` y T25.
- **Depende de:** T07
- **Commit:** `feat(web): leer los responsables desde la API`

### T30 · Sesión real — BLOQUEADA

- **Bloqueada por:** el login, la sesión y la renovación del token de la pareja A todavía no existen.
- **Qué hace:** `lib/session/index.ts` reexporta la sesión real; se borran `simulated-session.tsx` y `DevSessionSwitcher` (y se saca de `layout.tsx`). Si la pareja A entrega su propio cliente HTTP, `lib/api/index.ts` lo reexporta (plan 3.2). El 401 redirige al login. Si la pareja A agrega `proxy.ts`, se confirma que su `matcher` excluye `/api/:path*` o que `experimental.proxyClientMaxBodySize` es `'11mb'` (Q6).
- **Cubre:** F1, F6 (rol real); plan secciones 3.1 y 3.2; Q6.
- **Archivos:** `lib/session/index.ts`, `lib/api/index.ts`, `app/layout.tsx`, `e2e/support/session.ts`, y se borran `lib/session/simulated-session.tsx`, `components/session/DevSessionSwitcher.tsx` y sus tests.
- **Verificación:** test primero, en `client.test.ts`: con la sesión real, el pedido lleva las cabeceras de autenticación que ella define y no `x-user-id` ni `x-user-role`. `grep -r "x-user-id\|sim-session" app components lib` queda vacío. Pasan todos los tests de componentes, T24, T25 y **T26 con el archivo de 10 MB**.
- **Depende de:** T05, T06, T26
- **Commit:** `feat(web): usar la sesión real`

## Verificación final

### T31 · Verificación de la feature

- **Qué hace:** corre todos los tests, confirma que cada escenario de la spec tiene su test (tabla de abajo, se marca cada fila) y anota el resultado. No depende de las tareas bloqueadas: se cierra con T01 a T26 y se vuelve a correr cuando llegue cada una de T27 a T30.
- **Cubre:** spec sección 11 completa; plan sección 7.
- **Archivos:** `specs/002-pantallas-documentos/tasks.md` (se marca la tabla y se anota el resultado).
- **Verificación:**
  1. `pnpm --filter web lint`, `pnpm --filter web build`, `pnpm --filter web test` y `pnpm --filter web test:e2e`: todo en verde.
  2. Con Docker y la API en el puerto 3000: `pnpm --filter web test:e2e:integracion` en verde.
  3. Revisar la tabla: cada fila tiene un test de componente y uno de Playwright que existen y pasan.
  4. A mano, en el celular (o con las herramientas del navegador en 375 px de ancho): listado, detalle y formulario se usan sin desplazamiento horizontal (F10).
- **Depende de:** T01 a T26
- **Commit:** `docs(specs): registrar verificación de pantallas de documentos`

#### Escenario → test

| Escenario | Test de componente | Test de Playwright | ✔ |
| --- | --- | --- | --- |
| E1 · El admin carga un documento | `UploadDocumentForm.test.tsx` (T21): 201 → `router.push`; `DocumentDetail.test.tsx` (T17): el ADMIN ve "Pendiente" | `carga.spec.ts` (T25); `integracion/documentos.spec.ts` (T26) | ☐ |
| E2 · Un empleado no ve la opción de cargar | `DocumentList.test.tsx` (T15); `RequireRole.test.tsx` (T18) | `consulta.spec.ts` (T24) | ☐ |
| E3 · El responsable se elige entre quienes pueden ver el documento | `owner-candidates.test.ts` (T07); `OwnerField.test.tsx` (T20) | `carga.spec.ts` (T25) | ☐ |
| E4 · El responsable deja de ser válido al cambiar las áreas | `OwnerField.test.tsx` (T20) | `carga.spec.ts` (T25) | ☐ |
| E5 · Archivo inválido antes de subir | `validate-upload.test.ts` (T12); `upload-fields.test.tsx` (T19); `UploadDocumentForm.test.tsx` (T21) | `carga.spec.ts` (T25) | ☐ |
| E6 · Archivo duplicado | `error-messages.test.ts` (T04); `UploadDocumentForm.test.tsx` (T22) | `carga.spec.ts` (T25) | ☐ |
| E7 · La API no está disponible | `error-messages.test.ts` (T04); `UploadDocumentForm.test.tsx` (T22) | `carga.spec.ts` (T25) | ☐ |
| E8 · Listado de un empleado | `DocumentList.test.tsx` (T15) | `consulta.spec.ts` (T24); `integracion/documentos.spec.ts` (T26) | ☐ |
| E9 · Un empleado no ve el estado del procesamiento | `DocumentDetail.test.tsx` (T17) | `consulta.spec.ts` (T24) | ☐ |
| E10 · Lista vacía | `DocumentList.test.tsx` (T15) | `consulta.spec.ts` (T24) | ☐ |
| E11 · Descarga | `DownloadButton.test.tsx` (T16) | `consulta.spec.ts` (T24); `integracion/documentos.spec.ts` (T26) | ☐ |
| E12 · Documento ajeno | `DocumentDetail.test.tsx` (T17) | `consulta.spec.ts` (T24); `integracion/documentos.spec.ts` (T26) | ☐ |

Reglas sin escenario propio, para no perderlas de vista:

| Regla | Tests que la cubren |
| --- | --- |
| F5 · Un solo envío | `UploadDocumentForm.test.tsx` (T21): doble clic → una llamada |
| F10 · Responsive | Proyecto `celular` de Playwright (T23 a T25) y revisión manual (T31, paso 4) |
| F12 · Rutas | `pnpm --filter web build` y la navegación de T24 y T25 |
| F14 · Salir del formulario | `UploadDocumentForm.test.tsx` (T21): sin `beforeunload` |
| Sesión simulada fuera de producción | `simulated-session.test.tsx` (T05); `DevSessionSwitcher.test.tsx` (T06) |

---

## Orden y dependencias

```
T01 ─┬─ T02
     ├─ T03 ─┬─ T04
     │       ├─ T05 ─┬─ T06
     │       │       ├─ T07
     │       │       └─ T18
     │       ├─ T08
     │       └─ T09
     ├─ T10
     ├─ T11 ─┬─ T13
     │       └─ T14
     └─ T12

T15 ◄─ T04, T05, T07, T08, T09, T10, T13, T14
T16 ◄─ T04, T09, T10
T17 ◄─ T04, T05, T07, T08, T09, T10, T11, T16
T19 ◄─ T07, T10, T12
T20 ◄─ T07, T08, T10
T21 ◄─ T09, T12, T18, T19, T20
T22 ◄─ T04, T21

T23 ◄─ T15 · T24 ◄─ T17, T23 · T25 ◄─ T22, T23 · T26 ◄─ T24, T25

BLOQUEADAS: T27 ◄─ T15, T17 · T28 ◄─ T07 · T29 ◄─ T07 · T30 ◄─ T05, T06, T26
T31 ◄─ T01 a T26 (se vuelve a correr con cada bloqueada que se cierre)
```
