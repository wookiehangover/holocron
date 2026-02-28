import { useState, useCallback, useRef } from "react";
import { Upload } from "lucide-react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/home";
import type { HolocronFile } from "@holocron/core/types";
import { listFilesInFolder } from "~/lib/db.server";
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
  return [{ title: "Holocron" }, { name: "description", content: "Personal file vault" }];
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
              <Link to={`/?folder=${encodeURIComponent(path)}`} className="hover:underline hover:text-foreground">
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
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const uploadFile = async (file: File) => {
        const toastId = toast.loading(`Uploading ${file.name}…`, {
          description: "0%",
        });

        try {
          // Step 1 — request presigned URL via server-side proxy
          const initRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "init",
              name: file.name,
              path: folder ? `${folder}/${file.name}` : file.name,
              size: file.size,
              mimeType: file.type || "application/octet-stream",
            }),
          });
          if (!initRes.ok) throw new Error(`upload init failed: ${initRes.status}`);
          const { fileId, uploadUrl } = await initRes.json();

          // Step 2 — PUT file directly to S3 via XHR for progress tracking
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                toast.loading(`Uploading ${file.name}…`, {
                  id: toastId,
                  description: `${pct}%`,
                });
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`S3 upload failed: ${xhr.status}`));
              }
            });

            xhr.addEventListener("error", () => reject(new Error("S3 upload network error")));
            xhr.addEventListener("abort", () => reject(new Error("S3 upload aborted")));

            xhr.send(file);
          });

          // Step 3 — confirm upload via server-side proxy
          const confirmRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intent: "confirm", fileId }),
          });
          if (!confirmRes.ok) throw new Error(`upload confirm failed: ${confirmRes.status}`);

          toast.success(`${file.name} uploaded`, { id: toastId });
        } catch (e) {
          toast.error(`Failed to upload ${file.name}`, {
            id: toastId,
            description: (e as Error).message,
          });
        }
      };

      // Upload all files concurrently, each with its own toast
      const uploads = Array.from(fileList).map(uploadFile);
      await Promise.allSettled(uploads);
      revalidator.revalidate();
    },
    [folder, revalidator],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // Ignore internal drag-drop (file moves within the table)
      if (e.dataTransfer.types.includes("application/x-holocron-file-id")) return;
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  const handleMove = useCallback(
    async (fileId: string, newPath: string) => {
      const fileName = newPath.split("/").pop() ?? newPath;
      try {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId, newPath }),
        });
        if (!res.ok) throw new Error(`move failed: ${res.status}`);
        toast.success(`Moved ${fileName}`);
        revalidator.revalidate();
      } catch (e) {
        toast.error(`Failed to move ${fileName}`, {
          description: (e as Error).message,
        });
      }
    },
    [revalidator],
  );

  const handleDownload = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id }),
      });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const { downloadUrl } = await res.json();
      window.open(downloadUrl, "_blank");
    } catch (e) {
      alert(`Download failed: ${(e as Error).message}`);
    }
  }, []);

  const handleShare = useCallback(async (fileId: string) => {
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) throw new Error(`share failed: ${res.status}`);
      const { url } = await res.json();
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
        // Don't show upload overlay for internal file moves
        if (e.dataTransfer.types.includes("application/x-holocron-file-id")) return;
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
          {error && <p className="text-xs text-destructive">Failed to load files: {error}</p>}

          <div className="flex items-center justify-between gap-3">
            <FolderBreadcrumb folder={folder} />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Upload
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
            onDownload={handleDownload}
            onShare={handleShare}
            onMove={handleMove}
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
