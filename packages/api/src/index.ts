import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { HolocronFile, ShareLink } from "@holocron/core/types";
import { apiKeyAuth } from "./middleware/auth.js";
import { connectDb, ensureSchema, insertFile, getFileById, listFiles } from "./db.js";
import { getBucketName, getPresignedPutUrl, getPresignedGetUrl } from "./s3.js";

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
    path: s3Key,
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
      input: JSON.stringify({ s3Key: file.path }),
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
  const downloadUrl = await getPresignedGetUrl(getBucketName(), file.path);
  return c.json({ file, downloadUrl });
});

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

app.post("/share", async (c) => {
  // TODO: create share link in AgentDB
  const link: Partial<ShareLink> = {
    id: crypto.randomUUID(),
    url: "https://holocron.example.com/s/placeholder",
  };
  return c.json(link, 201);
});

app.get("/share/:token", (c) => {
  const token = c.req.param("token");
  // TODO: resolve share link from AgentDB
  return c.json({ token, message: "not implemented" }, 501);
});

// ---------------------------------------------------------------------------
// Lambda handler export
// ---------------------------------------------------------------------------

export const handler = handle(app);
export default app;

