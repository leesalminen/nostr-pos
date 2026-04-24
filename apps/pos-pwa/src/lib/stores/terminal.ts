import { writable } from 'svelte/store';
import type { TerminalConfig } from '../pos/types';
import { configWithTerminalAuthorization } from '../activation/authorization';
import { defaultTerminalConfig, getTerminalConfig, saveTerminalConfig } from '../db/repositories/terminal';
import { configWithPosProfile, resolvePosProfile } from '../pos/profile-loader';
import { createAdminPin } from '../security/admin-pin';

export const terminal = writable<TerminalConfig | undefined>(undefined);

export async function loadTerminal(): Promise<TerminalConfig> {
  let config = await getTerminalConfig();
  if (!config) {
    config = defaultTerminalConfig();
    await saveTerminalConfig(config);
  }
  terminal.set(config);
  return config;
}

export async function activateTerminal(): Promise<TerminalConfig> {
  const config = await loadTerminal();
  const activated = { ...config, activatedAt: Date.now() };
  await saveTerminalConfig(activated);
  terminal.set(activated);
  return activated;
}

export async function applyTerminalApproval(raw: string): Promise<TerminalConfig> {
  const config = await loadTerminal();
  const approved = configWithTerminalAuthorization(config, raw);
  await saveTerminalConfig(approved);
  terminal.set(approved);
  return approved;
}

export async function loadPosProfileReference(reference: string): Promise<TerminalConfig> {
  const config = await loadTerminal();
  const profile = await resolvePosProfile(reference);
  const updated = configWithPosProfile(config, profile);
  await saveTerminalConfig(updated);
  terminal.set(updated);
  return updated;
}

export async function setAdminPin(pin: string): Promise<TerminalConfig> {
  const config = await loadTerminal();
  const updated = { ...config, adminPin: await createAdminPin(pin) };
  await saveTerminalConfig(updated);
  terminal.set(updated);
  return updated;
}

export async function clearAdminPin(): Promise<TerminalConfig> {
  const config = await loadTerminal();
  const { adminPin: _adminPin, ...updated } = config;
  await saveTerminalConfig(updated);
  terminal.set(updated);
  return updated;
}
