import { useLoaderData } from "react-router";
import type { HolocronFile } from "@holocron/core/types";
import { listFiles } from "../lib/api";
import { Desktop } from "~/components/desktop/Desktop";
import "~/components/desktop/system7-scoped.css";
import "~/components/desktop/desktop-reset.css";

// ---------------------------------------------------------------------------
// Loader — fetch file list server-side
// ---------------------------------------------------------------------------

export async function loader() {
  try {
    const files = await listFiles();
    return { files, error: null };
  } catch (e) {
    return { files: [] as HolocronFile[], error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta() {
  return [
    { title: "Holocron — Desktop" },
    { name: "description", content: "System 7 desktop view" },
  ];
}

// ---------------------------------------------------------------------------
// Component — full-screen System 7 desktop (no standard layout)
// ---------------------------------------------------------------------------

export default function DesktopRoute() {
  const { files, error } = useLoaderData<typeof loader>();

  return (
    <>
      {error && (
        <div
          style={{
            position: "fixed",
            top: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            background: "white",
            border: "2px solid black",
            padding: "8px 16px",

          }}
        >
          Failed to load files: {error}
        </div>
      )}
      <Desktop files={files} />
    </>
  );
}

