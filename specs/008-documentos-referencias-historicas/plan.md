# Plan 008 · Referencias históricas en Documentos

- **Spec:** [spec.md](./spec.md) (acuerdo A-06.4 con la pareja A)
- **Planes de referencia:** [plan 001](../001-carga-documentos/plan.md) (carga, validaciones y directorios), [plan 002](../002-pantallas-documentos/plan.md) (pantallas y directorios de la web), [plan 003](../003-ciclo-de-vida-documentos/plan.md) (cambio de áreas, historial y `DocumentWriteSteps`), [plan 004](../004-busqueda-documentos/plan.md) (búsqueda) y [plan 005](../005-avisos-vencimiento/plan.md) (`review` solo para el ADMIN y el responsable).
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** escrito el 02/11/2026, para revisar. Sin código. Las decisiones están en la sección 8.1; queda una pregunta abierta, que no bloquea el plan (sección 8.2).

En este plan, R1 a R13 y F1 a F8 son reglas de esta spec; D1 a D5 y P1 a P9, sus decisiones (spec, sección 10); E1 a E22, sus escenarios (sección 11, en el orden en que aparecen); y PD1 a PD13, las decisiones de este plan (sección 8.1). Las reglas y decisiones de otros planes se citan con su número y el plan ("R4 de la spec 003", "D6 del plan 005").

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | El listado trae los nombres | E12 | Carga con un área inactiva |
| E2 | La búsqueda trae los nombres | E13 | Cambio de áreas que conserva un área inactiva |
| E3 | Responsable inactivo en el detalle | E14 | Cambio de áreas que agrega un área inactiva |
| E4 | Área inactiva en el listado | E15 | El responsable inactivo se conserva si no cambia |
| E5 | Quien revisó, solo para el ADMIN y el responsable | E16 | El responsable que no cambia igual necesita acceso |
| E6 | "Por revisar" trae los nombres | E17 | Elegir un responsable nuevo inactivo |
| E7 | El historial trae quién subió cada versión | E18 | Desactivar no borra referencias |
| E8 | Las escrituras responden con los nombres | E19 | OwnerField conserva al responsable inactivo |
| E9 | La web no usa los fixtures ni el catálogo de áreas | E20 | OwnerField permite elegir otro |
| E10 | Referencia que el directorio no encuentra | E21 | Candidatos solo con las áreas activas |
| E11 | Carga con responsable inactivo | E22 | La visibilidad no cambia |

## 0. Punto de partida

**Directorios internos (`apps/api/src/documents/ports`, de la pareja A; no se modifican)**

- `UsersDirectory`: solo `findById(id)` → `{ id, name, role, areaIds, isActive } | null`. `PrismaUsersDirectory.findById` trae **todas** las áreas del usuario, activas o no (sin `where` en `areas`), y convierte la base caída en `RepositoryUnavailableError`. `InMemoryUsersDirectory` (fixtures, cinco usuarios activos) tampoco tiene `findByIds`.
- `AreasDirectory`: `findExistingIds(ids)` y `findByIds(ids)` → `{ id, name, isActive }[]`, con activas e inactivas; los IDs que no existen se omiten. `InMemoryAreasDirectory` acepta registros completos, así que ya sirve para probar áreas inactivas.
- **Falta `UsersDirectory.findByIds(ids)`** (spec, "Depende de"). Cuando la pareja A lo agregue al puerto, como es abstracto, también tiene que implementarlo en `PrismaUsersDirectory` y en `InMemoryUsersDirectory`.

**Documentos (`apps/api/src/documents`)**

