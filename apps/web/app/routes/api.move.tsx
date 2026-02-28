import { data } from "react-router";
import type { Route } from "./+types/api.move";
import { moveFile } from "~/lib/api";

// ---------------------------------------------------------------------------
// Resource route — proxy file move (path update) through the server
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const fileId = body.fileId as string;
  const newPath = body.newPath as string;

  if (!fileId || !newPath) {
    return data({ error: "fileId and newPath are required" }, { status: 400 });
  }

  try {
    await moveFile(fileId, newPath);
    return { ok: true };
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 500 });
  }
}

