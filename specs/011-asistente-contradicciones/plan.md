# Plan 011 · Asistente: documentos que se contradicen

- **Spec:** [spec.md](./spec.md) (HU39)
- **Planes de referencia:** [plan 009](../009-asistente-streaming/plan.md) (ruta de streaming, retén de `NO_INFO`, pantalla del chat), [plan 010](../010-asistente-contexto-paso/plan.md) (cambios mínimos en el chat de Guille, dependencias opcionales) y [spec 005](../005-avisos-vencimiento/spec.md) ("Por revisar").
- **Responsable:** Matías Fauda (pareja C)
- **Estado:** escrito el 05/11/2026; T01 a T13 implementadas el mismo día (tasks.md). Lo que cambió al implementar quedó en este plan: la paginación con `limit` (2.7), la regla del retén (2.3) y el `extraQuery` de `Pagination` (3.4). Las decisiones están en la sección 8.1; no quedan preguntas abiertas.

En este plan, R1 a R21 y F1 a F10 son reglas de la spec; D1 a D16, sus decisiones (spec, sección 10); E1 a E18, sus escenarios (sección 11, en el orden en que aparecen); y PD1 a PD12, las decisiones de este plan (sección 8.1).

| # | Escenario de la spec | # | Escenario de la spec |
| --- | --- | --- | --- |
| E1 | Dos documentos vigentes se contradicen | E10 | Versión nueva y la contradicción sigue |
| E2 | El aviso en el chat | E11 | Ver las alertas |
| E3 | Las dos rutas responden lo mismo | E12 | Otros roles no ven las alertas |
| E4 | La marca no se transmite | E13 | Marcar como resuelta |
| E5 | Se prioriza el vigente | E14 | Ya estaba resuelta |
| E6 | Marca del mismo documento | E15 | El documento cambió después de la alerta |
| E7 | Un documento que el usuario no ve | E16 | Falla el registro de la alerta |
| E8 | La misma contradicción otra vez | E17 | Sin contradicción nada cambia |
| E9 | Una alerta resuelta no se reabre | E18 | La base hace cumplir las reglas de la tabla |

## 0. Punto de partida

**El chat** (`apps/api/src/chat`, con las specs 009 y 010):

- **Las dos rutas:**
  - `ChatService.ask` (Guille): `openStepContext` → `resolveConversation` → `run` (`prepareChat`, `llm.answer`, `finishChat`) → `saveResult`;
  - `ChatStreamService` (spec 009): `open` y `run`. `run` llama a `answer`, que transmite con el retén `NoInfoGate`, y al final a `saveResult` y `sink.done`.
- **`chat-pipeline.ts`:**
  - `finishChat(llm, chunks)`: si el texto empieza con `NO_INFO`, `no_info`; si no, `answered` con `citedChunks`;
  - `Outcome { status, answer, chunks, llm? }`;
  - `saveResult` guarda el mensaje (con `STATUS_MAP`, que ya traduce `conflict` a `CONFLICT`) y arma el `ChatResult`.
- **`NoInfoGate`** (en `chat-stream.service.ts`): retiene hasta tener tantos caracteres como `NO_INFO`; si la respuesta empieza con la marca, no manda nada.
- **`SYSTEM_PROMPT`** (en `gemini-chat-llm.ts`): cinco reglas, entre ellas `NO_INFO`. `buildPrompt` arma `[Sn] <título> · <sección>` por pasaje.
- **Dependencias opcionales:** `ChatService` y `ChatStreamService` reciben `@Optional() contextStore?` (spec 010). Los tests de Guille construyen `new ChatService(emb, retrieval, llm, repo)`.
- **`RetrievedChunk`** trae `chunkId`, `documentId`, `documentTitle`, `versionId`, `versionNumber`, `section` y `content`.

**Documentos** (`apps/api/src/documents`, de Matías):

- `documents/metrics/` (spec 007) es el modelo de una subcarpeta con su controlador, su servicio, su repositorio y sus DTO, registrada en `documents.module.ts`.
- `AuditLog` (`ports/audit-log.ts`) registra acciones con `action`, `actorId`, `documentId`, `result`, `detail` y `at`.
- `findUsersByIds` (spec 008) resuelve los nombres históricos de los usuarios.
- `ListDocumentsQuery` valida `page` y `limit` (de 1 a 100, 20 por defecto), y el listado responde `{ data, total, page, limit }`.
- `toHttpException` (`documents/http-errors.ts`) traduce `RepositoryUnavailableError` a 503.

**La base:**

- **Imagen:** `pgvector/pgvector:pg16`, así que `gen_random_uuid()` está disponible sin extensiones.
- **Índices escritos a mano** en migraciones anteriores, que Prisma no describe:
  - `chunks_embedding_idx` (hnsw);
  - `chunks_content_fts_idx` (gin);
  - `chunks_content_fts_es_unaccent_idx` (gin).

  `test/documents/indexes.e2e-spec.ts` y `test/procedures/indexes.e2e-spec.ts` comprueban que existan.
- **Índices parciales** declarados en `schema.prisma` (`partialIndexes`): `document_versions_one_current_idx`, `executions_one_in_progress_idx` y `procedure_versions_one_draft_idx`.

**La web:**

- `useChatConversation.ts` guarda `sources` solo con `answered` (línea 97) y anuncia `withoutMarkers(done.answer)`.
- `ChatMessage.tsx` muestra `conflict` como `no_info`.
- `ChatSources` tiene la lista con `aria-label="Fuentes"`.
- `DocumentList.tsx` monta `PendingReviewLink`; `app/documentos/por-revisar/page.tsx` es el modelo de la página.
- `RequireRole` (pareja A) recibe `roles`.
- `error-messages.ts` tiene un `ErrorContext` por pantalla (`'review'`, entre otros).
- `e2e/support/mock-api.ts` simula la API para Playwright.

## 1. Datos y migración (T01, la corre Matías)

