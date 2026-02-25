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
npm install
cd ../..
ln -s "$(pwd)/com.dbhagen.apple-music-volume.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.dbhagen.apple-music-volume.sdPlugin
```

Then restart the Stream Deck application.

### Usage

1. Open the Stream Deck app
2. Find **Apple Music Volume** in the action list (under the "Apple Music" category)
3. Drag it onto a dial slot on your Stream Deck+
4. Turn the dial to adjust volume, press to mute/unmute
5. Optionally configure the step size in the Property Inspector

## How it works

The plugin communicates with Apple Music via JXA (JavaScript for Automation) through `osascript`. Volume get/set calls are coalesced so that rapid dial spins produce at most one `osascript` process at a time, with the latest target value always winning.

## Credits

Icons from [Lucide](https://lucide.dev/) ([MIT License](https://github.com/lucide-icons/lucide/blob/main/LICENSE)).

## License

MIT