- `dto/document.response.ts`: `toDocumentFields(record, review?)` arma la respuesta campo por campo; `toDocumentResponse`, `toDocumentSummary`, `toDocumentSearchResult` y `toVersionHistoryItem` la usan. `review` (`DocumentReviewInfo`) sale solo si viene (D6 del plan 005). `document.response.spec.ts` compara con `toStrictEqual`: va a cambiar.
- `DocumentQueryService` (`UsersDirectory`, `DocumentsRepository`, `FileStorage`, `Clock`): `findOne`, `list`, `pendingReview`, `search` y `listVersions`, todos dentro de `mapErrors`, que convierte `RepositoryUnavailableError` en 503. No recibe `AreasDirectory`.
- `DocumentWriteSteps` (no es un provider de Nest: la construyen a mano `DocumentUploadService` y `DocumentLifecycleService`, con `AreasDirectory` y `UsersDirectory`):
  - `assertAreasExist(areaIds)`, con `findExistingIds` → 400 `areaIds: no existen las áreas …`;
  - `assertOwnerCanSeeDocument(ownerId, areaIds)`, con `findById` y `canBeOwner` → 400 `ownerId: el responsable no existe` o `ownerId: el responsable no comparte ningún área con el documento`.
- `DocumentUploadService.upload` valida, guarda y responde `toDocumentResponse(record)` (sin `review`). Todo error pasa por `toHttpException` y se audita.
- `DocumentLifecycleService`: `changeAreas`, `addVersion`, `archive` y `markReviewed` pasan por `run(...)`, que responde `toDocumentResponse(record, reviewFor(actor, record, today))` y audita el fallo. `changeAreas` sale antes, sin validar, si no hay cambios (R11); si no, valida con `assertAreasExist(dto.areaIds)` y `assertOwnerCanSeeDocument(dto.ownerId ?? current.ownerId, dto.areaIds)`, y escribe con `replaceAreas`.
- `document-access.ts`: `viewerFor` lee las áreas del directorio (todas, también las inactivas), no de la sesión. Por eso un EMPLOYEE de un área inactiva sigue viendo los documentos de esa área (E22), aunque `JwtAuthGuard` le arme la sesión solo con las áreas activas.

**Auth (pareja A):** un usuario inactivo no inicia sesión (`auth.service.ts`, login), no renueva la sesión (renovación) y no pasa `JwtAuthGuard`, que lee `isActive` de la base en cada pedido. Los tests de integración desactivan usuarios con la base, después de firmar el token del actor (que tiene que seguir activo).

**Web (`apps/web`)**

- `lib/api/documents.ts`: los tipos de las respuestas, solo con IDs.
- `lib/directory` (de la pareja A desde T28/T29): `usersDirectory.getNames` sigue leyendo fixtures; `listOwnerCandidates` llama a `GET /api/users?areaIds=...`, que responde 400 si alguna área es inactiva o no existe; `areasDirectory.listAreas` llama a `GET /api/areas`; `displayAreaName` agrega "(inactiva)".
- Pantallas que piden nombres hoy: `DocumentList`, `SearchResults`, `PendingReviewList` (`getNames` de los `ownerId` y `listAreas`, y pasan `areaNames` y `ownerName` a `DocumentCard`/`SearchResultCard`), `DocumentDetail` (`getNames` del responsable y del revisor, y `listAreas`) y `VersionHistory` (`getNames` de los `uploadedById`).
- `OwnerField({ areaIds, value, error, onChange })`: pide los candidatos de `areaIds` y, si el elegido no está entre ellos, lo borra con `OWNER_NO_LONGER_VALID` (E4 del plan 002). Lo usan `UploadDocumentForm` y `ChangeAreasForm`; este último parte de `document.ownerId` y manda `ownerId` solo si cambió.
- `AreasField` ya muestra las áreas inactivas solo si están elegidas, y no deja agregarlas.
- `lib/api/error-messages.ts`: un 400 de la carga o del cambio de áreas marca el campo por el prefijo del mensaje de la API (`ownerId: …`, `areaIds: …`) y le pone el texto fijo de `FIELD_MESSAGES`.
- Tests: Vitest + Testing Library en `tests/components/documents`; Playwright en `e2e/` (con la API simulada) y en `e2e/integracion/` (contra la API real).

## 1. Las referencias en la API

### 1.1 Tipos y búsqueda en lote (`document-references.ts`, nuevo)

