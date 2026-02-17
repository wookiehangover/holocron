/**
 * Unit tests for the PostgreSQL data access layer (db.ts).
 *
 * The `sql` tagged template from Postgres.js is mocked so no real DB calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HolocronFile, ShareLink } from "@holocron/core/types";

// ---------------------------------------------------------------------------
// Mock setup — must come before db.ts import
// ---------------------------------------------------------------------------

/**
 * Each call to `sql`...`` pushes { strings, values } into `mockCalls`
 * and resolves with the next value from `mockResults`.
 */
const { mockCalls, mockResults, mockBeginCalls } = vi.hoisted(() => ({
  mockCalls: [] as Array<{ strings: string[]; values: unknown[] }>,
  mockResults: [] as unknown[],
  mockBeginCalls: [] as Array<Array<{ strings: string[]; values: unknown[] }>>,
}));

vi.mock("../db/schema.js", () => {
  /** Create a tagged-template function that records calls and returns mock results. */
  function createSqlFn(callLog: Array<{ strings: string[]; values: unknown[] }>) {
    const fn = (strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      // Postgres.js sql(values) helper form — called with a plain array/object, not template strings
      if (!Array.isArray(strings) || typeof strings[0] !== "string" || !("raw" in strings)) {
        // This is the sql(values) helper for bulk inserts — just return a marker
        return { __bulkInsert: true, values: strings };
      }
      callLog.push({ strings: [...strings], values });
      return Promise.resolve(mockResults.shift() ?? []);
    };

    // sql.json() helper
    fn.json = (val: unknown) => val;

    // sql.begin() for transactions
    fn.begin = async (callback: (tx: typeof fn) => Promise<void>) => {
      const txCalls: Array<{ strings: string[]; values: unknown[] }> = [];
      const txFn = createSqlFn(txCalls);
      await callback(txFn as typeof fn);
      mockBeginCalls.push(txCalls);
    };

    return fn;
  }

  const sql = createSqlFn(mockCalls);
  return { sql };
});

// Import after mocks are registered
import {
  insertFile,
  getFileById,
  getFileByPath,
  listFiles,
  getVaultVersion,
  updateFileChecksum,
  deleteFile,
  insertShareLink,
  getShareLinkByUrl,
  deleteShareLinksByFileId,
} from "../db.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date("2025-01-15T10:00:00.000Z");

const sampleFile: HolocronFile = {
  id: "file-001",
  name: "hello.txt",
  path: "docs/hello.txt",
  s3Key: "files/file-001/hello.txt",
  size: 1024,
  mimeType: "text/plain",
  checksum: "abc123",
  createdAt: now,
  updatedAt: now,
};

/** A row as it would come back from PostgreSQL (snake_case columns). */
const sampleFileRow: Record<string, unknown> = {
  id: "file-001",
  name: "hello.txt",
  path: "docs/hello.txt",
  s3_key: "files/file-001/hello.txt",
  size: 1024,
  mime_type: "text/plain",
  checksum: "abc123",
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  indexing_status: null,
  metadata: null,
  full_text_s3_key: null,
};

const sampleLink: ShareLink = {
  id: "link-001",
  fileId: "file-001",
  url: "https://share.example.com/abc",
  expiresAt: null,
  createdAt: now,
};

