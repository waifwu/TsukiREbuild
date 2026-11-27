// discord.js - Discord Rich Presence over the Discord app's local IPC pipe.
//
// The page says what it would like Discord to show (presence.js); this file keeps that wish and talks to the Discord
// app on this computer. There is no network here and no bot: Discord's desktop app listens on a named pipe (Windows) or
// a socket in the runtime directory (macOS, Linux), and a small JSON protocol over it sets the activity shown on the
// player's profile. Only the app's public client id is needed; there is no token.
//
// The rules this file keeps:
//   - The first SET_ACTIVITY waits for Discord's READY. A reconnect sends the last wish again, with the same start time.
//   - Four writes in a sliding 20 s window, at least a second apart. A clear skips that window and floor (but counts in
//     the window), and still waits for Discord's own rate-limit pause. The latest wish is the one sent; a wish already
//     on screen is not sent again (its timer would restart).
//   - A clear waits only for the write already under way, then goes at once: a late set never lands after a hide.
//   - A transport error keeps the wish and reconnects; Discord's rate limit (ERROR 5010) keeps it too and waits 20 s;
//     any other ERROR drops it. An ERROR before READY only leaves that pipe: the search goes on, and the wish stays.
//     Each distinct message is logged once.
//   - If Discord is not running, the game does not notice: the pipe is looked for again later, quietly.
"use strict";

const net = require("node:net");
const path = require("node:path");
const { randomUUID: newUUID } = require("node:crypto");

const CLIENT_ID = "1574946759690420235";              // the app's public id (no token, no OAuth)
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const RATE = { sends: 4, windowMs: 20000, floorMs: 1000 };
const BACKOFF = [5000, 10000, 20000, 30000];          // reconnect waits, capped at 30 s
const HANDSHAKE_MS = 4000;                            // a connected pipe that says nothing
const WRITE_MS = 5000;                                // a SET_ACTIVITY that is never answered
const RATE_PAUSE_MS = 20000;

// The pipes Discord's app leaves: discord-ipc-0 .. 9 beside the runtime directory. Windows has named pipes of its own;
// Linux also sees the pipes of the Flatpak and Snap builds, whose sandboxes put them under XDG_RUNTIME_DIR.
function pipePaths(env = process.env, platform = process.platform) {
  if (platform === "win32") return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const dirs = [];
  const add = (dir) => { if (dir && !dirs.includes(dir)) dirs.push(dir); };
  add(env.XDG_RUNTIME_DIR);
  if (env.XDG_RUNTIME_DIR) {
    for (const app of ["app/com.discordapp.Discord", "app/com.discordapp.DiscordCanary", "snap.discord", "snap.discord-canary"]) add(path.posix.join(env.XDG_RUNTIME_DIR, app));
  }
  add(env.TMPDIR);
  add(env.TMP);
  add(env.TEMP);
  add("/tmp");
  const out = [];
  // posix even on Windows: the paths are the Linux Discord's, not this computer's.
  for (const dir of dirs) for (let i = 0; i < 10; i++) out.push(path.posix.join(dir, `discord-ipc-${i}`));
  return out;
}

// A line of text for Discord: 2-128 characters, one line, no leading or trailing space. Null when there is no such line.
function line(value, min = 2, max = 128) {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max ? s : null;
}

// The page's wish as Discord's SET_ACTIVITY takes it. The start is the number of seconds since the epoch at which the
// play time stood at 0, so Discord can count the elapsed time itself. Null for anything malformed.
function sanitizeActivity(activity) {
  if (!activity || typeof activity !== "object") return null;
  const details = line(activity.details);
  if (!details) return null;
  const state = line(activity.state);
  const start = Number(activity.start);
  if (!Number.isSafeInteger(start) || start <= 0) return null;
  const out = { details, timestamps: { start } };
  if (state) out.state = state;
  const assets = {};
  if (activity.assets && typeof activity.assets === "object") {
    if (activity.assets.large_image === "tsukihime") {
      assets.large_image = "tsukihime";
      const text = line(activity.assets.large_text);
      if (text) assets.large_text = text;
    }
    const small = activity.assets.small_image;
    if (small === "route_arc" || small === "route_ciel") {
      assets.small_image = small;
      const text = line(activity.assets.small_text);
      if (text) assets.small_text = text;
    }
  }
  if (Object.keys(assets).length) out.assets = assets;
  return out;
}

// What makes two wishes the same on the profile. The timer is left out: sending the same words again would restart it.
function activityKey(activity) {
  if (!activity) return null;
  return JSON.stringify([activity.details, activity.state ?? null, activity.assets ?? null]);
}

function frame(op, value) {
  const payload = Buffer.from(JSON.stringify(value ?? {}), "utf8");
  const out = Buffer.allocUnsafe(8 + payload.length);
  out.writeUInt32LE(op, 0);
  out.writeUInt32LE(payload.length, 4);
  payload.copy(out, 8);
  return out;
}

