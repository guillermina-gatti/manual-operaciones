# Plan 002 · Pantallas de documentos

- **Spec:** [spec.md](./spec.md) (HU13 y la consulta de HU15, del lado del frontend)
- **API que se usa:** [plan 001, sección 3](../001-carga-documentos/plan.md#3-endpoints) y `apps/api/src/documents/documents.controller.ts`
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** listo para implementar. Las decisiones están en la sección 9.1 y lo que depende de la pareja A, en la 9.2.

En este plan, F1 a F14 son reglas de la spec; P1 a P8, sus decisiones (spec sección 10); E1 a E12, los escenarios de la spec (sección 11, en el orden en que aparecen); D1 a D7, las decisiones de este plan (sección 9.1); y Q1, Q2 y Q6, las preguntas que siguen abiertas con la pareja A (sección 9.2). Cuando se cita una decisión del plan 001, se aclara ("D1 del plan 001").

| # | Escenario de la spec |
| --- | --- |
| E1 | El admin carga un documento |
| E2 | Un empleado no ve la opción de cargar |
| E3 | El responsable se elige entre quienes pueden ver el documento |
| E4 | El responsable deja de ser válido al cambiar las áreas |
| E5 | Archivo inválido antes de subir |
| E6 | Archivo duplicado |
| E7 | La API no está disponible |
| E8 | Listado de un empleado |
| E9 | Un empleado no ve el estado del procesamiento |
| E10 | Lista vacía |
| E11 | Descarga |
| E12 | Documento ajeno |

## 0. Punto de partida

Estado actual de `apps/web`:

- **Next.js 16.4.1** con App Router (`app/`), **React 19.3** y TypeScript estricto. Alias `@/*` → `./*` en `tsconfig.json`.
- `next.config.ts` tiene `cacheComponents: true` y `partialPrefetching: true`, y carga Tailwind con `@tailwindcss/turbopack`. **No hay `rewrites`**: el reenvío de `/api` al backend que menciona `docs/justificacion.md` todavía no existe.
- **Tailwind 4** (`@import "tailwindcss"` y `@theme inline` en `app/globals.css`). No hay componentes propios ni librería de UI.
- Solo está la página de bienvenida de `create-next-app` (`app/page.tsx`) y el `layout.tsx` generado (`lang="en"`, título "Create Next App").
- **No hay `proxy.ts`** (el antiguo `middleware.ts`, renombrado en Next 16).
- Tests: `@playwright/test` ya está en `devDependencies`, pero no hay `playwright.config.ts`, ni tests, ni script `test`. No hay framework de tests de componentes.
- `ai` (Vercel AI SDK) está instalado para el chat de Guille; esta feature no lo usa.
- `AGENTS.md` avisa que esta versión de Next tiene cambios incompatibles: antes de escribir código hay que leer la guía correspondiente en `node_modules/next/dist/docs/`.

Lo que importa de la API (`apps/api`):

- Prefijo `/api`, `ValidationPipe` global y Swagger en `/api/docs` (`src/app.setup.ts`).
- **No habilita CORS.** El frontend solo puede llamarla desde el mismo origen, o sea, a través del rewrite (sección 2).
- Escucha en `PORT ?? 3000`, el mismo puerto por defecto que `next dev`. El README ya levanta la web con `-p 3001` (D3).
- Autenticación simulada (`src/common/auth/index.ts`): lee `x-user-id` y `x-user-role`, responde 401 si faltan y no arranca en producción.
- Las respuestas traen **solo IDs** de áreas (`areaIds`) y del responsable (`ownerId`), sin nombres (Q1).
- Los usuarios y áreas simulados del backend tienen UUID fijos en `src/documents/adapters/fixtures.ts` (Ventas, Operaciones, un ADMIN y un SUPERVISOR y un EMPLOYEE por área).
- Los mensajes de los 400 empiezan con el nombre del campo: los de `class-validator` (`"title must be shorter than…"`, en inglés) y los del servicio (`"ownerId: el responsable no existe"`).
- `ProcessingStatus`: `PENDING`, `PROCESSING`, `READY`, `FAILED`. `DocumentStatus`: `ACTIVE`, `ARCHIVED`.

## 1. Páginas y componentes

**Regla general.** Los `page.tsx` son componentes de servidor sin datos: arman el título y un `<Suspense>` con el componente de cliente que hace el trabajo. Los datos se piden **desde el navegador** a `/api` (D1). Con `cacheComponents`, Next prerenderiza la parte estática y los componentes que usan `useParams` o `useSearchParams` tienen que estar dentro de un `<Suspense>`; el `fallback` es el estado "cargando" de cada pantalla (sección 5.2).

```
apps/web/
├── next.config.ts                        + rewrite de /api (sección 2)
├── .env.example                          nuevo: API_URL (sin secretos)
├── app/
│   ├── layout.tsx                        lang="es", título, <SessionProvider> y <DevSessionSwitcher>
│   └── documentos/
│       ├── page.tsx                      F12: listado
│       ├── nuevo/page.tsx                F12: carga, solo ADMIN
│       └── [id]/page.tsx                 F12: detalle
├── components/
│   ├── ui/                               ScreenState (cargando, vacío, error con reintentar), FieldError, Button
│   ├── session/                          RequireRole, DevSessionSwitcher
│   └── documents/                        los componentes de la tabla de abajo
├── lib/
│   ├── session/                          sesión simulada (sección 3.1)
│   ├── api/                              apiClient, ApiError, mensajes de error y llamadas a /api/documents (secciones 2 y 3.2)
│   ├── directory/                        usuarios y áreas simulados (sección 3.3)
│   └── documents/                        funciones puras: validación (F2), responsables elegibles (F11), fechas y paginación
├── tests/                                tests de componentes (Vitest)
└── e2e/                                  tests de Playwright
```

| Pieza | Tipo | Responsabilidad |
| --- | --- | --- |
| `app/documentos/page.tsx` | servidor | Título "Documentos" y `<Suspense fallback={<DocumentListSkeleton/>}><DocumentList/></Suspense>` |
| `app/documentos/nuevo/page.tsx` | servidor | `<RequireRole role="ADMIN">` envolviendo `<UploadDocumentForm/>` (F1) |
| `app/documentos/[id]/page.tsx` | servidor | `<Suspense>` con `<DocumentDetail/>`, que lee el `id` con `useParams` |
| `DocumentList` | cliente | Lee `?pagina=` con `useSearchParams`, pide la página, muestra los cuatro estados, las tarjetas y la paginación. Muestra "Cargar documento" solo al ADMIN (F1, F7) |
| `DocumentCard` | cliente | Una tarjeta: título (enlace al detalle), áreas, responsable, fecha de revisión y fecha de carga (F7). Al ADMIN le agrega la etiqueta "Archivado" si corresponde |
| `Pagination` | cliente | Números de página con `<Link>` a `?pagina=N`, anterior y siguiente, y puntos suspensivos si hay muchas (F7, P6) |
| `DocumentDetail` | cliente | Pide el detalle; muestra datos, nombre del archivo, tamaño, `DownloadButton` y, solo al ADMIN, `ProcessingStatusBadge` (F6). 404 → "No se encontró el documento" (F9) |
| `ProcessingStatusBadge` | cliente | `PENDING` → "Pendiente", `PROCESSING` → "Procesando", `READY` → "Listo", `FAILED` → "Con error" |
| `DownloadButton` | cliente | Pide el enlace en el clic y lo abre (F8) |
| `UploadDocumentForm` | cliente | Estado del formulario, validación (F2), envío único (F5), errores de la API (F3), conserva los datos (F4) y redirige al detalle (F13) |
| `FileField` | cliente | `<input type="file" accept=".pdf,.txt,.md">`, nombre recortado del archivo elegido, tamaño y su error |
| `AreasField` | cliente | Casillas con las áreas (de `areasDirectory`); al menos una (F2) |
| `OwnerField` | cliente | `<select>` con los candidatos de `usersDirectory` para las áreas elegidas; deshabilitado hasta elegir un área (F11, D5) |
| `RequireRole` | cliente | Si el rol de la sesión no está permitido, muestra "No tenés permiso para cargar documentos" con un enlace a `/documentos` (F1) |
| `DevSessionSwitcher` | cliente | Solo fuera de producción: selector para elegir con qué usuario simulado navegar (sección 3.1) |
| `ScreenState` | cliente | Presentación común de cargando, vacío y error (con botón "Reintentar") |

Funciones puras en `lib/documents/` (sin React, fáciles de probar):

- `validateUpload(values, today)` → errores por campo (F2).
- `tomorrowIn(timeZone, now)` → la fecha mínima de revisión como `YYYY-MM-DD` (F2, D1 del plan 001).
- `filterOwnerCandidates(users, areaIds)` → usuarios que comparten un área, más los ADMIN (F11). La usa el directorio simulado y, si el real ya filtra, queda solo para los tests.
- `formatReviewDate('2027-03-01')` → "01/03/2027" **sin pasar por `new Date`**: `new Date('2027-03-01')` es medianoche UTC y en Argentina se mostraría el 28/02. `formatCreatedAt(iso)` sí usa `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`.
- `pageNumbers(current, total)` → la lista de números y puntos suspensivos de la paginación.
- `parsePageParam(value)` → entero desde 1; cualquier otra cosa da 1.

## 2. Cómo el frontend llama a la API

**El rewrite no existe todavía; se agrega.** En `next.config.ts`:

```ts
async rewrites() {
  return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
}
```

- `apiUrl` sale de `process.env.API_URL`, **sin** prefijo `NEXT_PUBLIC_`: la dirección del backend se usa solo en el servidor de Next y no termina en el JavaScript del navegador. En desarrollo, si falta, vale `http://localhost:3000` (D3); en producción, si falta, `next.config.ts` lanza un error al arrancar. `next build` corre en modo producción y deja el destino del rewrite fijo en el build, así que **el build también necesita `API_URL`**.
- `apps/web/.env.example` documenta `API_URL=` sin valor. El frontend **no tiene secretos**: ni credenciales de AWS, ni `JWT_SECRET`, ni claves de IA.
- Por qué rewrite y no llamar directo al backend: la API no habilita CORS y, según `docs/justificacion.md`, la cookie del refresh token tiene que quedar en el mismo dominio que el frontend.
- Las cabeceras pasan sin cambios por el rewrite, así que `x-user-id` y `x-user-role` (hoy) y `Authorization` o la cookie (después) llegan al backend.

**Todas las llamadas pasan por `apiClient`** (`lib/api/client.ts`); ningún componente usa `fetch` directamente.

- URLs relativas (`/api/documents…`), que el rewrite reenvía.
- Agrega las cabeceras de autenticación que da la sesión (`getAuthHeaders()`, sección 3.1).
- Respuesta 2xx → JSON tipado. Respuesta con error → lanza `ApiError { status, messages: string[], existingDocumentId? }`, leyendo el formato estándar de Nest (`statusCode`, `message` como texto o arreglo, `error`). Sin conexión, o una respuesta que no es JSON (por ejemplo, el rewrite no encuentra el backend) → `ApiError` con `status: 0`.
- En la carga envía `FormData` y **no** fija `Content-Type`, para que el navegador ponga el `boundary` del multipart. Repite `areaIds` una vez por área, como pide la API (plan 001, 3.1).

`lib/api/documents.ts` define las cuatro llamadas con los tipos de la respuesta (copiados de `document.response.ts`; compartirlos en un paquete queda para más adelante):

| Función | Endpoint |
| --- | --- |
| `listDocuments(page)` | `GET /api/documents?page={page}&limit=20` |
| `getDocument(id)` | `GET /api/documents/{id}` |
| `getDownloadUrl(id)` | `GET /api/documents/{id}/download` |
| `uploadDocument(values)` | `POST /api/documents` (multipart) |

**S3.** El frontend nunca sube a S3: el archivo va a la API, y la API lo guarda. Lo único que el navegador abre de S3 es el enlace firmado de descarga que devuelve la API (F8).

**Riesgo con el tamaño de la carga.** Si la pareja A agrega `proxy.ts` (la protección de rutas por rol que menciona la justificación), Next copia en memoria el cuerpo de las peticiones que pasan por él **hasta 10 MB por defecto** y, si se pasa, sigue con el cuerpo **recortado y sin error** (`experimental.proxyClientMaxBodySize`). Un PDF de 10 MB más el resto del multipart supera ese límite y llegaría roto a la API. Hay que excluir `/api` del `matcher` del proxy o subir el límite a `11mb` (Q6). Un test de Playwright contra la API real sube un archivo de exactamente 10 MB para detectarlo (sección 7.2).

## 3. Qué se simula y cómo se reemplaza

Mismo patrón que el plan 001 (sección 5): los componentes dependen de una **interfaz** y un único archivo `index.ts` por carpeta elige la implementación. Reemplazar una simulación es cambiar ese archivo; los componentes no cambian. Ningún componente importa de una ruta interna (`simulated-session.ts`, `fake-users-directory.ts`): siempre de `@/lib/session`, `@/lib/api` o `@/lib/directory`.

### 3.1 Sesión del usuario

- Interfaz (`lib/session/session.ts`): `SessionUser = { id, name, role }`, con `Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'`; `useSession(): { user: SessionUser | null; status: 'loading' | 'ready' | 'disabled' }`; y `getAuthHeaders(): Record<string, string>`, que usa `apiClient`.
- Ahora (`lib/session/simulated-session.tsx`): el usuario elegido se guarda en `localStorage` con la clave `sim-session` (el ID de un usuario de `lib/directory/fixtures.ts`). `getAuthHeaders()` devuelve `{ 'x-user-id': id, 'x-user-role': role }`. `DevSessionSwitcher` permite cambiar de usuario y Playwright lo fija con `page.addInitScript`.
- Sin sesión, las pantallas muestran "Elegí un usuario de prueba" en desarrollo; la API respondería 401.
- **Protección:** si `process.env.NODE_ENV === 'production'`, la sesión simulada queda **desactivada**: `useSession()` da `{ user: null, status: 'disabled' }` y `getAuthHeaders()` da `{}` aunque haya un `sim-session` guardado, así que la API responde 401. `DevSessionSwitcher` no se renderiza en producción. No se lanza un error porque `next build` corre en modo producción y el layout usa la sesión en todas las páginas: el build (y el CI) fallarían. Igual que en el backend, la sesión simulada no puede funcionar en producción por descuido.
- **Reemplazo:** `lib/session/index.ts` pasa a reexportar el `SessionProvider`, `useSession` y `getAuthHeaders` de la pareja A (por ejemplo, `Authorization: Bearer <access token>` y la renovación con el refresh token). Se borran `simulated-session.tsx` y `DevSessionSwitcher`, y se saca este último de `layout.tsx`.

### 3.2 Cliente HTTP

- Ahora: `lib/api/client.ts` es el `apiClient` descripto en la sección 2.
- **Reemplazo:** si la pareja A entrega su propio cliente (con reintento automático después de renovar el token ante un 401), `lib/api/index.ts` reexporta el suyo, siempre que lance `ApiError` con la misma forma; si no, se lo envuelve con un adaptador de pocas líneas. `lib/api/documents.ts` y los componentes no cambian.

### 3.3 Usuarios (F11) y áreas

- Interfaces (`lib/directory/`):
  - `UsersDirectory.listOwnerCandidates(areaIds): Promise<DirectoryUser[]>`: los usuarios activos que comparten al menos un área, **más todos los ADMIN** (F11). Es el contrato del `GET /api/users?areaIds=…` que la spec le pide a la pareja A.
  - `UsersDirectory.getNames(ids): Promise<Record<id, name>>`: para mostrar el responsable en las tarjetas y el detalle (Q1).
  - `AreasDirectory.listAreas(): Promise<{ id, name }[]>`: para las casillas del formulario y los nombres de las áreas (Q2).
- Ahora: `fake-users-directory.ts` y `fake-areas-directory.ts` usan `lib/directory/fixtures.ts`, que repite **los mismos UUID** que `apps/api/src/documents/adapters/fixtures.ts` y les agrega nombres (por ejemplo, "Ana Admin", "Emilia Empleada de Operaciones"). Así un responsable elegido en el frontend también es válido para la API simulada (R5 del plan 001). Responden después de un `setTimeout` corto, para que el estado "cargando" se vea en desarrollo.
- **Reemplazo:** `lib/directory/index.ts` pasa a exportar `HttpUsersDirectory` y `HttpAreasDirectory`, que llaman a los endpoints de la pareja A con `apiClient`.

## 4. Cómo se cumple cada regla

| Regla | Cómo se cumple |
| --- | --- |
| **F1** · Acceso por rol | `DocumentList` muestra "Cargar documento" solo si `user.role === 'ADMIN'`. `/documentos/nuevo` envuelve el formulario en `RequireRole role="ADMIN"`: otro rol ve "No tenés permiso para cargar documentos" y el formulario ni se monta. La protección real sigue siendo la API (403), que el formulario también maneja (F3) |
| **F2** · Validación antes de enviar | `validateUpload` controla: extensión `.pdf`, `.txt` o `.md` (sin distinguir mayúsculas); tamaño de 1 byte a 10 MB (`10 * 1024 * 1024`, el mismo `MAX_FILE_SIZE_BYTES` de la API); título de 1 a 200 caracteres después de quitar espacios; al menos un área; responsable; fecha de revisión ≥ `tomorrowIn('America/Argentina/Buenos_Aires')`; descripción de hasta 1000. El archivo se valida apenas se elige (E5) y todo junto al enviar; si hay errores, no hay petición. El `<input type="date">` lleva además `min` en mañana. El contenido real del archivo (que un `.pdf` sea un PDF) solo lo puede comprobar la API (415) |
| **F3** · Errores de la API | Tabla de la sección 5.1, en un único lugar (`lib/api/error-messages.ts`) |
| **F4** · No perder lo completado | El formulario usa estado controlado y `onSubmit` con `preventDefault`, **no** `<form action>`: React 19 vacía los campos no controlados después de una acción, y el archivo se perdería. El `File` elegido se guarda en el estado; el `<input type="file">` no se desmonta ni se resetea, así que conserva la selección. Ante un error no se toca el estado |
| **F5** · Un solo envío | Estado `submitting`: el botón queda `disabled`, con `aria-busy` y el texto "Cargando…"; además, una `ref` corta un segundo envío que llegue antes del nuevo render (doble clic o Enter) |
| **F6** · Estado del procesamiento | `ProcessingStatusBadge` se renderiza solo si `user.role === 'ADMIN'`. La API devuelve el dato a todos los roles; esto oculta información, no la protege (D6) |
| **F7** · Listado | Grilla de `DocumentCard` (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), con los cinco datos pedidos. El orden es el de la API (más nuevo primero, plan 001 3.2): el frontend no reordena. `limit=20`, página en `?pagina=N`, cantidad de páginas = `ceil(total / limit)`. Si `pagina` supera el total, se muestra "Esta página no existe" con un enlace a la primera |
| **F8** · Descarga | `DownloadButton` llama a `getDownloadUrl(id)` en cada clic (nunca guarda el enlace) y después `window.location.assign(url)`. Como S3 responde con `Content-Disposition: attachment`, el archivo se descarga sin salir de la página. Se usa `assign` y no `window.open`, porque los navegadores bloquean las ventanas que se abren después de un `await`. Mientras espera, el botón está deshabilitado |
| **F9** · Inexistente o ajeno | 404 → "No se encontró el documento", el mismo texto en los dos casos. Si el `id` de la URL no es un UUID, se muestra lo mismo sin llamar a la API (la API respondería 400) |
| **F10** · Responsive | Tailwind de menor a mayor pantalla; formulario en una columna; controles a todo el ancho en el celular y de al menos 44 px de alto; textos largos con `truncate` o `break-words`. Playwright corre en escritorio y en un celular emulado (sección 7.2) |
| **F11** · Elección del responsable | `OwnerField` pide `listOwnerCandidates(areaIds)` cada vez que cambian las áreas. Si el responsable elegido no está en la lista nueva, se borra y se muestra "El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro". Sin áreas elegidas, el campo está deshabilitado con "Elegí primero las áreas" (D5). Si en las áreas no hay nadie, la lista muestra solo a los ADMIN (caso borde) |
| **F12** · Rutas | `app/documentos/page.tsx`, `app/documentos/nuevo/page.tsx` y `app/documentos/[id]/page.tsx`. `nuevo` es una carpeta estática, así que Next la resuelve antes que `[id]` |
| **F13** · Después de cargar | Con el 201, se limpia el estado del formulario y `router.push('/documentos/' + doc.id)`. El detalle muestra "Pendiente" al ADMIN |
| **F14** · Salir del formulario | No hay `beforeunload` ni confirmación. Al volver atrás, los datos pueden conservarse por `cacheComponents`, salvo después de una carga correcta (D4, spec P8) |

Casos borde de la spec (sección 8):

- **Lista vacía:** "Todavía no hay documentos en tus áreas"; al ADMIN se le muestra además el botón "Cargar el primer documento" (y el texto "Todavía no hay documentos", porque ve todas las áreas).
- **Nombre largo o con tildes:** `truncate` con el nombre completo en `title`; el nombre llega bien desde la API (D8 del plan 001, `defParamCharset: 'utf8'`), el frontend solo lo muestra.
- **La API no responde:** `ApiError` con `status: 0` o 503 → mensaje y "Reintentar" (sección 5).
- **Áreas sin usuarios:** la lista de responsables tiene solo a los ADMIN (F11).

## 5. Errores, estados y validación

### 5.1 Errores de la API (F3)

| Código | Mensaje | Dónde |
| --- | --- | --- |
| 400 | Por campo. Cada texto de `message` que empieza con el nombre de un campo (`title`, `areaIds`, `ownerId`, `reviewDate`, `description`, `file`) se asigna a ese campo, con un mensaje propio en español ("Revisá el título", "Elegí un responsable con acceso a las áreas", …), porque los de `class-validator` vienen en inglés. Lo que no se puede asignar va a un aviso general: "Revisá los datos del formulario" | Junto al campo o arriba del formulario |
| 401 | "Tu sesión no es válida. Volvé a ingresar." (cuando llegue el login de la pareja A, se redirige a él) | Toda la pantalla |
| 403 | "No tenés permiso para cargar documentos." | Arriba del formulario |
| 404 | "No se encontró el documento." (F9) | Detalle y descarga |
| 409 | "Ya existe un documento con este mismo archivo." y el enlace "Ver el documento existente" a `/documentos/{existingDocumentId}` | Arriba del formulario |
| 413 | "El archivo pesa más de 10 MB." | Campo del archivo |
| 415 | "El archivo no es un PDF, .txt o .md válido." | Campo del archivo |
| 503 | "El servicio no está disponible. Probá de nuevo en unos minutos." | Arriba del formulario o en el estado de error |
| 500 y otros | "Ocurrió un error inesperado. Probá de nuevo." | Igual |
| 0 (sin conexión) | "No pudimos conectarnos con el servidor." | Igual, con "Reintentar" |

Todo se resuelve con `describeApiError(error, context)` en `lib/api/error-messages.ts`, donde `context` es `'list' | 'detail' | 'download' | 'upload'`. Los mensajes técnicos de la API nunca se muestran tal cual. En el formulario, los errores no borran nada (F4) y se anuncian con `role="alert"`; el foco va al primer campo con error.

### 5.2 Estados de pantalla (sección 7 de la spec)

| Pantalla | Cargando | Con datos | Vacío | Error |
| --- | --- | --- | --- | --- |
| Listado | Tarjetas esqueleto (es el `fallback` del `<Suspense>` y el estado mientras llega la página) | Tarjetas y paginación | "Todavía no hay documentos en tus áreas" (+ botón para el ADMIN) | Mensaje de 5.1 y "Reintentar" |
| Detalle | Esqueleto del detalle | Datos y descarga | — | 404 (F9) o mensaje y "Reintentar" |
| Formulario | Mientras llegan las áreas | El formulario | — (sin áreas: "No hay áreas cargadas") | Si fallan las áreas o los usuarios: mensaje y "Reintentar"; si falla el envío: 5.1 sin perder datos |
| Descarga (botón) | "Preparando…" y deshabilitado | Se descarga | — | Mensaje debajo del botón |

`ScreenState` unifica la presentación; cada componente decide el texto.

### 5.3 Validación antes de enviar (F2)

- `validateUpload` es una función pura con los mismos límites que la API (plan 001, 3.1 y 4). Las constantes (`MAX_FILE_SIZE_BYTES`, `ALLOWED_EXTENSIONS`, `TITLE_MAX = 200`, `DESCRIPTION_MAX = 1000`) se escriben una sola vez en `lib/documents/upload-rules.ts`, con un comentario que apunta a la API. Compartirlas en un paquete común queda para más adelante.
- Cuándo se valida: el archivo, al elegirlo (E5); los demás campos, al salir de cada uno después del primer intento de envío, y todos juntos al enviar.
- La fecha mínima se calcula en `America/Argentina/Buenos_Aires` (D1 del plan 001), no en la zona horaria del navegador. Si el usuario está en otra zona, la API sigue siendo la que decide (400).

## 6. Dependencias nuevas (propuesta, no se instalan ahora)

| Paquete | Tipo | Por qué |
| --- | --- | --- |
| `vitest` | desarrollo | Corre los tests de componentes y de funciones puras. Es lo que recomienda la guía de testing de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) |
| `@vitejs/plugin-react` | desarrollo | JSX y React en Vitest |
| `jsdom` | desarrollo | DOM simulado para los tests de componentes |
| `@testing-library/react` y `@testing-library/dom` | desarrollo | Renderizar y buscar elementos como los ve el usuario |
| `@testing-library/user-event` | desarrollo | Simular clics, escritura y la elección de un archivo |
| `@testing-library/jest-dom` | desarrollo | Comprobaciones legibles (`toBeDisabled`, `toHaveAccessibleName`, …) |

