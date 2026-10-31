# shop-shell

The Shell unit of the shop micro frontend platform: the frame, top-level routing and MFE loading.
Requirements and decisions are in [arun-mfe-platform](https://github.com/arun9483/arun-mfe-platform)
([vision](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/vision.md),
[MVP](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/mvp.md)).

| Folder                 | What                                                                             | Port   |
| ---------------------- | -------------------------------------------------------------------------------- | ------ |
| `client/`              | React + single-spa root config, built with Vite                                  | —      |
| `fes/`                 | Express FES: serves the client, `/api/shell/*`, health and version               | `3001` |
| `mock-backend/`        | Dev only. Stand-in for the Shell's backend service                               | `4001` |
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
`workers.dev`). Like `shop-router`, it sends `/mfe/<name>` and `/api/<name>` to that MFE's FES and
everything else to the Shell's FES, and hides `/health` and `/version`. It has its own workflow,
`.github/workflows/deploy-edge-staging.yml`, run on a push to `main` that changes `edge/` or by hand:
the FES URLs are fixed per service, so unit deploys do not redeploy it. It reads those URLs from Cloud
Run at deploy (deploy every unit's FES first) and ends by checking every unit through the public origin.

The workflow reads every identifier from GitHub: repository variables `GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_WIF_PROVIDER`, `GCP_DEPLOYER`, `CLOUDFLARE_ACCOUNT_ID`; the secret `CLOUDFLARE_API_TOKEN`;
`staging` environment variables `PUBLIC_ORIGIN` and `VITE_NEW_RELIC_*`; and the secret
`NEW_RELIC_USER_API_KEY`. No Google key is stored: GitHub Actions signs in with workload identity
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