```ts
// R1 y R12: lo único que sale de una persona o un área. name es null si el directorio no la encontró.
export interface DocumentReference { id: string; name: string | null; isActive: boolean; }

// Lo que ya se buscó, por ID. Lo que no está devuelve { id, name: null, isActive: false } (R12, PD4).
export class ReferenceLookup {
  static from(users: Named[], areas: Named[]): ReferenceLookup;
  user(id: string): DocumentReference;
  area(id: string): DocumentReference;
  has(ids: ReferenceIds): boolean;       // para PD5
}

// Los IDs que necesita una respuesta. El revisor, solo si esa respuesta lleva review (PD3).
export interface ReferenceIds { userIds: string[]; areaIds: string[]; }
export function referenceIdsOf(items: Array<{ record: DocumentRecord; withReview: boolean }>): ReferenceIds;

// Busca en lote: un findByIds de usuarios y uno de áreas, en paralelo, sin repetidos y sin pedir listas vacías.
export class DocumentReferences {
  constructor(users: UsersDirectory, areas: AreasDirectory);
  lookup(ids: ReferenceIds): Promise<ReferenceLookup>;
}
```

- `ReferenceLookup` y `referenceIdsOf` son puros: no dependen de `findByIds` y se pueden hacer ya (PD1).
- `DocumentReferences` es una clase común, como `DocumentWriteSteps`: la construyen los servicios con los directorios que ya reciben (PD1). Un directorio caído lanza `RepositoryUnavailableError`, que cada servicio ya convierte en 503 (R13).
- Arma cada referencia campo por campo (`id`, `name`, `isActive`): nada más del directorio (rol, áreas) llega a la respuesta (R3, sección 9 de la spec).
- **Depende de `UsersDirectory.findByIds`.** Si, al confirmar P6, la pareja A decide que un ID que no existe no se omite sino que se devuelve de otra forma, solo cambia `ReferenceLookup.from` (sección 8.2).

### 1.2 Respuestas (`dto/document.response.ts`)

- Clase nueva `DocumentReferenceResponse` (`id`, `name` nullable, `isActive`) para Swagger.
- `DocumentFields` suma `owner: DocumentReferenceResponse` y `areas: DocumentReferenceResponse[]`; `DocumentReviewInfo` suma `lastReviewedBy: DocumentReferenceResponse | null`; `VersionHistoryItem` suma `uploadedBy`. Los IDs se quedan (P1).
- Los mapeos reciben el `ReferenceLookup` como parámetro **obligatorio**: `toDocumentFields(record, refs, review?)`, y lo mismo `toDocumentResponse`, `toDocumentSummary`, `toDocumentSearchResult` y `toVersionHistoryItem(version, refs)`. Obligatorio para que ninguna respuesta salga sin nombres por olvido (PD2).
  - `owner: refs.user(record.ownerId)`;
  - `areas: record.areaIds.map((id) => refs.area(id))`, en el orden de `areaIds` (R1);
  - `review.lastReviewedBy: review.lastReviewedById ? refs.user(review.lastReviewedById) : null`;
  - `uploadedBy: refs.user(version.uploadedById)`.

### 1.3 Consultas (`DocumentQueryService`)

`DocumentQueryService` suma `AreasDirectory` al constructor (antes de `DocumentsRepository`; el `Clock` sigue último) y construye un `DocumentReferences`. En cada consulta, **después** de traer los documentos visibles y dentro de `mapErrors`:

| Consulta | IDs que pide | Regla |
| --- | --- | --- |
| `list`, `pendingReview`, `search` | de toda la página: `ownerId` y `areaIds` de cada documento; `lastReviewedById` solo de los que llevan `review` (`reviewFor` no es `undefined`) | R2, R3; P2 |
| `findOne` | lo mismo, de un documento | R2, R3 |
| `listVersions` | los `uploadedById` de las versiones | R2; P3 |

Un solo `lookup` por respuesta: dos consultas a la base (usuarios y áreas), sea cual sea el tamaño de la página (sección 9 de la spec). Las páginas vacías no consultan nada.

### 1.4 Escrituras (`DocumentUploadService`, `DocumentLifecycleService`)

Todas las respuestas `DocumentResponse` llevan las referencias (P4). Los nombres se buscan **antes de escribir** (PD5), para que un directorio caído dé 503 sin haber guardado nada (R13), y no un 503 con la escritura ya hecha, que llevaría a reintentar una carga ya guardada (409 por duplicado):

