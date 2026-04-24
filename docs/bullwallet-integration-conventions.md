# Bull Wallet Integration Conventions

Survey target: `SatoshiPortal/bullbitcoin-mobile` cloned on 2026-04-23 from
GitHub default branch.

## Current architecture

- App package name is `bb_mobile`, currently version `6.9.1+177`.
- Flutter SDK app using Dart `>=3.10.0 <4.0.0`.
- Routing is handled with `go_router`.
- State management is `flutter_bloc`, with both Bloc and Cubit patterns in use.
- Dependency injection is centralized through `get_it` in `lib/locator.dart`.
- Feature modules generally provide their own `*_locator.dart` files that
  register datasources, repositories, use cases, facades, and Blocs/Cubits.
- Persistent app data uses Drift/SQLite plus some Hive migration history and
  secure storage packages.
- Networking uses `dio` for Bull/exchange APIs and `http` in some lower-level
  dependencies.
- Error surfaces use feature-specific error classes that extend or compose the
  core `BullException` style.
- Background work is already present through `workmanager` and isolated startup
  flows.

## Relevant dependencies already present

- `lwk` from `https://github.com/SatoshiPortal/lwk-dart`.
- `boltz` from `https://github.com/SatoshiPortal/boltz-dart.git`.
- `flutter_nfc_kit`, relevant for native wallet-side NFC work.
- `bolt11_decoder`, `bip21_uri`, `crypto`, `convert`, `hex`, and
  `web_socket_channel`.
- No existing Nostr dependency was found by source search.

## POS package implications

- `nostr_pos` should remain a plain Dart package, not a Flutter package, so it
  can be used by the CLI and by Bull Wallet.
- Bull Wallet integration should add a feature module such as
  `lib/features/pos/` with its own `pos_locator.dart`.
- Register the package through `GetIt` using the same layered style:
  datasources/ports, repositories, use cases, and Bloc/Cubit driving adapters.
- UI state should be exposed through Bloc/Cubit rather than package-specific
  streams leaking into widgets.
- Long-running recovery scans, claim polling, and Liquid backend verification
  should be isolated behind use cases and scheduled through existing background
  task conventions where possible.
- Since there is no existing Nostr code, the `nostr_pos` package should own the
  Nostr library choice and hide it behind package ports. This keeps future Bull
  features from coupling directly to NDK or another relay implementation.

## Open integration checks

- Confirm the exact `lwk` Dart API surface for PSET claim transaction build,
  blind, sign, and broadcast preparation before wiring production recovery.
- Confirm with Bull maintainers whether `boltz-dart` can cover the controller
  claim path or whether `nostr_pos` should keep a small independent claim client.
- Confirm feature flag and staged rollout conventions before the v1.1 Bull
  Wallet PR.
