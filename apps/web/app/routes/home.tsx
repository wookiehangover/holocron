import { useState, useCallback, useRef } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import type { HolocronFile } from "@holocron/core/types";
import { listFiles, getFile, uploadFile } from "../lib/api";

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
  const { files, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Holocron
      </h1>

      {/* Upload drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#2563eb" : "#d1d5db"}`,
          borderRadius: 8,
          padding: "2rem",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: "1.5rem",
          background: dragOver ? "#eff6ff" : "#fff",
          transition: "all 150ms",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploadState === "uploading" && (
          <p style={{ color: "#6b7280" }}>Uploading…</p>
        )}
        {uploadState === "done" && (
          <p style={{ color: "#16a34a" }}>Upload complete!</p>
        )}
        {uploadState === "error" && (
          <p style={{ color: "#dc2626" }}>Upload failed: {uploadError}</p>
        )}
        {uploadState === "idle" && (
          <p style={{ color: "#6b7280" }}>
            Drop files here or click to upload
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <p style={{ color: "#dc2626", marginBottom: "1rem" }}>
          Failed to load files: {error}
        </p>
      )}

      {/* Empty state */}
      {!error && files.length === 0 && (
        <p style={{ color: "#9ca3af", textAlign: "center", padding: "3rem 0" }}>
          No files yet. Drop files here to upload.
        </p>
      )}

      {/* File table */}
      {files.length > 0 && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "#fff",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <th style={{ padding: "0.75rem 1rem", fontWeight: 500, fontSize: "0.875rem", color: "#6b7280" }}>
                Name
              </th>
              <th style={{ padding: "0.75rem 1rem", fontWeight: 500, fontSize: "0.875rem", color: "#6b7280" }}>
                Size
              </th>
              <th style={{ padding: "0.75rem 1rem", fontWeight: 500, fontSize: "0.875rem", color: "#6b7280" }}>
                Type
              </th>
              <th style={{ padding: "0.75rem 1rem", fontWeight: 500, fontSize: "0.875rem", color: "#6b7280" }}>
                Date
              </th>
              <th style={{ padding: "0.75rem 1rem", width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.id}
                style={{ borderBottom: "1px solid #f3f4f6" }}
              >
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                  {file.name}
                </td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#6b7280" }}>
                  {formatBytes(file.size)}
                </td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#6b7280" }}>
                  {file.mimeType}
                </td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#6b7280" }}>
                  {formatDate(file.createdAt)}
                </td>
                <td style={{ padding: "0.75rem 1rem" }}>
                  <button
                    onClick={() => handleDownload(file.id)}
                    style={{
                      padding: "0.25rem 0.75rem",
                      fontSize: "0.8125rem",
                      background: "#f3f4f6",
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
