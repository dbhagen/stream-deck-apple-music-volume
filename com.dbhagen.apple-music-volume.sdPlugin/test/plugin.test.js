"use strict";

// Protocol-level regression tests for bin/plugin.js.
//
// Each test runs the REAL plugin as a child process against:
//   - a fake Stream Deck WebSocket server (test/helpers/fake-deck.js), and
//   - a fake osascript that emulates Music soundVolume get/set against a
//     state file (test/helpers/fake-osascript.js).
//
// This proves the wire protocol and process behavior on Linux. macOS Apple
// Music, the Stream Deck desktop app, and real hardware are NOT covered
// (see PR description for the exact remaining platform proof).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startPluginFixture, sleep, PLUGIN_UUID } = require("./helpers/fixture");

// Must match POLL_MS in bin/plugin.js.
const POLL_MS = 2000;
// Window to observe a wrongly-split second osascript set (COALESCE_MS is 50).
const LEAK_WINDOW_MS = 250;
// Generous bound for observing expected feedback; tests sleep in small
// increments instead of assuming exact timing.
const OBSERVE_MS = POLL_MS * 2 + 1000;

test("plugin registers with the registerPlugin event and its uuid on websocket open", async (t) => {
  const fx = await startPluginFixture(t);

  const register = await fx.deck.waitFor((m) => m.event === "registerPlugin", {
    label: "register message",
  });
  assert.equal(register.uuid, PLUGIN_UUID);

  await fx.deck.waitFor((m) => m.event === "logMessage", {
    label: "registration log message",
  });
});

test("willAppear triggers a poll and reports the Music volume as '<n>%' with indicator", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");

  const feedback = await fx.deck.waitFor(
    (m) => m.event === "setFeedback" && m.context === "ctx-a",
    { timeoutMs: OBSERVE_MS, label: "first setFeedback for ctx-a" }
  );
  assert.equal(feedback.payload.title, "Apple Music Vol");
  assert.deepEqual(feedback.payload.value, { value: "42%", opacity: 1 });
  assert.deepEqual(feedback.payload.indicator, { value: 42, opacity: 1 });
  assert.ok(fx.countCalls("get") >= 1, "willAppear must poll Music via osascript get");
});

test("a single dialRotate tick moves volume by the default stepSize of 1 via osascript set", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialRotate("ctx-a", 1);

  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-a" && m.payload.value.value === "43%",
    { timeoutMs: OBSERVE_MS, label: "43% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [43], "exactly one osascript set to 43");

  const feedback = fx.deck.lastFeedback("ctx-a");
  assert.deepEqual(feedback.payload.value, { value: "43%", opacity: 1 });
  assert.deepEqual(feedback.payload.indicator, { value: 43, opacity: 1 });
});

test("rapid dialRotate tick bursts inside the coalescing window produce ONE osascript set with the net result", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  // Five ticks sent ~2ms apart: the whole burst lands inside the 50ms
  // coalescing window (COALESCE_MS in plugin.js).
  for (let i = 0; i < 5; i++) {
    fx.deck.dialRotate("ctx-a", 1);
    await sleep(2);
  }

  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-a" && m.payload.value.value === "47%",
    { timeoutMs: OBSERVE_MS, label: "net 47% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [47], "burst must coalesce into one set of the net value");

  const feedback = fx.deck.lastFeedback("ctx-a");
  assert.equal(feedback.payload.indicator.value, 47);
});

test("stepSize from willAppear settings is honored", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a", { stepSize: 10 });
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialRotate("ctx-a", 1);
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-a" && m.payload.value.value === "52%",
    { timeoutMs: OBSERVE_MS, label: "52% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [52]);

  fx.deck.dialRotate("ctx-a", -1);
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-a" && m.payload.value.value === "42%",
    { timeoutMs: OBSERVE_MS, label: "42% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [52, 42]);
});

test("dialDown mutes to 0 with MUTED feedback and the second press restores the pre-mute level", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialDown("ctx-a");
  const muted = await fx.deck.waitFor(
    (m) => m.event === "setFeedback" && m.context === "ctx-a" && m.payload.title === "MUTED",
    { timeoutMs: OBSERVE_MS, label: "MUTED feedback" }
  );
  assert.deepEqual(muted.payload.value, { value: "0%", opacity: 0.4 });
  assert.deepEqual(muted.payload.indicator, { value: 0, opacity: 0.4 });

  fx.deck.dialDown("ctx-a");
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" &&
      m.context === "ctx-a" &&
      m.payload.title === "Apple Music Vol" &&
      m.payload.value.value === "42%",
    { timeoutMs: OBSERVE_MS, label: "restored 42% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [0, 42], "mute sets 0, unmute restores 42");

  const restored = fx.deck.lastFeedback("ctx-a");
  assert.deepEqual(restored.payload.value, { value: "42%", opacity: 1 });
  assert.deepEqual(restored.payload.indicator, { value: 42, opacity: 1 });
});

test("rotating while muted unmutes to preMute + delta", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialDown("ctx-a");
  await fx.deck.waitFor(
    (m) => m.event === "setFeedback" && m.context === "ctx-a" && m.payload.title === "MUTED",
    { timeoutMs: OBSERVE_MS, label: "MUTED feedback" }
  );

  fx.deck.dialRotate("ctx-a", 2);
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" &&
      m.context === "ctx-a" &&
      m.payload.title === "Apple Music Vol" &&
      m.payload.value.value === "44%",
    { timeoutMs: OBSERVE_MS, label: "unmuted 44% feedback" }
  );
  await sleep(LEAK_WINDOW_MS);
  assert.deepEqual(fx.setCalls(), [0, 44], "mute set 0, rotate unmuted to 42 + 2");

  const feedback = fx.deck.lastFeedback("ctx-a");
  assert.deepEqual(feedback.payload.value, { value: "44%", opacity: 1 });
  assert.deepEqual(feedback.payload.indicator, { value: 44, opacity: 1 });
});

