import { describe, expect, it, vi } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import type { TerminalConfig } from './types';

describe('terminal recovery backup sync', () => {
  it('does not query terminal-addressed recovery gift wraps in v0.3', async () => {
    const terminal = createTerminalKeypair();
    const config: TerminalConfig = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: terminal.publicKey,
      terminalPrivkeyEnc: terminal.privateKey,
      pairingCode: '4F7G-YJDP',
      activatedAt: 1000,
      maxInvoiceSat: 100000,
      syncServers: ['wss://one']
    };
    const fetchEvents = vi.fn(async () => []);
    const { syncTerminalRecoveryBackups } = await import('./recovery-sync');

    await expect(syncTerminalRecoveryBackups(config, fetchEvents)).resolves.toBe(0);
    expect(fetchEvents).not.toHaveBeenCalled();
  });
});
