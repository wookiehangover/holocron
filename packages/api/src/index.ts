import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { embed } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { HolocronFile, ShareLink } from "@holocron/core/types";
import { apiKeyAuth } from "./middleware/auth.js";
import { insertFile, getFileById, listFiles, getVaultVersion, deleteFile, deleteShareLinksByFileId, deleteChunksByFileId, insertShareLink, getShareLinkByUrl, updateFileChecksum, updateFileIndexingStatus, updateFilePath, searchChunks, searchChunksByEmbedding, getChunksByFileId } from "./db.js";
import { hybridSearch } from "./search.js";
import { getBucketName, getPresignedPutUrl, getPresignedGetUrl, deleteObject } from "./s3.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// CORS – allow cross-origin requests from the web app
// ---------------------------------------------------------------------------

app.use("*", cors());

// ---------------------------------------------------------------------------
// Auth – applied globally; /health is excluded inside the middleware
// ---------------------------------------------------------------------------

app.use("*", apiKeyAuth);

// ---------------------------------------------------------------------------
// SFN client (lazy singleton)
// ---------------------------------------------------------------------------

let _sfn: SFNClient | null = null;
function getSfnClient(): SFNClient {
  if (!_sfn) {
    _sfn = new SFNClient({});
  }
  return _sfn;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

app.get("/files", async (c) => {
  const files = await listFiles();
  return c.json({ files });
});

app.get("/files/version", async (c) => {
  const version = await getVaultVersion();
  return c.json(version);
});

app.get("/files/search", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ error: "Missing required query parameter: q" }, 400);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 100);

  const chunks = await searchChunks(query, limit);

  // Group chunks by fileId
  const grouped = new Map<string, { file: { id: string; name: string; path: string; mimeType: string; metadata?: unknown }; chunks: Array<{ text: string; page?: number; chunkIndex: number }> }>();

  for (const chunk of chunks) {
    const existing = grouped.get(chunk.fileId);
    const chunkEntry = { text: chunk.text, page: chunk.page, chunkIndex: chunk.chunkIndex };

    if (existing) {
      existing.chunks.push(chunkEntry);
    } else {
      // Fetch the full file record for metadata
      const file = await getFileById(chunk.fileId);
      grouped.set(chunk.fileId, {
        file: {
          id: chunk.fileId,
          name: file?.name ?? chunk.fileName,
          path: file?.path ?? "",
          mimeType: file?.mimeType ?? "",
          metadata: file?.metadata,
        },
        chunks: [chunkEntry],
      });
    }
  }

  // Sort by number of matching chunks (descending)
  const results = [...grouped.values()]
    .sort((a, b) => b.chunks.length - a.chunks.length)
    .map((entry) => ({
      file: entry.file,
      chunks: entry.chunks,
      score: entry.chunks.length,
    }));

  return c.json({ results, query, total: results.length });
});

// ---------------------------------------------------------------------------
// Hybrid Search (full-text + vector + reranking)
// ---------------------------------------------------------------------------

app.post("/search", async (c) => {
  const body = await c.req.json<{ query: string; limit?: number }>();
  if (!body.query) {
    return c.json({ error: "Missing required field: query" }, 400);
  }

  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);
  const results = await hybridSearch(body.query, limit);

  return c.json({ results, query: body.query, total: results.length });
});

// ---------------------------------------------------------------------------
// Semantic Search (vector similarity)
// ---------------------------------------------------------------------------

app.post("/search/semantic", async (c) => {
  const body = await c.req.json<{ query: string; limit?: number }>();
  if (!body.query) {
    return c.json({ error: "Missing required field: query" }, 400);
  }

  const limit = Math.min(Math.max(body.limit ?? 10, 1), 100);

  // Generate embedding for the query
  const { embedding } = await embed({
    model: gateway.embeddingModel("google/gemini-embedding-001"),
    value: body.query,
    providerOptions: {
      google: { outputDimensionality: 768 },
    },
  });

  // Search by vector similarity
  const chunks = await searchChunksByEmbedding(embedding, limit);

  const results = chunks.map((chunk) => ({
    file: {
      id: chunk.fileId,
      name: chunk.fileName,
    },
    chunk: {
      id: chunk.id,
      text: chunk.text,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
    },
    similarity: chunk.similarity,
  }));

  return c.json({ results, query: body.query, total: results.length });
});

app.post("/files/upload", async (c) => {
  const body = await c.req.json<{
    name: string;
    path: string;
    size: number;
    mimeType: string;
  }>();

  const fileId = crypto.randomUUID();
  const s3Key = `files/${fileId}/${body.name}`;
  const bucket = getBucketName();

  const uploadUrl = await getPresignedPutUrl(bucket, s3Key, body.mimeType);

  const now = new Date();
  const file: HolocronFile = {
    id: fileId,
    name: body.name,
    path: body.path,
    s3Key,
    size: body.size,
    mimeType: body.mimeType,
    checksum: "",
    createdAt: now,
    updatedAt: now,
  };

  await insertFile(file);

  return c.json({ fileId, uploadUrl });
});

