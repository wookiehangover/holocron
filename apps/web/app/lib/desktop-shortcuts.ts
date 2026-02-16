const STORAGE_KEY = "holocron-desktop-shortcuts";

export interface DesktopShortcut {
  id: string;
  kind: "file" | "folder";
  targetId?: string; // file ID for file shortcuts
  targetPath?: string; // folder path for folder shortcuts
  name: string;
  position: { x: number; y: number };
}

export function loadShortcuts(): DesktopShortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DesktopShortcut[];
  } catch {
    return [];
  }
}

export function saveShortcuts(shortcuts: DesktopShortcut[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

