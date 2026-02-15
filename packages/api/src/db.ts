/**
 * DynamoDB data access layer for Holocron.
 *
 * Uses a single-table design with two GSIs. Table is provisioned by
 * SST in infra/database.ts; the table name is injected via the
 * HOLOCRON_TABLE_NAME environment variable.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  HolocronFile,
  ShareLink,
  FileChunk,
  FileMetadata,
  IndexingStatus,
} from "@holocron/core/types";
import { TABLE_NAME, GSI1_NAME, GSI2_NAME, PREFIX } from "./db/schema.js";

// ---------------------------------------------------------------------------
// DynamoDB client (singleton)
// ---------------------------------------------------------------------------

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---------------------------------------------------------------------------
// Item ↔ type mapping helpers
// ---------------------------------------------------------------------------

/** Map a DynamoDB item to a HolocronFile. */
function itemToFile(item: Record<string, unknown>): HolocronFile {
  return {
    id: item.id as string,
    name: item.name as string,
    path: item.path as string,
    s3Key: item.s3Key as string,
    size: item.size as number,
    mimeType: item.mimeType as string,
    checksum: item.checksum as string,
    createdAt: new Date(item.createdAt as string),
    updatedAt: new Date(item.updatedAt as string),
    indexingStatus: item.indexingStatus as IndexingStatus | undefined,
    metadata: item.metadata as FileMetadata | undefined,
    fullTextS3Key: item.fullTextS3Key as string | undefined,
  };
}

/** Map a DynamoDB item to a FileChunk. */
function itemToChunk(item: Record<string, unknown>): FileChunk {
  return {
    id: item.id as string,
    fileId: item.fileId as string,
    chunkIndex: item.chunkIndex as number,
    text: item.text as string,
    page: item.page as number | undefined,
    startOffset: item.startOffset as number,
    endOffset: item.endOffset as number,
    createdAt: new Date(item.createdAt as string),
  };
}

/** Map a DynamoDB item to a ShareLink. */
function itemToShareLink(item: Record<string, unknown>): ShareLink {
  return {
    id: item.id as string,
    fileId: item.fileId as string,
    url: item.url as string,
    expiresAt: item.expiresAt ? new Date(item.expiresAt as string) : null,
    createdAt: new Date(item.createdAt as string),
  };
}

// ---------------------------------------------------------------------------
// Vault version counter helper
// ---------------------------------------------------------------------------

/**
 * Atomically bump the vault version counter.
 *
 * Uses DynamoDB `ADD` to increment `version` by 1 and adjust `fileCount` by
 * the given delta (+1 on insert, -1 on delete, 0 on update). `lastModified`
 * is always set to the current timestamp.
 */
async function bumpVaultVersion(fileCountDelta: number): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: PREFIX.VAULT_VERSION,
        sk: PREFIX.VAULT_VERSION,
      },
      UpdateExpression:
        "ADD version :one, fileCount :delta SET lastModified = :now",
      ExpressionAttributeValues: {
        ":one": 1,
        ":delta": fileCountDelta,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Insert or update a file record (PutItem — overwrites by pk/sk). */
export async function insertFile(file: HolocronFile): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `${PREFIX.FILE}${file.id}`,
        sk: `${PREFIX.FILE}${file.id}`,
        gsi1pk: PREFIX.FILES,
        gsi1sk: `${file.createdAt.toISOString()}#${file.id}`,
        gsi2pk: `${PREFIX.PATH}${file.path}`,
        gsi2sk: `${PREFIX.FILE}${file.id}`,
        id: file.id,
        name: file.name,
        path: file.path,
        s3Key: file.s3Key ?? file.path,
        size: file.size,
        mimeType: file.mimeType,
        checksum: file.checksum,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      },
    }),
  );
  await bumpVaultVersion(1);
}

