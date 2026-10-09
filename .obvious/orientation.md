# Codebase Orientation — stream-deck-apple-music-volume

Codebase map for agents. Every claim below was verified against the source on
`main` during the October 2026 maintenance wave.

## Repository at a glance

Stream Deck+ plugin (SDK v3) exposing one action, `com.dbhagen.apple-music-volume.control`,
on the **Encoder controller only**, that:

- adjusts Apple Music volume by dial rotation (configurable step size 1–25, default 1),
- toggles mute on dial press or touch tap (remembering and restoring the pre-mute level),
- shows volume % + progress bar on the dial's touchscreen strip (`$B1` layout),
- coalesces fast dial spins (50 ms window) and keeps at most one `osascript` set in flight,
- polls Music.app volume every 2 s to reconcile external changes.

Node 20, CommonJS, no build step, single runtime dependency (`ws`).

## File map

| File | Role |
| --- | --- |
| `com.dbhagen.apple-music-volume.sdPlugin/manifest.json` | SDK v3 manifest. Action `com.dbhagen.apple-music-volume.control`; `Controllers: ["Encoder"]`; encoder layout `$B1` with `TriggerDescription` (Rotate: Volume, Push/Touch: Mute / Unmute); `PropertyInspectorPath: pi/inspector.html`; `CodePath: bin/plugin.js`; `Nodejs.Version: 20` with `Debug: enabled`; `OS: mac >= 13`; `Software.MinimumVersion: 6.9`. `Version` (e.g. `1.1.1.0`) is rewritten by semantic-release on every release. |
| `com.dbhagen.apple-music-volume.sdPlugin/bin/plugin.js` | The whole plugin (~330 lines, CommonJS). Startup CLI-arg parsing, Stream Deck WebSocket, dial/touch handling, tick coalescing, mute state, polling, feedback payloads, `logMessage` logging. |
| `com.dbhagen.apple-music-volume.sdPlugin/pi/inspector.html` | Property Inspector. Number input `#stepSize` (min 1, max 25, default 1). On connect: registers, sends `getSettings`, hydrates the field from `didReceiveSettings` or the action info payload. On change: clamps to 1–25 and sends `setSettings` with `{ stepSize: val }`. |
| `com.dbhagen.apple-music-volume.sdPlugin/package.json` | `name: com.dbhagen.apple-music-volume.sdplugin`, `type: commonjs`, dependency `ws: ^8.21.0`, script `test: node --test test/plugin.test.js`. Its `version` field is a placeholder — the release version lives in `manifest.json`. |
| `com.dbhagen.apple-music-volume.sdPlugin/package-lock.json` | Lockfile for the `ws` dependency (used by `npm ci`). |
| `com.dbhagen.apple-music-volume.sdPlugin/test/plugin.test.js` | 12 protocol-level regression tests (`node --test`, zero extra deps). Spawns the real `bin/plugin.js` as a child process and asserts wire behavior: registration, poll+feedback, step size, coalescing (one `set` per burst, no leak), mute/restore, rotate-while-muted, clamps, external-change reconciliation, poll stop, multi-context. |
| `com.dbhagen.apple-music-volume.sdPlugin/test/helpers/fake-deck.js` | Fake Stream Deck: a real `WebSocketServer` on 127.0.0.1 (uses the plugin's `ws` dep) that records every plugin message and forwards synthetic events (`willAppear`, `dialRotate`, `dialDown`, …). |
| `com.dbhagen.apple-music-volume.sdPlugin/test/helpers/fake-osascript.js` | Fake `osascript` placed first on `PATH`; emulates exactly the plugin's two JXA invocations (`soundVolume()` get / `soundVolume = <n>` set) against a `FAKE_MUSIC_STATE` file with 0–100 clamping, appending every call to `calls.log` for count assertions. |
| `com.dbhagen.apple-music-volume.sdPlugin/test/helpers/fixture.js` | Test harness: temp state dir, `PATH` injection, plugin child-process spawn with fixture env/args, cleanup via `node:test` context; exposes `startPluginFixture`/`waitFor`/`sleep`. |
| `com.dbhagen.apple-music-volume.sdPlugin/imgs/` | `action`, `category`, `plugin` icons in `.png` + `@2x.png` + `.svg` variants. |
| `marketing/` | Elgato Marketplace submission assets: gallery images and thumbnail (`.png` + `.svg` each). |
| `.github/workflows/ci.yaml` | PR checks, three jobs. `commitlint` (Lint commits): `npx commitlint --from <base> --to <head>`. `build` (Validate and pack): `npm ci` in the sdPlugin dir → `npx --yes @elgato/cli validate …` → `npx --yes @elgato/cli pack …` → upload `*.streamDeckPlugin` artifact named `apple-music-volume-streamdeck-plugin`. `Plugin regression tests`: `npm ci` + `npm test` in the sdPlugin dir. |
| `.github/workflows/release.yaml` | On push to `main`: `npm ci`, installs `semantic-release` + `@semantic-release/exec` + `@semantic-release/git` + `@elgato/cli`, runs `npx semantic-release`. |
| `.releaserc.json` | Release plugins: commit-analyzer, release-notes-generator, `exec` (prepareCmd: `jq` writes `${nextRelease.version}.0` into manifest `Version`, then `npx streamdeck pack … --no-update-check`), `github` (attaches `*.streamDeckPlugin`), `git` (commits the manifest bump as `chore(release): ${nextRelease.version} [skip ci]`). |
| `.commitlintrc.json` | Extends `@commitlint/config-conventional`. |
| `.gitignore` | `node_modules/`, `*.log`, `.DS_Store`, `.claude/`, `*.streamDeckPlugin` — pack output is ignored, so it never dirties the tree. |
| `LICENSE` | MIT. |
| `.obvious/` | This documentation: `orientation.md`, `local-dev.md`, `QA.md`, `config.yml`, `obvious.md`, `review/overlay.md`. |
| `DEVELOPMENT.md` / `README.md` | Human-facing development guide / user-facing overview. |

## Key locations in `bin/plugin.js` (line numbers at main f739a45)

| Lines | What |
| --- | --- |
| `plugin.js:8` | `arg(name)` — startup CLI-arg parsing (port, registration params) |
| `plugin.js:23-27` | Plugin state: websocket handle, `currentVolume` (-1 = unknown), `preMuteVolume`, poll timer, `POLL_MS` = 2000 |
| `plugin.js:37` | `getVolume()` — one in-flight `osascript` get at a time (`pendingGet` dedup) |
| `plugin.js:58-67` | `setVolume(vol)` / `drainSetQueue()` — single in-flight set (`pendingSet`), latest queued value wins (`nextSetValue`) |
| `plugin.js:103-117` | `COALESCE_MS` = 50, `onDialRotate(ticks, stepSize)` / `flushRotation()` — rapid ticks accumulate and flush once per window |
| `plugin.js:138` | `toggleMute()` — mute to 0, remember `preMuteVolume`, restore on second press |
| `plugin.js:155-182` | `poll()` / `startPolling()` / `stopPolling()` — 2 s reconciliation with Music; stops on last `willDisappear` |
| `plugin.js:192-198` | `updateAllFeedback()` / `updateFeedback(context)` — per-context title/value/indicator payload, `MUTED` + dimmed when muted |
| `plugin.js:223-229` | `send(payload)` / `handleMessage(msg)` — outbound JSON, inbound event switch |
| `plugin.js:240-296` | Event cases: `willAppear`, `willDisappear`, `didReceiveSettings`, `dialRotate`, `dialDown`, `touchTap` |
| `plugin.js:297` | `log()` — `logMessage` with `[AppleMusicVol]` prefix |
| `plugin.js:307` | `connect()` — WebSocket setup and registration |

## Key flows in `bin/plugin.js`

### 1. Startup and WebSocket connection

Stream Deck launches the plugin with CLI args `-port`, `-pluginUUID`, `-registerEvent`,
`-info` (JSON). `connect()` opens `ws://localhost:<port>`; on open it sends the register
event with the plugin UUID and logs `Plugin registered`. On close it stops polling. The
WebSocket is the only transport; every inbound message is JSON parsed in `handleMessage`
(unparseable messages are silently dropped — the peer is always Stream Deck itself).

### 2. Stream Deck event handling (`handleMessage`)

`switch` on `event`, with an action-UUID guard for action-scoped events (other actions'
events are ignored):

- `willAppear` — registers the instance context in `contexts` (Map: context →
  `{ settings }`), starts polling, and sends initial feedback if the volume is already known.
- `willDisappear` — deletes the context; when the last one is gone, polling stops.
- `didReceiveSettings` — updates the stored settings for that context (e.g. after the
  Property Inspector sends `setSettings`).
- `dialRotate` — reads `payload.ticks` and the context's `stepSize` (parsed from settings,
  defaulting to 1) and hands off to `onDialRotate`.
