import { useState, useCallback } from "react";
import type { HolocronFile } from "@holocron/core/types";
import { FolderIcon } from "./FolderIcon";
import { TrashIcon } from "./TrashIcon";
import { Window } from "./Window";
import { FileListWindow } from "./FileListWindow";

interface DesktopProps {
  files: HolocronFile[];
}

/** Unique key for each open window. */
let nextWindowId = 1;

interface OpenWindow {
  id: number;
  title: string;
  position: { x: number; y: number };
}

/**
 * Main System 7 desktop surface.
 * - Top menu bar with Apple logo, File, Edit, View, Special
 * - Crosshatch background
 * - Holocron folder icon
 * - Trash icon in bottom-right
 * - Opens draggable windows on double-click
 */
export function Desktop({ files }: DesktopProps) {
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<number | null>(null);
  const [trashHighlight, setTrashHighlight] = useState(false);

  const openFolder = useCallback(() => {
    const id = nextWindowId++;
    const offset = (windows.length % 5) * 24;
    setWindows((prev) => [
      ...prev,
      { id, title: "Holocron", position: { x: 80 + offset, y: 60 + offset } },
    ]);
    setActiveWindowId(id);
  }, [windows.length]);

  const closeWindow = useCallback((id: number) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    setActiveWindowId((prev) => (prev === id ? null : prev));
  }, []);

  return (
    <div
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
        style={{
          borderBottom: "2px solid black",
          flexShrink: 0,
          zIndex: 100,
        }}
      >
        <li role="menu-item">
          <span className="apple" />
        </li>
        <li role="menu-item" aria-haspopup="false"><strong>File</strong></li>
        <li role="menu-item" aria-haspopup="false"><strong>Edit</strong></li>
        <li role="menu-item" aria-haspopup="false"><strong>View</strong></li>
        <li role="menu-item" aria-haspopup="false"><strong>Special</strong></li>
      </ul>

      {/* Desktop surface with crosshatch pattern */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background:
            "linear-gradient(90deg, #ffffff 21px, transparent 1%) center, linear-gradient(#ffffff 21px, transparent 1%) center, #000000",
          backgroundSize: "22px 22px",
          backgroundAttachment: "fixed",
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
            style={{
              fontFamily: "Geneva_9, Geneva, sans-serif",
              fontSize: 12,
              color: "white",
              textShadow: "1px 1px 0 black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black",
              textAlign: "center",
            }}
          >
            Holocron
          </span>
        </div>

        {/* Trash icon — bottom-right */}
        <div
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
            border: trashHighlight ? "2px dotted black" : "2px solid transparent",
            background: trashHighlight ? "rgba(0,0,0,0.15)" : "transparent",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setTrashHighlight(true);
          }}
          onDragLeave={() => setTrashHighlight(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTrashHighlight(false);
            // Deletion wired in Task 2
          }}
        >
          <TrashIcon size={48} />
          <span
            style={{
              fontFamily: "Geneva_9, Geneva, sans-serif",
              fontSize: 12,
              color: "white",
              textShadow: "1px 1px 0 black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black",
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
            isActive={activeWindowId === w.id}
            onFocus={() => setActiveWindowId(w.id)}
            onClose={() => closeWindow(w.id)}
          >
            <FileListWindow files={files} />
          </Window>
        ))}
      </div>
    </div>
  );
}

