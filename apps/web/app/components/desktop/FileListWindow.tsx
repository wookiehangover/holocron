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
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onFileClick?: (fileId: string) => void;
}

/**
 * Window content that renders the file list in System 7 style.
 * Small document icons with names, sizes, and dates.
 */
export function FileListWindow({
  files,
  selectedFileId,
  onSelectFile,
  onFileClick,
}: FileListWindowProps) {
  if (files.length === 0) {
    return (
      <div style={{ padding: 8 }}>
        <em>0 items</em>
      </div>
    );
  }

  return (
    <div>
      {/* Details bar */}
      <div className="s7-file-list-detail-bar text-sm flex justify-between p-1 mb-1 gap-1">
        <span>
          {files.length} item{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Header row */}
      <div className="s7-file-list-header text-sm grid grid-cols-[28px_1fr_80px_100px] gap-4 p-1 items-center mb-2">
        <span />
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
      </div>

      {/* File rows */}
      {files.map((file) => (
        <div
          key={file.id}
          className="s7-file-row text-sm grid grid-cols-[28px_1fr_80px_100px] gap-4 p-1 items-center cursor-default"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-holocron-file-id", file.id);
            e.dataTransfer.setData("text/plain", file.name);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onSelectFile(file.id)}
          onDoubleClick={() => onFileClick?.(file.id)}
        >
          <DocumentIcon size={20} />
          <span className="truncate">{file.name}</span>
          <span>{formatBytes(file.size)}</span>
          <span>{formatDate(file.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}