- El alias `@/*` no necesita un paquete: Vite lo lee de `tsconfig.json` con la opción `resolve.tsconfigPaths: true` de `vitest.config.mts`.
- `@playwright/test` **ya está**. Falta descargar el navegador: `pnpm --filter web exec playwright install chromium` (no es un paquete).
- Scripts nuevos en `apps/web/package.json`: `test` (Vitest), `test:e2e` (Playwright).
- **No** hacen falta paquetes en tiempo de ejecución: ni librería de formularios (alcanza con estado de React), ni de pedidos (alcanza con `apiClient` y un hook chico), ni de fechas (`Intl`), ni de componentes (Tailwind). Si más adelante el listado necesita caché o revalidación, se evalúa TanStack Query (D7).

## 7. Estrategia de pruebas

Regla: **la lógica se prueba en tests de componentes** (rápidos y sin servidor); **Playwright comprueba que las piezas funcionan juntas en un navegador real**, en escritorio y celular. Cada escenario de la spec tiene al menos un test de cada tipo.

### 7.1 Tests de componentes y funciones puras (Vitest)

En `apps/web/tests/`. Usan `vi.mock` sobre `@/lib/api`, `@/lib/session` y `@/lib/directory` (los mismos puntos de reemplazo de la sección 3) y sobre `next/navigation` (`useRouter`, `useParams`, `useSearchParams`). No hay red.

