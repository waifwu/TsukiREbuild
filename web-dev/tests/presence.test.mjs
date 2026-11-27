// Discord Rich Presence: the page's route/day/play-time wish (web/app/js/presence.js) and the desktop app's pipe client
// (web-dev/desktop/discord.js), tried without Discord: a fake pipe, a fake clock and a store in memory.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const { DiscordPresence, sanitizeActivity, activityKey, pipePaths, frame, readFrames, CLIENT_ID, OP } = createRequire(import.meta.url)("../desktop/discord.js");
const { routeOf, dayOf, activityFor, activitySignature, createPresence, readPlaytime, PROLOGUE, COMMON, ARCUEID, CIEL, SENSEI } = await import("../../web/app/js/presence.js");

const store = (init = {}) => {
  const map = new Map(Object.entries(init));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
};

// A clock whose timers run only when told to, so the 20 s window and the reconnects can be walked through.
function clock(start = 1_700_000_000_000) {
  let now = start, nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++nextId; timers.set(id, { at: now + Math.max(0, ms), fn }); return id; },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [id, timer] of timers) if (timer.at <= target && (!next || timer.at < next[1].at)) next = [id, timer];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
    get size() { return timers.size; },
  };
}

const settle = () => new Promise((done) => setImmediate(done));

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.connecting = true;
    this.readyState = "connecting";
    this.destroyed = false;
    this.writes = [];
  }
  write(buffer) { this.writes.push(Buffer.from(buffer)); return true; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.readyState = "closed"; queueMicrotask(() => this.emit("close")); }
  connect() { this.connecting = false; this.readyState = "open"; this.emit("connect"); }
  send(op, value) { this.emit("data", frame(op, value)); }
  frames() {
    const out = [];
    let buffer = Buffer.alloc(0);
    for (const write of this.writes) {
      const { frames, rest } = readFrames(buffer, write);
      buffer = rest;
      out.push(...frames.map(([op, value]) => ({ op, value })));
    }
    return out;
  }
  commands() { return this.frames().filter((f) => f.op === OP.FRAME && f.value?.cmd === "SET_ACTIVITY").map((f) => f.value); }
}

function makePresence(clock, sockets, log = []) {
  let nonce = 0;
  return new DiscordPresence({
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    paths: () => ["test-pipe"], randomUUID: () => `nonce-${++nonce}`, log: (message) => log.push(message),
    handshakeMs: 1000, writeMs: 5000,
  });
}

async function ready(socket) {
  socket.connect();
  socket.send(OP.FRAME, { evt: "READY", data: { v: 1 } });
  await settle();
}

async function ack(socket, command) {
  socket.send(OP.FRAME, { cmd: "SET_ACTIVITY", data: command.args.activity, nonce: command.nonce });
  await settle();
}

const wish = (start = 1_700_000_000, details = "Common Route", state = "Day 1") => ({
  details, state, start, assets: { large_image: "tsukihime", large_text: "Tsukihime" },
});

test("presence wish: only the lines and start Discord can take, and assets only of the app's own", () => {
  assert.deepEqual(sanitizeActivity(wish()).details, "Common Route");
  assert.equal(sanitizeActivity(wish()).timestamps.start, 1_700_000_000);
  assert.equal(sanitizeActivity({ ...wish(), details: "x" }), null, "too short");
  assert.equal(sanitizeActivity({ ...wish(), start: 0 }), null, "no timer");
  assert.equal(sanitizeActivity({ ...wish(), start: 1.5 }), null, "whole seconds only");
  const sanitized = sanitizeActivity({ ...wish(), assets: { large_image: "other", small_image: "route_arc", small_text: "Arcueid Route" } });
  assert.deepEqual(sanitized.assets, { small_image: "route_arc", small_text: "Arcueid Route" });
  assert.equal(activityKey(wish(1)), activityKey(wish(2)), "the timer does not make it another activity");
  assert.notEqual(activityKey(wish()), activityKey(wish(1_700_000_000, "Common Route", "Day 2")));
});

