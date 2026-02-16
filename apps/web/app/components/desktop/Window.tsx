import { useState, useRef, useCallback, type ReactNode } from "react";

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
  defaultSize = { width: 500, height: 360 },
  isActive,
  onFocus,
  onClose,
}: WindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size] = useState(defaultSize);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

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
          <span>Close</span>
        </button>
        <span className="title">{title}</span>
        <button className="resize" aria-label="Resize" disabled>
          <span>Resize</span>
        </button>
      </div>
      <div className="separator" />
      <div className="window-pane" style={{ flex: 1, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}

