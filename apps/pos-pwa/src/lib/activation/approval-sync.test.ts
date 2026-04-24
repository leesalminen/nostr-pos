import { describe, expect, it } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import { encryptContent } from '../nostr/encryption';
import { signEvent } from '../nostr/pool';
import type { TerminalConfig } from '../pos/types';
import { configFromApprovalEvent, findTerminalApproval } from './approval-sync';

const terminalKeys = createTerminalKeypair();
const merchantKeys = createTerminalKeypair();

const config: TerminalConfig = {
  merchantName: 'Seguras Butcher',
  posName: 'Counter 1',
  currency: 'CRC',
  terminalId: 'term1',
  terminalPubkey: terminalKeys.publicKey,
  terminalPrivkeyEnc: terminalKeys.privateKey,
  pairingCode: '4F7G-YJDP',
  maxInvoiceSat: 100000,
  syncServers: ['wss://one']
};

const approval = {
  type: 'terminal_authorization',
  terminal_pubkey: terminalKeys.publicKey,
  terminal_name: 'Front Counter',
  pairing_code_hint: '4F7G-YJDP',
  expires_at: 2000000000,
  limits: { max_invoice_sat: 50000 },
  liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }],
  merchant_recovery_pubkey: merchantKeys.publicKey
};

describe('approval relay sync', () => {
  it('applies plaintext approval events for CLI pilot flows', () => {
    const event = signEvent(
      {
        kind: 30381,
        tags: [['p', terminalKeys.publicKey]],
        content: JSON.stringify(approval),
        created_at: 1000
      },
      merchantKeys.privateKey
    );

    expect(configFromApprovalEvent(config, event, 1000)?.posName).toBe('Front Counter');
  });

  it('decrypts approval events addressed to the terminal', () => {
    const event = signEvent(
      {
        kind: 30381,
        tags: [['p', terminalKeys.publicKey]],
        content: encryptContent(approval, merchantKeys.privateKey, terminalKeys.publicKey),
        created_at: 1000
      },
      merchantKeys.privateKey
    );

    expect(configFromApprovalEvent(config, event, 1000)?.authorization?.merchant_recovery_pubkey).toBe(merchantKeys.publicKey);
  });

  it('finds the newest matching approval from fetched events', async () => {
    const stale = signEvent(
      {
        kind: 30381,
        tags: [['p', terminalKeys.publicKey]],
        content: JSON.stringify({ ...approval, terminal_name: 'Old Counter' }),
        created_at: 1000
      },
      merchantKeys.privateKey
    );
    const newest = signEvent(
      {
        kind: 30381,
        tags: [['p', terminalKeys.publicKey]],
        content: JSON.stringify(approval),
        created_at: 2000
      },
      merchantKeys.privateKey
    );

    const approved = await findTerminalApproval(config, async () => [stale, newest]);
    expect(approved?.posName).toBe('Front Counter');
  });
});
