# Holocron CLI

Command-line interface for syncing and managing your Holocron vault. The CLI shares its configuration with the macOS desktop app so both tools stay in sync.

## Prerequisites

- Rust toolchain **1.70+** (install via [rustup](https://rustup.rs/))

## Build

```sh
cd apps/cli
cargo build --release
```

The binary is written to `apps/cli/target/release/holocron`.

## Configuration

Config is stored at `~/.config/holocron/config.json` and shared with the desktop app. The file uses camelCase keys:

```json
{
  "apiKey": "your-api-key",
  "apiURL": "http://localhost:3000",
  "vaultPath": "~/Holocron"
}
```

| Key         | Default                 | Description                      |
| ----------- | ----------------------- | -------------------------------- |
| `apiURL`    | `http://localhost:3000` | Base URL for the Holocron API    |
| `vaultPath` | `~/Holocron`            | Local directory for synced files |
| `apiKey`    | _(empty)_               | API key for authentication       |

Manage config from the CLI:

```sh
# Show the full config
holocron config show

# Set a value
holocron config set api-url http://localhost:3000
holocron config set vault-path ~/Holocron
holocron config set api-key my-secret-key

# Get a single value (returns the resolved value with defaults applied)
holocron config get api-url
```

Valid keys for `set`/`get`: `api-url`, `vault-path`, `api-key`.

## Commands

### `holocron health`

Check that the API is reachable.

```sh
holocron health
# API is healthy
```

### `holocron ls`

List all remote files. Output columns: ID, NAME, SIZE, PATH.

```sh
holocron ls
```

### `holocron share <id> [--expires-in <seconds>]`

Create a shareable URL for a file. Optionally set an expiration time in seconds.

```sh
holocron share abc-123
holocron share abc-123 --expires-in 3600
```

### `holocron url <id>`

Get a presigned download URL for a file.

```sh
holocron url abc-123
```

### `holocron sync`

Run a one-shot bidirectional sync between the local vault and the remote API.

```sh
holocron sync
```

### `holocron daemon`

Start a long-running foreground process that watches the vault directory for changes and syncs automatically.

```sh
holocron daemon
```

Press `Ctrl-C` to shut down.

## How sync works

Sync uses a three-way comparison between three sources of truth:

1. **Local manifest** (`~/.config/holocron/sync-state.json`) — the last-known state after a successful sync
2. **Local files** on disk in the vault directory
3. **Remote files** returned by the API

For each file path the engine checks what changed since the last sync:

| Manifest | Local | Remote | Action                                                                                                      |
| -------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------- |
| yes      | yes   | yes    | Compare checksums. Upload if only local changed, download if only remote changed, conflict if both changed. |
| yes      | yes   | no     | Remote was deleted — delete the local copy.                                                                 |
| yes      | no    | yes    | Local was deleted — delete the remote copy.                                                                 |
| yes      | no    | no     | Both deleted — remove from manifest.                                                                        |
| no       | yes   | yes    | New to both sides. If checksums match, record in manifest. Otherwise treat as conflict.                     |
| no       | yes   | no     | New local file — upload.                                                                                    |
| no       | no    | yes    | New remote file — download.                                                                                 |

Hidden files/directories (names starting with `.`) and `.conflict-*` files are skipped during enumeration.

Checksums are SHA-256 hashes of file contents.

### Conflict handling

When both local and remote have changed, the local copy is renamed to `<path>.conflict-<YYYYMMDDHHmmSS>` and the remote version is downloaded in its place. The conflict file is preserved so nothing is lost.

## Daemon mode

`holocron daemon` runs an initial sync, then watches the vault directory using OS file-system notifications. When a file change is detected, events are debounced for 2 seconds before triggering a sync. This prevents redundant syncs during batch saves or editor write sequences.

The daemon runs in the foreground and shuts down cleanly on `Ctrl-C`.
