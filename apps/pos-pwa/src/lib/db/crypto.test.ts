import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './crypto';

describe('local field encryption', () => {
  it('round-trips encrypted JSON blobs', async () => {
    const encrypted = await encryptJson({ claim_private_key: 'secret', sale_id: 'sale1' }, 'terminal1');
    expect(encrypted).not.toContain('secret');
    await expect(decryptJson(encrypted, 'terminal1')).resolves.toEqual({
      claim_private_key: 'secret',
      sale_id: 'sale1'
    });
  });
});