| Escritura | IDs que se piden antes de escribir |
| --- | --- |
| Carga | `dto.ownerId`, `dto.areaIds` (la respuesta no lleva `review`, como hoy) |
| Cambio de áreas | `dto.ownerId ?? current.ownerId`, `dto.areaIds` y `current.lastReviewedById` |
| Versión nueva | los del documento actual y, si trae `reviewDate`, `actor.id` (va a ser el revisor; R10 de la spec 005) |
| Marcar como revisado | los del documento actual y `actor.id` |
| Archivar | los del documento actual |

- En la carga y el cambio de áreas, el `lookup` va después de las validaciones (sección 2): no se buscan nombres de un pedido que se va a rechazar.
- Si el registro que devuelve la escritura tiene un ID que no se pidió (otra escritura en paralelo cambió el responsable o las áreas entre la lectura y el bloqueo), se pide ese ID después de escribir. Si ese segundo pedido falla, la referencia sale con `name: null` (como R12) y el fallo queda en el log, pero la respuesta es la de la escritura, que ya se guardó (PD5).
- `DocumentLifecycleService.run` recibe el `ReferenceLookup` además del registro; `DocumentUploadService.upload`, lo mismo antes de `toDocumentResponse`.
- R11 (sin cambios reales) también necesita el `lookup`: responde `current` con sus nombres.

## 2. Validaciones (`DocumentWriteSteps`)

### 2.1 Áreas (R7, R8, R10)

`assertAreasExist(areaIds)` pasa a `assertAreasCanBeAssigned(areaIds, currentAreaIds = [])`, con **una** llamada a `areas.findByIds(areaIds)` (PD6):

1. las que no vinieron en el resultado → 400 `areaIds: no existen las áreas <ids>` (el mensaje de hoy);
2. de las agregadas (`areaIds` que no están en `currentAreaIds`), las que tienen `isActive: false` → 400 `areaIds: están inactivas las áreas <ids>`.

La carga la llama sin `currentAreaIds` (todas son agregadas); el cambio de áreas, con `current.areaIds`. `findExistingIds` deja de usarse en documentos, pero sigue en el puerto (es de la pareja A).

### 2.2 Responsable (R5, R6, R10)

`assertOwnerCanSeeDocument(ownerId, areaIds, { isNew })`, con el mismo `findById` de hoy:

1. no existe → 400 `ownerId: el responsable no existe` (como hoy);
2. `isNew` y `isActive: false` → 400 `ownerId: el responsable está inactivo`;
3. `canBeOwner(owner, areaIds)` falso → 400 `ownerId: el responsable no comparte ningún área con el documento` (como hoy; spec 003, R4; P5).

- Carga: `isNew: true`.
- Cambio de áreas: `isNew: dto.ownerId !== undefined && dto.ownerId !== current.ownerId` (PD7). Sin `ownerId`, o con el mismo, se valida igual el paso 3: el responsable actual, activo o no, tiene que seguir teniendo acceso (R6, P5, E16).
- `canBeOwner` no cambia: usa las áreas del directorio, que incluyen las inactivas (R10, D3).

### 2.3 Orden

El de R10: áreas que existen → áreas agregadas activas → responsable que existe → responsable nuevo activo → acceso. Ninguna validación nueva va dentro de la transacción. Los 400 se auditan como hoy, en `run` y en `upload` (R13). Swagger: las descripciones del 400 de `POST /documents` y de `PATCH /documents/:id/areas` suman "área inactiva agregada o responsable nuevo inactivo".

## 3. La web

### 3.1 Tipos y formato

- `lib/api/documents.ts`: `DocumentReference { id; name: string | null; isActive }`; `DocumentFields` suma `owner` y `areas`; `DocumentReview`, `lastReviewedBy`; `VersionHistoryItem`, `uploadedBy`.
- `lib/documents/format.ts` (de Documentos, no `lib/directory`, PD8):
  - `formatPerson(ref)`: "—" si `name` es `null`; "Nombre (inactivo)" si `isActive` es `false`; si no, el nombre (F2, F3);
  - `formatArea(ref)`: lo mismo con "(inactiva)";
  - `formatAreas(refs)`: las áreas separadas por ", ", o "—" si no hay.

