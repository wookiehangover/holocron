import { useState, useCallback, useRef, useEffect } from "react";
import type { HolocronFile } from "@holocron/core/types";
import { getFile, deleteFile, uploadFile, listFiles } from "~/lib/api";
import { useTheme } from "~/lib/theme-provider";
import { FolderIcon } from "./FolderIcon";
import { TrashIcon } from "./TrashIcon";
import { Window } from "./Window";
import { FileListWindow } from "./FileListWindow";
import { FilePreviewWindow } from "./FilePreviewWindow";
import { GetInfoWindow } from "./GetInfoWindow";
import { ConfirmDialog } from "./ConfirmDialog";

interface DesktopProps {
  files: HolocronFile[];
}

/** Unique key for each open window. */
let nextWindowId = 1;

interface FolderWindow {
  id: number;
  kind: "folder";
  title: string;
  position: { x: number; y: number };
}

interface PreviewWindow {
  id: number;
  kind: "preview";
  title: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  file: HolocronFile;
  downloadUrl: string;
}

interface InfoWindow {
  id: number;
  kind: "info";
  title: string;
  position: { x: number; y: number };
  file: HolocronFile;
}

type OpenWindow = FolderWindow | PreviewWindow | InfoWindow;

interface PendingDelete {
  fileId: string;
  fileName: string;
}

/**
 * Main System 7 desktop surface.
 * - Top menu bar with Apple logo, File, Edit, View, Special
 * - Crosshatch background
 * - Holocron folder icon
 * - Trash icon in bottom-right
 * - Opens draggable windows on double-click
 */