test("presence pipes: ten a directory, Windows named pipes and Linux's own, Flatpak and Snap included", () => {
  const win = pipePaths({}, "win32");
  assert.equal(win.length, 10);
  assert.equal(win[0], "\\\\?\\pipe\\discord-ipc-0");
  const linux = pipePaths({ XDG_RUNTIME_DIR: "/run/user/1000", TMPDIR: "/tmp" }, "linux");
  assert.equal(linux[0], "/run/user/1000/discord-ipc-0");
  assert.ok(linux.includes("/run/user/1000/app/com.discordapp.Discord/discord-ipc-0"));
  assert.ok(linux.includes("/run/user/1000/snap.discord/discord-ipc-0"));
  assert.ok(linux.includes("/tmp/discord-ipc-9"));
  assert.equal(new Set(linux).size, linux.length, "no pipe asked for twice");
});

test("desktop presence: the pipes are tried in order; a silent one is left, and the first that says READY gets the wish", async () => {
  const time = clock(), sockets = [];
  const presence = new DiscordPresence({
    now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    paths: () => ["one", "two", "three"], randomUUID: () => "nonce", log: () => {},
    handshakeMs: 1000, writeMs: 5000,
  });
  presence.setActivity(wish());
  assert.equal(sockets.length, 1);
  sockets[0].connect();
  time.advance(1000);   // it did not answer: the search goes on
  await settle();
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].destroyed, true);
  await ready(sockets[1]);
  assert.equal(sockets[1].commands().length, 1, "the adopted pipe is given the wish");
  assert.equal(sockets.length, 2, "the last pipe is not asked for once one is up");
  presence.close();
});

test("desktop presence: a pipe that refuses before READY is left, and the next pipe still gets the wish", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = new DiscordPresence({
    now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    paths: () => ["one", "two"], randomUUID: () => "nonce", log: (message) => log.push(message),
    handshakeMs: 1000, writeMs: 5000,
  });
  presence.setActivity(wish());
  const first = sockets[0];
  first.connect();
  first.send(OP.FRAME, { evt: "ERROR", data: { code: 4000, message: "Invalid Client ID" } });
  await settle();
  assert.notEqual(presence.desired, null, "a refusal before READY says nothing about the wish");
  assert.equal(first.destroyed, true);
  assert.equal(sockets.length, 2, "the search goes on to the next pipe");
  await ready(sockets[1]);
  assert.equal(sockets[1].commands()[0].args.activity.details, "Common Route", "the second pipe gets the wish");
  assert.deepEqual(log, ["Discord refused the connection (4000): Invalid Client ID"], "logged once, with its code");
  presence.close();
});

test("desktop presence: a handshake refused by a close frame is logged with its code", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = new DiscordPresence({
    now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    paths: () => ["one", "two"], randomUUID: () => "nonce", log: (message) => log.push(message),
    handshakeMs: 1000, writeMs: 5000,
  });
  presence.setActivity(wish());
  const first = sockets[0];
  first.connect();
  first.send(OP.CLOSE, { code: 4000, message: "Invalid Client ID" });
  await settle();
  assert.deepEqual(log, ["Discord closed the pipe (4000): Invalid Client ID"], "a bad application id is not silent");
  assert.notEqual(presence.desired, null, "the wish is kept");
  assert.equal(sockets.length, 2, "the search goes on to the next pipe");
  presence.close();
});

test("desktop presence: a burst run prints Discord's replies, with their codes", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = new DiscordPresence({
    now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    connect: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    paths: () => ["test-pipe"], randomUUID: () => "nonce", log: (message) => log.push(message),
    handshakeMs: 1000, writeMs: 5000, trace: true,
  });
  presence.setActivity(wish());
  const socket = sockets[0];
  await ready(socket);
  assert.ok(log.some((line) => line.startsWith("received READY:")), "READY is printed");
  const set = socket.commands()[0];
  socket.send(OP.FRAME, { cmd: "SET_ACTIVITY", data: { code: 5010, message: "You are being rate limited" }, nonce: set.nonce });
  await settle();
  assert.ok(log.some((line) => line.startsWith("received SET_ACTIVITY:") && line.includes("5010")), "the reply's code is printed");
  assert.ok(log.includes("Discord error (5010): You are being rate limited"), "the error line carries its code");
  presence.close();
});

