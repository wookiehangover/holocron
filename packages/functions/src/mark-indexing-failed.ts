/**
 * Lambda handler invoked by the Step Functions FailureHandler state.
 *
 * When any step in the indexing pipeline fails, the Catch block routes here
 * so we can mark the file as "failed" in PostgreSQL — preventing the file from
 * being stuck in an intermediate indexing status forever.
 */

import { updateFileIndexingStatus } from "@holocron/api/db";

// ---------------------------------------------------------------------------
// Event shape — original pipeline input + error from Catch block
// ---------------------------------------------------------------------------

interface MarkIndexingFailedEvent {
  fileId: string;
  s3Key: string;
  bucket: string;
  mimeType: string;
  fileName: string;
  /** Injected by the Step Functions Catch block via ResultPath "$.error" */
  error?: unknown;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(event: MarkIndexingFailedEvent): Promise<{ fileId: string; status: "failed" }> {
  const { fileId, error } = event;

  console.error(`Pipeline failure for file ${fileId}:`, JSON.stringify(error));

  await updateFileIndexingStatus(fileId, "failed");

  console.log(`Marked file ${fileId} as failed`);

  return { fileId, status: "failed" };
}

