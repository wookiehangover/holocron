/**
 * Unit tests for the DynamoDB data access layer (db.ts).
 *
 * Every @aws-sdk/lib-dynamodb command is mocked so no real AWS calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HolocronFile, ShareLink } from "@holocron/core/types";

// ---------------------------------------------------------------------------
// Mock setup — must come before db.ts import
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class FakeDynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  // Commands must be classes (constructors) because db.ts uses `new XCommand(...)`
  class FakePutCommand { constructor(public input: unknown) {} }
  class FakeGetCommand { constructor(public input: unknown) {} }
  class FakeQueryCommand { constructor(public input: unknown) {} }
  class FakeUpdateCommand { constructor(public input: unknown) {} }
  class FakeDeleteCommand { constructor(public input: unknown) {} }
  class FakeBatchWriteCommand { constructor(public input: unknown) {} }

  return {
    DynamoDBDocumentClient: {
      from: vi.fn().mockReturnValue({ send: mockSend }),
    },
    PutCommand: FakePutCommand,
    GetCommand: FakeGetCommand,
    QueryCommand: FakeQueryCommand,
    UpdateCommand: FakeUpdateCommand,
    DeleteCommand: FakeDeleteCommand,
    BatchWriteCommand: FakeBatchWriteCommand,
  };
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

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

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

const sampleFileItem: Record<string, unknown> = {
  pk: "FILE#file-001",
  sk: "FILE#file-001",
  gsi1pk: "FILES",
  gsi1sk: `${now.toISOString()}#file-001`,
  gsi2pk: "PATH#docs/hello.txt",
  gsi2sk: "FILE#file-001",
  id: "file-001",
  name: "hello.txt",
  path: "docs/hello.txt",
  s3Key: "files/file-001/hello.txt",
  size: 1024,
  mimeType: "text/plain",
  checksum: "abc123",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const sampleLink: ShareLink = {
  id: "link-001",
  fileId: "file-001",
  url: "https://share.example.com/abc",
  expiresAt: null,
  createdAt: now,
};

const sampleLinkItem: Record<string, unknown> = {
  pk: "SHARE#link-001",
  sk: "SHARE#link-001",
  gsi1pk: "FILE_SHARES#file-001",
  gsi1sk: "SHARE#link-001",
  gsi2pk: "URL#https://share.example.com/abc",
  gsi2sk: "SHARE#link-001",
  id: "link-001",
  fileId: "file-001",
  url: "https://share.example.com/abc",
  expiresAt: null,
  createdAt: now.toISOString(),
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers — extract command input from mockSend calls
// ---------------------------------------------------------------------------

/** Get the input passed to the Nth (0-based) `send()` call. */
function sendInput(callIndex = 0): Record<string, unknown> {
  return (mockSend.mock.calls[callIndex][0] as { input: Record<string, unknown> }).input;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("insertFile", () => {
  it("sends a PutCommand with correct table, keys, and attributes", async () => {
    mockSend.mockResolvedValueOnce({});
    await insertFile(sampleFile);

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutCommand);
    const input = sendInput();
    expect(input.TableName).toBe("Holocron");
    expect(input.Item).toMatchObject({
      pk: "FILE#file-001",
      sk: "FILE#file-001",
      gsi1pk: "FILES",
      gsi2pk: "PATH#docs/hello.txt",
      id: "file-001",
      name: "hello.txt",
      checksum: "abc123",
    });
  });
});

describe("getFileById", () => {
  it("returns a HolocronFile when item exists", async () => {
    mockSend.mockResolvedValueOnce({ Item: sampleFileItem });
    const result = await getFileById("file-001");

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(GetCommand);
    const input = sendInput();
    expect(input.Key).toEqual({ pk: "FILE#file-001", sk: "FILE#file-001" });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("file-001");
    expect(result!.createdAt).toEqual(now);
  });

  it("returns null when item does not exist", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await getFileById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getFileByPath", () => {
  it("returns a HolocronFile when path matches via GSI2", async () => {
    mockSend.mockResolvedValueOnce({ Items: [sampleFileItem] });
    const result = await getFileByPath("docs/hello.txt");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    const input = sendInput();
    expect(input.IndexName).toBe("gsi2");
    expect(input.ExpressionAttributeValues).toEqual({ ":pk": "PATH#docs/hello.txt" });
    expect(input.Limit).toBe(1);
    expect(result).not.toBeNull();
    expect(result!.path).toBe("docs/hello.txt");
  });

  it("returns null when path not found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await getFileByPath("nonexistent.txt");
    expect(result).toBeNull();
  });
});

describe("listFiles", () => {
  it("queries GSI1 with ScanIndexForward=false", async () => {
    mockSend.mockResolvedValueOnce({ Items: [sampleFileItem] });
    const result = await listFiles();

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    const input = sendInput();
    expect(input.IndexName).toBe("gsi1");
    expect(input.ExpressionAttributeValues).toEqual({ ":pk": "FILES" });
    expect(input.ScanIndexForward).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("file-001");
  });

  it("returns empty array when no files exist", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await listFiles();
    expect(result).toEqual([]);
  });

  it("paginates through multiple pages", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [sampleFileItem],
        LastEvaluatedKey: { pk: "FILE#file-001" },
      })
      .mockResolvedValueOnce({
        Items: [{ ...sampleFileItem, id: "file-002", pk: "FILE#file-002", sk: "FILE#file-002" }],
      });

    const result = await listFiles();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});

