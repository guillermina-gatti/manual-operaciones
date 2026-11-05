-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "procedure_version_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_steps" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "executions_user_id_idx" ON "executions"("user_id");

-- CreateIndex
CREATE INDEX "executions_procedure_id_idx" ON "executions"("procedure_id");

-- CreateIndex
CREATE UNIQUE INDEX "executions_one_in_progress_idx" ON "executions"("user_id", "procedure_id") WHERE ("status" = 'IN_PROGRESS');

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_execution_id_step_id_key" ON "execution_steps"("execution_id", "step_id");

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_execution_id_step_order_key" ON "execution_steps"("execution_id", "step_order");

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
