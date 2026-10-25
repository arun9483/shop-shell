# Changesets

Releases of `@arun-shop/shell-stub` are made with [changesets](https://github.com/changesets/changesets).
In a change to `packages/shell-stub`, run `pnpm changeset`, pick the bump and describe the change. When it
reaches `main`, the Release workflow opens a version PR; merging that PR publishes to npm.

The Shell's own packages (`client`, `fes`, `router`, …) are private: they are neither versioned nor
published.
