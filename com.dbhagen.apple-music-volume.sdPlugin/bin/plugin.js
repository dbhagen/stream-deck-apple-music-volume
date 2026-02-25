const WebSocket = require("ws");
const { execFile } = require("child_process");

// ---------------------------------------------------------------------------
// CLI args: -port PORT -pluginUUID UUID -registerEvent EVENT -info JSON
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`-${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const PORT = arg("port");
const PLUGIN_UUID = arg("pluginUUID");
const REGISTER_EVENT = arg("registerEvent");
const INFO = arg("info") ? JSON.parse(arg("info")) : {};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const ACTION_UUID = "com.dbhagen.apple-music-volume.control";

let ws;
let currentVolume = -1; // -1 = unknown
let preMuteVolume = null; // non-null when muted
let pollInterval = null;
const POLL_MS = 2000;

// Per-context settings (step size) and context tracking
const contexts = new Map(); // context -> { settings }

// ---------------------------------------------------------------------------
// AppleScript helpers (JXA via osascript)
// ---------------------------------------------------------------------------
let pendingGet = null; // dedup concurrent reads

function getVolume() {
  if (pendingGet) return pendingGet;
  pendingGet = new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", 'Application("Music").soundVolume()'],
      { timeout: 5000 },
      (err, stdout) => {
        pendingGet = null;
        if (err) return reject(err);
        const vol = parseInt(stdout.toString().trim(), 10);
        resolve(Number.isNaN(vol) ? -1 : vol);
      }
    );
  });
  return pendingGet;
}

let pendingSet = null; // only one in-flight set at a time
let nextSetValue = null; // latest requested value (coalesced)

function setVolume(vol) {
  vol = Math.max(0, Math.min(100, Math.round(vol)));
  nextSetValue = vol;
  drainSetQueue();
  // Optimistically update display so the UI feels instant
  currentVolume = vol;
  updateAllFeedback();
}

function drainSetQueue() {
  if (pendingSet) return; // will be picked up when current finishes
  if (nextSetValue === null) return;

  const vol = nextSetValue;
  nextSetValue = null;
  pendingSet = new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-l",
        "JavaScript",
        "-e",
        `Application("Music").soundVolume = ${vol}`,
      ],
      { timeout: 5000 },
      (err) => {
        pendingSet = null;
        if (err) {
          log("setVolume error", err.message);
        }
        // Drain next queued value if any
        drainSetQueue();
        resolve();
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Dial rotation coalescing
//
// When the user spins the knob quickly, many dialRotate events arrive in a
// short window. Instead of spawning an osascript process per tick, we
// accumulate ticks and flush once per COALESCE_MS.
// ---------------------------------------------------------------------------
const COALESCE_MS = 50;
let accumulatedTicks = 0;
let coalesceTimer = null;
let lastStepSize = 1; // track last-used step size for flushing

function onDialRotate(ticks, stepSize) {
  accumulatedTicks += ticks;
  lastStepSize = stepSize;

  if (!coalesceTimer) {
    coalesceTimer = setTimeout(flushRotation, COALESCE_MS);
  }
}

function flushRotation() {
  coalesceTimer = null;
  if (accumulatedTicks === 0) return;

  const ticks = accumulatedTicks;
  accumulatedTicks = 0;

  // If muted and user rotates, unmute first
  if (preMuteVolume !== null) {
    currentVolume = preMuteVolume;
    preMuteVolume = null;
  }

  const base = currentVolume >= 0 ? currentVolume : 50;
  const delta = ticks * lastStepSize;
  setVolume(base + delta);
}

// ---------------------------------------------------------------------------
// Mute / unmute (dial press or touch tap)
// ---------------------------------------------------------------------------
function toggleMute() {
  if (preMuteVolume !== null) {
    // Unmute: restore previous volume
    const restore = preMuteVolume;
    preMuteVolume = null;
    setVolume(restore);
  } else if (currentVolume > 0) {
    // Mute: remember current volume, set to 0
    preMuteVolume = currentVolume;
    setVolume(0);
  }
  // If currentVolume is already 0 and not previously muted, do nothing
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
async function poll() {
  try {
    const vol = await getVolume();
    if (vol < 0) return;

    // Only update if we have no pending set (avoid overwriting optimistic UI)
    if (nextSetValue === null && pendingSet === null) {
      if (vol !== currentVolume) {
        currentVolume = vol;
        // If volume was changed externally and we thought it was muted, clear mute state
        if (preMuteVolume !== null && vol > 0) {
          preMuteVolume = null;
        }
        updateAllFeedback();
      }
    }
  } catch (e) {
    log("poll error", e.message);
  }
}

function startPolling() {
  if (pollInterval) return;
  poll(); // immediate first poll
  pollInterval = setInterval(poll, POLL_MS);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Feedback (update the dial touchscreen display)
// ---------------------------------------------------------------------------
function updateAllFeedback() {
  for (const ctx of contexts.keys()) {
    updateFeedback(ctx);
  }
}

function updateFeedback(context) {
  const vol = currentVolume >= 0 ? currentVolume : 0;
  const isMuted = preMuteVolume !== null;
  const title = isMuted ? "MUTED" : "Apple Music Vol";

  send({
    event: "setFeedback",
    context,
    payload: {
      title: title,
      value: {
        value: `${vol}%`,
        opacity: isMuted ? 0.4 : 1.0,
      },
      indicator: {
        value: vol,
        opacity: isMuted ? 0.4 : 1.0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// WebSocket communication
// ---------------------------------------------------------------------------
function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function handleMessage(msg) {
  let data;
  try {
    data = JSON.parse(msg);
  } catch {
    return;
  }

  const { event, context, action, payload } = data;

  switch (event) {
    case "willAppear": {
      if (action !== ACTION_UUID) break;
      const settings = payload?.settings || {};
      contexts.set(context, { settings });
      startPolling();
      // Send initial feedback once volume is known
      if (currentVolume >= 0) {
        updateFeedback(context);
      }
      break;
    }

    case "willDisappear": {
      contexts.delete(context);
      if (contexts.size === 0) {
        stopPolling();
      }
      break;
    }

    case "didReceiveSettings": {
      if (action !== ACTION_UUID) break;
      const entry = contexts.get(context);
      if (entry) {
        entry.settings = payload?.settings || {};
      }
      break;
    }

    case "dialRotate": {
      if (action !== ACTION_UUID) break;
      const ticks = payload?.ticks || 0;
      const entry = contexts.get(context);
      const step = entry?.settings?.stepSize
        ? parseInt(entry.settings.stepSize, 10) || 1
        : 1;
      onDialRotate(ticks, step);
      break;
    }

    case "dialDown": {
      if (action !== ACTION_UUID) break;
      toggleMute();
      break;
    }

    case "touchTap": {
      if (action !== ACTION_UUID) break;
      toggleMute();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Logging (writes to Stream Deck's plugin log)
// ---------------------------------------------------------------------------
function log(...args) {
  const msg = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  send({ event: "logMessage", payload: { message: `[AppleMusicVol] ${msg}` } });
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------
function connect() {
  ws = new WebSocket(`ws://localhost:${PORT}`);

  ws.on("open", () => {
    send({ event: REGISTER_EVENT, uuid: PLUGIN_UUID });
    log("Plugin registered");
  });

  ws.on("message", (data) => handleMessage(data.toString()));

  ws.on("close", () => {
    stopPolling();
    // Stream Deck closed the connection; process will be killed shortly
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

connect();
