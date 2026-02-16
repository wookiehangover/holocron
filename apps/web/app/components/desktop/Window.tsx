import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
/** Minimum pixels of the title bar that must stay visible on each edge. */
const VISIBLE_PX = 40;

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

        const winW = windowRef.current?.offsetWidth ?? MIN_WIDTH;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;

        // Clamp so at least VISIBLE_PX of the title bar stays on screen
        const x = Math.max(-(winW - VISIBLE_PX), Math.min(dragRef.current.origX + dx, vpW - VISIBLE_PX));
        const y = Math.max(0, Math.min(dragRef.current.origY + dy, vpH - VISIBLE_PX));

        setPosition({ x, y });
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
          height: Math.max(MIN_HEIGHT, Math.min(resizeRef.current.origH + dy, window.innerHeight)),
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
      className="window absolute flex m-0"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: isActive ? 10 : 1,
      }}
      onMouseDown={onFocus}
    >
      <div
        className={`${isActive ? "title-bar" : "inactive-title-bar"} cursor-grab`}
        onMouseDown={handleMouseDown}
      >
        <button className="close" aria-label="Close" onClick={onClose}>
          <span>Close</span>
        </button>
        <span className="title">{title}</span>
        <button
          className="resize cursor-nwse-resize"
          aria-label="Resize"
          onMouseDown={handleResizeMouseDown}
        >
          <span>Resize</span>
        </button>
      </div>
      <div className="separator" />
      <div className="window-pane flex-1 overflow-auto">
        {children}
      </div>
      {/* Grow box — System 7 resize handle at bottom-right */}
      <div
        className="s7-grow-box absolute right-0 bottom-0 w-[15px] h-[15px] cursor-nwse-resize"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}