### 3.2 Pantallas de consulta (F1, F2, F3; P2, P7)

- `DocumentCard` deja de recibir `areaNames` y `ownerName`: usa `document.owner` y `document.areas` con los formatos de 3.1. `SearchResultCard` igual.
- `DocumentList`, `SearchResults`, `PendingReviewList` y `DocumentDetail` dejan de usar `usersDirectory.getNames` y `areasDirectory.listAreas`. `DocumentDetail` muestra el revisor con `formatPerson(review.lastReviewedBy)`.
- `VersionHistory` usa `version.uploadedBy`.
- Ninguna de esas pantallas importa `@/lib/directory` al terminar (E9). `getNames` queda en `lib/directory` sin uso; lo quita la pareja A (P8).

### 3.3 `OwnerField` y `ChangeAreasForm` (F4, F5, F6; P5, P9)

- `OwnerField` suma dos props opcionales:
  - `currentOwner?: DocumentReference`: el responsable actual, solo en el cambio de áreas;
  - `onlyInactiveAreas?: boolean`: hay áreas elegidas, pero ninguna activa.
- Con `currentOwner`:
  - la lista siempre lo incluye (con `formatPerson`), aunque no esté entre los candidatos;
  - el efecto que borra al elegido con `OWNER_NO_LONGER_VALID` **no** lo borra si el elegido es `currentOwner.id` (PD9). Si el ADMIN eligió otro candidato y ese deja de serlo, sí se borra, como hoy (E4 del plan 002).
- `ChangeAreasForm` (que tiene el catálogo de áreas) le pasa a `OwnerField` solo las áreas activas elegidas como `areaIds` (PD10) y `onlyInactiveAreas` cuando corresponde. Con `areaIds` vacío y `onlyInactiveAreas`, `OwnerField` no pide candidatos, muestra al responsable actual elegido y la ayuda "Para elegir otro responsable, marcá al menos un área activa".
- `UploadDocumentForm` no cambia (F5): no pasa `currentOwner` y sus áreas son todas activas.
- El formulario sigue mandando `ownerId` solo si cambió (plan 003, 6.2).

### 3.4 Errores nuevos (F7)

`describeApiError`, para la carga y el cambio de áreas: si el mensaje de la API es el de R5 o R7, el campo lleva un texto propio en lugar del de `FIELD_MESSAGES`:

| Mensaje de la API | Campo | Texto |
| --- | --- | --- |
| `ownerId: el responsable está inactivo` | responsable | "El responsable está inactivo. Elegí otro." |
| `areaIds: están inactivas las áreas …` | áreas | "Hay áreas inactivas entre las que agregaste. Sacalas para guardar." |
| `ownerId: el responsable no comparte …` (E16) | responsable | el de hoy: "El responsable tiene que pertenecer a alguna de las áreas elegidas, o ser administrador." |

## 4. Estrategia de pruebas

El criterio de los planes anteriores: reglas en tests unitarios, base real en integración, pantallas con Testing Library y un recorrido en Playwright.

**Datos de prueba.** `test/documents/helpers.ts` suma (PD12):

- `seedArea(prisma, { name, isActive })` → id, para Compras y Logística;
- `setUserActive(prisma, userId, isActive)` y `setAreaActive(prisma, areaId, isActive)`;
- `seedUser(prisma, { name, role, areaIds, isActive })`, si los fixtures no alcanzan (un EMPLOYEE de Compras, un ADMIN que después se desactiva).

El actor de cada pedido (ADMIN o EMPLOYEE) tiene que estar activo, porque `JwtAuthGuard` lo lee de la base. Cada suite restaura los fixtures (`isActive: true`) al terminar.

### 4.1 Unitarios (Jest, API)

