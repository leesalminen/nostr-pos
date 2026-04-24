import type { PaymentMethod, SaleStatus } from '../pos/types';

export function formatFiat(amount: string | number, currency: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'CRC' ? 0 : 2
  }).format(value);
}

export function formatSats(sats: number): string {
  return new Intl.NumberFormat().format(sats) + ' sats';
}

export function methodLabel(method?: PaymentMethod): string {
  if (method === 'liquid') return 'Liquid';
  if (method === 'bolt_card') return 'Bolt Card';
  if (method === 'lightning_swap') return 'Lightning';
  return 'Payment';
}

export function statusLabel(status: SaleStatus): string {
  const labels: Record<SaleStatus, string> = {
    created: 'Ready',
    payment_preparing: 'Waiting for payment',
    payment_ready: 'Waiting for payment',
    payment_detected: 'Payment detected',
    settling: 'Settling',
    settled: 'Paid',
    receipt_ready: 'Paid',
    expired: 'Expired',
    failed: 'Failed',
    needs_recovery: 'Needs recovery',
    cancelled: 'Failed'
  };
  return labels[status];
}

export function shortId(value?: string): string {
  if (!value) return 'Pending';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}
