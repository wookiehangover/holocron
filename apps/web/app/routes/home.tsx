import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import type { HolocronFile } from "@holocron/core/types";
import { listFilesInFolder } from "~/lib/db.server";
import { getFile, uploadFile, createShareLink } from "../lib/api";
import { Layout } from "~/components/layout";
import { Button } from "~/components/ui/button";
import { FileTable } from "~/components/file-table";

// ---------------------------------------------------------------------------
// Loader — fetch file list server-side (direct DB query)
// ---------------------------------------------------------------------------

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const url = new URL(request.url);
    const sortBy = url.searchParams.get("sort") ?? undefined;
    const sortDir = (url.searchParams.get("dir") as "asc" | "desc") ?? undefined;
    const folder = url.searchParams.get("folder") ?? undefined;
    const { folders, files } = await listFilesInFolder({ sortBy, sortDir, folder });
    return {
      files,
      folders,
      folder: folder ?? null,
      error: null,
      sort: sortBy ?? null,
      dir: sortDir ?? null,
    };
  } catch (e) {
    return {
      files: [] as HolocronFile[],
      folders: [],
      folder: null,
      error: (e as Error).message,
      sort: null,
      dir: null,
    };
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

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

function FolderBreadcrumb({ folder }: { folder: string | null }) {
  if (!folder) {
    return (
      <nav className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground font-medium">Home</span>
      </nav>
    );
  }

  const segments = folder.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/" className="hover:underline hover:text-foreground">
        Home
      </Link>
      {segments.map((seg, i) => {
        const path = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={path} className="flex items-center gap-1">
            <span>/</span>
            {isLast ? (
              <span className="text-foreground font-medium">{seg}</span>
            ) : (
              <Link
                to={`/?folder=${encodeURIComponent(path)}`}
                className="hover:underline hover:text-foreground"
              >
                {seg}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default function Home() {
  const { files, folders, folder, error, sort, dir } = useLoaderData<typeof loader>();
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
          {error && (
            <p className="text-xs text-destructive">
              Failed to load files: {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <FolderBreadcrumb folder={folder} />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={uploadState === "uploading"}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadState === "uploading" && (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Uploading…
                  </>
                )}
                {uploadState === "done" && (
                  <>
                    <CheckCircle className="size-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Uploaded!</span>
                  </>
                )}
                {uploadState === "error" && (
                  <>
                    <AlertCircle className="size-3.5 text-destructive" />
                    <span className="text-destructive">Failed</span>
                  </>
                )}
                {uploadState === "idle" && (
                  <>
                    <Upload className="size-3.5" />
                    Upload
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
          </div>

          <FileTable
            files={files}
            folders={folders}
            currentFolder={folder}
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
