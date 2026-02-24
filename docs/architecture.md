# Holocron Architecture Document

**Status**: Implementation complete · **Last updated**: 2026-02-15

## 1. Overview

Holocron is a personal file vault and self-hosted Dropbox replacement. Users store files in a local `~/Holocron` folder on macOS; a menubar app watches that folder and syncs changes to an AWS backend. A web UI provides browser-based access to the same vault.

### Design principles

- **Single-user, self-hosted** — no multi-tenancy, no shared infrastructure
- **Serverless-first** — all backend compute runs on Lambda; no long-lived servers
- **Local-first feel** — the desktop app works with the native filesystem; sync happens in the background
- **Monorepo** — all code (TypeScript backend, React frontend, Swift desktop app) lives in one repository

## 2. System architecture

```ws-block
{
  "id": "51b8d6e5-f545-4113-b024-c0428944a826",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-10T00:00:00Z",
  "createdBy": "agent",
  "grammar": "architecture",
  "model": {
    "nodes": [
      {
        "id": "desktop",
        "label": "Desktop App\n(Swift / macOS menubar)",
        "kind": "actor"
      },
      {
        "id": "web",
        "label": "Web App\n(React Router v7 + Vite)",
        "kind": "actor"
      },
      {
        "id": "cli",
        "label": "Rust CLI\n(cross-platform)",
        "kind": "actor"
      },
      {
        "id": "apigw",
        "label": "API Gateway v2",
        "kind": "gateway"
      },
      {
        "id": "hono",
        "label": "Hono API\n(Lambda)",
        "kind": "service"
      },
      {
        "id": "s3",
        "label": "S3 Bucket\n(file storage)",
        "kind": "store"
      },
      {
        "id": "postgresql",
        "label": "PostgreSQL\n(PlanetScale + pgvector)",
        "kind": "store"
      },
      {
        "id": "sfn",
        "label": "Step Functions\n(processing pipeline)",
        "kind": "service"
      },
      {
        "id": "indexing",
        "label": "Indexing Pipeline\n(3 Lambdas)",
        "kind": "service"
      }
    ],
    "edges": [
      {
        "id": "e1",
        "from": "desktop",
        "to": "apigw",
        "label": "HTTPS"
      },
      {
        "id": "e2",
        "from": "web",
        "to": "apigw",
        "label": "HTTPS"
      },
      {
        "id": "e3",
        "from": "apigw",
        "to": "hono",
        "label": "proxy"
      },
      {
        "id": "e4",
        "from": "hono",
        "to": "s3",
        "label": "presigned URLs"
      },
      {
        "id": "e5",
        "from": "hono",
        "to": "postgresql",
        "label": "Postgres.js"
      },
      {
        "id": "e6",
        "from": "desktop",
        "to": "s3",
        "label": "direct upload/download\n(presigned URL)",
        "dashed": true
      },
      {
        "id": "e9",
        "from": "cli",
        "to": "apigw",
        "label": "HTTPS"
      },
      {
        "id": "e10",
        "from": "cli",
        "to": "s3",
        "label": "direct upload/download\n(presigned URL)",
        "dashed": true
      },
      {
        "id": "e7",
        "from": "sfn",
        "to": "indexing",
        "label": "invoke"
      },
      {
        "id": "e8",
        "from": "indexing",
        "to": "s3",
        "label": "read files + store chunks"
      },
      {
        "id": "e11",
        "from": "indexing",
        "to": "postgresql",
        "label": "status + metadata + chunks"
      }
    ]
  },
  "baseView": {
    "layout": {
      "type": "layered",
      "direction": "TB",
      "spacing": 120,
      "edgeRouting": "orthogonal"
    }
  },
  "states": [
    {
      "id": "overview",
      "narrative": "Full system: three clients (desktop app, web app, Rust CLI) talk to the API, which coordinates S3 storage and PostgreSQL metadata. A Step Functions pipeline processes uploads asynchronously.",
      "highlightedNodes": [],
      "highlightedEdges": []
    },
    {
      "id": "upload-flow",
      "narrative": "Upload flow: client requests a presigned URL from the API → uploads directly to S3 → Step Functions triggers the indexing pipeline (text extraction, chunking, LLM metadata extraction).",
      "highlightedNodes": [
        "desktop",
        "hono",
        "s3",
        "sfn",
        "indexing",
        "postgresql"
      ],
      "highlightedEdges": [
        "e1",
        "e3",
        "e4",
        "e6",
        "e7",
        "e8",
        "e11"
      ]
    },
    {
      "id": "metadata-flow",
      "narrative": "Metadata flow: the API reads and writes file metadata to PostgreSQL (PlanetScale). Clients never talk to the database directly.",
      "highlightedNodes": [
        "hono",
        "postgresql"
      ],
      "highlightedEdges": [
        "e5"
      ]
    }
  ],
  "currentStateId": "overview"
}
```

