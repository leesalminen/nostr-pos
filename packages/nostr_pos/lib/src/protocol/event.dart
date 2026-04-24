import 'dart:convert';
import 'dart:math';

import 'package:bip340/bip340.dart' as bip340;
import 'package:crypto/crypto.dart';

import 'kinds.dart';

class NostrPosEvent {
  NostrPosEvent({
    required this.id,
    required this.pubkey,
    required this.createdAt,
    required this.kind,
    required this.tags,
    required this.content,
    required this.sig,
  });

  final String id;
  final String pubkey;
  final int createdAt;
  final int kind;
  final List<List<String>> tags;
  final String content;
  final String sig;

  Map<String, Object?> toJson() => {
    'id': id,
    'pubkey': pubkey,
    'created_at': createdAt,
    'kind': kind,
    'tags': tags,
    'content': content,
    'sig': sig,
  };

  factory NostrPosEvent.fromJson(Map<String, Object?> json) {
    return NostrPosEvent(
      id: json['id']! as String,
      pubkey: json['pubkey']! as String,
      createdAt: json['created_at']! as int,
      kind: json['kind']! as int,
      tags: (json['tags']! as List)
          .map((tag) => (tag as List).map((part) => part as String).toList())
          .toList(),
      content: json['content']! as String,
      sig: json['sig']! as String,
    );
  }

  bool get hasProtocolTag {
    return tags.any(
      (tag) =>
          tag.length >= 3 &&
          tag[0] == nostrPosProtocolTag[0] &&
          tag[1] == nostrPosProtocolTag[1] &&
          tag[2] == nostrPosProtocolTag[2],
    );
  }

  bool get idMatches {
    return id ==
        eventId(
          pubkey: pubkey,
          createdAt: createdAt,
          kind: kind,
          tags: tags,
          content: content,
        );
  }
}

NostrPosEvent buildUnsignedEvent({
  required String pubkey,
  required int kind,
  required List<List<String>> tags,
  required Object? content,
  int? createdAt,
}) {
  final ts = createdAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final normalizedTags = [
    nostrPosProtocolTag,
    ...tags.where((tag) => tag.isNotEmpty && tag[0] != 'proto'),
  ];
  final contentJson = content is String ? content : jsonEncode(content ?? {});
  final id = eventId(
    pubkey: pubkey,
    createdAt: ts,
    kind: kind,
    tags: normalizedTags,
    content: contentJson,
  );
  return NostrPosEvent(
    id: id,
    pubkey: pubkey,
    createdAt: ts,
    kind: kind,
    tags: normalizedTags,
    content: contentJson,
    sig: 'unsigned:$id',
  );
}

NostrPosEvent signNostrPosEvent(NostrPosEvent event, String privateKeyHex) {
  final publicKey = bip340.getPublicKey(privateKeyHex);
  if (publicKey != event.pubkey) {
    throw ArgumentError('private key does not match event pubkey');
  }
  final signature = bip340.sign(privateKeyHex, event.id, randomAuxHex());
  return NostrPosEvent(
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.createdAt,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: signature,
  );
}

NostrPosEvent replaceEventContent(NostrPosEvent event, String content) {
  final id = eventId(
    pubkey: event.pubkey,
    createdAt: event.createdAt,
    kind: event.kind,
    tags: event.tags,
    content: content,
  );
  return NostrPosEvent(
    id: id,
    pubkey: event.pubkey,
    createdAt: event.createdAt,
    kind: event.kind,
    tags: event.tags,
    content: content,
    sig: 'unsigned:$id',
  );
}

bool verifyNostrPosEventSignature(NostrPosEvent event) {
  if (!RegExp(r'^[0-9a-f]{128}$').hasMatch(event.sig)) return false;
  return bip340.verify(event.pubkey, event.id, event.sig);
}

String publicKeyFromPrivateKey(String privateKeyHex) {
  return bip340.getPublicKey(privateKeyHex);
}

String randomAuxHex() {
  final random = Random.secure();
  final bytes = List<int>.generate(32, (_) => random.nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}

String eventId({
  required String pubkey,
  required int createdAt,
  required int kind,
  required List<List<String>> tags,
  required String content,
}) {
  final serialized = jsonEncode([0, pubkey, createdAt, kind, tags, content]);
  return sha256.convert(utf8.encode(serialized)).toString();
}

String posRef({required String merchantPubkey, required String posId}) {
  return '${NostrPosKinds.posProfile}:$merchantPubkey:$posId';
}
