# shop-shell

The Shell unit of the shop micro frontend platform: the frame, top-level routing and MFE loading.
Requirements and decisions are in [arun-mfe-platform](https://github.com/arun9483/arun-mfe-platform)
([vision](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/vision.md),
[MVP](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/mvp.md)).

| Folder                 | What                                                                             | Port   |
| ---------------------- | -------------------------------------------------------------------------------- | ------ |
| `client/`              | React + single-spa root config, built with Vite                                  | —      |
| `fes/`                 | Express FES: serves the client, `/api/shell/*`, health and version               | `3001` |
| `mock-backend/`        | Stand-in for the Shell's backend service                                         | `4001` |
| `server-common/`       | Trace context, problem+json, health and version for the servers                  | —      |
| `packages/shell-stub/` | Published as `@arun-shop/shell-stub`: runs one MFE standalone, without the Shell | —      |
| `tests/e2e/`           | Playwright + axe against the router; run on demand                               | —      |

## Run

Node 24.22.1 or newer and pnpm 11 (`corepack enable`). Older Node 24 releases abort when the New
Relic agent is on.

```sh
pnpm install
pnpm build
pnpm start          # FES and mock backend
open http://localhost:3000
```

The one public origin, `http://localhost:3000`, comes from
[shop-router](https://github.com/arun9483/shop-router): check it out next to this repository, then
run `pnpm install`, `pnpm build` and `pnpm start` there.

Each package reads its own `.env`; copy `.env.example` to `.env`. The New Relic values in it are
placeholders until the New Relic account is set up: with them nothing is reported and source map
uploads fail, but the maps are still deleted.

Catalog and Cart run from their own repositories on ports `3002` and `3003`. Until they do, their
routes show the Shell's fallback.

## Deploy

`.github/workflows/deploy-staging.yml` deploys the Shell to staging on Cloud Run: on every push to
`main` after lint, typecheck and tests pass, or by hand from any branch (**Actions → Deploy to staging →
Run workflow**). It builds the client for staging (uploading its source maps), builds one image for the
mock backend and one for the FES (`deploy/Dockerfile`), deploys the backend as a private service that
only this FES may call, then the FES, and checks the FES is ready.

`edge/` is the Cloudflare Worker that is the shop's one public origin (Worker `shop-staging` on
`workers.dev`). It only forwards to [shop-router](https://github.com/arun9483/shop-router), which does all
the routing and answers health and version. It has its own workflow,
`.github/workflows/deploy-edge-staging.yml`, run on a push to `main` that changes `edge/` or by hand: the
router's URL is fixed, so unit and router deploys do not redeploy it. It reads that URL from Cloud Run at
deploy (deploy `shop-router` first) and ends by checking every unit through the public origin.

The workflow reads every identifier from GitHub: repository variables `GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_WIF_PROVIDER`, `GCP_DEPLOYER`, `CLOUDFLARE_ACCOUNT_ID`; the secret `CLOUDFLARE_API_TOKEN`;
`staging` environment variables `PUBLIC_ORIGIN` and `VITE_NEW_RELIC_*`; and the secret
`NEW_RELIC_USER_API_KEY`. No Google key is stored: GitHub Actions logs in with workload identity
federation.

## Check

```sh
pnpm lint && pnpm typecheck && pnpm test   # unit tests (Vitest)
pnpm test:e2e                               # end-to-end (needs `pnpm build`)
```

The end-to-end tests start the Shell and every MFE in `tests/e2e/mfes.ts` whose repository is
checked out next to this one (`../shop-catalog`, `../shop-cart`) or at `SHOP_<NAME>_DIR`, and built.
`specs/mfes.spec.ts` checks each available MFE the same way; an MFE that is not available shows the
Shell's fallback. MFE-specific pages are in `specs/<name>.spec.ts`.

## Test errors

`/test-error?kind=` with `render`, `event`, `promise`, `fes` or `backend` triggers each kind of error
for checking New Relic and source maps.

## Login (MVP-2)

Off by default: without `AUTH_ENABLED=true` the Shell is MVP-1 unchanged, and the client asks for no user.
[shop-mfe-platform](https://github.com/arun9483/shop-mfe-platform)'s `docker/compose.sso.yaml` turns it on
on Docker, with Keycloak; the design is
[MVP-2](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/mvp-2-sso.md).

| Part                                      | What it does                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell FES `/auth/login`, `/auth/callback` | Signs users in as `shell-fes` (authorization code with PKCE), one encrypted cookie per attempt, then the three session cookies: `shop_at` (`Path=/`), `shop_rt` (`Path=/auth`), `shop_id` (`Path=/auth/logout`) |
| `POST /auth/refresh`, `POST /auth/logout` | Same-origin only. Logout ends the IdP's session; the IdP then sends the browser to `/auth/logged-out`, which tells the other tabs                                                                               |
| FES gate                                  | Pages and `/api/shell/*` need a valid `shop_at`; the gate asks the backend's `/me`, reused for 15 s                                                                                                             |
| Backend                                   | Checks the token, then the user's session, account and Shell roles at the IdP with its own service access token, reused for 15 s; `GET /me`                                                                     |
| `server-common/src/auth/`                 | Token checks, the IdP adapter (Keycloak), the gate and the backend checks. Copied to Catalog and Cart in phase 3                                                                                                |
| Client                                    | The user and **Log out** in the header, the `401` → refresh → retry wrapper with a Web Lock shared by every tab, tabs kept in step with `BroadcastChannel('shop-auth')`, `newrelic.setUserId(sub)`              |

**Settings.** `fes/.env` and `mock-backend/.env` hold `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`: each server's
copy of the secret in `keycloak/.env` (`SHELL_FES_SECRET`, `SHELL_BACKEND_SECRET`), and the two must match.
`fes/.env` also holds `AUTH_COOKIE_KEY` (`openssl rand -hex 32`). Docker adds `AUTH_ENABLED`, `OIDC_ISSUER_URL`,
`OIDC_INTERNAL_URL` and `PUBLIC_ORIGIN`.

**Tests.** `server-common/src/auth/auth.test.ts`, `fes/src/login.test.ts` and `client/src/auth.test.ts` run
with `pnpm test`. `tests/e2e/specs/sso.spec.ts` logs in through Keycloak's page on the Docker stack:

```sh
E2E_SSO=1 E2E_BASE_URL=https://shop.test TEST_USER_PASSWORD=… pnpm test:e2e
```

Without `E2E_SSO`, the suite is MVP-1's, with login off.

## Identity provider settings

`keycloak/shop-shell.yaml` holds this repository's settings in the shop's identity provider (Keycloak realm `shop`):
the `shell-fes` client, the only one that signs users in, and the `shell-backend` client with the Shell's roles. [shop-mfe-platform](https://github.com/arun9483/shop-mfe-platform) applies it on Docker when single
sign-on runs, together with every other repository's file. Roles are granted through this repository's own groups. Copy `keycloak/.env.example` to `keycloak/.env` and set random secrets. Nothing in this repository reads it yet; see
[MVP-2](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/mvp-2-sso.md).