| Qué se prueba | Casos | ¿Necesita `findByIds`? |
| --- | --- | --- |
| `document-references.spec.ts` › `ReferenceLookup` y `referenceIdsOf` | Un usuario y un área encontrados, con `isActive` de cada uno; un ID que no está → `{ id, name: null, isActive: false }` (**E10**); `referenceIdsOf` sin repetidos, con el revisor solo si `withReview` (**E5**) | No |
| `document-references.spec.ts` › `DocumentReferences` | Un `findByIds` de usuarios y uno de áreas por llamada, sin repetidos; listas vacías → no llama; directorio caído → `RepositoryUnavailableError` | **Sí** |
| `document.response.spec.ts` | Con un `ReferenceLookup` armado a mano: `owner`, `areas` en el orden de `areaIds`, `review.lastReviewedBy` (y `null` sin revisión), `uploadedBy`, los IDs de antes siguen; `toStrictEqual`: nada más que `id`, `name` e `isActive` en cada referencia (**R3**) | No |
| `document-write-steps.spec.ts` | Áreas: inexistente → el 400 de hoy; agregada inactiva → 400 de R7 (**E12**, **E14**); inactiva que ya estaba → pasa (**E13**); inexistente e inactiva juntas → gana la inexistente (R10). Responsable: nuevo inactivo → 400 de R5 (**E11**, **E17**); no nuevo e inactivo con acceso → pasa (**E15**); no nuevo sin acceso → 400 de acceso (**E16**) | No |
| `document-query.service.spec.ts` | Cada consulta pide un solo `lookup` con los IDs de 1.3; el revisor de un documento sin `review` no se pide (**E5**); directorio caído → 503 | **Sí** |
| `document-upload.service.spec.ts`, `document-lifecycle.service.spec.ts` | Los IDs de la tabla de 1.4 se piden antes de escribir; directorio caído → 503 y el repositorio no escribió; un ID que no se pidió se pide después, y si falla sale con `name: null` (PD5); R11 responde con nombres | **Sí** |

### 4.2 Integración (Supertest + PostgreSQL, API)

| Suite | Escenarios | ¿Necesita `findByIds`? |
| --- | --- | --- |
| `test/documents/assignments.e2e-spec.ts` (nueva) | **E11**, **E12** (400 y nada guardado: ni documento ni archivo); **E13**; **E14** (las áreas no cambian); **E15**; **E16**; **E17** (el responsable no cambia); **E18** (desactivar no cambia `ownerId` ni `areaIds`); **E22** (un EMPLOYEE de Compras inactiva lista el documento); los 400 nuevos quedan en la auditoría | No |
| `test/documents/references.e2e-spec.ts` (nueva) | **E1** a **E7** (listado, búsqueda, detalle, área inactiva, revisor solo con `review`, "Por revisar", historial); **E8** (las cinco escrituras responden `owner` y `areas`; "Marcar como revisado" con `lastReviewedBy` del ADMIN); **E10** (un documento con `ownerId` de un usuario que no existe, armado en la base) | **Sí** |
| Las de las specs 001 a 007 | Pasan con los cambios de los `toStrictEqual` que comparan respuestas enteras (se les suman `owner` y `areas`) | — |

### 4.3 Web (Vitest + Testing Library)

Con `fetch` simulado, como hoy. No necesitan la API nueva para correr.

| Qué se prueba | Casos |
| --- | --- |
| `tests/lib/documents/format.test.ts` | `formatPerson` y `formatArea`: activo, inactivo, `name: null` |
| `DocumentCard`, `DocumentList`, `SearchResults`, `PendingReviewList`, `DocumentDetail` | Muestran los nombres de la respuesta con "(inactivo)"/"(inactiva)" (**E1** a **E6**) y "—" con `name: null` (**E10**); **no** llaman a `getNames` ni a `listAreas` (**E9**, con espías sobre `@/lib/directory`) |
| `VersionHistory` | `uploadedBy` con "(inactivo)" (**E7**); sin `getNames` |
| `OwnerField`, `ChangeAreasForm` | **E19**: el responsable inactivo aparece elegido y no se borra al cambiar las áreas ni al llegar los candidatos; al guardar sin cambiarlo, el pedido no trae `ownerId`. **E20**: elegir otro manda `ownerId`. **E21**: candidatos pedidos solo con las áreas activas; sin activas, no se piden y aparece la ayuda. Un candidato nuevo que deja de serlo se sigue borrando (E4 del plan 002). **E16**: el 400 de acceso queda en el campo sin borrar al responsable |
| `UploadDocumentForm`, `error-messages` | Los textos de 3.4 en el campo que corresponde (**E11**, **E12**) |
| Los tests que hoy simulan `getNames` o `listAreas` en esas pantallas | Se cambian a respuestas con `owner` y `areas` |

