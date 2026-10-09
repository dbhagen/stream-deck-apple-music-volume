"use strict";

const { WebSocketServer } = require("ws");

// Must match the action UUID that bin/plugin.js filters incoming events by.
const ACTION_UUID = "com.dbhagen.apple-music-volume.control";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal stand-in for the Stream Deck WebSocket API: records every message
 * the plugin sends and forwards synthetic Stream Deck events to it.
 */
class FakeDeck {
  constructor() {
    this.messages = [];
    this.sockets = new Set();
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    this.listening = new Promise((resolve) => this.wss.once("listening", resolve));
    // Resolves when the plugin establishes its websocket; Stream Deck only
    // sends events after registration, so tests await this first.
    this.connected = new Promise((resolve) => this.wss.once("connection", resolve));
    this.wss.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("message", (data) => {
        try {
          this.messages.push(JSON.parse(data.toString()));
        } catch {
          // The plugin only sends JSON; ignore anything else.
        }
      });
    });
  }

  async ready() {
    await this.listening;
  }

  get port() {
    return this.wss.address().port;
  }

  send(payload) {
    for (const socket of this.sockets) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(JSON.stringify(payload));
      }
    }
  }

  sendEvent(event, context, payload) {
    this.send({ event, action: ACTION_UUID, context, payload });
  }

  willAppear(context, settings = {}) {
    this.sendEvent("willAppear", context, { settings });
  }

  willDisappear(context) {
    this.sendEvent("willDisappear", context, {});
  }

  dialRotate(context, ticks, settings = {}) {
    this.sendEvent("dialRotate", context, { settings, ticks });
  }

  dialDown(context, settings = {}) {
    this.sendEvent("dialDown", context, { settings });
  }

  touchTap(context, settings = {}) {
    this.sendEvent("touchTap", context, { settings });
  }

  lastFeedback(context) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message.event === "setFeedback" && message.context === context) {
        return message;
      }
    }
    return undefined;
  }

  async waitFor(predicate, { timeoutMs = 3000, label = "condition" } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(
          `waitFor timed out after ${timeoutMs}ms waiting for ${label}; ` +
            `messages seen: ${JSON.stringify(this.messages).slice(0, 3000)}`
        );
      }
      await sleep(25);
    }
  }

  async close() {
    for (const socket of this.sockets) {
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
    this.sockets.clear();
    if (typeof this.wss.closeAllConnections === "function") {
      this.wss.closeAllConnections();
    }
    await new Promise((resolve) => this.wss.close(() => resolve()));
  }
}

module.exports = { FakeDeck, ACTION_UUID, sleep };
