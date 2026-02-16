import type { HolocronFile, FileChunk } from "@holocron/core/types";

// ---------------------------------------------------------------------------
// Env helpers — server uses process.env, client uses window.ENV
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    ENV?: { API_URL?: string; API_KEY?: string };
  }
}

function getEnv(): { apiUrl: string; apiKey: string } {
  if (typeof window !== "undefined" && window.ENV) {
    return {
      apiUrl: window.ENV.API_URL ?? "/api",
      apiKey: window.ENV.API_KEY ?? "",
    };
  }
  return {
    apiUrl: process.env.API_URL ?? "/api",
    apiKey: process.env.API_KEY ?? "",
  };
}

function headers(): HeadersInit {
  const { apiKey } = getEnv();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    h["X-Api-Key"] = apiKey;
  }
  return h;
}

function baseUrl(): string {
  return getEnv().apiUrl.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch all files from the vault. */
export async function listFiles(): Promise<HolocronFile[]> {
  const res = await fetch(`${baseUrl()}/files`, { headers: headers() });
  if (!res.ok) throw new Error(`listFiles failed: ${res.status}`);
  const data: { files: HolocronFile[] } = await res.json();
  return data.files;
}

/** Fetch a single file's metadata and a presigned download URL. */
export async function getFile(
  id: string,
): Promise<{ file: HolocronFile; downloadUrl: string }> {
  const res = await fetch(`${baseUrl()}/files/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
  return res.json();
}

/** Create a share link for a file. Returns the share link id and URL. */
export async function createShareLink(
  fileId: string,
): Promise<{ id: string; url: string; expiresAt: string | null }> {
  const res = await fetch(`${baseUrl()}/share`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`createShareLink failed: ${res.status}`);
  return res.json();
}

/** Resolve a share token to file info and a presigned download URL. Public — no auth. */
export async function resolveShareLink(
  token: string,
): Promise<{ file: { name: string; size: number; mimeType: string }; downloadUrl: string }> {
  const res = await fetch(`${baseUrl()}/share/${token}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = new Error(`resolveShareLink failed: ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Upload a file via the three-step presigned URL flow:
 * 1. POST /files/upload → get presigned S3 URL + fileId
 * 2. PUT file to the presigned URL
 * 3. POST /files/upload/confirm → finalize
 */
export async function uploadFile(file: File): Promise<{ fileId: string }> {
  // Step 1 — request presigned upload URL
  const initRes = await fetch(`${baseUrl()}/files/upload`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: file.name,
      path: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    }),
  });
  if (!initRes.ok) throw new Error(`upload init failed: ${initRes.status}`);
  const { fileId, uploadUrl } = (await initRes.json()) as {
    fileId: string;
    uploadUrl: string;
  };

  // Step 2 — PUT file directly to S3
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);

  // Step 3 — confirm upload
  const confirmRes = await fetch(`${baseUrl()}/files/upload/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fileId }),
  });
  if (!confirmRes.ok)
    throw new Error(`upload confirm failed: ${confirmRes.status}`);

  return { fileId };
}

/** Move/rename a file by updating its path. */
export async function moveFile(id: string, newPath: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/files/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ path: newPath }),
  });
  if (!res.ok) throw new Error(`moveFile failed: ${res.status}`);
}

/** Delete a file by ID. The backend returns 204 on success. */
export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/files/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`deleteFile failed: ${res.status}`);
}

/** Fetch chunks for a file (text segments extracted during indexing). */
export async function getFileChunks(
  id: string,
): Promise<{
  chunks: Array<{
    id: string;
    text: string;
    page?: number;
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
  }>;
  total: number;
}> {
  const res = await fetch(`${baseUrl()}/files/${id}/chunks`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`getFileChunks failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  file: {
    id: string;
    name: string;
    path: string;
    mimeType: string;
    metadata?: unknown;
  };
  chunks: Array<{ text: string; page?: number; chunkIndex: number }>;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}

/** Full-text search across indexed file chunks. */
export async function searchFiles(
  query: string,
  limit = 20,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${baseUrl()}/files/search?${params}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`searchFiles failed: ${res.status}`);
  return res.json();
}

