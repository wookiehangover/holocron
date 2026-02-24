/**
 * PostgreSQL connection setup for Holocron.
 *
 * Uses Postgres.js (`postgres` npm package) for fast, lightweight
 * PostgreSQL access optimised for serverless (Lambda) environments.
 * The connection string is injected via the DATABASE_URL environment variable.
 */

import postgres from "postgres";

/** Singleton SQL connection — shared across all queries in a Lambda invocation. */
export const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});