### 4.4 Playwright contra la API real (`e2e/integracion/referencias.spec.ts`, nueva)

Un recorrido, con la base sembrada: un documento con un responsable inactivo y un área inactiva → el listado y el detalle muestran "(inactivo)" e "(inactiva)" (**E3**, **E4**); el ADMIN abre el cambio de áreas, ve al responsable elegido (**E19**), agrega Operaciones y guarda sin cambiarlo (**E15**, **E13**). **Necesita `findByIds`** (la API real tiene que devolver los nombres).

## 5. Escenario → test

| Escenario | Unitario | Integración | Web / Playwright |
| --- | --- | --- | --- |
| E1 · Listado | `document.response.spec.ts`, `document-query.service.spec.ts` | `references.e2e-spec.ts` | `DocumentList` |
| E2 · Búsqueda | `document-query.service.spec.ts` | `references.e2e-spec.ts` | `SearchResults` |
| E3 · Responsable inactivo en el detalle | `document.response.spec.ts` | `references.e2e-spec.ts` | `DocumentDetail`, `referencias.spec.ts` |
| E4 · Área inactiva | `document.response.spec.ts` | `references.e2e-spec.ts` | `DocumentList`, `referencias.spec.ts` |
| E5 · Revisor solo con `review` | `document-references.spec.ts`, `document-query.service.spec.ts` | `references.e2e-spec.ts` | `DocumentDetail` |
| E6 · "Por revisar" | `document-query.service.spec.ts` | `references.e2e-spec.ts` | `PendingReviewList` |
| E7 · Historial | `document.response.spec.ts` | `references.e2e-spec.ts` | `VersionHistory` |
| E8 · Escrituras | `document-upload.service.spec.ts`, `document-lifecycle.service.spec.ts` | `references.e2e-spec.ts` | `DocumentDetail` (después de "Marcar como revisado") |
| E9 · Sin fixtures ni catálogo | — | — | las cinco pantallas, con espías |
| E10 · Referencia no encontrada | `document-references.spec.ts` | `references.e2e-spec.ts` | `DocumentDetail` |
| E11 · Carga, responsable inactivo | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | `UploadDocumentForm` |
| E12 · Carga, área inactiva | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | `error-messages` |
| E13 · Conserva área inactiva | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | `referencias.spec.ts` |
| E14 · Agrega área inactiva | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | — |
| E15 · Responsable inactivo que no cambia | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | `referencias.spec.ts` |
| E16 · Igual necesita acceso | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | `ChangeAreasForm` |
| E17 · Responsable nuevo inactivo | `document-write-steps.spec.ts` | `assignments.e2e-spec.ts` | — |
| E18 · Desactivar no borra | — | `assignments.e2e-spec.ts` | — |
| E19 · OwnerField conserva | — | — | `OwnerField`, `ChangeAreasForm`, `referencias.spec.ts` |
| E20 · OwnerField elige otro | — | — | `ChangeAreasForm` |
| E21 · Candidatos con áreas activas | — | — | `OwnerField`, `ChangeAreasForm` |
| E22 · Visibilidad | — | `assignments.e2e-spec.ts` | — |

## 6. Dependencias nuevas

Ninguna. Ni paquetes ni migraciones: `isActive` y `name` ya están en la base.

**Dependencia de la pareja A:** `UsersDirectory.findByIds(ids)`, con su implementación en `PrismaUsersDirectory` e `InMemoryUsersDirectory`. Lo que la usa está marcado en `tasks.md`.

## 7. Orden de merge (PD11)

