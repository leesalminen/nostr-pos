const maxWholeDigits = 9;
const maxCentsDigits = 2;

export function applyAmountInput(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return current ? `${current}.` : '0.';
  }
  if (!/^\d$/.test(key)) return current;

  const [whole, cents] = current.split('.');
  if (cents !== undefined) {
    if (cents.length >= maxCentsDigits) return current;
    return `${whole}.${cents}${key}`;
  }

  const next = `${current}${key}`.replace(/^0+(?=\d)/, '');
  return next.length > maxWholeDigits ? current : next;
}