## 3. Monorepo structure

```
holocron/
├── apps/
│   ├── web/             → React Router v7 + Vite (SSR-capable)
│   ├── desktop/         → Swift/SwiftUI macOS menubar app
│   └── cli/             → Rust CLI (sync, file management, daemon mode)
├── packages/
│   ├── core/            → @holocron/core — shared TypeScript types & utils
│   ├── api/             → @holocron/api — Hono REST API (deployed to Lambda)
│   └── functions/       → @holocron/functions — Step Functions task handlers
├── infra/               → SST v3 infrastructure-as-code
├── sst.config.ts        → SST entry point
├── turbo.json           → Turborepo pipeline config
└── pnpm-workspace.yaml  → pnpm workspace definition
```

### Tooling decisions

| Concern                | Choice                         | Rationale                                                       |
| ---------------------- | ------------------------------ | --------------------------------------------------------------- |
| Package manager        | pnpm 10                        | Fast, strict dependency isolation, workspace support            |
| Monorepo orchestration | Turborepo                      | Caching, task graph, minimal config                             |
| IaC                    | SST v3 (Pulumi under the hood) | TypeScript-native, resource linking, first-class Lambda support |
| TypeScript config      | Shared tsconfig.base.json      | strict: true, ESNext target, NodeNext module resolution         |

### Package dependency graph

```ws-block
{
  "id": "3a57cad6-8371-4cce-9860-f588c8c94f10",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-10T00:00:00Z",
  "createdBy": "agent",
  "grammar": "dependency_graph",
  "model": {
    "nodes": [
      {
        "id": "core",
        "label": "@holocron/core",
        "kind": "library"
      },
      {
        "id": "api",
        "label": "@holocron/api",
        "kind": "service"
      },
      {
        "id": "functions",
        "label": "@holocron/functions",
        "kind": "service"
      },
      {
        "id": "web",
        "label": "apps/web",
        "kind": "application"
      },
      {
        "id": "infra",
        "label": "infra/",
        "kind": "infrastructure"
      }
    ],
    "edges": [
      {
        "id": "d1",
        "from": "api",
        "to": "core",
        "label": "workspace:*"
      },
      {
        "id": "d2",
        "from": "functions",
        "to": "core",
        "label": "workspace:*"
      },
      {
        "id": "d3",
        "from": "web",
        "to": "core",
        "label": "type import"
      },
      {
        "id": "d4",
        "from": "infra",
        "to": "api",
        "label": "handler ref"
      },
      {
        "id": "d5",
        "from": "infra",
        "to": "functions",
        "label": "handler ref"
      }
    ]
  },
  "baseView": {
    "layout": {
      "type": "layered",
      "direction": "TB"
    }
  }
}
```

## 4. Data model

Defined in `packages/core/src/types/index.ts`. These types are shared across the API, functions, and web app.

### `HolocronFile`

| Field     | Type    | Purpose                                          |
| --------- | ------- | ------------------------------------------------ |
| id        | string  | UUID primary key                                 |
| name      | string  | Filename (leaf of path)                          |
| path      | string  | Vault-relative path (e.g. `document.pdf`)        |
| s3Key     | string? | S3 object key (e.g. `files/{uuid}/document.pdf`) |
| size      | number  | File size in bytes                               |
| mimeType  | string  | Content type                                     |
| checksum  | string  | Integrity hash (for sync conflict detection)     |
| createdAt | Date    | Upload timestamp                                 |
| updatedAt | Date    | Last modification timestamp                      |

### `SyncState`

A union type representing the synchronization lifecycle of a file:

`"pending"` → `"uploading"` / `"downloading"` → `"synced"` | `"conflict"` | `"error"`

