-- AlterTable
ALTER TABLE "document_versions"
ADD COLUMN "processing_started_at" TIMESTAMPTZ(3),
ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3),
ADD COLUMN "claim_token" UUID;

-- CreateIndex
CREATE INDEX "document_versions_processing_status_lease_expires_at_idx" ON "document_versions"("processing_status", "lease_expires_at");
