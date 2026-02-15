#!/usr/bin/env bash
#
# Holocron Backend Setup
#
# Generates a random API key, stores it as an SST secret, and writes it
# to the local client configuration so that the desktop app, CLI, and
# web app can authenticate with the backend.
#
# Usage:
#   bash scripts/setup.sh            # interactive
#   bash scripts/setup.sh --stage dev  # specify SST stage
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
error() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

STAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    *) error "Unknown argument: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

command -v npx  >/dev/null 2>&1 || error "npx is required but not found. Install Node.js first."
command -v openssl >/dev/null 2>&1 || error "openssl is required but not found."

# ---------------------------------------------------------------------------
# Generate a random 32-byte hex API key
# ---------------------------------------------------------------------------

info "Generating a random API key (32 bytes / 64 hex chars)…"
API_KEY=$(openssl rand -hex 32)
ok "API key generated."

# ---------------------------------------------------------------------------
# Store the key as an SST secret
# ---------------------------------------------------------------------------

info "Storing API key as SST secret 'HolocronApiKey'…"

SST_CMD=(npx sst secret set HolocronApiKey "$API_KEY")
if [[ -n "$STAGE" ]]; then
  SST_CMD+=(--stage "$STAGE")
fi

if "${SST_CMD[@]}"; then
  ok "SST secret set successfully."
else
  error "Failed to set SST secret. Make sure you have AWS credentials configured."
fi

# ---------------------------------------------------------------------------
# Prompt for Vercel AI Gateway API key
# ---------------------------------------------------------------------------

info "Enter your Vercel AI Gateway API key (get one at https://vercel.com/dashboard → AI Gateway → API Keys)"
read -r AI_GATEWAY_KEY

AI_GATEWAY_STATUS="skipped"
if [[ -z "$AI_GATEWAY_KEY" ]]; then
  warn "Skipped — file indexing pipeline will not work without this key. You can set it later with: npx sst secret set VercelAIGatewayApiKey <key>"
else
  info "Storing Vercel AI Gateway key as SST secret 'VercelAIGatewayApiKey'…"

  GW_CMD=(npx sst secret set VercelAIGatewayApiKey "$AI_GATEWAY_KEY")
  if [[ -n "$STAGE" ]]; then
    GW_CMD+=(--stage "$STAGE")
  fi

  if "${GW_CMD[@]}"; then
    ok "SST secret 'VercelAIGatewayApiKey' set successfully."
    AI_GATEWAY_STATUS="set"
  else
    warn "Failed to set VercelAIGatewayApiKey. You can retry later with: npx sst secret set VercelAIGatewayApiKey <key>"
  fi
fi

# ---------------------------------------------------------------------------
# Write / update local client configuration
# ---------------------------------------------------------------------------

CONFIG_DIR="${HOME}/.config/holocron"
CONFIG_FILE="${CONFIG_DIR}/config.json"

info "Writing API key to ${CONFIG_FILE}…"

mkdir -p "$CONFIG_DIR"

if [[ -f "$CONFIG_FILE" ]]; then
  # Update existing config — preserve other fields, overwrite apiKey
  if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq --arg key "$API_KEY" '.apiKey = $key' "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
  else
    warn "jq not found — overwriting config.json (existing settings will be lost)."
    cat > "$CONFIG_FILE" <<EOF
{
  "apiKey": "${API_KEY}",
  "apiURL": "https://your-api-url.example.com",
  "vaultPath": "${HOME}/Holocron"
}
EOF
  fi
else
  cat > "$CONFIG_FILE" <<EOF
{
  "apiKey": "${API_KEY}",
  "apiURL": "https://your-api-url.example.com",
  "vaultPath": "${HOME}/Holocron"
}
EOF
fi

ok "Client configuration written."

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "============================================="
echo "  Holocron backend setup complete!"
echo "============================================="
echo ""
echo "  API Key: ${API_KEY}"
echo ""
echo "  Stored in:"
echo "    • SST secret 'HolocronApiKey' (server-side)"
echo "    • ${CONFIG_FILE} (client-side)"
echo ""
echo "  AI Gateway key: ${AI_GATEWAY_STATUS}"
echo ""
echo "  Next steps:"
echo "    1. Deploy the backend:  npx sst deploy${STAGE:+ --stage $STAGE}"
echo "    2. Update apiURL in ${CONFIG_FILE} with the deployed API Gateway URL"
echo "    3. Start the desktop app or CLI to begin syncing"
echo ""

