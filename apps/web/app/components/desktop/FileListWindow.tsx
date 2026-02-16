import type { HolocronFile } from "@holocron/core/types";
import { DocumentIcon } from "./DocumentIcon";

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

interface FileListWindowProps {
  files: HolocronFile[];
  onFileClick?: (fileId: string) => void;
}

/**
 * Window content that renders the file list in System 7 style.
 * Small document icons with names, sizes, and dates.
 */
export function FileListWindow({ files, onFileClick }: FileListWindowProps) {
  if (files.length === 0) {
    return (
      <div style={{ fontFamily: "Geneva_9, Geneva, sans-serif", fontSize: 14, padding: 8 }}>
        <em>0 items</em>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Geneva_9, Geneva, sans-serif", fontSize: 14 }}>
      {/* Details bar */}
      <div
        className="s7-file-list-detail-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 8px",
          fontFamily: "Chicago_12, Chicago, sans-serif",
          fontSize: 14,
          marginBottom: 4,
        }}
      >
        <span>{files.length} item{files.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Header row */}
      <div
        className="s7-file-list-header"
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr 80px 100px",
          gap: 4,
          padding: "2px 8px",
          fontFamily: "Chicago_12, Chicago, sans-serif",
          fontSize: 14,
          fontWeight: "bold",
        }}
      >
        <span />
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
      </div>

      {/* File rows */}
      {files.map((file) => (
        <div
          key={file.id}
          className="s7-file-row"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-holocron-file-id", file.id);
            e.dataTransfer.setData("text/plain", file.name);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onFileClick?.(file.id)}
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 80px 100px",
            gap: 4,
            padding: "3px 8px",
            alignItems: "center",
            cursor: "default",
          }}
        >
          <DocumentIcon size={20} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
          </span>
          <span>{formatBytes(file.size)}</span>
          <span>{formatDate(file.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}

