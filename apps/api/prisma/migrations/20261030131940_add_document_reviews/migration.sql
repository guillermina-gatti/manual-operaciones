-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "last_reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_reviewed_by_id" UUID;
