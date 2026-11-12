-- CreateEnum
CREATE TYPE "ConflictAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "document_conflict_alerts" (
    "id" UUID NOT NULL,
    "document_a_id" UUID NOT NULL,
    "document_b_id" UUID NOT NULL,
    "version_a_id" UUID NOT NULL,
    "version_b_id" UUID NOT NULL,
    "chunk_a_id" UUID NOT NULL,
    "chunk_b_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "question" VARCHAR(2000) NOT NULL,
    "status" "ConflictAlertStatus" NOT NULL DEFAULT 'OPEN',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "first_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolution_note" VARCHAR(500),

    CONSTRAINT "document_conflict_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_conflict_alerts_status_last_detected_at_idx" ON "document_conflict_alerts"("status", "last_detected_at");

-- CreateIndex
CREATE INDEX "document_conflict_alerts_status_resolved_at_idx" ON "document_conflict_alerts"("status", "resolved_at");

-- CreateIndex
CREATE INDEX "document_conflict_alerts_document_a_id_idx" ON "document_conflict_alerts"("document_a_id");

-- CreateIndex
CREATE INDEX "document_conflict_alerts_document_b_id_idx" ON "document_conflict_alerts"("document_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_conflict_alerts_version_a_id_version_b_id_key" ON "document_conflict_alerts"("version_a_id", "version_b_id");

-- AddForeignKey
ALTER TABLE "document_conflict_alerts" ADD CONSTRAINT "document_conflict_alerts_document_a_id_fkey" FOREIGN KEY ("document_a_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_conflict_alerts" ADD CONSTRAINT "document_conflict_alerts_document_b_id_fkey" FOREIGN KEY ("document_b_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_conflict_alerts" ADD CONSTRAINT "document_conflict_alerts_version_a_id_fkey" FOREIGN KEY ("version_a_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_conflict_alerts" ADD CONSTRAINT "document_conflict_alerts_version_b_id_fkey" FOREIGN KEY ("version_b_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
