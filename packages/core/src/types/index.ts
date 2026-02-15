/**
 * Represents a file stored in the Holocron vault.
 */
export interface HolocronFile {
  id: string;
  name: string;
  path: string;
  s3Key?: string;
  size: number;
  mimeType: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
  /** Current indexing pipeline status. */
  indexingStatus?: IndexingStatus;
  /** LLM-generated metadata extracted during indexing. */
  metadata?: FileMetadata;
  /** S3 key for the extracted full text. */
  fullTextS3Key?: string;
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

/**
 * Status of the file indexing pipeline.
 */
export type IndexingStatus =
  | "pending"
  | "extracting"
  | "chunking"
  | "indexing"
  | "indexed"
  | "failed";

/**
 * LLM-generated metadata extracted during the indexing pipeline.
 */
export interface FileMetadata {
  /** 2-3 sentence LLM-generated summary. */
  summary: string;
  /** LLM-generated or extracted title. */
  title: string;
  /** Up to 5 keywords. */
  keywords: string[];
  /** 3-5 topic themes. */
  topics: string[];
  /** ISO language code. */
  language: string;
  /** Extracted author, if available. */
  author?: string;
  /** Page count for documents. */
  pageCount?: number;
  /** Word count of extracted text. */
  wordCount?: number;
  /** Character count of extracted text. */
  charCount?: number;
}

/**
 * A chunk of text extracted from a file for search indexing.
 */
export interface FileChunk {
  /** Unique chunk identifier (UUID). */
  id: string;
  /** Foreign key → HolocronFile.id. */
  fileId: string;
  /** Ordering index within the file. */
  chunkIndex: number;
  /** Chunk text content. */
  text: string;
  /** Page number, if applicable. */
  page?: number;
  /** Start offset in the full extracted text. */
  startOffset: number;
  /** End offset in the full extracted text. */
  endOffset: number;
  /** Timestamp when the chunk was created. */
  createdAt: Date;
}

