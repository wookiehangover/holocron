/**
 * Step Functions state machine for the file indexing pipeline.
 *
 * Pipeline: ExtractText → Parallel(ChunkText, ExtractMetadata) → End
 */

import { bucket } from "./storage.js";
import { databaseUrl, vercelAiGatewayApiKey } from "./database.js";

// ---------------------------------------------------------------------------
// Lambda functions
// ---------------------------------------------------------------------------

export const extractTextFn = new sst.aws.Function("ExtractText", {
  handler: "packages/functions/src/extract-text.handler",
  runtime: "nodejs22.x",
  timeout: "300 seconds",
  memory: "1024 MB",
  link: [bucket, databaseUrl, vercelAiGatewayApiKey],
  environment: {
    DATABASE_URL: databaseUrl.value,
    AI_GATEWAY_API_KEY: vercelAiGatewayApiKey.value,
  },
});

export const chunkTextFn = new sst.aws.Function("ChunkText", {
  handler: "packages/functions/src/chunk-text.handler",
  runtime: "nodejs22.x",
  timeout: "300 seconds",
  memory: "512 MB",
  link: [bucket, databaseUrl, vercelAiGatewayApiKey],
  environment: {
    DATABASE_URL: databaseUrl.value,
    AI_GATEWAY_API_KEY: vercelAiGatewayApiKey.value,
  },
});

export const extractMetadataFn = new sst.aws.Function("ExtractMetadata", {
  handler: "packages/functions/src/extract-metadata.handler",
  runtime: "nodejs22.x",
  timeout: "120 seconds",
  memory: "512 MB",
  link: [bucket, databaseUrl, vercelAiGatewayApiKey],
  environment: {
    DATABASE_URL: databaseUrl.value,
    AI_GATEWAY_API_KEY: vercelAiGatewayApiKey.value,
  },
});

export const markIndexingFailedFn = new sst.aws.Function("MarkIndexingFailed", {
  handler: "packages/functions/src/mark-indexing-failed.handler",
  runtime: "nodejs22.x",
  timeout: "30 seconds",
  memory: "256 MB",
  link: [databaseUrl],
  environment: {
    DATABASE_URL: databaseUrl.value,
  },
});

// ---------------------------------------------------------------------------
// IAM role for the Step Functions state machine
// ---------------------------------------------------------------------------

const sfnRole = new aws.iam.Role("ProcessingStateMachineRole", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "states.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("ProcessingStateMachinePolicy", {
  role: sfnRole.id,
  policy: $util
    .all([
      extractTextFn.arn,
      chunkTextFn.arn,
      extractMetadataFn.arn,
      markIndexingFailedFn.arn,
    ])
    .apply(([extractArn, chunkArn, metadataArn, markFailedArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: [extractArn, chunkArn, metadataArn, markFailedArn],
          },
        ],
      }),
    ),
});

// ---------------------------------------------------------------------------
// State machine — multi-step indexing pipeline
//
// ExtractText → Parallel(ChunkText, ExtractMetadata) → End
// Any error → FailureHandler (log + set status to "failed")
// ---------------------------------------------------------------------------

export const processingStateMachine = new aws.sfn.StateMachine(
  "HolocronProcessing",
  {
    roleArn: sfnRole.arn,
    definition: $util
      .all([
        extractTextFn.arn,
        chunkTextFn.arn,
        extractMetadataFn.arn,
        markIndexingFailedFn.arn,
      ])
      .apply(([extractArn, chunkArn, metadataArn, markFailedArn]) =>
        JSON.stringify({
          Comment: "Holocron file indexing pipeline",
          StartAt: "ExtractText",
          States: {
            ExtractText: {
              Type: "Task",
              Resource: extractArn,
              Next: "ParallelProcessing",
              Retry: [
                {
                  ErrorEquals: ["States.ALL"],
                  IntervalSeconds: 2,
                  MaxAttempts: 3,
                  BackoffRate: 2.0,
                },
              ],
              Catch: [
                {
                  ErrorEquals: ["States.ALL"],
                  Next: "FailureHandler",
                  ResultPath: "$.error",
                },
              ],
            },
            ParallelProcessing: {
              Type: "Parallel",
              Branches: [
                {
                  StartAt: "ChunkText",
                  States: {
                    ChunkText: {
                      Type: "Task",
                      Resource: chunkArn,
                      Retry: [
                        {
                          ErrorEquals: ["States.ALL"],
                          IntervalSeconds: 2,
                          MaxAttempts: 3,
                          BackoffRate: 2.0,
                        },
                      ],
                      End: true,
                    },
                  },
                },
                {
                  StartAt: "ExtractMetadata",
                  States: {
                    ExtractMetadata: {
                      Type: "Task",
                      Resource: metadataArn,
                      Retry: [
                        {
                          ErrorEquals: ["States.ALL"],
                          IntervalSeconds: 2,
                          MaxAttempts: 3,
                          BackoffRate: 2.0,
                        },
                      ],
                      End: true,
                    },
                  },
                },
              ],
              End: true,
              Catch: [
                {
                  ErrorEquals: ["States.ALL"],
                  Next: "FailureHandler",
                  ResultPath: "$.error",
                },
              ],
            },
            FailureHandler: {
              Type: "Task",
              Resource: markFailedArn,
              End: true,
            },
          },
        }),
      ),
  },
);

