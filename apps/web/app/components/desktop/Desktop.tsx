import { useState, useCallback } from "react";
import type { HolocronFile } from "@holocron/core/types";
import { getFile, deleteFile } from "~/lib/api";
import { useTheme } from "~/lib/theme-provider";
import { FolderIcon } from "./FolderIcon";
import { TrashIcon } from "./TrashIcon";
import { Window } from "./Window";
import { FileListWindow } from "./FileListWindow";
import { FilePreviewWindow } from "./FilePreviewWindow";
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

type OpenWindow = FolderWindow | PreviewWindow;

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
        setWindows((prev) => [
          ...prev,
          {
            id,
            kind: "preview",
            title: file.name,
            position: { x: 160 + offset, y: 80 + offset },
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

  return (
    <div
      className="system7-desktop"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Chicago_12, Chicago, sans-serif",
        fontSize: 14,
        overflow: "hidden",
      }}
    >
      {/* Menu bar */}
      <ul
        role="menu-bar"
        className="s7-menu-bar"
        style={{
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <li role="menu-item">
          <span className="apple" />
        </li>
        <li role="menu-item" aria-haspopup="false"><strong>File</strong></li>
        <li role="menu-item" aria-haspopup="false"><strong>Edit</strong></li>
        <li role="menu-item" aria-haspopup="true">
          <strong>View</strong>
          <ul role="menu">
            <li role="menu-item">
              <button
                onClick={() => {
                  if (theme === "light") setTheme("dark");
                  else if (theme === "dark") setTheme("system");
                  else setTheme("light");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "2px 16px",
                  border: "none",
                  cursor: "default",
                  font: "inherit",
                  color: "inherit",
                  background: "inherit",
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
      <div
        className="s7-desktop-surface"
        style={{
          flex: 1,
          position: "relative",
        }}
      >
        {/* Holocron folder icon */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: "default",
            userSelect: "none",
            gap: 4,
          }}
          onDoubleClick={openFolder}
        >
          <FolderIcon size={48} />
          <span
            className="s7-icon-label"
            style={{
              fontFamily: "Geneva_9, Geneva, sans-serif",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Holocron
          </span>
        </div>

        {/* Trash icon — bottom-right */}
        <div
          className={trashHighlight ? "s7-trash-zone--active" : undefined}
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            cursor: "default",
            userSelect: "none",
            gap: 4,
            padding: 4,
            border: trashHighlight ? undefined : "2px solid transparent",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setTrashHighlight(true);
          }}
          onDragLeave={() => setTrashHighlight(false)}
          onDrop={handleTrashDrop}
        >
          <TrashIcon size={48} />
          <span
            className="s7-icon-label"
            style={{
              fontFamily: "Geneva_9, Geneva, sans-serif",
              fontSize: 14,
            }}
          >
            Trash
          </span>
        </div>

        {/* Open windows */}
        {windows.map((w) => (
          <Window
            key={w.id}
            title={w.title}
            defaultPosition={w.position}
            defaultSize={w.kind === "preview" && w.size ? w.size : undefined}
            isActive={activeWindowId === w.id}
            onFocus={() => setActiveWindowId(w.id)}
            onClose={() => closeWindow(w.id)}
          >
            {w.kind === "folder" ? (
              <FileListWindow files={files} onFileClick={openFilePreview} />
            ) : (
              <FilePreviewWindow
                file={w.file}
                downloadUrl={w.downloadUrl}
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
        ))}

        {/* Delete confirmation dialog */}
        {pendingDelete && (
          <ConfirmDialog
            message={`Are you sure you want to delete "${pendingDelete.fileName}"?`}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    </div>
  );
}

