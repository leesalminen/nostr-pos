# Nostr POS Protocol Spec

Draft implementation package for PRD v0.2.

The schemas in `schemas/` describe the public event envelopes and encrypted
content payloads used by v1. The test vectors in `test-vectors/` are consumed by
both the TypeScript terminal and Dart controller test suites.

Schema files:

- `pos-profile.schema.json`
- `terminal-authorization.schema.json`
- `sale-created.schema.json`
- `payment-status.schema.json`
- `receipt.schema.json`
- `swap-recovery.schema.json`

Current event kinds:

- `30380` POS Profile
- `30381` Terminal Authorization
- `30382` Terminal Revocation
- `30383` Pairing Announcement
- `9380` Sale Created
- `9381` Swap Recovery Backup
- `9382` Payment Status
- `9383` Receipt

## Relay-Indexed Envelope Tags

Use standard indexed Nostr tags for anything a relay must filter. Do not rely on
custom multi-character filters such as `#pairing` or `#terminal`; common public
relays reject or ignore them.

- `30383` Pairing Announcement is addressable. Tags are:
  `["proto", "nostr-pos", "0.2"]`, `["d", "<pairing_code>"]`,
  `["p", "<terminal_pubkey>"]`, and `["expiration", "<unix_timestamp>"]`.
  Controllers discover pairing by querying `{ "kinds": [30383], "#d": ["<pairing_code>"] }`.
- `30381` Terminal Authorization and `30382` Terminal Revocation address the
  terminal with `["p", "<terminal_pubkey>"]`. They do not include a custom
  `terminal` tag.
- `9380` Sale Created, `9382` Payment Status, and `9383` Receipt keep sale IDs,
  status, method, and amounts inside encrypted content. Their relay-visible tags
  are limited to protocol/profile addressing such as `proto`, `a`, and
  `["p", "<terminal_pubkey>"]` when terminal history must be fetched.
- `9381` Swap Recovery Backup is delivered as NIP-59 gift wraps. Relays should
  see only wrapper metadata, especially the recipient `p` tag; inner recovery
  tags are not used for relay discovery.

The JSON test vectors are payload fixtures. The tag rules above define the
Nostr event envelopes that carry those payloads.
