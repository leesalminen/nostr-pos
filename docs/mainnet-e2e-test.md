# Mainnet End-to-End Test Runbook

This runbook exercises the current production pilot path with the browser
terminal, public relays, the Dart CLI controller, Liquid mainnet, and Boltz
mainnet reverse swaps.

These steps use real mainnet payment rails. Use tiny amounts first.

## 1. Preflight

From the repo root:

```bash
npm run test -w apps/pos-pwa
npm run check
npm run build
npm run protocol:check
cd apps/nostr_pos_cli && dart analyze && dart test
```

Start the terminal app. For a local production build:

```bash
npm run preview -w apps/pos-pwa -- --host 0.0.0.0 --port 4173
```

If you use the dev server instead:

```bash
npm run dev -w apps/pos-pwa -- --host 0.0.0.0 --port 5173
```

Before a fresh activation, clear the browser's IndexedDB for this origin or use
Settings -> Advanced reset if available.

## 2. Shell Environment

Open a controller terminal:

```bash
cd apps/nostr_pos_cli

export RELAYS='wss://no.str.cr,wss://relay.primal.net,wss://nos.lol'
export STORE=".nostr-pos/mainnet-e2e-$(date +%s).jsonl"
export POS_ID="mainnet-test-$(date +%s)"
export TERMINAL_BRANCH='17'

export MERCHANT_PRIVKEY='<merchant nostr private key hex>'
export RECOVERY_PRIVKEY="$MERCHANT_PRIVKEY"
export RECOVERY_PUBKEY="$(node --input-type=module -e 'import { getPublicKey } from "@noble/secp256k1"; const pk=Uint8Array.from(Buffer.from(process.env.RECOVERY_PRIVKEY,"hex")); console.log(Buffer.from(getPublicKey(pk, true)).subarray(1).toString("hex"))')"

export CT_DESCRIPTOR='<liquid mainnet confidential descriptor: ct(slip77(...),elwpkh(...))>'
export DESCRIPTOR_FINGERPRINT='<descriptor fingerprint, for example ed327521>'
```

The descriptor must be a merchant-controlled Liquid mainnet confidential
descriptor with a `slip77(...)` master blinding key. The terminal uses it to
derive receive addresses and to verify confidential payment amounts.

Optional POS profile publish:

```bash
dart run bin/nostr_pos.dart create-pos \
  --store "$STORE" \
  --merchant-privkey "$MERCHANT_PRIVKEY" \
  --pos-id "$POS_ID"

dart run bin/nostr_pos.dart publish-events \
  --store "$STORE" \
  --relays "$RELAYS" \
  --kind 30380 \
  --limit 1

dart run bin/nostr_pos.dart pos-url \
  --merchant-privkey "$MERCHANT_PRIVKEY" \
  --pos-id "$POS_ID" \
  --relays "$RELAYS" \
  --base-url 'http://localhost:4173/#/pos'
```

Open the printed URL. Without a POS profile, open `http://localhost:4173/#/activate`.

## 3. Pair and Activate the Terminal

The browser should show a pairing code like `ABCD-1234`.

```bash
export PAIRING_CODE='<code shown in browser>'

dart run bin/nostr_pos.dart fetch-pairing \
  --pairing-code "$PAIRING_CODE" \
  --relays "$RELAYS"
```

Authorize the terminal:

```bash
dart run bin/nostr_pos.dart auth-terminal \
  --store "$STORE" \
  --pairing-code "$PAIRING_CODE" \
  --relays "$RELAYS" \
  --pos-id "$POS_ID" \
  --merchant-privkey "$MERCHANT_PRIVKEY" \
  --merchant-recovery-pubkey "$RECOVERY_PUBKEY" \
  --descriptor "$CT_DESCRIPTOR" \
  --fingerprint "$DESCRIPTOR_FINGERPRINT" \
  --branch "$TERMINAL_BRANCH"
```

Publish the newest authorization:

```bash
dart run bin/nostr_pos.dart publish-events \
  --store "$STORE" \
  --relays "$RELAYS" \
  --kind 30381 \
  --limit 1
```

