-- CreateEnum
CREATE TYPE "ProcedureVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');


-- CreateTable
CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_versions" (
    "id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ProcedureVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procedure_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steps" (
    "id" UUID NOT NULL,
    "procedure_version_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',

    CONSTRAINT "steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_areas" (
    "procedure_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,

    CONSTRAINT "procedure_areas_pkey" PRIMARY KEY ("procedure_id","area_id")
);

-- CreateIndex
CREATE INDEX "procedures_created_at_idx" ON "procedures"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_versions_procedure_id_version_number_key" ON "procedure_versions"("procedure_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_versions_one_draft_idx" ON "procedure_versions"("procedure_id") WHERE ("status" = 'DRAFT');

-- CreateIndex
CREATE UNIQUE INDEX "steps_procedure_version_id_step_order_key" ON "steps"("procedure_version_id", "step_order");

-- CreateIndex
CREATE INDEX "procedure_areas_area_id_idx" ON "procedure_areas"("area_id");

-- AddForeignKey
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_procedure_version_id_fkey" FOREIGN KEY ("procedure_version_id") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_areas" ADD CONSTRAINT "procedure_areas_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
