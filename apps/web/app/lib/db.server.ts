/**
 * Direct PostgreSQL connection for the Holocron web app.
 *
 * Uses the same Postgres.js approach as `packages/api/src/db/schema.ts`.
 * The `.server.ts` suffix ensures this module is never bundled for the client.
 */

import postgres from "postgres";
import type {
  HolocronFile,
  IndexingStatus,
  FileMetadata,
} from "@holocron/core/types";

// ---------------------------------------------------------------------------
// Singleton SQL connection
// ---------------------------------------------------------------------------

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

// ---------------------------------------------------------------------------
// Row → type mapping (snake_case → camelCase)
// ---------------------------------------------------------------------------

/** Map a PostgreSQL row to a HolocronFile. */
function rowToFile(row: Record<string, unknown>): HolocronFile {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    s3Key: (row.s3_key as string) ?? undefined,
    size: Number(row.size),
    mimeType: row.mime_type as string,
    checksum: row.checksum as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    indexingStatus: (row.indexing_status as IndexingStatus) ?? undefined,
    metadata: (row.metadata as FileMetadata) ?? undefined,
    fullTextS3Key: (row.full_text_s3_key as string) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Allowed sort columns (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: "name",
  size: "size",
  mime_type: "mime_type",
  created_at: "created_at",
};

const DEFAULT_SORT_COLUMN = "created_at";
const DEFAULT_SORT_DIR = "desc";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListFilesOptions {
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

/**
 * List all files, with optional sorting.
 *
 * Allowed sort columns: name, size, mime_type, created_at.
 * Defaults to `created_at DESC`.
 */
export async function listFiles(
  options?: ListFilesOptions,
): Promise<HolocronFile[]> {
  const column = ALLOWED_SORT_COLUMNS[options?.sortBy ?? ""] ?? DEFAULT_SORT_COLUMN;
  const dir = options?.sortDir === "asc" ? "asc" : DEFAULT_SORT_DIR;

  // postgres.js unsafe() is used here for the dynamic ORDER BY clause.
  // Both `column` and `dir` are validated against whitelists above, so this is safe.
  const rows = await sql`
    SELECT * FROM files ORDER BY ${sql.unsafe(column)} ${sql.unsafe(dir)}
  `;

  return rows.map(rowToFile);
}