app.post("/files/upload/confirm", async (c) => {
  const { fileId, checksum } = await c.req.json<{ fileId: string; checksum?: string }>();

  const file = await getFileById(fileId);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  // Persist the client-supplied checksum if provided.
  if (checksum) {
    await updateFileChecksum(fileId, checksum);
  }

  const stateMachineArn = process.env.PROCESSING_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    return c.json({ error: "Processing pipeline not configured" }, 500);
  }

  await updateFileIndexingStatus(fileId, "pending");

  const sfn = getSfnClient();
  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify({
        fileId: file.id,
        s3Key: file.s3Key ?? file.path,
        bucket: process.env.BUCKET_NAME,
        mimeType: file.mimeType,
        fileName: file.name,
      }),
    }),
  );

  return c.json({ status: "processing" });
});

app.get("/files/:id", async (c) => {
  const id = c.req.param("id");
  const file = await getFileById(id);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }
  const downloadUrl = await getPresignedGetUrl(getBucketName(), file.s3Key ?? file.path);
  return c.json({ file, downloadUrl });
});

app.patch("/files/:id", async (c) => {
  const id = c.req.param("id");
  const { path } = await c.req.json<{ path: string }>();
  if (!path) {
    return c.json({ error: "Missing required field: path" }, 400);
  }
  await updateFilePath(id, path);
  return c.json({ ok: true });
});

app.post("/files/:id/reindex", async (c) => {
  const id = c.req.param("id");
  const file = await getFileById(id);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  const stateMachineArn = process.env.PROCESSING_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    return c.json({ error: "Processing pipeline not configured" }, 500);
  }

  // Clean up old chunks and fulltext before re-indexing
  await deleteChunksByFileId(id);
  if (file.fullTextS3Key) {
    try {
      await deleteObject(getBucketName(), file.fullTextS3Key);
    } catch {
      // Non-fatal — fulltext may not exist yet
    }
  }

  await updateFileIndexingStatus(id, "pending");

  const sfn = getSfnClient();
  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify({
        fileId: file.id,
        s3Key: file.s3Key ?? file.path,
        bucket: process.env.BUCKET_NAME,
        mimeType: file.mimeType,
        fileName: file.name,
      }),
    }),
  );

  return c.json({ status: "processing" });
});

app.get("/files/:id/chunks", async (c) => {
  const id = c.req.param("id");
  const file = await getFileById(id);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  const chunks = await getChunksByFileId(id);
  return c.json({
    chunks: chunks.map((ch) => ({
      id: ch.id,
      text: ch.text,
      page: ch.page,
      chunkIndex: ch.chunkIndex,
      startOffset: ch.startOffset,
      endOffset: ch.endOffset,
    })),
    total: chunks.length,
  });
});

app.delete("/files/:id", async (c) => {
  const id = c.req.param("id");
  const file = await getFileById(id);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  // Delete S3 object first — abort if this fails
  try {
    await deleteObject(getBucketName(), file.s3Key ?? file.path);
  } catch {
    return c.json({ error: "Failed to delete file from storage" }, 500);
  }

  // Delete extracted fulltext from S3 (best-effort)
  if (file.fullTextS3Key) {
    try {
      await deleteObject(getBucketName(), file.fullTextS3Key);
    } catch {
      // Non-fatal — fulltext may not exist yet
    }
  }

  // Remove share links, chunks, then the file record
  await deleteShareLinksByFileId(id);
  await deleteChunksByFileId(id);
  await deleteFile(id);

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

app.post("/share", async (c) => {
  const body = await c.req.json<{ fileId: string; expiresIn?: number }>();

  const file = await getFileById(body.fileId);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  const token = crypto.randomUUID();
  const url = `/share/${token}`;
  const expiresAt = body.expiresIn
    ? new Date(Date.now() + body.expiresIn * 1000)
    : null;
  const now = new Date();

  const link: ShareLink = {
    id: token,
    fileId: body.fileId,
    url,
    expiresAt,
    createdAt: now,
  };

  await insertShareLink(link);

  return c.json({ id: link.id, url: link.url, expiresAt: link.expiresAt }, 201);
});

app.get("/share/:token", async (c) => {
  const token = c.req.param("token");
  const url = `/share/${token}`;

  const link = await getShareLinkByUrl(url);
  if (!link) {
    return c.json({ error: "Share link not found" }, 404);
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "Share link expired" }, 410);
  }

  const file = await getFileById(link.fileId);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  const downloadUrl = await getPresignedGetUrl(getBucketName(), file.s3Key ?? file.path);

  return c.json({
    file: { name: file.name, size: file.size, mimeType: file.mimeType },
    downloadUrl,
  });
});

// ---------------------------------------------------------------------------
// Lambda handler export
// ---------------------------------------------------------------------------

export const handler = handle(app);
export default app;

