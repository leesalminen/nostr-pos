import { describe, expect, it } from 'vitest';
import { configWithTerminalAuthorization, parseTerminalAuthorization } from './authorization';
import type { TerminalConfig } from '../pos/types';

const baseConfig: TerminalConfig = {
  merchantName: 'Seguras Butcher',
  posName: 'Counter 1',
  currency: 'CRC',
  terminalId: 'term1',
  terminalPubkey: 'a'.repeat(64),
  pairingCode: '4F7G-YJDP',
  maxInvoiceSat: 100000,
  syncServers: []
};

const approval = {
  type: 'terminal_authorization',
  terminal_pubkey: baseConfig.terminalPubkey,
  terminal_name: 'Front Counter',
  pairing_code_hint: baseConfig.pairingCode,
  expires_at: 200,
  limits: { max_invoice_sat: 50000 },
  liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
};

describe('terminal authorization import', () => {
  it('parses raw content and full event JSON', () => {
    expect(parseTerminalAuthorization(JSON.stringify(approval)).terminal_name).toBe('Front Counter');
    expect(parseTerminalAuthorization(JSON.stringify({ content: JSON.stringify(approval) })).terminal_name).toBe('Front Counter');
  });

  it('activates matching approval and applies terminal limits', () => {
    const updated = configWithTerminalAuthorization(baseConfig, JSON.stringify(approval), 1000);
    expect(updated.activatedAt).toBe(1000);
    expect(updated.posName).toBe('Front Counter');
    expect(updated.maxInvoiceSat).toBe(50000);
    expect(updated.authorization?.liquid_backends?.[0]?.url).toBe('https://liquid.example/api');
  });

  it('rejects approval for another terminal', () => {
    expect(() =>
      configWithTerminalAuthorization(
        baseConfig,
        JSON.stringify({ ...approval, terminal_pubkey: 'b'.repeat(64) }),
        1000
      )
    ).toThrow('does not match');
  });
});
