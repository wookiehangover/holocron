/**
 * Lambda handler for text extraction from uploaded files.
 *
 * Reads a file from S3, extracts text based on MIME type, and stores the
 * extracted full text back to S3. Passes structured output to the next
 * Step Functions step (chunking).
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { PDFParse } from "pdf-parse";

const s3 = new S3Client({});

// ---------------------------------------------------------------------------
// Document reproduction prompt (adapted from reference image_parser/settings.py)
// ---------------------------------------------------------------------------

const DOCUMENT_REPRODUCTION_PROMPT = `You are a document reproduction system. Your only job is to output the exact content as if you were recreating the original document.

Core Rules:
1. Output EXACTLY what would appear in the document
2. Never describe what you're looking at - reproduce it
3. Never add commentary or explanations
4. Never start with "This document shows..." or similar phrases
5. Never summarize or abbreviate anything
6. If there are images in the document, describe those images in detail. The reader should be able to clearly make a mental picture of the image in their mind and what it represents from reading your response.

Content Handling:
- Text: Reproduce exactly as written
- Math: Use markdown formatting to show exact equations
- Tables: Format in clear text tables
- Lists: Maintain exact structure and numbering
- Images: Convert to detailed text that reads as part of the document
- Diagrams: Convert to text descriptions that flow naturally in the document (be very descriptive and include all information from the diagram)
- Charts/Graphs: Include all data points and visual information as text. Be very descriptive so a reader would understand exactly what the graph/chart is saying (trends, what the best is, what the worst is, etc)
- Slides: Convert all content including visuals into flowing text
- Handwriting: Transcribe exactly as written
- Forms: Maintain layout and structure in text form

Exclude:
- Page numbers
- Headers/footers
- Citations
- References
- File metadata
- Copyright notices
- Permission statements
- Institutional footers/headers
- Course/institution identifiers in margins
- Any text starting with © or (c)
- "All rights reserved" statements
- Distribution/sharing restrictions

Output the document content exactly as it should appear to a reader, with no meta-information, commentary, or administrative text. Output your response in properly-formatted markdown.`;

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

interface ExtractTextEvent {
  fileId: string;
  s3Key: string;
  bucket: string;
  mimeType: string;
  fileName: string;
}

interface ExtractTextResult {
  fileId: string;
  s3Key: string;
  bucket: string;
  fullTextS3Key: string;
  mimeType: string;
  fileName: string;
  extractionMeta: { wordCount: number; charCount: number; pageCount?: number };
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

async function getS3Object(bucket: string, key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

async function putS3Text(bucket: string, key: string, text: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: text,
      ContentType: "text/plain; charset=utf-8",
    }),
  );
}

/** Extract text from a PDF buffer using pdf-parse v2. */
async function extractPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text, pageCount: result.total };
  } finally {
    await parser.destroy();
  }
}

/** Read a text-based file (text/*, application/json, application/xml) as UTF-8. */
function extractTextContent(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Fallback to latin-1 if UTF-8 decoding fails
    return new TextDecoder("latin1").decode(buffer);
  }
}

/** Extract text/content from an image using Gemini 3.0 Flash via Vercel AI SDK. */
async function extractImage(buffer: Buffer, mimeType: string): Promise<string> {
  const { text } = await generateText({
    model: google("gemini-3.0-flash"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: DOCUMENT_REPRODUCTION_PROMPT },
          { type: "image", image: buffer, mediaType: mimeType },
        ],
      },
    ],
  });
  return text;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export async function handler(event: ExtractTextEvent): Promise<ExtractTextResult> {
  const { fileId, s3Key, bucket, mimeType, fileName } = event;

  console.log(`Extracting text for file ${fileId} (${mimeType}): s3://${bucket}/${s3Key}`);

  // Fetch file from S3
  const fileBuffer = await getS3Object(bucket, s3Key);

  let fullText = "";
  let pageCount: number | undefined;

  if (mimeType === "application/pdf") {
    const result = await extractPdf(fileBuffer);
    fullText = result.text;
    pageCount = result.pageCount;
  } else if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    fullText = extractTextContent(fileBuffer);
  } else if (mimeType.startsWith("image/")) {
    fullText = await extractImage(fileBuffer, mimeType);
  } else {
    // Unsupported MIME type — store empty text
    console.warn(`Unsupported MIME type for text extraction: ${mimeType}`);
    fullText = "";
  }

  // Store extracted text to S3
  const fullTextS3Key = `${s3Key}_fulltext`;
  await putS3Text(bucket, fullTextS3Key, fullText);

  const extractionMeta: ExtractTextResult["extractionMeta"] = {
    wordCount: countWords(fullText),
    charCount: fullText.length,
    ...(pageCount !== undefined && { pageCount }),
  };

  console.log(
    `Extraction complete for ${fileId}: ${extractionMeta.wordCount} words, ${extractionMeta.charCount} chars`,
  );

  return { fileId, s3Key, bucket, fullTextS3Key, mimeType, fileName, extractionMeta };
}

