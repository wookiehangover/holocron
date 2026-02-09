/**
 * Step Functions state machine for the file processing pipeline.
 */

import { bucket } from "./storage.js";

export const processUploadFn = new sst.aws.Function("ProcessUpload", {
  handler: "packages/functions/src/process-upload.handler",
  runtime: "nodejs20.x",
  link: [bucket],
});

// IAM role for the Step Functions state machine
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
  policy: processUploadFn.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "lambda:InvokeFunction",
          Resource: arn,
        },
      ],
    })
  ),
});

/**
 * Placeholder state machine for the file processing pipeline.
 * Currently a single-step workflow that invokes the ProcessUpload Lambda.
 * Extend with additional states (e.g. thumbnail generation, metadata
 * extraction) as the processing pipeline is fleshed out.
 */
export const processingStateMachine = new aws.sfn.StateMachine(
  "HolocronProcessing",
  {
    roleArn: sfnRole.arn,
    definition: processUploadFn.arn.apply((arn) =>
      JSON.stringify({
        Comment: "Holocron file processing pipeline",
        StartAt: "ProcessUpload",
        States: {
          ProcessUpload: {
            Type: "Task",
            Resource: arn,
            End: true,
          },
        },
      })
    ),
  }
);

