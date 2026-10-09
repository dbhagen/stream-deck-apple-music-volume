# Local Development — stream-deck-apple-music-volume

Reproducible setup for this repo. Commands marked **[verified Linux]** were run
successfully in this environment (Linux, Node 20) during the October 2026
maintenance wave; commands marked **macOS-only** require macOS and are not
exercised in Linux-based development.

## Prerequisites

- **Node.js 20** (the manifest pins `Nodejs.Version: 20`; CI runs Node 20 too).
  Check with `node --version` → `v20.x`.
- **git**
- To *run* the plugin: **macOS 13+**, Stream Deck software **6.9+**, the **Apple Music
  app**, and a Stream Deck with a dial/encoder (Stream Deck+). Not needed to develop,
  test the protocol layer, validate, or pack.

## Setup

```sh
git clone https://github.com/dbhagen/stream-deck-apple-music-volume.git
cd stream-deck-apple-music-volume
cd com.dbhagen.apple-music-volume.sdPlugin
npm ci
```

`npm ci` installs exactly what `package-lock.json` pins (the only runtime dependency
is `ws`). **[verified Linux: exit 0; installs ws 8.21.0, npm reports 0 vulnerabilities]**

## Test suite

```sh
# from com.dbhagen.apple-music-volume.sdPlugin/
npm test
```

Runs `node --test test/plugin.test.js` — Node's built-in test runner, **zero extra
dependencies** (the suite reuses the plugin's `ws`). Each test starts the real
`bin/plugin.js` as a child process against a fake Stream Deck WebSocket server
(`test/helpers/fake-deck.js`, a real `WebSocketServer` on 127.0.0.1) and a fake
`osascript` executable placed first on `PATH` (`test/helpers/fake-osascript.js`) that
emulates the plugin's two Music JXA invocations against a state file and logs every
call, so tests assert wire behavior and call counts.
**[verified Linux: 12 tests, 12 pass, 0 fail, exit 0, ~11 s]**

See `.obvious/QA.md` for what this proof covers and what it cannot.

## Validate and pack

From the **repo root**:

```sh
npx --yes @elgato/cli validate com.dbhagen.apple-music-volume.sdPlugin --no-update-check
# [verified Linux] → "✔ Validation successful", exit 0

npx --yes @elgato/cli pack com.dbhagen.apple-music-volume.sdPlugin --no-update-check
# [verified Linux] → "✔ Successfully packaged plugin", exit 0
```

`pack` writes `com.dbhagen.apple-music-volume.streamDeckPlugin` to the repo root
(~85 KB with node_modules bundled). It is a build artifact and gitignored
(`*.streamDeckPlugin`) — packing locally never dirties the tree. CI (`.github/workflows/ci.yaml`) runs these same two commands and
uploads the artifact instead.

## Install into Stream Deck (macOS-only)

Symlink the plugin directory into Stream Deck's plugin folder — with the symlink, edits
to the source take effect on a Stream Deck restart without repacking:

```sh
# from the repo root
ln -s "$(pwd)/com.dbhagen.apple-music-volume.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

Then restart the Stream Deck application. **macOS-only: not verified in this
environment.**

### Remove the symlink install

```sh
rm ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

`rm` on the symlink removes only the link, not the cloned repository. Then restart
Stream Deck. (A real install — double-clicking a `.streamDeckPlugin` file or the
Marketplace flow — is removed via the Stream Deck app's plugin list.)

## Releases (do not run locally)

Merges to `main` trigger semantic-release automatically: it analyzes conventional
commits, bumps `manifest.json` `Version`, packs, publishes the GitHub release with the
`.streamDeckPlugin` attached, and pushes the manifest bump as
`chore(release): x.y.z [skip ci]`. Never bump the manifest version by hand and never
trigger the release workflow manually. Details: `DEVELOPMENT.md`.
