/**
 * API Gateway + Hono Lambda function.
 */

import { bucket } from "./storage.js";
import { table, holocronApiKey } from "./database.js";
import { processingStateMachine } from "./processing.js";

const honoFn = new sst.aws.Function("HolocronApi", {
  handler: "packages/api/src/index.handler",
  runtime: "nodejs20.x",
  link: [bucket, table, holocronApiKey],
  environment: {
    HOLOCRON_TABLE_NAME: table.name,
    HOLOCRON_API_KEY: holocronApiKey.value,
    BUCKET_NAME: bucket.name,
    PROCESSING_STATE_MACHINE_ARN: processingStateMachine.arn,
  },
});

// Grant the API Lambda permission to start Step Functions executions
new aws.iam.RolePolicy("ApiSfnStartExecutionPolicy", {
  role: honoFn.nodes.role.name,
  policy: processingStateMachine.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "states:StartExecution",
          Resource: arn,
        },
      ],
    }),
  ),
});

export const api = new sst.aws.ApiGatewayV2("HolocronGateway");
api.route("$default", honoFn.arn);