```ws-block
{
  "id": "42c875fe-0071-4d5f-8d76-f8e3ca56426f",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-10T00:00:00Z",
  "createdBy": "agent",
  "grammar": "state_machine",
  "model": {
    "nodes": [
      {
        "id": "pending",
        "label": "pending",
        "kind": "state"
      },
      {
        "id": "uploading",
        "label": "uploading",
        "kind": "state"
      },
      {
        "id": "downloading",
        "label": "downloading",
        "kind": "state"
      },
      {
        "id": "synced",
        "label": "synced",
        "kind": "state",
        "semanticStyle": "success"
      },
      {
        "id": "conflict",
        "label": "conflict",
        "kind": "state",
        "semanticStyle": "warning"
      },
      {
        "id": "error",
        "label": "error",
        "kind": "state",
        "semanticStyle": "danger"
      }
    ],
    "edges": [
      {
        "id": "s1",
        "from": "pending",
        "to": "uploading",
        "label": "local change detected"
      },
      {
        "id": "s2",
        "from": "pending",
        "to": "downloading",
        "label": "remote change detected"
      },
      {
        "id": "s3",
        "from": "uploading",
        "to": "synced",
        "label": "upload complete"
      },
      {
        "id": "s4",
        "from": "downloading",
        "to": "synced",
        "label": "download complete"
      },
      {
        "id": "s5",
        "from": "uploading",
        "to": "conflict",
        "label": "remote also changed"
      },
      {
        "id": "s6",
        "from": "uploading",
        "to": "error",
        "label": "network failure"
      },
      {
        "id": "s7",
        "from": "downloading",
        "to": "error",
        "label": "network failure"
      },
      {
        "id": "s8",
        "from": "synced",
        "to": "pending",
        "label": "new change detected"
      }
    ]
  },
  "baseView": {
    "layout": {
      "type": "layered",
      "direction": "LR",
      "spacing": 100
    }
  }
}
```

### `ShareLink`

| Field     | Type   | Purpose                 |
| --------- | ------ | ----------------------- |
| id        | string | UUID primary key        |
| fileId    | string | FK → HolocronFile.id    |
| url       | string | Public-facing share URL |
| expiresAt | Date   | null                    |
| createdAt | Date   | Creation timestamp      |

## 5. Infrastructure (AWS via SST)

All infrastructure is defined in `infra/` and wired together in `sst.config.ts`. SST v3 uses Pulumi under the hood; resources are declared with TypeScript.

### Resources

| Resource              | SST / Pulumi type    | Defined in          | Purpose                                                                           |
| --------------------- | -------------------- | ------------------- | --------------------------------------------------------------------------------- |
| HolocronBucket        | sst.aws.Bucket       | infra/storage.ts    | Private S3 bucket for file blobs                                                  |
| DatabaseUrl           | sst.Secret           | infra/database.ts   | PlanetScale PostgreSQL connection string (files, share links, chunks, embeddings) |
| HolocronApiKey        | sst.Secret           | infra/database.ts   | Self-generated API key, provisioned via `scripts/setup.sh`                        |
| HolocronApi           | sst.aws.Function     | infra/api.ts        | Hono API Lambda (Node 24)                                                         |
| HolocronGateway       | sst.aws.ApiGatewayV2 | infra/api.ts        | HTTP API fronting the Lambda                                                      |
| ExtractText           | sst.aws.Function     | infra/processing.ts | Text extraction Lambda (Node 24) — PDF, text, image OCR via Gemini                |
| ChunkText             | sst.aws.Function     | infra/processing.ts | Text chunking Lambda (Node 24)                                                    |
| ExtractMetadata       | sst.aws.Function     | infra/processing.ts | LLM metadata extraction Lambda (Node 24) — summary, keywords, topics              |
| VercelAIGatewayApiKey | sst.Secret           | infra/database.ts   | Vercel AI Gateway API key for LLM calls                                           |
| HolocronProcessing    | aws.sfn.StateMachine | infra/processing.ts | Step Functions orchestrator                                                       |

### Resource linking

SST's `link` mechanism injects environment variables and IAM permissions at deploy time:

- `HolocronApi` is linked to `HolocronBucket` (S3 access), `DatabaseUrl` (PostgreSQL read/write), and `HolocronApiKey` (auth)
- `ExtractText` is linked to `HolocronBucket` (S3 read), `DatabaseUrl` (status updates), and `VercelAIGatewayApiKey` (Gemini API via AI Gateway)
- `ChunkText` is linked to `HolocronBucket` (S3 read) and `DatabaseUrl` (chunk storage)
- `ExtractMetadata` is linked to `HolocronBucket` (S3 read), `DatabaseUrl` (metadata updates), and `VercelAIGatewayApiKey` (Gemini API via AI Gateway)

