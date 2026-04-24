import { describe, expect, it, vi } from 'vitest';
import { clearAdminUnlock, createAdminPin, isAdminUnlocked, markAdminUnlocked, verifyAdminPin } from './admin-pin';

describe('admin PIN security', () => {
  it('creates a PBKDF2 verifier and verifies the PIN', async () => {
    const config = await createAdminPin('123456', 2, 1000);

    expect(config.salt).toHaveLength(24);
    expect(config.verifier).not.toContain('123456');
    await expect(verifyAdminPin('123456', config)).resolves.toBe(true);
    await expect(verifyAdminPin('654321', config)).resolves.toBe(false);
  });

  it('rejects malformed PINs', async () => {
    await expect(createAdminPin('abc', 2)).rejects.toThrow('PIN must be 4 to 8 digits.');
    await expect(createAdminPin('123456789', 2)).rejects.toThrow('PIN must be 4 to 8 digits.');
  });

  it('tracks short-lived session unlocks', () => {
    vi.stubGlobal('sessionStorage', window.sessionStorage);
    clearAdminUnlock();

    markAdminUnlocked(1000, 5000);

    expect(isAdminUnlocked(2000)).toBe(true);
    expect(isAdminUnlocked(7000)).toBe(false);
    clearAdminUnlock();
    expect(isAdminUnlocked(2000)).toBe(false);
  });
});
