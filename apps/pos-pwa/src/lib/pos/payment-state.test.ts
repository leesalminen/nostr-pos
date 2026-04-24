import { describe, expect, it } from 'vitest';
import { recoveryDurabilityMet } from './payment-state';

describe('payment preparation safety', () => {
  it('requires two backup server confirmations before showing Lightning payment data', () => {
    expect(
      recoveryDurabilityMet({
        results: [
          { relay: 'wss://one', ok: true },
          { relay: 'wss://two', ok: false },
          { relay: 'wss://three', ok: true }
        ]
      })
    ).toBe(true);

    expect(
      recoveryDurabilityMet({
        results: [
          { relay: 'wss://one', ok: true },
          { relay: 'wss://two', ok: false }
        ]
      })
    ).toBe(false);
  });
});
