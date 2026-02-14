/**
 * Embedded DDL for the Holocron database schema.
 *
 * Sourced from databases/schema.sql. Keep in sync with that file.
 * Used by ensureSchema() to bootstrap tables on first connect.
 */

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS files (
    id         TEXT    NOT NULL PRIMARY KEY,
    name       TEXT    NOT NULL,
    path       TEXT    NOT NULL UNIQUE,
    s3_key     TEXT    NOT NULL,
    size       INTEGER NOT NULL,
    mime_type  TEXT    NOT NULL,
    checksum   TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path ON files (path);

CREATE TABLE IF NOT EXISTS share_links (
    id         TEXT NOT NULL PRIMARY KEY,
    file_id    TEXT NOT NULL REFERENCES files (id),
    url        TEXT NOT NULL UNIQUE,
    expires_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON share_links (file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_url ON share_links (url);
`;

