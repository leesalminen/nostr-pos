export function isLiquidTxid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

export function isDistinctLiquidClaimTxid(claimTxid: unknown, lockupTxid: unknown): claimTxid is string {
  if (!isLiquidTxid(claimTxid)) return false;
  return !isLiquidTxid(lockupTxid) || claimTxid.toLowerCase() !== lockupTxid.toLowerCase();
}

export function isSameLiquidTxid(a: unknown, b: unknown): boolean {
  return isLiquidTxid(a) && isLiquidTxid(b) && a.toLowerCase() === b.toLowerCase();
}