test("desktop presence: handshake, READY, one set for the same words, and a changed day sent", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = makePresence(time, sockets, log);
  presence.setActivity(wish());
  assert.equal(sockets.length, 1, "the pipe is looked for once the page asks");
  const socket = sockets[0];
  socket.connect();
  const handshake = socket.frames()[0];
  assert.equal(handshake.op, OP.HANDSHAKE);
  assert.deepEqual(handshake.value, { v: 1, client_id: CLIENT_ID });
  assert.equal(socket.commands().length, 0, "nothing set before READY");
  socket.send(OP.FRAME, { evt: "READY", data: { v: 1 } });
  await settle();
  const first = socket.commands()[0];
  assert.equal(first.args.activity.details, "Common Route");
  assert.equal(first.args.activity.timestamps.start, 1_700_000_000);
  await ack(socket, first);
  presence.setActivity(wish(1_700_000_100));
  await settle();
  assert.equal(socket.commands().length, 1, "the same route and day do not restart the timer");
  time.advance(1000);   // the floor between two writes
  presence.setActivity(wish(1_700_000_100, "Common Route", "Day 2"));
  await settle();
  assert.equal(socket.commands().length, 2, "a changed day is sent");
  assert.deepEqual(log, []);
  presence.close();
});

test("desktop presence: a wish that comes back to what is shown replaces the one still waiting for the window", async () => {
  const time = clock(), sockets = [];
  const presence = makePresence(time, sockets);
  presence.setActivity(wish());
  const socket = sockets[0];
  await ready(socket);
  await ack(socket, socket.commands()[0]);
  presence.setActivity(wish(1_700_000_000, "Common Route", "Day 2"));   // the floor has not passed: it waits
  await settle();
  assert.equal(socket.commands().length, 1);
  presence.setActivity(wish(1_700_000_300));   // back to what the profile already shows
  await settle();
  time.advance(2000);
  await settle();
  assert.equal(socket.commands().length, 1, "the day change that was waiting never goes");
  presence.close();
});

test("desktop presence: a clear waits for the set already in flight, then goes at once; repeats are skipped", async () => {
  const time = clock(), sockets = [];
  const presence = makePresence(time, sockets);
  presence.setActivity(wish());
  const socket = sockets[0];
  await ready(socket);
  const set = socket.commands()[0];   // deliberately not answered yet
  const cleared = presence.clear();
  await settle();
  assert.equal(socket.commands().length, 1, "no second write while the set is waiting");
  await ack(socket, set);
  assert.equal(socket.commands().length, 2, "the clear goes as soon as the set's answer comes");
  const clear = socket.commands()[1];
  assert.equal(clear.args.activity, null);
  await ack(socket, clear);
  await cleared;
  assert.equal(socket.commands().length, 2);
  await presence.clear();
  await settle();
  assert.equal(socket.commands().length, 2, "nothing shown: nothing to clear");
  const forced = presence.clear({ force: true });
  await settle();
  assert.equal(socket.commands().length, 3, "a forced clear goes anyway");
  await ack(socket, socket.commands()[2]);
  await forced;
  presence.close();
});

