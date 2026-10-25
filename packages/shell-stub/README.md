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
| `--port`     | The stub's port                                                | `3100`    |
| `--route`    | The MFE's route                                                | `/<name>` |
| `--env-file` | A `.env` with New Relic browser keys, to report errors         | none      |

New Relic is off unless the env file sets all of `NEW_RELIC_ACCOUNT_ID`, `NEW_RELIC_TRUST_KEY`,
`NEW_RELIC_AGENT_ID`, `NEW_RELIC_BROWSER_LICENSE_KEY` and `NEW_RELIC_BROWSER_APPLICATION_ID`. These are
the Shell's public browser keys.

The stub uses the same `@arun-dev/ui` and `@arun-dev/tokens` versions as the Shell, so an MFE looks the
same standalone as in the Shell. Requires Node 24.22.1 or newer.

## Release

From `shop-shell`: bump `version` in `packages/shell-stub/package.json`, commit, then push the tag
`shell-stub-v<version>`. `.github/workflows/release-shell-stub.yml` publishes it with npm trusted
publishing.
