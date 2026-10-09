"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { FakeDeck, sleep } = require("./fake-deck");

const PLUGIN_PATH = path.join(__dirname, "..", "..", "bin", "plugin.js");
const PLUGIN_UUID = "test-plugin-uuid";
const STATE_ENV_VAR = "FAKE_MUSIC_STATE";

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const forceTimer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // process already gone
    }
  }, 500);
  await exited;
  clearTimeout(forceTimer);
}

async function waitForCondition(predicate, { timeoutMs = 3000, stepMs = 25, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await sleep(stepMs);
  }
}

/**
 * Starts the real bin/plugin.js against a fake Stream Deck websocket server
 * and a fake osascript that emulates Music soundVolume get/set against a
 * state file. Registers cleanup with the node:test context, so each test
 * gets an isolated plugin process, fake deck, and Music state directory.
 */
async function startPluginFixture(t, { initialVolume = 42 } = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "samv-fixture-"));
  const stateFile = path.join(stateDir, "music-volume");
  const callsLog = path.join(stateDir, "calls.log");
  fs.writeFileSync(stateFile, `${initialVolume}\n`);
  fs.writeFileSync(callsLog, "");

  // Put a fake osascript executable at the front of PATH for the plugin.
  const fakeBin = path.join(stateDir, "bin");
  fs.mkdirSync(fakeBin);
  fs.copyFileSync(path.join(__dirname, "fake-osascript.js"), path.join(fakeBin, "osascript"));
  fs.chmodSync(path.join(fakeBin, "osascript"), 0o755);

  const deck = new FakeDeck();
  await deck.ready();

  let stderr = "";
  const child = spawn(
    process.execPath,
    [
      PLUGIN_PATH,
      "-port",
      String(deck.port),
      "-pluginUUID",
      PLUGIN_UUID,
      "-registerEvent",
      "registerPlugin",
      "-info",
      JSON.stringify({}),
    ],
    {
      env: {
        ...process.env,
        [STATE_ENV_VAR]: stateFile,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (err) => {
    stderr += `spawn error: ${err.message}\n`;
  });

  // The fixture is ready once the real plugin has registered with the deck,
  // mirroring how Stream Deck treats the plugin as live only after
  // registration. Events sent before this point would be dropped.
  await deck.waitFor((m) => m.event === "registerPlugin", {
    timeoutMs: 5000,
    label: "plugin registration during fixture startup",
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await terminate(child);
    await deck.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  };
  t.after(() => stop());

  const readCalls = () =>
    fs
      .readFileSync(callsLog, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const readStateVolume = () => {
    try {
      const parsed = parseInt(fs.readFileSync(stateFile, "utf8").trim(), 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    } catch {
      return undefined;
    }
  };

  // Waits until an osascript set has actually landed in the state file —
  // calls.log records invocation, not completion, and tests that simulate
  // external volume changes must not race an in-flight set.
  const waitForStateValue = (value, timeoutMs = 3000) =>
    waitForCondition(() => (readStateVolume() === value ? true : undefined), {
      timeoutMs,
      label: `state file volume to become ${value}`,
    });

  const setCalls = () =>
    readCalls()
      .filter((line) => line.startsWith("set "))
      .map((line) => parseInt(line.slice(4), 10));

  const countCalls = (kind) =>
    readCalls().filter((line) => line === kind || line.startsWith(`${kind} `)).length;

  const waitForSetCallCount = (count, timeoutMs = 3000) =>
    waitForCondition(() => (setCalls().length >= count ? true : undefined), {
      timeoutMs,
      label: `${count} osascript set call(s)`,
    });

  return {
    deck,
    child,
    stateFile,
    debugInfo: () => stderr,
    readCalls,
    setCalls,
    countCalls,
    setExternalVolume: (n) => fs.writeFileSync(stateFile, `${n}\n`),
    waitForStateValue,
    waitForSetCallCount,
    stop,
  };
}

module.exports = { startPluginFixture, waitForCondition, sleep, PLUGIN_UUID, STATE_ENV_VAR };