// Every complete frame in a buffer plus a new chunk, and what is left of a frame still coming.
function readFrames(buffer, chunk) {
  let data = buffer?.length ? Buffer.concat([buffer, chunk]) : chunk;
  const frames = [];
  while (data.length >= 8) {
    const op = data.readUInt32LE(0), len = data.readUInt32LE(4);
    if (data.length < 8 + len) break;
    let value = null;
    try { value = len ? JSON.parse(data.subarray(8, 8 + len).toString("utf8")) : null; } catch { value = null; }
    frames.push([op, value]);
    data = data.subarray(8 + len);
  }
  return { frames, rest: data };
}

// One pipe, from connect to close. Before READY it speaks only for the search; afterwards its messages go to the
// presence that adopted it.
class Connection {
  constructor(presence, socket, { onReady, onFailed }) {
    this.presence = presence;
    this.socket = socket;
    this.onReady = onReady;
    this.onFailed = onFailed;
    this.reader = Buffer.alloc(0);
    this.ready = false;
    this.closed = false;
    this.handshaken = false;
    this.handshakeTimer = null;
    socket.on("connect", () => this.connected());
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("Discord closed the pipe")));
    if (socket.connecting === false || socket.readyState === "open") this.connected();
  }

  connected() {
    if (this.closed || this.handshaken) return;
    this.handshaken = true;
    if (!this.write(OP.HANDSHAKE, { v: 1, client_id: this.presence.clientId })) return;
    this.handshakeTimer = this.presence.setTimeout(() => this.fail(new Error("Discord did not answer")), this.presence.handshakeMs);
  }

  write(op, value) {
    if (this.closed) return false;
    try { this.socket.write(frame(op, value)); return true; } catch (error) { this.fail(error); return false; }
  }

  onData(chunk) {
    const { frames, rest } = readFrames(this.reader, chunk);
    this.reader = rest;
    for (const [op, value] of frames) {
      if (op === OP.PING) { this.write(OP.PONG, value ?? {}); continue; }
      if (op === OP.CLOSE) {
        if (value?.code === 4002) this.presence.noteRateLimit();
        this.fail(new Error(value?.message || "Discord closed the pipe"));
        return;
      }
      if (op === OP.FRAME) this.onMessage(value);
    }
  }

  onMessage(value) {
    if (!this.ready) {
      if (value?.evt === "READY") {
        this.ready = true;
        this.presence.clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.onReady(this);
        return;
      }
      if (value?.evt === "ERROR") {
        // Before READY this pipe is only being tried: a refusal says nothing about the wish. Leave this pipe and let
        // the search try the next one; the message is still worth one line.
        const data = value.data || value;
        const message = String(data?.message || data?.error || "Discord refused the connection");
        this.presence.logOnce(message);
        if (this.presence.isRateLimit(data)) this.presence.noteRateLimit();
        this.fail(new Error(message));
      }
      return;
    }
    this.presence.onMessage(value);
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    this.presence.clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    try { this.socket.destroy(); } catch { /* already gone */ }
    if (this.ready) this.presence.connectionLost(this, error);
    else this.onFailed?.(error);
  }
}

class DiscordPresence {
  constructor({
    clientId = CLIENT_ID, pid = process.pid, connect = (target) => net.connect(target), paths = () => pipePaths(),
    now = Date.now, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, randomUUID = newUUID,
    log = (message) => console.error(message), handshakeMs = HANDSHAKE_MS, writeMs = WRITE_MS, ratePauseMs = RATE_PAUSE_MS,
    rate = RATE, backoff = BACKOFF, burst = 0,
  } = {}) {
    this.clientId = clientId || CLIENT_ID;
    this.pid = pid;
    this.connect = connect;
    this.paths = paths;
    this.now = now;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
    this.randomUUID = randomUUID;
    this.log = log;
    this.handshakeMs = handshakeMs;
    this.writeMs = writeMs;
    this.ratePauseMs = ratePauseMs;
    this.rate = { ...RATE, ...rate };
    this.backoff = backoff;
    this.burst = Math.max(0, Number(burst) || 0);

    this.conn = null;
    this.desired = null;            // the wish, as sanitizeActivity made it
    this.ready = false;
    this.connecting = false;
    this.closed = false;
    this.displayed = false;         // this connection has a set activity on the profile
    this.lastSentKey = null;        // what that activity was (activityKey)
    this.lastSentStart = null;      // and the timer start it was given
    this.forceClear = false;
    this.writing = null;
    this.sentAt = [];               // when writes went out, for the sliding window
    this.pumpTimer = null;
    this.retryTimer = null;
    this.ratePauseUntil = 0;
    this.backoffIndex = 0;
    this.burstLeft = this.burst;
    this.logged = new Set();
    this.clearWaiters = [];
  }

