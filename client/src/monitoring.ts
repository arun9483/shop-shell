import { BrowserAgent } from '@newrelic/browser-agent/loaders/browser-agent';

// The Pro+SPA agent: errors, browser traces and single-spa route changes. It starts before anything
// else so it sees every error. MFEs never use it directly; they call the standard `reportError`.
const env = import.meta.env;

function startAgent(): BrowserAgent | undefined {
  if (!env.VITE_NEW_RELIC_LICENSE_KEY || !env.VITE_NEW_RELIC_APPLICATION_ID) return undefined;
  const keys = {
    licenseKey: env.VITE_NEW_RELIC_LICENSE_KEY,
    applicationID: env.VITE_NEW_RELIC_APPLICATION_ID,
  };
  return new BrowserAgent({
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: ['bam.nr-data.net'] },
    },
    info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', sa: 1, ...keys },
    loader_config: {
      accountID: env.VITE_NEW_RELIC_ACCOUNT_ID,
      trustKey: env.VITE_NEW_RELIC_TRUST_KEY,
      agentID: env.VITE_NEW_RELIC_AGENT_ID,
      ...keys,
    },
  });
}

/**
 * The browser agent, when its keys are set. Only the Shell uses it directly: after login it tags
 * every event with the user's `sub` (`setUserId`), never an email or username.
 */
export const browserAgent = startAgent();
