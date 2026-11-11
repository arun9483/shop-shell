/** How a server reaches the shop's identity provider (IdP). See MVP-2 in arun-mfe-platform. */
export interface OidcSettings {
  /** The issuer every token carries, e.g. `https://shop.test:8443/realms/shop`. */
  issuer: string;
  /** Where this server reaches the IdP, e.g. `http://keycloak:8080/realms/shop` inside Docker. */
  internalUrl: string;
  /** This server's own client at the IdP. */
  clientId: string;
  clientSecret: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} must be set when AUTH_ENABLED=true`);
  return value;
}

/**
 * The IdP settings when `AUTH_ENABLED=true`, otherwise undefined: auth is off by default, and the
 * server then behaves as in MVP-1. A missing setting stops the server at start.
 */
export function oidcSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OidcSettings | undefined {
  if (env.AUTH_ENABLED !== 'true') return undefined;
  const issuer = required(env, 'OIDC_ISSUER_URL');
  return {
    issuer,
    internalUrl: env.OIDC_INTERNAL_URL ?? issuer,
    clientId: required(env, 'OIDC_CLIENT_ID'),
    clientSecret: required(env, 'OIDC_CLIENT_SECRET'),
  };
}
