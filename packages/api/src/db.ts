/**
 * AgentDB connection helper and typed query helpers.
 *
 * Provides a configured DatabaseService instance for use across
 * the API. Connection details are injected via environment variables
 * at runtime (SST resource linking).
 */

import { DatabaseConnection, DatabaseService } from "@agentdb/sdk";
import type { HolocronFile, ShareLink } from "@holocron/core/types";
import { SCHEMA_DDL } from "./db/schema.js";

const AGENTDB_API_URL =
  process.env.AGENTDB_API_URL ?? "https://api.agentdb.dev";
const AGENTDB_API_KEY = process.env.AGENTDB_API_KEY ?? "";
const AGENTDB_TOKEN = process.env.AGENTDB_TOKEN ?? "";
const AGENTDB_DB_NAME = process.env.AGENTDB_DB_NAME ?? "holocron";

/**
 * Singleton AgentDB DatabaseService instance.
 */
export const agentdb = new DatabaseService(AGENTDB_API_URL, AGENTDB_API_KEY);

/** Cached database connection. Set by connectDb(). */
let _db: DatabaseConnection | null = null;

/**
 * Return the current database connection.
 * Throws if connectDb() has not been called.
 */
function getDb(): DatabaseConnection {
  if (!_db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return _db;
}

/**
 * Connect to the Holocron database.
 *
 * Call this once during Lambda cold start to establish a connection.
 */
export async function connectDb(token?: string): Promise<DatabaseConnection> {
  const authToken = token ?? AGENTDB_TOKEN;
  _db = agentdb.connect(authToken, AGENTDB_DB_NAME, "sqlite");
  return _db;
}

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------

/**
 * Run the DDL statements to create tables and indexes if they don't exist.
 * Safe to call on every cold start (uses IF NOT EXISTS).
 */
export async function ensureSchema(): Promise<void> {
  const conn = getDb();
  const statements = SCHEMA_DDL.split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);

  await conn.execute(statements.map((sql) => ({ sql })));
}

// ---------------------------------------------------------------------------
// Row ↔ type mapping helpers
// ---------------------------------------------------------------------------

/** Map a raw DB row to a HolocronFile. */
function rowToFile(row: Record<string, unknown>): HolocronFile {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    s3Key: row.s3_key as string,
    size: row.size as number,
    mimeType: row.mime_type as string,
    checksum: row.checksum as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

/** Map a raw DB row to a ShareLink. */
function rowToShareLink(row: Record<string, unknown>): ShareLink {
  return {
    id: row.id as string,
    fileId: row.file_id as string,
    url: row.url as string,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Insert or update a file record (upsert on unique path). */
export async function insertFile(file: HolocronFile): Promise<void> {
  const conn = getDb();
  await conn.execute({
    sql: `INSERT INTO files (id, name, path, s3_key, size, mime_type, checksum, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(path) DO UPDATE SET
            id = excluded.id,
            name = excluded.name,
            s3_key = excluded.s3_key,
            size = excluded.size,
            mime_type = excluded.mime_type,
            checksum = excluded.checksum,
            updated_at = excluded.updated_at`,
    params: [
      file.id,
      file.name,
      file.path,
      file.s3Key ?? file.path,
      file.size,
      file.mimeType,
      file.checksum,
      file.createdAt.toISOString(),
      file.updatedAt.toISOString(),
    ],
  });
}

/** Update the checksum (and updated_at) for an existing file. */
export async function updateFileChecksum(
  id: string,
  checksum: string,
): Promise<void> {
  const conn = getDb();
  await conn.execute({
    sql: `UPDATE files SET checksum = ?, updated_at = ? WHERE id = ?`,
    params: [checksum, new Date().toISOString(), id],
  });
}

/** Fetch a single file by its primary key. */
export async function getFileById(id: string): Promise<HolocronFile | null> {
  const conn = getDb();
  const result = await conn.execute({
    sql: "SELECT * FROM files WHERE id = ?",
    params: [id],
  });
  const row = result.results[0]?.rows?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? rowToFile(row) : null;
}

/** Fetch a single file by its unique path. */
export async function getFileByPath(
  path: string,
): Promise<HolocronFile | null> {
  const conn = getDb();
  const result = await conn.execute({
    sql: "SELECT * FROM files WHERE path = ?",
    params: [path],
  });
  const row = result.results[0]?.rows?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? rowToFile(row) : null;
}

/** List all files, most recent first. */
export async function listFiles(): Promise<HolocronFile[]> {
  const conn = getDb();
  const result = await conn.execute({
    sql: "SELECT * FROM files ORDER BY created_at DESC",
  });
  const rows = (result.results[0]?.rows ?? []) as Record<string, unknown>[];
  return rows.map(rowToFile);
}

/** Return the latest vault version info (latest change timestamp + file count). */
export async function getVaultVersion(): Promise<{
  latestChange: string | null;
  fileCount: number;
}> {
  const conn = getDb();
  const result = await conn.execute({
    sql: "SELECT MAX(updated_at) as latest_change, COUNT(*) as file_count FROM files",
  });
  const row = result.results[0]?.rows?.[0] as
    | Record<string, unknown>
    | undefined;
  return {
    latestChange: (row?.latest_change as string) ?? null,
    fileCount: (row?.file_count as number) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Share-link helpers
// ---------------------------------------------------------------------------

/** Insert a new share link record. */
export async function insertShareLink(link: ShareLink): Promise<void> {
  const conn = getDb();
  await conn.execute({
    sql: `INSERT INTO share_links (id, file_id, url, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    params: [
      link.id,
      link.fileId,
      link.url,
      link.expiresAt ? link.expiresAt.toISOString() : null,
      link.createdAt.toISOString(),
    ],
  });
}

/** Fetch a share link by its unique URL. */
export async function getShareLinkByUrl(
  url: string,
): Promise<ShareLink | null> {
  const conn = getDb();
  const result = await conn.execute({
    sql: "SELECT * FROM share_links WHERE url = ?",
    params: [url],
  });
  const row = result.results[0]?.rows?.[0] as
    | Record<string, unknown>
    | undefined;
  return row ? rowToShareLink(row) : null;
}

/** Delete all share links associated with a file. */
export async function deleteShareLinksByFileId(fileId: string): Promise<void> {
  const conn = getDb();
  await conn.execute({
    sql: "DELETE FROM share_links WHERE file_id = ?",
    params: [fileId],
  });
}

// ---------------------------------------------------------------------------
// File deletion
// ---------------------------------------------------------------------------

/** Delete a file record by its primary key. */
export async function deleteFile(id: string): Promise<void> {
  const conn = getDb();
  await conn.execute({
    sql: "DELETE FROM files WHERE id = ?",
    params: [id],
  });
}

