# Holocron

A personal file vault and self-hosted Dropbox replacement.

Store files in a local `~/Holocron` folder on macOS; a menubar app watches the folder and syncs changes to an AWS serverless backend. A web UI and CLI provide additional access to the same vault. Uploaded files are automatically indexed — text extraction, chunking, and LLM-generated metadata — enabling full-text and semantic search across your files.

**Design principles:** single-user self-hosted, serverless-first (all backend compute on Lambda), local-first feel (native filesystem + background sync), monorepo (TypeScript backend, React frontend, Swift desktop/iOS, Rust CLI).

## Architecture Overview

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Desktop  │  │   Web    │  │   CLI    │  │   iOS    │
│ (Swift)  │  │ (React)  │  │ (Rust)   │  │ (Swift)  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │              │
     └──────┬──────┴─────────────┴──────────────┘
            │ HTTPS
     ┌──────▼──────┐
     │ API Gateway │
     └──────┬──────┘
     ┌──────▼──────┐     ┌──────────────┐
     │  Hono API   ├────►│     S3       │
     │  (Lambda)   │     │ (file blobs) │
     └──────┬──────┘     └──────▲───────┘
            │                   │
     ┌──────▼──────┐     ┌──────┴───────┐
     │ PostgreSQL  │◄────┤Step Functions│
     │ (PlanetScale│     │  (indexing   │
     │  + pgvector)│     │   pipeline)  │
     └─────────────┘     └──────────────┘
```

Clients upload/download directly to S3 via presigned URLs. The API handles metadata and coordination. A Step Functions pipeline processes uploads asynchronously (text extraction → parallel chunking + metadata extraction).

## Project Structure

```
holocron/
├── apps/
│   ├── web/             → React Router v7 + Vite frontend
│   ├── desktop/         → Swift/AppKit macOS menubar app
│   ├── cli/             → Rust CLI (sync, file management, daemon)
│   └── ios/             → Swift/SwiftUI iOS app
├── packages/
│   ├── core/            → @holocron/core — shared TypeScript types & utils
│   ├── api/             → @holocron/api — Hono REST API (deployed to Lambda)
│   └── functions/       → @holocron/functions — Step Functions task handlers
├── infra/               → SST v3 infrastructure-as-code
├── database/            → PostgreSQL schema (DDL)
├── docs/                → Architecture documentation
├── scripts/             → Setup and automation scripts
├── sst.config.ts        → SST entry point
├── turbo.json           → Turborepo pipeline config
└── pnpm-workspace.yaml  → pnpm workspace definition
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- Swift 5.9+ / Xcode 15+ (for the desktop and iOS apps)
- Rust 1.70+ / Cargo (for the CLI)
- AWS CLI with configured credentials
- SST v3

## Setup

```sh
pnpm install
bash scripts/setup.sh              # interactive — generates API key, prompts for secrets
bash scripts/setup.sh --stage dev  # specify SST stage
```

The setup script:
1. Generates a random 32-byte hex API key and stores it as SST secret `HolocronApiKey`
2. Prompts for your Vercel AI Gateway API key (required for file indexing)
3. Prompts for your PlanetScale database connection string
4. Writes the API key to `~/.config/holocron/config.json` for client authentication

After setup, apply the database schema to your PlanetScale instance:

```sh
psql "$DATABASE_URL" -f database/schema.sql
```

## Development

```sh
pnpm dev        # Start all packages in dev mode
pnpm build      # Build all packages
pnpm typecheck  # Type-check all packages
pnpm lint       # Lint all packages (oxlint)
```

## Deployment

```sh
npx sst deploy --stage dev         # Deploy to dev stage
npx sst deploy --stage production  # Deploy to production
```

Non-production stages are fully torn down on removal. Production retains resources for data safety.

After deploying, update `apiURL` in `~/.config/holocron/config.json` with the API Gateway URL from the deploy output.

## Web App

**Stack:** React Router v7 (file-based routing), Vite, Tailwind CSS v4, shadcn/ui, Radix UI, lucide-react icons.

```sh
cd apps/web
pnpm dev    # Start dev server
pnpm build  # Production build
```

The web app is SSR-capable (`ssr: true`) and connects to the Holocron API for vault access. It's in the pnpm workspace but does not deploy via SST — it's a standalone Vite build.

## Desktop App

**Language:** Swift 5.9 · **Framework:** AppKit (menubar app) · **Minimum OS:** macOS 14 (Sonoma)

A macOS menubar app that watches `~/Holocron` and syncs changes to the backend in the background.

Key components:
- **FileWatcher** — FSEvents-based directory watcher with 2-second debounce
- **SyncEngine** — bidirectional sync via three-way manifest comparison with SHA-256 checksums
- **APIClient** — HTTP client with `X-Api-Key` authentication

Conflict resolution: when both sides change, the local file is renamed to `<name>.conflict-<timestamp>.<ext>` and the remote version is downloaded.

```sh
cd apps/desktop
make build     # swift build -c release
make bundle    # Create Holocron.app in .build/
make install   # Copy to /Applications
make run       # Build + open
```

## CLI

**Language:** Rust · **Async runtime:** Tokio · **CLI framework:** Clap

```sh
cd apps/cli
cargo build --release
# Binary: apps/cli/target/release/holocron
```

