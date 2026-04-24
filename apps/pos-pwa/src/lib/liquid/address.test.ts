import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizationDescriptor, deriveLiquidAddress, liquidBip21 } from './address';
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps deterministic fallback addresses for dev/test harnesses', async () => {
    await expect(deriveLiquidAddress(config, 42)).resolves.toEqual({
      address: 'tex1q23cf0f49b6112a000000000000000000000000',
      addressIndex: 42,
      terminalBranch: 17
    });
  });

  it('requires a descriptor before production address derivation', async () => {
    vi.stubEnv('PROD', true);

    await expect(deriveLiquidAddress(config, 42)).rejects.toThrow(
      'Liquid descriptor is required'
    );
  });

  it('reads descriptors from terminal authorization settlement payloads', () => {
    expect(
      authorizationDescriptor({
        ...config,
        authorization: {
          settlement: {
            type: 'liquid_ct_descriptor',
            ct_descriptor: ' ct(slip77(00),elwpkh(xpub-demo/0/*)) ',
            terminal_branch: 23
          }
        }
      })
    ).toBe('ct(slip77(00),elwpkh(xpub-demo/0/*))');
  });

  it('creates BIP21 payloads in BTC units', () => {
    expect(liquidBip21('tex1qabc', 25000)).toBe('liquid:tex1qabc?amount=0.00025000');
  });
});
