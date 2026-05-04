# nostr_pos_cli

Dart CLI controller for the Nostr POS protocol. Built on the
[`nostr_pos`](../../packages/nostr_pos/README.md) SDK.

This is the merchant's "control panel": it generates the merchant Nostr keys,
publishes the POS profile, authorizes terminals, decrypts sales history, and
broadcasts swap recovery transactions. The browser PWA never touches these
keys — they live only in the controller.

## Install

```bash
cd apps/nostr_pos_cli
dart pub get
```

Run any command with `dart run bin/nostr_pos.dart <command>`.

## Two-minute live demo

For a side-by-side demo with the cashier PWA, three commands are enough:

```bash
# 1. Once: generate merchant + recovery keys, write .nostr-pos/profile.json.
dart run bin/nostr_pos.dart init

# 2. Publish the POS profile and print the URL the cashier opens.
dart run bin/nostr_pos.dart serve-pos

# 3. After the cashier shows a pairing code, authorize and publish.
dart run bin/nostr_pos.dart pair-terminal --pairing-code 4F7G-YJDP
```

`init` writes `.nostr-pos/profile.json` with the merchant key, recovery key,
POS id, relays, and store path. `serve-pos` and `pair-terminal` read those
defaults so you do not have to repeat them on every command. The profile file
is gitignored — never commit it.

`pair-terminal` watches the configured relays for the pairing announcement
(default 60s timeout) and exits as soon as the terminal authorization has been
signed and published. The PWA picks it up and unlocks the keypad.

## Command reference

### Streamlined demo flow

| Command | Description |
| --- | --- |
| `init` | Generate or import merchant + recovery keys; persist defaults to a profile file. |
| `serve-pos` | Build, sign, store, and replicate the POS profile event; print the cashier URL. |
| `pair-terminal --pairing-code XXXX-XXXX` | Watch relays for the announcement, then authorize, encrypt, sign, and publish. |

`init` flags worth knowing:

- `--profile <path>` — defaults to `.nostr-pos/profile.json`.
- `--store <path>` — JSONL event log (default `.nostr-pos/events.jsonl`).
- `--pos-id <id>` — defaults to `demo-<unix-ts>`.
- `--name`, `--merchant`, `--currency` — POS profile metadata.
- `--relays <csv>` — defaults to `wss://no.str.cr,wss://relay.primal.net,wss://nos.lol`.
- `--base-url <url>` — defaults to `https://nostr-pos.vercel.app/#/pos`. Point at
  your local PWA build (e.g. `http://localhost:4173/#/pos`) for offline demos.
- `--merchant-privkey`, `--recovery-privkey` — reuse existing 32-byte hex keys.
- `--force` — overwrite an existing profile file.

`pair-terminal` flags worth knowing:

- `--descriptor <ct-descriptor>` — Liquid CT descriptor for the terminal branch.
  A demo placeholder is used if omitted.
- `--fingerprint`, `--branch`, `--terminal-name` — passed through to the
  terminal authorization event.
- `--timeout-seconds 60`, `--poll-seconds 2` — how aggressively to wait.

### Lower-level commands

These are still here for runbooks, scripted operations, and the mainnet e2e
test (`docs/mainnet-e2e-test.md`). The streamlined commands above call the same
SDK functions.

| Command | Description |
| --- | --- |
| `create-pos` | Build a POS profile event and append it to the local store. |
| `pos-url` | Print the `naddr`-encoded URL the cashier opens. |
| `pairing-code --terminal-pubkey <hex>` | Derive the pairing code from a terminal pubkey. |
| `announce-terminal --terminal-pubkey <hex>` | Build a pairing announcement (test/dev only — the PWA does this in production). |
| `fetch-pairing --pairing-code <code>` | Look up a pairing announcement on relays. |
| `auth-terminal --pairing-code <code>` | Build the encrypted terminal authorization event. |
| `revoke-terminal --terminal-pubkey <hex>` | Build the terminal revocation event. |
| `publish-events [--kind N] [--limit N]` | Publish stored events (newest first) to the configured relays. |
| `record-sale` | Append a sale-created + payment-status + receipt to the local store. |
| `list-events [--kind N] [--relays …]` | List events from the local store or relays. |
| `list-sales [--merchant-recovery-privkey <hex>]` | Reduce sales/payment/receipt events into a sales table. |
| `export-sales [--format csv\|json]` | Export the sales table. |
| `recover-swaps [--broadcast-prepared] [--liquid-api …]` | Inspect or rebroadcast swap recovery records. |
| `quote --currency CRC --amount 8500` | Fetch a Bull Bitcoin index-price quote. |

Every command supports `--store <path>`; defaults to `.nostr-pos/events.jsonl`.

## Profile file shape

```json
{
  "version": 1,
  "merchant": { "privkey": "<hex>", "pubkey": "<hex>" },
  "recovery": { "privkey": "<hex>", "pubkey": "<hex>" },
  "pos_id": "demo-1700000000",
  "name": "Counter 1",
  "merchant_name": "Demo Merchant",
  "currency": "USD",
  "relays": ["wss://no.str.cr", "wss://relay.primal.net", "wss://nos.lol"],
  "store": ".nostr-pos/events.jsonl",
  "base_url": "https://nostr-pos.vercel.app/#/pos"
}
```

The merchant private key signs every controller event; the recovery key
unwraps NIP-59 swap-recovery backups and decrypts NIP-44 sale envelopes. Treat
the profile file like a wallet seed — back it up, do not commit it.

## Testing

```bash
cd apps/nostr_pos_cli
dart pub get
dart analyze
dart test
```

The test suite uses an in-process WebSocket relay to verify `publish-events`
publishes the newest matching kind first and that `record-sale` keeps sale ids
out of relay-visible tags.