### Stage management

```
sst.config.ts → removal: stage === "production" ? "retain" : "remove"
```

Non-production stages are fully torn down on removal. Production retains resources (data safety).

## 6. API layer (`@holocron/api`)

**Runtime**: Hono framework on AWS Lambda behind API Gateway v2**Entry**: `packages/api/src/index.ts` → exported as `handler` via `hono/aws-lambda`

### Endpoints

| Method | Path                   | Status         | Purpose                                                                                          |
| ------ | ---------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| GET    | /health                | ✅ Implemented | Health check (excluded from auth)                                                                |
| GET    | /files                 | ✅ Implemented | List all files in vault                                                                          |
| POST   | /files/upload          | ✅ Implemented | Request presigned upload URL                                                                     |
| POST   | /files/upload/confirm  | ✅ Implemented | Confirm upload; optionally stores client-supplied `checksum`                                     |
| GET    | /files/:id             | ✅ Implemented | Get file metadata + presigned download URL (includes indexing status and LLM-generated metadata) |
| GET    | /files/:id/chunks      | ✅ Implemented | Returns all indexed chunks for a file                                                            |
| GET    | /files/search?q=:query | ✅ Implemented | Case-insensitive text search across chunks                                                       |
| DELETE | /files/:id             | ✅ Implemented | Delete file (S3 object + share links + DB record)                                                |
| POST   | /share                 | ✅ Implemented | Create a share link                                                                              |
| GET    | /share/:token          | ✅ Implemented | Resolve a share link (excluded from auth)                                                        |

### Authentication

API key authentication is implemented via the `apiKeyAuth` middleware (`packages/api/src/middleware/auth.ts`). All requests must include an `X-Api-Key` header matching the `HOLOCRON_API_KEY` environment variable (injected from the `HolocronApiKey` SST secret). Excluded paths: `/health`, `/share/:token` (public resolution), and CORS preflight (`OPTIONS`).

### Database access

`packages/api/src/db.ts` provides a PostgreSQL data access layer using Postgres.js (`postgres` npm package). A singleton `sql` client (from `packages/api/src/db/schema.ts`) connects to PlanetScale PostgreSQL via the `DATABASE_URL` environment variable (injected from the `DatabaseUrl` SST secret). Tables: `files`, `share_links`, `chunks`, `vault_version`. The `pgvector` extension enables vector similarity search on chunk embeddings (768-dimensional `gemini-embedding-001` vectors).

### Key design decisions

- **Presigned URLs for upload/download** — clients upload directly to S3, never stream through Lambda. This keeps Lambda lightweight and avoids payload size limits.
- **Single catch-all route** — API Gateway's `$default` route sends everything to one Lambda. Hono handles routing internally. Simpler than per-route Lambda functions.
- **API key auth** — a single shared key (`X-Api-Key` header) protects all mutating endpoints. Sufficient for single-user self-hosted deployment.
- **PostgreSQL + pgvector** — PlanetScale PostgreSQL with the `pgvector` extension provides relational metadata storage and native vector similarity search for semantic queries. Postgres.js tagged template literals prevent SQL injection. Connection via `DATABASE_URL` secret.

## 7. File processing pipeline

```ws-block
{
  "id": "2e57f990-0c22-4b0f-8e0a-93c1b3a80c17",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-15T00:00:00Z",
  "createdBy": "agent",
  "grammar": "flowchart",
  "model": {
    "nodes": [
      {
        "id": "trigger",
        "label": "File uploaded",
        "kind": "event"
      },
      {
        "id": "sfn",
        "label": "Step Functions",
        "kind": "process"
      },
      {
        "id": "extract",
        "label": "ExtractText\nLambda",
        "kind": "process"
      },
      {
        "id": "chunk",
        "label": "ChunkText\nLambda",
        "kind": "process"
      },
      {
        "id": "metadata",
        "label": "ExtractMetadata\nLambda",
        "kind": "process"
      },
      {
        "id": "done",
        "label": "Indexed",
        "kind": "event",
        "semanticStyle": "success"
      },
      {
        "id": "failure",
        "label": "FailureHandler",
        "kind": "process",
        "semanticStyle": "danger"
      }
    ],
    "edges": [
      {
        "id": "p1",
        "from": "trigger",
        "to": "sfn",
        "label": "invoke"
      },
      {
        "id": "p2",
        "from": "sfn",
        "to": "extract",
        "label": "Task state"
      },
      {
        "id": "p3",
        "from": "extract",
        "to": "chunk",
        "label": "parallel"
      },
      {
        "id": "p4",
        "from": "extract",
        "to": "metadata",
        "label": "parallel"
      },
      {
        "id": "p5",
        "from": "chunk",
        "to": "done",
        "label": ""
      },
      {
        "id": "p6",
        "from": "metadata",
        "to": "done",
        "label": ""
      },
      {
        "id": "p7",
        "from": "sfn",
        "to": "failure",
        "label": "on error",
        "dashed": true
      }
    ]
  },
  "baseView": {
    "layout": {
      "type": "layered",
      "direction": "TB",
      "spacing": 100
    }
  }
}
```

