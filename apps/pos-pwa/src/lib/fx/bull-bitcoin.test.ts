import { describe, expect, it } from 'vitest';
import { decodeIndexPrice, fiatToSats } from './bull-bitcoin';

describe('Bull Bitcoin FX helpers', () => {
  it('decodes precision-scaled index prices', () => {
    expect(decodeIndexPrice({ indexPrice: 3549391698, precision: 2 })).toBe(35493916.98);
  });

  it('converts fiat to sats', () => {
    expect(fiatToSats(8500, { indexPrice: 3549391698, precision: 2 })).toBe(23948);
  });
});
