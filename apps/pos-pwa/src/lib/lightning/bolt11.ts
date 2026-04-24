import { bech32 } from 'bech32';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export type Bolt11InvoiceDetails = {
  invoice: string;
  prefix: string;
  amountSat?: number;
  paymentHash?: string;
};

export function normalizeBolt11Invoice(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const invoice = trimmed.toLowerCase().startsWith('lightning:') ? trimmed.slice('lightning:'.length).trim() : trimmed;
  try {
    const decoded = bech32.decode(invoice, 5000);
    return decoded.prefix.toLowerCase().startsWith('ln') ? invoice : undefined;
  } catch {
    return undefined;
  }
}

function wordsToHex(words: number[]): string {
  return Array.from(bech32.fromWords(words), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseAmountSat(prefix: string): number | undefined {
  const match = prefix.match(/^ln(?:bc|tb|bcrt|sb)(\d+)?([munp])?$/i);
  if (!match) return undefined;
  const [, digits, unit] = match;
  if (!digits) return undefined;
  const amount = BigInt(digits);
  let msat: bigint;
  if (!unit) msat = amount * BigInt(100_000_000_000);
  else if (unit === 'm') msat = amount * BigInt(100_000_000);
  else if (unit === 'u') msat = amount * BigInt(100_000);
  else if (unit === 'n') msat = amount * BigInt(100);
  else msat = amount / BigInt(10);
  if (msat % BigInt(1000) !== BigInt(0)) return undefined;
  const sats = Number(msat / BigInt(1000));
  return Number.isSafeInteger(sats) ? sats : undefined;
}

export function decodeBolt11Invoice(value?: string): Bolt11InvoiceDetails | undefined {
  const invoice = normalizeBolt11Invoice(value);
  if (!invoice) return undefined;
  try {
    const decoded = bech32.decode(invoice, 5000);
    const prefix = decoded.prefix.toLowerCase();
    const details: Bolt11InvoiceDetails = {
      invoice,
      prefix,
      amountSat: parseAmountSat(prefix)
    };
    let offset = 7;
    const signatureWords = 104;
    const tagEnd = decoded.words.length - signatureWords;
    while (offset + 3 <= tagEnd) {
      const tag = BECH32_CHARSET[decoded.words[offset]];
      const dataLength = decoded.words[offset + 1] * 32 + decoded.words[offset + 2];
      offset += 3;
      if (offset + dataLength > tagEnd) break;
      const data = decoded.words.slice(offset, offset + dataLength);
      if (tag === 'p') details.paymentHash = wordsToHex(data).slice(0, 64);
      offset += dataLength;
    }
    return details;
  } catch {
    return undefined;
  }
}
