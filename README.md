# Stream Deck Apple Music Volume

A Stream Deck+ plugin that controls Apple Music volume using the dial/encoder.

## Features

- **Dial rotation** — Adjust Apple Music volume up/down
- **Dial press / touch tap** — Mute/unmute toggle (remembers pre-mute level)
- **Live display** — Shows current volume percentage and progress bar on the touchscreen strip
- **Configurable step size** — Change volume per tick from 1–25 (default: 1) via the Property Inspector
- **Fast-spin handling** — Coalesces rapid dial ticks into a single volume change to avoid queuing dozens of AppleScript calls
- **Polling** — Reads current volume every 2 seconds to stay in sync with external changes

## Requirements

- macOS 13+
- Stream Deck+ (or any Stream Deck with dial/encoder support)
- Stream Deck software 6.9+
- Apple Music app

## Installation

### From source (symlink)

```sh
git clone https://github.com/dbhagen/stream-deck-apple-music-volume.git
cd stream-deck-apple-music-volume/com.dbhagen.apple-music-volume.sdPlugin
npm ci
cd ..
ln -s "$(pwd)/com.dbhagen.apple-music-volume.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

Then restart the Stream Deck application.

### Usage

1. Open the Stream Deck app
2. Find **Apple Music Volume** in the action list (under the "Apple Music Volume" category)
3. Drag it onto a dial slot on your Stream Deck+
4. Turn the dial to adjust volume, press to mute/unmute
5. Optionally configure the step size in the Property Inspector

## How it works

The plugin communicates with Apple Music via JXA (JavaScript for Automation) through `osascript`. Volume get/set calls are coalesced so that rapid dial spins produce at most one `osascript` process at a time, with the latest target value always winning.

## Development

Prerequisites: Node.js 20. To *run* the plugin you also need macOS 13+, Stream Deck software 6.9+, and the Apple Music app (the test suite and packaging run fine without them).

```sh
git clone https://github.com/dbhagen/stream-deck-apple-music-volume.git
cd stream-deck-apple-music-volume/com.dbhagen.apple-music-volume.sdPlugin
npm ci
npm test            # protocol-level tests (no macOS required)
```

Validate and pack from the repo root:

```sh
npx --yes @elgato/cli validate com.dbhagen.apple-music-volume.sdPlugin --no-update-check
npx --yes @elgato/cli pack com.dbhagen.apple-music-volume.sdPlugin --no-update-check
```

Releases are automatic: merges to `main` trigger [semantic-release](https://semantic-release.gitbook.io/), which bumps the version in `manifest.json`, packs, and publishes a GitHub release. Don't bump versions by hand. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by CI.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full guide (install, debugging, release pipeline, Dependabot behavior).

## Troubleshooting

- **Nothing happens when I turn the dial** — macOS shows an Automation permission prompt the first time the plugin controls Apple Music. Accept it. If it was denied (or never appeared): System Settings → Privacy & Security → Automation → enable **Music** under **Stream Deck**, or reset prompts with `tccutil reset AppleEvents`.
- **Where are the plugin logs?** — `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin/logs/`; the newest file is `com.dbhagen.apple-music-volume.0.log`. The Stream Deck app log is `~/Library/Logs/ElgatoStreamDeck/StreamDeck0.log`. Plugin log lines are prefixed `[AppleMusicVol]`.
- **Removing a source install** — delete the symlink (not your clone) and restart Stream Deck:
  ```sh
  rm ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
  ```
- **Action doesn't appear in the Stream Deck app** — make sure you run Stream Deck 6.9 or later, installed the plugin's dependencies (`npm ci`), and restarted the Stream Deck app after installing.

## Credits

Icons from [Lucide](https://lucide.dev/) ([MIT License](https://github.com/lucide-icons/lucide/blob/main/LICENSE)).

## License

MIT
