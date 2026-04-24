// ignore_for_file: experimental_member_use

import 'dart:typed_data';

import 'package:ndk/shared/nips/nip44/nip44.dart' as ndk_nip44;

Uint8List nip44ConversationKey({
  required String privateKeyHex,
  required String publicKeyHex,
}) {
  return ndk_nip44.Nip44.deriveConversationKey(
    ndk_nip44.Nip44.computeSharedSecret(privateKeyHex, publicKeyHex),
  );
}

Future<String> nip44Encrypt({
  required String plaintext,
  required Uint8List conversationKey,
  List<int>? nonce,
}) {
  return ndk_nip44.Nip44.encryptMessage(
    plaintext,
    '',
    '',
    customConversationKey: conversationKey,
    customNonce: nonce == null ? null : Uint8List.fromList(nonce),
  );
}

Future<String> nip44Decrypt({
  required String payload,
  required Uint8List conversationKey,
}) {
  return ndk_nip44.Nip44.decryptMessage(
    payload,
    '',
    '',
    customConversationKey: conversationKey,
  );
}

Future<String> nip44EncryptToPubkey({
  required String plaintext,
  required String privateKeyHex,
  required String publicKeyHex,
  List<int>? nonce,
}) {
  return ndk_nip44.Nip44.encryptMessage(
    plaintext,
    privateKeyHex,
    publicKeyHex,
    customNonce: nonce == null ? null : Uint8List.fromList(nonce),
  );
}

Future<String> nip44DecryptFromPubkey({
  required String payload,
  required String privateKeyHex,
  required String publicKeyHex,
}) {
  return ndk_nip44.Nip44.decryptMessage(payload, privateKeyHex, publicKeyHex);
}
