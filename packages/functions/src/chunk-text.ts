/**
 * Lambda handler for splitting extracted text into chunks.
 *
 * Reads the full text from S3, splits it into chunks using a paragraph-based
 * algorithm (ported from the reference DumbChunker), and stores the chunks
 * in DynamoDB.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { FileChunk } from "@holocron/core/types";
import {
  insertChunks,
  deleteChunksByFileId,
  updateFileIndexingStatus,
} from "@holocron/api/db";

const s3 = new S3Client({});

// ---------------------------------------------------------------------------
// Chunking constants
// ---------------------------------------------------------------------------

const MIN_WORDS_PER_CHUNK = 50;
const MAX_WORDS_PER_CHUNK = 250;
const MAX_CHARS_PER_CHUNK = 1000;

// ---------------------------------------------------------------------------
// Chunking algorithm (ported from reference DumbChunker)
// ---------------------------------------------------------------------------

/**
 * Split text into chunks by paragraph boundaries, then by sentence boundaries
 * for oversized paragraphs. Mirrors the reference Python DumbChunker logic.
 */
function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let currentCharCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWordCount = para.split(/\s+/).length;
    const paraCharCount = para.length;

    // Handle paragraphs that exceed limits — split by sentences
    if (paraWordCount > MAX_WORDS_PER_CHUNK || paraCharCount > MAX_CHARS_PER_CHUNK) {
      // Flush any accumulated chunk first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentWordCount = 0;
        currentCharCount = 0;
      }

      // Split long paragraph into sentences
      let sentences = para.split(/(?<=[.!?])\s+/);

      // Hard limit: split any sentence longer than 3× max chars
      const hardLimit = 3 * MAX_CHARS_PER_CHUNK;
      const safeSentences: string[] = [];
      for (const s of sentences) {
        if (s.length > hardLimit) {
          for (let j = 0; j < s.length; j += hardLimit) {
            safeSentences.push(s.slice(j, j + hardLimit));
          }
        } else {
          safeSentences.push(s);
        }
      }
      sentences = safeSentences;

      let tempChunk: string[] = [];
      let tempWordCount = 0;
      let tempCharCount = 0;

      for (const sentence of sentences) {
        const sentenceWordCount = sentence.split(/\s+/).length;
        const sentenceCharCount = sentence.length;

        if (
          tempWordCount + sentenceWordCount > MAX_WORDS_PER_CHUNK ||
          tempCharCount + sentenceCharCount > MAX_CHARS_PER_CHUNK
        ) {
          if (tempChunk.length > 0) {
            chunks.push(tempChunk.join(" "));
          }
          tempChunk = [sentence];
          tempWordCount = sentenceWordCount;
          tempCharCount = sentenceCharCount;
        } else {
          tempChunk.push(sentence);
          tempWordCount += sentenceWordCount;
          tempCharCount += sentenceCharCount + 1; // +1 for joining space
        }
      }

      if (tempChunk.length > 0) {
        chunks.push(tempChunk.join(" "));
      }
      continue;
    }

    // Check if adding this paragraph would exceed limits
    if (
      currentWordCount + paraWordCount > MAX_WORDS_PER_CHUNK ||
      currentCharCount + paraCharCount > MAX_CHARS_PER_CHUNK
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
      }
      currentChunk = [];
      currentWordCount = 0;
      currentCharCount = 0;
    }

    currentChunk.push(para);
    currentWordCount += paraWordCount;
    currentCharCount += paraCharCount + (currentChunk.length > 1 ? 1 : 0);

    // Flush when we reach minimum words or it's the last paragraph
    if (currentWordCount >= MIN_WORDS_PER_CHUNK || i === paragraphs.length - 1) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
      }
      currentChunk = [];
      currentWordCount = 0;
      currentCharCount = 0;
    }
  }

  // Handle any remaining text
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  // If no chunks created but there is text, return the whole thing
  if (chunks.length === 0 && text.trim()) {
    return [text.trim()];
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Offset tracking
// ---------------------------------------------------------------------------

/**
 * Given the original text and the chunked strings, compute the startOffset and
 * endOffset for each chunk by finding each chunk's content in the source text.
 */
function computeOffsets(
  fullText: string,
  chunks: string[],
): Array<{ startOffset: number; endOffset: number }> {
  const offsets: Array<{ startOffset: number; endOffset: number }> = [];
  let searchFrom = 0;

  for (const chunk of chunks) {
    // Find the first word of the chunk in the full text to locate its position.
    // Since chunking joins paragraphs with spaces (replacing double-newlines),
    // we search for the first meaningful token to anchor the offset.
    const firstToken = chunk.slice(0, Math.min(40, chunk.length));
    let idx = fullText.indexOf(firstToken, searchFrom);
    if (idx === -1) {
      // Fallback: use the current search position
      idx = searchFrom;
    }
    const startOffset = idx;
    const endOffset = startOffset + chunk.length;
    offsets.push({ startOffset, endOffset });
    searchFrom = idx + 1;
  }

  return offsets;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(event: {
  fileId: string;
  s3Key: string;
  bucket: string;
  fullTextS3Key: string;
  mimeType: string;
  fileName: string;
  extractionMeta: { wordCount: number; charCount: number; pageCount?: number };
}): Promise<{
  fileId: string;
  chunkCount: number;
  status: "success" | "empty";
}> {
  const { fileId, bucket, fullTextS3Key, extractionMeta } = event;

  console.log(`Chunking text for file ${fileId} from s3://${bucket}/${fullTextS3Key}`);

  // Mark file as "chunking"
  await updateFileIndexingStatus(fileId, "chunking");

  // Read full text from S3
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: fullTextS3Key }),
  );
  const fullText = (await response.Body?.transformToString("utf-8")) ?? "";

  // Handle empty text
  if (!fullText.trim()) {
    console.log(`File ${fileId}: empty text, nothing to chunk`);
    return { fileId, chunkCount: 0, status: "empty" };
  }

  // Chunk the text
  const chunkTexts = chunkText(fullText);

  // Compute offsets for each chunk
  const offsets = computeOffsets(fullText, chunkTexts);

  // Build FileChunk records
  const now = new Date();
  const chunks: FileChunk[] = chunkTexts.map((text, index) => ({
    id: crypto.randomUUID(),
    fileId,
    chunkIndex: index,
    text,
    page: extractionMeta.pageCount != null ? getPageNumber(fullText, offsets[index].startOffset) : undefined,
    startOffset: offsets[index].startOffset,
    endOffset: offsets[index].endOffset,
    createdAt: now,
  }));

  // Delete existing chunks (re-indexing support) then insert new ones
  await deleteChunksByFileId(fileId);
  await insertChunks(fileId, chunks);

  console.log(`File ${fileId}: created ${chunks.length} chunks`);

  return { fileId, chunkCount: chunks.length, status: "success" };
}

// ---------------------------------------------------------------------------
// Page number estimation (for PDFs with page breaks)
// ---------------------------------------------------------------------------

/**
 * Estimate the page number for a given offset by counting form-feed characters
 * (\f) or double-newline boundaries before the offset. PDF text extractors
 * typically insert form-feeds between pages.
 */
function getPageNumber(fullText: string, offset: number): number {
  const textBefore = fullText.slice(0, offset);
  // Count form-feed characters (standard page break marker from pdf-parse)
  const formFeeds = (textBefore.match(/\f/g) ?? []).length;
  return formFeeds + 1;
}

