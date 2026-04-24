import { bech32 } from 'bech32';

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