- Las validaciones (sección 2) no cambian ninguna respuesta: se pueden mergear solas, en cualquier momento.
- La web (sección 3) se puede escribir y probar ya, con respuestas simuladas, pero **no se mergea antes que las respuestas nuevas de la API** (1.2 a 1.4): con la API de hoy, `document.owner` no existe y las pantallas mostrarían "—" en todo. Van en el mismo PR que la API o después.

## 8. Decisiones y preguntas abiertas

### 8.1 Decisiones

Propuestas al escribir el plan, el 02/11/2026. Se llaman PD para no confundirlas con D1 a D5 de la spec.

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| PD1 · ¿Dónde se resuelven los nombres? | En `document-references.ts`: `ReferenceLookup` y `referenceIdsOf`, puros, y `DocumentReferences`, una clase común que construyen los servicios con los directorios que ya reciben, como `DocumentWriteSteps`. No un provider nuevo de Nest (1.1) | R1, R2 |
| PD2 · ¿El `ReferenceLookup` es opcional en los mapeos? | No: obligatorio, para que ninguna respuesta salga sin nombres por olvido. El compilador marca cada lugar que hay que cambiar (1.2) | R2 |
| PD3 · ¿Se busca el revisor de un documento cuya respuesta no lleva `review`? | No: sus IDs no se piden. Así ni siquiera se lee el nombre de quien no se va a mostrar (1.3) | R3 |
| PD4 · ¿Dónde vive la referencia de R12? | En `ReferenceLookup`: un ID que no se encontró da `{ id, name: null, isActive: false }`. Los mapeos no saben de eso (1.1) | R12 |
| PD5 · ¿Los nombres de una escritura se buscan antes o después de escribir? | Antes, para que un 503 quiera decir que no se guardó nada (R13). Un ID que aparece recién en el resultado (escrituras en paralelo) se pide después; si ese pedido falla, sale con `name: null` y queda en el log, sin convertir en error una escritura ya guardada (1.4) | R13 |
| PD6 · ¿Cómo se validan las áreas? | Con una sola llamada a `AreasDirectory.findByIds`, que dice cuáles existen y cuáles están activas. `findExistingIds` deja de usarse en documentos (2.1) | R7, R8, R10 |
| PD7 · ¿Cuándo es "responsable nuevo"? | En la carga, siempre. En el cambio de áreas, si `dto.ownerId` viene y es distinto del actual (2.2) | R5, R6 |
| PD8 · ¿Dónde van los formatos "(inactivo)" e "(inactiva)" de la web? | En `lib/documents/format.ts`, no en `lib/directory`, que es de la pareja A (3.1) | F2, F3 |
| PD9 · ¿`OwnerField` deja de borrar al elegido? | Solo protege al responsable actual. Un candidato que eligió el ADMIN y deja de serlo se sigue borrando, como hoy (3.3) | F4, F5 |
| PD10 · ¿Quién filtra las áreas activas para pedir candidatos? | `ChangeAreasForm`, que tiene el catálogo; `OwnerField` recibe solo las activas y `onlyInactiveAreas` (3.3) | F6 |
| PD11 · ¿En qué orden se mergea? | Las validaciones, solas. La web, junto con las respuestas nuevas de la API o después (7) | — |
| PD12 · ¿Cómo se prueban los inactivos en integración? | Con helpers nuevos en `test/documents/helpers.ts` (`seedArea`, `seedUser`, `setUserActive`, `setAreaActive`), con el actor siempre activo y restaurando los fixtures al terminar (4) | — |
| PD13 · ¿Hay que avisarle algo a la pareja A? | Sí: que `getNames` quedó sin uso (P8), que los campos de R1 y R2 son el contrato, y la pregunta de 8.2 | P6, P8 |

### 8.2 Preguntas abiertas

- **Q1 · ¿Qué devuelve `UsersDirectory.findByIds` con un ID que no existe?** (pendiente de P6, para la pareja A). El plan supone que lo omite, como `AreasDirectory.findByIds`. Si hace otra cosa (por ejemplo, lanza un error), solo cambia `ReferenceLookup.from` o `DocumentReferences.lookup`; R12 no cambia. No bloquea ninguna tarea que se pueda hacer ya.