  setActivity(activity) {
    const wish = sanitizeActivity(activity);
    if (!wish) return this.clear();
    const key = activityKey(wish);
    const shown = this.displayed && key === this.lastSentKey;
    // The same words are already on the profile: keep the start we sent, not the one this copy carries. (A wish that
    // comes back to them replaces whatever was still waiting: the latest wish is the one that goes.)
    if (shown && Number.isSafeInteger(this.lastSentStart)) wish.timestamps.start = this.lastSentStart;
    this.desired = wish;
    this.forceClear = false;
    this.cancelPump();
    this.resolveClear();   // a clear this wish replaces has nothing left to write
    if (shown) return undefined;
    if (!this.ready) this.ensureConnection();
    else this.pump();
    return undefined;
  }

  // Clear the profile. force: send even if nothing is known to be shown (leaving the game, turning the switch off).
  // The promise is done when the clear is written (or there is nothing to write); a quit can wait on it.
  clear({ force = false } = {}) {
    this.desired = null;
    this.lastSentKey = null;
    this.lastSentStart = null;
    this.forceClear = !!force;
    this.cancelPump();
    if (this.retryTimer) { this.clearTimeout(this.retryTimer); this.retryTimer = null; }
    const done = new Promise((resolve) => this.clearWaiters.push(resolve));
    // A set still waiting for its answer may put something on the profile: the clear waits for it, then goes.
    if (this.closed || !this.ready || (!this.displayed && !this.forceClear && !this.writing)) { this.resolveClear(); return done; }
    this.pump();
    return done;
  }

  // The wish may have been cleared before the pipe was up: nothing to connect for.
  ensureConnection() {
    if (this.closed || this.ready || this.connecting || this.retryTimer || !this.desired) return;
    this.connecting = true;
    this.scan().catch((error) => this.logOnce(error?.message || String(error))).finally(() => { this.connecting = false; });
  }

  async scan() {
    for (const target of this.paths()) {
      if (this.closed || !this.desired) return;
      const conn = await this.tryPath(target);
      if (conn) { this.adopt(conn); return; }
    }
    if (!this.closed && this.desired) this.scheduleReconnect();
  }

  tryPath(target) {
    return new Promise((resolve) => {
      let socket;
      try { socket = this.connect(target); } catch { resolve(null); return; }
      if (!socket) { resolve(null); return; }
      let done = false, safety = null;
      const finish = (conn) => { if (done) return; done = true; if (safety !== null) this.clearTimeout(safety); resolve(conn); };
      const conn = new Connection(this, socket, { onReady: () => finish(conn), onFailed: () => finish(null) });
      safety = this.setTimeout(() => conn.fail(new Error("Discord did not answer")), this.handshakeMs + 1000);
    });
  }

  adopt(conn) {
    if (this.closed || conn.closed) { if (!this.closed && this.desired) this.scheduleReconnect(); return; }
    this.conn = conn;
    this.ready = true;
    this.connecting = false;
    this.displayed = false;
    this.lastSentKey = null;
    this.lastSentStart = null;
    this.sentAt = [];
    this.ratePauseUntil = 0;
    this.backoffIndex = 0;
    if (this.retryTimer) { this.clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.desired) this.pump();
    else this.resolveClear();
  }

  connectionLost(conn, error) {
    if (conn !== this.conn) return;
    this.conn = null;
    this.ready = false;
    this.displayed = false;
    this.lastSentKey = null;
    this.lastSentStart = null;
    if (this.writing) { this.clearTimeout(this.writing.timer); this.writing = null; }
    if (!this.closed && this.desired) this.scheduleReconnect();
    this.resolveClear();
  }

  scheduleReconnect() {
    if (this.closed || !this.desired || this.retryTimer) return;
    const wait = this.backoff[Math.min(this.backoffIndex, this.backoff.length - 1)];
    this.backoffIndex++;
    const untilRate = Math.max(0, this.ratePauseUntil - this.now());
    this.retryTimer = this.setTimeout(() => { this.retryTimer = null; this.ensureConnection(); }, Math.max(wait, untilRate));
  }

  onMessage(value) {
    if (value?.evt === "ERROR") { this.handleError(value.data || value); return; }
    if (value?.cmd === "SET_ACTIVITY") this.onWriteResult(value);
  }

  onWriteResult(value) {
    const write = this.writing;
    if (!write) return;
    if (value?.nonce && value.nonce !== write.nonce) return;
    if (value?.data && (value.data.code || value.data.message)) { this.handleError(value.data); return; }
    this.clearTimeout(write.timer);
    this.writing = null;
    if (write.activity) {
      this.displayed = true;
      this.lastSentKey = write.key;
      this.lastSentStart = write.activity.timestamps.start;
    } else {
      this.displayed = false;
      this.lastSentKey = null;
      this.lastSentStart = null;
      this.forceClear = false;
      this.resolveClear();
    }
    this.pump();
  }

