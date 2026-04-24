# PRD: Open Nostr POS Protocol for Liquid Settlement + Lightning Swaps

> **Status:** v0.2 — decisions locked for v1 implementation. Supersedes v0.1 (initial brief).
> **Target:** ship v1 pilot to **Seguras Butcher** in ~14 engineering weeks (solo) / ~8–10 weeks (two engineers).
> **Primary consumer of the Dart controller SDK:** [`SatoshiPortal/bullbitcoin-mobile`](https://github.com/SatoshiPortal/bullbitcoin-mobile) (Bull Wallet, Flutter).

---

## 1. Executive Summary

Build an open, backendless, non-custodial retail point-of-sale protocol and reference application.

The system lets a merchant wallet publish a POS profile as a Nostr-addressed object. Authorized cashier terminals open the POS in a browser/PWA, accept direct Liquid payments, accept Lightning payments via verifiable Boltz reverse swaps, support Bolt Card tap-to-pay on Android Chrome, maintain a local transaction ledger, publish encrypted recovery records to Nostr relays, and settle funds directly to the merchant's Liquid wallet.

There is no Bull server, no Bull account, no central database, and no custodial payment processor. Bull Wallet is the **primary reference controller**, but the protocol is open and wallet-neutral; any compatible wallet can implement the merchant-controller role.

Working name:

```text
nostr-pos
```

Possible external names (final choice deferred to launch):

```text
Nostr POS Protocol
Nostr Retail Payment Protocol
NIP-POS
Nostr Liquid POS
```

Core product promise:

> A Square-grade, browser-based POS that is just a URL, backed by Nostr relays, accepting Liquid, Lightning, and Bolt Card payments, with non-custodial settlement to the merchant's Liquid wallet.

### Locked v1 scope at a glance

- Keypad-only POS (no product catalog, no cart, no tip presets, no tax config — deferred to v1.1).
- Liquid direct payments + Lightning via Boltz reverse swaps (**standard** mode, per-terminal sat caps).
- Bolt Card tap on Android Chrome PWA.
- Transaction sheet, browser-print receipts (58mm / 80mm / A4), confetti/sound/haptics.
- Reference merchant controller shipped as a Dart package (`nostr_pos`) + CLI (`nostr_pos_cli`), designed for direct integration into `bullbitcoin-mobile` in v1.1.
- Encrypted IndexedDB ledger + encrypted Nostr recovery backups; startup reconciliation + recovery engine.
- Pilot deployment to **Seguras Butcher** (see §28).

---

## 2. Product Goals

### 2.1 Primary Goals

1. Create an open Nostr protocol for merchant POS profiles, terminal authorization, payment requests, receipts, recovery records, and settlement proofs.
2. Build a static browser PWA reference POS app using **Svelte 5 + Vite** (not SvelteKit — see §6.1), TypeScript, and Tailwind.
3. Accept direct Liquid payments to merchant-derived confidential addresses.
4. Accept Lightning payments via Boltz-compatible Lightning-to-Liquid reverse swaps.
5. Support Bolt Card tap-to-pay through Web NFC on Android Chrome.
6. Provide a "Square-grade" cashier experience: fast keypad, clear payment states, tip/note optional, receipt printing, confetti, sounds.
7. Provide a robust previous-transactions sheet so a cashier can recover confidence after refreshes, crashes, network failures, or payment uncertainty.
8. Make recovery first-class: pending swaps must survive refreshes, browser crashes, and device loss through encrypted local storage and encrypted Nostr recovery events.
9. Keep the protocol wallet-neutral. Bull Wallet is the reference controller; Aqua, Green, SideSwap, or any compatible wallet can implement the same role.
10. Avoid any Bull-operated server requirement. Static hosting only.
11. **Treat Nostr as an implementation detail.** Cashiers and customers never see pubkeys, relays, naddrs, NIP numbers, or kind numbers. Nostr terminology lives in Settings → Advanced and nowhere else (see §8.9).

### 2.2 Non-Goals for v1

1. iOS browser support for Bolt Card (Web NFC unavailable). iOS users fall through to QR payment.
2. Fiat card payments.
3. Product catalog, categories, cart, line items, discounts beyond flat dollar off, tip presets, tax configuration. All deferred to v1.1 (see §18).
4. Employee payroll, shifts, restaurant table management.
5. Merchant custody or hosted wallets.
6. Centralized Bull payment history storage.
7. Reliance on a proprietary Bull API for core payment flow (rates API is read-only and optional — falls back to `indexPrice`).
8. Covenant claim mode (Boltz) — schema slot reserved (`claim_mode`), implementation in v1.1.
9. WebUSB / Web Bluetooth ESC/POS printer drivers — browser print dialog only in v1.
10. NIP submission and formal external audit — deferred to post-pilot.
11. Refund / void flow beyond "do not broadcast the claim" for pre-settled Lightning payments.
12. Full e-commerce storefront support (the protocol should not preclude it, but no UX for it).

---

## 3. Core Philosophy

This is not a Bull-hosted POS.

This is a protocol and a reference client.

Bull Wallet is the first wallet to support the protocol, but the protocol does not depend on Bull Wallet. A POS profile must be portable across compatible clients.

### 3.1 Principles

```text
Open protocol
No custodial server
No merchant account
No central database
Static app shell
Nostr for coordination and recovery — but hidden from users
Liquid for settlement
Lightning accepted through verifiable swap providers
Merchant wallet remains source of truth
Security posture documented, not implied
```

### 3.2 What Nostr is used for

```text
- signed event log
- POS profile registry
- terminal authorization transport
- encrypted recovery backup layer
- receipt/status replication layer
- terminal-controller messaging layer
```

### 3.3 What Nostr is NOT used for

```text
- payment validator
- swap provider
- price oracle
- Liquid indexer
- transactional database with locks
- user-facing concept (see §8.9)
```

Clients must verify payment and settlement independently of relay-carried status events.

### 3.4 The Nostr-as-plumbing rule

> Nostr is infrastructure, like TCP. Users — cashiers, customers, merchants in the happy path — never see or hear the word "Nostr," "relay," "pubkey," "npub," "naddr," "event," "kind," "NIP," or any protocol-layer jargon.

See §8.9 for the terminology mapping, the admin settings exemption, and the CI-enforced grep check.

---

## 4. Target Users and Personas

### 4.1 Merchant Owner

Owns the business and controls the settlement wallet.

Needs:

```text
- create POS profiles
- authorize/revoke terminals
- see sales history
- recover pending swaps
- export accounting data
- maintain custody of funds
- avoid operating a server
```

Example:

```text
Seguras Butcher owner — uses Bull Wallet on their phone as the merchant controller,
and has an Android tablet at the counter running the POS PWA. They manage sales
without touching Nostr concepts directly.
```

### 4.2 Cashier

Uses the POS terminal during sales.

Needs:

```text
- enter custom amount quickly
- accept QR, Liquid, Lightning, or Bolt Card
- know immediately if payment succeeded
- print/share receipts
- check previous transactions after refresh/payment uncertainty
- never see private wallet controls
- never see crypto/protocol jargon
```

### 4.3 Customer

Pays the merchant.

Payment methods:

```text
- Liquid wallet
- Lightning wallet
- Bolt Card
```

Needs:

```text
- fast payment flow
- obvious amount and merchant name
- scannable QR
- receipt if needed
```

### 4.4 Wallet Developer

Implements merchant-controller support in their own wallet.

Needs:

```text
- clear event schemas + test vectors
- descriptor / recovery standards
- terminal authorization rules
- payment verification rules
- a published Dart reference library they can consume or port
```

### 4.5 POS Client Developer

Implements a terminal app.

Needs:

```text
- protocol docs + test vectors
- event schemas
- recovery-record format
- Liquid derivation rules
- swap-provider interface
- state machine
- the Svelte reference implementation as a baseline
```

---

## 5. High-Level Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│  Merchant device (phone)                                      │
│  ──────────────────────────                                   │
│  Bull Wallet (Flutter) consuming nostr_pos Dart package       │
│    - create/edit POS profile                                  │
│    - authorize/revoke terminals (pairing-code flow)           │
│    - decrypt gift-wrapped recovery records                    │
│    - run claim-only Boltz recovery for stranded swaps         │
│    - verify settlement against Liquid backends                │
│    - view sales history / export                              │
│                                                               │
│  (nostr_pos_cli is a dev/ops alternative using the same lib)  │
└───────────────────────┬───────────────────────────────────────┘
                        │ Nostr events (signed, some gift-wrapped)
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  Nostr relays — default set for v1:                           │
│    wss://no.str.cr                                            │
│    wss://relay.primal.net                                     │
│    wss://nos.lol                                              │
│  (merchant can add/remove in Settings → Advanced)             │
│                                                               │
│    - kind 30380 POS profile (public, addressable)             │
│    - kind 30381 terminal authorization (encrypted content)    │
│    - kind 30382 terminal revocation                           │
│    - kind 9380 sale created (always encrypted in v1)          │
│    - kind 9381 swap recovery (gift-wrapped)                   │
│    - kind 9382 payment status (encrypted in v1)               │
│    - kind 9383 receipt (encrypted by default; merchant        │
│                 can enable minimal public variant)            │
│    - kind 9386 fiat rate attestation (future)                 │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  POS PWA (Svelte 5 + Vite + vite-plugin-pwa)                  │
│  Android Chrome target; installable PWA                       │
│    - Terminal: keypad, QR, Bolt Card tap, tx sheet            │
│    - Encrypted IndexedDB ledger                               │
│    - Startup reconciliation + outbox                          │
│    - FX via Bull Bitcoin anonymous rates API                  │
│    - Uses: lwk_wasm (watch-only), liquidjs-lib (claim sign),  │
│            boltz-core 4.x, nostr-tools + rx-nostr,            │
│            idb + Web Crypto AES-GCM, coi-serviceworker (opt)  │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
 Liquid Esplora / Electrum   Boltz API            Bolt Card LNURL-w
 (watch + broadcast)         (reverse swap)       (card service)
```

No dynamic Bull backend is required. Static hosting options:

```text
https://pos.example/#/pos/naddr1...
https://pay.bullbitcoin.com/#/pos/naddr1...
https://merchant.example/pos/#/pos/naddr1...
IPFS mirror
local PWA install
```

If `pay.bullbitcoin.com` goes offline but the PWA is already installed or mirrored, the POS profile remains usable with relays and payment backends.

---

## 6. Technology Stack

### 6.1 Frontend — Svelte 5 + Vite, NOT SvelteKit

**Decision:** the PWA is built on **Svelte 5 (runes) + Vite + `vite-plugin-pwa` + `svelte-spa-router`**. SvelteKit is explicitly rejected — nothing on the critical path uses SSR, server routes, hooks, form actions, or `+page.server.ts`, so `adapter-static` + hash routing is pure ceremony that produces a worse PWA install story.

Required:

```text
Svelte 5 (runes-based reactivity)
Vite
vite-plugin-pwa (service worker + manifest)
svelte-spa-router (client-side hash routing)
TypeScript (strict)
Tailwind CSS
IndexedDB (via idb)
Web Crypto
Web NFC (Android Chrome only)
QR generation (qrcode or qr-creator)
canvas-confetti
```

Recommended UI primitives:

```text
bits-ui (headless accessible)
lucide-svelte (icons)
```

Recommended app mode:

```text
static build output
SPA hash routing
PWA installable shell
client-only critical payment flow
```

### 6.2 Nostr

**Terminal (TypeScript):**

```text
nostr-tools          (signing, NIP-44 v2, NIP-59 gift wrap, NIP-19 bech32)
rx-nostr             (relay pool with per-relay OK observability)
```

**Controller (Dart):**

```text
ndk                  (pub.dev, v0.8.1) — primary relay pool + gossip
dart_nostr           (event construction helpers if NDK ergonomics gap)
```

Phase 1 audits required:
- Confirm NDK's gift-wrap uses NIP-44 v2 (not NIP-04). Source-level check.
- Confirm `lwk` (Dart) exposes PSET claim-tx construction at the Dart API level (not just the underlying Rust LWK).

### 6.3 Liquid

**Terminal:**

```text
lwk_wasm (v0.14.1+)       — CT descriptor parsing + address derivation (watch-only)
liquidjs-lib              — claim tx construction + CT blinding/unblinding (the signing seam)
Esplora / Electrum client — UTXO watcher + broadcast
```

The seam between `lwk_wasm` (watch-only) and `liquidjs-lib` (claim tx building) is the main integration risk in the PWA. Bridge carefully.

**Controller:**

```text
lwk (Dart, pub.dev, maintained by Bull Bitcoin)
  — CT descriptor, address derivation, PSET sign + blind, claim tx build
```

### 6.4 Swaps

**Terminal (full Boltz reverse-swap lifecycle):**

```text
boltz-core v4.0.3 (npm, official)
  — REST request construction
  — Taproot script / cooperative claim
  — preimage reveal
  — refund path
```

**Controller (claim-path only, hand-rolled ~1 week):**

```text
Poll GET /swap/<id>/status
On transaction.mempool / transaction.confirmed:
  - reconstruct claim from stored recovery record
  - build PSET via lwk (Dart)
  - broadcast via configured Liquid backend
```

No Dart Boltz SDK exists. The controller does not *create* swaps; it only *finishes* swaps whose recovery records were published by a terminal.

Provider interface (TypeScript, §11.5) is designed so the on-terminal swap logic is swappable later (non-Boltz providers, merchant self-hosted).

### 6.5 Bolt Card / NFC

Simple protocol, not a multi-week epic. Flow:

```text
1. Web NFC read NDEF message
2. Extract URL record
3. If URL starts with lightning: or is bech32 LNURL → decode
4. GET the LNURL-w URL  → receive { callback, k1, minWithdrawable, maxWithdrawable, ... }
5. GET `${callback}?k1=${k1}&pr=${swap_invoice}`
6. Card service pays the invoice → Boltz detects → terminal claims Liquid
```

Libraries / patterns:

```text
Web NFC (native browser API) — Android Chrome only
LNURL bech32 decoder (small utility, or nostr-tools bech32 helpers)
fetch() for the two HTTP calls
```

Bolt Card issuance is NOT a v1 deliverable. The POS only reads cards.

### 6.6 Printing

v1 scope:

```text
browser window.print()
dedicated receipt route
print CSS for 58mm thermal
print CSS for 80mm thermal
fallback A4 layout
save as PDF via browser
```

Deferred to v1.1+:

```text
WebUSB ESC/POS printers
Web Bluetooth ESC/POS printers
vendor-specific Android POS devices
printer setup wizard
default printer selection
```

### 6.7 FX rates — Bull Bitcoin anonymous API

**Endpoint (confirmed, v1 production):**

```text
POST https://www.bullbitcoin.com/api/price
Content-Type: application/json
```

**Auth:** anonymous (no cookies, no API key). Returns the public index price. Per-user pricing with group markup is an optional v1.1 feature.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid-or-timestamp>",
  "method": "getUserRate",
  "params": {
    "element": {
      "fromCurrency": "USD",
      "toCurrency": "BTC"
    }
  }
}
```

**Response (anonymous):**

```json
{
  "jsonrpc": "2.0",
  "id": "<echo>",
  "result": {
    "element": {
      "userPrice": 7905687,
      "userGroupMarkup": 0,
      "fromCurrency": "USD",
      "toCurrency": "BTC",
      "precision": 2,
      "price": 7925159,
      "priceCurrency": "USD",
      "indexPrice": 7773268,
      "createdAt": "2026-04-24T03:54:52.071Z"
    }
  }
}
```

**Price decoding:** `indexPrice` is units of `priceCurrency` per 1 BTC, scaled by `10^precision`. For `precision: 2, indexPrice: 7773268` → $77,732.68 per BTC. To convert ₡8,500 CRC to sats: call with `fromCurrency: "CRC"`, decode index, compute `sats = round((fiat_amount / decoded_index) * 100_000_000)`.

**Supported fiat (v1):** USD, CAD, EUR, CRC, MXN, ARS, COP.

**Caching:** 60s TTL + stale-while-revalidate. Background refresh every 30s when the terminal is in an active sale flow. The invoice's fiat amount is **frozen at invoice creation**; post-display rate movement is the customer's problem (retail standard).

**Failure behavior:** if the rates endpoint is unreachable on invoice creation, show a cashier-friendly error: "Could not get current exchange rate. Try again." Do NOT fall back to a stale rate older than 5 minutes for invoice creation.

### 6.8 Local storage

```text
idb (npm) — IndexedDB promise wrapper
Web Crypto AES-GCM — field-level encryption for sensitive rows
PBKDF2 600,000 iterations for PIN-derived key (OWASP 2026 guidance)
Non-extractable CryptoKey stored in IndexedDB (browser protects at rest)
```

Encryption scheme:

```text
1. On terminal activation, terminal generates a random 256-bit master key (M).
2. Cashier PIN (if enabled) → PBKDF2 → wrapping key (W).
3. W-wrapped M is stored in IndexedDB settings row.
4. Sensitive fields (swap claim keys, preimages, note text) are encrypted with M.
5. At startup, cashier enters PIN → unwrap M → decrypt rows lazily.
6. If PIN is disabled: M is generated once and stored non-extractably; device compromise =
   full terminal compromise (documented tradeoff for retail low-friction flow).
```

### 6.9 PWA

```text
vite-plugin-pwa            — service worker + manifest
coi-serviceworker (optional) — only if lwk_wasm requires SharedArrayBuffer
```

COOP/COEP gating: test on target Android tablet before committing to `coi-serviceworker`. If `lwk_wasm` runs single-threaded, skip it.

---

## 7. Functional Requirements

### 7.1 Merchant Controller Requirements

The merchant controller (Bull Wallet via `nostr_pos` Dart package, or `nostr_pos_cli` for dev/ops) must support:

```text
- create POS profile
- edit POS profile
- publish POS profile event
- manage default relay list
- select settlement wallet/account
- generate terminal-specific Liquid receive descriptor packages
- authorize terminals via pairing code (see §9.10)
- set terminal limits (default max_invoice_sat: 100_000)
- revoke terminals
- fetch gift-wrapped recovery events addressed to merchant recovery key
- decrypt recovery records
- verify payment settlement against Liquid backend
- finish claim for stranded Boltz swaps
- view sales history
- export CSV/JSON accounting data
```

### Merchant Setup Flow

```text
1. Merchant opens wallet (Bull Wallet or nostr_pos_cli).
2. Merchant selects "Create POS".
3. Merchant enters POS name, e.g. "Seguras Butcher".
4. Merchant selects settlement wallet/account.
5. Merchant selects accepted methods:
   - Liquid
   - Lightning via Boltz swap
   - Bolt Card
6. Merchant selects operating mode:
   - Maximum reliability (fast confirmations, optimistic)
   - Maximum privacy (slower confirmations, stricter)
7. Merchant reviews relays (default set pre-filled):
   - wss://no.str.cr
   - wss://relay.primal.net
   - wss://nos.lol
8. Wallet publishes POS profile event.
9. Wallet displays POS URL (shareable link; "naddr" is never shown to the user).
10. Merchant opens POS URL on terminal device.
11. Terminal displays a pairing code, e.g. "4F7K-92XP".
12. Merchant enters pairing code in wallet.
13. Wallet resolves the terminal pubkey from the pairing discovery relay.
14. Wallet publishes terminal authorization event (encrypted to terminal).
15. Terminal polls, decrypts authorization, activates.
16. Cashier can now take sales.
```

### 7.2 POS Terminal Requirements

The POS PWA must support:

```text
- open POS profile from URL (naddr in URL but invisible as jargon to user)
- show public merchant/POS branding
- request terminal activation via pairing code
- store terminal key locally (encrypted at rest)
- unlock activated terminal on each launch
- accept custom amount payments (keypad)
- optional sale note
- optional flat discount (dollar amount off)
- show Liquid QR (BIP21)
- show Lightning QR via Boltz reverse swap
- read Bolt Card through Web NFC
- show payment state clearly
- play success sound
- trigger haptics where available
- show confetti on success
- print receipt (browser dialog)
- share receipt
- keep recent transactions sheet
- recover/resume pending payment attempts after refresh
- operate without any Bull server
```

### 7.3 Previous Transactions Sheet

The previous transactions sheet is a core requirement. It must be visible from the main cashier screen and payment screen.

Purpose:

```text
- cashier refreshes page and needs to know if last payment completed
- customer says they paid but POS screen changed
- network dropped mid-payment
- terminal crashed and reopened
- cashier needs to reprint receipt
```

#### Required UI

Bottom sheet on mobile/tablet:

```text
Recent Transactions
───────────────────
12:04  ₡8,500   Paid       Lightning   Receipt
11:58  ₡2,000   Settling   Bolt Card   Details
11:44  ₡5,300   Paid       Liquid      Receipt
11:39  ₡1,500   Expired    Lightning   Retry
```

Desktop/tablet optional split view:

```text
┌──────────────────────────────┬──────────────────────┐
│ Amount / keypad              │ Recent Transactions  │
│                              │                      │
│                              │                      │
│ [Charge]                     │                      │
└──────────────────────────────┴──────────────────────┘
```

Each transaction row opens a detail view:

```text
- sale ID (opaque, non-sequential to avoid info leakage)
- amount fiat
- amount sats / L-BTC
- method (Liquid / Lightning / Bolt Card)
- status timeline (human labels, never state-machine internals)
- Lightning invoice if applicable (collapsible "Technical details")
- Liquid address (collapsible)
- Boltz swap ID if applicable (collapsible)
- settlement txid (collapsible, linked to block explorer)
- receipt
- print/share/retry/recover actions
```

#### Required Data Merge

On app load, the transaction sheet must merge:

```text
- local IndexedDB sales
- local IndexedDB payment attempts
- local IndexedDB receipts
- Nostr payment status events (decrypted)
- Nostr receipt events (decrypted)
- encrypted recovery records visible to terminal
- Boltz status for unresolved swaps
- Liquid backend settlement status
```

Acceptance criteria:

```text
- After page refresh, the last 50 local transactions are visible within 500ms from IndexedDB.
- Unresolved transactions begin background reconciliation immediately.
- If a payment completed while the page was closed, status updates to Paid/Settled after reconciliation.
- If a swap is claimable, UI shows "Needs recovery" or automatically claims if possible.
- Cashier can reprint any completed receipt.
```

### 7.4 Receipt Printing Requirements

v1 implementation:

```text
- browser print dialog
- dedicated receipt route (/#/receipt/<sale_id>)
- print CSS for 58mm thermal receipt
- print CSS for 80mm thermal receipt
- fallback A4 layout
```

Receipt fields:

```text
- merchant name (e.g. "Seguras Butcher")
- POS name (e.g. "Counter 1")
- terminal name or ID (last 4 of terminal pubkey, never shown as "pubkey")
- receipt number (opaque)
- date/time (local timezone)
- cashier note if provided
- subtotal (flat — no line items in v1)
- discount (flat dollar off, if applied)
- total fiat amount
- sats / L-BTC amount
- exchange rate used
- payment method
- payment status
- settlement txid (short form)
- Lightning invoice hash or swap reference if applicable
- optional receipt verification QR (links to a public receipt event if merchant opts in)
```

Receipt actions:

```text
- print
- save as PDF through browser
- share
- copy receipt URL/event ID (Advanced only)
- reprint from transaction sheet
```

Future (deferred):

```text
- WebUSB ESC/POS
- Web Bluetooth ESC/POS
- printer setup wizard
- test print
- default printer selection
```

### 7.5 Success Feedback Requirements

On payment success:

```text
- large "Paid" success screen
- green success state
- confetti animation
- success sound
- vibration if supported
- amount and method summary
- print receipt CTA
- new sale CTA
```

Confetti must not block recovery/settlement logic. It is UI-only.

### 7.6 Keypad-Only POS Features (v1 scope)

v1 deliberately ships a keypad-only cashier experience. Full BTCPay-style catalog/cart features are in §18 and deferred to v1.1+.

v1 cashier features:

```text
- custom amount keypad
- optional sale note (single text field)
- optional flat discount (dollar amount off)
- Liquid QR
- Lightning QR
- Bolt Card tap
- payment status
- previous transactions
- receipt print/share
- offline/recovery warning
- sound/haptic/confetti feedback
```

v1 merchant/admin features (via Bull Wallet or CLI):

```text
- POS profile management
- relay settings (default set prefilled; editable in Advanced)
- Liquid backend settings (Esplora URL)
- swap provider settings (Boltz endpoint)
- Bolt Card toggle
- terminal enrollment (pairing code flow)
- terminal revocation
- terminal limits (max_invoice_sat)
- payment history
- CSV export
- recovery center
```

### 7.7 Acceptance performance targets

```text
- cold PWA cold-open to ready: < 2s on mid-range Android (2026 baseline)
- amount entry to QR visible (Liquid direct): < 500ms
- amount entry to QR visible (Lightning via swap): < 3s (dominated by Boltz create + 2 relay OKs)
- successful swap settlement to receipt: < 15s on typical Liquid blocks
- transaction sheet render from IndexedDB: < 500ms for 50 rows
- reconciliation completion after reload: < 10s for 10 open attempts
```

---

## 8. UX Requirements

### 8.1 Design Standard

The design bar is "Square-grade." The app must feel like a retail terminal first and a Bitcoin app second.

UX principles:

```text
- big tap targets (≥ 48px)
- fast amount entry
- minimal clutter
- no crypto jargon in cashier flow (see §8.9)
- clear payment method choices
- obvious status states
- fast recovery from uncertainty
- beautiful success feedback
- polished dark and light modes
```

### 8.2 Main Cashier Screen

Required elements:

```text
- merchant/POS name
- active terminal indicator
- amount display
- keypad (0-9, 00, ⌫)
- optional note button
- optional discount button
- charge button
- recent transactions sheet handle
- settings entry (gated)
```

Example layout:

```text
Seguras Butcher — Counter 1

₡ 0

[1] [2] [3]
[4] [5] [6]
[7] [8] [9]
[00] [0] [⌫]

[Add note]  [Discount]

[Charge]

Recent Transactions ▴
```

### 8.3 Payment Screen

Required elements:

```text
- amount
- merchant name
- method tabs/cards:
  - Lightning
  - Liquid
  - Tap Card (only shown if Web NFC supported)
- QR code
- copy payment data
- payment status (human labels per §8.6)
- cancel/expire controls
- recent transactions handle
```

Example:

```text
₡8,500

[Lightning]  [Liquid]  [Tap Card]

         ▓▓▓▓▓▓▓▓
         ▓▓ QR ▓▓
         ▓▓▓▓▓▓▓▓

Waiting for payment...

Recent Transactions ▴
```

### 8.4 Bolt Card Screen

Required states:

```text
- NFC supported                → "Tap Bolt Card"
- NFC not supported            → hidden; fall through to QR
- waiting for card             → "Hold the card near the back of this device."
- card detected                → "Card detected — requesting payment..."
- requesting payment           → spinner
- payment sent                 → success screen
- card declined                → "Card declined. Try another payment method."
- invoice expired              → "This sale expired. Start a new sale."
```

### 8.5 Activation Screen

New in v0.2 — replaces npub display with a human-readable pairing code.

```text
Activate this terminal

Open Bull Wallet on your phone, tap "Connect terminal",
and enter this code:

       4F7K-92XP

Waiting for approval... (30s)
```

- Code format: 8 alphanumeric characters, dash-separated. Derived from `first 4 bytes of terminal_pubkey` → crockford-base32 → uppercase.
- Code is a *hint* for the controller, not a secret. The controller verifies by looking up the full terminal pubkey on the pairing discovery relay (default: first of the default relay set).
- Never shown as "pubkey" or "npub."

### 8.6 Recovery / Status UX

Never hide ambiguous settlement states. Status labels shown to cashier:

```text
Ready
Waiting for payment
Payment detected
Settling
Paid
Needs recovery
Expired
Failed
```

Example messages:

```text
"Payment detected. Settling to Liquid..."

"This Lightning payment needs recovery. Keep this terminal online,
 or open Bull Wallet on the merchant's phone to finish."

"Recovered and settled."
```

Never:

```text
"0 of 2 relay OKs received"
"Decrypting gift-wrapped kind 9381..."
"Waiting for settlement event from merchant pubkey 3f..."
```

### 8.7 Admin UX

Admin controls do not clutter the cashier flow.

Admin areas (gated by PIN or merchant wallet authorization):

```text
- terminal status
- POS settings
- receipts history
- Settings → Advanced:
    - relay list + per-relay sync status
    - Liquid backend (Esplora URL)
    - swap provider (Boltz endpoint)
    - Bolt Card toggle
    - recovery center
    - export
    - terminal ID (truncated, read-only)
```

Admin access must require terminal unlock (PIN) or merchant wallet authorization event.

### 8.8 Cashier vs Admin authentication

```text
- Cashier (default): no PIN required to take sales. The terminal is considered
  "unlocked for cashiering" on activation until explicitly locked or revoked.
- Admin: optional 4–8 digit PIN set by merchant during activation. Required to
  access Settings → Advanced, view full terminal ID, or trigger data export.
- If PIN disabled: admin area is guarded by a confirmation dialog only. Documented
  as a reduced security posture suitable for low-risk environments.
```

### 8.9 Nostr-as-plumbing UX rule (hard requirement)

This is a **CI-enforced** design rule, not a soft guideline.

#### 8.9.1 Banned terms in user-facing copy

Never appear in the cashier flow, customer-facing screens, activation flow, receipt, transaction sheet, or any non-Advanced settings:

```text
nostr, Nostr, NIP (or NIP-01, NIP-44, etc.)
relay, relays
pubkey, public key (in crypto sense), npub
naddr, nevent, nprofile, nsec, note1
gift wrap, giftwrap
event, event id, kind
kind number (kind 30380, etc.)
encrypted event, signed event
```

#### 8.9.2 Terminology mapping

| Backend reality | User-facing copy |
|---|---|
| `naddr1...` URL | "POS link" |
| Relay OK threshold not met | "Could not safely prepare payment. Try again." |
| Terminal Nostr pubkey | "Terminal ID" (truncated, only in Advanced) |
| Decrypt gift-wrapped recovery event | "Finishing payment..." |
| Publish kind-9382 payment status | (silent — reflect as state change only) |
| Terminal activation via Nostr DM | "Pairing code: **4F7K-92XP**" |
| Revocation event observed | "Terminal removed by owner" |
| 2 of 3 relay OKs | "Synced to backup servers" (if ever shown) |
| Swap recovery record | "Payment backup" |
| Merchant recovery pubkey | "Merchant recovery key" (Advanced only) |

#### 8.9.3 Settings → Advanced exemption

The Advanced settings page (gated) **may** use technical terms — it is a debugging surface. Label the section "Advanced" (not "Nostr"). Example contents:

```text
Advanced

Sync servers (3 configured, 3 healthy)
  wss://no.str.cr            ✓ synced 14s ago
  wss://relay.primal.net     ✓ synced 22s ago
  wss://nos.lol              ✓ synced 18s ago
  [Add server]  [Remove]

Liquid backend
  https://blockstream.info/liquid/api

Swap provider
  https://api.boltz.exchange

Terminal ID
  npub1xyz...q8w (tap to copy)

Export
  [CSV]  [JSON]
```

#### 8.9.4 CI enforcement

PRs touching user-facing files fail CI if the grep check finds banned terms outside Advanced routes:

```bash
rg -iw '(nostr|relay|npub|naddr|nevent|pubkey|nip-|\bkind ?[0-9])' \
  src/routes src/lib/ui \
  --glob '!src/routes/settings/advanced/**' \
  --glob '!src/lib/ui/advanced/**'
# expected exit 1 (no matches)
```

A `.github/workflows/ui-copy-check.yml` enforces this.

---

## 9. Nostr Protocol Specification (v0.2 draft)

### 9.1 Event Kind Allocation

Use experimental/custom kinds initially. v1 targets:

```text
30380  POS Profile                     addressable, public
30381  Terminal Authorization          addressable, encrypted content to terminal
30382  Terminal Revocation             addressable, public
9380   Sale Created                    regular, encrypted in v1
9381   Swap Recovery Backup            gift-wrapped to recovery keys
9382   Payment Status                  regular, encrypted in v1
9383   Receipt                         regular, encrypted by default
9384   Claim Request                   gift-wrapped, v1.1
9385   Claim Proof                     regular, v1.1
9386   FX Rate Attestation             regular, v1.1 (not used in v1 — Bull API direct)
9387   Product Catalog                 addressable, v1.1
9388   Receipt Template                addressable, v1.1
```

Every event must include:

```json
["proto", "nostr-pos", "0.2"]
```

Events referencing a POS profile must include an `a` tag:

```json
["a", "30380:<merchant-controller-pubkey>:<pos_id>"]
```

### 9.2 POS Profile Event

Kind: `30380` (addressable).
Signed by: merchant controller key.
Purpose: publicly describes the POS profile and how compatible clients can load it.

Tags:

```json
[
  ["d", "<pos_id>"],
  ["proto", "nostr-pos", "0.2"],
  ["name", "Seguras Butcher"],
  ["merchant", "Seguras Butcher S.A."],
  ["method", "liquid"],
  ["method", "lightning_via_swap"],
  ["method", "bolt_card"],
  ["network", "liquid-mainnet"],
  ["relay", "wss://no.str.cr"],
  ["relay", "wss://relay.primal.net"],
  ["relay", "wss://nos.lol"],
  ["recovery_pubkey", "<merchant-recovery-pubkey-hex>"],
  ["claim_mode", "standard"],
  ["version", "0.2"]
]
```

Content:

```json
{
  "name": "Counter 1",
  "merchant_name": "Seguras Butcher",
  "description": "Retail butcher counter",
  "branding": {
    "logo_url": null,
    "theme": "default",
    "primary_color": null
  },
  "currency": "CRC",
  "methods": [
    { "type": "liquid", "asset": "L-BTC" },
    { "type": "lightning_via_swap",
      "settlement": "liquid",
      "providers": ["boltz"],
      "claim_mode": "standard" },
    { "type": "bolt_card",
      "settlement": "liquid",
      "providers": ["boltz"],
      "claim_mode": "standard" }
  ],
  "relays": [
    "wss://no.str.cr",
    "wss://relay.primal.net",
    "wss://nos.lol"
  ],
  "liquid_backends": [
    { "type": "esplora", "url": "https://blockstream.info/liquid/api" }
  ],
  "swap_providers": [
    { "id": "boltz-mainnet",
      "type": "boltz",
      "api_base": "https://api.boltz.exchange",
      "ws_url": "wss://api.boltz.exchange/ws" }
  ],
  "fiat_provider": {
    "type": "bull_bitcoin",
    "url": "https://www.bullbitcoin.com/api/price",
    "mode": "anonymous"
  },
  "public_receipts": false
}
```

The `claim_mode` field is the per-POS default. Terminal authorization may override per-terminal. Defaults to `"standard"` in v1; `"covenant"` is a reserved value implemented in v1.1.

Public profile must not include reusable private keys. It must not include global wallet descriptors unless the merchant intentionally publishes a public donation-style receive profile. Terminal-specific descriptor packages are delivered through encrypted terminal authorization events.

### 9.3 Terminal Authorization Event

Kind: `30381` (addressable).
Signed by: merchant controller key.
Recipient: terminal pubkey (encrypted to).
Purpose: authorizes a terminal to operate a specific POS with specific limits and a terminal-specific settlement descriptor branch.

Tags:

```json
[
  ["d", "<pos_id>:<terminal_pubkey>"],
  ["proto", "nostr-pos", "0.2"],
  ["a", "30380:<merchant-controller-pubkey>:<pos_id>"],
  ["p", "<terminal_pubkey>"],
  ["terminal", "<terminal_pubkey>"],
  ["expires", "<unix_timestamp>"]
]
```

Encrypted content (NIP-44 v2) to terminal:

```json
{
  "type": "terminal_authorization",
  "pos_ref": "30380:<merchant-controller-pubkey>:<pos_id>",
  "terminal_pubkey": "...",
  "terminal_name": "Counter 1",
  "pairing_code_hint": "4F7K-92XP",
  "network": "liquid-mainnet",
  "asset": "L-BTC",
  "settlement": {
    "type": "liquid_ct_descriptor",
    "ct_descriptor": "ct(slip77(...),elwpkh([.../84h/1776h/0h]xpub.../<terminal_branch>/*))",
    "descriptor_fingerprint": "...",
    "terminal_branch": 17,
    "lookahead": 1000
  },
  "limits": {
    "max_invoice_sat": 100000,
    "daily_volume_sat": 20000000,
    "allow_lightning": true,
    "allow_liquid": true,
    "allow_bolt_card": true
  },
  "claim_mode": "standard",
  "swap_providers": [
    { "id": "boltz-mainnet",
      "type": "boltz",
      "api_base": "https://api.boltz.exchange",
      "ws_url": "wss://api.boltz.exchange/ws",
      "supports_covenants": true }
  ],
  "liquid_backends": [
    { "type": "esplora", "url": "https://blockstream.info/liquid/api" }
  ],
  "merchant_recovery_pubkey": "<hex>",
  "expires_at": 1777600000
}
```

Notes:
- `limits.max_invoice_sat` default is **100,000 sats** (~$79 USD at scoping). This is the primary mitigation for the §15 standard-swap theft vector. Merchants may raise but should document risk.
- `pairing_code_hint` lets the terminal sanity-check that the authorization matches the code it displayed.
- `claim_mode` defaults to the POS profile value. Reserved for per-terminal override in v1.1.

### 9.4 Terminal Revocation Event

Kind: `30382` (addressable).
Signed by: merchant controller key.
Purpose: revokes a terminal authorization.

Tags:

```json
[
  ["d", "<pos_id>:<terminal_pubkey>"],
  ["proto", "nostr-pos", "0.2"],
  ["a", "30380:<merchant-controller-pubkey>:<pos_id>"],
  ["p", "<terminal_pubkey>"],
  ["revoked", "true"]
]
```

Content (public):

```json
{
  "reason": "merchant_revoked",
  "revoked_at": 1776990000
}
```

Terminals must check revocations on startup and subscribe for live updates. On observing a revocation, a terminal must:

```text
1. Stop accepting new sales immediately.
2. Finish any in-flight payment attempt with "Needs recovery" handoff.
3. Display "Terminal removed by owner."
4. Do NOT auto-destroy local data (merchant may want to reactivate).
```

### 9.5 Sale Created Event

Kind: `9380` (regular).
Signed by: terminal key.
Purpose: append-only record that a sale/payment request was created.

**v1 change:** content is **always NIP-44 v2 encrypted** to the merchant recovery pubkey, to avoid public leakage of sales cadence. v0.1's "optional encryption" is removed. Public sales metadata is available only via the optional public-receipt variant of kind 9383.

Tags:

```json
[
  ["proto", "nostr-pos", "0.2"],
  ["a", "30380:<merchant-controller-pubkey>:<pos_id>"],
  ["sale", "<sale_id>"],
  ["terminal", "<terminal_pubkey>"],
  ["method", "lightning_via_swap"]
]
```

Encrypted content:

```json
{
  "sale_id": "...",
  "created_at": 1776990000,
  "amount": {
    "fiat_currency": "CRC",
    "fiat_amount": "8500",
    "sat_amount": 16000
  },
  "note": null,
  "discount_fiat": null,
  "status": "created"
}
```

### 9.6 Swap Recovery Backup Event

Kind: `9381` inner event, gift-wrapped (NIP-59).
Signed by: terminal key for the inner event; ephemeral wrapper key for the seal.
Recipients: merchant recovery key + terminal key (two wraps).
Purpose: stores encrypted material needed to recover and claim a Lightning-to-Liquid swap.

**The POS must publish this event, receive ≥2 relay OKs, and write to IndexedDB before showing the Lightning invoice.** See §11.4.

Inner content:

```json
{
  "protocol": "nostr-pos",
  "version": 2,
  "type": "swap_recovery",
  "pos_ref": "30380:<merchant-controller-pubkey>:<pos_id>",
  "terminal_pubkey": "...",
  "sale_id": "...",
  "created_at": 1776990000,
  "expires_at": 1776993600,
  "amount": {
    "invoice_sat": 25000,
    "settlement_asset": "L-BTC",
    "settlement_amount_sat": 24850,
    "fiat_currency": "CRC",
    "fiat_amount": "12500"
  },
  "fiat_rate_source": "bull_bitcoin_index",
  "fiat_rate_at_swap": {
    "from": "CRC",
    "to": "BTC",
    "index_price": 40392851230,
    "precision": 2,
    "fetched_at": "2026-04-24T03:54:52Z"
  },
  "settlement": {
    "network": "liquid-mainnet",
    "descriptor_fingerprint": "...",
    "terminal_branch": 17,
    "address_index": 42,
    "address": "..."
  },
  "swap": {
    "provider": "boltz",
    "direction": "lightning_to_liquid",
    "swap_id": "...",
    "preimage": "...",
    "preimage_hash": "...",
    "claim_private_key": "...",
    "claim_public_key": "...",
    "swap_tree": "...",
    "redeem_script": "...",
    "timeout_block_height": 123456,
    "boltz_response": {}
  },
  "claim": {
    "mode": "standard",
    "preimage_revealed": false,
    "claim_tx_hex": null,
    "claim_txid": null
  }
}
```

New in v0.2:
- `fiat_rate_source` + `fiat_rate_at_swap` so post-recovery receipts reconstruct faithful fiat amounts even if the controller is offline at recovery time.
- `claim.mode` is `"standard"` in v1. `"covenant"` reserved.

### 9.7 Payment Status Event

Kind: `9382` (regular, NIP-44 encrypted in v1).
Signed by: terminal key, merchant wallet key, or authorized controller key.
Purpose: append-only status update for sale/payment lifecycle.

Tags:

```json
[
  ["proto", "nostr-pos", "0.2"],
  ["a", "30380:<merchant-controller-pubkey>:<pos_id>"],
  ["sale", "<sale_id>"],
  ["terminal", "<terminal_pubkey>"],
  ["status", "settled"]
]
```

Encrypted content:

```json
{
  "sale_id": "...",
  "status": "settled",
  "method": "lightning_via_swap",
  "updated_at": 1776990100,
  "payment": {
    "boltz_swap_id": "...",
    "settlement_txid": "...",
    "settlement_vout": 0
  }
}
```

Clients must treat status events as claims, not truth. Always verify settlement independently against the Liquid backend before marking a sale as `settled` in merchant-facing views.

### 9.8 Receipt Event

Kind: `9383` (regular).
Signed by: terminal key or merchant key.
Purpose: final sale receipt.

Encrypted by default; merchant can enable a minimal public variant for donation / event use cases.

Content (encrypted form):

```json
{
  "receipt_id": "...",
  "sale_id": "...",
  "created_at": 1776990200,
  "merchant_name": "Seguras Butcher",
  "pos_name": "Counter 1",
  "amount": {
    "fiat_currency": "CRC",
    "fiat_amount": "8500",
    "sat_amount": 16000
  },
  "method": "lightning_via_swap",
  "status": "settled",
  "settlement_txid": "...",
  "note": null,
  "discount_fiat": null
}
```

### 9.9 Claim Request / Claim Proof (v1.1, reserved)

Kinds `9384` and `9385` reserved for the future covenant-mode claim agent flow. Not implemented in v1.

### 9.10 Pairing code flow (new in v0.2)

Problem: activation must not expose pubkeys/npubs to the cashier. Solution: a short, human-readable pairing code derived from the terminal pubkey.

Algorithm:

```text
pairing_code(terminal_pubkey):
  bytes = first 5 bytes of terminal_pubkey (hex-decoded)
  b32 = crockford-base32(bytes)              # 8 chars
  return b32[0:4] + "-" + b32[4:8]           # e.g. "4F7K-92XP"
```

5 bytes → 40 bits → 8 crockford-base32 chars. Collision probability: 1 in 2^40 across the relay set; acceptable.

Discovery protocol:

```text
1. Terminal generates its Nostr keypair, displays pairing code.
2. Terminal publishes a transient "pairing announcement" event (kind 30383, addressable,
   `d` tag = pairing code) to the first relay in the default set ("pairing discovery relay").
   - Tags: ["pairing", "<pairing_code>"], ["p", "<terminal_pubkey>"]
   - Expires after 5 minutes.
3. Merchant enters pairing code in controller UI.
4. Controller queries the discovery relay for { kind: 30383, #pairing: [code] } and resolves
   the full terminal pubkey from the `p` tag.
5. Controller presents the merchant: "Terminal wants to pair: Terminal ID ending in ...xyz.
   Approve?"
6. On approval, controller publishes a kind-30381 terminal authorization encrypted to
   the terminal pubkey.
7. Terminal, polling for `#p` = its pubkey, receives the authorization and activates.
8. Terminal deletes its pairing announcement (publishes a kind-5 deletion).
```

Kind `30383` (Pairing Announcement) added to the v0.2 kind allocation.

---

## 10. Liquid Settlement Design

### 10.1 Descriptor Strategy

Use terminal-specific Liquid receive descriptor branches.

Rationale:

```text
- no global address index coordination required
- terminals can derive addresses offline/local-first
- merchant wallet knows authorized branches and can scan them
- compromised terminal does not expose main wallet spend keys
```

Example conceptual tree:

```text
POS root account (merchant-controlled spend key)
  terminal branch 17
    address index 0
    address index 1
    ...
  terminal branch 18
    address index 0
    ...
```

Each terminal authorization includes a terminal-specific CT watch-only descriptor (no spend key).

### 10.2 Address Derivation

For each sale:

```text
1. terminal reads local next_address_index for its branch
2. terminal derives Liquid confidential address from CT descriptor via lwk_wasm
3. terminal atomically increments local index and persists the sale record
4. sale record stores (terminal_branch, address_index, address)
5. merchant controller scans authorized terminal branches during reconciliation
```

### 10.3 Multi-tab / single-writer safety

Only one tab/window per terminal key may be live. Enforcement:

```text
- BroadcastChannel("nostr-pos:<terminal_pubkey>") on load
- On open: send "claim" with timestamp
- If another tab responds "claim" within 200ms with later timestamp, downgrade to read-only
- Show "Terminal open in another tab. Close others to take sales."
```

Prevents address-index double-spend and duplicate sale ID assignment.

### 10.4 Liquid Direct Payment Flow

```text
1. Cashier enters amount.
2. Terminal creates sale record (IndexedDB).
3. Terminal derives fresh Liquid address.
4. Terminal publishes Sale Created event (encrypted).
5. Terminal shows Liquid QR/BIP21.
6. Terminal watches Liquid backend (Esplora polling or Electrum subscription).
7. Payment detected.
8. Terminal verifies asset == L-BTC and amount_sat >= expected_sat.
9. Terminal marks Paid/Settled according to confirmation policy.
10. Terminal publishes Payment Status and Receipt events.
```

### 10.5 Confirmation Policy

Configurable per POS profile:

```text
Fast mode (default for retail low-value):
  mark paid when valid mempool transaction is detected and amount matches

Strict mode:
  mark paid only after ≥1 block confirmation

Conservative mode:
  mark paid after ≥2 block confirmations
```

v1 default is **Fast mode** with clear risk labeling in Settings. Seguras Butcher's pilot runs in Fast mode.

### 10.6 Overpayment / underpayment

```text
Overpayment: accept. Receipt notes actual received amount. No refund logic in v1.
Underpayment: stay in "Waiting for payment" until either top-up arrives or invoice expires.
  If total received < expected at expiry, mark "Failed" and record partial receipt.
```

---

## 11. Lightning via Swap Design

### 11.1 Default Direction

```text
Customer pays BTC Lightning
Merchant settles L-BTC on Liquid
Direction: BTC Lightning -> L-BTC Liquid (Boltz reverse swap)
```

### 11.2 Mode Selection: Standard in v1

**Decision (locked):** v1 defaults to **standard reverse swap mode** (`claim_mode: "standard"`).

Risk: a compromised terminal holds the preimage and claim key. Between preimage reveal and claim tx broadcast, a compromised terminal can redirect funds to an attacker address.

Mitigations:
- **Per-terminal `max_invoice_sat` cap** (default 100,000 sats). Bounds loss per compromise.
- **Daily volume cap** (default 20M sats / ~$15,800 USD at scoping).
- Merchant can lower caps or revoke terminals at any time.
- Settings → Advanced surfaces the mode and caps plainly.

Covenant mode (`claim_mode: "covenant"`) is a v1.1 toggle. POS profile and terminal authorization schemas already carry the field; flipping to covenant will not require a protocol bump.

### 11.3 Standard Reverse Swap Flow

```text
1. Terminal derives Liquid settlement address (for its authorized branch).
2. Terminal generates preimage (32 random bytes).
3. Terminal generates claim keypair.
4. Terminal requests reverse swap from Boltz with (invoice_sat, preimage_hash, claim_public_key).
5. Boltz returns swap_id, invoice, redeem_script, timeout_block_height.
6. Terminal verifies:
   - invoice amount matches request
   - redeem script commits to our preimage_hash and claim pubkey
   - timeout is acceptable (> 10 min)
   - fees within policy
7. Terminal creates swap recovery record.
8. Terminal writes recovery to IndexedDB (encrypted).
9. Terminal publishes gift-wrapped recovery event to all configured relays.
10. Terminal waits for ≥2 relay OKs.
11. Terminal shows Lightning invoice QR.
12. Customer pays.
13. Boltz locks L-BTC to HTLC script on Liquid.
14. Terminal subscribes to Boltz WS for swap status.
15. On transaction.mempool / transaction.confirmed, terminal builds cooperative claim tx
    (via liquidjs-lib) and broadcasts to settlement address.
16. Terminal watches its Liquid backend for the claim tx.
17. On settlement tx seen, terminal publishes Payment Status (settled) and Receipt events.
```

### 11.4 Recovery Durability Rule (hard invariant)

```text
Never show a Lightning invoice until:
  1. Recovery record is durably written to IndexedDB.
  2. Gift-wrapped recovery event has received ≥2 relay OKs from the configured relay set.
```

If either fails:

```text
- do not show invoice
- show: "Could not safely prepare Lightning payment. Try again."
- offer "Use Liquid instead" fallback
```

Default durability threshold: `2 of N relay OKs` where N ≥ 2. If only 1 relay configured, fail safely ("Add a backup sync server to use Lightning").

### 11.5 Swap Provider Abstraction

```ts
interface SwapProvider {
  id: string;
  getLimits(pair: SwapPair): Promise<SwapLimits>;
  createReverseSwap(req: ReverseSwapRequest): Promise<ReverseSwapResponse>;
  subscribeSwap(id: string): AsyncIterable<SwapStatus>;
  getSwapStatus(id: string): Promise<SwapStatus>;
  verifySwap(response: ReverseSwapResponse, expected: ExpectedSwap): VerificationResult;
  buildClaimTx(ctx: ClaimContext): Promise<ClaimTransaction>;
  broadcastClaimTx(txHex: string): Promise<string>;
  supportsClaimCovenants(): boolean;
}
```

v1 implementation: `BoltzReverseSwapProvider`. Future: other providers, merchant self-hosted swap service, federation-based provider.

### 11.6 State gap handling

```text
- swap provider offline mid-claim: terminal retries with exponential backoff,
  surfaces "Finishing payment..." for up to 10 minutes, then "Needs recovery"
- claim tx stuck in mempool: after 30 min, RBF with higher fee (retaining the same
  outputs). Controller recovery path does the same on resume.
- Boltz returns "invoice.failed" (customer didn't pay): mark Expired, keep recovery
  record for audit but mark claim.expired = true
- customer overpays invoice: cannot happen on Lightning (fixed-amount invoice).
- customer's Lightning payment arrives after invoice expiry: Boltz refunds them,
  swap closes unsettled. Terminal marks Expired.
- preimage_revealed + claim_broadcast not seen (dangerous state): terminal MUST
  persist claim_tx_hex to IndexedDB and to the swap recovery record before
  network broadcast. On reload, resume broadcast.
```

---

## 12. Bolt Card Support

### 12.1 Platform Constraint

Web NFC availability gates the feature:

```text
Target:    Android Chrome PWA
Excluded:  iOS Safari (Web NFC unavailable) — fall through to QR
Excluded:  desktop browsers — fall through to QR
```

### 12.2 Payment Flow

```text
1. Cashier enters amount and selects "Tap Card".
2. Terminal creates Boltz reverse swap (same §11.3 flow up through step 11).
3. Terminal shows "Tap Bolt Card" prompt; begins Web NFC NDEF read.
4. Card presents NDEF message containing a URL record.
5. Terminal extracts URL:
   - if scheme == "lightning:" → strip prefix
   - if starts with bech32 "LNURL1..." → decode to raw URL
6. GET the LNURL-w URL → { callback, k1, minWithdrawable, maxWithdrawable, ... }
7. Validate minWithdrawable ≤ invoice_msat ≤ maxWithdrawable.
8. GET `${callback}?k1=${k1}&pr=${swap_invoice}`
9. Card service pays the Lightning invoice.
10. Boltz detects payment, locks Liquid HTLC.
11. Terminal builds and broadcasts claim tx.
12. Success screen + confetti + receipt print.
```

### 12.3 Error Handling

```text
- NFC unsupported           → hide tab entirely, fall through to QR
- NFC permission denied     → "Bolt Card requires NFC permission. Enable in
                               browser settings or use QR."
- no NDEF message           → "Card not recognized. Try again or use QR."
- invalid LNURL             → "This card isn't a Bolt Card. Try another
                               payment method."
- card service unreachable  → "Card service is offline. Try again or use QR."
- card declined             → "Card declined. Try another payment method."
- amount out of bounds      → "This card can't pay this amount."
- invoice expired           → "This sale expired. Start a new sale."
- swap failed               → standard Lightning error handling
```

All errors must surface a "Use QR Instead" action.

### 12.4 Out of Scope

- Bolt Card issuance / management (v1 reads cards only).
- PIN-protected Bolt Cards (future).
- Counter / replay protection logic (trust the card service's state).

---

## 13. Local Storage and Recovery

### 13.1 IndexedDB Database

Single database per origin: `nostr-pos`. Schema version starts at 1.

Stores:

```text
terminal_config       (id, encrypted_master_key, pairing_code, terminal_pubkey,
                       terminal_privkey_enc, pos_ref, authorization, activated_at)
sales                 (id, pos_ref, amount_fiat, fiat_currency, amount_sat,
                       note, discount_fiat, status, created_at, updated_at,
                       active_payment_attempt_id)
payment_attempts      (id, sale_id, method, status, liquid_address,
                       address_index, terminal_branch, lightning_invoice,
                       boltz_swap_id, settlement_txid, created_at, updated_at,
                       expires_at)
swap_recovery_records (sale_id, payment_attempt_id, swap_id,
                       encrypted_local_blob, nostr_event_ids[],
                       local_saved_at, relay_saved_at, expires_at,
                       claim_tx_hex, claim_txid, status)
receipts              (id, sale_id, printed_at, event_id)
nostr_outbox          (id, event_json, target_relays[], attempts, last_tried_at,
                       ok_from[], last_error)
relay_status          (url, last_connected_at, last_ok_at, last_error)
audit_log             (id, ts, actor, action, detail_enc)
settings              (key, value)
```

### 13.2 Data Models

#### Sale

```ts
type Sale = {
  id: string;              // opaque ULID
  posRef: string;
  terminalPubkey: string;
  createdAt: number;
  updatedAt: number;
  amountFiat?: string;     // decimal string, e.g. "8500"
  fiatCurrency?: string;
  amountSat?: number;
  note?: string;
  discountFiat?: string;
  status: SaleStatus;
  activePaymentAttemptId?: string;
};
```

#### Payment Attempt

```ts
type PaymentAttempt = {
  id: string;
  saleId: string;
  method: 'liquid' | 'lightning_swap' | 'bolt_card';
  status: PaymentStatus;
  liquidAddress?: string;
  addressIndex?: number;
  terminalBranch?: number;
  lightningInvoice?: string;
  boltzSwapId?: string;
  settlementTxid?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
};
```

#### Swap Recovery Record

```ts
type SwapRecoveryRecord = {
  saleId: string;
  paymentAttemptId: string;
  swapId: string;
  encryptedLocalBlob: string;   // AES-GCM of the full §9.6 inner content
  nostrEventIds: string[];
  localSavedAt: number;
  relaySavedAt?: number;        // first OK-from-≥2 timestamp
  expiresAt: number;
  claimTxHex?: string;          // set BEFORE broadcast
  claimTxid?: string;
  status: RecoveryStatus;       // pending | claimable | claimed | failed | expired
};
```

### 13.3 Startup Reconciliation

On every app start:

```text
1. load terminal config
2. load recent local sales (last 50) immediately — render tx sheet
3. connect to configured relays via rx-nostr pool
4. fetch POS profile and terminal authorization
5. check terminal revocation — if revoked, lock UI
6. fetch payment status / receipt events for open sales
7. fetch gift-wrapped recovery events addressed to terminal
8. merge records by sale_id / payment_attempt_id / swap_id
9. query swap provider for unresolved swaps (GET /swap/<id>/status)
10. query Liquid backend for unresolved settlement txs
11. resume claim if safe (claim_tx_hex present but not confirmed)
12. update transaction sheet with reconciled statuses
13. publish missing outbox events
14. start live subscriptions for open sales
```

### 13.4 Recovery Center (Settings → Advanced)

Terminal recovery center:

```text
- pending swaps (count, total sats at risk)
- claimable swaps (action: "Finish claim")
- expiring soon (within 1 hour of timeout_block_height)
- failed claims (action: "Retry" or "Hand off to merchant")
- relay backup status (per-relay sync time)
- local database backup status
- export all recovery records (encrypted JSON, for offline merchant recovery)
```

Merchant wallet recovery center (Bull Wallet / CLI):

```text
- POS profiles (list)
- authorized terminals per POS
- pending swaps from decrypted gift-wrapped recovery records
- claimable swaps (action: "Claim to settlement wallet")
- expiring swaps
- Recover all button
- Revoke terminal button
```

---

## 14. Payment State Machine

Use explicit state machines. Avoid ad-hoc booleans.

### 14.1 Sale State

```text
idle → amount_entered → sale_created → payment_preparing → payment_ready
     → payment_detected → settling → settled → receipt_ready

terminal states: expired, failed, needs_recovery, cancelled
```

### 14.2 Lightning Swap State

```text
swap_not_created → swap_created → recovery_local_saved → recovery_relay_saved
→ invoice_shown → invoice_paid → lockup_seen → claim_prepared → claim_broadcast
→ settlement_seen → settlement_confirmed → receipt_final

terminal states: expired, failed, needs_recovery
```

### 14.3 Dangerous States

**Preimage-revealed-but-claim-not-confirmed** is the critical danger state. Mitigations:

```text
- MUST persist claim_tx_hex to IndexedDB AND to the Nostr recovery record
  BEFORE broadcast.
- If broadcast fails, terminal retries on reconnect.
- If terminal crashes, controller recovery path completes the claim from the
  persisted claim_tx_hex or rebuilds it from recovery record material.
- max_invoice_sat cap bounds blast radius per compromised terminal.
```

### 14.4 Status Labels for Cashier

Map technical states to user-facing labels:

```text
Ready                     (idle | amount_entered)
Waiting for payment       (payment_ready | invoice_shown)
Payment detected          (payment_detected | invoice_paid | lockup_seen)
Settling                  (settling | claim_prepared | claim_broadcast)
Paid                      (settled | settlement_confirmed | receipt_ready)
Needs recovery            (needs_recovery — any swap stuck > 30s after payment detected)
Expired                   (expired)
Failed                    (failed)
```

---

## 15. Security Requirements

### 15.1 Threat Model

#### Merchant Wallet Compromise

Out of scope for POS protocol. Merchant seed compromise means full wallet compromise.

#### Terminal Compromise

A compromised terminal may:

```text
- create fake sales
- show wrong amount to cashier/customer
- steal in-flight standard reverse swaps (preimage + claim key)
- leak local payment metadata
```

Mitigations:

```text
- terminal limits (max_invoice_sat, daily_volume_sat) — primary mitigation
- terminal revocation (merchant can cut off instantly)
- terminal-specific descriptor branches (no merchant spend keys)
- covenant claim mode in v1.1 (eliminates in-flight theft vector)
- controller independent verification of settlement
- encrypted at rest (IndexedDB master key wrapped by PIN or non-extractable)
```

#### Relay Compromise

A relay may:

```text
- delete events
- refuse events
- serve stale events
- leak metadata (event timing, `p` tags)
- reorder events
```

A relay cannot:

```text
- forge signatures
- decrypt encrypted recovery records
- spend funds
```

Mitigations:

```text
- multi-relay replication (default 3 relays; 2-of-N OK threshold for recovery)
- local IndexedDB as primary source of truth
- event signature verification on every read
- latest-timestamp idempotent state
- gift wrapping for sensitive records
```

#### Swap Provider Misbehavior

A Boltz instance may:

```text
- give bad quote
- fail to lock funds after invoice paid
- overcharge fees
- become unavailable mid-swap
```

Mitigations:

```text
- verify swap scripts against locally-generated preimage_hash and claim pubkey
- verify amounts and fees against policy before showing invoice
- verify expiry is acceptable
- provider abstraction allows fallback (v1.1)
- clear failure states presented as "Needs recovery"
```

#### Browser Storage Loss

Mitigations:

```text
- encrypted Nostr recovery backups (primary)
- merchant wallet recovery (primary path for stranded swaps)
- terminal local export option (settings → advanced → export)
```

### 15.2 Key Handling

The terminal must never receive:

```text
- merchant seed
- merchant spend private keys
- merchant xprv of any kind
```

The terminal may receive:

```text
- terminal-specific watch-only Liquid CT descriptor
- terminal authorization (in terminal auth event, encrypted)
- local terminal private key (generated on-device, never leaves)
- swap-specific claim key material (generated per-swap)
- preimages (generated per-swap)
```

### 15.3 Encryption

- **NIP-44 v2** for all encrypted event content (verify NDK uses v2 in Phase 1 audit).
- **NIP-59 gift wrap** for recovery records. Gift wraps use ephemeral keys; inner seal is signed by terminal key; recipient `p` tags point to merchant recovery pubkey + terminal pubkey.
- **AES-GCM** (Web Crypto) for IndexedDB at-rest encryption.

Recovery records MUST be encrypted to:

```text
- merchant_recovery_pubkey
- terminal_pubkey
```

Optional (v1.1):

```text
- secondary merchant recovery key
- self-hosted recovery agent key
```

### 15.4 Invoice Display Safety

Before showing a Lightning invoice, the POS must verify:

```text
- terminal authorization is valid and not expired
- terminal is not revoked (check cache; fail open only if cache < 60s old)
- amount ≤ limits.max_invoice_sat
- settlement address derived from terminal's authorized branch
- Boltz swap response script commits to our preimage_hash and claim pubkey
- fees within policy (default: ≤ 2% of invoice_sat)
- expiry ≥ 10 min from now
- recovery record locally saved (IndexedDB fsync'd)
- gift-wrapped recovery event published with ≥2 relay OKs
```

For covenant mode (v1.1):

```text
- covenant output locks to settlement address/script
- asset/amount/address constraints verified
```

### 15.5 Privacy Requirements

Avoid public metadata where possible.

```text
- separate Nostr key per POS profile (merchant generates fresh per POS)
- separate key per terminal (terminal generates on first launch)
- Sale Created (9380) always encrypted in v1
- Payment Status (9382) always encrypted in v1
- Receipts (9383) encrypted by default; public opt-in for donation cases
- opaque sale IDs (ULID — sortable but not info-leaking)
- gift wrap for recovery records (hides both sender and content)
```

Residual leakage:

```text
- gift wrap recipient `p` tag still leaks "this pubkey received N sealed events today"
- relay-observable event timing leaks sales cadence to the relay operator
- public POS profile (30380) leaks that a merchant exists and accepts these methods

None of these are addressed in v1. Documented in threat model; acceptable for pilot.
```

---

## 16. No-Server Requirements

The system must not require:

```text
- Bull account server
- Bull API server for payments (rates API is read-only and optional)
- Bull hosted database
- Bull-operated relay
- Bull push notification service
```

The system may use:

```text
- static web hosting (any CDN, IPFS, local)
- public Nostr relays (default: wss://no.str.cr, wss://relay.primal.net, wss://nos.lol)
- self-hosted relays (merchant choice)
- merchant-chosen relays (override default)
- Boltz public API
- public Liquid Esplora / Electrum backends
- Bull Bitcoin rates API (anonymous; if unreachable, sale creation blocks with
  a clear error — no silent staleness beyond 5 minutes)
```

The app must be mirrorable and portable. If `pay.bullbitcoin.com` goes offline but the PWA is already installed or mirrored, the POS profile remains usable with relays and payment backends.

---

## 17. Frontend Implementation Plan

### 17.1 App Routes

Client-side hash routing via `svelte-spa-router`. No server routes. No SvelteKit.

```text
/                         Keypad / main cashier screen
/pos/:naddr               Entry after scanning/tapping a POS URL
/activate                 Pairing code display + poll loop
/receipt/:saleId          Receipt render (printable)
/settings                 Basic settings (merchant branding visible to cashier)
/settings/advanced        Relay list, Liquid backend, swap provider, exports,
                          recovery center, terminal ID
```

All routes served by the same `index.html`; hash routing (`/#/receipt/<id>`) for static-host compatibility.

### 17.2 Directory Structure

```text
apps/pos-pwa/
  index.html
  vite.config.ts            # includes vite-plugin-pwa
  svelte.config.js
  tailwind.config.ts
  tsconfig.json
  src/
    main.ts                 # mounts App.svelte, registers router + SW
    App.svelte              # svelte-spa-router <Router/> + global layout
    routes/
      Keypad.svelte         # "/"
      Pos.svelte            # "/pos/:naddr"
      Activate.svelte       # "/activate"
      Receipt.svelte        # "/receipt/:saleId"
      Settings.svelte       # "/settings"
      SettingsAdvanced.svelte # "/settings/advanced"
    lib/
      ui/
        Button.svelte
        Sheet.svelte
        Dialog.svelte
        Keypad.svelte
        AmountDisplay.svelte
        TransactionSheet.svelte
        TransactionRow.svelte
        ReceiptView.svelte
        StatusPill.svelte
        PaymentMethodTabs.svelte
        Confetti.svelte
        QrCard.svelte
        advanced/            # terminology-waived subtree
          RelayList.svelte
          TerminalIdCard.svelte
      pos/
        sale-machine.ts
        payment-state.ts
        receipt.ts
        reconciler.ts
      nostr/
        pool.ts              # rx-nostr wrapper
        events.ts            # signing/validation
        encryption.ts        # NIP-44 v2
        giftwrap.ts          # NIP-59
        outbox.ts            # retry queue
        filters.ts
      liquid/
        descriptor.ts        # lwk_wasm wrapper
        address.ts
        watcher.ts           # Esplora polling / Electrum WS
        claim.ts             # liquidjs-lib claim tx build
        esplora.ts
      swaps/
        provider.ts
        boltz.ts             # boltz-core wrapper
        recovery.ts
        claim-engine.ts
      nfc/
        web-nfc.ts
        bolt-card.ts
        lnurl.ts             # bech32 decode + withdraw flow
      fx/
        provider.ts
        bull-bitcoin.ts      # anonymous /api/price client
      db/
        schema.ts
        crypto.ts            # Web Crypto AES-GCM
        repositories/
          sales.ts
          payment-attempts.ts
          swap-recovery.ts
          receipts.ts
          outbox.ts
          settings.ts
        migrations.ts
      security/
        keys.ts
        policy.ts
      util/
        ulid.ts
        bech32.ts
        formatting.ts        # tabular fiat / sat formatting

packages/nostr_pos/          # Dart library (pub.dev)
  pubspec.yaml
  lib/
    nostr_pos.dart
    src/
      protocol/
        types.dart           # event schemas
        tags.dart
        kinds.dart
      events/
        pos_profile.dart
        terminal_auth.dart
        revocation.dart
        sale_created.dart
        swap_recovery.dart
        payment_status.dart
        receipt.dart
      crypto/
        nip44.dart
        giftwrap.dart
        signing.dart
      nostr/
        pool.dart            # NDK wrapper
        outbox.dart
      liquid/
        descriptor.dart      # lwk wrapper
        address.dart
        claim.dart
      boltz/
        claim_client.dart    # claim-only hand-rolled
      fx/
        bull_bitcoin.dart
      pairing/
        code.dart
        discovery.dart
  test/
    fixtures/                # JSON test vectors shared with TS side
  example/
    cli.dart

apps/nostr_pos_cli/          # thin CLI wrapper
  pubspec.yaml
  bin/nostr_pos.dart
  lib/commands/
    create_pos.dart
    auth_terminal.dart
    revoke.dart
    recover_swaps.dart
    list_sales.dart
    export.dart

packages/nostr-pos-protocol-spec/
  README.md                  # human-readable spec
  schemas/*.json             # JSON Schema per event kind
  test-vectors/*.json        # shared between Dart + TS test suites

infra/
  docker-compose.yml         # strfry relay + Elements regtest + Esplora
  scripts/
    seed-pos.sh
    run-e2e.sh
```

### 17.3 Design System

Tailwind tokens for:

```text
colors
spacing
typography
shadows
radii
motion
```

Required components:

```text
- primary button
- destructive button
- keypad button (≥ 64px tap target)
- amount display (tabular numerals, large)
- QR card
- payment method card
- bottom sheet
- status pill
- toast
- dialog
- receipt preview
- transaction row
- settings panel
```

Visual requirements:

```text
- large type for amount (tabular numerals)
- touch target ≥ 48px (keypad ≥ 64px)
- tablet-first layout (Android tablet is pilot hardware)
- dark and light modes
- high-contrast success/error states
- polished micro-animations (≤ 150ms)
```

### 17.4 Main Screens

#### Cashier Amount Screen

```text
- merchant/POS name header
- amount display
- keypad
- note button (optional)
- discount button (optional)
- charge button
- recent transactions handle
```

#### Payment Screen

```text
- amount
- merchant/POS name
- method tabs (Lightning / Liquid / Tap Card — Tap Card hidden if NFC absent)
- QR or NFC state
- status timeline (human labels)
- cancel/expire controls
- recent transactions handle
```

#### Success Screen

```text
- "Paid" large
- amount + method
- confetti animation
- [Print receipt]
- [New sale]
```

#### Transaction Detail Screen

```text
- sale summary
- payment method
- status timeline (human labels)
- "Technical details" expandable (shows naddr, event IDs, txid — this section
  is allowed to use advanced terminology)
- receipt actions
- recover/retry actions if applicable
```

---

## 18. Keypad-Only POS Features (v1 scope) + Deferred Catalog Features (v1.1)

### 18.1 v1 — Keypad only

Cart:

```text
- single custom amount (keypad entry)
- optional note (one text field)
- optional flat discount (dollar off)
```

Tips: **none** in v1. Cashier can add tip amount manually via keypad if desired.

Taxes: **none** in v1 (tax-inclusive pricing assumed).

### 18.2 v1.1 — Product Catalog (deferred)

Planned schemas (frozen now so v1 storage migrations don't break):

```ts
type Product = {
  id: string;
  name: string;
  priceFiat: string;
  currency: string;
  categoryId?: string;
  imageUrl?: string;
  active: boolean;
  sortOrder: number;
};

type Category = {
  id: string;
  name: string;
  sortOrder: number;
};
```

Storage: IndexedDB locally + kind-9387 addressable Nostr event (encrypted, syncable across devices). Not implemented in v1.

### 18.3 v1.1 — Tips, taxes, discounts (deferred)

Design reserved:

```text
- tip: percentage presets, fixed, custom
- tax: included, added, named service charge
- discount: flat (v1 has this), percent (v1.1)
```

---

## 19. Accounting and Export

### 19.1 Local Exports (v1)

```text
- CSV export
- JSON export
- receipts export (zipped HTML + PDFs)
```

Fields:

```text
- receipt number
- date/time
- sale ID
- terminal ID (truncated)
- amount fiat
- amount sats
- fx rate used at invoice creation
- method
- status
- settlement txid
- discount
- note
```

### 19.2 Nostr Receipts (v1)

Receipts signed and encrypted by default. Merchant may toggle:

```text
- private receipts only (default)
- public receipt proof with minimal metadata (opt-in; receipt event contains
  only receipt_id, merchant_name, settlement_txid)
```

Full public receipts with amount/fiat are a v1.1 option, not v1 default.

---

## 20. Error Handling

### 20.1 Common Errors

```text
- no relay connection                → "Couldn't reach backup servers."
- insufficient relay OKs             → "Could not safely prepare payment. Try again."
- terminal not authorized            → "This terminal hasn't been activated."
- terminal revoked                   → "Terminal removed by owner."
- swap provider unavailable          → "Lightning is temporarily unavailable. Use Liquid instead."
- swap quote expired                 → "Quote expired. Start a new sale."
- invoice expired                    → "This sale expired. Start a new sale."
- wrong amount paid (overpay)        → (accept, note on receipt)
- wrong amount paid (underpay)       → (stay pending)
- payment detected but claim failed  → "Payment received but needs to finish. Keep this terminal online or open the merchant wallet."
- Liquid backend unavailable         → "Can't verify Liquid payments right now."
- NFC unsupported                    → (Tap Card tab hidden)
- NFC permission denied              → "Bolt Card requires NFC permission."
- card read failed                   → "Card not recognized. Try again or use QR."
- receipt print failed               → "Couldn't open printer. Try saving as PDF."
- FX provider unavailable            → "Couldn't get current exchange rate. Try again."
```

### 20.2 Error UX

Every error should include:

```text
- short cashier-friendly explanation (no jargon)
- recommended action
- "Technical details" expandable (jargon allowed here)
- retry path when safe
```

Example:

```text
Could not safely prepare Lightning payment.
The payment backup wasn't synced to enough servers.

[Try Again]
[Use Liquid Instead]
[Technical details ▸]
```

---

## 21. Testing Plan

### 21.1 Unit Tests

```text
- event schema validation (Dart + TS, shared fixtures)
- Nostr tag parsing
- naddr encode/decode
- NIP-44 v2 encryption / decryption (cross-language: Dart encrypt → TS decrypt and vice versa)
- gift wrap handling
- terminal authorization validation
- revocation validation
- descriptor branch derivation
- sale state machine
- payment state machine
- receipt rendering
- amount formatting
- QR payload generation
- LNURL bech32 decode
- pairing code derivation
- FX rate decoding (precision handling)
```

### 21.2 Integration Tests

```text
- create POS profile
- authorize terminal via pairing code
- load POS from naddr URL
- create direct Liquid payment
- detect Liquid settlement
- create Lightning swap
- save recovery locally
- publish recovery to relays
- show invoice only after recovery saved (negative test: fail without 2 OKs)
- customer pays invoice (regtest)
- claim Liquid output
- publish receipt
- refresh page mid-payment
- recover after browser crash
- merchant controller recovery from Nostr record
- terminal revoked
- relay unavailable (graceful degradation)
- swap provider unavailable
- Bolt Card LNURL flow (mocked card service)
- multi-tab single-writer enforcement
```

### 21.3 End-to-End Regtest

Local environment:

```text
- strfry Nostr relay
- Elements/Liquid regtest
- Liquid Esplora / Electrum
- LND + CLN Lightning nodes
- Boltz regtest/dev setup
- POS PWA (dev server)
- nostr_pos_cli (merchant controller)
```

### 21.4 Security Tests

```text
- malicious relay replaying stale terminal authorization
- malicious terminal exceeding limits (rejected by controller on recovery)
- forged payment status event (signature mismatch → ignored)
- forged receipt event
- mismatched settlement address (Boltz returns wrong script → invoice NOT shown)
- recovery event missing fields (rejected)
- swap response tampering (preimage_hash mismatch → invoice NOT shown)
- local DB corruption (graceful reset with warning)
- duplicate sale IDs (ULID collision — effectively impossible, but test handler)
- duplicate address index (detected by controller scan → flagged)
```

### 21.5 UX Tests

```text
- cashier completes payment under 10 seconds once invoice is ready
- cashier can find last transaction after refresh
- cashier can reprint receipt
- cashier can recover from expired invoice
- cashier understands "Needs recovery" state (no crypto jargon visible)
- Bolt Card flow works on target Android Chrome tablet
```

### 21.6 CI Enforcement

```text
- unit + integration tests on every PR (Dart + TS)
- E2E regtest nightly
- UI copy grep check (see §8.9.4) on every PR touching frontend
- schema round-trip check: Dart-encoded event must parse in TS, and vice versa
- test vectors from protocol-spec package exercised by both libraries
```

---

## 22. Acceptance Criteria

### 22.1 Protocol Acceptance

```text
- POS profile published as addressable Nostr event (kind 30380)
- POS URL loads from naddr in compatible client
- Terminal authorization signed by merchant controller (kind 30381)
- Terminal revocation recognized by terminal (kind 30382)
- Sale/status/receipt events reconstructable from relays
- Recovery records encrypted, decryptable by merchant wallet
- All schemas match the protocol-spec package test vectors (Dart + TS cross-verified)
```

### 22.2 POS App Acceptance

```text
- App builds as static Svelte + Vite PWA
- App runs without dynamic server
- App loads POS profile from default relay set
- App supports terminal activation via pairing code (no npub shown)
- App accepts direct Liquid payment
- App accepts Lightning via Boltz reverse swap (standard mode)
- App supports Bolt Card tap on Android Chrome
- App shows previous transactions after refresh within 500ms
- App prints receipt
- App shows confetti on success
- App handles relay failure gracefully (degraded mode)
- CI grep check for banned UI terminology passes
```

### 22.3 Recovery Acceptance

```text
- Lightning invoice is never shown before recovery record saved locally + 2 relay OKs
- Refresh after invoice shown resumes the payment attempt
- Refresh after payment detected resumes claim
- Wiped terminal recoverable by merchant controller from Nostr recovery event
- Merchant controller can claim a claimable swap from recovery record
- Claim tx stuck in mempool > 30min is RBF'd (higher fee, same outputs)
```

### 22.4 Security Acceptance

```text
- Terminal never receives merchant seed or spend keys
- Terminal can only derive receive addresses for its authorized branch
- Terminal limits enforced locally (max_invoice_sat)
- Revoked terminal cannot create new valid sales after revocation observed
- Payment status events verified against Liquid backend before final settlement
  display in merchant wallet
- NIP-44 v2 encryption verified cross-language (Dart ↔ TS)
```

### 22.5 Performance Acceptance

See §7.7 targets. All must pass on the pilot hardware (target Android tablet — model TBD in Phase 1).

---

## 23. Implementation Roadmap (7 Phases)

**Total: ~14 weeks solo, ~8–10 weeks for two engineers.**

Phase re-ordering from v0.1: merchant controller claim-path moves from Phase 6 to Phase 5 because Phase 5's recovery acceptance criteria cannot be tested without controller tooling.

### Phase 1 — Protocol core + Dart foundations (2 weeks)

Deliverables:

```text
- packages/nostr-pos-protocol-spec/ — markdown spec + JSON Schemas + test vectors
- packages/nostr_pos/ (Dart) — event types, signing, NIP-44 v2, NIP-59 gift wrap, NIP-19
- NDK-based relay pool wrapper (audit: confirm NIP-44 v2 is the encryption primitive)
- lwk (Dart) audit — confirm claim-tx construction reachable from Dart API
- infra/docker-compose.yml — local strfry + Elements regtest + Esplora
- apps/nostr_pos_cli/ — create-pos, auth-terminal, revoke-terminal, publish, fetch
- docs/bullwallet-integration-conventions.md — survey of bullbitcoin-mobile/lib
  conventions (state management, DI, error handling) so the Dart library integrates
  naturally in v1.1
```

Exit criteria:

```text
- create POS profile event via CLI
- generate POS URL (naddr)
- fetch profile from relay
- authorize a terminal (pairing stub)
- validate authorization
- revoke terminal
- test vectors pass in CI
```

### Phase 2 — Svelte PWA shell + ledger + receipts (3 weeks)

Deliverables:

```text
- apps/pos-pwa/ — Svelte 5 + Vite + vite-plugin-pwa + Tailwind + bits-ui + svelte-spa-router
- design system components (keypad, amount, sheet, status pill, QR card)
- IndexedDB schema + idb wrapper + AES-GCM field encryption
- Repositories for all stores
- Transaction sheet with local-only data merge
- Receipt route + 58mm / 80mm / A4 print CSS
- Success screen with confetti + sound + haptics
- Fake sale harness for UX iteration without Nostr/Liquid
- UI copy grep check wired into CI
```

Exit criteria:

```text
- enter amount → fake sale → tx sheet → refresh → sale persists
- success screen with confetti
- print fake receipt (browser dialog)
- CI grep check passes
```

### Phase 3 — POS loading, pairing activation, relay layer (2 weeks)

Deliverables:

```text
- rx-nostr relay pool with per-relay OK observability
- /pos/:naddr route resolves profile
- terminal key generation + PIN-wrapped at rest
- pairing code flow (§9.10) end-to-end
- revocation watcher
- Settings → Advanced: relay list + per-relay sync status
```

Exit criteria:

```text
- pair a terminal with nostr_pos_cli end-to-end (no npub visible to cashier)
- unplug a relay → graceful degradation
- revoke from CLI → terminal locks + shows "Terminal removed by owner"
```

### Phase 4 — Liquid direct + Bull Bitcoin rates (2 weeks)

Deliverables:

```text
- Bull Bitcoin anonymous rates client (documented endpoint, §6.7)
- FxProvider interface + BullBitcoinFxProvider + 60s cache + SWR
- lwk_wasm descriptor parsing + address derivation
- Esplora watcher
- BIP-21 QR generation
- Fast mode confirmation policy
- Publish encrypted kind-9380 + 9382 on state changes
```

Exit criteria:

```text
- cashier enters ₡8,500 → sats computed from Bull rates → Liquid QR
- customer pays on regtest → status Paid
- receipt event published
- refresh mid-flow → resumes
```

### Phase 5 — Lightning via Boltz + controller claim-path (3 weeks)

Deliverables:

```text
- boltz-core wired (terminal side)
- liquidjs-lib claim tx builder
- Recovery pipeline: create → encrypt → persist IndexedDB → publish → wait 2 OKs → show invoice
- Swap status subscription (Boltz WS)
- Claim engine on terminal
- nostr_pos_cli recover-swaps command (controller-side claim from stranded records)
- State-machine gap handling (overpay, stuck claim, RBF, provider offline)
- Per-terminal invoice cap enforcement (local + controller)
```

Exit criteria:

```text
- Lightning sale on regtest completes end-to-end
- Refresh after invoice → resumes
- Refresh after customer pay → resumes claim
- Wipe terminal IndexedDB → CLI recovers stranded swap → funds land at settlement address
- Claim tx stuck test → RBF fires after 30 min (mocked time)
```

### Phase 6 — Controller history + export + polish (1 week)

Deliverables:

```text
- CLI: list-sales, export-csv, export-json, receipts
- Reconciliation against Liquid backend (not just Nostr trust)
- Terminal tx sheet merges encrypted Nostr status + receipt events
- Audit log view
```

Exit criteria:

```text
- merchant runs nostr_pos_cli list-sales after a day of sales
- CSV export matches Liquid backend totals
```

### Phase 7 — Bolt Card (1 week)

Deliverables:

```text
- Web NFC availability detection + permission flow
- NDEF reader → extract URL → bech32 decode
- LNURL-w flow (2 HTTP calls) → swap invoice
- Cashier-friendly error surface
- iOS/desktop fallthrough to QR with one-time toast
```

Exit criteria:

```text
- tap real Bolt Card on target Android tablet → swap invoice paid by card service
  → POS detects settlement → receipt prints
```

---

## 24. Open Questions — Resolved in v0.2

### 24.1 Resolved

| # | Question (v0.1) | Resolution (v0.2) |
|---|---|---|
| 1 | Exact Liquid CT descriptor serialization | Use LWK's canonical CT descriptor string format (matches Blockstream/lwk output). Test vectors in Phase 1. |
| 2 | Terminal branches inside CT descriptor vs protocol metadata | Inside CT descriptor (`<terminal_branch>/*`), with `terminal_branch` field redundantly in auth event for controller scanning. |
| 3 | Public receive descriptors in POS profile | **No** in v1. Encrypted delivery only. Donation/public receive reserved for v1.1. |
| 4 | Which kinds for formal NIP | Deferred to post-pilot. v1 uses experimental kinds 30380–30383, 9380–9388. |
| 5 | Receipt default: private or public proof | **Private by default.** Public minimal proof is opt-in. |
| 6 | Boltz default: standard or covenant | **Standard in v1** with hard per-terminal caps (default 100k sats). Covenant is a v1.1 toggle — schema slot (`claim_mode`) reserved now. |
| 7 | FX rate provider | **Bull Bitcoin anonymous API** (`https://www.bullbitcoin.com/api/price`, JSON-RPC, `indexPrice`). Supported: USD, CAD, EUR, CRC, MXN, ARS, COP. |
| 8 | Product catalog storage | **Deferred to v1.1.** Kind 9387 reserved. |
| 9 | Terminal activation: online-approval vs pre-signed tokens | **Online approval via pairing code** (§9.10). Pre-signed invitation tokens reserved for v1.1 (offline pairing). |
| 10 | Claim agents without trusted-server assumption | Deferred to v1.1 alongside covenant mode. Kinds 9384/9385 reserved. |
| 11 | Technical detail surfaced to cashiers | **Hidden behind "Technical details" expandable in transaction detail view.** Everything else uses human copy (§8.9). |
| 12 | Multi-asset Liquid beyond L-BTC | Deferred. Protocol schemas accept `asset` field; v1 hardcodes L-BTC. |
| 13 | Stablecoins on Liquid | Deferred. Same field accommodates it. |
| 14 | LNURL-pay customer flows | Deferred. v1 supports BOLT11 invoices + Bolt Card (LNURL-w) only. |
| 15 | Local LAN relay for unreliable internet | Deferred. Merchant can self-host and add to their relay list manually. |

### 24.2 Remaining open items (resolvable during Phase 1)

```text
- Pilot Android tablet model (affects NFC testing). Decision in Week 1 of Phase 1.
- Bull Bitcoin team contact for (a) rates API SLA + anonymous confirmation,
  (b) bullbitcoin-mobile integration review process, (c) existing Nostr work
  inside Bull (if any). Decision: establish channel during Phase 1.
- Relay operator: use default public relays (no.str.cr, primal.net, nos.lol)
  OR provision Bull-operated relays for better SLA. Decision: start with
  public default; revisit after Phase 5 based on "invoice only after 2 OKs"
  reliability observations.
```

---

## 25. Agent Implementation Instructions

### 25.1 Ordering

Proceed in this order:

```text
1. Read this PRD end-to-end before writing code.
2. Read docs/bullwallet-integration-conventions.md once it exists (Phase 1).
3. Create monorepo structure per §17.2.
4. Write the protocol-spec package first (schemas + test vectors).
5. Set up local Nostr relay + Elements regtest dev environment.
6. Build the Dart library (nostr_pos) + CLI skeleton in parallel with protocol spec.
7. Scaffold Svelte + Vite PWA with CI grep check wired from day one.
8. Build design system and cashier shell (Phase 2).
9. Implement IndexedDB ledger and transaction sheet.
10. Implement receipt rendering and print CSS.
11. Implement POS profile loading from naddr.
12. Implement terminal activation via pairing code.
13. Implement Liquid direct receive + Bull Bitcoin FX.
14. Implement swap provider interface.
15. Implement Boltz reverse swap with recovery durability rule.
16. Implement startup reconciliation and recovery engine.
17. Implement controller CLI recover-swaps command (Phase 5, not 6!).
18. Implement Web NFC + Bolt Card flow.
19. Add tests at every layer. Share test vectors across Dart and TS.
```

### 25.2 Non-negotiable rules

```text
- Never show a Lightning invoice before recovery is durably saved (§11.4).
- Never put merchant spend keys on the terminal.
- Never treat Nostr status events as final truth; verify Liquid settlement directly.
- Never surface Nostr jargon in cashier/customer UI (§8.9). CI grep check blocks PRs.
- Never add Bull-server dependencies. The rates API is the only Bull-origin call,
  is read-only, and must tolerate unavailability with a clear user-facing error.
- Always persist claim_tx_hex BEFORE broadcasting (§14.3).
- Always use NIP-44 v2 (not NIP-04) for encrypted content.
- Always verify event signatures on read.
- Always bound max_invoice_sat per terminal (default 100k sats).
```

### 25.3 Pre-Phase-1 prep

Before writing any code:

```text
1. Read github.com/SatoshiPortal/bullbitcoin-mobile source. Focus on:
   - lib/ structure and module boundaries
   - state management pattern (Bloc usage)
   - dependency injection approach
   - error handling / Result type conventions
   - existing integrations with lwk (if any — confirm current usage)
   - whether any Nostr code already exists (user says: no)
2. Write docs/bullwallet-integration-conventions.md summarizing what you found.
3. Verify Bull Bitcoin /api/price works anonymously (cookieless curl).
4. Pick pilot Android tablet model. Order one to test Web NFC.
5. Contact Bull Bitcoin team (if possible) for rates API SLA + integration review channel.
```

---

## 26. Definition of Done

v1 is done when:

```text
- a merchant controller (Bull Wallet via nostr_pos, or nostr_pos_cli) can
  create a POS profile and authorize a terminal via pairing code
- a static Svelte + Vite PWA can load the POS from the POS URL
- the terminal can accept Liquid direct payments using Bull Bitcoin rates
- the terminal can accept Lightning via Boltz reverse swap (standard mode)
  and settle to Liquid
- the terminal can accept Bolt Card payments on Android Chrome
- every payment appears in the transaction sheet within 500ms of page load
- refresh / crash recovery works at any point in any payment flow
- receipts can be printed (browser dialog, 58mm/80mm/A4 CSS)
- encrypted recovery events are published to the default relay set
- merchant controller can recover pending swaps from a wiped terminal
- no Bull server is required for core payment flow
- all critical flows have automated tests (unit + integration + regtest E2E)
- CI grep check for UI copy passes — no Nostr jargon in user-facing screens
- NIP-44 v2 encryption round-trips between Dart and TS
- Seguras Butcher pilot deployment completes one week of live sales without
  unresolved transactions
```

The final experience should feel like:

```text
Open POS URL
Enter amount
Show QR or tap card
Payment succeeds
Confetti
Print receipt
Recent transactions always available
Funds settle to merchant's Liquid wallet
No account, no custody, no server, no crypto jargon visible
```

---

## 27. Bull Wallet Integration (v1.1 — concrete milestone)

The Dart `nostr_pos` library is designed from day one for integration into `SatoshiPortal/bullbitcoin-mobile`. v1.1 ships the integration; v1 ships the CLI as proof.

### 27.1 v1.1 scope

```text
- Merge nostr_pos as a direct dependency into bullbitcoin-mobile/pubspec.yaml
  OR vendor it into bullbitcoin-mobile/packages/ if their monorepo policy prefers
- Add "POS" feature to Bull Wallet's UI alongside Recover Bull
  - "Create POS" flow (name, currency, methods, relays prefilled)
  - Terminal pairing screen (enter pairing code, approve)
  - Terminal list view (active / revoked, tap to revoke)
  - Sales history (merged from decrypted Nostr events + Liquid backend verification)
  - Recovery center (pending swaps, claimable swaps, one-tap "Recover all")
- Match bullbitcoin-mobile's:
  - Bloc state pattern
  - dependency injection (likely get_it / provider — verify in Phase 1)
  - routing conventions
  - theming / Material 3 usage
  - error surface (Result<T> or exception conventions)
- All long-running work on background isolates (already the case for lwk work
  in Bull Wallet; extend to Boltz claim polling and recovery scan)
```

### 27.2 Conventions alignment

Since `bullbitcoin-mobile` has no Nostr library today, the `nostr_pos` package will be the first Nostr integration. Consequences:

```text
- We choose the Nostr library (NDK + dart_nostr combination).
- Our choice becomes the de-facto Nostr stack for future Bull Wallet features.
- Pick libraries with long-term maintenance outlook, not just v1 convenience.
- Document the choice in bullwallet-integration-conventions.md.
```

### 27.3 Merge strategy

```text
- Open a single PR against bullbitcoin-mobile after v1 Seguras Butcher pilot ships
- PR body references this PRD + test vectors + protocol spec
- PR scope: add feature flag-gated POS module; does not change existing wallet surfaces
- Staged rollout: feature flag default off → enabled for Bull internal testers
  → enabled for opt-in users → GA
```

---

## 28. Pilot Deployment — Seguras Butcher

### 28.1 Context

Bull Bitcoin has hundreds of active merchants. **Seguras Butcher** is the chosen v1 pilot.

Selection rationale:

```text
- retail counter environment (matches primary persona §4.1 / §4.2)
- fiat: CRC (exercises non-USD FX path)
- volume sufficient to exercise multi-sale reconciliation but bounded (low blast radius)
- merchant owner is an existing Bull user (controller side is familiar territory)
```

### 28.2 Pilot scope

```text
- one POS profile: "Seguras Butcher"
- one terminal: Android tablet at counter (model chosen in Phase 1)
- methods enabled: Liquid, Lightning via swap, Bolt Card
- currency: CRC
- max_invoice_sat: 100_000 (default) — reconsider after first week of data
- relay set: default (no.str.cr, relay.primal.net, nos.lol)
- merchant controller: nostr_pos_cli initially; Bull Wallet integration in v1.1
```

### 28.3 Pilot success criteria

```text
- one week of live sales with zero unresolved transactions at end-of-day close
- at least one successful refresh-during-payment recovery
- at least one successful Bolt Card sale
- at least one successful controller recovery from terminal crash
- cashier reports the app "feels like Square" in informal feedback
- no Nostr terminology visible in any screen cashier interacts with
```

### 28.4 Pilot rollback plan

```text
- if critical bug: revoke terminal (instant via CLI) → merchant falls back to
  whatever PoS they used before
- if recovery fails: controller has full audit trail via CSV export + encrypted
  Nostr events on relays; manual recovery possible
- if Bull rates API goes down: sales blocked with clear error; merchant can
  revert to manual cash until resolved
```

### 28.5 Post-pilot checkpoints

```text
- Week 1: review transaction volume, error rate, reconciliation lag
- Week 2: decide on raising max_invoice_sat
- Week 3: decide on onboarding a second merchant
- Month 1: decide on v1.1 scope prioritization (Bull Wallet integration vs
  covenant mode vs product catalog)
```

---

## Changelog

- **v0.2 (2026-04-23)** — Locked decisions for implementation. Controller = Dart lib + CLI targeting `bullbitcoin-mobile`. Boltz standard mode with per-terminal caps; covenant reserved for v1.1. Bull Bitcoin anonymous `/api/price` for FX (USD/CAD/EUR/CRC/MXN/ARS/COP). Keypad-only v1 (no catalog/cart/tip/tax). Bolt Card stays. Stack: Svelte 5 + Vite (not SvelteKit). Nostr-as-plumbing UX rule with CI grep check. Pairing code activation (§9.10). Sale Created and Payment Status always encrypted. Recovery record adds `fiat_rate_*`. Phase 6 controller recovery merged into Phase 5. Default relays: no.str.cr, relay.primal.net, nos.lol. Pilot: Seguras Butcher. Open questions 1–15 resolved.
- **v0.1 (initial)** — First brief.

---

## Implementation Notes

This section is maintained during implementation so decisions, deviations, and
verification evidence stay close to the source of truth.

### 2026-04-23

- Initialized the repository after `git init`.
- Confirmed the Bull Bitcoin anonymous rates endpoint works without cookies or
  API keys for CRC/BTC:
  `POST https://www.bullbitcoin.com/api/price` returned an `indexPrice` with
  `precision: 2` and `priceCurrency: "CRC"`.
- Cloned `SatoshiPortal/bullbitcoin-mobile` for the Phase 1 integration survey.
  Findings are recorded in `docs/bullwallet-integration-conventions.md`.
- Implementation scope for this pass: create a working monorepo with protocol
  schemas/test vectors, Dart library + CLI foundations, and a static Svelte PWA
  with local ledger, recovery-safe simulated payments, receipts, UI copy checks,
  and automated tests. Real network payment adapters are kept behind interfaces
  so Boltz/Liquid/Nostr production wiring can replace the deterministic pilot
  adapters without changing cashier UX.
- Commit `537fd1f` created the protocol/controller foundation: protocol package,
  JSON schemas, test vectors, Dart SDK basics, CLI commands, CI workflow, and
  local infra scaffold.
- Commit `597c44a` created the Svelte 5 PWA foundation: installable Vite shell,
  keypad cashier screen, activation screen, receipt printing route, local
  IndexedDB transaction sheet, Bull Bitcoin FX helpers, encrypted local recovery
  blobs for simulated Lightning/Bolt Card attempts, confetti/haptics, Advanced
  diagnostics, and UI copy enforcement.
- Verification passed after this milestone:
  `npm run check && npm run test && npm run build`, `dart test` in
  `packages/nostr_pos`, and `dart analyze` in `apps/nostr_pos_cli`.
- Production network adapters still to replace deterministic pilot adapters:
  live relay pool + signing/encryption, LWK address derivation and Liquid
  watcher, Boltz reverse swap creation/claim/broadcast, and real Web NFC reads.
- Adjusted the cashier flow to match BTCPay-style keypad POS behavior:
  keypad → single Charge action → payment screen with Lightning QR selected by
  default, Liquid and Bolt Card as alternate tabs, and visible fiat amount, BTC
  amount, sats, and exchange rate. Recent transactions now open from a bottom
  button into a slide-up sheet instead of occupying the screen.
- Refined navigation after UX review: recent transactions now live on their own
  screen behind a history icon next to Settings. The payment screen rail selector
  is Lightning/Liquid only; Bolt Card is a Lightning-only action beside Copy.
- Added Phase 3/4/5 foundations: browser-generated terminal key material with
  shared pairing-code derivation, activation gate before cashier use, Dart event
  envelopes + local event store, CLI create/announce/authorize/revoke/list
  commands, deterministic Liquid receive derivation with address-index
  persistence, and a swap-provider abstraction with a mock Boltz reverse-swap
  adapter that verifies claim address/amount before exposing invoice data.
- Added local protocol outbox events for sale-created, payment-status, and
  receipt records, plus startup reconciliation that expires stale open attempts
  and records the status update. This is the IndexedDB side of the PRD's
  "transaction sheet after refresh" path; live relay merge remains the next
  adapter swap-in.
- Added controller-side accounting foundations: event-history merge for
  sale/status/receipt records, CSV/JSON export helpers, and CLI commands for
  `record-sale`, `list-sales`, and `export-sales`.
- Added Bolt Card utility foundations: NFC record URL extraction, LNURL-withdraw
  validation, invoice amount bounds checking, and callback payment request
  helper. The browser permission/read loop remains the final Android-tablet
  integration point.
- Added PWA admin export/recovery visibility: Advanced now shows payment backup
  and queued record counts, and can export local transaction history as CSV or
  JSON with tested CSV escaping.
- Added browser relay adapter foundations using `nostr-tools`: terminal keys are
  now real secp256k1 secret/public key pairs, events can be signed and verified,
  and publish results expose per-server OK counts for the recovery durability
  rule.
- Added signed outbox publishing, publishable recovery-backup records, queued
  pairing announcements from the activation flow, controller `recover-swaps`
  planning, and a Web NFC Bolt Card read loop wired to the LNURL-withdraw helper.
- Wired Liquid payment verification into the terminal state machine: startup and
  payment-screen reconciliation now poll the configured Esplora backend, settle
  detected direct Liquid payments, create receipts, and queue status/receipt
  records without relying on the local simulation button.
- Added a Settings → Advanced encrypted payment-backup export so a terminal can
  hand the merchant/controller a portable recovery JSON bundle even if relay
  sync or another device is unavailable.
- Added protocol schema validation in CI using JSON Schema test vectors for the
  POS profile, terminal authorization, sale-created, payment-status, receipt,
  and swap-recovery payloads.
- Added a pilot activation import path: the PWA can paste the controller/CLI
  approval JSON, verify it matches the displayed pairing code and terminal key,
  then store terminal limits, Liquid backends, and the authorization payload.
- Added a real relay smoke harness and ran it against the default relay set.
  After adding Node's WebSocket implementation and fixing OK classification,
  the probe published a signed kind-30383 pairing announcement to
  `wss://no.str.cr`, `wss://relay.primal.net`, and `wss://nos.lol`, then read
  it back by event id.
- Completed the sale-lifecycle handoff note: Charge now creates and persists
  the sale/payment attempt before navigation, the payment screen routes by
  sale id, and refresh resumes the existing attempt instead of creating a
  duplicate swap or ledger record.
- Integrated relays into pairing activation: the PWA now queues and immediately
  publishes the terminal approval request to the configured backup servers, and
  the Dart SDK/CLI can fetch that pairing announcement from relays by pairing
  code for controller authorization.
- Replaced the mocked Lightning recovery durability shortcut with real publish
  enforcement: Lightning/Bolt Card payment data is only returned after the
  encrypted recovery backup is written locally and receives at least two backup
  server confirmations; otherwise the attempt is failed before an invoice is
  shown.
- Added terminal-side approval discovery from relays: the activation screen now
  polls for matching terminal-authorization events, supports both plaintext
  CLI pilot payloads and NIP-44 encrypted payloads addressed to the terminal,
  validates the pairing code/key, saves the authorization, and enters the POS.
- Added terminal revocation sync: on cashier startup the PWA checks the
  configured backup servers for matching owner-removal events and locks the
  terminal before any new sale can be created.
- Added controller recovery relay fetch: recovery-backup events are tagged for
  the merchant recovery key when available, and `nostr_pos_cli recover-swaps`
  can merge local records with recovery records fetched from configured relays.
- Added real BIP-340 Schnorr signing/verification primitives to the Dart SDK so
  controller-generated events can move from placeholder local envelopes toward
  relay-acceptable signed events.
- Added Dart relay publishing and a `nostr_pos_cli publish-events` command so
  signed controller events in the local event store can be written to configured
  relays with per-relay OK reporting.
- Verified the Dart CLI relay write path live by publishing a signed kind-30380
  POS profile smoke event to all three default relays; each returned OK.
- Generalized controller relay reads: `nostr_pos_cli list-events` can now query
  configured relays by kind, author, `d` tag, or `p` tag, which covers POS
  profile fetches and other protocol event inspection.
- Added POS profile URL loading in the PWA: opening `#/pos/naddr...` or a
  `30380:<merchant-pubkey>:<pos-id>` coordinate resolves the public profile from
  relays, applies merchant name, POS name, fiat currency, relay list, and Liquid
  backend configuration locally, then continues to activation or the keypad.
- Added Dart NIP-19 POS-link support: the SDK now encodes/decodes `naddr`
  profile pointers against `nostr-tools` vectors, and `nostr_pos_cli pos-url`
  prints a ready-to-open `#/pos/naddr...` link for controller setup.
- Added Advanced admin gating: merchants can set a 4-8 digit PIN backed by
  PBKDF2-SHA256 (600k iterations), Advanced requires a short-lived session
  unlock before recovery/export tools, and no-PIN deployments show the required
  reduced-security confirmation.
- CI now runs `dart analyze` for the Dart SDK as well as the CLI so relay,
  signing, and recovery SDK code gets static checks on every push.
- README now documents the current smoke commands and the live relay-backed
  pilot activation flow from terminal pairing code through controller approval.

### Known follow-ups

- No open implementation handoff notes at this checkpoint.
