/**
 * PostgreSQL data access layer for Holocron.
 *
 * Uses Postgres.js for all database operations. The connection is
 * configured in ./db/schema.ts via the DATABASE_URL environment variable.
 */

import type {
  HolocronFile,
  ShareLink,
  FileChunk,
  FileMetadata,
  IndexingStatus,
} from "@holocron/core/types";
import { sql } from "./db/schema.js";

// ---------------------------------------------------------------------------
// Row ↔ type mapping helpers  (snake_case → camelCase)
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

/** Map a PostgreSQL row to a FileChunk. */
function rowToChunk(row: Record<string, unknown>): FileChunk {
  return {
    id: row.id as string,
    fileId: row.file_id as string,
    chunkIndex: Number(row.chunk_index),
    text: row.text as string,
    page: row.page != null ? Number(row.page) : undefined,
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    createdAt: new Date(row.created_at as string),
  };
}

/** Map a PostgreSQL row to a ShareLink. */
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
// Vault version counter helper
// ---------------------------------------------------------------------------

/**
 * Atomically bump the vault version counter.
 *
 * Uses INSERT ... ON CONFLICT to upsert the singleton row, incrementing
 * `version` by 1 and adjusting `file_count` by the given delta.
 */
async function bumpVaultVersion(fileCountDelta: number): Promise<void> {
  await sql`
    INSERT INTO vault_version (id, version, file_count, last_modified)
    VALUES (1, 1, GREATEST(0, ${fileCountDelta}), now())
    ON CONFLICT (id) DO UPDATE SET
      version = vault_version.version + 1,
      file_count = GREATEST(0, vault_version.file_count + ${fileCountDelta}),
      last_modified = now()
  `;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Insert or update a file record (upsert by id). */
export async function insertFile(file: HolocronFile): Promise<void> {
  await sql`
    INSERT INTO files (id, name, path, s3_key, size, mime_type, checksum, created_at, updated_at)
    VALUES (
      ${file.id},
      ${file.name},
      ${file.path},
      ${file.s3Key ?? file.path},
      ${file.size},
      ${file.mimeType},
      ${file.checksum},
      ${file.createdAt.toISOString()},
      ${file.updatedAt.toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      path = EXCLUDED.path,
      s3_key = EXCLUDED.s3_key,
      size = EXCLUDED.size,
      mime_type = EXCLUDED.mime_type,
      checksum = EXCLUDED.checksum,
      updated_at = EXCLUDED.updated_at
  `;
  await bumpVaultVersion(1);
}

/** Update the checksum (and updated_at) for an existing file. */
export async function updateFileChecksum(
  id: string,
  checksum: string,
): Promise<void> {
  await sql`
    UPDATE files
    SET checksum = ${checksum}, updated_at = now()
    WHERE id = ${id}
  `;
  await bumpVaultVersion(0);
}

/** Update the path (and name, updated_at) for an existing file. */
export async function updateFilePath(
  id: string,
  newPath: string,
): Promise<void> {
  const newName = newPath.includes("/")
    ? newPath.slice(newPath.lastIndexOf("/") + 1)
    : newPath;

  await sql`
    UPDATE files
    SET path = ${newPath}, name = ${newName}, updated_at = now()
    WHERE id = ${id}
  `;
  await bumpVaultVersion(0);
}

/** Fetch a single file by its primary key. */
export async function getFileById(id: string): Promise<HolocronFile | null> {
  const rows = await sql`SELECT * FROM files WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToFile(rows[0]) : null;
}

/** Fetch multiple files by their IDs in a single query. */
export async function getFilesByIds(ids: string[]): Promise<Map<string, HolocronFile>> {
  if (ids.length === 0) return new Map();
  const rows = await sql`SELECT * FROM files WHERE id = ANY(${ids})`;
  const map = new Map<string, HolocronFile>();
  for (const row of rows) {
    const file = rowToFile(row);
    map.set(file.id, file);
  }
  return map;
}

/** Fetch a single file by its unique path. */
export async function getFileByPath(
  path: string,
): Promise<HolocronFile | null> {
  const rows = await sql`SELECT * FROM files WHERE path = ${path} LIMIT 1`;
  return rows.length > 0 ? rowToFile(rows[0]) : null;
}

/** List all files, most recent first. */
export async function listFiles(): Promise<HolocronFile[]> {
  const rows = await sql`SELECT * FROM files ORDER BY created_at DESC`;
  return rows.map(rowToFile);
}

/** Return the latest vault version info (latest change timestamp + file count). */
export async function getVaultVersion(): Promise<{
  latestChange: string | null;
  fileCount: number;
}> {
  const rows = await sql`SELECT * FROM vault_version WHERE id = 1 LIMIT 1`;

  if (rows.length > 0) {
    const row = rows[0];
    return {
      latestChange: row.last_modified
        ? new Date(row.last_modified as string).toISOString()
        : null,
      fileCount: Math.max(0, Number(row.file_count) ?? 0),
    };
  }

  // Fallback: vault_version row doesn't exist yet (fresh deploy / migration).
  // Seed it from the files table.
  const countResult = await sql`
    SELECT COUNT(*)::int AS cnt, MAX(updated_at) AS latest
    FROM files
  `;
  const fileCount = Number(countResult[0].cnt) || 0;
  const latest = countResult[0].latest
    ? new Date(countResult[0].latest as string).toISOString()
    : null;

  if (fileCount > 0) {
    await sql`
      INSERT INTO vault_version (id, version, file_count, last_modified)
      VALUES (1, 1, ${fileCount}, ${latest})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  return { latestChange: latest, fileCount };
}

// ---------------------------------------------------------------------------
// Share-link helpers
// ---------------------------------------------------------------------------

/** Insert a new share link record. */
export async function insertShareLink(link: ShareLink): Promise<void> {
  await sql`
    INSERT INTO share_links (id, file_id, url, expires_at, created_at)
    VALUES (
      ${link.id},
      ${link.fileId},
      ${link.url},
      ${link.expiresAt ? link.expiresAt.toISOString() : null},
      ${link.createdAt.toISOString()}
    )
  `;
}

/** Fetch a share link by its unique URL. */
export async function getShareLinkByUrl(
  url: string,
): Promise<ShareLink | null> {
  const rows = await sql`
    SELECT * FROM share_links WHERE url = ${url} LIMIT 1
  `;
  return rows.length > 0 ? rowToShareLink(rows[0]) : null;
}

/** Delete all share links associated with a file. */
export async function deleteShareLinksByFileId(fileId: string): Promise<void> {
  await sql`DELETE FROM share_links WHERE file_id = ${fileId}`;
}

// ---------------------------------------------------------------------------
// File deletion
// ---------------------------------------------------------------------------

/** Delete a file record by its primary key. Cascades to chunks and share links. */
export async function deleteFile(id: string): Promise<void> {
  await sql`DELETE FROM files WHERE id = ${id}`;
  await bumpVaultVersion(-1);
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

/** Insert chunks for a file using a single multi-row INSERT. */
export async function insertChunks(
  fileId: string,
  chunks: FileChunk[],
): Promise<void> {
  if (chunks.length === 0) return;

  // Postgres.js supports bulk inserts natively
  const values = chunks.map((chunk) => ({
    id: chunk.id,
    file_id: fileId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    page: chunk.page ?? null,
    start_offset: chunk.startOffset,
    end_offset: chunk.endOffset,
    created_at: chunk.createdAt.toISOString(),
  }));

  await sql`
    INSERT INTO file_chunks ${sql(values)}
  `;
}

/** List all chunks for a file, ordered by chunk_index. */
export async function getChunksByFileId(fileId: string, limit?: number): Promise<FileChunk[]> {
  const rows = limit
    ? await sql`
        SELECT * FROM file_chunks
        WHERE file_id = ${fileId}
        ORDER BY chunk_index ASC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM file_chunks
        WHERE file_id = ${fileId}
        ORDER BY chunk_index ASC
      `;
  return rows.map(rowToChunk);
}

/** Fetch the top N chunks per file for multiple file IDs in a single query. */
export async function getTopChunksByFileIds(
  fileIds: string[],
  chunksPerFile = 3,
): Promise<Map<string, FileChunk[]>> {
  if (fileIds.length === 0) return new Map();
  const rows = await sql`
    SELECT * FROM (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.file_id ORDER BY c.chunk_index ASC) AS rn
      FROM file_chunks c
      WHERE c.file_id = ANY(${fileIds})
    ) sub
    WHERE rn <= ${chunksPerFile}
    ORDER BY file_id, chunk_index
  `;
  const map = new Map<string, FileChunk[]>();
  for (const row of rows) {
    const chunk = rowToChunk(row);
    const existing = map.get(chunk.fileId);
    if (existing) existing.push(chunk);
    else map.set(chunk.fileId, [chunk]);
  }
  return map;
}

/** Delete all chunks for a file. */
export async function deleteChunksByFileId(fileId: string): Promise<void> {
  await sql`DELETE FROM file_chunks WHERE file_id = ${fileId}`;
}

// ---------------------------------------------------------------------------
// File indexing helpers
// ---------------------------------------------------------------------------

/** Update the indexing status (and optionally metadata / fullTextS3Key) for a file. */
export async function updateFileIndexingStatus(
  fileId: string,
  status: IndexingStatus,
  metadata?: FileMetadata,
  fullTextS3Key?: string,
): Promise<void> {
  await sql`
    UPDATE files
    SET
      indexing_status = ${status},
      updated_at = now()
      ${metadata !== undefined ? sql`, metadata = ${sql.json(JSON.parse(JSON.stringify(metadata)))}` : sql``}
      ${fullTextS3Key !== undefined ? sql`, full_text_s3_key = ${fullTextS3Key}` : sql``}
    WHERE id = ${fileId}
  `;
  await bumpVaultVersion(0);
}

/**
 * Search chunks for text matches (case-insensitive) using ILIKE.
 *
 * Joins with the files table to include the file name in results.
 *
 * @deprecated Use {@link searchChunksByFullText} for better relevance via PostgreSQL full-text search.
 */
export async function searchChunks(
  query: string,
  limit = 50,
): Promise<Array<FileChunk & { fileName: string }>> {
  const pattern = `%${query}%`;
  const rows = await sql`
    SELECT c.*, f.name AS file_name
    FROM file_chunks c
    JOIN files f ON f.id = c.file_id
    WHERE c.text ILIKE ${pattern}
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    ...rowToChunk(row),
    fileName: row.file_name as string,
  }));
}

/**
 * Search chunks using PostgreSQL full-text search with OR logic.
 *
 * Splits the query into words and joins with ` | ` to create an OR tsquery,
 * so any word matching is sufficient. Falls back to `plainto_tsquery` on error.
 *
 * Joins with the files table to include the file name in results.
 * Results are ordered by `ts_rank` (highest relevance first).
 */
export async function searchChunksByFullText(
  query: string,
  limit = 50,
): Promise<Array<FileChunk & { fileName: string; tsRank: number }>> {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const orQuery = words
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .join(" | ");

  try {
    const rows = await sql`
      SELECT c.*, f.name AS file_name,
             ts_rank(c.tsv, to_tsquery('english', ${orQuery})) AS ts_rank
      FROM file_chunks c
      JOIN files f ON f.id = c.file_id
      WHERE c.tsv @@ to_tsquery('english', ${orQuery})
      ORDER BY ts_rank DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      ...rowToChunk(row),
      fileName: row.file_name as string,
      tsRank: Number(row.ts_rank),
    }));
  } catch {
    // Fallback to plainto_tsquery if the OR query fails
    const rows = await sql`
      SELECT c.*, f.name AS file_name,
             ts_rank(c.tsv, plainto_tsquery('english', ${query})) AS ts_rank
      FROM file_chunks c
      JOIN files f ON f.id = c.file_id
      WHERE c.tsv @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      ...rowToChunk(row),
      fileName: row.file_name as string,
      tsRank: Number(row.ts_rank),
    }));
  }
}

// ---------------------------------------------------------------------------
// Vector search helpers
// ---------------------------------------------------------------------------

/**
 * Search chunks by vector embedding similarity using pgvector cosine distance.
 * Returns chunks ordered by similarity (highest first).
 */
export async function searchChunksByEmbedding(
  embedding: number[],
  limit = 10,
): Promise<Array<FileChunk & { fileName: string; similarity: number }>> {
  const vectorStr = `[${embedding.join(",")}]`;
  const rows = await sql`
    SELECT c.*, f.name AS file_name,
           1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
    FROM file_chunks c
    JOIN files f ON f.id = c.file_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    ...rowToChunk(row),
    fileName: row.file_name as string,
    similarity: Number(row.similarity),
  }));
}

