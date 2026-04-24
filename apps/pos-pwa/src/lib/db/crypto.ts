const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function keyFromTerminalId(terminalId: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`nostr-pos:${terminalId}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(value: unknown, terminalId: string): Promise<string> {
  const key = await keyFromTerminalId(terminalId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  const packed = new Uint8Array(iv.byteLength + encrypted.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptJson<T>(packed: string, terminalId: string): Promise<T> {
  const raw = Uint8Array.from(atob(packed), (char) => char.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const encrypted = raw.slice(12);
  const key = await keyFromTerminalId(terminalId);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return JSON.parse(decoder.decode(decrypted)) as T;
}
