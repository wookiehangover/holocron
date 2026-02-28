import { data } from "react-router";
import type { Route } from "./+types/api.download";
import { getFile } from "~/lib/api";

// ---------------------------------------------------------------------------
// Resource route — fetch a presigned download URL server-side
// ---------------------------------------------------------------------------

export async function action({ request }: Route.ActionArgs) {
  const body = await request.json();
  const fileId = body.fileId as string;

  if (!fileId) {
    return data({ error: "fileId is required" }, { status: 400 });
  }

  try {
    const { downloadUrl } = await getFile(fileId);
    return { downloadUrl };
  } catch (e) {
    return data({ error: (e as Error).message }, { status: 500 });
  }
}

