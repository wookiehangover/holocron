import { useLoaderData } from "react-router";
import { resolveShareLink } from "../lib/api";
import type { Route } from "./+types/share.$token";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Loader — resolve share token server-side
// ---------------------------------------------------------------------------

type ShareData =
  | { ok: true; file: { name: string; size: number; mimeType: string }; downloadUrl: string }
  | { ok: false; status: number };

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const data = await resolveShareLink(params.token);
    return { ok: true as const, file: data.file, downloadUrl: data.downloadUrl };
  } catch (e: any) {
    const status: number = e.status ?? 500;
    return { ok: false as const, status };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta() {
  return [
    { title: "Shared File — Holocron" },
    { name: "description", content: "Download a shared file" },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SharePage() {
  const data = useLoaderData<typeof loader>();

  if (!data.ok) {
    const heading =
      data.status === 410
        ? "This share link has expired"
        : data.status === 404
          ? "Share link not found"
          : "Something went wrong";
    const detail =
      data.status === 410
        ? "The owner may need to create a new share link."
        : data.status === 404
          ? "This link may have been removed or is invalid."
          : "Please try again later.";

    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          {heading}
        </h1>
        <p style={{ color: "#6b7280" }}>{detail}</p>
      </main>
    );
  }

  const { file, downloadUrl } = data;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "4rem 1rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Holocron
      </h1>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "2rem",
        }}
      >
        <p style={{ fontSize: "1.125rem", fontWeight: 500, marginBottom: "0.5rem" }}>
          {file.name}
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          {formatBytes(file.size)} · {file.mimeType}
        </p>

        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "0.625rem 1.5rem",
            fontSize: "0.9375rem",
            fontWeight: 500,
            color: "#fff",
            background: "#2563eb",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          Download
        </a>
      </div>
    </main>
  );
}

