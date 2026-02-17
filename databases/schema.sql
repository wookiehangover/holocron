-- Holocron: PostgreSQL Schema
--
-- Executable DDL for the Holocron file vault backed by PostgreSQL + pgvector.
-- Replaces the previous DynamoDB single-table design.

-- =============================================================================
-- Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Table: files  (maps to HolocronFile in @holocron/core)
-- =============================================================================

CREATE TABLE files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  path            TEXT        NOT NULL UNIQUE,
  s3_key          TEXT,
  size            BIGINT      NOT NULL,
  mime_type       TEXT        NOT NULL,
  checksum        TEXT        NOT NULL DEFAULT '',
  indexing_status TEXT,
  metadata        JSONB,
  full_text_s3_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_created_at ON files (created_at DESC);

-- =============================================================================
-- Table: share_links  (maps to ShareLink in @holocron/core)
-- =============================================================================

CREATE TABLE share_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID        NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_links_file_id ON share_links (file_id);

-- =============================================================================
-- Table: file_chunks  (maps to FileChunk in @holocron/core)
-- =============================================================================

CREATE TABLE file_chunks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID        NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index   INTEGER     NOT NULL,
  text          TEXT        NOT NULL,
  page          INTEGER,
  start_offset  INTEGER     NOT NULL,
  end_offset    INTEGER     NOT NULL,
  embedding     vector(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_chunks_file_id_chunk_index ON file_chunks (file_id, chunk_index);
CREATE INDEX idx_file_chunks_embedding ON file_chunks USING hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- Table: vault_version  (singleton row for vault metadata)
-- =============================================================================

CREATE TABLE vault_version (
  id            INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version       INTEGER     NOT NULL DEFAULT 0,
  file_count    INTEGER     NOT NULL DEFAULT 0,
  last_modified TIMESTAMPTZ
);

-- =============================================================================
-- Trigger: auto-update updated_at on files
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
