-- Extensión pgvector (primero, antes de la tabla)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "page_number" INTEGER,
    "token_count" INTEGER,
    "area_ids" UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "embedding" vector(768),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chunks_document_id_idx" ON "chunks"("document_id");

-- CreateIndex
CREATE INDEX "chunks_area_ids_idx" ON "chunks" USING GIN ("area_ids");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_document_version_id_chunk_index_key" ON "chunks"("document_version_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice semántico (HU17)
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Índice de texto completo en español, respaldo sin IA (HU36)
CREATE INDEX "chunks_content_fts_idx" ON "chunks" USING gin (to_tsvector('spanish', "content"));