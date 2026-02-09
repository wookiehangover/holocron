/**
 * Lambda handler for processing uploaded files.
 *
 * Triggered by the Step Functions state machine after a file is uploaded
 * to S3. Responsible for extracting metadata, generating thumbnails, etc.
 */

import type { S3Event } from "aws-lambda";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { HolocronFile } from "@holocron/core/types";

const s3 = new S3Client({});

export async function handler(event: S3Event): Promise<{ processed: boolean; fileId: string }> {
  const record = event.Records[0];
  if (!record) {
    throw new Error("No S3 event record found");
  }

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

  console.log(`Processing uploaded file: s3://${bucket}/${key}`);

  // Fetch object metadata from S3
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key })
  );

  // TODO: extract metadata, generate thumbnails, update AgentDB record
  const fileMeta: Partial<HolocronFile> = {
    name: key.split("/").pop() ?? key,
    path: key,
    size: head.ContentLength ?? 0,
    mimeType: head.ContentType ?? "application/octet-stream",
  };

  console.log("File metadata:", JSON.stringify(fileMeta));

  return {
    processed: true,
    fileId: key,
  };
}