export function Desktop({ files: initialFiles }: DesktopProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [files, setFiles] = useState<HolocronFile[]>(initialFiles);
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<number | null>(null);
  const [trashHighlight, setTrashHighlight] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Counter for staggering preview window positions. */
  const previewCount = windows.filter((w) => w.kind === "preview").length;

  const openFolder = useCallback(() => {
    const id = nextWindowId++;
    const offset = (windows.filter((w) => w.kind === "folder").length % 5) * 24;
    setWindows((prev) => [
      ...prev,
      { id, kind: "folder", title: "Holocron", position: { x: 80 + offset, y: 60 + offset } },
    ]);
    setActiveWindowId(id);
  }, [windows]);

  const openFilePreview = useCallback(
    async (fileId: string) => {
      try {
        const { file, downloadUrl } = await getFile(fileId);
        const id = nextWindowId++;
        const offset = (previewCount % 8) * 20;

        // Compute initial window size from image metadata when available
        let size: { width: number; height: number } | undefined;
        if (
          file.mimeType?.startsWith("image/") &&
          file.metadata?.imageWidth &&
          file.metadata?.imageHeight
        ) {
          const CHROME_W = 24;
          const CHROME_H = 56;
          const maxW = Math.min(800, window.innerWidth * 0.8);
          const maxH = Math.min(600, window.innerHeight * 0.8);
          const w = Math.max(200, Math.min(file.metadata.imageWidth + CHROME_W, maxW));
          const h = Math.max(150, Math.min(file.metadata.imageHeight + CHROME_H, maxH));
          size = { width: w, height: h };
        }

        setWindows((prev) => [
          ...prev,
          {
            id,
            kind: "preview",
            title: file.name,
            position: { x: 160 + offset, y: 80 + offset },
            size,
            file,
            downloadUrl,
          },
        ]);
        setActiveWindowId(id);
      } catch (e) {
        console.error("Failed to open file preview:", e);
      }
    },
    [previewCount],
  );

  const handleTrashDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setTrashHighlight(false);
      const fileId = e.dataTransfer.getData("application/x-holocron-file-id");
      if (!fileId) return;
      const fileName =
        e.dataTransfer.getData("text/plain") ||
        files.find((f) => f.id === fileId)?.name ||
        "this file";
      setPendingDelete({ fileId, fileName });
    },
    [files],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await deleteFile(pendingDelete.fileId);
      // Remove from local state
      setFiles((prev) => prev.filter((f) => f.id !== pendingDelete.fileId));
      // Close any preview windows for this file
      setWindows((prev) =>
        prev.filter(
          (w) => !(w.kind === "preview" && w.file.id === pendingDelete.fileId),
        ),
      );
      // Clear selection if the deleted file was selected
      setSelectedFileId((prev) =>
        prev === pendingDelete.fileId ? null : prev,
      );
    } catch (e) {
      console.error("Failed to delete file:", e);
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete]);

  const closeWindow = useCallback((id: number) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    setActiveWindowId((prev) => (prev === id ? null : prev));
  }, []);

  const handleFileUpload = useCallback(
    async (fileList: FileList) => {
      const uploads = Array.from(fileList).map((f) => uploadFile(f));
      try {
        await Promise.all(uploads);
        const refreshed = await listFiles();
        setFiles(refreshed);
      } catch (e) {
        console.error("Upload failed:", e);
      }
    },
    [],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedFileId) return;
    const fileName =
      files.find((f) => f.id === selectedFileId)?.name || "this file";
    setPendingDelete({ fileId: selectedFileId, fileName });
  }, [selectedFileId, files]);

  const openGetInfo = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      const id = nextWindowId++;
      const infoCount = windows.filter((w) => w.kind === "info").length;
      const offset = (infoCount % 6) * 20;
      setWindows((prev) => [
        ...prev,
        {
          id,
          kind: "info",
          title: `${file.name} Info`,
          position: { x: 200 + offset, y: 60 + offset },
          file,
        },
      ]);
      setActiveWindowId(id);
    },
    [files, windows],
  );

  // ⌘I / Ctrl+I keyboard shortcut for Get Info
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        if (selectedFileId) {
          openGetInfo(selectedFileId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFileId, openGetInfo]);

  const hasOpenWindow = windows.length > 0;
  const hasSelectedFile = selectedFileId !== null;

  return (
    <div className="system7-desktop fixed inset-0 flex flex-col overflow-hidden">
      {/* Menu bar */}
      <ul
        role="menu-bar"
        className="s7-menu-bar shrink-0 z-[100]"
      >
        <li role="menu-item">
          <span className="apple" />
        </li>
        <li role="menu-item" aria-haspopup="true">
          <strong>File</strong>
          <ul role="menu">
            <li role="menu-item">
              <button
                className="s7-menu-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                New
              </button>
            </li>
            <hr />
            <li role="menu-item">
              <button
                className={`s7-menu-btn ${hasSelectedFile ? "" : "opacity-50 pointer-events-none"}`}
                onClick={() => {
                  if (hasSelectedFile) openFilePreview(selectedFileId);
                }}
              >
                Open
              </button>
            </li>
            <li role="menu-item">
              <button
                className={`s7-menu-btn ${hasSelectedFile ? "" : "opacity-50 pointer-events-none"}`}
                onClick={() => {
                  if (hasSelectedFile) openGetInfo(selectedFileId);
                }}
              >
                Get Info
              </button>
            </li>
            <li role="menu-item">
              <button
                className={`s7-menu-btn ${hasOpenWindow ? "" : "opacity-50 pointer-events-none"}`}
                onClick={() => {
                  if (activeWindowId !== null) closeWindow(activeWindowId);
                }}
              >
                Close
              </button>
            </li>
            <hr />
            <li role="menu-item">
              <button
                className={`s7-menu-btn ${hasSelectedFile ? "" : "opacity-50 pointer-events-none"}`}
                onClick={handleDeleteSelected}
              >
                Delete
              </button>
            </li>
          </ul>
        </li>
        <li role="menu-item" aria-haspopup="false"><strong>Edit</strong></li>
        <li role="menu-item" aria-haspopup="true">
          <strong>View</strong>
          <ul role="menu">
            <li role="menu-item">
              <button
                className="s7-menu-btn"
                onClick={() => {
                  if (theme === "light") setTheme("dark");
                  else if (theme === "dark") setTheme("system");
                  else setTheme("light");
                }}
              >
                Theme: {theme === "system" ? `System (${resolvedTheme})` : theme}
              </button>
            </li>
          </ul>
        </li>
        <li role="menu-item" aria-haspopup="false"><strong>Special</strong></li>
      </ul>

      {/* Desktop surface with crosshatch pattern */}
      <div className="s7-desktop-surface flex-1 relative">
        {/* Holocron folder icon */}
        <div
          className="absolute top-[24px] left-[24px] flex flex-col items-center cursor-default select-none gap-[4px]"
          onDoubleClick={openFolder}
        >
          <FolderIcon size={48} />
          <span className="s7-icon-label text-center">
            Holocron
          </span>
        </div>

        {/* Trash icon — bottom-right */}
        <div
          className={`absolute bottom-[24px] right-[24px] flex flex-col items-center cursor-default select-none gap-[4px] p-[4px] ${trashHighlight ? "s7-trash-zone--active" : ""}`}
          style={trashHighlight ? undefined : { border: "2px solid transparent" }}
          onDragOver={(e) => {
            e.preventDefault();
            setTrashHighlight(true);
          }}
          onDragLeave={() => setTrashHighlight(false)}
          onDrop={handleTrashDrop}
        >
          <TrashIcon size={48} />
          <span className="s7-icon-label">
            Trash
          </span>
        </div>

        {/* Open windows */}
        {windows.map((w) => {
          const defaultSize =
            w.kind === "preview" && w.size
              ? w.size
              : w.kind === "info"
                ? { width: 340, height: 400 }
                : undefined;

          return (
            <Window
              key={w.id}
              title={w.title}
              defaultPosition={w.position}
              defaultSize={defaultSize}
              isActive={activeWindowId === w.id}
              onFocus={() => setActiveWindowId(w.id)}
              onClose={() => closeWindow(w.id)}
            >
              {w.kind === "folder" ? (
                <FileListWindow
                  files={files}
                  selectedFileId={selectedFileId}
                  onSelectFile={setSelectedFileId}
                  onFileClick={openFilePreview}
                />
              ) : w.kind === "info" ? (
                <GetInfoWindow file={w.file} />
              ) : (
                <FilePreviewWindow
                  file={w.file}
                  downloadUrl={w.downloadUrl}
                  initialSized={!!w.size}
                  onNaturalSize={(width, height) => {
                    setWindows((prev) =>
                      prev.map((win) =>
                        win.id === w.id ? { ...win, size: { width, height } } : win,
                      ),
                    );
                  }}
                />
              )}
            </Window>
          );
        })}

        {/* Delete confirmation dialog */}
        {pendingDelete && (
          <ConfirmDialog
            message={`Are you sure you want to delete "${pendingDelete.fileName}"?`}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

