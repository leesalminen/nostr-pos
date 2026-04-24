import { writable } from 'svelte/store';
import type { TerminalConfig } from '../pos/types';
import { defaultTerminalConfig, getTerminalConfig, saveTerminalConfig } from '../db/repositories/terminal';

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
