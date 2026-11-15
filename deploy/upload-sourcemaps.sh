#!/usr/bin/env bash
# Uploads the client's source maps (client/sourcemaps/, from the last build) to New Relic for one tenant:
# against its PUBLIC_ORIGIN, with its NEW_RELIC_USER_API_KEY and NEW_RELIC_BROWSER_APP_ID (from the
# environment or client/.env). Run once per tenant at deploy; the images do not change.
set -euo pipefail

: "${PUBLIC_ORIGIN:?Set PUBLIC_ORIGIN, e.g. https://shop.test}"
cd "$(dirname "$0")/.."
[ -d client/sourcemaps ] || { echo "No client/sourcemaps: run pnpm build first" >&2; exit 1; }
pnpm --filter @shop-shell/client upload-sourcemaps