/**
 * Batch insert chunks with their embedding vectors.
 */
export async function insertChunksWithEmbeddings(
  fileId: string,
  chunks: Array<FileChunk & { embedding: number[] }>,
): Promise<void> {
  if (chunks.length === 0) return;

  // Use a transaction for atomicity.
  // Note: TransactionSql loses call signatures due to Omit<> in postgres.js types,
  // so we cast to preserve the tagged template call signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    for (const chunk of chunks) {
      const vectorStr = `[${chunk.embedding.join(",")}]`;
      await tx`
        INSERT INTO file_chunks (id, file_id, chunk_index, text, page, start_offset, end_offset, embedding, created_at)
        VALUES (
          ${chunk.id},
          ${fileId},
          ${chunk.chunkIndex},
          ${chunk.text},
          ${chunk.page ?? null},
          ${chunk.startOffset},
          ${chunk.endOffset},
          ${vectorStr}::vector,
          ${chunk.createdAt.toISOString()}
        )
      `;
    }
  });
}


// ---------------------------------------------------------------------------
// Metadata search helpers
// ---------------------------------------------------------------------------

/**
 * Search files by metadata fields (title, keywords, topics) using ILIKE.
 *
 * Returns matching file IDs and names for use in the hybrid search pipeline.
 */
export async function searchFilesByMetadata(
  query: string,
  limit = 20,
): Promise<Array<{ fileId: string; fileName: string }>> {
  const pattern = `%${query}%`;
  const rows = await sql`
    SELECT id, name
    FROM files
    WHERE metadata IS NOT NULL AND (
      metadata->>'title' ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(metadata->'keywords') kw
        WHERE kw ILIKE ${pattern}
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(metadata->'topics') tp
        WHERE tp ILIKE ${pattern}
      )
    )
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    fileId: row.id as string,
    fileName: row.name as string,
  }));
}