test("desktop presence: a rate-limited clear waits for the pause too, instead of going again at once", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = makePresence(time, sockets, log);
  presence.setActivity(wish());
  const socket = sockets[0];
  await ready(socket);
  await ack(socket, socket.commands()[0]);
  presence.clear();
  await settle();
  assert.equal(socket.commands().length, 2, "the clear skips the window");
  assert.equal(socket.commands()[1].args.activity, null);
  socket.send(OP.FRAME, { evt: "ERROR", data: { code: 5010, message: "You are being rate limited" } });
  await settle();
  assert.equal(socket.commands().length, 2, "a refused clear is not sent again at once");
  time.advance(19999);
  await settle();
  assert.equal(socket.commands().length, 2, "still waiting");
  time.advance(1);
  await settle();
  assert.equal(socket.commands().length, 3, "the same clear is tried once after 20 s");
  assert.equal(socket.commands()[2].args.activity, null);
  assert.deepEqual(log, ["Discord error (5010): You are being rate limited"], "logged once, with its code");
  presence.close();
});

test("desktop presence: a clear under way when the pipe drops is written by the next pipe", async () => {
  const time = clock(), sockets = [];
  const presence = makePresence(time, sockets);
  presence.setActivity(wish());
  const first = sockets[0];
  await ready(first);
  await ack(first, first.commands()[0]);
  presence.clear();   // the clear goes now; its answer is lost with the pipe
  await settle();
  assert.equal(first.commands().length, 2);
  assert.equal(first.commands()[1].args.activity, null);
  first.destroy();
  await settle();
  time.advance(5000);
  await settle();
  assert.equal(sockets.length, 2, "the clear is still owed: the next pipe is tried");
  const second = sockets[1];
  await ready(second);
  assert.equal(second.commands().length, 1, "the clear goes on the new pipe");
  assert.equal(second.commands()[0].args.activity, null);
  await ack(second, second.commands()[0]);
  second.destroy();
  await settle();
  time.advance(30000);
  await settle();
  assert.equal(sockets.length, 2, "once written, nothing is left to reconnect for");
  presence.close();
});

test("desktop presence: a lost pipe keeps the wish and reconnects with the same timer start", async () => {
  const time = clock(), sockets = [];
  const presence = makePresence(time, sockets);
  presence.setActivity(wish(1_699_999_000, "Arcueid Route", "Day 4"));
  const first = sockets[0];
  await ready(first);
  const sent = first.commands()[0];
  await ack(first, sent);
  first.destroy();
  await settle();
  time.advance(4999);
  await settle();
  assert.equal(sockets.length, 1, "the first backoff is five seconds");
  time.advance(1);
  await settle();
  assert.equal(sockets.length, 2);
  const second = sockets[1];
  await ready(second);
  const again = second.commands()[0];
  assert.equal(again.args.activity.timestamps.start, 1_699_999_000, "the same start, not the time the pipe came back");
  presence.close();
});

test("desktop presence: a close frame's 4002 is the rate limit and holds the reconnect back", async () => {
  const time = clock(), sockets = [];
  const presence = makePresence(time, sockets);
  presence.setActivity(wish());
  const first = sockets[0];
  await ready(first);
  await ack(first, first.commands()[0]);
  first.send(OP.CLOSE, { code: 4002, message: "You are being rate limited" });
  await settle();
  time.advance(5000);
  await settle();
  assert.equal(sockets.length, 1, "the usual first backoff is not enough");
  time.advance(14999);
  await settle();
  assert.equal(sockets.length, 1, "still waiting");
  time.advance(1);
  await settle();
  assert.equal(sockets.length, 2, "the next pipe is tried after 20 s");
  presence.close();
});

