# Nostr POS Protocol Spec

Draft implementation package for PRD v0.2.

The schemas in `schemas/` describe the public event envelopes and encrypted
content payloads used by v1. The test vectors in `test-vectors/` are consumed by
both the TypeScript terminal and Dart controller test suites.

Current event kinds:

- `30380` POS Profile
- `30381` Terminal Authorization
- `30382` Terminal Revocation
- `30383` Pairing Announcement
- `9380` Sale Created
- `9381` Swap Recovery Backup
- `9382` Payment Status
- `9383` Receipt
