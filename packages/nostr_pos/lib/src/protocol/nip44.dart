import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:pointycastle/export.dart';

final _secp256k1 = ECDomainParameters('secp256k1');
final _curveP = BigInt.parse(
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
  radix: 16,
);

Uint8List nip44ConversationKey({
  required String privateKeyHex,
  required String publicKeyHex,
}) {
  final privateKey = BigInt.parse(privateKeyHex, radix: 16);
  final point = _publicKeyToPoint(publicKeyHex);
  final shared = (point * privateKey)!;
  final sharedX = _bigToBytes(shared.x!.toBigInteger()!);
  return Uint8List.fromList(_hkdfExtract(utf8.encode('nip44-v2'), sharedX));
}

String nip44Encrypt({
  required String plaintext,
  required Uint8List conversationKey,
  List<int>? nonce,
}) {
  final actualNonce = Uint8List.fromList(
    nonce ?? List<int>.generate(32, (_) => Random.secure().nextInt(256)),
  );
  if (actualNonce.length != 32) throw ArgumentError('nonce must be 32 bytes');
  final keys = _messageKeys(conversationKey, actualNonce);
  final padded = _pad(plaintext);
  final ciphertext = _chacha20(keys.chachaKey, keys.chachaNonce, padded);
  final mac = _hmacSha256(keys.hmacKey, [...actualNonce, ...ciphertext]);
  return base64
      .encode([2, ...actualNonce, ...ciphertext, ...mac])
      .replaceAll('=', '');
}

String nip44Decrypt({
  required String payload,
  required Uint8List conversationKey,
}) {
  final raw = base64.decode(base64.normalize(payload));
  if (raw.length < 99 || raw[0] != 2) {
    throw ArgumentError('invalid NIP-44 payload');
  }
  final nonce = Uint8List.fromList(raw.sublist(1, 33));
  final ciphertext = Uint8List.fromList(raw.sublist(33, raw.length - 32));
  final mac = raw.sublist(raw.length - 32);
  final keys = _messageKeys(conversationKey, nonce);
  final expected = _hmacSha256(keys.hmacKey, [...nonce, ...ciphertext]);
  if (!_constantTimeEqual(mac, expected)) {
    throw ArgumentError('invalid NIP-44 MAC');
  }
  return _unpad(_chacha20(keys.chachaKey, keys.chachaNonce, ciphertext));
}

String nip44EncryptToPubkey({
  required String plaintext,
  required String privateKeyHex,
  required String publicKeyHex,
  List<int>? nonce,
}) {
  return nip44Encrypt(
    plaintext: plaintext,
    conversationKey: nip44ConversationKey(
      privateKeyHex: privateKeyHex,
      publicKeyHex: publicKeyHex,
    ),
    nonce: nonce,
  );
}

String nip44DecryptFromPubkey({
  required String payload,
  required String privateKeyHex,
  required String publicKeyHex,
}) {
  return nip44Decrypt(
    payload: payload,
    conversationKey: nip44ConversationKey(
      privateKeyHex: privateKeyHex,
      publicKeyHex: publicKeyHex,
    ),
  );
}

({Uint8List chachaKey, Uint8List chachaNonce, Uint8List hmacKey}) _messageKeys(
  Uint8List conversationKey,
  Uint8List nonce,
) {
  final keys = _hkdfExpand(conversationKey, nonce, 76);
  return (
    chachaKey: Uint8List.fromList(keys.sublist(0, 32)),
    chachaNonce: Uint8List.fromList(keys.sublist(32, 44)),
    hmacKey: Uint8List.fromList(keys.sublist(44, 76)),
  );
}

Uint8List _pad(String plaintext) {
  final data = utf8.encode(plaintext);
  if (data.isEmpty || data.length > 65535) {
    throw ArgumentError('invalid plaintext size');
  }
  final paddedLength = _calcPaddedLength(data.length);
  return Uint8List.fromList([
    (data.length >> 8) & 0xff,
    data.length & 0xff,
    ...data,
    ...List<int>.filled(paddedLength - data.length, 0),
  ]);
}

String _unpad(Uint8List padded) {
  if (padded.length < 34) throw ArgumentError('invalid padding');
  final length = (padded[0] << 8) | padded[1];
  if (length < 1 ||
      length > 65535 ||
      padded.length != 2 + _calcPaddedLength(length) ||
      2 + length > padded.length) {
    throw ArgumentError('invalid padding');
  }
  return utf8.decode(padded.sublist(2, 2 + length));
}

int _calcPaddedLength(int length) {
  if (length < 1) throw ArgumentError('expected positive integer');
  if (length <= 32) return 32;
  final nextPower = 1 << ((log(length - 1) / ln2).floor() + 1);
  final chunk = nextPower <= 256 ? 32 : nextPower ~/ 8;
  return chunk * (((length - 1) ~/ chunk) + 1);
}

Uint8List _chacha20(Uint8List key, Uint8List nonce, Uint8List input) {
  final cipher = ChaCha7539Engine()
    ..init(true, ParametersWithIV(KeyParameter(key), nonce));
  final out = Uint8List(input.length);
  cipher.processBytes(input, 0, input.length, out, 0);
  return out;
}

List<int> _hkdfExtract(List<int> salt, List<int> ikm) => _hmacSha256(salt, ikm);

Uint8List _hkdfExpand(List<int> prk, List<int> info, int length) {
  final output = <int>[];
  var previous = <int>[];
  var counter = 1;
  while (output.length < length) {
    previous = _hmacSha256(prk, [...previous, ...info, counter]);
    output.addAll(previous);
    counter += 1;
  }
  return Uint8List.fromList(output.sublist(0, length));
}

List<int> _hmacSha256(List<int> key, List<int> message) {
  return Hmac(sha256, key).convert(message).bytes;
}

bool _constantTimeEqual(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}

ECPoint _publicKeyToPoint(String publicKeyHex) {
  final x = BigInt.parse(publicKeyHex, radix: 16);
  final y = _liftX(x);
  return _secp256k1.curve.createPoint(x, y);
}

BigInt _liftX(BigInt x) {
  if (x >= _curveP) throw ArgumentError('invalid public key');
  final ySq = (x.modPow(BigInt.from(3), _curveP) + BigInt.from(7)) % _curveP;
  final y = ySq.modPow((_curveP + BigInt.one) ~/ BigInt.from(4), _curveP);
  if (y.modPow(BigInt.two, _curveP) != ySq) {
    throw ArgumentError('invalid public key');
  }
  return y.isEven ? y : _curveP - y;
}

List<int> _bigToBytes(BigInt value) {
  final hex = value.toRadixString(16).padLeft(64, '0');
  return [
    for (var i = 0; i < hex.length; i += 2)
      int.parse(hex.substring(i, i + 2), radix: 16),
  ];
}
