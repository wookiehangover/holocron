import { useState, useCallback } from "react";
import { Link, useLoaderData } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { HolocronFile } from "@holocron/core/types";
import { getFile, getFileChunks, createShareLink } from "~/lib/api";
import { Layout } from "~/components/layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ImagePreview } from "~/components/preview/image-preview";
import { TextPreview } from "~/components/preview/text-preview";
import { PdfPreview } from "~/components/preview/pdf-preview";
import type { Route } from "./+types/file-detail";

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

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function indexingStatusColor(status?: string) {
  switch (status) {
    case "indexed":
      return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "pending":
    case "extracting":
    case "chunking":
    case "indexing":
      return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "failed":
      return "bg-red-500/15 text-red-700 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
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
// Loader
// ---------------------------------------------------------------------------

type LoaderData =
  | {
      ok: true;
      file: HolocronFile;
      downloadUrl: string;
      chunks: Array<{
        id: string;
        text: string;
        page?: number;
        chunkIndex: number;
        startOffset: number;
        endOffset: number;
      }>;
      totalChunks: number;
    }
  | { ok: false; error: string };

export async function loader({ params }: Route.LoaderArgs): Promise<LoaderData> {
  try {
    const [fileData, chunksData] = await Promise.all([
      getFile(params.id),
      getFileChunks(params.id).catch(() => ({ chunks: [], total: 0 })),
    ]);
    return {
      ok: true,
      file: fileData.file,
      downloadUrl: fileData.downloadUrl,
      chunks: chunksData.chunks,
      totalChunks: chunksData.total,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta({ data }: Route.MetaArgs) {
  const d = data as LoaderData | undefined;
  const title =
    d && d.ok ? `${d.file.name} — Holocron` : "File — Holocron";
  return [
    { title },
    { name: "description", content: "File details and preview" },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileDetail() {
  const data = useLoaderData<typeof loader>();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async (fileId: string) => {
    try {
      const { url } = await createShareLink(fileId);
      const token = url.split("/").pop();
      const shareUrl = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — share is a non-critical action
    }
  }, []);

  if (!data.ok) {
    return (
      <Layout>
        <div className="space-y-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>{data.error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  const { file, downloadUrl } = data;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Back link — full width, above grid */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>

        {/* 2-column grid on desktop, single column on mobile */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* LEFT COLUMN — content preview (wider) */}
          <div className="min-w-0 space-y-4">
            {/* File title at top of content area */}
            <div>
              <h1 className="truncate text-lg font-medium">{file.name}</h1>
              {file.path !== file.name && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {file.path}
                </p>
              )}
            </div>

            {/* Preview */}
            <PreviewSection
              mimeType={file.mimeType}
              downloadUrl={downloadUrl}
              fileName={file.name}
            />
          </div>

          {/* RIGHT COLUMN — metadata sidebar (narrower, sticky) */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {/* Actions */}
            <div className="flex gap-2">
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm">Download</Button>
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare(file.id)}
              >
                {copied ? "Copied!" : "Share"}
              </Button>
            </div>

            {/* File info card */}
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div className="text-xs text-muted-foreground space-y-2">
                  <div className="flex justify-between">
                    <span>Size</span>
                    <span className="text-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type</span>
                    <Badge variant="secondary" className="text-xs">
                      {file.mimeType}
                    </Badge>
                  </div>
                  {file.indexingStatus && (
                    <div className="flex justify-between">
                      <span>Status</span>
                      <Badge
                        variant="outline"
                        className={indexingStatusColor(file.indexingStatus)}
                      >
                        {file.indexingStatus}
                      </Badge>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Uploaded</span>
                    <span className="text-foreground">
                      {formatDate(file.createdAt)}
                    </span>
                  </div>
                  {file.updatedAt &&
                    file.updatedAt !== file.createdAt && (
                      <div className="flex justify-between">
                        <span>Updated</span>
                        <span className="text-foreground">
                          {formatDate(file.updatedAt)}
                        </span>
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Metadata card (keywords, topics, etc.) */}
            {file.metadata && <MetadataSection file={file} />}
          </aside>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// MetadataSection
// ---------------------------------------------------------------------------

function MetadataSection({ file }: { file: HolocronFile }) {
  const meta = file.metadata;
  if (!meta) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {meta.title || "File Metadata"}
        </CardTitle>
        {meta.summary && (
          <CardDescription className="text-xs leading-relaxed">
            {meta.summary}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Keywords */}
          {meta.keywords && meta.keywords.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Keywords
              </p>
              <div className="flex flex-wrap gap-1.5">
                {meta.keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Topics */}
          {meta.topics && meta.topics.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Topics
              </p>
              <div className="flex flex-wrap gap-1.5">
                {meta.topics.map((topic) => (
                  <Badge key={topic} variant="outline" className="text-xs">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {meta.wordCount != null && (
              <span>{meta.wordCount.toLocaleString()} words</span>
            )}
            {meta.pageCount != null && (
              <span>
                {meta.pageCount} {meta.pageCount === 1 ? "page" : "pages"}
              </span>
            )}
            {meta.author && <span>Author: {meta.author}</span>}
            {meta.language && <span>Language: {meta.language}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PreviewSection
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