const sampleLinkRow: Record<string, unknown> = {
  id: "link-001",
  file_id: "file-001",
  url: "https://share.example.com/abc",
  expires_at: null,
  created_at: now.toISOString(),
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCalls.length = 0;
  mockResults.length = 0;
  mockBeginCalls.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join the template strings from a mock call to reconstruct the SQL. */
function sqlText(callIndex = 0): string {
  return mockCalls[callIndex].strings.join("$?");
}

/** Get the interpolated values from the Nth mock call. */
function sqlValues(callIndex = 0): unknown[] {
  return mockCalls[callIndex].values;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("insertFile", () => {
  it("executes INSERT INTO files followed by a vault version bump", async () => {
    // Two sql calls: INSERT file + INSERT/upsert vault_version
    mockResults.push([], []);
    await insertFile(sampleFile);

    expect(mockCalls).toHaveLength(2);

    // First call: INSERT INTO files
    const insertSql = sqlText(0);
    expect(insertSql).toContain("INSERT INTO files");
    expect(insertSql).toContain("ON CONFLICT (id) DO UPDATE");
    const insertVals = sqlValues(0);
    expect(insertVals).toContain("file-001");
    expect(insertVals).toContain("hello.txt");
    expect(insertVals).toContain("docs/hello.txt");
    expect(insertVals).toContain("abc123");

    // Second call: vault version bump
    const bumpSql = sqlText(1);
    expect(bumpSql).toContain("INSERT INTO vault_version");
    expect(bumpSql).toContain("ON CONFLICT (id) DO UPDATE");
  });
});

describe("getFileById", () => {
  it("returns a HolocronFile when row exists", async () => {
    mockResults.push([sampleFileRow]);
    const result = await getFileById("file-001");

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM files");
    expect(query).toContain("WHERE id =");
    expect(sqlValues(0)).toContain("file-001");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("file-001");
    expect(result!.createdAt).toEqual(now);
  });

  it("returns null when no row exists", async () => {
    mockResults.push([]);
    const result = await getFileById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getFileByPath", () => {
  it("returns a HolocronFile when path matches", async () => {
    mockResults.push([sampleFileRow]);
    const result = await getFileByPath("docs/hello.txt");

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM files");
    expect(query).toContain("WHERE path =");
    expect(sqlValues(0)).toContain("docs/hello.txt");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("docs/hello.txt");
  });

  it("returns null when path not found", async () => {
    mockResults.push([]);
    const result = await getFileByPath("nonexistent.txt");
    expect(result).toBeNull();
  });
});

describe("listFiles", () => {
  it("queries with ORDER BY created_at DESC", async () => {
    mockResults.push([sampleFileRow]);
    const result = await listFiles();

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM files");
    expect(query).toContain("ORDER BY created_at DESC");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("file-001");
  });

  it("returns empty array when no files exist", async () => {
    mockResults.push([]);
    const result = await listFiles();
    expect(result).toEqual([]);
  });
});

describe("getVaultVersion", () => {
  it("returns data from vault_version row when it exists", async () => {
    mockResults.push([
      {
        id: 1,
        version: 5,
        file_count: 3,
        last_modified: "2025-01-16T12:00:00.000Z",
      },
    ]);

    const result = await getVaultVersion();

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM vault_version");
    expect(result).toEqual({
      latestChange: "2025-01-16T12:00:00.000Z",
      fileCount: 3,
    });
  });

  it("falls back to files table and seeds vault_version when row missing", async () => {
    // First call: SELECT from vault_version returns empty
    mockResults.push([]);
    // Second call: COUNT/MAX from files
    mockResults.push([{ cnt: 2, latest: "2025-01-16T12:00:00.000Z" }]);
    // Third call: INSERT INTO vault_version to seed
    mockResults.push([]);

    const result = await getVaultVersion();

    expect(mockCalls).toHaveLength(3);
    // First: vault_version lookup
    expect(sqlText(0)).toContain("FROM vault_version");
    // Second: fallback count from files
    expect(sqlText(1)).toContain("COUNT");
    expect(sqlText(1)).toContain("FROM files");
    // Third: seed vault_version
    expect(sqlText(2)).toContain("INSERT INTO vault_version");

    expect(result).toEqual({
      latestChange: "2025-01-16T12:00:00.000Z",
      fileCount: 2,
    });
  });

  it("returns null latestChange and 0 count when no vault_version and no files", async () => {
    // vault_version empty
    mockResults.push([]);
    // files count returns 0
    mockResults.push([{ cnt: 0, latest: null }]);

    const result = await getVaultVersion();
    expect(mockCalls).toHaveLength(2);
    expect(result).toEqual({ latestChange: null, fileCount: 0 });
  });
});

describe("updateFileChecksum", () => {
  it("executes UPDATE files followed by a vault version bump", async () => {
    mockResults.push([], []);
    await updateFileChecksum("file-001", "newchecksum");

    expect(mockCalls).toHaveLength(2);

    // First call: UPDATE files
    const updateSql = sqlText(0);
    expect(updateSql).toContain("UPDATE files");
    expect(updateSql).toContain("SET checksum =");
    expect(sqlValues(0)).toContain("newchecksum");
    expect(sqlValues(0)).toContain("file-001");

    // Second call: vault version bump (delta 0)
    const bumpSql = sqlText(1);
    expect(bumpSql).toContain("INSERT INTO vault_version");
    const bumpVals = sqlValues(1);
    // fileCountDelta = 0 appears twice in the query (GREATEST and file_count +)
    expect(bumpVals).toContain(0);
  });
});

describe("deleteFile", () => {
  it("executes DELETE FROM files followed by a vault version bump", async () => {
    mockResults.push([], []);
    await deleteFile("file-001");

    expect(mockCalls).toHaveLength(2);

    // First call: DELETE FROM files
    const deleteSql = sqlText(0);
    expect(deleteSql).toContain("DELETE FROM files");
    expect(deleteSql).toContain("WHERE id =");
    expect(sqlValues(0)).toContain("file-001");

    // Second call: vault version bump (delta -1)
    const bumpSql = sqlText(1);
    expect(bumpSql).toContain("INSERT INTO vault_version");
    const bumpVals = sqlValues(1);
    expect(bumpVals).toContain(-1);
  });
});

// ---------------------------------------------------------------------------
// Share link tests
// ---------------------------------------------------------------------------

describe("insertShareLink", () => {
  it("executes INSERT INTO share_links with correct values", async () => {
    mockResults.push([]);
    await insertShareLink(sampleLink);

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("INSERT INTO share_links");
    const vals = sqlValues(0);
    expect(vals).toContain("link-001");
    expect(vals).toContain("file-001");
    expect(vals).toContain("https://share.example.com/abc");
    expect(vals).toContain(null); // expiresAt
    expect(vals).toContain(now.toISOString()); // createdAt
  });

  it("serialises expiresAt when provided", async () => {
    const linkWithExpiry: ShareLink = {
      ...sampleLink,
      expiresAt: new Date("2025-02-01T00:00:00.000Z"),
    };
    mockResults.push([]);
    await insertShareLink(linkWithExpiry);

    const vals = sqlValues(0);
    expect(vals).toContain("2025-02-01T00:00:00.000Z");
  });
});

describe("getShareLinkByUrl", () => {
  it("returns a ShareLink when URL matches", async () => {
    mockResults.push([sampleLinkRow]);
    const result = await getShareLinkByUrl("https://share.example.com/abc");

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM share_links");
    expect(query).toContain("WHERE url =");
    expect(sqlValues(0)).toContain("https://share.example.com/abc");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("link-001");
    expect(result!.url).toBe("https://share.example.com/abc");
  });

  it("returns null when URL not found", async () => {
    mockResults.push([]);
    const result = await getShareLinkByUrl("https://share.example.com/missing");
    expect(result).toBeNull();
  });
});

describe("deleteShareLinksByFileId", () => {
  it("executes DELETE FROM share_links WHERE file_id = ...", async () => {
    mockResults.push([]);
    await deleteShareLinksByFileId("file-001");

    expect(mockCalls).toHaveLength(1);
    const query = sqlText(0);
    expect(query).toContain("DELETE FROM share_links");
    expect(query).toContain("WHERE file_id =");
    expect(sqlValues(0)).toContain("file-001");
  });
});