The pipeline is a three-step Step Functions state machine: `ExtractText → Parallel(ChunkText, ExtractMetadata) → End`. Error catching at the top level sets the file's indexing status to `"failed"`.

- **ExtractText** — Routes by MIME type: PDF via `pdf-parse`, `text/*` direct read, `image/*` via Gemini OCR. Sets indexing status to `"processing"` and stores the extracted plain text in S3.
- **ChunkText** — Paragraph-based chunking using the DumbChunker algorithm (50–250 word chunks). Stores chunks as PostgreSQL rows linked to the parent file.
- **ExtractMetadata** — Uses Gemini 2.0 Flash via Vercel AI Gateway (`@ai-sdk/gateway`) to generate structured metadata (summary, keywords, topics, title) with Zod schema validation. Writes metadata back to the file's database record.

All LLM calls route through **Vercel AI Gateway** for easy model swapping — the `@ai-sdk/gateway` SDK resolves the `VercelAIGatewayApiKey` secret at runtime.

The Step Functions approach was chosen over direct S3 event triggers because:

1. Easier to add/remove/reorder processing steps
2. Built-in retry and error handling per step
3. Visual execution history in the AWS console
4. Parallel execution of independent steps (chunking + metadata extraction)

## 8. Desktop app (macOS)

**Language**: Swift 5.9 · **Framework**: AppKit (menubar app, not SwiftUI window)**Package manager**: Swift Package Manager · **Minimum OS**: macOS 14 (Sonoma)

### Architecture

```
Sources/
├── Holocron/         → Executable target (thin launcher)
│   └── main.swift    → NSApplication setup, .accessory activation policy
└── HolocronLib/      → Library target (all logic, testable)
    ├── AppDelegate    → Menubar item, status icon, menu construction
    ├── Config         → Shared config (~/.config/holocron/config.json)
    ├── FileWatcher    → FSEvents-based directory watcher with debouncing
    ├── SyncEngine     → Bidirectional sync with manifest-based change detection
    ├── APIClient      → HTTP client for Holocron API
    └── PreferencesWindow → Settings UI
```

### Key components

**FileWatcher**

- Uses macOS `FSEvents` API for efficient filesystem monitoring
- Watches `~/Holocron` (configurable via `Config`)
- Debounces rapid changes (2-second window by default)
- Filters out hidden directories (`.git/`, `.obsidian/`, etc.) but allows hidden leaf files (`.gitignore`)

**SyncEngine**

- State machine: `idle` → `syncing` → `idle` / `error`
- Performs real bidirectional sync via three-way manifest comparison (manifest × local × remote)
- **SHA-256 checksums** via CryptoKit for change detection and conflict identification
- **Sync state manifest** persisted at `~/.config/holocron/sync-state.json` — maps each vault-relative path to its last-known checksum and remote file ID
- **Delete handling**: if a file was in the manifest but is now missing locally, the remote copy is deleted via `DELETE /files/:id`; if missing remotely, the local copy is removed
- **Conflict resolution**: when both sides change, the local file is renamed to `<name>.conflict-<timestamp>.<ext>` and the remote version is downloaded to the original path
- `.conflict-*` files are excluded from sync enumeration
- **Re-entrancy guard**: concurrent `syncNow()` calls are coalesced — only one sync runs at a time, with at most one queued follow-up

**APIClient**

- HTTP client wrapping `URLSession` with `X-Api-Key` authentication
- Reads base URL and API key from `Config` (shared `~/.config/holocron/config.json`)
- Fully implemented methods: `requestUploadURL`, `confirmUpload`, `requestDownloadURL`, `listRemoteFiles`, `deleteFile`, `createShareLink`
- ISO 8601 date decoding with fractional-seconds support

