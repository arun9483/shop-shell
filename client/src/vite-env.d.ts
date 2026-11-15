interface ImportMetaEnv {
  readonly VITE_LAZY_CHUNK_TIMEOUT_MS?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_MFE_LOAD_TIMEOUT_MS?: string;
  readonly VITE_MFE_MOUNT_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// CSS-only entry points of the design system's tokens.
declare module '@arun-dev/tokens/base';
declare module '@arun-dev/tokens/brands/arun';
declare module '@arun-dev/tokens/primitives/fonts';
