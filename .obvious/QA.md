# QA — stream-deck-apple-music-volume

QA approach for this repo, including the explicit boundary between what automated
Linux proof establishes and what only macOS hardware acceptance can establish.

## QA layers

1. **CI on every PR** (`.github/workflows/ci.yaml`), three jobs:
   - `commitlint` (Lint commits) — lint commits against `@commitlint/config-conventional`.
   - `build` (Validate and pack) — `npm ci` in the sdPlugin dir, `@elgato/cli validate`,
     `@elgato/cli pack`, and upload of the packed `*.streamDeckPlugin` as artifact
     `apple-music-volume-streamdeck-plugin`.
   - `Plugin regression tests` — `npm ci` + `npm test` in the sdPlugin dir.
2. **Protocol-level test suite** (runs on Linux and macOS): see "Regression suite" below.
3. **Manual macOS acceptance** (requires Apple Music + Stream Deck hardware): see the
   checklist at the bottom.

## Regression suite

Run from the plugin directory:

```sh
cd com.dbhagen.apple-music-volume.sdPlugin
npm ci
npm test
```

The suite runs on Node's built-in test runner (`node --test test/plugin.test.js`) with
zero extra dependencies — it reuses the plugin's `ws`. Each test spawns the **real**
`bin/plugin.js` as a child process against two fakes:

- `test/helpers/fake-deck.js` — a real `WebSocketServer` (on 127.0.0.1, ephemeral port)
  that records every message the plugin sends and forwards synthetic Stream Deck events.
- `test/helpers/fake-osascript.js` — a fake `osascript` executable injected at the front
  of `PATH`. It emulates exactly the two JXA invocations the plugin makes
  (`Application("Music").soundVolume()` get / `= <n>` set) against a `FAKE_MUSIC_STATE`
  state file with Music's 0–100 clamping, and appends every invocation to `calls.log` so
  tests can assert call counts (e.g. that a burst of ticks produced ONE `set`).

It establishes plugin *behavior* on the wire — how the plugin reacts to Stream Deck
events and what it sends back — not implementation details.

What Linux protocol proof **covers** (the 12 tests):

- Registration: `registerPlugin` with the plugin uuid on websocket open, plus a
  registration log message.
- `willAppear`: triggers a poll and reports `'<n>%'` + indicator at the real volume.
- Single `dialRotate` tick with default stepSize 1 → exactly one `osascript` set to the
  new value (asserts no second set leaks inside the 50 ms coalescing window).
- Rapid tick bursts inside the coalescing window → ONE `osascript` set with the net
  result (fast-spin behavior).
- `stepSize` from `willAppear` settings is honored.
- `dialDown` mute: volume → 0 with `MUTED` feedback; second press restores the pre-mute
  level.
- Rotating while muted unmutes to `preMute + delta`.
- Volume clamps at 100 and at 0.
- External volume change is picked up by the next poll and clears mute state when > 0.
- `willDisappear` on the last context stops polling.
- Multiple contexts each receive feedback updates.

What Linux protocol proof **cannot** establish (macOS-only):

- Real `osascript` JXA against `Application("Music")` — the actual volume get/set.
- The macOS Automation permission prompt and its grant flow.
- Anything about the Stream Deck app, device hardware, encoder feel, or the
  `$B1` touchscreen rendering.
- Symlink install and uninstall against a real Stream Deck installation.

## Linux/macOS proof boundary (explicit)

This maintenance wave ran on Linux. Everything above labeled "verified" was executed
here; **no macOS runtime verification was performed**. A merged PR means the protocol
suite, validation, and packaging pass — it does not mean the plugin was exercised
against Apple Music or Stream Deck hardware. The macOS checklist below is the
acceptance path for that.

## Manual macOS QA checklist

Prerequisite: clone, `npm ci` inside `com.dbhagen.apple-music-volume.sdPlugin`, symlink
install, restart Stream Deck (commands in `.obvious/local-dev.md`).

1. **Automation permission** — the first dial turn triggers the macOS prompt to allow
   Stream Deck (or the plugin runtime) to control **Music.app**; accept it. If it was
   denied previously: System Settings → Privacy & Security → Automation → enable Music
   under Stream Deck (or `tccutil reset AppleEvents` to reset prompts).
2. **Volume** — turn the dial: Music volume changes; the strip shows the percentage and
   a progress bar.
3. **Fast spin** — spin the dial quickly: volume lands on the correct final value,
   without a long queue of delayed changes.
4. **Mute / unmute** — press the dial (or tap the screen): volume → 0, title `MUTED`,
   display dimmed. Press again: pre-mute level restored.
5. **Rotate while muted** — turning the dial unmutes and applies the new volume.
6. **Step size** — set step size to 25 (then back to 1) in the Property Inspector;
   per-tick change follows the setting.
7. **External change** — change volume from the Music app UI; the display follows within
   ~2 s (poll interval).
8. **Reconnect** — quit/reopen Stream Deck (or replug the device): the plugin
   re-registers and the display recovers.
9. **Logs** — if anything misbehaves, check the plugin log (below) for
   `[AppleMusicVol]` entries.

## Log locations (macOS)

- **Plugin log** (`logMessage` output, including `[AppleMusicVol]` lines):
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin/logs/com.dbhagen.apple-music-volume.0.log`
  (newest log is `.0.log`; higher numbers are rotated). Per Elgato SDK docs:
  <https://docs.elgato.com/streamdeck/sdk/guides/logging/>
- **Stream Deck app log**: `~/Library/Logs/ElgatoStreamDeck/StreamDeck0.log`.

*(These paths are documented from Elgato's SDK documentation; they were not verified
in this Linux environment.)*