test("desktop presence: Discord's rate limit (5010) keeps the wish and retries after 20 s; an invalid command is forgotten", async () => {
  const time = clock(), sockets = [], log = [];
  const presence = makePresence(time, sockets, log);
  presence.setActivity(wish());
  const socket = sockets[0];
  await ready(socket);
  assert.equal(socket.commands().length, 1);
  socket.send(OP.FRAME, { evt: "ERROR", data: { code: 5010, message: "You are being rate limited" } });
  await settle();
  time.advance(19999);
  await settle();
  assert.equal(socket.commands().length, 1, "still waiting");
  time.advance(1);
  await settle();
  assert.equal(socket.commands().length, 2, "the same wish is tried again");
  assert.deepEqual(log, ["Discord error (5010): You are being rate limited"], "logged once, with its code");
  presence.close();

  const otherTime = clock(), otherSockets = [], otherLog = [];
  const other = makePresence(otherTime, otherSockets, otherLog);
  other.setActivity(wish());
  const pipe = otherSockets[0];
  await ready(pipe);
  // ERROR 4002 is an invalid command (a close frame's 4002 is the rate limit): it must not be retried.
  pipe.send(OP.FRAME, { evt: "ERROR", data: { code: 4002, message: "Invalid command" } });
  await settle();
  assert.equal(other.desired, null, "a refused command is not tried forever");
  otherTime.advance(20000);
  await settle();
  assert.equal(pipe.commands().length, 1, "an invalid command is not sent again");
  assert.deepEqual(otherLog, ["Discord error (4002): Invalid command"]);
  other.close();
});

test("presence route and day: prologue, common until the day-3 split, then the script's own route", () => {
  const split = 70;   // 03_00_ARC03_5B's place in the script list, which is sorted by name
  assert.equal(routeOf("00_01", 2, split), PROLOGUE);
  assert.equal(routeOf("03_00_ARC03_5B", split, split), COMMON, "the split itself is common");
  // Ciel's day-3 scenes sort after the split, but are played before the route is chosen: no spoiler yet.
  assert.equal(routeOf("03_01_CIEL03_1", 73, split), COMMON);
  assert.equal(routeOf("03_01_CIEL03_2_1", 74, split), COMMON);
  assert.equal(routeOf("03_01_CIEL03_2_3", 75, split), COMMON);
  assert.equal(routeOf("04_00_ARC04_1", 81, split), ARCUEID);
  assert.equal(routeOf("05_01_CIEL05_2_2_2", 156, split), CIEL);
  assert.equal(routeOf("QA_01", 495, split), SENSEI);
  // The offer before a corner and the staff roll name no route: they keep the one last played.
  assert.equal(routeOf("QACALL", 529, split), null, "not the corner until the offer is accepted");
  assert.equal(routeOf("QACALL", 529, split, ARCUEID), ARCUEID);
  assert.equal(routeOf("STAFFROLL", 530, split), null);
  assert.equal(routeOf("STAFFROLL", 530, split, CIEL), CIEL);
  assert.equal(dayOf("04_00_ARC04_1"), 4);
  assert.equal(dayOf("QA_01"), null);
  const prologue = activityFor("00_01", 2, split, 0, 1_700_000_000_000);
  assert.equal(prologue.details, PROLOGUE);
  assert.equal(prologue.state, undefined, "no day in the prologue");
  assert.equal(prologue.assets.small_image, undefined);
  const arc = activityFor("04_00_ARC04_1", 81, split, 3_600_000, 1_700_000_000_000);
  assert.equal(arc.state, "Day 4");
  assert.equal(arc.assets.small_image, "route_arc");
  assert.equal(arc.start, 1_699_996_400, "the start of the whole play time");
  assert.equal(activitySignature(arc), activitySignature({ ...arc, start: 1_600_000_000 }), "the timer is not part of the words");
  const offer = activityFor("QACALL", 529, split, 3_600_000, 1_700_000_000_000, ARCUEID);
  assert.equal(offer.details, ARCUEID, "the offer keeps the route just played");
  assert.equal(offer.state, undefined);
  const credits = activityFor("STAFFROLL", 530, split, 3_600_000, 1_700_000_000_000, CIEL);
  assert.equal(credits.details, CIEL);
  assert.equal(credits.assets.small_image, "route_ciel");
});

