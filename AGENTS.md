# AGENTS.md

Orientation for agents (and humans) working in this repository.

## What this repo is

A Stream Deck+ plugin that controls Apple Music volume from a dial/encoder on macOS.
Node 20, CommonJS, **no build step**: `com.dbhagen.apple-music-volume.sdPlugin/bin/plugin.js`
is the shipped code. The only runtime dependency is `ws`.

## Layout

| Path | Role |
| --- | --- |
| `com.dbhagen.apple-music-volume.sdPlugin/` | The plugin (Elgato `.sdPlugin` convention) |
| `…/manifest.json` | SDK v3 manifest. Action UUID `com.dbhagen.apple-music-volume.control`, Encoder-only controller, layout `$B1`, Node 20, macOS 13+, Stream Deck 6.9+. The `Version` field is owned by semantic-release — never bump it by hand. |
| `…/bin/plugin.js` | The entire plugin: Stream Deck WebSocket protocol, dial/touch handling, `osascript` JXA calls to Music.app |
| `…/pi/inspector.html` | Property Inspector: step size input, clamped 1–25, default 1 |
| `…/imgs/` | Action, category, and plugin icons |
| `…/test/` | Protocol-level regression suite (`npm test`, Node built-in `node --test`): spawns the real plugin against a fake Stream Deck WS server and a fake `osascript` |
| `…/package.json` | Runtime deps (`ws`), `type: commonjs`. Note: its `version` field is *not* the release version; `manifest.json` is. |
| `marketing/` | Elgato Marketplace submission assets (gallery images, thumbnail) |
| `.github/workflows/ci.yaml` | PR checks: commitlint + validate/pack + plugin regression tests |
| `.github/workflows/release.yaml` | semantic-release on push to `main` |
| `.releaserc.json` | Release config: bump manifest `Version` via `jq`, pack, publish GitHub release, commit bump back |
| `.obvious/` | Agent docs: orientation, local dev, QA |
| `DEVELOPMENT.md` | Human-oriented development guide |
| `README.md` | User-facing overview and install steps |

## Commands

Verified on Linux from the repo root unless noted:

```sh
# Install plugin dependencies (run inside com.dbhagen.apple-music-volume.sdPlugin/)
npm ci

# Run the test suite (run inside com.dbhagen.apple-music-volume.sdPlugin/)
npm test

# Validate + pack (repo root)
npx --yes @elgato/cli validate com.dbhagen.apple-music-volume.sdPlugin --no-update-check
npx --yes @elgato/cli pack com.dbhagen.apple-music-volume.sdPlugin --no-update-check
```

`pack` writes `com.dbhagen.apple-music-volume.streamDeckPlugin` to the repo root —
a build artifact; do not commit it.

**macOS-only (not runnable on a Linux box):** installing the plugin into Stream Deck
via the symlink path and running it against Music.app / Stream Deck hardware. See
`.obvious/QA.md` for the exact proof boundary.

## Platform boundary

Runtime is macOS-only (`osascript` JXA against `Application("Music")`). On Linux you
can: install dependencies, run the protocol-level test suite, validate, and pack. You
cannot: run the plugin end-to-end or exercise Music.app or Stream Deck hardware.

## Conventions

- **Conventional commits**, enforced by the commitlint CI job (`fix:`, `feat:`, `chore:`, …).
- **Releases are automatic.** Merges to `main` trigger semantic-release, which analyzes
  commits, bumps `manifest.json` `Version`, packs, publishes a GitHub release, and commits
  the bump as `chore(release): x.y.z [skip ci]`. Never run a release manually.
- **Dependabot runs in security-updates mode** (no `.github/dependabot.yml` in the repo),
  so expect PRs only for vulnerable dependency versions.

## More detail

- `.obvious/orientation.md` — codebase map and key flows
- `.obvious/local-dev.md` — reproducible local setup
- `.obvious/QA.md` — QA approach, regression suite, Linux vs macOS proof boundary
- `DEVELOPMENT.md` — the same information, written for humans
