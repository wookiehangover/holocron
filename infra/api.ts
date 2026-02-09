/**
 * API Gateway + Hono Lambda function.
 */

import { bucket } from "./storage.js";
import { agentDbApiKey, AGENTDB_API_URL, AGENTDB_DB_NAME } from "./database.js";

const honoFn = new sst.aws.Function("HolocronApi", {
  handler: "packages/api/src/index.handler",
  runtime: "nodejs20.x",
  link: [bucket, agentDbApiKey],
  environment: {
    AGENTDB_API_URL,
    AGENTDB_DB_NAME,
  },
});

export const api = new sst.aws.ApiGatewayV2("HolocronGateway", {
  routes: {
    $default: honoFn,
  },
});

