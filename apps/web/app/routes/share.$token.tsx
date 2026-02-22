import { useLoaderData } from "react-router";
import { resolveShareLink } from "../lib/api";
import type { Route } from "./+types/share.$token";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ImagePreview } from "~/components/preview/image-preview";
import { TextPreview } from "~/components/preview/text-preview";
import { PdfPreview } from "~/components/preview/pdf-preview";

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

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  return [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/x-sh",
  ].includes(mime);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function PreviewSection({
  mimeType,
  downloadUrl,
  fileName,
}: {
  mimeType: string;
  downloadUrl: string;
  fileName: string;
}) {
  // Image preview
  if (mimeType.startsWith("image/")) {
    return <ImagePreview downloadUrl={downloadUrl} fileName={fileName} />;
  }

  // PDF preview
  if (mimeType === "application/pdf") {
    return <PdfPreview downloadUrl={downloadUrl} />;
  }

  // Text preview
  if (isTextMime(mimeType)) {
    return <TextPreview downloadUrl={downloadUrl} />;
  }

  // Unknown type — no preview
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          No preview available for this file type
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{mimeType}</p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4"
        >
          <Button>Download File</Button>
        </a>
      </CardContent>
    </Card>
  );
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
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-lg font-semibold mb-2">{heading}</h1>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </main>
    );
  }

  const { file, downloadUrl } = data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      {/* 2-column grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:grid-rows-[auto_1fr]">
        {/* LEFT — title + preview */}
        <div className="min-w-0 space-y-4 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-6">
          <div className="flex items-center">
            <h2 className="truncate text-lg font-medium">{file.name}</h2>
          </div>
          <PreviewSection mimeType={file.mimeType} downloadUrl={downloadUrl} fileName={file.name} />
        </div>

        {/* RIGHT — actions + info */}
        <aside className="space-y-4 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-6">
          <div className="flex items-center gap-2">
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm">Download</Button>
            </a>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div className="text-xs text-muted-foreground space-y-2">
                  <div className="flex justify-between">
                    <span>Size</span>
                    <span className="text-foreground">{formatBytes(file.size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type</span>
                    <Badge variant="secondary" className="text-xs">{file.mimeType}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </main>
  );
}

