import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;

interface WindowProps {
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
}

/**
 * Draggable System 7 window with title bar chrome, close box, and grow box.
 * Uses system.css classes: .window, .title-bar, .close, .resize, .separator, .window-pane
 */
export function Window({
  title,
  children,
  defaultPosition = { x: 80, y: 60 },
  defaultSize = { width: 640, height: 360 },
  isActive,
  onFocus,
  onClose,
}: WindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState({ ...defaultSize, width: Math.min(defaultSize.width, typeof window !== 'undefined' ? window.innerWidth : defaultSize.width) });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const userResized = useRef(false);
  const windowRef = useRef<HTMLDivElement>(null);

  // Sync size with external defaultSize changes (e.g. image natural size),
  // but only if the user hasn't manually resized.
  useEffect(() => {
    if (!userResized.current) {
      setSize((prev) => {
        if (prev.width === defaultSize.width && prev.height === defaultSize.height) return prev;
        return { width: Math.min(defaultSize.width, window.innerWidth), height: defaultSize.height };
      });
    }
  }, [defaultSize.width, defaultSize.height]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag from title bar, not from buttons
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      onFocus();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPosition({
          x: dragRef.current.origX + dx,
          y: dragRef.current.origY + dy,
        });
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [position, onFocus],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFocus();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: size.width,
        origH: size.height,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = ev.clientX - resizeRef.current.startX;
        const dy = ev.clientY - resizeRef.current.startY;
        setSize({
          width: Math.max(MIN_WIDTH, Math.min(resizeRef.current.origW + dx, window.innerWidth)),
          height: Math.max(MIN_HEIGHT, resizeRef.current.origH + dy),
        });
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        userResized.current = true;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [size, onFocus],
  );

  return (
    <div
      ref={windowRef}
      className="window"
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        display: "flex",
        zIndex: isActive ? 10 : 1,
        margin: 0,
      }}
      onMouseDown={onFocus}
    >
      <div
        className={isActive ? "title-bar" : "inactive-title-bar"}
        onMouseDown={handleMouseDown}
        style={{ cursor: "grab" }}
      >
        <button className="close" aria-label="Close" onClick={onClose}>
          {isActive && <span>Close</span>}
        </button>
        <span className="title">{title}</span>
        <button
          className="resize"
          aria-label="Resize"
          onMouseDown={handleResizeMouseDown}
          style={{ cursor: "nwse-resize" }}
        >
          <span>Resize</span>
        </button>
      </div>
      <div className="separator" />
      <div className="window-pane" style={{ flex: 1, overflow: "auto" }}>
        {children}
      </div>
      {/* Grow box — System 7 resize handle at bottom-right */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 15,
          height: 15,
          cursor: "nwse-resize",
          /* Diagonal lines mimicking the classic grow box */
          backgroundImage:
            "linear-gradient(135deg, transparent 30%, var(--secondary, #000) 30%, var(--secondary, #000) 33%, transparent 33%, transparent 55%, var(--secondary, #000) 55%, var(--secondary, #000) 58%, transparent 58%, transparent 80%, var(--secondary, #000) 80%, var(--secondary, #000) 83%, transparent 83%)",
        }}
      />
    </div>
  );
}

