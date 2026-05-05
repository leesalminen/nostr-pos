import 'dart:convert';

import '../pairing/code.dart';
import 'bucket_tag.dart';
import 'event.dart';
import 'kinds.dart';
import 'nip44.dart';
import 'profile.dart';
import 'terminal_authorization.dart';
import 'timestamp.dart';

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
      ...profile.paymentMethods.toMethodTags(),
      ['network', profile.network.protocolName],
      ...profile.relays.map((relay) => ['relay', relay]),
      ['claim_mode', 'standard'],
      ['version', '0.3'],
    ],
    content: profile.toJson(),
  );
}

NostrPosEvent buildSignedPosProfileEvent({
  required String merchantPubkey,
  required String posId,
  required PosProfile profile,
  required String merchantPrivkey,
}) {
  return signNostrPosEvent(
    buildPosProfileEvent(
      merchantPubkey: merchantPubkey,
      posId: posId,
      profile: profile,
    ),
    merchantPrivkey,
  );
}

NostrPosEvent buildPairingAnnouncement({
  required String terminalPubkey,
  int? createdAt,
  Duration ttl = const Duration(seconds: 120),
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
      ['expiration', (ts + ttl.inSeconds).toString()],
    ],
    content: {
      'pairing_code': code,
      'terminal_pubkey': terminalPubkey,
      'created_at': ts,
    },
  );
}

Future<NostrPosEvent> buildSignedTerminalAuthorizationEvent({
  required TerminalAuthorization authorization,
  required String merchantPubkey,
  required String posId,
  required String merchantPrivkey,
  required String terminalPubkey,
}) async {
  final unsigned = buildTerminalAuthorizationEvent(
    merchantPubkey: merchantPubkey,
    posId: posId,
    authorization: authorization,
  );
  final encrypted = await nip44EncryptToPubkey(
    plaintext: unsigned.content,
    privateKeyHex: merchantPrivkey,
    publicKeyHex: terminalPubkey,
  );
  return signNostrPosEvent(
    replaceEventContent(unsigned, encrypted),
    merchantPrivkey,
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
      ['d', '$posId:${authorization.terminalId}'],
      ['expires', authorization.expiresAt.toString()],
    ],
    content: authorization.toJson(),
  );
}

Future<NostrPosEvent> buildSignedTerminalRevocationEvent({
  required String merchantPubkey,
  required String merchantPrivkey,
  required String posId,
  required String terminalPubkey,
  required String terminalId,
  String reason = 'merchant_revoked',
  int? revokedAt,
}) async {
  return signNostrPosEvent(
    await buildTerminalRevocationEvent(
      merchantPubkey: merchantPubkey,
      merchantPrivkey: merchantPrivkey,
      posId: posId,
      terminalPubkey: terminalPubkey,
      terminalId: terminalId,
      reason: reason,
      revokedAt: revokedAt,
    ),
    merchantPrivkey,
  );
}

Future<NostrPosEvent> buildTerminalRevocationEvent({
  required String merchantPubkey,
  required String merchantPrivkey,
  required String posId,
  required String terminalPubkey,
  required String terminalId,
  String reason = 'merchant_revoked',
  int? revokedAt,
}) async {
  final ts = revokedAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final content = {'reason': reason, 'revoked_at': ts};
  return buildUnsignedEvent(
    pubkey: merchantPubkey,
    kind: NostrPosKinds.terminalRevocation,
    createdAt: ts,
    tags: [
      ['d', '$posId:$terminalId'],
      ['revoked', 'true'],
    ],
    content: await nip44EncryptToPubkey(
      plaintext: jsonEncode(content),
      privateKeyHex: merchantPrivkey,
      publicKeyHex: terminalPubkey,
    ),
  );
}

NostrPosEvent buildSaleStreamEvent({
  required String terminalPubkey,
  required int kind,
  required Object? content,
  required String bucket,
  int? contentCreatedAt,
  int spreadSeconds = 300,
}) {
  if (kind != NostrPosKinds.saleCreated &&
      kind != NostrPosKinds.paymentStatus &&
      kind != NostrPosKinds.receipt) {
    throw ArgumentError.value(kind, 'kind', 'not a sale-stream kind');
  }
  return buildUnsignedEvent(
    pubkey: terminalPubkey,
    kind: kind,
    tags: [
      ['x', bucket],
    ],
    content: content,
    createdAt: jitteredCreatedAt(
      baseCreatedAt: contentCreatedAt,
      spreadSeconds: spreadSeconds,
    ),
  );
}

NostrPosEvent buildBucketedSaleStreamEvent({
  required String terminalPubkey,
  required int kind,
  required Object? content,
  required String saleBucketSecret,
  required int saleBucketGeneration,
  required int contentCreatedAt,
  int spreadSeconds = 300,
}) {
  return buildSaleStreamEvent(
    terminalPubkey: terminalPubkey,
    kind: kind,
    content: content,
    bucket: dailyBucketTag(
      secret: hexToBytes(saleBucketSecret),
      generation: saleBucketGeneration,
      epochDayUtc: epochDayFromUnix(contentCreatedAt),
    ),
    contentCreatedAt: contentCreatedAt,
    spreadSeconds: spreadSeconds,
  );
}
