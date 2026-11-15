import type { AppConfigValue } from '@arun-dev/server/http';

/**
 * The only settings the Shell FES puts in the page (MVP-3 phase 2): the tenant's New Relic browser
 * agent values, public by design (they were in the client bundle before). Each field names one
 * environment variable with the `PUBLIC_` prefix, which no secret uses; nothing else from the
 * environment can reach the page.
 */
export const PUBLIC_FIELDS = {
  newRelicAccountId: 'PUBLIC_NEW_RELIC_ACCOUNT_ID',
  newRelicTrustKey: 'PUBLIC_NEW_RELIC_TRUST_KEY',
  newRelicAgentId: 'PUBLIC_NEW_RELIC_AGENT_ID',
  newRelicApplicationId: 'PUBLIC_NEW_RELIC_APPLICATION_ID',
  newRelicBrowserKey: 'PUBLIC_NEW_RELIC_BROWSER_KEY',
} as const;

export type PublicConfig = Partial<Record<keyof typeof PUBLIC_FIELDS, string>>;

/** The page's public settings from `env`: only the fields above, and only those that are set. */
export function publicConfig(env: NodeJS.ProcessEnv = process.env): Record<string, AppConfigValue> {
  return Object.fromEntries(
    Object.entries(PUBLIC_FIELDS)
      .map(([field, name]) => [field, env[name] || undefined] as const)
      .filter(([, value]) => value !== undefined),
  );
}
