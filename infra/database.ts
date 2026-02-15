/**
 * DynamoDB single-table and API key secret.
 *
 * All entities (Files,
 * ShareLinks) live in one DynamoDB table using composite keys.
 */

/**
 * SST secret for the Holocron API key used by clients.
 * Set via: `sst secret set HolocronApiKey <value>`
 */
export const holocronApiKey = new sst.Secret("HolocronApiKey");

/**
 * SST secret for the Vercel AI Gateway API key used by LLM-calling Lambdas.
 * Set via: `sst secret set VercelAIGatewayApiKey <value>`
 */
export const vercelAiGatewayApiKey = new sst.Secret("VercelAIGatewayApiKey");

/**
 * Single-table DynamoDB table for Holocron.
 *
 * Primary key: pk (S) + sk (S)
 *
 * GSI1 — listing & grouping:
 *   File listing:    gsi1pk = "FILES",                gsi1sk = "<createdAt>#<id>"
 *   Shares by file:  gsi1pk = "FILE_SHARES#<fileId>", gsi1sk = "SHARE#<id>"
 *
 * GSI2 — unique lookups:
 *   File by path:    gsi2pk = "PATH#<path>",  gsi2sk = "FILE#<id>"
 *   Share by URL:    gsi2pk = "URL#<url>",    gsi2sk = "SHARE#<id>"
 */
export const table = new sst.aws.Dynamo("Holocron", {
  fields: {
    pk: "string",
    sk: "string",
    gsi1pk: "string",
    gsi1sk: "string",
    gsi2pk: "string",
    gsi2sk: "string",
  },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
    gsi2: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
  },
});

