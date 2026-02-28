import { data } from "react-router";
import type { Route } from "./+types/api.share";
import { createShareLink } from "~/lib/api";

// ---------------------------------------------------------------------------
// Resource route — create a share link server-side
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const fileId = body.fileId as string;

  if (!fileId) {
    return data({ error: "fileId is required" }, { status: 400 });
  }

  try {
    const result = await createShareLink(fileId);
    return { id: result.id, url: result.url, expiresAt: result.expiresAt };
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 500 });
  }
}

