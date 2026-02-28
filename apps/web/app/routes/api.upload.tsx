import { data } from "react-router";
import type { Route } from "./+types/api.upload";

// ---------------------------------------------------------------------------
// Resource route — proxy upload init + confirm through the server
// ---------------------------------------------------------------------------

const apiUrl = () => (process.env.API_URL ?? "/api").replace(/\/+$/, "");
const apiKey = () => process.env.API_KEY ?? "";

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey();
  if (key) h["X-Api-Key"] = key;
  return h;
}

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const intent = body.intent as string;

  if (intent === "init") {
    const res = await fetch(`${apiUrl()}/files/upload`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        name: body.name,
        path: body.path,
        size: body.size,
        mimeType: body.mimeType,
      }),
    });
    if (!res.ok) {
      return data({ error: `upload init failed: ${res.status}` }, { status: res.status });
    }
    const result: { fileId: string; uploadUrl: string } = await res.json();
    return { fileId: result.fileId, uploadUrl: result.uploadUrl };
  }

  if (intent === "confirm") {
    const res = await fetch(`${apiUrl()}/files/upload/confirm`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ fileId: body.fileId }),
    });
    if (!res.ok) {
      return data({ error: `upload confirm failed: ${res.status}` }, { status: res.status });
    }
    return { status: "ok" };
  }

  return data({ error: "unknown intent" }, { status: 400 });
}