  handleError(data) {
    const message = String(data?.message || data?.error || "Discord error");
    this.logOnce(message);
    if (this.writing) { this.clearTimeout(this.writing.timer); this.writing = null; }
    if (this.isRateLimit(data)) {
      // The wish stays; after the pause the same write is tried again (and a clear is still a clear).
      this.ratePauseUntil = this.now() + this.ratePauseMs;
      this.pump();
      return;
    }
    // A bad client id or a refused command will not get better by itself: forget the wish, quietly.
    this.desired = null;
    this.lastSentKey = null;
    this.lastSentStart = null;
    this.forceClear = false;
    this.resolveClear();
  }

  // Discord's ERROR code for a rate limit is 5010. (ERROR 4002 is an invalid command; only a close frame's 4002 means
  // rate limited, and Connection handles that one before this is reached.)
  isRateLimit(data) {
    return Number(data?.code) === 5010;
  }

  noteRateLimit() { this.ratePauseUntil = this.now() + this.ratePauseMs; }

  logOnce(message) {
    if (!message || this.logged.has(message)) return;
    this.logged.add(message);
    try { this.log(message); } catch { /* a logger that throws is no reason to stop */ }
  }

  // The wait the next set must make: four writes in 20 s, a second between two, and Discord's own pause. A clear skips
  // the window and floor (pump checks the pause for it).
  sendWait() {
    if (this.burstLeft > 0) return 0;
    const now = this.now();
    this.sentAt = this.sentAt.filter((at) => now - at < this.rate.windowMs);
    let wait = 0;
    if (this.sentAt.length >= this.rate.sends) wait = this.sentAt[0] + this.rate.windowMs - now;
    if (this.sentAt.length) wait = Math.max(wait, this.sentAt[this.sentAt.length - 1] + this.rate.floorMs - now);
    if (this.ratePauseUntil > now) wait = Math.max(wait, this.ratePauseUntil - now);
    return Math.max(0, wait);
  }

  pump() {
    if (this.closed || !this.ready || this.writing) return;
    if (!this.desired) {
      if (!this.displayed && !this.forceClear) { this.resolveClear(); return; }
      // A clear skips the window and the floor, but Discord's own rate-limit pause is not ours to ignore.
      const wait = Math.max(0, this.ratePauseUntil - this.now());
      if (wait > 0) { this.armPump(wait); return; }
      this.send(null);
      return;
    }
    const key = activityKey(this.desired);
    if (this.displayed && key === this.lastSentKey) return;
    const wait = this.sendWait();
    if (wait > 0) { this.armPump(wait); return; }
    this.send(this.desired);
  }

  armPump(wait) {
    if (this.pumpTimer) return;
    this.pumpTimer = this.setTimeout(() => { this.pumpTimer = null; this.pump(); }, Math.ceil(wait));
  }

  cancelPump() {
    if (!this.pumpTimer) return;
    this.clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
  }

  send(activity) {
    const nonce = this.randomUUID();
    const write = { nonce, activity, key: activityKey(activity), timer: null };
    this.writing = write;
    this.sentAt = this.sentAt.filter((at) => this.now() - at < this.rate.windowMs);
    this.sentAt.push(this.now());
    if (this.burstLeft > 0) this.burstLeft--;
    write.timer = this.setTimeout(() => this.writeFailed("Discord did not answer"), this.writeMs);
    this.conn.write(OP.FRAME, { cmd: "SET_ACTIVITY", args: { pid: this.pid, activity }, nonce });
  }

  writeFailed(message) {
    if (!this.writing) return;
    this.clearTimeout(this.writing.timer);
    this.writing = null;
    this.lastSentKey = null;
    this.lastSentStart = null;
    this.logOnce(message);
    if (this.conn) this.conn.fail(new Error(message));
  }

  resolveClear() {
    const waiters = this.clearWaiters;
    this.clearWaiters = [];
    for (const resolve of waiters) resolve();
  }

  // Closing the app: stop waiting, close the pipe. A clear is sent by clear() before this.
  close() {
    this.closed = true;
    this.cancelPump();
    if (this.retryTimer) { this.clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.writing) { this.clearTimeout(this.writing.timer); this.writing = null; }
    const conn = this.conn;
    this.conn = null;
    this.ready = false;
    try { conn?.socket?.destroy(); } catch { /* already gone */ }
    this.resolveClear();
  }
}

module.exports = { DiscordPresence, sanitizeActivity, activityKey, pipePaths, frame, readFrames, CLIENT_ID, OP, RATE, BACKOFF };
