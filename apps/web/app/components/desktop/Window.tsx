import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
/** Pixels from viewport edge that trigger an edge-snap zone. */
const SNAP_THRESHOLD = 8;

export type SnapZone = "left" | "right" | null;

/** Return the width and height of the desktop surface (the Window's offset parent). */
function getParentBounds(el: HTMLElement | null): { w: number; h: number } {
  const parent = el?.parentElement;
  if (parent) return { w: parent.clientWidth, h: parent.clientHeight };
  return { w: window.innerWidth, h: window.innerHeight };
}

interface WindowProps {
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  /** Called during drag with the current snap zone (or null). */
  onSnapChange?: (zone: SnapZone) => void;
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
  onSnapChange,
}: WindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState({ ...defaultSize, width: Math.min(defaultSize.width, typeof window !== 'undefined' ? window.innerWidth : defaultSize.width) });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const userResized = useRef(false);
  const windowRef = useRef<HTMLDivElement>(null);
  /** Stores pre-snap position + size so we can restore on unsnap. */
  const preSnapRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  /** Which edge the window is currently snapped to. */
  const snappedRef = useRef<SnapZone>(null);

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

      let origX = position.x;
      let origY = position.y;
      let dragStartW = size.width;
      let dragStartH = size.height;

      // If currently snapped, restore pre-snap size and center under cursor
      if (snappedRef.current && preSnapRef.current) {
        const restored = preSnapRef.current;
        dragStartW = restored.width;
        dragStartH = restored.height;
        setSize({ width: restored.width, height: restored.height });
        // Center the restored window horizontally under the cursor,
        // relative to the desktop surface
        const parentRect = windowRef.current?.parentElement?.getBoundingClientRect();
        const offsetX = parentRect?.left ?? 0;
        const { w: surfW, h: surfH } = getParentBounds(windowRef.current);
        origX = e.clientX - offsetX - restored.width / 2;
        origY = e.clientY - (parentRect?.top ?? 0);
        // Clamp restored position within desktop surface
        origX = Math.max(0, Math.min(origX, Math.max(0, surfW - restored.width)));
        origY = Math.max(0, Math.min(origY, Math.max(0, surfH - restored.height)));
        setPosition({ x: origX, y: origY });
        snappedRef.current = null;
        preSnapRef.current = null;
      }

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX,
        origY,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;

        const winW = windowRef.current?.offsetWidth ?? MIN_WIDTH;
        const winH = windowRef.current?.offsetHeight ?? MIN_HEIGHT;
        const { w: surfW, h: surfH } = getParentBounds(windowRef.current);

        // Keep window fully within the desktop surface
        const x = Math.max(0, Math.min(dragRef.current.origX + dx, Math.max(0, surfW - winW)));
        const y = Math.max(0, Math.min(dragRef.current.origY + dy, Math.max(0, surfH - winH)));

        // Detect snap zones
        const zone: SnapZone =
          ev.clientX <= SNAP_THRESHOLD ? "left" :
          ev.clientX >= window.innerWidth - SNAP_THRESHOLD ? "right" :
          null;
        onSnapChange?.(zone);

        setPosition({ x, y });
      };

      const handleMouseUp = (ev: MouseEvent) => {
        // Check if we should snap
        const zone: SnapZone =
          ev.clientX <= SNAP_THRESHOLD ? "left" :
          ev.clientX >= window.innerWidth - SNAP_THRESHOLD ? "right" :
          null;

        if (zone) {
          const { w: surfW, h: surfH } = getParentBounds(windowRef.current);
          // Save pre-snap state using values captured at drag start
          preSnapRef.current = { x: dragRef.current!.origX, y: dragRef.current!.origY, width: dragStartW, height: dragStartH };
          const snapW = Math.floor(surfW / 2);
          setPosition({ x: zone === "left" ? 0 : snapW, y: 0 });
          setSize({ width: snapW, height: surfH });
          snappedRef.current = zone;
        }
        onSnapChange?.(null);

        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [position, size, onFocus, onSnapChange],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFocus();
      // Capture current position from DOM so resize respects bounds
      const posX = windowRef.current?.offsetLeft ?? 0;
      const posY = windowRef.current?.offsetTop ?? 0;
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
        const { w: surfW, h: surfH } = getParentBounds(windowRef.current);
        setSize({
          width: Math.max(MIN_WIDTH, Math.min(resizeRef.current.origW + dx, surfW - posX)),
          height: Math.max(MIN_HEIGHT, Math.min(resizeRef.current.origH + dy, surfH - posY)),
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

