import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { HolocronFile, ShareLink } from "@holocron/core/types";
import { apiKeyAuth } from "./middleware/auth.js";
import { connectDb, ensureSchema, insertFile, getFileById, listFiles, deleteFile, deleteShareLinksByFileId, insertShareLink, getShareLinkByUrl } from "./db.js";
import { getBucketName, getPresignedPutUrl, getPresignedGetUrl, deleteObject } from "./s3.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// DB initialisation (once per cold start)
// ---------------------------------------------------------------------------

let dbReady = false;

app.use("*", async (_c, next) => {
  if (!dbReady) {
    await connectDb();
    await ensureSchema();
    dbReady = true;
  }
  await next();
});

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
  const { fileId } = await c.req.json<{ fileId: string }>();

  const file = await getFileById(fileId);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  const stateMachineArn = process.env.PROCESSING_STATE_MACHINE_ARN;
  if (!stateMachineArn) {
    return c.json({ error: "Processing pipeline not configured" }, 500);
  }

  const sfn = getSfnClient();
  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify({ s3Key: file.s3Key ?? file.path }),
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

  // Remove share links, then the file record
  await deleteShareLinksByFileId(id);
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

