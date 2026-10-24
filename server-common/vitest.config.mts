import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests never report to New Relic.
    env: { NEW_RELIC_ENABLED: 'false', NEW_RELIC_NO_CONFIG_FILE: 'true', NEW_RELIC_LOG: 'stdout' },
  },
});