describe("getVaultVersion", () => {
  it("returns latest change timestamp and file count", async () => {
    const item1 = { ...sampleFileItem, updatedAt: "2025-01-15T10:00:00.000Z" };
    const item2 = { ...sampleFileItem, id: "file-002", updatedAt: "2025-01-16T12:00:00.000Z" };
    mockSend.mockResolvedValueOnce({ Items: [item1, item2] });

    const result = await getVaultVersion();
    expect(result.fileCount).toBe(2);
    expect(result.latestChange).toBe("2025-01-16T12:00:00.000Z");
  });

  it("returns null latestChange and 0 count when no files", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await getVaultVersion();
    expect(result).toEqual({ latestChange: null, fileCount: 0 });
  });
});

describe("updateFileChecksum", () => {
  it("sends UpdateCommand with correct key and expression", async () => {
    mockSend.mockResolvedValueOnce({});
    await updateFileChecksum("file-001", "newchecksum");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(UpdateCommand);
    const input = sendInput() as Record<string, any>;
    expect(input.Key).toEqual({ pk: "FILE#file-001", sk: "FILE#file-001" });
    expect(input.UpdateExpression).toBe("SET checksum = :c, updatedAt = :u");
    expect(input.ExpressionAttributeValues[":c"]).toBe("newchecksum");
    // updatedAt should be a valid ISO string
    expect(input.ExpressionAttributeValues[":u"]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("deleteFile", () => {
  it("sends DeleteCommand with correct key", async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteFile("file-001");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(DeleteCommand);
    const input = sendInput();
    expect(input.TableName).toBe("Holocron");
    expect(input.Key).toEqual({ pk: "FILE#file-001", sk: "FILE#file-001" });
  });
});

// ---------------------------------------------------------------------------
// Share link tests
// ---------------------------------------------------------------------------

describe("insertShareLink", () => {
  it("sends PutCommand with correct table, keys, and attributes", async () => {
    mockSend.mockResolvedValueOnce({});
    await insertShareLink(sampleLink);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(PutCommand);
    const input = sendInput() as Record<string, any>;
    expect(input.TableName).toBe("Holocron");
    expect(input.Item).toMatchObject({
      pk: "SHARE#link-001",
      sk: "SHARE#link-001",
      gsi1pk: "FILE_SHARES#file-001",
      gsi1sk: "SHARE#link-001",
      gsi2pk: "URL#https://share.example.com/abc",
      gsi2sk: "SHARE#link-001",
      id: "link-001",
      fileId: "file-001",
      url: "https://share.example.com/abc",
      expiresAt: null,
    });
  });

  it("serialises expiresAt when provided", async () => {
    const linkWithExpiry: ShareLink = {
      ...sampleLink,
      expiresAt: new Date("2025-02-01T00:00:00.000Z"),
    };
    mockSend.mockResolvedValueOnce({});
    await insertShareLink(linkWithExpiry);

    const input = sendInput() as Record<string, any>;
    expect(input.Item.expiresAt).toBe("2025-02-01T00:00:00.000Z");
  });
});

describe("getShareLinkByUrl", () => {
  it("returns a ShareLink when URL matches via GSI2", async () => {
    mockSend.mockResolvedValueOnce({ Items: [sampleLinkItem] });
    const result = await getShareLinkByUrl("https://share.example.com/abc");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    const input = sendInput();
    expect(input.IndexName).toBe("gsi2");
    expect(input.ExpressionAttributeValues).toEqual({
      ":pk": "URL#https://share.example.com/abc",
    });
    expect(input.Limit).toBe(1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("link-001");
    expect(result!.url).toBe("https://share.example.com/abc");
  });

  it("returns null when URL not found", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = await getShareLinkByUrl("https://share.example.com/missing");
    expect(result).toBeNull();
  });
});

describe("deleteShareLinksByFileId", () => {
  it("queries GSI1 then batch-deletes matching items", async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [sampleLinkItem] })
      .mockResolvedValueOnce({});

    await deleteShareLinksByFileId("file-001");

    // First call: query
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    const queryInput = sendInput(0);
    expect(queryInput.IndexName).toBe("gsi1");
    expect(queryInput.ExpressionAttributeValues).toEqual({
      ":pk": "FILE_SHARES#file-001",
    });

    // Second call: batch write
    expect(mockSend.mock.calls[1][0]).toBeInstanceOf(BatchWriteCommand);
    const batchInput = sendInput(1) as Record<string, any>;
    const requests = batchInput.RequestItems["Holocron"];
    expect(requests).toHaveLength(1);
    expect(requests[0].DeleteRequest.Key).toEqual({
      pk: "SHARE#link-001",
      sk: "SHARE#link-001",
    });
  });

  it("does nothing when no share links exist for the file", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await deleteShareLinksByFileId("file-999");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
  });

  it("paginates through query results", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [sampleLinkItem],
        LastEvaluatedKey: { pk: "SHARE#link-001" },
      })
      .mockResolvedValueOnce({
        Items: [
          { ...sampleLinkItem, id: "link-002", pk: "SHARE#link-002", sk: "SHARE#link-002" },
        ],
      })
      .mockResolvedValueOnce({});

    await deleteShareLinksByFileId("file-001");

    // Two query calls + one batch write
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend.mock.calls[2][0]).toBeInstanceOf(BatchWriteCommand);
    const batchInput = sendInput(2) as Record<string, any>;
    const requests = batchInput.RequestItems["Holocron"];
    expect(requests).toHaveLength(2);
  });
});

