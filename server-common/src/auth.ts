/** Headers for a call to the unit's backend. */
export type BackendHeaders = () => Promise<Record<string, string>>;

/** No auth: the mock backend on a developer's machine. */
export const noBackendAuth: BackendHeaders = () => Promise.resolve({});

// Google's metadata server, reachable from every Cloud Run instance.
const METADATA = 'http://metadata.google.internal/computeMetadata/v1';
// Identity tokens last an hour; one is reused until ten minutes before that.
const REUSE_FOR_MS = 50 * 60 * 1000;

/**
 * On Cloud Run the backend is private: it accepts only its own FES's service account. This gets
 * that account's Google identity token for `audience` (the backend's URL) and sends it as a bearer
 * token, reusing it until close to expiry.
 */
export function googleBackendAuth(audience: string, metadataUrl = METADATA): BackendHeaders {
  let cached: { token: string; until: number } | undefined;
  return async () => {
    if (!cached || Date.now() >= cached.until) {
      // format=full adds the service account's email, which the receiving service checks against
      // its invoker permission.
      const url = `${metadataUrl}/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`;
      const res = await fetch(url, {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error(`Identity token for ${audience}: HTTP ${res.status}`);
      const token = (await res.text()).trim();
      if (!token) throw new Error(`Identity token for ${audience}: empty response`);
      cached = { token, until: Date.now() + REUSE_FOR_MS };
    }
    return { Authorization: `Bearer ${cached.token}` };
  };
}

/** `BACKEND_AUTH=google` on Cloud Run; nothing locally. */
export function backendAuth(mode: string | undefined, audience: string): BackendHeaders {
  return mode === 'google' ? googleBackendAuth(audience) : noBackendAuth;
}
