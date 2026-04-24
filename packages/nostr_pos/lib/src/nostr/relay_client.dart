import 'dart:async';
import 'dart:convert';
import 'dart:io';

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
  final events = await queryEventsFromRelays(
    relays: relays,
    client: relayClient,
    filter: {
      'kinds': [NostrPosKinds.pairingAnnouncement],
      '#pairing': [pairingCode],
      'limit': 5,
    },
  );
  final valid =
      events.where((event) => event.hasProtocolTag && event.idMatches).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return valid.isEmpty ? null : valid.first;
}

Future<List<NostrPosEvent>> fetchSwapRecoveryBackups({
  required List<String> relays,
  String? recoveryPubkey,
  NostrRelayClient? client,
}) async {
  final filter = <String, Object?>{
    'kinds': [NostrPosKinds.swapRecoveryBackup],
    'limit': 100,
  };
  if (recoveryPubkey != null && recoveryPubkey.isNotEmpty) {
    filter['#p'] = [recoveryPubkey];
  }

  return (await queryEventsFromRelays(
        relays: relays,
        filter: filter,
        client: client,
      ))
      .where(
        (event) =>
            event.kind == NostrPosKinds.swapRecoveryBackup &&
            event.hasProtocolTag,
      )
      .toList();
}
