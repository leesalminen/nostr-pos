import { describe, expect, it } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import { decryptContent, encryptContent } from './encryption';

describe('NIP-44 v2 content encryption', () => {
  it('round-trips JSON between terminal and recovery key', () => {
    const terminal = createTerminalKeypair();
    const recovery = createTerminalKeypair();

    const payload = encryptContent({ sale_id: 'sale1', amount: 25000 }, terminal.privateKey, recovery.publicKey);

    expect(payload).not.toContain('sale1');
    expect(decryptContent(payload, recovery.privateKey, terminal.publicKey)).toEqual({
      sale_id: 'sale1',
      amount: 25000
    });
  });
});
