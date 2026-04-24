import { describe, expect, it } from 'vitest';
import { deriveLiquidAddress, liquidBip21 } from './address';
import type { TerminalConfig } from '../pos/types';

const config: TerminalConfig = {
  merchantName: 'Seguras Butcher',
  posName: 'Counter 1',
  currency: 'CRC',
  terminalId: 'ABCD1234',
  terminalPubkey: '23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1',
  pairingCode: '4F7G-YJDP',
  maxInvoiceSat: 100000,
  syncServers: ['wss://no.str.cr', 'wss://relay.primal.net']
};

describe('Liquid address adapter', () => {
  it('derives a stable terminal-scoped address', () => {
    expect(deriveLiquidAddress(config, 42)).toEqual({
      address: 'tex1q23cf0f49b6112a000000000000000000000000',
      addressIndex: 42,
      terminalBranch: 17
    });
  });

  it('creates BIP21 payloads in BTC units', () => {
    expect(liquidBip21('tex1qabc', 25000)).toBe('liquid:tex1qabc?amount=0.00025000');
  });
});
