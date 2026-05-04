import { bytesToHex, hexToBytes } from '../security/keys';
import type { TerminalConfig } from '../pos/types';

const encoder = new TextEncoder();

export function epochDayFromUnix(seconds: number): number {
  return Math.floor(seconds / 86400);
}

export async function dailyBucketTag(input: {
  secretHex: string;
  generation: number;
  epochDayUtc: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(input.secretHex) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${input.generation}:${input.epochDayUtc}`)
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function bucketWindow(input: {
  secretHex: string;
  generation: number;
  epochDayUtc: number;
}): Promise<string[]> {
  return Promise.all([
    dailyBucketTag({ ...input, epochDayUtc: input.epochDayUtc - 1 }),
    dailyBucketTag(input),
    dailyBucketTag({ ...input, epochDayUtc: input.epochDayUtc + 1 })
  ]);
}

export function saleBucketConfig(config: TerminalConfig): { secretHex: string; generation: number } | undefined {
  const secretHex = config.saleBucketSecret;
  const generation = config.saleBucketGeneration;
  if (!secretHex && generation === undefined) return { secretHex: '0'.repeat(64), generation: 1 };
  if (!secretHex || !/^[0-9a-fA-F]{64}$/.test(secretHex)) return undefined;
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) return undefined;
  return { secretHex, generation };
}

export async function saleBucketTagForConfig(config: TerminalConfig, createdAtMs: number): Promise<string | undefined> {
  const bucket = saleBucketConfig(config);
  if (!bucket) return undefined;
  return dailyBucketTag({
    ...bucket,
    epochDayUtc: epochDayFromUnix(Math.floor(createdAtMs / 1000))
  });
}

export function jitteredUnix(baseMs: number, spreadSeconds = 300): number {
  const base = Math.floor(baseMs / 1000);
  const offset = Math.floor(Math.random() * (spreadSeconds * 2 + 1)) - spreadSeconds;
  return Math.max(0, base + offset);
}
