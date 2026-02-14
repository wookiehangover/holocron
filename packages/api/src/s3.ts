/**
 * S3 presigned URL helpers.
 *
 * Provides a lazy-initialised S3Client singleton and convenience
 * functions for generating presigned PUT (upload) and GET (download) URLs.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// Client singleton (lazy init)
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({});
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Bucket name helper
// ---------------------------------------------------------------------------

/**
 * Return the S3 bucket name from the environment.
 * Injected by SST resource linking at deploy time.
 */
export function getBucketName(): string {
  const name = process.env.BUCKET_NAME;
  if (!name) {
    throw new Error("BUCKET_NAME environment variable is not set");
  }
  return name;
}

// ---------------------------------------------------------------------------
// Presigned URL generators
// ---------------------------------------------------------------------------

/**
 * Generate a presigned PUT URL for uploading an object to S3.
 *
 * @param bucket     - S3 bucket name
 * @param key        - Object key
 * @param contentType - MIME type for the upload
 * @param expiresIn  - URL validity in seconds (default: 300 = 5 min)
 */
export async function getPresignedPutUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 cross-package type mismatch
  return getSignedUrl(client as any, command, { expiresIn });
}

/**
 * Generate a presigned GET URL for downloading an object from S3.
 *
 * @param bucket    - S3 bucket name
 * @param key       - Object key
 * @param expiresIn - URL validity in seconds (default: 3600 = 1 hour)
 */
export async function getPresignedGetUrl(
  bucket: string,
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK v3 cross-package type mismatch
  return getSignedUrl(client as any, command, { expiresIn });
}

