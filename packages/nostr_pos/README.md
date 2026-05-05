# nostr_pos (Dart SDK)

Controller SDK for the [Nostr POS protocol](../nostr-pos-protocol-spec/README.md).
This package is what the merchant-side CLI is built on; it can be embedded in any
Dart or Flutter app that needs to act as a controller (publish a POS profile,
authorize terminals, decrypt sales history, broadcast recovery claims).

It does **not** depend on `dart:ui` or any Flutter binding, so the same package
runs from a CLI, a desktop Flutter app, or a mobile Flutter app.

## Installing

This package is path-only inside the monorepo. Wire it from your `pubspec.yaml`:

```yaml
dependencies:
  nostr_pos:
    path: ../../packages/nostr_pos   # relative to your app
```

For an external Flutter project, vendor the package or publish it privately.
Required Dart SDK is `>=3.10.0 <4.0.0`.

## What's in the box

| Layer | Files | What it does |
| --- | --- | --- |
| Protocol primitives | `src/protocol/event.dart`, `kinds.dart`, `builders.dart`, `profile.dart`, `terminal_authorization.dart` | Build, sign (BIP340 Schnorr), and verify the canonical Nostr POS event envelopes (`30380`–`30383`, `9380`–`9383`). |
| Encryption | `src/protocol/nip44.dart` | NIP-44 v2 encrypt/decrypt for terminal authorizations and sale envelopes. |
| Addressing | `src/protocol/nip19.dart`, `src/pairing/code.dart` | `naddr` encode/decode for `pos-url`, deterministic pairing-code derivation from a terminal pubkey. |
| Nostr transport | `src/nostr/relay_client.dart` | Minimal WebSocket client that publishes and queries events, plus higher-level helpers (`findPairingAnnouncement`, `fetchSwapRecoveryBackups`, NIP-59 gift-wrap unwrapping). |
| Local store | `src/local/event_store.dart` | Append-only JSONL event log, the controller's local source of truth. |
| Accounting | `src/accounting/sales_history.dart` | Reduce sale-created/payment-status/receipt events into a sales table; CSV export; merchant-key decryption of encrypted sale envelopes. |
| Recovery | `src/recovery/swap_recovery.dart`, `claim_recovery.dart` | Parse swap-recovery backups, decrypt per-terminal AES-GCM blobs, drive a `ControllerRecoveryExecutor` that polls Boltz status and broadcasts claim transactions on Liquid. |
| FX | `src/fx/bull_bitcoin.dart` | Anonymous Bull Bitcoin index-price client used for fiat→sats quotes. |

Core protocol symbols are exported from
`import 'package:nostr_pos/nostr_pos.dart';`. VM-only helpers such as relay
websockets, claim recovery clients, and `LocalEventStore` are exported from
`import 'package:nostr_pos/nostr_pos_io.dart';`.

## Quickstart

```dart
import 'package:nostr_pos/nostr_pos_io.dart';

Future<void> main() async {
  // 1. Generate a merchant key (or load one from your secret store).
  final merchantPriv = randomAuxHex();
  final merchantPub = publicKeyFromPrivateKey(merchantPriv);

  // 2. Build and sign a POS profile event.
  final profile = PosProfile(
    name: 'Counter 1',
    merchantName: 'Demo Merchant',
    currency: 'USD',
  );
  final event = signNostrPosEvent(
    buildPosProfileEvent(
      merchantPubkey: merchantPub,
      posId: 'demo-1',
      profile: profile,
    ),
    merchantPriv,
  );

  // 3. Persist locally and replicate to relays.
  await LocalEventStore('.nostr-pos/events.jsonl').append(event);
  final results = await publishEventToRelays(
    relays: const ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol'],
    event: event,
  );
  print('replicated to ${results.where((r) => r.ok).length}/${results.length}');

  // 4. Print the URL the cashier scans.
  print(posProfileUrl(
    baseUrl: 'https://nostr-pos.vercel.app/#/pos',
    identifier: 'demo-1',
    pubkey: merchantPub,
    relays: profile.relays,
  ));
}
```

