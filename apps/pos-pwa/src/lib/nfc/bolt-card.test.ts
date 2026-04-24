import { describe, expect, it } from 'vitest';
import { extractUrlFromNdefMessage } from './bolt-card';

describe('Bolt Card NFC helpers', () => {
  it('extracts a URL from NDEF-like records', () => {
    const data = new TextEncoder().encode('lightning:https://card.example/lnurl');
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'url', data }] })).toBe('lightning:https://card.example/lnurl');
  });

  it('expands compact NDEF URI prefixes', () => {
    const suffix = new TextEncoder().encode('card.example/lnurl');
    const data = new Uint8Array(1 + suffix.length);
    data[0] = 4;
    data.set(suffix, 1);
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'url', data }] })).toBe('https://card.example/lnurl');
  });

  it('extracts bech32 LNURL payloads', () => {
    const data = new TextEncoder().encode('LNURL1DP68GURN8GHJ7CMPWFJZUETCV9KHQMR99AKXUATJDSWU6C3Z');
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'text', data }] })).toBe(
      'LNURL1DP68GURN8GHJ7CMPWFJZUETCV9KHQMR99AKXUATJDSWU6C3Z'
    );
  });

  it('returns undefined when no URL exists', () => {
    const data = new TextEncoder().encode('hello');
    expect(extractUrlFromNdefMessage({ records: [{ recordType: 'text', data }] })).toBeUndefined();
  });
});
