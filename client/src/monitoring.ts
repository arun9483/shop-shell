import { readAppConfig } from '@arun-dev/client';
import { BrowserAgent } from '@newrelic/browser-agent/loaders/browser-agent';

// The Pro+SPA agent: errors, browser traces and single-spa route changes. It starts before anything
// else so it sees every error. MFEs never use it directly; they call the standard `reportError`.
// Its values are the tenant's, read at runtime from the page: the Shell FES puts them there
// (PUBLIC_NEW_RELIC_* in its environment), so one build serves every tenant.
const config = readAppConfig();
const text = (field: string): string | undefined => {
  const value = config[field];
  return typeof value === 'string' && value ? value : undefined;
};

function startAgent(): BrowserAgent | undefined {
  const licenseKey = text('newRelicBrowserKey');
  const applicationID = text('newRelicApplicationId');
  if (!licenseKey || !applicationID) return undefined;
  const keys = { licenseKey, applicationID };
  return new BrowserAgent({
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: ['bam.nr-data.net'] },
    },
    info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', sa: 1, ...keys },
    loader_config: {
      accountID: text('newRelicAccountId'),
      trustKey: text('newRelicTrustKey'),
      agentID: text('newRelicAgentId'),
      ...keys,
    },
  });
}

/**
 * The browser agent, when its keys are set. Only the Shell uses it directly: after login it tags
 * every event with the user's `sub` (`setUserId`), never an email or username.
 */
export const browserAgent = startAgent();
