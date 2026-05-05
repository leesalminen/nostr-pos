import 'dart:typed_data';

const _alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
final _pairingCodePattern = RegExp(
  '[${RegExp.escape(_alphabet)}]{4}-[${RegExp.escape(_alphabet)}]{4}',
);
final _pairingCodeExactPattern = RegExp(
  '^[${RegExp.escape(_alphabet)}]{4}-[${RegExp.escape(_alphabet)}]{4}\$',
);

class PairingPayload {
  const PairingPayload({required this.pairingCode});

  final String pairingCode;

  static PairingPayload parse(String value) {
    final code = extractPairingCode(value);
    if (code == null) throw const FormatException('Missing pairing code.');
    return PairingPayload(pairingCode: code);
  }
}

String pairingCodeFromPubkey(String terminalPubkeyHex) {
  final normalized = terminalPubkeyHex.toLowerCase();
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(normalized)) {
    throw ArgumentError.value(
      terminalPubkeyHex,
      'terminalPubkeyHex',
      'expected 32-byte hex public key',
    );
  }

  final firstFive = Uint8List(5);
  for (var i = 0; i < 5; i++) {
    firstFive[i] = int.parse(normalized.substring(i * 2, i * 2 + 2), radix: 16);
  }

  var value = BigInt.zero;
  for (final byte in firstFive) {
    value = (value << 8) | BigInt.from(byte);
  }

  final chars = List<String>.filled(8, '0');
  for (var i = 7; i >= 0; i--) {
    chars[i] = _alphabet[(value & BigInt.from(31)).toInt()];
    value = value >> 5;
  }

  final raw = chars.join();
  return '${raw.substring(0, 4)}-${raw.substring(4)}';
}

String? extractPairingCode(String text) {
  final normalized = text.toUpperCase();
  return _pairingCodePattern.firstMatch(normalized)?.group(0);
}

bool isPairingCode(String candidate) {
  return _pairingCodeExactPattern.hasMatch(candidate.trim().toUpperCase());
}
