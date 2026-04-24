import 'dart:convert';

import 'kinds.dart';

const _charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const _generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

class NaddrPointer {
  const NaddrPointer({
    required this.identifier,
    required this.pubkey,
    required this.kind,
    this.relays = const [],
  });

  final String identifier;
  final String pubkey;
  final int kind;
  final List<String> relays;
}

String naddrEncode({
  required String identifier,
  required String pubkey,
  int kind = NostrPosKinds.posProfile,
  List<String> relays = const [],
}) {
  if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(pubkey)) {
    throw ArgumentError('pubkey must be 32-byte hex');
  }
  final bytes = <int>[];
  _addTlv(bytes, 3, _uint32Be(kind));
  _addTlv(bytes, 2, _hexToBytes(pubkey));
  for (final relay in relays) {
    _addTlv(bytes, 1, utf8.encode(relay));
  }
  _addTlv(bytes, 0, utf8.encode(identifier));
  return _bech32Encode('naddr', _convertBits(bytes, 8, 5, true));
}

NaddrPointer naddrDecode(String encoded) {
  final decoded = _bech32Decode(encoded);
  if (decoded.hrp != 'naddr') throw ArgumentError('not an naddr value');
  final bytes = _convertBits(decoded.data, 5, 8, false);
  String? identifier;
  String? pubkey;
  int? kind;
  final relays = <String>[];

  var index = 0;
  while (index < bytes.length) {
    if (index + 2 > bytes.length) throw ArgumentError('invalid naddr tlv');
    final type = bytes[index++];
    final length = bytes[index++];
    if (index + length > bytes.length) throw ArgumentError('invalid naddr tlv');
    final value = bytes.sublist(index, index + length);
    index += length;

    switch (type) {
      case 0:
        identifier = utf8.decode(value);
      case 1:
        relays.add(utf8.decode(value));
      case 2:
        if (value.length != 32) throw ArgumentError('invalid naddr pubkey');
        pubkey = value
            .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
            .join();
      case 3:
        if (value.length != 4) throw ArgumentError('invalid naddr kind');
        kind = value.fold<int>(0, (result, byte) => (result << 8) | byte);
    }
  }

  if (identifier == null || pubkey == null || kind == null) {
    throw ArgumentError('incomplete naddr value');
  }
  return NaddrPointer(
    identifier: identifier,
    pubkey: pubkey,
    kind: kind,
    relays: relays,
  );
}

String posProfileUrl({
  required String baseUrl,
  required String identifier,
  required String pubkey,
  List<String> relays = const [],
}) {
  final normalizedBase = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
  return '$normalizedBase${naddrEncode(identifier: identifier, pubkey: pubkey, relays: relays)}';
}

void _addTlv(List<int> target, int type, List<int> value) {
  if (value.length > 255) throw ArgumentError('naddr tlv value is too long');
  target
    ..add(type)
    ..add(value.length)
    ..addAll(value);
}

List<int> _hexToBytes(String hex) {
  final lower = hex.toLowerCase();
  return [
    for (var i = 0; i < lower.length; i += 2)
      int.parse(lower.substring(i, i + 2), radix: 16),
  ];
}

List<int> _uint32Be(int value) {
  if (value < 0 || value > 0xffffffff) throw ArgumentError('kind out of range');
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

List<int> _convertBits(List<int> data, int from, int to, bool pad) {
  var acc = 0;
  var bits = 0;
  final result = <int>[];
  final maxv = (1 << to) - 1;
  final maxAcc = (1 << (from + to - 1)) - 1;
  for (final value in data) {
    if (value < 0 || value >> from != 0) {
      throw ArgumentError('invalid bech32 data');
    }
    acc = ((acc << from) | value) & maxAcc;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.add((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) result.add((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) != 0) {
    throw ArgumentError('invalid bech32 padding');
  }
  return result;
}

String _bech32Encode(String hrp, List<int> data) {
  final checksum = _createChecksum(hrp, data);
  return '${hrp}1${[...data, ...checksum].map((value) => _charset[value]).join()}';
}

({String hrp, List<int> data}) _bech32Decode(String value) {
  if (value != value.toLowerCase() && value != value.toUpperCase()) {
    throw ArgumentError('mixed-case bech32 value');
  }
  final lower = value.toLowerCase();
  final separator = lower.lastIndexOf('1');
  if (separator <= 0 || separator + 7 > lower.length) {
    throw ArgumentError('invalid bech32 value');
  }
  final hrp = lower.substring(0, separator);
  final data = lower
      .substring(separator + 1)
      .split('')
      .map(_charset.indexOf)
      .toList();
  if (data.any((value) => value < 0)) {
    throw ArgumentError('invalid bech32 data');
  }
  if (_polymod([..._hrpExpand(hrp), ...data]) != 1) {
    throw ArgumentError('invalid bech32 checksum');
  }
  return (hrp: hrp, data: data.sublist(0, data.length - 6));
}

List<int> _createChecksum(String hrp, List<int> data) {
  final values = [..._hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  final polymod = _polymod(values) ^ 1;
  return [for (var i = 0; i < 6; i++) (polymod >> (5 * (5 - i))) & 31];
}

List<int> _hrpExpand(String hrp) {
  return [
    ...hrp.codeUnits.map((codeUnit) => codeUnit >> 5),
    0,
    ...hrp.codeUnits.map((codeUnit) => codeUnit & 31),
  ];
}

int _polymod(List<int> values) {
  var chk = 1;
  for (final value in values) {
    final top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (var i = 0; i < 5; i++) {
      if (((top >> i) & 1) == 1) {
        chk ^= _generator[i];
      }
    }
  }
  return chk;
}