test("volume clamps at 100", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 100 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialRotate("ctx-a", 5);
  await fx.waitForSetCallCount(1, OBSERVE_MS);
  await sleep(LEAK_WINDOW_MS);

  assert.deepEqual(fx.setCalls(), [100], "42+5 at 100 clamps to a single set of 100");
  const feedback = fx.deck.lastFeedback("ctx-a");
  assert.equal(feedback.payload.value.value, "100%");
  assert.equal(feedback.payload.indicator.value, 100);
});

test("volume clamps at 0", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 0 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  fx.deck.dialRotate("ctx-a", -3);
  await fx.waitForSetCallCount(1, OBSERVE_MS);
  await sleep(LEAK_WINDOW_MS);

  assert.deepEqual(fx.setCalls(), [0], "0-3 clamps to a single set of 0");
  const feedback = fx.deck.lastFeedback("ctx-a");
  assert.equal(feedback.payload.value.value, "0%");
  assert.equal(feedback.payload.indicator.value, 0);
});

test("external volume change is picked up by the next poll and clears mute state when > 0", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });

  // External change while unmuted: next poll must reflect it without a set.
  fx.setExternalVolume(77);
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-a" && m.payload.value.value === "77%",
    { timeoutMs: OBSERVE_MS, label: "77% feedback after external change" }
  );
  assert.deepEqual(fx.setCalls(), [], "external pickup must not write via osascript");

  // Mute, then change the volume externally while muted: the poll must
  // adopt the new value and clear the stale mute state.
  fx.deck.dialDown("ctx-a");
  await fx.deck.waitFor(
    (m) => m.event === "setFeedback" && m.context === "ctx-a" && m.payload.title === "MUTED",
    { timeoutMs: OBSERVE_MS, label: "MUTED feedback" }
  );
  // The mute's osascript set runs asynchronously; wait until it has actually
  // landed in the state file so the external change below cannot be clobbered
  // by the in-flight write to 0.
  await fx.waitForStateValue(0, OBSERVE_MS);

  fx.setExternalVolume(60);
  const unmuted = await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" &&
      m.context === "ctx-a" &&
      m.payload.title === "Apple Music Vol" &&
      m.payload.value.value === "60%",
    { timeoutMs: OBSERVE_MS, label: "mute cleared at 60% feedback" }
  );
  assert.deepEqual(unmuted.payload.value, { value: "60%", opacity: 1 });
  assert.deepEqual(unmuted.payload.indicator, { value: 60, opacity: 1 });
  assert.deepEqual(fx.setCalls(), [0], "only the mute itself performed an osascript set");
});

test("willDisappear on the last context stops polling", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "initial feedback",
  });
  // Let any in-flight osascript get finish before sampling the counter.
  await sleep(100);
  const getsBefore = fx.countCalls("get");
  assert.ok(getsBefore >= 1, "polling must have run at least one get");

  fx.deck.willDisappear("ctx-a");
  await sleep(POLL_MS + 500);

  assert.equal(
    fx.countCalls("get"),
    getsBefore,
    "no osascript get calls may happen after the last context disappears"
  );
});

test("multiple contexts each receive feedback updates", async (t) => {
  const fx = await startPluginFixture(t, { initialVolume: 42 });
  fx.deck.willAppear("ctx-a");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-a", {
    timeoutMs: OBSERVE_MS,
    label: "ctx-a initial feedback",
  });

  fx.deck.willAppear("ctx-b");
  await fx.deck.waitFor((m) => m.event === "setFeedback" && m.context === "ctx-b", {
    timeoutMs: OBSERVE_MS,
    label: "ctx-b initial feedback",
  });

  fx.deck.dialRotate("ctx-a", 1);
  await fx.waitForSetCallCount(1, OBSERVE_MS);
  await fx.deck.waitFor(
    (m) =>
      m.event === "setFeedback" && m.context === "ctx-b" && m.payload.value.value === "43%",
    { timeoutMs: OBSERVE_MS, label: "ctx-b updated feedback" }
  );

  const feedbackA = fx.deck.lastFeedback("ctx-a");
  const feedbackB = fx.deck.lastFeedback("ctx-b");
  assert.equal(feedbackA.payload.value.value, "43%");
  assert.equal(feedbackB.payload.value.value, "43%");
});
