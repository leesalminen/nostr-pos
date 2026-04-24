import { describe, expect, it } from 'vitest';
import { toPlainJson } from './plain';

describe('plain IndexedDB values', () => {
  it('turns proxy-shaped records into cloneable plain JSON', () => {
    const record = new Proxy(
      {
        id: 'sale1',
        nested: new Proxy({ status: 'settled', omitted: undefined }, {})
      },
      {}
    );

    const plain = toPlainJson(record);

    expect(plain).toEqual({ id: 'sale1', nested: { status: 'settled' } });
    expect(() => structuredClone(plain)).not.toThrow();
  });
});
