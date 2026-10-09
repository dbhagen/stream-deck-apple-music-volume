# Autobuild orientation

This repository is `stream-deck-apple-music-volume`, a Stream Deck+ plugin that
controls the macOS Apple Music app's volume from a Stream Deck+ dial/encoder. The
entire product is one CommonJS file, `com.dbhagen.apple-music-volume.sdPlugin/bin/plugin.js`:
it speaks the Stream Deck WebSocket protocol (SDK v3), coalesces fast dial ticks, mutes
and restores volume on press, polls the current volume every 2 seconds, and shells out
to `osascript` (JXA) to read and set `Application("Music").soundVolume`. The author is
the sole user; releases go to GitHub via semantic-release for use on the Elgato
Marketplace. For codebase detail see `AGENTS.md` and `.obvious/orientation.md`; for
day-to-day setup see `.obvious/local-dev.md`; for verification see `.obvious/QA.md`.

Constraints for automated work, in priority order: (1) Linux proves protocol behavior
only — macOS Apple Music app, Stream Deck desktop app, and dial hardware are NOT
verifiable here; never claim full runtime verification. (2) Releases are owned by
semantic-release on merge to main — never bump versions or run releases manually.
(3) Tests run INSIDE `com.dbhagen.apple-music-volume.sdPlugin` via `npm test`
(`node --test`), not at repo root. (4) The sole runtime dependency is `ws` — do not
add dependencies without need.

Before changing code or CI, read the current `AGENTS.md`, the open PRs, and
`.obvious/QA.md` for the Linux/macOS proof boundary. PRs must keep the CI
`Plugin regression tests` job green and follow Conventional Commits (commitlint is a
required check). Scope is maintenance and documentation; new product features stay
proposals.
