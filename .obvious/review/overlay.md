# Review overlay

Custom review guidance for automated code review in this repository. Architecture
detail lives in `AGENTS.md` and `.obvious/orientation.md`.

## Tooling-handled (skip in review)

- **Commit messages** — enforced by the `commitlint` CI job
  (`@commitlint/config-conventional`); do not comment on them.
- **Protocol behavior regressions** — covered by the 12-test protocol suite that runs
  in CI (`Plugin regression tests` job); do not ask for behavior tests the suite
  already establishes.
- **Manifest/package validity** — the `streamdeck validate` step in the CI `build` job
  checks the manifest against Elgato's schema on every PR.

## High-scrutiny paths

- `.github/workflows/release.yaml` — auto-publishes releases via semantic-release on
  every merge to `main`. Any change here is release-affecting; treat it as such.
- `com.dbhagen.apple-music-volume.sdPlugin/bin/plugin.js` — the sole product source
  (WebSocket wire protocol plus generated `osascript` JXA). Flag unsafe string
  interpolation into `osascript` arguments and protocol regressions the suite cannot
  cover (e.g. message ordering edge cases, reconnect handling).
- `com.dbhagen.apple-music-volume.sdPlugin/manifest.json` — the platform packaging
  contract: `SDKVersion`, permissions, and the macOS version floor are compatibility
  surfaces; changes are consumer-visible.

## Architecture notes (do not flag)

- The single-file `plugin.js` is deliberate — do not flag for refactor.
- CommonJS is deliberate — do not suggest TypeScript or a build step.

## Noisy patterns to suppress

- "add tests" — the suite exists (`test/plugin.test.js`, 12 tests in CI).
- "add types" — CommonJS/no-build is deliberate.
- Generic refactoring suggestions with no behavioral or correctness payoff.
