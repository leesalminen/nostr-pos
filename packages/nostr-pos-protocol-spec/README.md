# Nostr POS Protocol Spec

Draft implementation package for PRD v0.3.

The schemas in `schemas/` describe the public event envelopes and encrypted
content payloads used by v1. The test vectors in `test-vectors/` are consumed by
both the TypeScript terminal and Dart controller test suites.

Schema files:

- `pos-profile.schema.json`
- `terminal-authorization.schema.json`
- `terminal-revocation.schema.json`
- `pairing.schema.json`
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
  `["proto", "nostr-pos", "0.3"]`, `["d", "<pairing_code>"]`,
  `["p", "<terminal_pubkey>"]`, and `["expiration", "<unix_timestamp>"]`.
  The expiration is 120 seconds after `created_at`, and consumers MUST reject
  announcements with absent or past expiration tags. Controllers discover
  pairing by querying `{ "kinds": [30383], "#d": ["<pairing_code>"] }`.
- `30381` Terminal Authorization uses `["d", "<pos_id>:<terminal_id>"]`, where
  `terminal_id` is a random opaque 16-byte hex string. It has no `p` tag. The
  encrypted content carries `terminal_pubkey`, `terminal_id`,
  `sale_bucket_secret`, `sale_bucket_generation`, and
  `effective_from_epoch_day`.
- `30382` Terminal Revocation uses the same `d` value as the authorization,
  has no `p` tag, and encrypts `{ "reason", "revoked_at" }` to the terminal
  pubkey.
- `9380` Sale Created, `9382` Payment Status, and `9383` Receipt keep sale IDs,
  status, method, and amounts inside encrypted content. Their relay-visible tags
  are limited to `proto` and `["x", "<daily_bucket_hmac>"]`. The `x` tag is
  `HMAC_SHA256(sale_bucket_secret, "<generation>:<epoch_day_utc>")`; publishers
  compute the day from the unjittered sale timestamp inside encrypted content.
  Subscribers query day +/- 1 for the target range and all active generations.
- `9381` Swap Recovery Backup is delivered as NIP-59 gift wraps. Relays should
  see only wrapper metadata for the merchant recovery key; terminals do not get
  their own copy via relay gift wrap.

The JSON test vectors are payload fixtures. The tag rules above define the
Nostr event envelopes that carry those payloads.
