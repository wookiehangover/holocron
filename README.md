# Holocron

A personal file vault and self-hosted Dropbox replacement.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Swift 5.9+ / Xcode 15+ (for the desktop app)
- Rust 1.70+ / Cargo (for the CLI)

## Setup

```sh
pnpm install
```

## Development

```sh
pnpm dev        # Start all packages in dev mode
pnpm build      # Build all packages
pnpm typecheck  # Type-check all packages
pnpm lint       # Lint all packages
```

## Project Structure

```
holocron/
├── apps/
│   ├── web/           → React Router v7 + Vite frontend
│   ├── desktop/       → Swift/SwiftUI menubar app
│   └── cli/           → Rust CLI (sync, file management, daemon mode)
├── packages/
│   ├── core/          → @holocron/core — shared types & utils
│   ├── api/           → @holocron/api — Hono API (→ Lambda)
│   └── functions/     → @holocron/functions — Step function handlers
└── infra/             → SST infrastructure definitions
```

## CLI

The Rust CLI lives in `apps/cli/` and provides command-line access to the vault.

```sh
cd apps/cli
cargo build --release

# Commands
holocron config show          # Show current configuration
holocron ls                   # List remote files
holocron share <id>           # Create a share URL
holocron url <id>             # Get a presigned download URL
holocron sync                 # One-shot bidirectional sync
holocron daemon               # Watch vault directory and sync on changes
```

The CLI shares configuration (`~/.config/holocron/config.json`) and sync state (`~/.config/holocron/sync-state.json`) with the desktop app.
