import type { AdminPinConfig } from '../pos/types';

const encoder = new TextEncoder();
const unlockKey = 'nostr-pos:admin-unlocked-until';
export const ADMIN_PIN_ITERATIONS = 600000;
export const ADMIN_UNLOCK_MS = 5 * 60_000;

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function validatePin(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits.');
}

async function deriveVerifier(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const stableSalt = new Uint8Array(salt.byteLength);
  stableSalt.set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: stableSalt as BufferSource, iterations },
    material,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function createAdminPin(pin: string, iterations = ADMIN_PIN_ITERATIONS, now = Date.now()): Promise<AdminPinConfig> {
  validatePin(pin);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: bytesToBase64(salt),
    verifier: await deriveVerifier(pin, salt, iterations),
    iterations,
    setAt: now
  };
}

export async function verifyAdminPin(pin: string, config: AdminPinConfig): Promise<boolean> {
  validatePin(pin);
  const verifier = await deriveVerifier(pin, base64ToBytes(config.salt), config.iterations);
  return verifier === config.verifier;
}

export function markAdminUnlocked(now = Date.now(), ttl = ADMIN_UNLOCK_MS): void {
  sessionStorage.setItem(unlockKey, String(now + ttl));
}

export function isAdminUnlocked(now = Date.now()): boolean {
  return Number(sessionStorage.getItem(unlockKey) ?? 0) > now;
}

export function clearAdminUnlock(): void {
  sessionStorage.removeItem(unlockKey);
}