### 1.1 El modelo (`apps/api/prisma/schema.prisma`, sección de la pareja C)

```prisma
// Alertas de documentos que se contradicen (spec 011, HU39). Una por par de versiones (R13, D8).
// A es el documento de id menor (R11), y lo hace cumplir un CHECK escrito a mano (plan 011, 1.3).
// Los fragmentos y el mensaje van solo por ID: chunks y messages son de Guille (D16).
enum ConflictAlertStatus {
  OPEN
  RESOLVED
}

model DocumentConflictAlert {
  id              String              @id @default(uuid()) @db.Uuid
  documentAId     String              @map("document_a_id") @db.Uuid
  documentBId     String              @map("document_b_id") @db.Uuid
  versionAId      String              @map("version_a_id") @db.Uuid
  versionBId      String              @map("version_b_id") @db.Uuid
  chunkAId        String              @map("chunk_a_id") @db.Uuid // chunks de Guille, solo por ID
  chunkBId        String              @map("chunk_b_id") @db.Uuid
  messageId       String              @map("message_id") @db.Uuid // messages de Guille, solo por ID
  question        String              @db.VarChar(2000)
  status          ConflictAlertStatus @default(OPEN)
  occurrences     Int                 @default(1)
  firstDetectedAt DateTime            @default(now()) @map("first_detected_at") @db.Timestamptz(3)
  lastDetectedAt  DateTime            @default(now()) @map("last_detected_at") @db.Timestamptz(3)
  resolvedAt      DateTime?           @map("resolved_at") @db.Timestamptz(3)
  resolvedById    String?             @map("resolved_by_id") @db.Uuid // users de A, solo por ID
  resolutionNote  String?             @map("resolution_note") @db.VarChar(500)

  documentA Document        @relation("ConflictAlertDocumentA", fields: [documentAId], references: [id], onDelete: Cascade)
  documentB Document        @relation("ConflictAlertDocumentB", fields: [documentBId], references: [id], onDelete: Cascade)
  versionA  DocumentVersion @relation("ConflictAlertVersionA", fields: [versionAId], references: [id], onDelete: Cascade)
  versionB  DocumentVersion @relation("ConflictAlertVersionB", fields: [versionBId], references: [id], onDelete: Cascade)

  @@unique([versionAId, versionBId]) // R13: destino del ON CONFLICT del registro
  @@index([status, lastDetectedAt]) // abiertas y openTotal
  @@index([status, resolvedAt]) // resueltas
  @@index([documentAId])
  @@index([documentBId])
  @@map("document_conflict_alerts")
}
```

En `Document` y `DocumentVersion` (también de la pareja C) se suman los campos de relación, sin columnas nuevas:

```prisma
// model Document
  conflictAlertsAsA DocumentConflictAlert[] @relation("ConflictAlertDocumentA")
  conflictAlertsAsB DocumentConflictAlert[] @relation("ConflictAlertDocumentB")

// model DocumentVersion
  conflictAlertsAsA DocumentConflictAlert[] @relation("ConflictAlertVersionA")
  conflictAlertsAsB DocumentConflictAlert[] @relation("ConflictAlertVersionB")
```

`Chunk`, `Message`, `Conversation` y los modelos de las parejas A y B no cambian.

**Lo que genera Prisma y lo que no:**

| Objeto | Nombre | ¿Lo genera Prisma? |
| --- | --- | --- |
| Enum | `ConflictAlertStatus` | Sí |
| Tabla y clave primaria | `document_conflict_alerts`, `document_conflict_alerts_pkey` | Sí |
| Único del par de versiones | `document_conflict_alerts_version_a_id_version_b_id_key` | Sí |
| Índices | `document_conflict_alerts_status_last_detected_at_idx`, `…_status_resolved_at_idx`, `…_document_a_id_idx`, `…_document_b_id_idx` | Sí |
| FK | `document_conflict_alerts_document_a_id_fkey`, `…_document_b_id_fkey`, `…_version_a_id_fkey`, `…_version_b_id_fkey` | Sí |
| `CHECK` del orden del par | `document_conflict_alerts_pair_order_check` | **No: a mano** (1.3) |
| `CHECK` de la resolución | `document_conflict_alerts_resolution_check` | **No: a mano** (1.3) |
| `CHECK` de las repeticiones | `document_conflict_alerts_occurrences_check` | **No: a mano** (1.3) |

Todos los índices de esta tabla los genera Prisma: no hace falta escribir ninguno a mano. Prisma no describe los `CHECK`, pero tampoco los borra en las migraciones siguientes (no los compara). Igual se verifican en el test de 1.4.

### 1.2 Pasos

Desde `apps/api`, con `DATABASE_URL` apuntando a la base de desarrollo (`manual`):

1. Editar `prisma/schema.prisma` como en 1.1.
2. `pnpm exec prisma migrate dev --create-only --name add_document_conflict_alerts`
3. Revisar `prisma/migrations/<fecha>_add_document_conflict_alerts/migration.sql`:
   1. **Borrar todo `DROP INDEX`** de índices escritos a mano en otras migraciones. En particular, `chunks_embedding_idx`, `chunks_content_fts_idx` y `chunks_content_fts_es_unaccent_idx`, si aparecen.
   2. Confirmar que el resto solo hace esto:
      - `CREATE TYPE "ConflictAlertStatus"`;
      - `CREATE TABLE "document_conflict_alerts"`;
      - los cinco `CREATE (UNIQUE) INDEX` de la tabla de 1.1;
      - los cuatro `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`.

      Ningún `ALTER` ni `DROP` sobre otras tablas. Si aparece otro, **frenar**: el esquema se desvió de las migraciones.
   3. **Agregar al final** el SQL de 1.3, tal cual.