| Qué se prueba | Escenarios y casos |
| --- | --- |
| `validateUpload`, `tomorrowIn` | **E5** (`.docx` y 11 MB); 0 bytes; exactamente 10 MB pasa; `.PDF` en mayúsculas pasa; título vacío, con solo espacios y de 201; sin áreas; sin responsable; fecha de hoy, de mañana y el cambio de día a las 23:59 y 00:00 de Buenos Aires con el reloj simulado; descripción de 1001 |
| `filterOwnerCandidates` | **E3** (EMPLOYEE de Operaciones no aparece con Ventas; los ADMIN sí); áreas sin usuarios → solo ADMIN |
| `describeApiError` y `ApiError` | Cada código de 5.1; el 400 con mensajes de `class-validator` y del servicio asignados a su campo; el 409 con `existingDocumentId`; sin conexión y respuesta que no es JSON → `status: 0` |
| `formatReviewDate`, `formatCreatedAt`, `pageNumbers`, `parsePageParam` | La fecha de revisión no se corre un día; páginas con puntos suspensivos; `?pagina=abc` → 1 |
| `UploadDocumentForm` | **E1** (201 → `router.push` al detalle); **E3**; **E4** (cambiar Ventas por Operaciones borra el responsable y muestra el aviso); **E5** (error junto al archivo y `uploadDocument` no se llama); **E6** (409: mensaje, enlace al existente y todos los campos y el archivo siguen); **E7** (503: "probá de nuevo en unos minutos" y los datos siguen); F5 (doble clic → una sola llamada, botón deshabilitado mientras espera); 413 y 415 junto al archivo; 400 asignado al campo |
| `DocumentList` | **E2** (EMPLOYEE no ve "Cargar documento"; ADMIN sí); **E8** (muestra solo lo que devuelve la API y en el mismo orden); **E10** ("Todavía no hay documentos en tus áreas"; el ADMIN además ve el botón); cargando; error y "Reintentar" vuelve a pedir; `?pagina=2` pide `page=2`; título y nombre de archivo largos con tildes se ven completos en `title` |
| `DocumentDetail` | **E1** (ADMIN ve "Pendiente"); **E9** (EMPLOYEE no ve el estado); **E12** (404 → "No se encontró el documento"); id que no es UUID → mismo mensaje sin llamar a la API |
| `DownloadButton` | **E11** (cada clic llama a `getDownloadUrl`, dos clics → dos llamadas, y `location.assign` recibe la `url`); deshabilitado mientras espera; 404 y 503 |
| `RequireRole` | F1: EMPLOYEE y SUPERVISOR ven el mensaje y el formulario no se monta |

