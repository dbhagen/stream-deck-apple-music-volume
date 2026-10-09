# Development

This guide covers building, testing, and releasing the Stream Deck Apple Music Volume
plugin. For a user-facing overview see the [README](README.md); for agent-oriented
docs see [AGENTS.md](AGENTS.md) and the `.obvious/` directory.

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 20 (check: `node --version`) | installing, testing, packing |
| git | any recent | cloning |
| macOS 13+ with Apple Music + Stream Deck 6.9+ | — | actually *running* the plugin |

The plugin itself is plain CommonJS JavaScript with no build or transpile step —
`com.dbhagen.apple-music-volume.sdPlugin/bin/plugin.js` is the shipped code, and its
only runtime dependency is [`ws`](https://github.com/websockets/ws).

## Getting started

```sh
git clone https://github.com/dbhagen/stream-deck-apple-music-volume.git
cd stream-deck-apple-music-volume
cd com.dbhagen.apple-music-volume.sdPlugin
npm ci
```

## Running the tests

```sh
# from com.dbhagen.apple-music-volume.sdPlugin/
npm test
```

Runs `node --test test/plugin.test.js` — Node's built-in test runner, with no extra
dependencies (the suite reuses the plugin's `ws`). Each test starts the **real** plugin
(`bin/plugin.js`) as a child process against a fake Stream Deck WebSocket server
(`test/helpers/fake-deck.js`) and a fake `osascript` executable placed first on `PATH`
(`test/helpers/fake-osascript.js`) that emulates Music's `soundVolume` get/set against a
state file and logs every call. That makes the suite a behavior-level regression gate: it
asserts wire behavior (what the plugin sends, how many `osascript` calls it makes) rather
than implementation details, and it runs on any OS with Node 20 — including Linux CI.
Note that protocol tests cannot exercise real AppleScript/Music.app integration; see the
macOS QA checklist in `.obvious/QA.md` for the hardware acceptance path.

## Validating and packing

From the repository root:

```sh
npx --yes @elgato/cli validate com.dbhagen.apple-music-volume.sdPlugin --no-update-check
npx --yes @elgato/cli pack com.dbhagen.apple-music-volume.sdPlugin --no-update-check
```

`validate` checks the manifest against Elgato's schema; `pack` produces
`com.dbhagen.apple-music-volume.streamDeckPlugin` at the repo root. That file is a build
artifact and is gitignored (`*.streamDeckPlugin`) — it never needs committing. CI runs
both commands on every PR and uploads the packed file as a workflow artifact.

## Installing your local build (macOS)

Symlink the plugin folder into Stream Deck's plugin directory and restart Stream Deck;
while the symlink is in place, source edits take effect after a Stream Deck restart
without repacking:

```sh
ln -s "$(pwd)/com.dbhagen.apple-music-volume.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

To remove it, delete the symlink (not the repo) and restart Stream Deck:

```sh
rm ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

The first time the plugin drives Apple Music, macOS shows an Automation permission
prompt for **Music.app** — accept it. If it was denied before, fix it under
System Settings → Privacy & Security → Automation. Plugin log output lives at
`~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin/logs/`
(newest file: `com.dbhagen.apple-music-volume.0.log`).

## How releases work

Releases are fully automatic — do not run them manually and do not edit versions by hand:

1. Every merge to `main` triggers the `Release` workflow (`.github/workflows/release.yaml`),
   so a qualifying commit releases immediately on merge. Example from this repository:
   when the `fix(ci)` commit that reworked the pack step merged, semantic-release
   automatically published v1.1.1 and pushed the `chore(release): 1.1.1 [skip ci]`
   manifest-bump commit — no human ran a release.
2. [semantic-release](https://semantic-release.gitbook.io/) analyzes the commit history
   (conventional commits: `fix:` → patch, `feat:` → minor, breaking → major) and decides
   the next version.
3. Its `prepareCmd` (see `.releaserc.json`) rewrites `Version` in the plugin's
   `manifest.json` to `<x.y.z>.0` via `jq`, then packs the plugin.
4. The GitHub release is published with the `.streamDeckPlugin` file attached, and the
   manifest bump is committed back as `chore(release): x.y.z [skip ci]`.

Consequences to know about:

- `manifest.json` `Version` is the source of truth for the released version. The
  `version` field in `com.dbhagen.apple-music-volume.sdPlugin/package.json` is *not*
  kept in sync and is not used by releases.
- Commit messages on `main` must follow Conventional Commits (enforced by the
  commitlint CI job on PRs) — they decide whether the next release is a patch, minor,
  or major.

## Dependabot

Dependabot watches the plugin's dependencies in **security-updates mode** (there is no
`.github/dependabot.yml`; only vulnerable versions raise PRs, such as the `ws` DoS-fix
bumps). Expect occasional `chore(deps): …` PRs against the sdPlugin directory — review
them like any other PR, since the packed plugin bundles `node_modules`.