4. `pnpm exec prisma migrate deploy`
5. `pnpm exec prisma generate` (`migrate deploy` no regenera el cliente).
6. Comprobar en la base de desarrollo, con la consulta de 1.4 (`psql` o Prisma Studio no muestran los `CHECK`; la consulta sí).
7. Con el test de 1.4 escrito antes (falla), correr `pnpm --filter api test:e2e test/documents/indexes`. Resetea `manual_test` y aplica todas las migraciones desde cero, así que prueba que el `migration.sql` editado es el que queda.

### 1.3 El SQL a mano (al final del `migration.sql`)

```sql
-- Escrito a mano (spec 011, sección 7.1; plan 011, 1.3): Prisma no genera los CHECK.
-- R11 y R2: A es el documento de id menor, y nunca el mismo documento dos veces.
ALTER TABLE "document_conflict_alerts"
  ADD CONSTRAINT "document_conflict_alerts_pair_order_check"
  CHECK ("document_a_id" < "document_b_id");

-- R15: una resuelta tiene fecha y quién; una abierta no tiene ninguno de los tres datos.
ALTER TABLE "document_conflict_alerts"
  ADD CONSTRAINT "document_conflict_alerts_resolution_check"
  CHECK (
    ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_id" IS NOT NULL)
    OR
    ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_id" IS NULL AND "resolution_note" IS NULL)
  );

-- R13: una alerta se crea con 1 y solo suma.
ALTER TABLE "document_conflict_alerts"
  ADD CONSTRAINT "document_conflict_alerts_occurrences_check"
  CHECK ("occurrences" >= 1);
```

`uuid < uuid` compara los 16 bytes. Es el mismo orden que el texto en minúsculas, que es el que usa `orderConflictPair` en el código (PD8).

### 1.4 Verificación

**Consulta para la base de desarrollo** (paso 6):

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'document_conflict_alerts'::regclass AND contype = 'c'
ORDER BY conname;
-- Tres filas: …_occurrences_check, …_pair_order_check, …_resolution_check.

SELECT indexname FROM pg_indexes
WHERE schemaname = current_schema()
  AND indexname IN ('chunks_embedding_idx', 'chunks_content_fts_idx', 'chunks_content_fts_es_unaccent_idx');
-- Tres filas: la migración nueva no borró los índices escritos a mano.
```

**En `test/documents/indexes.e2e-spec.ts`** (nuestro), un `describe` nuevo, "Alertas de contradicciones (spec 011)":

- **Existen los `CHECK`:** `pg_constraint` con `contype = 'c'` y `conrelid = 'document_conflict_alerts'::regclass` devuelve exactamente los tres nombres de 1.3.
- **Existen los índices:** `pg_indexes` tiene el único y los cuatro índices de 1.1. Los tres de `chunks` ya los exige `REQUIRED_INDEXES` del mismo archivo, que no cambia.
- **Los `CHECK` y el único funcionan (E18).** Con dos documentos sembrados (`seedDocument`), un helper `insertAlert(overrides)` inserta con `$executeRaw`, como `insertVersion`:
  - el par en orden → se acepta;
  - el par al revés (`document_a_id > document_b_id`) → rechaza con `/document_conflict_alerts_pair_order_check/`;
  - el mismo documento en A y B → rechaza con el mismo `CHECK`;
  - `RESOLVED` sin `resolved_at`, y `OPEN` con `resolved_by_id` → rechaza con `/document_conflict_alerts_resolution_check/`;
  - `occurrences = 0` → rechaza con `/document_conflict_alerts_occurrences_check/`;
  - el mismo par de versiones dos veces → rechaza con `/document_conflict_alerts_version_a_id_version_b_id_key/`.
- **La limpieza:** `cleanDocuments` (`TRUNCATE document_versions, document_areas, documents CASCADE`) también vacía la tabla nueva por las FK, así que el `beforeEach` del archivo no cambia.

## 2. La API

### 2.1 La marca (`chat-conflict.ts`, nuevo; R5, R6)

```ts
export const CONFLICT_MARKER = 'CONFLICT';
// La primera línea, sin espacios iniciales: exactamente "CONFLICT [Sx] [Sy]".
const MARKER_LINE = /^CONFLICT \[S(\d+)\] \[S(\d+)\]$/;

export type MarkerReading =
  | { kind: 'none' } // no empieza con CONFLICT
  | { kind: 'conflict'; first: RetrievedChunk; second: RetrievedChunk; body: string } // first: el de número menor
  | { kind: 'invalid'; body: string; reason: string }; // R6: se trata como answered

// Puro. chunks son los de la consulta, en el orden de S1, S2…
export function readConflictMarker(text: string, chunks: RetrievedChunk[]): MarkerReading;

// R7: quita del texto las marcas [Sn] que no son x ni y.
export function keepOnlyRefs(body: string, refs: [number, number]): string;
```

**Reglas de `readConflictMarker`, en orden:**
1. Si el texto, sin los espacios iniciales, no empieza con `CONFLICT` → `none`.
2. Se separa la primera línea (hasta el primer `\n`) del resto (`body`, sin espacios al principio ni al final).
3. **Casos `invalid`:**
   - la línea no cumple `MARKER_LINE`;
   - `x === y`;
   - un número fuera de `1..chunks.length`;
   - los dos pasajes son del mismo `documentId`;
   - `body` vacío.

   Cada uno con su `reason`, para el log.
4. Si no → `conflict`, con los dos fragmentos ordenados por su número de pasaje.

### 2.2 `finishChat` (`chat-pipeline.ts`; R5 a R7, R17 de la spec 009 no cambia)

```ts
export interface Outcome {
  status: ChatResultStatus;
  answer: string;
  chunks: RetrievedChunk[];
  llm?: LlmAnswer;
  conflict?: { first: RetrievedChunk; second: RetrievedChunk }; // spec 011: solo con status conflict
}