### 7.2 Tests en el navegador (Playwright)

En `apps/web/e2e/`. `playwright.config.ts` levanta `next dev` con `webServer` y define dos proyectos: **escritorio** (Chromium, 1280×800) y **celular** (dispositivo `Pixel 7`), para cubrir F10. La sesión se fija con `page.addInitScript` escribiendo `sim-session` (sección 3.1).

**Suite principal, con la API simulada en el navegador.** `page.route('**/api/**')` responde con datos fijos, así los 12 escenarios corren sin backend, sin base y sin S3, y se pueden forzar el 409 y el 503. Comprueban lo que solo se ve en un navegador real: navegación entre rutas, redirección después de cargar, elegir un archivo de verdad con `setInputFiles`, `Suspense` y prerender con `cacheComponents`, y que todo se ve y se usa en el celular.

| Escenario | Qué hace el test |
| --- | --- |
| E1 | ADMIN completa el formulario con un PDF de 2 MB generado en el test, envía y termina en `/documentos/{id}` con "Pendiente". Se revisa que la petición fue `multipart/form-data` con `areaIds` repetido y las cabeceras de la sesión |
| E2 | EMPLOYEE en `/documentos`: no está "Cargar documento". Además, entra a `/documentos/nuevo` y ve el mensaje de F1 |
| E3 | ADMIN elige Ventas: en el `<select>` no está el EMPLOYEE de Operaciones y sí los ADMIN |
| E4 | ADMIN elige Ventas y un responsable de Ventas; cambia a Operaciones: el `<select>` queda vacío con el aviso |
| E5 | ADMIN elige un `.docx` y después un archivo de 11 MB: error junto al campo y **ninguna** petición `POST /api/documents` |
| E6 | La ruta responde 409 con `existingDocumentId`: mensaje, el enlace lleva al documento existente y, al volver, los campos y el archivo siguen |
| E7 | La ruta responde 503: "probá de nuevo en unos minutos" y los campos siguen; un segundo envío funciona |
| E8 | EMPLOYEE de Ventas: las tarjetas son las de la respuesta, en su orden; la paginación lleva a `?pagina=2` y pide `page=2` |
| E9 | EMPLOYEE en el detalle: no hay estado del procesamiento |
| E10 | Respuesta con `data: []`: "Todavía no hay documentos en tus áreas" |
| E11 | Clic en "Descargar": se hace la petición a `/download` en ese momento y el navegador recibe la descarga (la ruta de la `url` devuelve un archivo con `Content-Disposition: attachment`; se espera el evento `download`) |
| E12 | La ruta responde 404: "No se encontró el documento" |

