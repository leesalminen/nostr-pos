const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const privateKey = randomHex(32);
  const publicKey = randomHex(32);
  return { privateKey, publicKey };
}
