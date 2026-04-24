import { getPublicKey } from '@noble/secp256k1';
import type { ReverseSwapRequest, ReverseSwapResponse, SwapLimits, SwapPair, SwapProvider, SwapStatus, VerificationResult } from './provider';

type Fetcher = typeof fetch;

export type BoltzProviderOptions = {
  apiBase: string;
  fetcher?: Fetcher;
  randomBytes?: (length: number) => Uint8Array;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Boltz returned an invalid response.');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Boltz response missing ${name}.`);
  return value;
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Boltz response missing ${name}.`);
  return value;
}

function normalizeStatus(status: unknown): SwapStatus {
  if (status === 'invoice.settled' || status === 'transaction.claimed') return 'invoice.paid';
  if (status === 'transaction.mempool' || status === 'transaction.server.mempool') return 'transaction.mempool';
  if (status === 'transaction.confirmed' || status === 'transaction.server.confirmed') return 'transaction.confirmed';
  if (status === 'swap.expired' || status === 'invoice.expired') return 'expired';
  if (status === 'swap.failed' || status === 'invoice.failed') return 'failed';
  return 'created';
}

export class BoltzReverseSwapProvider implements SwapProvider {
  id = 'boltz';

  private readonly apiBase: string;
  private readonly fetcher: Fetcher;
  private readonly makeRandomBytes: (length: number) => Uint8Array;

  constructor(options: BoltzProviderOptions) {
    this.apiBase = options.apiBase.replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.makeRandomBytes = options.randomBytes ?? randomBytes;
  }

  async getLimits(_pair: SwapPair): Promise<SwapLimits> {
    const response = await this.fetcher(`${this.apiBase}/v2/swap/reverse`);
    if (!response.ok) return { minSat: 1000, maxSat: 100000 };
    const json = asObject(await response.json());
    const pair = asObject(asObject(json['BTC'])['L-BTC']);
    return {
      minSat: asNumber(pair['min'], 'min'),
      maxSat: asNumber(pair['max'], 'max')
    };
  }

  async createReverseSwap(req: ReverseSwapRequest): Promise<ReverseSwapResponse> {
    const preimage = this.makeRandomBytes(32);
    const claimPrivateKey = this.makeRandomBytes(32);
    const preimageHash = await sha256Hex(preimage);
    const claimPublicKey = bytesToHex(getPublicKey(claimPrivateKey, true));
    const response = await this.fetcher(`${this.apiBase}/v2/swap/reverse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        invoiceAmount: req.invoiceSat,
        to: 'L-BTC',
        from: 'BTC',
        claimPublicKey,
        preimageHash
      })
    });
    if (!response.ok) throw new Error('Lightning is temporarily unavailable. Use Liquid instead.');
    const json = asObject(await response.json());
    const invoice = asString(json['invoice'], 'invoice');
    return {
      id: asString(json['id'], 'id'),
      invoice,
      preimage: bytesToHex(preimage),
      preimageHash,
      claimPrivateKey: bytesToHex(claimPrivateKey),
      claimPublicKey,
      timeoutBlockHeight: asNumber(json['timeoutBlockHeight'], 'timeoutBlockHeight'),
      claimAddress: req.claimAddress,
      expectedAmountSat: typeof json['onchainAmount'] === 'number' ? json['onchainAmount'] as number : req.invoiceSat,
      boltzResponse: json
    };
  }

  async getSwapStatus(id: string): Promise<SwapStatus> {
    const response = await this.fetcher(`${this.apiBase}/v2/swap/${encodeURIComponent(id)}`);
    if (!response.ok) return 'created';
    return normalizeStatus(asObject(await response.json())['status']);
  }

  verifySwap(response: ReverseSwapResponse, expected: ReverseSwapRequest): VerificationResult {
    if (response.claimAddress !== expected.claimAddress) return { ok: false, reason: 'claim address mismatch' };
    if (!response.invoice.startsWith('ln')) return { ok: false, reason: 'invalid invoice' };
    if (response.timeoutBlockHeight < 10) return { ok: false, reason: 'timeout too short' };
    if (response.expectedAmountSat <= 0 || response.expectedAmountSat > expected.invoiceSat) return { ok: false, reason: 'invalid settlement amount' };
    if (!/^[0-9a-f]{64}$/.test(response.preimageHash)) return { ok: false, reason: 'invalid preimage hash' };
    if (!/^[0-9a-f]{66}$/.test(response.claimPublicKey ?? '')) return { ok: false, reason: 'invalid claim key' };
    return { ok: true };
  }

  supportsClaimCovenants(): boolean {
    return false;
  }
}
