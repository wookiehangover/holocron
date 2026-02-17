-- Migration: 001_add_full_text_search
-- Created: 2026-02-17
--
-- Adds full-text search support to the file_chunks table:
--   1. Adds a `tsv` tsvector generated column derived from the `text` column.
--   2. Creates a GIN index on the new column for fast full-text queries.
--
-- The generated column auto-populates for existing rows — no backfill needed.
-- This migration is idempotent: safe to re-run on a database that already has
-- these objects.

-- Step 1: Add the tsvector generated column (if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'file_chunks'
       AND column_name = 'tsv'
  ) THEN
    ALTER TABLE file_chunks
      ADD COLUMN tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
  END IF;
END
$$;

-- Step 2: Create the GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_file_chunks_tsv ON file_chunks USING gin (tsv);

