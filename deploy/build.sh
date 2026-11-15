#!/usr/bin/env bash
# Builds this unit's images on any machine with Docker: the FES with its built client, and the mock
# backend. The images are the same for every tenant; the client's source maps stay out of them, in
# client/sourcemaps/. With PUBLIC_ORIGIN set, they are uploaded for that origin (deploy/upload-sourcemaps.sh).
set -euo pipefail

unit=shell
tag="${IMAGE_TAG:-latest}"

cd "$(dirname "$0")/.."
# The real path: on macOS the temp folder is a symlink, which breaks the links pnpm deploy writes.
out="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$out"' EXIT

pnpm install --frozen-lockfile
pnpm build
pnpm --filter "@shop-$unit/fes" deploy --prod "$out/fes"
pnpm --filter "@shop-$unit/mock-backend" deploy --prod "$out/backend"
cp -R client/dist "$out/fes/client-dist"

for part in fes backend; do
  docker build -t "shop-$unit-$part:$tag" -f deploy/Dockerfile "$out/$part"
done

if [ -n "${PUBLIC_ORIGIN:-}" ]; then
  deploy/upload-sourcemaps.sh
fi