export function finishChat(llm: LlmAnswer, chunks: RetrievedChunk[], logger?: Pick<Logger, 'warn'>): Outcome;
```

**Orden dentro de `finishChat`:**
1. `NO_INFO` primero, sin cambios.
2. `readConflictMarker(llm.text, chunks)`:
   - **`conflict`:** `status: 'conflict'`, `answer: keepOnlyRefs(body, [x, y])`, `chunks: [first, second]` y `conflict: { first, second }`;
   - **`invalid`:** `logger?.warn` con el `reason` y la línea, y sigue con `body` como si fuera el texto: vacío → `no_info` con `NO_INFO_TEXT`; si no → `answered` con `citedChunks(body, chunks)`;
   - **`none`:** lo de hoy.

`saveResult` no cambia: guarda `outcome.chunks` (los dos de la contradicción) y el estado. `toSources` los devuelve en ese orden (R7).

### 2.3 El retén de las dos marcas (`chat-stream.service.ts`; R8, D9; PD3)

`NoInfoGate` pasa a `MarkerGate` y recibe los fragmentos de la consulta:

```ts
class MarkerGate {
  constructor(private readonly chunks: RetrievedChunk[], private readonly emit: (text: string) => void) {}
  push(part: string): void;
  end(): void;
}
```

**Mientras espera,** con `text = buffer.trimStart()`:
1. **Empieza con `NO_INFO`** → `closed` (como hoy).
2. **Empieza con `CONFLICT`:**
   - espera a que haya un `\n` en `text`, o a `end()`;
   - con la línea completa, `readConflictMarker(text, chunks)`:
     - `conflict` → `closed`, sin `delta` (D9);
     - `invalid` → `open`, y emite `body` si no está vacío.
3. **Sigue esperando** mientras `text` tenga menos caracteres que `NO_INFO` (la regla de la spec 009, para que sus `delta` no cambien) o sea el principio de `CONFLICT` (`'CONFLICT'.startsWith(text)`, por ejemplo "CONFLIC"). "Empieza con la marca" es la palabra `CONFLICT` sola, seguida de un espacio, un salto de línea o el fin (`startsWithMarker`): "CONFLICTIVO…" sale como texto (R6).
4. **Si no** → `open` y emite `text`, como hoy.

`end()` decide con lo que haya, con las mismas reglas.

Así los `delta` unidos siguen siendo el `answer` de `done` cuando la respuesta es `answered` (R5 de la spec 009), también con una marca inválida, porque los dos usan el mismo `body`. Las demás reglas del retén (no emitir después de `closed`, emitir directo en `open`) no cambian.

### 2.4 El prompt (`adapters/gemini-chat-llm.ts`, Guille; R4, R21)

`SYSTEM_PROMPT` suma cinco líneas después de la de `NO_INFO`: tres el 05/11/2026 y dos en el ajuste del 10/11/2026.

```text
- Si dos pasajes de documentos distintos dicen cosas incompatibles sobre lo que se pregunta, la primera línea de tu respuesta debe ser exactamente: CONFLICT [Sx] [Sy], con las marcas de esos dos pasajes. Después, explicá en pocas líneas qué dice cada uno, citando solo [Sx] y [Sy], sin elegir uno.
- CONFLICT solo vale entre pasajes de documentos distintos.
- No es una contradicción que un pasaje sea más detallado que otro, que se complementen o que hablen de casos distintos.
- Una regla específica que es excepción de una general (por ejemplo, un plazo distinto para una categoría de productos) no es una contradicción: aplicá la regla específica y respondé con una conclusión clara.
- Si los pasajes no alcanzan para responder, NO_INFO tiene prioridad sobre CONFLICT.
```

La segunda y la cuarta línea se sumaron el 10/11/2026 (spec, ajuste de R4). Desde el 11/11/2026, las cinco van solo con pasajes de al menos dos documentos, y una marca entre pasajes del mismo documento lleva a un segundo pedido (spec, ajuste del 11/11/2026 en R4, R6 y R8; aviso 9 para Guille).

`buildPrompt` y el bloque del paso (spec 010) no cambian.

### 2.5 El registro de la alerta (R11 a R13, R19; PD4 a PD6)

**El orden del par** (`documents/conflict-alerts/conflict-pair.ts`, nuevo, puro):

```ts
export interface ConflictSide { documentId: string; versionId: string; chunkId: string }
// R11: A es el de documentId menor (minúsculas, como uuid en PostgreSQL). Lanza si son iguales.
export function orderConflictPair(x: ConflictSide, y: ConflictSide): { a: ConflictSide; b: ConflictSide };
```

**El puerto** (`chat/ports/conflict-alert-recorder.ts`, nuevo):

```ts
export interface ConflictAlertInput {
  messageId: string;
  question: string;
  first: RetrievedChunk;
  second: RetrievedChunk;
}

export abstract class ConflictAlertRecorder {
  abstract record(input: ConflictAlertInput): Promise<void>;
}
```

**El adaptador** (`chat/adapters/prisma-conflict-alert-recorder.ts`, nuevo): ordena con `orderConflictPair` y registra en una sola sentencia (R13):

```sql
INSERT INTO document_conflict_alerts
  (id, document_a_id, document_b_id, version_a_id, version_b_id, chunk_a_id, chunk_b_id, message_id, question)
VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (version_a_id, version_b_id) DO UPDATE
  SET occurrences = document_conflict_alerts.occurrences + 1,
      last_detected_at = now()
  WHERE document_conflict_alerts.status = 'OPEN';
