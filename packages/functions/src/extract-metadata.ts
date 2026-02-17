/**
 * Lambda handler for LLM metadata extraction.
 *
 * Reads extracted full text from S3, uses Vercel AI SDK with Gemini 3.0 Flash
 * to generate rich metadata (summary, keywords, topics, title), and stores it
 * on the file record via PostgreSQL.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import type { FileMetadata } from "@holocron/core/types";
import { updateFileIndexingStatus } from "@holocron/api/db";

const s3 = new S3Client({});

/** Maximum characters of full text to send to the LLM. */
const MAX_TEXT_LENGTH = 10_000;

const METADATA_PROMPT = `Analyze the following document content and return a JSON object with:
- summary: A 2-3 sentence summary of the content. Just summarize directly, don't say "this document..."
- title: A descriptive title for the content. If none exists, create one.
- keywords: Up to 5 important keywords (array of strings)
- topics: 3-5 themes/topics the content is about (array of strings)
- language: ISO language code (e.g., "en")
- author: Author name if detectable, otherwise null
- genre: Single word describing the content type (e.g., "technical", "narrative", "reference")

Return ONLY valid JSON, no markdown wrapping.`;

const metadataSchema = z.object({
  summary: z.string(),
  title: z.string(),
  keywords: z.array(z.string()),
  topics: z.array(z.string()),
  language: z.string(),
  author: z.string().nullable(),
  genre: z.string(),
});

interface ExtractMetadataEvent {
  fileId: string;
  s3Key: string;
  bucket: string;
  fullTextS3Key: string;
  mimeType: string;
  fileName: string;
  extractionMeta: {
    wordCount: number;
    charCount: number;
    pageCount?: number;
    imageWidth?: number;
    imageHeight?: number;
  };
}

interface ExtractMetadataResult {
  fileId: string;
  status: "success" | "failed";
}

export async function handler(
  event: ExtractMetadataEvent,
): Promise<ExtractMetadataResult> {
  const { fileId, bucket, fullTextS3Key, extractionMeta } = event;

  console.log(`Extracting metadata for file ${fileId} from s3://${bucket}/${fullTextS3Key}`);

  try {
    // 1. Read the full text from S3
    const fullText = await readFullText(bucket, fullTextS3Key);

    // 2. Build partial metadata from extraction stats
    const baseMetadata: Partial<FileMetadata> = {
      wordCount: extractionMeta.wordCount,
      charCount: extractionMeta.charCount,
      pageCount: extractionMeta.pageCount,
      imageWidth: extractionMeta.imageWidth,
      imageHeight: extractionMeta.imageHeight,
    };

    // 3. Call LLM for rich metadata
    let llmMetadata: z.infer<typeof metadataSchema> | null = null;
    try {
      const textForLlm = fullText.slice(0, MAX_TEXT_LENGTH);
      const { object } = await generateObject({
        model: gateway("google/gemini-3-flash"),
        schema: metadataSchema,
        prompt: `${METADATA_PROMPT}\n\nInput:\n${textForLlm}`,
      });
      llmMetadata = object;
    } catch (llmError) {
      console.error("LLM metadata extraction failed, using extraction-only metadata:", llmError);
    }

    // 4. Merge LLM metadata with extraction metadata
    const metadata: FileMetadata = {
      summary: llmMetadata?.summary ?? "",
      title: llmMetadata?.title ?? event.fileName,
      keywords: llmMetadata?.keywords ?? [],
      topics: llmMetadata?.topics ?? [],
      language: llmMetadata?.language ?? "en",
      author: llmMetadata?.author ?? undefined,
      wordCount: baseMetadata.wordCount,
      charCount: baseMetadata.charCount,
      pageCount: baseMetadata.pageCount,
      imageWidth: baseMetadata.imageWidth,
      imageHeight: baseMetadata.imageHeight,
    };

    // 5. Store metadata and update status
    await updateFileIndexingStatus(fileId, "indexed", metadata, fullTextS3Key);

    console.log(`Metadata extraction complete for file ${fileId}`);
    return { fileId, status: "success" };
  } catch (error) {
    console.error(`Metadata extraction failed for file ${fileId}:`, error);

    // Never leave a file stuck — always update status
    try {
      await updateFileIndexingStatus(fileId, "failed");
    } catch (statusError) {
      console.error(`Failed to update status for file ${fileId}:`, statusError);
    }

    return { fileId, status: "failed" };
  }
}

/** Read the full text content from S3. */
async function readFullText(bucket: string, key: string): Promise<string> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`Empty response body for s3://${bucket}/${key}`);
  }

  return response.Body.transformToString("utf-8");
}