/** Update the checksum (and updated_at) for an existing file. */
export async function updateFileChecksum(
  id: string,
  checksum: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `${PREFIX.FILE}${id}`, sk: `${PREFIX.FILE}${id}` },
      UpdateExpression: "SET checksum = :c, updatedAt = :u",
      ExpressionAttributeValues: {
        ":c": checksum,
        ":u": new Date().toISOString(),
      },
    }),
  );
  await bumpVaultVersion(0);
}

/** Fetch a single file by its primary key. */
export async function getFileById(id: string): Promise<HolocronFile | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `${PREFIX.FILE}${id}`, sk: `${PREFIX.FILE}${id}` },
    }),
  );
  return result.Item ? itemToFile(result.Item) : null;
}

/** Fetch a single file by its unique path (via GSI2). */
export async function getFileByPath(
  path: string,
): Promise<HolocronFile | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI2_NAME,
      KeyConditionExpression: "gsi2pk = :pk",
      ExpressionAttributeValues: { ":pk": `${PREFIX.PATH}${path}` },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  return item ? itemToFile(item) : null;
}

/** List all files, most recent first (via GSI1, ScanIndexForward=false). */
export async function listFiles(): Promise<HolocronFile[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": PREFIX.FILES },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items.map(itemToFile);
}

/** Return the latest vault version info (latest change timestamp + file count). */
export async function getVaultVersion(): Promise<{
  latestChange: string | null;
  fileCount: number;
}> {
  // Fast path: read the dedicated counter item.
  const counterResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: PREFIX.VAULT_VERSION,
        sk: PREFIX.VAULT_VERSION,
      },
    }),
  );

  if (counterResult.Item) {
    return {
      latestChange: (counterResult.Item.lastModified as string) ?? null,
      fileCount: Math.max(0, (counterResult.Item.fileCount as number) ?? 0),
    };
  }

  // ------------------------------------------------------------------
  // Fallback: counter item doesn't exist yet (fresh deploy / migration).
  // Run the legacy scan, then seed the counter so subsequent calls are fast.
  // ------------------------------------------------------------------
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": PREFIX.FILES },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (items.length === 0) {
    return { latestChange: null, fileCount: 0 };
  }

  // Find the maximum updatedAt across all items
  let latestChange: string | null = null;
  for (const item of items) {
    const updatedAt = item.updatedAt as string;
    if (!latestChange || updatedAt > latestChange) {
      latestChange = updatedAt;
    }
  }

  // Seed the counter item so future reads are a single GetItem.
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: PREFIX.VAULT_VERSION,
        sk: PREFIX.VAULT_VERSION,
        version: 1,
        fileCount: items.length,
        lastModified: latestChange,
      },
    }),
  );

  return { latestChange, fileCount: items.length };
}

// ---------------------------------------------------------------------------
// Share-link helpers
// ---------------------------------------------------------------------------

/** Insert a new share link record. */
export async function insertShareLink(link: ShareLink): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `${PREFIX.SHARE}${link.id}`,
        sk: `${PREFIX.SHARE}${link.id}`,
        gsi1pk: `${PREFIX.FILE_SHARES}${link.fileId}`,
        gsi1sk: `${PREFIX.SHARE}${link.id}`,
        gsi2pk: `${PREFIX.URL}${link.url}`,
        gsi2sk: `${PREFIX.SHARE}${link.id}`,
        id: link.id,
        fileId: link.fileId,
        url: link.url,
        expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
        createdAt: link.createdAt.toISOString(),
      },
    }),
  );
}

/** Fetch a share link by its unique URL (via GSI2). */
export async function getShareLinkByUrl(
  url: string,
): Promise<ShareLink | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI2_NAME,
      KeyConditionExpression: "gsi2pk = :pk",
      ExpressionAttributeValues: { ":pk": `${PREFIX.URL}${url}` },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  return item ? itemToShareLink(item) : null;
}

/** Delete all share links associated with a file (query GSI1 then batch delete). */
export async function deleteShareLinksByFileId(fileId: string): Promise<void> {
  // 1. Query all share links for this file via GSI1
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `${PREFIX.FILE_SHARES}${fileId}`,
        },
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (items.length === 0) return;

  // 2. Batch delete in chunks of 25 (DynamoDB limit)
  const BATCH_SIZE = 25;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            DeleteRequest: {
              Key: { pk: item.pk as string, sk: item.sk as string },
            },
          })),
        },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// File deletion