test("presence route: the offer and the staff roll keep the route last played", () => {
  const storage = store();
  let time = 1_000_000;
  const sent = [];
  const vm = { running: true, replay: false, script: { name: "04_00_ARC04_1" }, scriptIndex: 81, index: { names: Array(549).fill("x") } };
  vm.index.names[70] = "03_00_ARC03_5B";
  const presence = createPresence({
    vm, now: () => time, storage, hidden: () => false, flushMs: 100000,
    send: (activity, force) => { sent.push({ activity, force }); },
  });
  presence.setEnabled(true);
  assert.equal(sent.at(-1).activity.details, ARCUEID);
  vm.script = { name: "QACALL" }; vm.scriptIndex = 529;
  time += 1000;
  presence.tick();
  assert.equal(sent.at(-1).activity.details, ARCUEID, "the offer keeps the route just played");
  assert.notEqual(sent.at(-1).activity.details, SENSEI);
  vm.script = { name: "QA_01" }; vm.scriptIndex = 495;
  time += 1000;
  presence.tick();
  assert.equal(sent.at(-1).activity.details, SENSEI, "accepting the offer opens the corner");
  vm.script = { name: "05_01_CIEL05_2_2_2" }; vm.scriptIndex = 156;
  time += 1000;
  presence.tick();
  vm.script = { name: "STAFFROLL" }; vm.scriptIndex = 530;
  time += 1000;
  presence.tick();
  assert.equal(sent.at(-1).activity.details, CIEL, "the staff roll keeps the ending's route");
  assert.notEqual(sent.at(-1).activity.details, COMMON);
  presence.setEnabled(false);
});

test("presence play time: story and visible only, menus included, saved every flush and on the way out", () => {
  const storage = store();
  let time = 1_000_000;
  const sent = [];
  const vm = { running: true, replay: false, script: { name: "04_00_ARC04_1" }, scriptIndex: 81, index: { names: Array(549).fill("x") } };
  vm.index.names[70] = "03_00_ARC03_5B";
  let hidden = false;
  const presence = createPresence({
    vm, now: () => time, storage, hidden: () => hidden, flushMs: 100,
    send: (activity, force) => { sent.push({ activity, force }); },
  });
  assert.equal(presence.playtimeMs, 0);
  presence.tick();
  presence.setEnabled(true);
  assert.equal(sent.at(-1).activity.details, ARCUEID, "a story starts the presence");
  time += 500;
  presence.tick();
  assert.equal(presence.playtimeMs, 500);
  time += 100;
  presence.tick();
  assert.equal(storage.getItem("tsuki.playtime"), "600", "flushed at the interval");
  sent.length = 0;
  time += 1000;
  presence.tick();
  assert.equal(sent.length, 0, "the same route and day are not sent again");
  assert.equal(presence.playtimeMs, 1600);
  hidden = true;
  time += 1000;
  presence.tick();
  assert.equal(presence.playtimeMs, 1600, "a hidden page is not play");
  assert.equal(sent.at(-1).activity, null, "and the activity goes");
  hidden = false;
  sent.length = 0;
  time += 1000;
  presence.tick();
  assert.equal(presence.playtimeMs, 1600, "the hidden second is not counted");
  assert.ok(sent.at(-1).activity, "back in sight, the story goes up again");
  vm.running = false;
  sent.length = 0;
  time += 1000;
  presence.tick();
  assert.equal(presence.playtimeMs, 1600, "the title is not play");
  assert.equal(sent.at(-1).activity, null);
  vm.running = true;
  vm.replay = true;
  sent.length = 0;
  time += 1000;
  presence.tick();
  assert.equal(presence.playtimeMs, 1600, "a gallery replay is not play");
  assert.equal(sent.length, 0, "the title had already taken the activity down");
  vm.replay = false;
  time += 1000;
  presence.tick();
  presence.setEnabled(false);
  assert.equal(sent.at(-1).activity, null);
  assert.equal(sent.at(-1).force, true, "turning the switch off clears at once");
  presence.suspend();
  assert.equal(sent.at(-1).force, true, "closing the app clears too");
  assert.equal(readPlaytime(storage), 2600);
  assert.equal(storage.getItem("tsuki.playtime"), "2600");
});