`duplicate` relay responses are OK. They mean the relay already has that exact
event.

The terminal should activate automatically. If it does not, copy the JSON output
from `auth-terminal`, paste it into the activation screen, and apply it.

## 4. Liquid Mainnet Payment Test

1. In the browser, enter a tiny fiat amount and press Charge.
2. On the payment screen, switch to Liquid.
3. Confirm the screen shows the fiat amount, sats, and exchange rate.
4. Pay the Liquid invoice/address from a Liquid wallet.
5. Expected result: the terminal polls the configured Liquid Esplora backend,
   directly unblinds the matching candidate output, verifies the received
   policy-asset sats, and advances to the receipt screen.

Useful browser diagnostic:

```js
localStorage.setItem("nostr-pos:debug:liquid", "1")
```

With the current verifier, the browser should call:

```text
/address/<confidential-address>/txs
/tx/<candidate-txid>/hex
```

It should not run descriptor-wide scans or make hundreds of historical `/tx`
requests.

## 5. Lightning Mainnet Payment Test

1. Create a new sale. Do not reuse a sale that was created before the latest
   Lightning fixes.
2. Leave the Lightning tab selected.
3. The terminal creates a Boltz BTC -> L-BTC reverse swap.
4. Before showing the QR, the terminal verifies:
   - the returned Bolt11 invoice is checksummed,
   - the invoice amount equals the sale sats,
   - the invoice payment hash equals the terminal-generated preimage hash,
   - the Bolt11 memo/description is `<merchant name> sale <sale id>`,
   - the encrypted recovery backup reached at least two relays.
5. Scan and pay the Lightning QR.
6. Expected result: Boltz reports payment/lockup status, the terminal builds
   and broadcasts the Liquid claim transaction, then advances to the receipt
   screen.

If the charge fails before showing the QR, the keypad now shows the real reason.
Common causes:

```text
No authorized Boltz provider is configured for Lightning.
Could not safely prepare Lightning payment: recovery backup reached 1/2 relays.
Could not safely prepare Lightning payment: invoice payment hash mismatch.
Lightning is disabled by the owner approval for this terminal.
```

If the Lightning tab is disabled on the payment screen, that sale was created
without a valid Lightning invoice. Create a new sale after hard-refreshing the
current build.

## 6. Inspect History and Recovery

List local controller events:

```bash
dart run bin/nostr_pos.dart list-events \
  --store "$STORE" \
  --kind 30381
```

Read terminal-addressed sales from relays if you know the terminal pubkey:

```bash
dart run bin/nostr_pos.dart list-events \
  --relays "$RELAYS" \
  --kind 9382 \
  --p '<terminal pubkey hex>' \
  --limit 100
```

Inspect Lightning recovery records addressed to the merchant recovery key:

```bash
dart run bin/nostr_pos.dart recover-swaps \
  --store "$STORE" \
  --relays "$RELAYS" \
  --merchant-recovery-privkey "$RECOVERY_PRIVKEY" \
  --boltz-api https://api.boltz.exchange
```

If the terminal prepared a `claim_tx_hex` before dying, rebroadcast prepared
claims:

```bash
dart run bin/nostr_pos.dart recover-swaps \
  --store "$STORE" \
  --relays "$RELAYS" \
  --merchant-recovery-privkey "$RECOVERY_PRIVKEY" \
  --broadcast-prepared \
  --boltz-api https://api.boltz.exchange \
  --liquid-api https://liquid.bullbitcoin.com/api
```

The Dart CLI can currently inspect recovery records and rebroadcast prepared
claims. Browser-side code builds the standard Boltz claim transaction.

## 7. Cleanup and Repeat

For a new pairing test:

1. Clear IndexedDB/local storage for the app origin.
2. Reload the terminal URL.
3. Use a new `STORE` and `POS_ID`, or reuse the same ones if you intentionally
   want an append-only event log.

If you reauthorize the same terminal, use:

```bash
dart run bin/nostr_pos.dart publish-events \
  --store "$STORE" \
  --relays "$RELAYS" \
  --kind 30381 \
  --limit 1
```

The CLI publishes newest events first, so this publishes the latest approval.