All commands support `--json` for machine-readable output.

| Command | Description |
|---|---|
| `holocron config show` | Print current configuration |
| `holocron config set <key> <value>` | Set a config value (`api-url`, `vault-path`, `api-key`) |
| `holocron config get <key>` | Get a single config value |
| `holocron health` | Check API connectivity |
| `holocron ls` | List remote files |
| `holocron share <id> [--expires-in N]` | Create a share URL |
| `holocron url <id>` | Get a presigned download URL |
| `holocron status <id>` | Check file indexing status and metadata |
| `holocron reindex <id>` | Trigger re-indexing of a file |
| `holocron pull <id> [--output path]` | Download a file to the current directory |
| `holocron search <query> [--limit N]` | Search indexed files |
| `holocron sync` | One-shot bidirectional sync |
| `holocron daemon` | Watch vault directory and sync on changes |

The CLI is a standalone Cargo project (not part of the pnpm/Turborepo pipeline). It shares configuration and sync state with the desktop app.

## iOS App

**Language:** Swift · **Framework:** SwiftUI · **Minimum OS:** iOS 17

A native iOS app for browsing, searching, previewing, and uploading files to the vault. Features include a file browser with folder hierarchy, document picker for uploads, full-text search, and file preview. Connects to the same API as the desktop app and CLI.

The iOS app is fully functional but not yet available on TestFlight. To build, open `apps/ios/Holocron.xcodeproj` in Xcode.

## API Endpoints

The API is a Hono application deployed to Lambda behind API Gateway v2. All endpoints require an `X-Api-Key` header unless noted.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| GET | `/files` | Yes | List all files |
| GET | `/files/version` | Yes | Get vault version metadata |
| GET | `/files/search?q=` | Yes | Full-text search across chunks |
| POST | `/files/upload` | Yes | Request presigned upload URL |
| POST | `/files/upload/confirm` | Yes | Confirm upload, trigger indexing pipeline |
| GET | `/files/:id` | Yes | Get file metadata + presigned download URL |
| PATCH | `/files/:id` | Yes | Update file path |
| DELETE | `/files/:id` | Yes | Delete file (S3 + DB + share links + chunks) |
| POST | `/files/:id/reindex` | Yes | Trigger re-indexing |
| GET | `/files/:id/chunks` | Yes | Get all indexed chunks for a file |
| POST | `/share` | Yes | Create a share link |
| GET | `/share/:token` | No | Resolve a share link |
| POST | `/search` | Yes | Hybrid search (full-text + vector + reranking) |
| POST | `/search/rerank` | Yes | LLM-based re-scoring of search results |
| POST | `/search/semantic` | Yes | Vector similarity search |

## File Processing Pipeline

When a file upload is confirmed, a Step Functions state machine runs:

1. **ExtractText** — routes by MIME type: PDF via `pdf-parse`, `text/*` direct read, `image/*` via Gemini OCR. Stores extracted text in S3.
2. **ChunkText** (parallel) — paragraph-based chunking (50–250 word chunks). Stores chunks as PostgreSQL rows with embeddings.
3. **ExtractMetadata** (parallel) — uses Gemini 2.0 Flash via Vercel AI Gateway to generate structured metadata (summary, keywords, topics, title) with Zod schema validation.

Steps 2 and 3 run in parallel after text extraction. Errors set the file's indexing status to `"failed"`.

## Database

**PostgreSQL** on PlanetScale with the **pgvector** extension for vector similarity search.

| Table | Purpose |
|---|---|
| `files` | File metadata (name, path, S3 key, size, MIME type, checksum, indexing status, LLM metadata) |
| `share_links` | Shareable links with optional expiration |
| `file_chunks` | Indexed text chunks with 768-dim embeddings (`gemini-embedding-001`) and tsvector for full-text search |
| `vault_version` | Singleton row tracking vault version and file count |

Schema: `database/schema.sql`

## Configuration

The desktop app and CLI share configuration at `~/.config/holocron/config.json`:

```json
{
  "apiKey": "<your-api-key>",
  "apiURL": "https://your-api-url.example.com",
  "vaultPath": "~/Holocron"
}
```

Sync state is persisted at `~/.config/holocron/sync-state.json` — maps vault-relative paths to `{ checksum, fileId }` entries.

## Infrastructure

All infrastructure is defined in `infra/` using SST v3 (Pulumi under the hood).

| Resource | Type | Purpose |
|---|---|---|
| HolocronBucket | `sst.aws.Bucket` | Private S3 bucket for file storage |
| HolocronApi | `sst.aws.Function` | Hono API Lambda (Node 24) |
| HolocronGateway | `sst.aws.ApiGatewayV2` | HTTP API fronting the Lambda |
| ExtractText | `sst.aws.Function` | Text extraction Lambda |
| ChunkText | `sst.aws.Function` | Text chunking Lambda |
| ExtractMetadata | `sst.aws.Function` | LLM metadata extraction Lambda |
| HolocronProcessing | `aws.sfn.StateMachine` | Step Functions orchestrator |
| DatabaseUrl | `sst.Secret` | PlanetScale connection string |
| HolocronApiKey | `sst.Secret` | API authentication key |
| VercelAIGatewayApiKey | `sst.Secret` | Vercel AI Gateway key for LLM calls |
