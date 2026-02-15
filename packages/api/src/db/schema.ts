/**
 * DynamoDB single-table constants.
 *
 * Key prefixes and index names used by the data access layer in db.ts.
 * Table is provisioned by SST in infra/database.ts.
 */

/** Table name — injected at runtime via SST resource linking. */
export const TABLE_NAME = process.env.HOLOCRON_TABLE_NAME ?? "Holocron";

/** GSI names (must match infra/database.ts definitions). */
export const GSI1_NAME = "gsi1";
export const GSI2_NAME = "gsi2";

/** Key prefixes for the single-table design. */
export const PREFIX = {
  FILE: "FILE#",
  FILES: "FILES",
  PATH: "PATH#",
  SHARE: "SHARE#",
  FILE_SHARES: "FILE_SHARES#",
  URL: "URL#",
  VAULT_VERSION: "VAULT#VERSION",
} as const;

