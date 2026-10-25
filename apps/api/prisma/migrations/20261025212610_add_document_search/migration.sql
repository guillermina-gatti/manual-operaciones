-- R5: buscar sin distinguir tildes (spec 004, plan 2.2)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION es_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, spanish_stem;

-- Índice de texto completo sin tildes. Prisma no lo describe: ver el comentario de Chunk en schema.prisma
CREATE INDEX "chunks_content_fts_es_unaccent_idx" ON "chunks"
  USING gin (to_tsvector('es_unaccent'::regconfig, "content"));
