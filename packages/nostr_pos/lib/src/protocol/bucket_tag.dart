import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

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
