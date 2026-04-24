import { describe, expect, it } from 'vitest';
import { extractUrlFromNdefMessage } from './bolt-card';

describe('Bolt Card NFC helpers', () => {
  it('extracts a URL from NDEF-like records', () => {
    const data = new TextEncoder().encode('lightning:https://card.example/lnurl');
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'url', data }] })).toBe('lightning:https://card.example/lnurl');
  });

  it('returns undefined when no URL exists', () => {
    const data = new TextEncoder().encode('hello');
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'text', data }] })).toBeUndefined();
  });
});
