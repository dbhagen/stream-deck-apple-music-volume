#!/usr/bin/env node
"use strict";

// Fake osascript used by the regression suite. Emulates exactly the two JXA
// invocations bin/plugin.js makes against Music:
//
//   get: osascript -l JavaScript -e 'Application("Music").soundVolume()'
//   set: osascript -l JavaScript -e 'Application("Music").soundVolume = <n>'
//
// The emulated Music volume lives in the file named by the FAKE_MUSIC_STATE
// environment variable. Every invocation is appended to calls.log next to the
// state file so tests can assert how many osascript get/set calls happened.

const fs = require("fs");
const path = require("path");

const stateFile = process.env.FAKE_MUSIC_STATE;
if (!stateFile) {
  process.stderr.write("fake osascript: FAKE_MUSIC_STATE is not set\n");
  process.exit(1);
}

const scriptFlag = process.argv.indexOf("-e");
const script = scriptFlag >= 0 ? process.argv[scriptFlag + 1] || "" : "";

const setMatch = script.match(/Application\("Music"\)\.soundVolume\s*=\s*(-?\d+)/);
const isGet = /Application\("Music"\)\.soundVolume\(\)/.test(script);

if (!setMatch && !isGet) {
  process.stderr.write(`fake osascript: unsupported script: ${script}\n`);
  process.exit(1);
}

const callsLog = path.join(path.dirname(stateFile), "calls.log");
fs.appendFileSync(callsLog, setMatch ? `set ${setMatch[1]}\n` : "get\n");

if (setMatch) {
  // Music clamps soundVolume to 0-100.
  const volume = Math.max(0, Math.min(100, parseInt(setMatch[1], 10)));
  const tmp = `${stateFile}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${volume}\n`);
  fs.renameSync(tmp, stateFile);
} else {
  let volume = 0;
  try {
    volume = parseInt(fs.readFileSync(stateFile, "utf8").trim(), 10);
  } catch {
    volume = 0;
  }
  process.stdout.write(`${Number.isNaN(volume) ? 0 : volume}\n`);
}
