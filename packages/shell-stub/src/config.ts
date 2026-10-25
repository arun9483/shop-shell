/** Public New Relic browser keys. They reach the page, as they do in the Shell. */
export interface NewRelicConfig {
  accountId: string;
  trustKey: string;
  agentId: string;
  licenseKey: string;
  applicationId: string;
}

/** What the stub's server passes to its page. Public values only. */
export interface StubConfig {
  /** The MFE's name, as in the Shell's MFE list: files at /mfe/<name>/, API at /api/<name>/. */
  name: string;
  /** The MFE's route, `/<name>` by default. */
  routePrefix: string;
  newRelic?: NewRelicConfig;
}
