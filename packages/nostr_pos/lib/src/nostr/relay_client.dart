import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ndk/data_layer/models/nip_01_event_model.dart';
import 'package:ndk/data_layer/repositories/signers/bip340_event_signer.dart';
import 'package:ndk/domain_layer/entities/nip_01_event.dart';
import 'package:ndk/domain_layer/usecases/accounts/accounts.dart';
import 'package:ndk/domain_layer/usecases/gift_wrap/gift_wrap.dart';

import '../protocol/event.dart';
import '../protocol/kinds.dart';

class RelayPublishResult {
  RelayPublishResult({required this.relay, required this.ok, this.message});

  final String relay;
  final bool ok;
  final String? message;

  Map<String, Object?> toJson() => {
    'relay': relay,
    'ok': ok,
    'message': message,
  };
}

class NostrRelayClient {
  NostrRelayClient({this.timeout = const Duration(seconds: 8)});

  final Duration timeout;

  Future<List<NostrPosEvent>> query(
    String relayUrl,
    Map<String, Object?> filter,
  ) async {
    final socket = await WebSocket.connect(relayUrl).timeout(timeout);
    final subId = 'nostr-pos-${DateTime.now().microsecondsSinceEpoch}';
    final events = <NostrPosEvent>[];
    final done = Completer<List<NostrPosEvent>>();
    StreamSubscription<dynamic>? subscription;

    subscription = socket.listen(
      (message) {
        final decoded = jsonDecode(message as String);
        if (decoded is! List || decoded.isEmpty) return;
        if (decoded[0] == 'EVENT' &&
            decoded.length >= 3 &&
            decoded[1] == subId) {
          events.add(
            NostrPosEvent.fromJson((decoded[2] as Map).cast<String, Object?>()),
          );
        }
        if ((decoded[0] == 'EOSE' || decoded[0] == 'CLOSED') &&
            decoded.length >= 2 &&
            decoded[1] == subId &&
            !done.isCompleted) {
          done.complete(events);
        }
      },
      onError: done.completeError,
      onDone: () {
        if (!done.isCompleted) done.complete(events);
      },
    );

    socket.add(jsonEncode(['REQ', subId, filter]));
    try {
      return await done.future.timeout(timeout, onTimeout: () => events);
    } finally {
      socket.add(jsonEncode(['CLOSE', subId]));
      await subscription.cancel();
      await socket.close();
    }
  }

  Future<RelayPublishResult> publish(
    String relayUrl,
    NostrPosEvent event,
  ) async {
    final socket = await WebSocket.connect(relayUrl).timeout(timeout);
    final done = Completer<RelayPublishResult>();
    StreamSubscription<dynamic>? subscription;

    subscription = socket.listen(
      (message) {
        final decoded = jsonDecode(message as String);
        if (decoded is! List || decoded.isEmpty) return;
        if (decoded[0] == 'OK' &&
            decoded.length >= 4 &&
            decoded[1] == event.id) {
          if (!done.isCompleted) {
            done.complete(
              RelayPublishResult(
                relay: relayUrl,
                ok: decoded[2] == true,
                message: decoded[3] as String?,
              ),
            );
          }
        }
      },
      onError: done.completeError,
      onDone: () {
        if (!done.isCompleted) {
          done.complete(
            RelayPublishResult(
              relay: relayUrl,
              ok: false,
              message: 'connection closed',
            ),
          );
        }
      },
    );

    socket.add(jsonEncode(['EVENT', event.toJson()]));
    try {
      return await done.future.timeout(
        timeout,
        onTimeout: () =>
            RelayPublishResult(relay: relayUrl, ok: false, message: 'timeout'),
      );
    } finally {
      await subscription.cancel();
      await socket.close();
    }
  }
}

Future<List<RelayPublishResult>> publishEventToRelays({
  required List<String> relays,
  required NostrPosEvent event,
  NostrRelayClient? client,
}) async {
  final relayClient = client ?? NostrRelayClient();
  final results = <RelayPublishResult>[];
  for (final relay in relays) {
    try {
      results.add(await relayClient.publish(relay, event));
    } catch (error) {
      results.add(
        RelayPublishResult(relay: relay, ok: false, message: '$error'),
      );
    }
  }
  return results;
}

Future<List<NostrPosEvent>> queryEventsFromRelays({
  required List<String> relays,
  required Map<String, Object?> filter,
  NostrRelayClient? client,
}) async {
  final relayClient = client ?? NostrRelayClient();
  final events = <NostrPosEvent>[];
  for (final relay in relays) {
    try {
      events.addAll(await relayClient.query(relay, filter));
    } catch (_) {
      // Query results are best-effort across configured relays.
    }
  }
  final byId = <String, NostrPosEvent>{};
  for (final event in events) {
    if (event.idMatches) byId[event.id] = event;
  }
  return byId.values.toList()
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
}

