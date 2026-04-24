import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToHex(data);
}

export function pairingCodeFromPubkey(pubkeyHex: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(pubkeyHex)) {
    throw new Error('expected 32-byte terminal key');
  }

  const firstFive = pubkeyHex.slice(0, 10);
  let value = BigInt(`0x${firstFive}`);
  const chars = Array<string>(8);
  for (let i = 7; i >= 0; i -= 1) {
    chars[i] = alphabet[Number(value & BigInt(31))];
    value >>= BigInt(5);
  }
  const raw = chars.join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function createTerminalKeypair() {
  const secretKey = generateSecretKey();
  const privateKey = bytesToHex(secretKey);
  const publicKey = getPublicKey(secretKey);
  return { privateKey, publicKey };
}
