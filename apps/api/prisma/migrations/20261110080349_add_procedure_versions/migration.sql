/*
  Warnings:

  - A unique constraint covering the columns `[procedure_id]` on the table `procedure_versions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[procedure_version_id,step_key]` on the table `steps` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "procedure_versions" ADD COLUMN     "change_summary" VARCHAR(300),
ADD COLUMN     "is_critical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published_at" TIMESTAMPTZ(3),
ADD COLUMN     "published_by_id" UUID;

-- AlterTable
ALTER TABLE "steps" ADD COLUMN     "step_key" UUID NOT NULL DEFAULT gen_random_uuid();

-- Los pasos que ya existían quedan con step_key = id (spec 015, D11): el default solo les habría
-- puesto un UUID al azar a cada uno.
UPDATE "steps" SET "step_key" = "id";

-- CreateIndex
CREATE UNIQUE INDEX "procedure_versions_one_published_idx" ON "procedure_versions"("procedure_id") WHERE ("status" = 'PUBLISHED');

-- CreateIndex
CREATE UNIQUE INDEX "steps_procedure_version_id_step_key_key" ON "steps"("procedure_version_id", "step_key");