Future<NostrPosEvent?> findPairingAnnouncement({
  required List<String> relays,
  required String pairingCode,
  NostrRelayClient? client,
}) async {
  final relayClient = client ?? NostrRelayClient();
  final addressableEvents = await queryEventsFromRelays(
    relays: relays,
    client: relayClient,
    filter: {
      'kinds': [NostrPosKinds.pairingAnnouncement],
      '#d': [pairingCode],
      'limit': 5,
    },
  );
  final addressable = _latestValidPairing(addressableEvents, pairingCode);
  return addressable;
}

NostrPosEvent? _latestValidPairing(
  List<NostrPosEvent> events,
  String pairingCode,
) {
  final valid =
      events
          .where(
            (event) =>
                event.hasProtocolTag &&
                event.idMatches &&
                event.kind == NostrPosKinds.pairingAnnouncement &&
                _hasTag(event, 'p', event.pubkey) &&
                _hasTag(event, 'd', pairingCode),
          )
          .toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return valid.isEmpty ? null : valid.first;
}

bool _hasTag(NostrPosEvent event, String name, String value) {
  return event.tags.any(
    (tag) => tag.length >= 2 && tag[0] == name && tag[1] == value,
  );
}

Future<List<NostrPosEvent>> fetchSwapRecoveryBackups({
  required List<String> relays,
  String? recoveryPubkey,
  String? recoveryPrivkey,
  NostrRelayClient? client,
}) async {
  final relayClient = client ?? NostrRelayClient();
  final legacyFilter = <String, Object?>{
    'kinds': [NostrPosKinds.swapRecoveryBackup],
    'limit': 100,
  };
  if (recoveryPubkey != null && recoveryPubkey.isNotEmpty) {
    legacyFilter['#p'] = [recoveryPubkey];
  }

  final recoveries =
      (await queryEventsFromRelays(
            relays: relays,
            filter: legacyFilter,
            client: relayClient,
          ))
          .where(
            (event) =>
                event.kind == NostrPosKinds.swapRecoveryBackup &&
                event.hasProtocolTag,
          )
          .toList();

  if (recoveryPrivkey != null && recoveryPrivkey.isNotEmpty) {
    final recipientPubkey = publicKeyFromPrivateKey(recoveryPrivkey);
    final wrapped = await queryEventsFromRelays(
      relays: relays,
      filter: {
        'kinds': [NostrPosKinds.giftWrap],
        '#p': [recoveryPubkey ?? recipientPubkey],
        'limit': 100,
      },
      client: relayClient,
    );
    recoveries.addAll(
      await unwrapRecoveryGiftWraps(
        wrappedEvents: wrapped,
        recoveryPrivkey: recoveryPrivkey,
      ),
    );
  }

  final byId = <String, NostrPosEvent>{};
  for (final recovery in recoveries) {
    byId[recovery.id] = recovery;
  }
  return byId.values.toList()
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
}

Future<List<NostrPosEvent>> unwrapRecoveryGiftWraps({
  required List<NostrPosEvent> wrappedEvents,
  required String recoveryPrivkey,
}) async {
  final signer = Bip340EventSigner(
    privateKey: recoveryPrivkey,
    publicKey: publicKeyFromPrivateKey(recoveryPrivkey),
  );
  final giftWrap = GiftWrap(accounts: Accounts());
  final recoveries = <NostrPosEvent>[];
  for (final wrapped in wrappedEvents) {
    if (wrapped.kind != NostrPosKinds.giftWrap || !wrapped.idMatches) continue;
    try {
      final rumor = await giftWrap.fromGiftWrap(
        giftWrap: _toNip01Event(wrapped),
        customSigner: signer,
      );
      if (rumor.kind != NostrPosKinds.swapRecoveryBackup) continue;
      final event = _fromNip01Event(rumor);
      if (event.hasProtocolTag && event.idMatches) recoveries.add(event);
    } catch (_) {
      // Ignore wraps that are not decryptable by the supplied recovery key.
    }
  }
  return recoveries;
}

Nip01EventModel _toNip01Event(NostrPosEvent event) {
  return Nip01EventModel(
    id: event.id,
    pubKey: event.pubkey,
    createdAt: event.createdAt,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  );
}

NostrPosEvent _fromNip01Event(Nip01Event event) {
  final id = event.id;
  return NostrPosEvent(
    id: id,
    pubkey: event.pubKey,
    createdAt: event.createdAt,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig ?? 'unsigned:$id',
  );
}
