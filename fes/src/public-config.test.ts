import { describe, expect, it } from 'vitest';
import { PUBLIC_FIELDS, publicConfig } from './public-config.js';

describe('publicConfig', () => {
  it('holds exactly the allowed New Relic browser fields', () => {
    expect(Object.keys(PUBLIC_FIELDS).sort()).toEqual([
      'newRelicAccountId',
      'newRelicAgentId',
      'newRelicApplicationId',
      'newRelicBrowserKey',
      'newRelicTrustKey',
    ]);
    expect(Object.values(PUBLIC_FIELDS).every((name) => name.startsWith('PUBLIC_'))).toBe(true);
  });

  it('takes only the allowed variables, never a secret or anything else in the environment', () => {
    const env = {
      PUBLIC_NEW_RELIC_ACCOUNT_ID: '1',
      PUBLIC_NEW_RELIC_TRUST_KEY: '2',
      PUBLIC_NEW_RELIC_AGENT_ID: '3',
      PUBLIC_NEW_RELIC_APPLICATION_ID: '4',
      PUBLIC_NEW_RELIC_BROWSER_KEY: 'browser-key',
      NEW_RELIC_LICENSE_KEY: 'secret-license',
      NEW_RELIC_USER_API_KEY: 'secret-api',
      OIDC_CLIENT_SECRET: 'secret-client',
      AUTH_COOKIE_KEY: 'secret-cookie',
      PUBLIC_SOMETHING_ELSE: 'not listed',
    };
    const config = publicConfig(env);
    expect(config).toEqual({
      newRelicAccountId: '1',
      newRelicTrustKey: '2',
      newRelicAgentId: '3',
      newRelicApplicationId: '4',
      newRelicBrowserKey: 'browser-key',
    });
    expect(JSON.stringify(config)).not.toMatch(/secret|not listed/);
  });

  it('leaves out fields that are not set', () => {
    expect(
      publicConfig({ PUBLIC_NEW_RELIC_ACCOUNT_ID: '1', PUBLIC_NEW_RELIC_AGENT_ID: '' }),
    ).toEqual({
      newRelicAccountId: '1',
    });
  });
});
