-- Búsqueda por palabras para el asistente: columna generada con la sección y el texto del fragmento, en
-- español, y su índice GIN. Aditivo: no cambia datos ni columnas existentes.
ALTER TABLE "chunks" ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', coalesce("section", '') || ' ' || "content")) STORED;

CREATE INDEX "chunks_content_tsv_idx" ON "chunks" USING GIN ("content_tsv");