// ---------------------------------------------------------------------------

/** Delete a file record by its primary key. */
export async function deleteFile(id: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `${PREFIX.FILE}${id}`, sk: `${PREFIX.FILE}${id}` },
    }),
  );
  await bumpVaultVersion(-1);
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

/** Batch-write chunks for a file. Chunks are written in batches of 25. */
export async function insertChunks(
  fileId: string,
  chunks: FileChunk[],
): Promise<void> {
  const BATCH_SIZE = 25;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((chunk) => ({
            PutRequest: {
              Item: {
                pk: `${PREFIX.CHUNK}${chunk.id}`,
                sk: `${PREFIX.CHUNK}${chunk.id}`,
                gsi1pk: `${PREFIX.FILE_CHUNKS}${fileId}`,
                gsi1sk: `${PREFIX.CHUNK}${chunk.chunkIndex}`,
                id: chunk.id,
                fileId: chunk.fileId,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text,
                textLower: chunk.text.toLowerCase(),
                page: chunk.page,
                startOffset: chunk.startOffset,
                endOffset: chunk.endOffset,
                createdAt: chunk.createdAt.toISOString(),
              },
            },
          })),
        },
      }),
    );
  }
}

/** List all chunks for a file, ordered by chunkIndex (via GSI1). */
export async function getChunksByFileId(fileId: string): Promise<FileChunk[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `${PREFIX.FILE_CHUNKS}${fileId}`,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items.map(itemToChunk);
}

/** Delete all chunks for a file (query GSI1 then batch delete). */
export async function deleteChunksByFileId(fileId: string): Promise<void> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `${PREFIX.FILE_CHUNKS}${fileId}`,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (items.length === 0) return;

  const BATCH_SIZE = 25;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            DeleteRequest: {
              Key: { pk: item.pk as string, sk: item.sk as string },
            },
          })),
        },
      }),
    );
  }
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
  let updateExpr = "SET indexingStatus = :s, updatedAt = :u";
  const exprValues: Record<string, unknown> = {
    ":s": status,
    ":u": new Date().toISOString(),
  };

  if (metadata !== undefined) {
    updateExpr += ", metadata = :m";
    exprValues[":m"] = metadata;
  }
  if (fullTextS3Key !== undefined) {
    updateExpr += ", fullTextS3Key = :fk";
    exprValues[":fk"] = fullTextS3Key;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `${PREFIX.FILE}${fileId}`,
        sk: `${PREFIX.FILE}${fileId}`,
      },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: exprValues,
    }),
  );
  await bumpVaultVersion(0);
}

/**
 * Scan chunks for text matches (case-insensitive contains).
 *
 * Uses a DynamoDB Scan with a filter expression. Acceptable for a single-user
 * vault with moderate chunk counts; not suitable for large-scale search.
 */
export async function searchChunks(
  query: string,
  limit = 50,
): Promise<Array<FileChunk & { fileName: string }>> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(pk, :prefix) AND contains(#tl, :q)",
        ExpressionAttributeNames: { "#tl": "textLower" },
        ExpressionAttributeValues: {
          ":prefix": PREFIX.CHUNK,
          ":q": query.toLowerCase(),
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey && items.length < limit);

  // Trim to limit
  const trimmed = items.slice(0, limit);

  // Resolve file names for each unique fileId
  const fileIds = [...new Set(trimmed.map((i) => i.fileId as string))];
  const fileMap = new Map<string, string>();
  for (const fid of fileIds) {
    const file = await getFileById(fid);
    fileMap.set(fid, file?.name ?? "unknown");
  }

  return trimmed.map((item) => ({
    ...itemToChunk(item),
    fileName: fileMap.get(item.fileId as string) ?? "unknown",
  }));
}