**Prueba de integración, con la API real** (`e2e/integracion/`, se corre aparte: `pnpm --filter web test:e2e:integracion`). Necesita PostgreSQL en Docker y la API levantada sin `S3_BUCKET` (usa `InMemoryFileStorage` y la cola simulada). Pocas pruebas, para comprobar el rewrite y que el contrato coincide:

- ADMIN carga un PDF de 2 MB y llega al detalle con "Pendiente" (E1 de punta a punta).
- ADMIN carga un PDF de **exactamente 10 MB** a través del rewrite y recibe 201 (riesgo de la sección 2).
- EMPLOYEE de Ventas ve el documento de Ventas y no el de Operaciones (E8); al abrir el de Operaciones por URL ve "No se encontró el documento" (E12).
- La descarga pide el enlace a la API (E11). Solo se revisa la respuesta, porque `InMemoryFileStorage` devuelve una URL `memory://` que el navegador no puede abrir; la descarga real desde S3 queda en la verificación manual del plan 001 (8.3).

## 8. Orden de implementación sugerido

1. Rewrite, `.env.example`, `lang="es"` y título del layout.
2. `lib/session`, `lib/api`, `lib/directory` con sus simulaciones y `DevSessionSwitcher`.
3. Funciones puras de `lib/documents` con sus tests (Vitest se instala acá).
4. Listado y tarjetas; detalle y descarga; formulario. Cada uno con sus tests de componentes.
5. Playwright: configuración, suite principal y prueba de integración.