### Build & distribution

```
make build     → swift build -c release
make bundle    → creates Holocron.app in .build/
make install   → copies to /Applications
make run       → builds + opens the app
```

## 9. Web app

**Framework**: React Router v7 (file-based routing) + Vite**Rendering**: SSR-capable (`ssr: true` in config)**Styling**: None yet (inline styles only)

Currently a single route (`/` → `routes/home.tsx`) with a placeholder page. Cross-package type imports from `@holocron/core/types` are verified working.

The web app is in the pnpm workspace but does **not** deploy via SST yet — it's a standalone Vite build. Future options:

- Deploy to CloudFront + S3 as a static SPA
- Deploy as SSR via Lambda@Edge or a separate Lambda
- Keep it as a local dev tool only

## 10. Rust CLI

**Language**: Rust (edition 2021) · **Async runtime**: Tokio · **CLI framework**: Clap (derive)
**Location**: `apps/cli/` · **Binary name**: `holocron`

The Rust CLI provides cross-platform (macOS, Linux, Windows) command-line access to the Holocron vault. It shares configuration and sync state with the macOS desktop app.

### Module structure

```
apps/cli/src/
├── main.rs      → Clap CLI definition, command dispatch
├── config.rs    → Config load/save (~/.config/holocron/config.json, camelCase keys)
├── api.rs       → HTTP client (reqwest) for all API endpoints
├── sync.rs      → Bidirectional sync engine (manifest-based, SHA-256)
└── daemon.rs    → Background watcher (notify crate) with debounced sync
```

### Commands

| Command                                | Description                                             |
| -------------------------------------- | ------------------------------------------------------- |
| `holocron config show`                 | Print current configuration as JSON                     |
| `holocron config set <key> <value>`    | Set a config value (`api-url`, `vault-path`, `api-key`) |
| `holocron config get <key>`            | Get a single config value                               |
| `holocron health`                      | Check API connectivity                                  |
| `holocron ls`                          | List remote files (tabular output)                      |
| `holocron share <id> [--expires-in N]` | Create a share URL                                      |
| `holocron url <id>`                    | Get a presigned download URL                            |
| `holocron sync`                        | One-shot bidirectional sync                             |
| `holocron daemon`                      | Watch vault directory and sync on changes               |

### Shared state

- **Config**: `~/.config/holocron/config.json` — JSON with camelCase keys (`apiURL`, `apiKey`, `vaultPath`), compatible with the Swift desktop app's `Config.swift`
- **Sync manifest**: `~/.config/holocron/sync-state.json` — maps vault-relative paths to `{ checksum, fileId }` entries. Both the Rust CLI and Swift app read/write this file.

### Sync algorithm

The sync engine (`sync.rs`) uses the same three-way comparison as the Swift `SyncEngine`:

1. Load the manifest (last-known state)
2. List remote files via `GET /files`
3. Enumerate local files (skipping hidden dirs and `.conflict-*` files)
4. For each path in the union of manifest, local, and remote:
   - **In manifest + local + remote**: compare SHA-256 checksums to detect changes on each side; upload, download, or resolve conflict as needed
   - **In manifest + local only**: remote was deleted → remove local file
   - **In manifest + remote only**: local was deleted → `DELETE /files/:id`
   - **New local file**: upload and record in manifest
   - **New remote file**: download and record in manifest
5. Save updated manifest

### Daemon mode

`holocron daemon` runs an initial sync, then watches the vault directory using the `notify` crate (`RecommendedWatcher`, recursive mode). File change events are debounced over a 2-second window before triggering a sync. Ctrl-C shuts down cleanly.

### Key dependencies

| Crate              | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| clap               | CLI argument parsing (derive macros)           |
| reqwest            | HTTP client (rustls TLS backend)               |
| tokio              | Async runtime                                  |
| serde / serde_json | JSON serialization                             |
| sha2 + hex         | SHA-256 checksums                              |
| notify             | Cross-platform filesystem watcher              |
| chrono             | Timestamp formatting for conflict files        |
| dirs               | Platform-appropriate home directory resolution |
| mime_guess         | MIME type detection from file extension        |
| thiserror          | Error type derivation                          |

### Build

```sh
cd apps/cli
cargo build --release
# Binary: apps/cli/target/release/holocron
```

The CLI is a standalone Cargo project — it is not part of the pnpm/Turborepo pipeline.
