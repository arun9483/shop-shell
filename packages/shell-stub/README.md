# @arun-shop/shell-stub

Runs one micro frontend of the shop platform standalone: the
[Shell's](https://github.com/arun9483/shop-shell) page setup, without the Shell app. The MFE runs
unchanged, through the same single-spa lifecycles and `domElement` prop as in the Shell.

The stub page loads what the Shell loads for every MFE: the Arun design system's CSS with the `arun`
brand, the Inter font, the Shell's base styles and single-spa. Its server proxies the MFE's files and
API to the MFE's own FES, so the browser talks to one origin.

## Use

In an MFE repository:

```sh
pnpm add -D @arun-shop/shell-stub
```

```json
{
  "scripts": {
    "standalone": "shell-stub --name catalog --mfe-url http://localhost:3002 --port 3102"
  }
}
```

Start the MFE's FES and backend (`pnpm start`), then `pnpm standalone`, and open
http://localhost:3102/catalog.

| Option       | Meaning                                                        | Default   |
| ------------ | -------------------------------------------------------------- | --------- |
| `--name`     | The MFE's name: files at `/mfe/<name>/`, API at `/api/<name>/` | required  |
| `--mfe-url`  | The MFE's FES                                                  | required  |
| `--port`     | The stub's port; `0` picks any free port                       | `3100`    |
| `--route`    | The MFE's route                                                | `/<name>` |
| `--env-file` | A `.env` with New Relic browser keys, to report errors         | none      |

### Ports

The stub needs one port, in development mode too (Vite runs inside it). If the port is taken, it says
so and exits: pass another `--port`, or `--port 0` for any free port (it prints the URL it got).

To use other ports on one machine without editing `package.json`, set `SHELL_STUB_PORT` and
`SHELL_STUB_MFE_URL`, in the shell or in the `--env-file`. They override the flags, because an MFE's
script always passes them. The FES port itself is the MFE's own setting (`PORT` in its `fes/.env`);
point `SHELL_STUB_MFE_URL` at it when you change it.

New Relic is off unless the env file sets all of `NEW_RELIC_ACCOUNT_ID`, `NEW_RELIC_TRUST_KEY`,
`NEW_RELIC_AGENT_ID`, `NEW_RELIC_BROWSER_LICENSE_KEY` and `NEW_RELIC_BROWSER_APPLICATION_ID`. These are
the Shell's public browser keys.

The stub uses the same `@arun-dev/ui` and `@arun-dev/tokens` versions as the Shell, so an MFE looks the
same standalone as in the Shell. Requires Node 24.22.1 or newer.

### Theme

The stub's header has the Shell's theme switcher: light, dark or system. It is the same component as
in the Shell, so the MFE can be checked in every theme without the Shell. The choice is kept in the
browser for the stub's origin and applied before the first paint. The MFE needs nothing for it: the
brand's colour tokens follow `data-theme` on `<html>`.

## Development mode (HMR)

With `--dev`, the stub runs the MFE's own Vite (from the MFE's `node_modules`, with its
`vite.config.ts`) inside its own process and serves the MFE's source through it. Edits show at once
through hot module replacement, and React Fast Refresh keeps component state. One process and one
port: HMR runs on the stub's origin, and the API still goes to `--mfe-url`.

```json
{
  "scripts": {
    "standalone:dev": "shell-stub --name catalog --mfe-url http://localhost:3002 --port 3102 --dev"
  }
}
```

| Option        | Meaning                            | Default         |
| ------------- | ---------------------------------- | --------------- |
| `--dev`       | Development mode with HMR          | off             |
| `--dev-root`  | The MFE's Vite project             | `client`        |
| `--dev-entry` | The entry in that project's source | `src/entry.tsx` |

The MFE needs no extra Vite configuration: its usual `base` (`/mfe/<name>/`) is kept. Browser
debugging works on the original TypeScript through Vite's source maps, and Vite's compile errors show
in the stub's terminal and in its browser overlay. Production builds are unaffected.

## Release

Releases are made with [changesets](https://github.com/changesets/changesets), as in
[arun-design-system](https://github.com/arun9483/arun-design-system). In `shop-shell`, with a change to
this package, run `pnpm changeset` and describe it. When it reaches `main`, the Release workflow
(`.github/workflows/release.yml`) opens a version PR; merging that PR publishes to npm with trusted
publishing and provenance, tags `@arun-shop/shell-stub@<version>` and creates a GitHub release.