- `dialDown` / `touchTap` — both call `toggleMute()`.

### 3. Dial-rotation coalescing (`onDialRotate` → `flushRotation`)

A fast spin delivers many `dialRotate` events. Ticks accumulate in `accumulatedTicks` and a
single `setTimeout(flushRotation, COALESCE_MS /* 50 */)` runs per burst. On flush:

1. If muted (`preMuteVolume !== null`), **unmute first**: currentVolume = preMuteVolume, mute cleared.
2. `base` = `currentVolume`, or 50 if the volume is still unknown (`-1` sentinel).
3. `setVolume(base + ticks × lastStepSize)`.

### 4. Volume set pipeline (`setVolume` / `drainSetQueue`)

`setVolume` clamps/rounds to 0–100, records the target in `nextSetValue`, and calls
`drainSetQueue`, which keeps **at most one `osascript` set in flight** (`pendingSet`); when
it completes it drains the latest queued value (latest target wins — intermediate values
are skipped). `setVolume` also updates the UI **optimistically**: `currentVolume` and all
feedback are updated immediately, before the `osascript` round-trip.

The osascript invocations are JXA:

- get: `osascript -l JavaScript -e 'Application("Music").soundVolume()'` (5 s timeout,
  concurrent reads deduped via `pendingGet`)
