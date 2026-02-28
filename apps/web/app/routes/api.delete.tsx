import { data } from "react-router";
import type { Route } from "./+types/api.delete";
import { deleteFile } from "~/lib/api";

// ---------------------------------------------------------------------------
// Resource route — delete a file server-side
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const fileId = body.fileId as string;

  if (!fileId) {
    return data({ error: "fileId is required" }, { status: 400 });
  }

  try {
    await deleteFile(fileId);
    return { ok: true };
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 500 });
  }
}

