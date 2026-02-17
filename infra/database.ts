/**
 * Database secrets and API key secrets.
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
 * SST secret for the PlanetScale PostgreSQL connection string.
 * Set via: `sst secret set DatabaseUrl <value>`
 */
export const databaseUrl = new sst.Secret("DatabaseUrl");

