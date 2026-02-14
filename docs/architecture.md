# Holocron Architecture Document

**Status**: Implementation complete · **Last updated**: 2026-02-14

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
        "id": "agentdb",
        "label": "AgentDB\n(serverless SQLite)",
        "kind": "store"
      },
      {
        "id": "sfn",
        "label": "Step Functions\n(processing pipeline)",
        "kind": "service"
      },
      {
        "id": "processfn",
        "label": "ProcessUpload\n(Lambda)",
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
        "to": "agentdb",
        "label": "SQL over HTTP"
      },
      {
        "id": "e6",
        "from": "desktop",
        "to": "s3",
        "label": "direct upload/download\n(presigned URL)",
        "dashed": true
      },
      {
        "id": "e7",
        "from": "sfn",
        "to": "processfn",
        "label": "invoke"
      },
      {
        "id": "e8",
        "from": "processfn",
        "to": "s3",
        "label": "read object metadata"
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
      "narrative": "Full system: two clients talk to the API, which coordinates S3 storage and AgentDB metadata. A Step Functions pipeline processes uploads asynchronously.",
      "highlightedNodes": [],
      "highlightedEdges": []
    },
    {
      "id": "upload-flow",
      "narrative": "Upload flow: client requests a presigned URL from the API → uploads directly to S3 → Step Functions processes the upload (metadata extraction, thumbnails, etc.).",
      "highlightedNodes": [
        "desktop",
        "hono",
        "s3",
        "sfn",
        "processfn"
      ],
      "highlightedEdges": [
        "e1",
        "e3",
        "e4",
        "e6",
        "e7",
        "e8"
      ]
    },
    {
      "id": "metadata-flow",
      "narrative": "Metadata flow: the API reads and writes file metadata to AgentDB (serverless SQLite). Clients never talk to the database directly.",
      "highlightedNodes": [
        "hono",
        "agentdb"
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
│   └── desktop/         → Swift/SwiftUI macOS menubar app
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

| Concern | Choice | Rationale |
| --- | --- | --- |
| Package manager | pnpm 10 | Fast, strict dependency isolation, workspace support |
| Monorepo orchestration | Turborepo | Caching, task graph, minimal config |
| IaC | SST v3 (Pulumi under the hood) | TypeScript-native, resource linking, first-class Lambda support |
| TypeScript config | Shared tsconfig.base.json | strict: true, ESNext target, NodeNext module resolution |

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

| Field | Type | Purpose |
| --- | --- | --- |
| id | string | UUID primary key |
| name | string | Filename (leaf of path) |
| path | string | Vault-relative path (e.g. `document.pdf`) |
| s3Key | string? | S3 object key (e.g. `files/{uuid}/document.pdf`) |
| size | number | File size in bytes |
| mimeType | string | Content type |
| checksum | string | Integrity hash (for sync conflict detection) |
| createdAt | Date | Upload timestamp |
| updatedAt | Date | Last modification timestamp |

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

| Field | Type | Purpose |
| --- | --- | --- |
| id | string | UUID primary key |
| fileId | string | FK → HolocronFile.id |
| url | string | Public-facing share URL |
| expiresAt | Date | null |
| createdAt | Date | Creation timestamp |

## 5. Infrastructure (AWS via SST)

All infrastructure is defined in `infra/` and wired together in `sst.config.ts`. SST v3 uses Pulumi under the hood; resources are declared with TypeScript.

### Resources

| Resource | SST / Pulumi type | Defined in | Purpose |
| --- | --- | --- | --- |
| HolocronBucket | sst.aws.Bucket | infra/storage.ts | Private S3 bucket for file blobs |
| AgentDbApiKey | sst.Secret | infra/database.ts | API key for AgentDB, injected at runtime |
| HolocronApi | sst.aws.Function | infra/api.ts | Hono API Lambda (Node 20) |
| HolocronGateway | sst.aws.ApiGatewayV2 | infra/api.ts | HTTP API fronting the Lambda |
| ProcessUpload | sst.aws.Function | infra/processing.ts | File processing Lambda (Node 20) |
| HolocronProcessing | aws.sfn.StateMachine | infra/processing.ts | Step Functions orchestrator |

### Resource linking

SST's `link` mechanism injects environment variables and IAM permissions at deploy time:

- `HolocronApi` is linked to `HolocronBucket` (S3 access) and `AgentDbApiKey` (database auth)
- `ProcessUpload` is linked to `HolocronBucket` (S3 read)

### Stage management

```
sst.config.ts → removal: stage === "production" ? "retain" : "remove"
```

Non-production stages are fully torn down on removal. Production retains resources (data safety).

## 6. API layer (`@holocron/api`)

**Runtime**: Hono framework on AWS Lambda behind API Gateway v2**Entry**: `packages/api/src/index.ts` → exported as `handler` via `hono/aws-lambda`

### Current endpoints

| Method | Path | Status | Purpose |
| --- | --- | --- | --- |
| GET | /health | ✅ Implemented | Health check |
| GET | /files | 🔲 Stub | List all files in vault |
| POST | /files/upload | 🔲 Stub | Request presigned upload URL |
| GET | /files/:id | 🔲 Stub | Get file metadata by ID |
| POST | /share | 🔲 Stub | Create a share link |
| GET | /share/:token | 🔲 Stub | Resolve a share link |

### Database access

`packages/api/src/db.ts` provides a singleton `DatabaseService` (from `@agentdb/sdk`) and a `connectDb()` helper. AgentDB is a serverless SQLite-over-HTTP service — no connection pooling or VPC required.

### Key design decisions

- **Presigned URLs for upload/download** — clients upload directly to S3, never stream through Lambda. This keeps Lambda lightweight and avoids payload size limits.
- **Single catch-all route** — API Gateway's `$default` route sends everything to one Lambda. Hono handles routing internally. Simpler than per-route Lambda functions.
- **No auth yet** — authentication is not implemented. This is single-user, but an API key or JWT will be needed before deployment. (See [Open questions](#10-open-questions).)

## 7. File processing pipeline

```ws-block
{
  "id": "2e57f990-0c22-4b0f-8e0a-93c1b3a80c17",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-10T00:00:00Z",
  "createdBy": "agent",
  "grammar": "flowchart",
  "model": {
    "nodes": [
      {
        "id": "trigger",
        "label": "File uploaded to S3",
        "kind": "event"
      },
      {
        "id": "sfn",
        "label": "Step Functions\nstate machine",
        "kind": "process"
      },
      {
        "id": "process",
        "label": "ProcessUpload\nLambda",
        "kind": "process"
      },
      {
        "id": "head",
        "label": "S3 HeadObject\n(read metadata)",
        "kind": "process"
      },
      {
        "id": "future1",
        "label": "Thumbnail\ngeneration",
        "kind": "process",
        "semanticStyle": "muted"
      },
      {
        "id": "future2",
        "label": "Full-text\nindexing",
        "kind": "process",
        "semanticStyle": "muted"
      },
      {
        "id": "done",
        "label": "Update DB record",
        "kind": "process",
        "semanticStyle": "muted"
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
        "to": "process",
        "label": "Task state"
      },
      {
        "id": "p3",
        "from": "process",
        "to": "head",
        "label": "read size, mime type"
      },
      {
        "id": "p4",
        "from": "process",
        "to": "future1",
        "label": "planned",
        "dashed": true
      },
      {
        "id": "p5",
        "from": "process",
        "to": "future2",
        "label": "planned",
        "dashed": true
      },
      {
        "id": "p6",
        "from": "process",
        "to": "done",
        "label": "planned",
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

Currently the pipeline is a single-step placeholder. The `ProcessUpload` Lambda reads S3 object metadata (`HeadObject`) and logs it. Future steps (dashed in the diagram above) will include:

- **Thumbnail generation** for images/videos
- **Full-text indexing** for searchable documents
- **DB record update** to persist extracted metadata into AgentDB

The Step Functions approach was chosen over direct S3 event triggers because:

1. Easier to add/remove/reorder processing steps
2. Built-in retry and error handling per step
3. Visual execution history in the AWS console

## 8. Desktop app (macOS)

**Language**: Swift 5.9 · **Framework**: AppKit (menubar app, not SwiftUI window)**Package manager**: Swift Package Manager · **Minimum OS**: macOS 14 (Sonoma)

### Architecture

```
Sources/
├── Holocron/         → Executable target (thin launcher)
│   └── main.swift    → NSApplication setup, .accessory activation policy
└── HolocronLib/      → Library target (all logic, testable)
    ├── AppDelegate    → Menubar item, status icon, menu construction
    ├── FileWatcher    → FSEvents-based directory watcher with debouncing
    ├── SyncEngine     → Sync orchestration (placeholder)
    └── APIClient      → HTTP client for Holocron API (placeholder)
```

### Key components

**FileWatcher**

- Uses macOS `FSEvents` API for efficient filesystem monitoring
- Watches `~/Holocron` (configurable)
- Debounces rapid changes (2-second window by default)
- Filters out hidden directories (`.git/`, `.obsidian/`, etc.) but allows hidden leaf files (`.gitignore`)

**SyncEngine**

- State machine: `idle` → `syncing` → `idle` / `error`
- Currently a placeholder — `syncNow()` sleeps 100ms and returns
- Will be wired to the API via `APIClient` for actual S3 sync

**APIClient**

- HTTP client wrapping `URLSession`
- Exposes `requestUploadURL()`, `requestDownloadURL()`, `listRemoteFiles()`
- All methods currently throw `.notImplemented`
- Defaults to `http://localhost:3000` base URL (will switch to deployed API Gateway URL)

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
