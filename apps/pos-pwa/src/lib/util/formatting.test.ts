import { describe, expect, it } from 'vitest';
import { formatFiat } from './formatting';

describe('formatFiat', () => {
  it('does not force cents unless requested', () => {
    expect(formatFiat(12, 'USD')).toMatch(/12(?!\.00)/);
  });

  it('shows cents when decimal input mode is active', () => {
    expect(formatFiat(12.3, 'USD', true)).toContain('12.30');
  });
});
