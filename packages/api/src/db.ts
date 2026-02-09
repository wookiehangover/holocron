/**
 * AgentDB connection helper.
 *
 * Provides a configured DatabaseService instance for use across
 * the API. Connection details are injected via environment variables
 * at runtime (SST resource linking).
 */

import { DatabaseService } from "@agentdb/sdk";

const AGENTDB_API_URL =
  process.env.AGENTDB_API_URL ?? "https://api.agentdb.dev";
const AGENTDB_API_KEY = process.env.AGENTDB_API_KEY ?? "";
const AGENTDB_DB_NAME = process.env.AGENTDB_DB_NAME ?? "holocron";

/**
 * Singleton AgentDB DatabaseService instance.
 */
export const agentdb = new DatabaseService(AGENTDB_API_URL, AGENTDB_API_KEY);

/**
 * Connect to the Holocron database.
 *
 * Call this once during Lambda cold start to establish a connection.
 */
export async function connectDb(token?: string) {
  const authToken = token ?? AGENTDB_API_KEY;
  return agentdb.connect(authToken, AGENTDB_DB_NAME, "sqlite");
}