```

Con `$executeRaw` y `::uuid` en cada id. Una resuelta no cambia (el `WHERE` del `DO UPDATE`). La pregunta llega recortada a 2.000 por el DTO.

**La función compartida** (`chat-conflict.ts`):

```ts
// R12: después de saveResult. Solo con status conflict; un error queda en el log y no se propaga.
export async function recordConflictAlert(
  recorder: ConflictAlertRecorder | undefined,
  outcome: Outcome,
  result: ChatResult,
  question: string,
  logger: Pick<Logger, 'error' | 'warn'>,
): Promise<void>;
```

- **Sin `conflict`:** no hace nada, ni consulta la base (E17).
- **Sin `recorder`:** `warn` y nada más. No pasa en la app, donde el módulo siempre lo da (PD6).
- **Si `record` falla:** `error`, con el mensaje, los dos `documentId` y la causa (E16).

### 2.6 Las dos rutas (R8, R12, R21)

- **`ChatStreamService`:**
  - el constructor suma `@Optional() private readonly conflictAlerts?: ConflictAlertRecorder`, después de `contextStore`;
  - en `answer`, `new MarkerGate(prepared.chunks, …)` y `finishChat(llm, prepared.chunks, this.logger)`;
  - en `run`, después de `saveResult` y antes de `sink.done`, `await recordConflictAlert(…)`.

  Si el cliente cortó, `run` ya volvió antes de guardar (R11 de la spec 009), así que tampoco registra.
- **`ChatService` (Guille):**
  - el constructor suma `@Optional() private readonly conflictAlerts?: ConflictAlertRecorder`, después de `contextStore`;
  - en `ask`, el resultado de `saveResult` pasa por `recordConflictAlert` antes de devolverlo;
  - en `run`, `finishChat(llm, prepared.chunks, this.logger)`.

  Sin contradicción, los pasos y su orden son los de hoy. `chat.service.spec.ts` no cambia.
- **`chat.module.ts`:** `{ provide: ConflictAlertRecorder, useClass: PrismaConflictAlertRecorder }`.
- **`testing/chat-fakes.ts`:** `FakeConflictAlertRecorder`, que guarda lo que recibe y puede fallar a pedido.
- **Swagger:** en la descripción de los eventos y en `POST /api/chat/stream`, que `conflict` no trae `delta` y que `sources` son los dos pasajes.

### 2.7 Las alertas en documentos (`documents/conflict-alerts/`, nuevo; R14 a R17, R20)

| Archivo | Qué tiene |
| --- | --- |
| `conflict-pair.ts` | `orderConflictPair` (2.5) |
| `conflict-alerts.repository.ts` | El puerto `ConflictAlertsRepository` y los tipos `ConflictAlertRecord`, `ConflictAlertPage` |
| `prisma-conflict-alerts.repository.ts` | El adaptador |
| `conflict-alerts.service.ts` | `list` y `resolve`, con la auditoría y los nombres |
| `conflict-alerts.controller.ts` | `GET /conflict-alerts` y `POST /conflict-alerts/:id/resolve` |
| `dto/list-conflict-alerts.query.ts` | `status` (`OPEN` por defecto, o `RESOLVED`), `page` y `limit`, como `ListDocumentsQuery` |
| `dto/resolve-conflict-alert.dto.ts` | `note?` (`@IsOptional() @IsString() @MaxLength(500)`); en el servicio, `trim()` y vacío → `null` |
| `dto/conflict-alert.response.ts` | La forma de R14, con `@ApiProperty`, mapeada campo por campo |

**El repositorio:**

```ts
export abstract class ConflictAlertsRepository {
  abstract list(q: { status: 'OPEN' | 'RESOLVED'; page: number; limit: number }): Promise<ConflictAlertPage>; // items, total, openTotal
  abstract findById(id: string): Promise<ConflictAlertRecord | null>;
  // R15: solo si está OPEN. false si no se actualizó (no existe o ya estaba resuelta).
  abstract resolve(id: string, by: string, note: string | null, at: Date): Promise<boolean>;
}
```

- **`list`:**
  - **Página:** `findMany` con `include` de `documentA`, `documentB` (`title`, `status`), `versionA` y `versionB` (`versionNumber`, `status`);
  - **Orden:** `lastDetectedAt desc` (abiertas) o `resolvedAt desc` (resueltas), con `id` para desempatar;
  - **Secciones:** un `chunk.findMany({ where: { id: { in } }, select: { id, section } })`, en solo lectura. Lo que no está queda como "Sin sección";
  - **Totales:** `count` del filtro y `count` de `OPEN`, en la misma `$transaction`.

  En total, tres consultas por página.
- **`resolve`:** `updateMany({ where: { id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt, resolvedById, resolutionNote } })` y `count === 1`.
- **Errores:** los de Prisma que son de conexión pasan a `RepositoryUnavailableError` (`isUnavailable`, como en `prisma-documents.repository.ts`).

**El servicio:**
- **`list`:** el repositorio y `findUsersByIds` con los `resolvedById` distintos de la página, para armar `resolvedBy` como las referencias de la spec 008 (`{ id, name, isActive }`; sin usuario, `null`).
- **`resolve`:**
  1. `repository.resolve`;
  2. si da `false`, `findById`: `null` → 404 "No se encontró la alerta"; existe → 409 "La alerta ya está resuelta";
  3. si da `true`, `findById` y la respuesta.

  Audita el éxito y el fallo (R16).
- **Errores:** pasan por `toHttpException`.

**La auditoría** (`ports/audit-log.ts`, nuestro):
- `AuditAction` suma `'CONFLICT_ALERT_RESOLVE'`;
- `AuditEntry` suma `conflictAlertId?` y `relatedDocumentId?`. `documentId` es el A; `relatedDocumentId`, el B;
- `LoggerAuditLog` no cambia: ya escribe la entrada entera.

**El controlador:**
- `@Controller('conflict-alerts')`, `@UseGuards(JwtAuthGuard, RolesGuard)` y `@Roles('ADMIN')` (403 para los demás, R14);
- `:id` con `ParseUUIDPipe` (400), `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` (400 por parámetros de más, como en las métricas);
- **Swagger:** las respuestas 200, 400, 401, 403, 404, 409 y 503.

`documents.module.ts` suma el controlador, el servicio y `{ provide: ConflictAlertsRepository, useClass: PrismaConflictAlertsRepository }`.

## 3. La web

### 3.1 El aviso en el chat (F1 a F4; PD9, PD10)

- **`useChatConversation.ts`:**
  - `sources: done.status === 'answered' || done.status === 'conflict' ? done.sources : []`;
  - el anuncio, con `conflict`: `Dos documentos dicen cosas distintas. ${withoutMarkers(done.answer)}`.
- **`components/chat/ConflictNotice.tsx`, nuevo:** la caja `bg-durazno text-durazno-texto` con `⚠` (`aria-hidden`) y "Dos documentos dicen cosas distintas" en negrita, y debajo "Revisá las dos fuentes antes de seguir. Le avisamos al administrador para que lo revise.".
- **`ChatMessage.tsx`:** `case 'conflict'` sale del grupo de `no_info` y muestra `ConflictNotice`, `Answer` (las citas de la spec 009) y `ChatSources` con el título "Las dos fuentes".
- **`ChatSources.tsx`:** una prop opcional `title?: string`. Con ella, un párrafo con el título antes de la lista, y la lista con `aria-label={title}`. Sin ella, igual que hoy.
- **El panel del paso** (spec 010) usa el mismo `ChatMessage`. En su ancho, las fuentes ya se apilan con `flex-wrap` (F4).

### 3.2 El cliente de las alertas (`lib/api/conflict-alerts.ts`, nuevo)

```ts
export type ConflictAlertStatus = 'OPEN' | 'RESOLVED';
export interface ConflictAlertDocument {
  id: string; title: string; status: 'ACTIVE' | 'ARCHIVED';
  versionNumber: number; section: string; isCurrentVersion: boolean;
}
export interface ConflictAlert {
  id: string; status: ConflictAlertStatus;
  documents: [ConflictAlertDocument, ConflictAlertDocument];
  question: string; firstDetectedAt: string; lastDetectedAt: string; occurrences: number;
  resolvedAt: string | null; resolvedBy: DocumentReference | null; resolutionNote: string | null; // spec 008: { id, name, isActive }
}
export interface ConflictAlertPage { data: ConflictAlert[]; total: number; openTotal: number; page: number; limit: number }

