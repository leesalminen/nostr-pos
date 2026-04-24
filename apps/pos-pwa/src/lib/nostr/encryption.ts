import { nip44 } from 'nostr-tools';
import { hexToBytes } from '../security/keys';

export function conversationKey(privateKeyHex: string, publicKeyHex: string): Uint8Array {
  return nip44.v2.utils.getConversationKey(hexToBytes(privateKeyHex), publicKeyHex);
}

export function encryptContent(content: unknown, privateKeyHex: string, recipientPubkeyHex: string): string {
  return nip44.v2.encrypt(JSON.stringify(content), conversationKey(privateKeyHex, recipientPubkeyHex));
}

export function decryptContent<T>(payload: string, privateKeyHex: string, senderPubkeyHex: string): T {
  return JSON.parse(nip44.v2.decrypt(payload, conversationKey(privateKeyHex, senderPubkeyHex))) as T;
}
