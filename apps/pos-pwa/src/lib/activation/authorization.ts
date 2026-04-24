import type { TerminalAuthorization, TerminalConfig } from '../pos/types';

type TerminalAuthorizationPayload = TerminalAuthorization & {
  type?: string;
  terminal_pubkey?: string;
  terminal_name?: string;
  pairing_code_hint?: string;
  expires_at?: number;
  limits?: {
    max_invoice_sat?: number;
  };
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  const object = asObject(parsed);
  if (!object) throw new Error('Approval must be a JSON object.');
  return object;
}

export function parseTerminalAuthorization(raw: string): TerminalAuthorizationPayload {
  const parsed = parseJsonObject(raw);
  const content = parsed.content;
  const payload = typeof content === 'string' ? parseJsonObject(content) : asObject(content) ?? parsed;
  return payload as TerminalAuthorizationPayload;
}

export function configWithTerminalAuthorization(
  config: TerminalConfig,
  raw: string,
  now = Date.now()
): TerminalConfig {
  const authorization = parseTerminalAuthorization(raw);
  if (authorization.type !== 'terminal_authorization') {
    throw new Error('Approval is not for a payment terminal.');
  }
  if (authorization.terminal_pubkey !== config.terminalPubkey) {
    throw new Error('Approval does not match this terminal.');
  }
  if (authorization.pairing_code_hint !== config.pairingCode) {
    throw new Error('Approval code does not match this terminal.');
  }
  if (authorization.expires_at && authorization.expires_at * 1000 <= now) {
    throw new Error('Approval has expired.');
  }

  return {
    ...config,
    posName: authorization.terminal_name ?? config.posName,
    maxInvoiceSat: authorization.limits?.max_invoice_sat ?? config.maxInvoiceSat,
    authorization,
    activatedAt: now
  };
}