export function listConflictAlerts(status: ConflictAlertStatus, page: number, limit: number, signal?: AbortSignal): Promise<ConflictAlertPage>;
export function resolveConflictAlert(id: string, note?: string): Promise<ConflictAlert>;
```

- Se exporta desde `lib/api/index.ts`.
- `error-messages.ts` suma el contexto `'conflict-alert'`. Un 409 da "Otra persona ya la marcó como resuelta"; un 404, "La alerta ya no existe"; los demás, los mensajes generales.

### 3.3 El acceso "Alertas (n)" (`components/documents/ConflictAlertsLink.tsx`, nuevo; F5)

- Como `PendingReviewLink`:
  - `useApiResource('conflict-alerts-count:<userId>', (s) => listConflictAlerts('OPEN', 1, 1, s))`;
  - nada mientras carga;
  - con un error, "Alertas" sin número;
  - si no, "Alertas (n)" con `aria-label` "Alertas: n abiertas" (o "1 abierta").
- **`DocumentList.tsx`:** lo monta junto a `PendingReviewLink`, solo si `user.role === 'ADMIN'`.

### 3.4 La sección (`/documentos/alertas`; F6 a F9; PD11)

- **`app/documentos/alertas/page.tsx`:** como `por-revisar/page.tsx`:
  - `metadata` "Alertas · Manual de operaciones";
  - "← Volver a Documentos", `PageHeader` y `<Suspense>`;
  - todo dentro de `<RequireRole roles={['ADMIN']}>`.

  Es un segmento fijo, así que Next lo resuelve antes que `/documentos/[id]`.
- **`components/documents/ConflictAlertList.tsx`:**
  - lee `estado` y `pagina` de la URL;
  - las dos píldoras "Abiertas (n)" (con `openTotal`) y "Resueltas", con `aria-current` en la activa;
  - las tarjetas, `Pagination` (la del listado) y los estados vacíos y de carga de F9. `Pagination` suma un parámetro opcional, `extraQuery`, para que cada enlace conserve `estado=resueltas`; sin él, sus enlaces no cambian.
- **`components/documents/ConflictAlertCard.tsx`:** la tarjeta de F7.
  - Las fechas pasan por `formatDay` (`lib/documents/format.ts`: `DD/MM/AAAA`, el día en Buenos Aires), y quien resolvió, por `formatPerson` ("(inactivo)" si está desactivado).
  - "● Archivado" con `gris-reemplazada` y "Hay una versión nueva" con `durazno`, siempre con texto.
- **`components/documents/ResolveAlertDialog.tsx`:** el `<dialog>` de F8, como `ArchiveDialog`, con el campo de nota y su contador.
  - Al confirmar, vuelve a pedir la página (`reload` de `useApiResource`), y con ella el número de "Abiertas (n)". El acceso de `/documentos` no comparte caché: lo vuelve a pedir al volver a esa pantalla.
  - Ante un 409, el diálogo se cierra, la lista muestra el mensaje en un `role="status"` y vuelve a pedir la página.

## 4. Estrategia de pruebas

### 4.1 Unitarios (Jest, API)

| Qué se prueba | Casos |
| --- | --- |
| `chat-conflict.spec.ts` (`readConflictMarker`, `keepOnlyRefs`) | Válida (E1); mismo documento (E6); `x === y`; número fuera de rango (`[S9]` con 6); línea con texto de más; minúsculas; sin cuerpo; espacios iniciales; `NO_INFO` no es `CONFLICT`; `keepOnlyRefs` quita `[S4]` y deja `[S1]` y `[S3]` |
| `chat-conflict.spec.ts` (`recordConflictAlert`) | Sin `conflict` no llama al recorder (E17); con `conflict` le pasa el mensaje, la pregunta y los dos fragmentos (E1); un error se loguea y no se propaga (E16); sin recorder, `warn` |
| `chat-pipeline.spec.ts` (se suman casos) | `finishChat` con marca válida: `conflict`, `answer` sin la línea, `chunks` en orden de pasaje (E1); inválida: `answered` sin la línea y `warn` (E6); inválida y sin cuerpo: `no_info`; `NO_INFO` sigue primero; sin marca, igual que hoy (E17) |
| `chat-stream.service.spec.ts` (se suman casos) | La marca partida en varias partes (`CON`, `FLICT [S`, `1] [S3]\n…`): ningún `delta` y `done` con `conflict` (E4); inválida: los `delta` son el cuerpo y unidos dan el `answer` (E6); texto que empieza con "CON" pero no es la marca ("Consultá…"): sale entero; `run` registra la alerta antes de `done`; un recorder que falla no cambia `done` (E16); cortado por el cliente, ni guarda ni registra |
| `gemini-chat-llm.spec.ts` (se suman casos) | El sistema trae las tres líneas nuevas, en `answer` y en `stream`; `buildPrompt` sin cambios |
| `chat.service.spec.ts` (de Guille) | **Sin cambios** |
| `chat-routes.parity.spec.ts` (se suman casos) | Con el modelo respondiendo la marca: las dos rutas dan el mismo `status`, `answer` y `sources`, guardan lo mismo y registran lo mismo (E3); marca inválida, igual |
| `conflict-pair.spec.ts` | El orden no depende del orden de entrada (E8); mayúsculas y minúsculas; el mismo documento lanza |
| `dto/*.spec.ts` | `status` inválido, `limit` 101, parámetro de más → error; `note` de 501 → error |
| `conflict-alerts.service.spec.ts` | `list` con nombres de quien resolvió; `resolve`: éxito con auditoría (E13), ya resuelta → 409 (E14), no existe → 404, nota de espacios → `null`, repositorio caído → 503; auditoría del fallo |
| `conflict-alerts.controller.spec.ts` | Los metadatos: `@Roles('ADMIN')` y los guards (E12) |

### 4.2 Integración (Supertest + PostgreSQL, API)

- **`test/documents/indexes.e2e-spec.ts`** (se suma el `describe` de 1.4): E18.
- **`test/chat/chat-conflict.e2e-spec.ts`**, nueva, con el arnés de la spec 009 (`createDocumentsTestApp({ configure })`), el modelo y los embeddings simulados, y dos documentos con fragmentos sembrados:
  - **E1:** por las dos rutas, `conflict` con las dos fuentes, el mensaje como `CONFLICT` y una fila en `document_conflict_alerts` con el par en orden, la pregunta y `occurrences = 1`;
  - **E8:** la misma contradicción con los pasajes al revés → misma fila, `occurrences = 2`. Dos pedidos en paralelo (`Promise.all`) → una fila con 2;
  - **R11 (sumado en T15):** el documento de id menor con un vector un poco más lejano, así S1 es siempre el de id mayor; la fila igual queda con A = el de id menor;
  - **E9:** con la fila resuelta → no cambia;
  - **E10:** una versión nueva de uno de los documentos (con `seedDocument` o un helper de versión) → una fila nueva;
  - **E7:** un EMPLOYEE de Ventas con un documento de Operaciones que contradice: los pasajes de Operaciones no llegan al modelo simulado (se comprueba lo que recibió);
  - **E5:** una versión `REPLACED` con fragmentos: no llega al modelo.
- **`test/documents/conflict-alerts.e2e-spec.ts`**, nueva:
  - **E11:** lista, orden, `openTotal`, secciones y `isCurrentVersion`;
  - **Swagger (sumado en T15):** `/api/docs-json` tiene las dos rutas con sus respuestas y la descripción de `conflict`;
  - **E12:** 401, y 403 para SUPERVISOR y EMPLOYEE;
  - **E13:** resolver con nota, y el estado y la nota en la base;
  - **E14:** 409;
  - un id inexistente → 404 y un id que no es UUID → 400;
  - **E15:** archivar uno y subir una versión del otro → la alerta sigue abierta, con `ARCHIVED` y `isCurrentVersion: false`.

Resetean `manual_test`: **se pide la confirmación del usuario**.

### 4.3 Web (Vitest + Testing Library)

| Qué se prueba | Casos |
| --- | --- |
| `ChatMessage.test.tsx` (nuevo) | `conflict`: el aviso, la explicación con las citas y "Las dos fuentes" con dos enlaces (E2); `no_info` sigue en la caja punteada |
| `ChatScreen.states.test.tsx` (se suman casos) | `done` con `conflict` guarda las fuentes y anuncia "Dos documentos dicen cosas distintas…" (E2) |
| `ChatSources.test.tsx` (nuevo) | Sin `title`, igual que hoy; con `title`, el párrafo y el `aria-label` |
| `ChatScreen.test.tsx`, `ChatPanel.test.tsx` | **Sin cambios** |
| `tests/lib/api/conflict-alerts.test.ts` | Las rutas, los parámetros y el cuerpo de `resolve` |
| `ConflictAlertsLink.test.tsx` | Con el número; sin número si falla; nada mientras carga (E11) |
| `DocumentList.test.tsx` (se suman casos) | El acceso solo para el ADMIN (E12) |
| `ConflictAlertList.test.tsx` | Las píldoras y la URL; vacíos; la tarjeta abierta y la resuelta; "Archivado" y "Hay una versión nueva" (E15); sin quién preguntó (E11) |
| `ResolveAlertDialog.test.tsx` | Con nota y sin nota (E13); contador de 500; 409 → mensaje y recarga (E14) |

### 4.4 Playwright con la API simulada

`mock-api.ts` (nuestro) suma los handlers `conflictAlerts` (`GET /api/conflict-alerts`) y `resolveConflictAlert`, y una respuesta `conflict` para `chatStream`.

- **`e2e/alertas.spec.ts`, nueva:**
  - el ADMIN ve "Alertas (1)", entra, ve la tarjeta y la marca como resuelta con una nota (E11, E13);
  - un EMPLOYEE no ve el acceso (E12).
- **`e2e/asistente.spec.ts`** (se suma un caso): una respuesta `conflict` muestra el aviso y las dos fuentes (E2).

En escritorio y celular.

## 5. Escenario → test

| Escenario | Unitario (API) | Integración | Web / Playwright |
| --- | --- | --- | --- |
| E1 · Se contradicen | `chat-conflict.spec.ts`, `chat-pipeline.spec.ts` | `chat-conflict.e2e-spec.ts` | — |
| E2 · El aviso | — | — | `ChatMessage`, `ChatScreen.states`, `asistente.spec.ts` |
| E3 · Rutas iguales | `chat-routes.parity.spec.ts` | `chat-conflict.e2e-spec.ts` | — |
| E4 · La marca no se transmite | `chat-stream.service.spec.ts` | — | — |
| E5 · Se prioriza el vigente | — | `chat-conflict.e2e-spec.ts` | — |
| E6 · Mismo documento | `chat-conflict.spec.ts`, `chat-pipeline.spec.ts`, `chat-stream.service.spec.ts` | — | — |
| E7 · Documento que no ve | — | `chat-conflict.e2e-spec.ts` | — |
| E8 · Otra vez | `conflict-pair.spec.ts` | `chat-conflict.e2e-spec.ts` | — |
| E9 · Resuelta no se reabre | — | `chat-conflict.e2e-spec.ts` | — |
| E10 · Versión nueva | — | `chat-conflict.e2e-spec.ts` | — |
| E11 · Ver las alertas | `conflict-alerts.service.spec.ts` | `conflict-alerts.e2e-spec.ts` | `ConflictAlertsLink`, `ConflictAlertList`, `alertas.spec.ts` |
| E12 · Otros roles | `conflict-alerts.controller.spec.ts` | `conflict-alerts.e2e-spec.ts` | `DocumentList`, `alertas.spec.ts` |
| E13 · Resolver | `conflict-alerts.service.spec.ts` | `conflict-alerts.e2e-spec.ts` | `ResolveAlertDialog`, `alertas.spec.ts` |
| E14 · Ya resuelta | `conflict-alerts.service.spec.ts` | `conflict-alerts.e2e-spec.ts` | `ResolveAlertDialog` |
| E15 · Cambió el documento | — | `conflict-alerts.e2e-spec.ts` | `ConflictAlertList` |
| E16 · Falla el registro | `chat-conflict.spec.ts`, `chat-stream.service.spec.ts` | — | — |
| E17 · Sin contradicción | `chat.service.spec.ts` (sin cambios), `chat-pipeline.spec.ts`, `chat-conflict.spec.ts` | — | `ChatScreen` (sin cambios) |
| E18 · Reglas de la tabla | — | `indexes.e2e-spec.ts` | — |

## 6. Dependencias nuevas

Ninguna.

## 7. Orden de merge

1. **La migración (T01)**, sola y primero: sin ella, el cliente de Prisma no tiene el modelo.
2. **La API del chat (T02 a T07)** y la de documentos (T08) pueden ir en paralelo; la integración (T09) va después de las dos.
3. **La web** puede ir después de la API, o junto con ella. El aviso del chat (T10) no depende de las alertas.

## 8. Decisiones y preguntas abiertas

### 8.1 Decisiones

Propuestas al escribir el plan, el 05/11/2026:

| Pregunta | Decisión | Regla |
| --- | --- | --- |
| PD1 · ¿Dónde va el análisis de la marca? | En un archivo nuevo, `chat-conflict.ts`, con funciones puras. `chat-pipeline.ts` solo lo llama desde `finishChat` | R5, R6, R19 |
| PD2 · ¿Cómo loguea `finishChat` una marca inválida? | Con un `logger` opcional como tercer parámetro: las llamadas de hoy siguen compilando | R6 |
| PD3 · ¿Cómo sabe el retén si la marca es válida? | `MarkerGate` recibe los fragmentos y usa la misma `readConflictMarker` que `finishChat`, así nunca deciden distinto | R8 |
| PD4 · ¿Por qué un puerto del chat para registrar, y no el repositorio de documentos? | El chat no depende del módulo de documentos ni de su DI. Lo único compartido es `orderConflictPair`, una función pura | R19, R20 |
| PD5 · ¿Por qué SQL a mano para registrar? | Prisma `upsert` no admite el `WHERE` del `DO UPDATE` (una resuelta no suma) y hace dos sentencias. `INSERT … ON CONFLICT` es una sola y resuelve la concurrencia | R13 |
| PD6 · ¿Qué pasa si el chat no tiene el recorder? | Un `warn`; la dependencia es opcional para que los tests de Guille no cambien. En la app siempre está | R12, R21 |
| PD7 · ¿FK a `chunks` y `messages`? | No: solo por ID (D16) | Sección 7.1 de la spec |
| PD8 · ¿Cómo se ordena el par en el código? | Por `documentId` en minúsculas, comparado como texto: coincide con `uuid < uuid` de PostgreSQL, así el `CHECK` nunca rechaza un registro del código | R11 |
| PD9 · ¿El título "Las dos fuentes"? | Una prop opcional en `ChatSources`, que hoy no tiene título; sin ella, igual que hoy | F2 |
| PD10 · ¿Cómo se anuncia? | El mismo `aria-live` de la spec 009, con el título del aviso antes de la explicación | F3 |
| PD11 · ¿Cómo se protege la página? | `RequireRole roles={['ADMIN']}`, de la pareja A, importado sin cambiarlo; la API igual responde 403 | F6, R14 |
| PD12 · ¿Dónde se prueban los `CHECK`? | En `test/documents/indexes.e2e-spec.ts`, el archivo que ya exige lo que las migraciones no pueden perder | Sección 1.4 |

### 8.2 Preguntas abiertas

Ninguna. Pendiente de otros, sin bloquear: que Guille revise el prompt y los cambios mínimos (avisos 1 a 4 de la spec) y que la pareja A sume el enlace del menú (aviso 8).
