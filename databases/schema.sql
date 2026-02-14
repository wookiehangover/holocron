-- Holocron: AgentDB / SQLite Schema
--
-- This file defines the database schema for the Holocron file vault.
-- AgentDB is a serverless SQLite-over-HTTP service used as the metadata store.
-- All UUIDs are stored as TEXT. Timestamps are ISO 8601 TEXT. Sizes are INTEGER.
--
-- Tables:
--   files        – metadata for every file in the vault (maps to HolocronFile)
--   share_links  – public share links pointing to files (maps to ShareLink)

-- =============================================================================
-- files
-- =============================================================================
-- Each row represents a file stored in the Holocron vault (S3 + local).
-- Mirrors the HolocronFile TypeScript interface in @holocron/core.

CREATE TABLE IF NOT EXISTS files (
    id         TEXT    NOT NULL PRIMARY KEY,
    name       TEXT    NOT NULL,
    path       TEXT    NOT NULL UNIQUE,
    size       INTEGER NOT NULL,
    mime_type  TEXT    NOT NULL,
    checksum   TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files (path);

-- =============================================================================
-- share_links
-- =============================================================================
-- Each row is a publicly-accessible link to a file. The optional expires_at
-- column allows time-limited sharing; NULL means the link never expires.
-- Mirrors the ShareLink TypeScript interface in @holocron/core.

CREATE TABLE IF NOT EXISTS share_links (
    id         TEXT NOT NULL PRIMARY KEY,
    file_id    TEXT NOT NULL REFERENCES files (id),
    url        TEXT NOT NULL UNIQUE,
    expires_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON share_links (file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_url ON share_links (url);

