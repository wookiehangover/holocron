/**
 * Step Functions state machine for the file processing pipeline.
 */

import { bucket } from "./storage.js";

const processUploadFn = new sst.aws.Function("ProcessUpload", {
  handler: "packages/functions/src/process-upload.handler",
  runtime: "nodejs20.x",
  link: [bucket],
});

// TODO: Define a full state machine with sst.aws.StepFunctions once
// the processing pipeline stages are finalised. For now, export the
// processing Lambda so it can be wired up later.
export { processUploadFn };

