# nostr-pos

Open, backendless retail POS protocol and reference app for Liquid settlement,
Lightning swaps, and Bolt Card payments.

This repository is organized as a small monorepo:

- `packages/nostr-pos-protocol-spec`: schemas, fixtures, and human protocol docs.
- `packages/nostr_pos`: Dart controller SDK foundations.
- `apps/nostr_pos_cli`: CLI controller built on the Dart SDK.
- `apps/pos-pwa`: static Svelte 5 + Vite cashier PWA.
- `infra`: local relay/Liquid/swap development scaffolding.

The first implementation pass ships deterministic local adapters for development
and tests. Production adapters for Liquid, Boltz, and relay networking live behind
interfaces so they can replace the pilot adapters without changing the cashier
surface.
