/**
 * Represents a file stored in the Holocron vault.
 */
export interface HolocronFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents the synchronization state of a file.
 */
export type SyncState =
  | "pending"
  | "uploading"
  | "downloading"
  | "synced"
  | "conflict"
  | "error";

/**
 * Represents a shareable link to a file.
 */
export interface ShareLink {
  id: string;
  fileId: string;
  url: string;
  expiresAt: Date | null;
  createdAt: Date;
}

