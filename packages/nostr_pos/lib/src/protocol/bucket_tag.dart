import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import 'kinds.dart';

class TerminalBucketKey {
  TerminalBucketKey({
    required this.secret,
    required this.generation,
    required this.effectiveFromEpochDay,
  });

  final String secret;
  final int generation;
  final int effectiveFromEpochDay;
}

String dailyBucketTag({
  required Uint8List secret,
  required int generation,
  required int epochDayUtc,
}) {
  final hmac = Hmac(sha256, secret);
  return hmac.convert(utf8.encode('$generation:$epochDayUtc')).toString();
}

int epochDayFromUnix(int seconds) => seconds ~/ Duration.secondsPerDay;

List<String> bucketWindow({
  required Uint8List secret,
  required int generation,
  required int epochDayUtc,
}) {
  return [
    for (var day = epochDayUtc - 1; day <= epochDayUtc + 1; day++)
      dailyBucketTag(secret: secret, generation: generation, epochDayUtc: day),
  ];
}

Uint8List hexToBytes(String hex) {
  final normalized = hex.trim();
  if (normalized.length.isOdd ||
      !RegExp(r'^[0-9a-fA-F]*$').hasMatch(normalized)) {
    throw const FormatException('invalid hex');
  }
  return Uint8List.fromList([
    for (var i = 0; i < normalized.length; i += 2)
      int.parse(normalized.substring(i, i + 2), radix: 16),
  ]);
}

String bytesToHex(Iterable<int> bytes) {
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}

List<String> saleBucketTagsForQuery({
  required Iterable<TerminalBucketKey> terminals,
  required DateTime from,
  required DateTime to,
  Duration graceWindow = const Duration(days: 1),
}) {
  final graceDays = _graceDays(graceWindow);
  final fromDay =
      epochDayFromUnix(from.millisecondsSinceEpoch ~/ 1000) - graceDays;
  final toDay = epochDayFromUnix(to.millisecondsSinceEpoch ~/ 1000) + graceDays;
  final tags = <String>{};
  for (final terminal in terminals) {
    if (terminal.secret.isEmpty) continue;
    final secret = hexToBytes(terminal.secret);
    final startDay = terminal.effectiveFromEpochDay > fromDay
        ? terminal.effectiveFromEpochDay
        : fromDay;
    for (var day = startDay; day <= toDay; day++) {
      tags.add(
        dailyBucketTag(
          secret: secret,
          generation: terminal.generation,
          epochDayUtc: day,
        ),
      );
    }
  }
  return tags.toList();
}

Map<String, Object?> saleEventsFilterForBuckets({
  required List<String> bucketTags,
  int limit = 500,
  int? since,
}) {
  final filter = <String, Object?>{
    'kinds': [
      NostrPosKinds.saleCreated,
      NostrPosKinds.paymentStatus,
      NostrPosKinds.receipt,
    ],
    '#x': bucketTags,
    'limit': limit,
  };
  if (since != null) filter['since'] = since;
  return filter;
}

int _graceDays(Duration graceWindow) {
  if (graceWindow <= Duration.zero) return 0;
  return (graceWindow.inSeconds + Duration.secondsPerDay - 1) ~/
      Duration.secondsPerDay;
}
