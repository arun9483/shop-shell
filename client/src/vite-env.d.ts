interface ImportMetaEnv {
  readonly VITE_NEW_RELIC_ACCOUNT_ID?: string;
  readonly VITE_NEW_RELIC_TRUST_KEY?: string;
  readonly VITE_NEW_RELIC_AGENT_ID?: string;
  readonly VITE_NEW_RELIC_LICENSE_KEY?: string;
  readonly VITE_NEW_RELIC_APPLICATION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSS-only entry points of the design system's tokens.
declare module '@arun-dev/tokens/base';
declare module '@arun-dev/tokens/brands/arun';
