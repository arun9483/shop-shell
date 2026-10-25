export interface Settings {
  /** The stub's port; 0 asks the system for any free port. */
  port: number;
  /** The MFE's FES. */
  mfeUrl: string;
}

export const DEFAULT_PORT = 3100;

/**
 * The port and FES URL, from SHELL_STUB_PORT and SHELL_STUB_MFE_URL if set, else from the flags.
 * The environment wins because an MFE's script always passes the flags: it is how a machine with
 * other ports changes them without editing package.json.
 */
export function resolveSettings(
  flags: { port?: string | undefined; mfeUrl?: string | undefined },
  env: NodeJS.ProcessEnv,
): Settings {
  const rawPort = env.SHELL_STUB_PORT ?? flags.port ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port > 65535) {
    throw new Error(`shell-stub: the port must be a number from 0 to 65535, not "${rawPort}"`);
  }

  const mfeUrl = env.SHELL_STUB_MFE_URL ?? flags.mfeUrl;
  if (!mfeUrl) throw new Error('shell-stub: --mfe-url (or SHELL_STUB_MFE_URL) is required');
  const protocol = URL.canParse(mfeUrl) ? new URL(mfeUrl).protocol : '';
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`shell-stub: the MFE URL must start with http:// or https://, not "${mfeUrl}"`);
  }

  return { port, mfeUrl };
}
