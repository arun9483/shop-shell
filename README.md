# shop-shell

The Shell unit of the shop micro frontend platform: the frame, top-level routing and MFE loading.
Requirements and decisions are in [arun-mfe-platform](https://github.com/arun9483/arun-mfe-platform)
([vision](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/vision.md),
[MVP](https://github.com/arun9483/arun-mfe-platform/blob/main/docs/mvp.md)).

| Folder          | What                                                               | Port   |
| --------------- | ------------------------------------------------------------------ | ------ |
| `client/`       | React + single-spa root config, built with Vite                    | —      |
| `fes/`          | Express FES: serves the client, `/api/shell/*`, health and version | `3001` |
| `mock-backend/` | Dev only. Stand-in for the Shell's backend service                 | `4001` |
| `router/`       | Dev only. The one public origin, routing by path as a CDN would    | `3000` |
| `tests/e2e/`    | Playwright + axe against the router; run on demand                 | —      |

## Run

Node 24.22.1 or newer and pnpm 11 (`corepack enable`). Older Node 24 releases abort when the New
Relic agent is on.

```sh
pnpm install
pnpm build
pnpm start          # router, FES and mock backend
open http://localhost:3000
```

Each package reads its own `.env`; copy `.env.example` to `.env`. The New Relic values in it are
placeholders until the New Relic account is set up: with them nothing is reported and source map
uploads fail, but the maps are still deleted.

Catalog and Cart run from their own repositories on ports `3002` and `3003`. Until they do, their
routes show the Shell's fallback.

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
