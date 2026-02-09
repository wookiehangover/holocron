import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import type { HolocronFile, ShareLink } from "@holocron/core/types";

const app = new Hono();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

app.get("/files", (c) => {
  // TODO: query AgentDB for file list
  const files: HolocronFile[] = [];
  return c.json({ files });
});

app.post("/files/upload", async (c) => {
  // TODO: generate presigned S3 URL for upload
  return c.json({
    uploadUrl: "https://s3.example.com/presigned-url",
    fileId: crypto.randomUUID(),
  });
});

app.get("/files/:id", (c) => {
  const id = c.req.param("id");
  // TODO: fetch file metadata from AgentDB
  return c.json({ id, message: "not implemented" }, 501);
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

