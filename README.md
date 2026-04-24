# nostr-pos

Open, backendless retail POS protocol and reference app for Liquid settlement,
Lightning swaps, and Bolt Card payments.

This repository is organized as a small monorepo:

- `packages/nostr-pos-protocol-spec`: schemas, fixtures, and human protocol docs.
- `packages/nostr_pos`: Dart controller SDK foundations.
- `apps/nostr_pos_cli`: CLI controller built on the Dart SDK.
- `apps/pos-pwa`: static Svelte 5 + Vite cashier PWA.
- `infra`: local relay/Liquid/swap development scaffolding.

## Current Smoke Commands

```bash
npm run protocol:check
npm run check
npm run test -w apps/pos-pwa
npm run build -w apps/pos-pwa
npm run audit:pwa
cd packages/nostr_pos && dart analyze && dart test
cd apps/nostr_pos_cli && dart analyze && dart test
```

Relay smoke:

```bash
npm run relay:smoke
```

Controller publish smoke:

```bash
cd apps/nostr_pos_cli
tmp=$(mktemp -d)
dart run bin/nostr_pos.dart create-pos \
  --merchant-privkey 0000000000000000000000000000000000000000000000000000000000000001 \
  --pos-id smoke-$(date +%s) \
  --store "$tmp/events.jsonl"
dart run bin/nostr_pos.dart publish-events --store "$tmp/events.jsonl" --limit 1
```

## Pilot Activation Flow

1. Start the PWA and open the activation screen.
2. The terminal displays a pairing code and publishes an approval request to the configured backup servers.
3. The controller can discover that request:

```bash
cd apps/nostr_pos_cli
dart run bin/nostr_pos.dart fetch-pairing --pairing-code 4F7G-YJDP
```

Use `--relays` here when the PWA was opened with a POS profile that overrides
the default relay set; pairing announcements are discovered by the indexed `d`
tag on kind `30383`.

4. The controller authorizes the terminal and signs the approval:

```bash
dart run bin/nostr_pos.dart auth-terminal \
  --pairing-code 4F7G-YJDP \
  --relays wss://no.str.cr,wss://relay.primal.net,wss://nos.lol \
  --merchant-privkey <merchant-private-key-hex>
```

5. Paste the approval JSON into the PWA, or publish it with:

```bash
dart run bin/nostr_pos.dart publish-events --kind 30381
```

## Recovery Operations

List encrypted swap recovery records from a local event store, or merge relay
records addressed to the merchant recovery key:

```bash
cd apps/nostr_pos_cli
dart run bin/nostr_pos.dart recover-swaps \
  --store .nostr-pos/events.jsonl \
  --relays wss://no.str.cr,wss://relay.primal.net,wss://nos.lol \
  --merchant-recovery-privkey <merchant-recovery-private-key-hex>
```

If a terminal prepared and published `claim_tx_hex` before dying, the controller
can broadcast that prepared claim through a Liquid Esplora backend:

```bash
dart run bin/nostr_pos.dart recover-swaps \
  --store .nostr-pos/events.jsonl \
  --relays wss://no.str.cr,wss://relay.primal.net,wss://nos.lol \
  --merchant-recovery-privkey <merchant-recovery-private-key-hex> \
  --broadcast-prepared \
  --liquid-api https://blockstream.info/liquid/api
```
