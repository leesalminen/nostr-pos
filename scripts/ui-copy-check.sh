#!/usr/bin/env bash
set -euo pipefail

if [ ! -d apps/pos-pwa/src ]; then
  exit 0
fi

if rg -iw '(nostr|relay|npub|naddr|nevent|pubkey|nip-|\bkind ?[0-9])' \
  apps/pos-pwa/src/routes apps/pos-pwa/src/lib/ui \
  --glob '!apps/pos-pwa/src/routes/settings/advanced/**' \
  --glob '!apps/pos-pwa/src/lib/ui/advanced/**'; then
  echo "User-facing copy contains protocol jargon outside Advanced screens." >&2
  exit 1
fi
