import { BrowserAgent } from '@newrelic/browser-agent/loaders/browser-agent';
import type { NewRelicConfig } from '../config.js';

/** The same Pro+SPA browser agent the Shell runs, with keys the stub's server passes in. */
export function startMonitoring({
  accountId,
  trustKey,
  agentId,
  licenseKey,
  applicationId,
}: NewRelicConfig): void {
  const keys = { licenseKey, applicationID: applicationId };
  new BrowserAgent({
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: ['bam.nr-data.net'] },
    },
    info: { beacon: 'bam.nr-data.net', errorBeacon: 'bam.nr-data.net', sa: 1, ...keys },
    loader_config: { accountID: accountId, trustKey, agentID: agentId, ...keys },
  });
}