Las tareas detalladas van en `tasks.md`, en la etapa siguiente.

## 9. Decisiones y preguntas abiertas

### 9.1 Decisiones

Tomadas en la revisión del plan el 23/10/2026.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| D1 · ¿Los datos se piden desde el servidor de Next (componentes de servidor) o desde el navegador? | Desde el navegador. Según la justificación, el access token dura 15 minutos y el refresh va en cookie: lo más probable es que el token viva en el cliente. Pedir desde el servidor obligaría a reenviar credenciales y a usar la URL absoluta del backend. Si la pareja A guarda la sesión en una cookie legible por el servidor, se puede pasar el listado a componente de servidor más adelante sin cambiar la API | F7, F8 |
| D2 · ¿Dónde se guarda la sesión simulada? | En `localStorage` (`sim-session`), con `DevSessionSwitcher` para elegir el usuario. Es fácil de fijar en Playwright y no llega a producción (3.1) | F1, F6 |
| D3 · La API y `next dev` usan el puerto 3000 por defecto | Se sigue la convención que ya usa el README: la API en el 3000 (su valor por defecto) y la web en el 3001 (`pnpm --filter web dev -p 3001`). `API_URL` vale `http://localhost:3000` por defecto en desarrollo. No hace falta `PORT` en el `.env.example` de la raíz. Corregida al implementar T02: la primera versión invertía los puertos y obligaba a cambiar el README que usa todo el equipo | — |
| D4 · Con `cacheComponents`, Next guarda la pantalla anterior oculta (`<Activity>`) y, al volver atrás, el formulario puede reaparecer con los datos | No se pide confirmación al salir, y se acepta que los datos se conserven al volver atrás, porque no le hace daño a nadie. Después de una carga correcta sí se limpia el estado (F13), para que "Cargar documento" siempre empiece vacío. La spec se ajustó en F14, en el caso borde y en P8 | F13, F14 |
| D5 · ¿Qué muestra el responsable antes de elegir áreas? | Campo deshabilitado con "Elegí primero las áreas". Mostrar solo a los ADMIN sería válido según F11, pero invita a elegir antes de tiempo | F11 |
| D6 · F6 oculta el estado a quien no es ADMIN, pero la API se lo devuelve igual | Alcanza para la spec (no es información sensible). Si se quiere que no viaje, que la API lo omita para quien no es ADMIN; sería un cambio de la spec 001 | F6 |
| D7 · ¿Librería para pedidos (TanStack Query, SWR) o un hook propio? | Hook propio (`useApiResource`) con cargando, datos, error y `reload`: hay solo tres pedidos y no hace falta caché. Si las pantallas de otras parejas lo necesitan, se decide en equipo y se migra | Spec sección 7 |

