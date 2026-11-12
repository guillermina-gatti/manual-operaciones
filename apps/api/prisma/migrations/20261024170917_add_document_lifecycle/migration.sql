/*
  Warnings:

  - A unique constraint covering the columns `[document_id]` on the table `document_versions` will be added. If there are existing duplicate values, this will fail.

*/

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_one_current_idx" ON "document_versions"("document_id") WHERE ("status" = 'CURRENT');
