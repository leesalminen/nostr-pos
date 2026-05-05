import { describe, expect, it } from 'vitest';
import { applyAmountInput } from './amount-input';

describe('amount keypad input', () => {
  it('enters whole amounts without cents until decimal is pressed', () => {
    expect(['1', '2', '3'].reduce(applyAmountInput, '')).toBe('123');
  });

  it('starts cents entry with 0 when decimal is pressed first', () => {
    expect(applyAmountInput('', '.')).toBe('0.');
  });

  it('allows up to two cents digits after decimal', () => {
    const entered = ['1', '2', '.', '3', '4', '5'].reduce(applyAmountInput, '');
    expect(entered).toBe('12.34');
  });

  it('keeps only one decimal point', () => {
    expect(['1', '.', '.', '2'].reduce(applyAmountInput, '')).toBe('1.2');
  });

  it('deletes across cents and decimal point', () => {
    expect(['1', '2', '.', '3', 'back', 'back', '4'].reduce(applyAmountInput, '')).toBe('124');
  });
});