## Common recipes

### Pair and authorize a terminal

```dart
final pairing = await findPairingAnnouncement(
  relays: relays,
  pairingCode: '4F7G-YJDP',
);
if (pairing == null) throw StateError('no announcement yet');

final terminalPubkey = pairing.tags.firstWhere((t) => t[0] == 'p')[1];
final auth = TerminalAuthorization(
  posRef: posRef(merchantPubkey: merchantPub, posId: 'demo-1'),
  terminalPubkey: terminalPubkey,
  terminalName: 'Counter 1',
  pairingCodeHint: '4F7G-YJDP',
  ctDescriptor: '<liquid CT descriptor>',
  descriptorFingerprint: '<fingerprint>',
  terminalBranch: 17,
  merchantRecoveryPubkey: recoveryPub,
  expiresAt: DateTime.now()
      .add(const Duration(days: 365))
      .millisecondsSinceEpoch ~/ 1000,
);
final encrypted = replaceEventContent(
  buildTerminalAuthorizationEvent(
    merchantPubkey: merchantPub,
    posId: 'demo-1',
    authorization: auth,
  ),
  await nip44EncryptToPubkey(
    plaintext: jsonEncode(auth.toJson()),
    privateKeyHex: merchantPriv,
    publicKeyHex: terminalPubkey,
  ),
);
final signed = signNostrPosEvent(encrypted, merchantPriv);
await publishEventToRelays(relays: relays, event: signed);
```

### Read sales (with merchant-side decryption)

```dart
final events = await LocalEventStore('.nostr-pos/events.jsonl').readAll();
final rows = await salesHistoryFromEventsForMerchant(
  events,
  merchantRecoveryPrivkey: recoveryPriv,
);
print(salesHistoryCsv(rows));
```

### Recover a stranded swap claim

```dart
final backups = await fetchSwapRecoveryBackups(
  relays: relays,
  recoveryPrivkey: recoveryPriv,
);
final recoveries = swapRecoveriesFromEvents(backups);

final executor = ControllerRecoveryExecutor(
  swapStatusClient: BoltzSwapStatusClient(apiBase: 'https://api.boltz.exchange'),
  liquidClient: LiquidTransactionClient(apiBase: 'https://liquid.bullbitcoin.com/api'),
  // Wire in your own Liquid claim-tx builder; the SDK does not ship one yet.
  claimBuilder: (request) async => buildClaim(request),
);
final results = await executor.recoverClaims(recoveries);
```

## Design notes

- **Events are signed with BIP340 Schnorr signatures** (`bip340` package). Until
  signed, an event has `sig: 'unsigned:<id>'` so it can still be persisted and
  diffed locally.
- **All events carry `["proto", "nostr-pos", "0.3"]`** so callers and relays can
  filter on protocol version.
- **Sale-stream events use daily HMAC bucket tags** (`x`) instead of POS `a`
  tags or terminal `p` tags. The SDK exposes `dailyBucketTag`,
  `bucketWindow`, and jittered sale-stream builders for v0.3 publishers and
  subscribers.
- **`LocalEventStore` is append-only JSONL.** Newer events for the same `d`-tag
  win on read; nothing is mutated in place.
- **`NostrRelayClient` is intentionally thin.** Per-call WebSocket open/close
  keeps memory predictable and avoids subscription bookkeeping. Long-running
  apps that need pooled connections should wrap it.
- **Recovery decryption is symmetric AES-GCM** keyed by
  `sha256("nostr-pos:<terminal_id>")`. The terminal id is carried in encrypted
  authorization content or passed explicitly by the caller.

## Testing

```bash
cd packages/nostr_pos
dart pub get
dart analyze
dart test
```

The test suite covers event signing/verification, NIP-44 round-trips, naddr
codec, pairing-code derivation, sales-history reduction, and swap/claim
recovery state machines.
