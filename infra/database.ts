/**
 * AgentDB configuration constants.
 *
 * AgentDB is a serverless SQLite service. The API key is stored as an
 * SST secret and injected into Lambda functions at runtime.
 */

export const AGENTDB_API_URL = "https://api.agentdb.dev";
export const AGENTDB_DB_NAME = "holocron";

/**
 * SST secret for the AgentDB API key.
 * Set via: `sst secret set AgentDbApiKey <value>`
 */
export const agentDbApiKey = new sst.Secret("AgentDbApiKey");