- set: `osascript -l JavaScript -e 'Application("Music").soundVolume = <N>'` (5 s timeout)

### 5. Mute / unmute (`toggleMute`)

- If muted: restore `preMuteVolume` and clear the mute state.
- Else if `currentVolume > 0`: remember it, then `setVolume(0)`.
- Else (already at 0, not muted): no-op.

The pre-mute level is in-memory only — it does not survive a plugin restart.

### 6. Polling (`poll` / `startPolling` / `stopPolling`)

`POLL_MS = 2000`. An immediate poll fires when the first instance appears, then
`setInterval`. Each poll: `getVolume()` (deduped), and the result is applied **only if no
set is pending or in flight** (`nextSetValue === null && pendingSet === null`) so external
reads never stomp the optimistic UI. On an external change it updates `currentVolume`,
clears a stale mute state if the external volume is > 0, and refreshes feedback only when
the value actually changed. Poll errors are logged, never fatal.

### 7. Feedback payloads (`updateFeedback` / `updateAllFeedback`)

For every registered context, a `setFeedback` event matching the `$B1` encoder layout:

- `title`: `"MUTED"` when muted, else `"Apple Music Vol"`
- `value`: `{ value: "<N>%", opacity: muted ? 0.4 : 1.0 }`
- `indicator`: `{ value: <N>, opacity: muted ? 0.4 : 1.0 }`

Unknown volume (sentinel `-1`) renders as `0%`.

### 8. Logging

`log()` emits `logMessage` events with an `[AppleMusicVol]` prefix; Stream Deck writes
them to the plugin's log file. Set-volume and poll errors go through this path. Locations:
see `.obvious/QA.md`.

## Things that surprise new agents

- `package.json` `version` stays a placeholder; **`manifest.json` `Version` is the release
  version**, rewritten by semantic-release with a `.0` patch digit appended
  (`${nextRelease.version}.0` in `.releaserc.json`).
- There is no build/transpile step; `bin/plugin.js` is edited in place and shipped as-is.
- The pack artifact is gitignored (`*.streamDeckPlugin`); packing locally never
  dirties the tree.
- Dependabot runs in security-updates mode (no `.github/dependabot.yml`); expect PRs only
  for vulnerable versions of `ws` (the sole runtime dependency).