### 9.2 Preguntas abiertas con la pareja A

| # | Pregunta | Propuesta |
| --- | --- | --- |
| Q1 | La API devuelve solo `areaIds` y `ownerId`, pero F7 pide mostrar áreas y responsable. ¿De dónde salen los nombres? Además, la spec pide la lista de usuarios "visible para ADMIN", y el EMPLOYEE también necesita el nombre del responsable | Que la API agregue `areas: [{ id, name }]` y `owner: { id, name }` a sus respuestas, usando sus `AreasDirectory` y `UsersDirectory` (una tarea chica de la spec 001). Así hay una sola petición y no depende de permisos sobre usuarios. Mientras tanto, el frontend resuelve los nombres con `lib/directory` simulado y, si no encuentra uno, muestra "—" |
| Q2 | El formulario necesita la lista de áreas con nombres y nadie la expone | Pedirle a la pareja A (o a quien sea dueño de las áreas) `GET /api/areas` → `{ id, name }[]`. Se agrega al pedido de `GET /api/users?areaIds=` de la spec. Hasta entonces, `fake-areas-directory` |
| Q6 | Si se agrega `proxy.ts`, las cargas de 10 MB llegan recortadas (sección 2). ¿Y en Vercel, el rewrite a un backend externo tiene límite de cuerpo? | Pedirle a la pareja A que el `matcher` de su proxy excluya `/api/:path*` y, por las dudas, fijar `experimental.proxyClientMaxBodySize: '11mb'`. Comprobar en el primer deploy de preview de Vercel que un archivo de 10 MB llega entero; si no, subir directo al backend con CORS solo para `POST /api/documents` |

Las preguntas conservan su número original (Q1, Q2 y Q6) para que coincidan con las referencias de `tasks.md`.
