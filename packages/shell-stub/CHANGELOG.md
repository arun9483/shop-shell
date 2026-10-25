# @arun-shop/shell-stub

## 0.2.0

### Minor Changes

- 3e78614: Add `--dev`: development mode with HMR. The stub runs the MFE's own Vite (from its `node_modules`, with
  its `vite.config.ts`) inside its own process, so the MFE's source is served on the stub's origin with HMR
  and React Fast Refresh; the API still goes to the FES. `--dev-root` names the MFE's Vite project
  (default `client`) and `--dev-entry` its source entry (default `src/entry.tsx`). Without `--dev`,
  nothing changes.

  Ports: a port in use is now a clear message instead of a stack trace, `--port 0` picks any free port,
  and `SHELL_STUB_PORT` / `SHELL_STUB_MFE_URL` override the flags for other ports on one machine. An MFE
  URL must start with `http://` or `https://`.

## 0.1.2

### Patch Changes

- b30192d: Released with changesets and npm trusted publishing from `release.yml`, as in arun-design-system.
