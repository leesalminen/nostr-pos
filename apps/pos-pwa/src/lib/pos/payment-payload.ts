import { liquidBip21 } from '../liquid/address';
import type { PaymentMethod } from './types';

export function paymentPayload(method: PaymentMethod, amountSat: number, saleId: string, liquidAddress?: string): string {
  if (method === 'liquid') return liquidBip21(liquidAddress ?? `tex1q${saleId.toLowerCase()}`, amountSat);
  if (method === 'bolt_card') return `lnbc${amountSat}n1p${saleId.toLowerCase()}boltcard`;
  return `lnbc${amountSat}n1p${saleId.toLowerCase()}lightning`;
}
