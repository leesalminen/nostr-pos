import '../pairing/code.dart';
import 'event.dart';
import 'kinds.dart';
import 'profile.dart';
import 'terminal_authorization.dart';

NostrPosEvent buildPosProfileEvent({
  required String merchantPubkey,
  required String posId,
  required PosProfile profile,
}) {
  return buildUnsignedEvent(
    pubkey: merchantPubkey,
    kind: NostrPosKinds.posProfile,
    tags: [
      ['d', posId],
      ['name', profile.name],
      ['merchant', profile.merchantName],
      ['method', 'liquid'],
      ['method', 'lightning_via_swap'],
      ['method', 'bolt_card'],
      ['network', 'liquid-mainnet'],
      ...profile.relays.map((relay) => ['relay', relay]),
      ['claim_mode', 'standard'],
      ['version', '0.2'],
    ],
    content: profile.toJson(),
  );
}

NostrPosEvent buildPairingAnnouncement({
  required String terminalPubkey,
  int? createdAt,
}) {
  final ts = createdAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final code = pairingCodeFromPubkey(terminalPubkey);
  return buildUnsignedEvent(
    pubkey: terminalPubkey,
    kind: NostrPosKinds.pairingAnnouncement,
    createdAt: ts,
    tags: [
      ['d', code],
      ['p', terminalPubkey],
      ['expiration', (ts + 300).toString()],
    ],
    content: {
      'pairing_code': code,
      'terminal_pubkey': terminalPubkey,
      'created_at': ts,
    },
  );
}

NostrPosEvent buildTerminalAuthorizationEvent({
  required String merchantPubkey,
  required String posId,
  required TerminalAuthorization authorization,
}) {
  return buildUnsignedEvent(
    pubkey: merchantPubkey,
    kind: NostrPosKinds.terminalAuthorization,
    tags: [
      ['d', '$posId:${authorization.terminalPubkey}'],
      ['a', posRef(merchantPubkey: merchantPubkey, posId: posId)],
      ['p', authorization.terminalPubkey],
      ['expires', authorization.expiresAt.toString()],
    ],
    content: authorization.toJson(),
  );
}

NostrPosEvent buildTerminalRevocationEvent({
  required String merchantPubkey,
  required String posId,
  required String terminalPubkey,
  String reason = 'merchant_revoked',
  int? revokedAt,
}) {
  final ts = revokedAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000;
  return buildUnsignedEvent(
    pubkey: merchantPubkey,
    kind: NostrPosKinds.terminalRevocation,
    createdAt: ts,
    tags: [
      ['d', '$posId:$terminalPubkey'],
      ['a', posRef(merchantPubkey: merchantPubkey, posId: posId)],
      ['p', terminalPubkey],
      ['revoked', 'true'],
    ],
    content: {'reason': reason, 'revoked_at': ts},
  );
}
