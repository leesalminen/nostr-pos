import { describe, expect, it } from 'vitest';
import { pairingCodeFromPubkey } from './keys';

describe('terminal pairing code', () => {
  it('matches the shared vector', () => {
    expect(
      pairingCodeFromPubkey('23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1')
    ).toBe('4F7G-YJDP');
  });
});
