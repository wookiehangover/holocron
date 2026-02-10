# Holocron

A personal file vault and self-hosted Dropbox replacement.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Swift 5.9+ / Xcode 15+ (for the desktop app)

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
│   └── desktop/       → Swift/SwiftUI menubar app
├── packages/
│   ├── core/          → @holocron/core — shared types & utils
│   ├── api/           → @holocron/api — Hono API (→ Lambda)
│   └── functions/     → @holocron/functions — Step function handlers
└── infra/             → SST infrastructure definitions
```

hello world
