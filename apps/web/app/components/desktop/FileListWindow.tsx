import { useState, useMemo } from "react";
import type { HolocronFile } from "@holocron/core/types";
import { DocumentIcon } from "./DocumentIcon";
import { FolderIcon } from "./FolderIcon";

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

interface FolderEntry {
  kind: "folder";
  name: string;
  /** Number of files (recursively) inside this folder. */
  count: number;
}

interface FileEntry {
  kind: "file";
  file: HolocronFile;
}

type ListEntry = FolderEntry | FileEntry;

/**
 * Derive folder and file entries at a given directory level.
 * `currentPath` is "" for root, "docs" for the docs folder, etc.
 */
function entriesAtPath(files: HolocronFile[], currentPath: string): ListEntry[] {
  const prefix = currentPath ? currentPath + "/" : "";
  const folderSet = new Map<string, number>();
  const directFiles: HolocronFile[] = [];

  for (const file of files) {
    const filePath = file.path || file.name;
    if (!filePath.startsWith(prefix)) continue;

    const rest = filePath.slice(prefix.length);
    const slashIdx = rest.indexOf("/");

    if (slashIdx === -1) {
      // File is directly at this level
      directFiles.push(file);
    } else {
      // File is inside a subfolder
      const folderName = rest.slice(0, slashIdx);
      folderSet.set(folderName, (folderSet.get(folderName) ?? 0) + 1);
    }
  }

  const entries: ListEntry[] = [];

  // Folders first, sorted alphabetically
  for (const [name, count] of [...folderSet.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    entries.push({ kind: "folder", name, count });
  }

  // Then files, sorted by name
  for (const file of directFiles.sort((a, b) => a.name.localeCompare(b.name))) {
    entries.push({ kind: "file", file });
  }

  return entries;
}

interface FileListWindowProps {
  files: HolocronFile[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onFileClick?: (fileId: string) => void;
}

/**
 * Window content that renders the file list in System 7 style.
 * Supports folder navigation derived from file paths.
 */
export function FileListWindow({
  files,
  selectedFileId,
  onSelectFile,
  onFileClick,
}: FileListWindowProps) {
  const [currentPath, setCurrentPath] = useState("");

  const entries = useMemo(() => entriesAtPath(files, currentPath), [files, currentPath]);

  const pathSegments = currentPath ? currentPath.split("/") : [];
  const totalItems = entries.length;

  if (files.length === 0) {
    return (
      <div style={{ padding: 8 }}>
        <em>0 items</em>
      </div>
    );
  }

  return (
    <div>
      {/* Details bar with breadcrumb */}
      <div className="s7-file-list-detail-bar text-sm flex justify-between p-1 mb-1 gap-1">
        <span className="flex items-center gap-1 min-w-0">
          {currentPath ? (
            <>
              <button
                className="underline cursor-pointer bg-transparent border-none font-inherit text-inherit p-0"
                onClick={() => setCurrentPath("")}
              >
                Holocron
              </button>
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span>›</span>
                  {i < pathSegments.length - 1 ? (
                    <button
                      className="underline cursor-pointer bg-transparent border-none font-inherit text-inherit p-0"
                      onClick={() => setCurrentPath(pathSegments.slice(0, i + 1).join("/"))}
                    >
                      {seg}
                    </button>
                  ) : (
                    <span>{seg}</span>
                  )}
                </span>
              ))}
            </>
          ) : (
            <span>
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        {currentPath && (
          <span>
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Header row */}
      <div className="s7-file-list-header text-sm grid grid-cols-[28px_1fr_80px_100px] gap-4 p-1 items-center mb-2">
        <span />
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
      </div>

      {/* Entries */}
      {entries.map((entry) =>
        entry.kind === "folder" ? (
          <div
            key={`folder:${entry.name}`}
            className="s7-file-row text-sm grid grid-cols-[28px_1fr_80px_100px] gap-4 p-1 items-center cursor-default"
            onDoubleClick={() =>
              setCurrentPath(currentPath ? `${currentPath}/${entry.name}` : entry.name)
            }
          >
            <FolderIcon size={20} />
            <span className="truncate font-bold">{entry.name}</span>
            <span>{entry.count} item{entry.count !== 1 ? "s" : ""}</span>
            <span>—</span>
          </div>
        ) : (
          <div
            key={entry.file.id}
            className={`s7-file-row text-sm grid grid-cols-[28px_1fr_80px_100px] gap-4 p-1 items-center cursor-default${entry.file.id === selectedFileId ? " s7-file-row--selected" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-holocron-file-id", entry.file.id);
              e.dataTransfer.setData("text/plain", entry.file.name);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onSelectFile(entry.file.id)}
            onDoubleClick={() => onFileClick?.(entry.file.id)}
          >
            <DocumentIcon size={20} />
            <span className="truncate">{entry.file.name}</span>
            <span>{formatBytes(entry.file.size)}</span>
            <span>{formatDate(entry.file.updatedAt)}</span>
          </div>
        ),
      )}
    </div>
  );
}
