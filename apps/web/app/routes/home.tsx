import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import type { HolocronFile } from "@holocron/core/types";
import { listFiles } from "~/lib/db.server";
import { getFile, uploadFile, createShareLink } from "../lib/api";
import { Layout } from "~/components/layout";
import { UploadZone } from "~/components/upload-zone";
import { FileTable } from "~/components/file-table";

// ---------------------------------------------------------------------------
// Loader — fetch file list server-side (direct DB query)
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const url = new URL(request.url);
    const sortBy = url.searchParams.get("sort") ?? undefined;
    const sortDir = (url.searchParams.get("dir") as "asc" | "desc") ?? undefined;
    const files = await listFiles({ sortBy, sortDir });
    return { files, error: null, sort: sortBy ?? null, dir: sortDir ?? null };
  } catch (e) {
    return { files: [] as HolocronFile[], error: (e as Error).message, sort: null, dir: null };
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export function meta() {
  return [
    { title: "Holocron" },
    { name: "description", content: "Personal file vault" },
  ];
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type UploadState = "idle" | "uploading" | "done" | "error";

export default function Home() {
  const { files, error, sort, dir } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploadState("uploading");
      setUploadError(null);
      try {
        for (let i = 0; i < fileList.length; i++) {
          await uploadFile(fileList[i]);
        }
        setUploadState("done");
        revalidator.revalidate();
        setTimeout(() => setUploadState("idle"), 2000);
      } catch (e) {
        setUploadState("error");
        setUploadError((e as Error).message);
      }
    },
    [revalidator],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  const handleDownload = useCallback(async (id: string) => {
    try {
      const { downloadUrl } = await getFile(id);
      window.open(downloadUrl, "_blank");
    } catch (e) {
      alert(`Download failed: ${(e as Error).message}`);
    }
  }, []);

  const handleShare = useCallback(async (fileId: string) => {
    try {
      const { url } = await createShareLink(fileId);
      const token = url.split("/").pop();
      const shareUrl = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedFileId(fileId);
      setTimeout(() => setCopiedFileId(null), 2000);
    } catch (e) {
      alert(`Share failed: ${(e as Error).message}`);
    }
  }, []);

  // Map internal state to upload zone state
  const zoneState = dragOver ? "dragover" : uploadState;

  return (
    <div
      className="relative min-h-screen"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Only leave if exiting the wrapper (not entering a child)
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Full-page drop overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Upload className="size-10 text-primary" />
          <p className="text-lg font-medium text-primary">Drop files to upload</p>
        </div>
      )}

      <Layout>
        <div className="space-y-6">
          <UploadZone
            uploadState={zoneState}
            errorMessage={uploadError}
            onUpload={handleUpload}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          />

          {error && (
            <p className="text-xs text-destructive">
              Failed to load files: {error}
            </p>
          )}

          <FileTable
            files={files}
            copiedFileId={copiedFileId}
            onDownload={handleDownload}
            onShare={handleShare}
            formatBytes={formatBytes}
            formatDate={formatDate}
            sort={sort}
            dir={dir}
          />
        </div>
      </Layout>
    </div>
  );
}
