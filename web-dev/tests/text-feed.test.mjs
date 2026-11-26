// The desktop app's text feed (web-dev/desktop/textfeed.js): the story's lines, as plain text, to text-extraction tools such as texthooker-ui
// over a WebSocket on the player's own computer. What the page hands over (TextBox.onLine), the feed itself on real sockets, and how the app and
// the page are wired to it. The socket tests need the desktop app's packages (cd web-dev/desktop && npm install); without them they are skipped.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import net from "node:net";

globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } };
const { TextBox, lineText } = await import("../../web/app/js/textbox.js");

const at = (rel) => new URL(`../../${rel}`, import.meta.url);
const read = (rel) => readFileSync(at(rel), "utf8");
const HAVE_WS = existsSync(at("web-dev/desktop/node_modules/ws/package.json"));
const feedModule = () => createRequire(import.meta.url)("../desktop/textfeed.js");

// A port nothing listens on just now.
const freePort = () => new Promise((done, fail) => {
  const s = net.createServer();
  s.once("error", fail);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => done(port)); });
});
// A client as a texthooker page is one (Node's own WebSocket, the browser's): the messages it gets, and a wait for the next.
function client(url) {
  const ws = new WebSocket(url), got = [], waiting = [];
  ws.addEventListener("message", (e) => { got.push(e.data); waiting.shift()?.(e.data); });
  const opened = new Promise((done, fail) => { ws.addEventListener("open", done, { once: true }); ws.addEventListener("error", () => fail(Error(`no connection to ${url}`)), { once: true }); });
  const next = (ms = 2000) => new Promise((done, fail) => { const t = setTimeout(() => fail(Error("no message")), ms); waiting.push((v) => { clearTimeout(t); done(v); }); });
  return { ws, got, opened, next };
}
const settle = () => new Promise((done) => setTimeout(done, 100));

// ---- what the page hands over ------------------------------------------------------------------------------------------------------------------
test("each line logged goes to onLine as plain text: the ruby's base, an inline piece on its own, a choice's rows together", () => {
  const t = new TextBox(), got = [];
  t.onLine = (line) => got.push(line);
  t.log("<遠野|とおの>は@c1歩いた@c0。");   // (colour marks as colourMarks leaves them, vm.js)
  t.log("  ");                                      // (nothing to read: not logged, not told)
  t.log(" And more.", null, { inline: true });      // MSAD: the backlog joins it to the line before; the feed has it as it comes
  t.logChoice(["1.Yes", "2.<否|いな>"]);
  assert.deepEqual(got, ["遠野は歩いた。", " And more.", "1.Yes\n2.否"]);
  assert.equal(t.history[0].text, "遠野は歩いた。 And more.");
  // a listener that fails stops nothing
  t.onLine = () => { throw Error("gone"); };
  t.log("Still logged.");
  assert.equal(t.history.at(-1).text, "Still logged.");
  // and with no listener (the site, the Android app, an older desktop app) it is as before
  const u = new TextBox();
  u.log("Plain.");
  assert.equal(u.history.length, 1);
});

test("a line typed again (a load, Quick Jump, going back) is read back from the page for onLine, without the ruby's readings", () => {
  // the page as a restore leaves it: segments of letters, a ruby with its reading in <rt>, a dash run
  const t = (data) => ({ nodeType: 3, data });
  const e = (nodeName, ...childNodes) => ({ nodeType: 1, nodeName, childNodes, querySelectorAll: () => [] });   // (no letters to type: retype stops after telling)
  const ln = { segs: [
    e("SPAN", t("　いま、"), e("RUBY", e("SPAN", t("殊")), e("SPAN", t("更")), e("RT", e("SPAN", t("こと")), e("SPAN", t("さら")))), e("SPAN", t("に"))),
    e("SPAN", t("思いだす事があるとすれば、それは"), e("SPAN", t("―――"))),
  ] };
  assert.equal(lineText(ln), "　いま、殊更に思いだす事があるとすれば、それは―――");
  assert.equal(lineText(null), "");
  // retype tells it (a TextBox with that line on its page)
  const box = new TextBox(), got = [];
  box.onLine = (line) => got.push(line);
  box.lines = [ln];
  box.finish = () => {};
  box.retype();
  assert.deepEqual(got, ["　いま、殊更に思いだす事があるとすれば、それは―――"]);
  box.lines = [{ segs: [e("SPAN", t("  "))] }];
  box.retype();
  assert.equal(got.length, 1, "nothing to read: nothing told");
});

// ---- the feed ------------------------------------------------------------------------------------------------------------------------------------
test("--text-port: a whole number from 0 (off) to 65535 that a browser connects to, else 6677 (texthooker-ui's own default)", { skip: !HAVE_WS && "no ws: cd web-dev/desktop && npm install" }, () => {
  const { portOf, PORT } = feedModule();
  assert.equal(PORT, 6677);
  for (const [given, port] of [[null, 6677], [undefined, 6677], ["", 6677], ["0", 0], ["7000", 7000], ["65535", 65535], ["65536", 6677], ["-1", 6677], ["abc", 6677], ["66.5", 6677], ["6679", 6677], ["6697", 6677], ["10080", 6677], ["6680", 6680]]) {   // (6679 and the like: ports browsers refuse)
    assert.equal(portOf(given), port, String(given));
  }
});

test("the feed sends each line to every page connected, on 127.0.0.1 and ::1 (localhost), and reads nothing they send", { skip: !HAVE_WS && "no ws: cd web-dev/desktop && npm install" }, async () => {
  const { TextFeed } = feedModule();
  const port = await freePort(), said = [];
  const feed = new TextFeed({ port, log: (m) => said.push(m) });
  try {
    assert.equal(feed.info(), null, "nothing before it listens");
    assert.equal(await feed.start(), true);
    assert.deepEqual(feed.info(), { port });
    const a = client(`ws://localhost:${port}`), b = client(`ws://127.0.0.1:${port}`);
    await Promise.all([a.opened, b.opened]);
    let v6 = null;
    try { v6 = client(`ws://[::1]:${port}`); await v6.opened; } catch { v6 = null; }   // (a computer without IPv6)
    const lines = ["遠野は歩いた。", "1.Yes\n2.No"];
    for (const line of lines) {
      const arrived = [a.next(), b.next(), v6?.next()];
      feed.send(line);
      assert.deepEqual((await Promise.all(arrived)).slice(0, v6 ? 3 : 2), Array(v6 ? 3 : 2).fill(line));
    }
    // not a line: nothing goes out
    feed.send("");
    feed.send("   ");
    feed.send(42);
    // a page's own message is not read, and one too long for the feed closes that page only
    a.ws.send("hello");
    const closed = new Promise((done) => b.ws.addEventListener("close", done, { once: true }));
    b.ws.send("x".repeat(5000));
    await closed;
    feed.send("After.");
    assert.equal(await a.next(), "After.");
    await settle();
    assert.deepEqual(a.got, [...lines, "After."]);
    // a very long line is cut, not refused
    feed.send("あ".repeat(5000));
    assert.equal((await a.next()).length, 4000);
    // a plain request is told what this is
    const status = await new Promise((done, fail) => http.get(`http://127.0.0.1:${port}/`, (r) => { r.resume(); done(r.statusCode); }).on("error", fail));
    assert.equal(status, 426);
    a.ws.close();
    v6?.ws.close();
    assert.deepEqual(said, []);
  } finally { feed.close(); }
  assert.equal(feed.info(), null);
  await settle();
  // closed: the port is free again
  const again = new TextFeed({ port });
  try { assert.equal(await again.start(), true); } finally { again.close(); }
});

test("a port another program has is left to it: no feed, nothing thrown, and the page is told there is none", { skip: !HAVE_WS && "no ws: cd web-dev/desktop && npm install" }, async () => {
  const { TextFeed } = feedModule();
  const port = await freePort();
  const other = net.createServer();
  await new Promise((done) => other.listen(port, "127.0.0.1", done));
  const said = [];
  const feed = new TextFeed({ port, log: (m) => said.push(m) });
  try {
    assert.equal(await feed.start(), false);
    assert.equal(feed.info(), null);
    feed.send("Nobody hears this.");
    assert.equal(said.length, 1);
    assert.match(said[0], new RegExp(`port ${port} is not free \\(EADDRINUSE\\)`));
  } finally { feed.close(); other.close(); }
  // and --text-port=0 is no feed at all
  const off = new TextFeed({ port: 0 });
  assert.equal(await off.start(), false);
  assert.equal(off.info(), null);
  off.send("Nothing.");
  off.close();
});

// ---- the clipboard, for LunaTranslator ---------------------------------------------------------------------------------------------------------
const NEED_WS = !HAVE_WS && "no ws: cd web-dev/desktop && npm install";

test("--clipboard: on, off, else auto (while LunaTranslator runs); LunaTranslator is found in tasklist's rows, on Windows only", { skip: NEED_WS }, async () => {
  const { clipboardModeOf, hasLuna, lunaRunning } = feedModule();
  for (const [given, mode] of [[null, "auto"], ["", "auto"], ["on", "on"], ["off", "off"], ["auto", "auto"], ["yes", "auto"]]) assert.equal(clipboardModeOf(given), mode, String(given));
  const rows = (...names) => names.map((n) => `"${n}","1234","Console","1","12,345 K"`).join("\r\n");
  assert.equal(hasLuna(rows("explorer.exe", "Tsukihime.exe")), false);
  assert.equal(hasLuna(rows("explorer.exe", "LunaTranslator.exe")), true);
  assert.equal(hasLuna(rows("lunatranslator_admin.exe")), true);
  assert.equal(hasLuna(rows("NotLunaTranslator.exe", "LunaHost32.exe")), false);
  assert.equal(await lunaRunning({ platform: "darwin" }), false);
  assert.equal(await lunaRunning({ platform: "win32", exec: (cmd, args, opts, cb) => { assert.deepEqual([cmd, args], ["tasklist", ["/FO", "CSV", "/NH"]]); cb(null, rows("LunaTranslator.exe")); } }), true);
  assert.equal(await lunaRunning({ platform: "win32", exec: (cmd, args, opts, cb) => cb(Error("no tasklist"), "") }), false);
});

test("the clipboard gets each line in order, a little apart, the newest kept when too many wait", { skip: NEED_WS }, async () => {
  const { ClipboardFeed } = feedModule();
  const got = [];
  const clip = new ClipboardFeed({ mode: "on", gap: 15, write: (t) => got.push([Date.now(), t]) });
  assert.deepEqual(clip.info(), { mode: "on" });
  const lines = ["　いま、殊更に思いだす事があるとすれば、それは―――", "１．父親である遠野槙久の事だ。\n２．やはり、妹の秋葉の事だ。"];
  for (const l of lines) clip.send(l);
  clip.send("");
  clip.send("  ");
  clip.send(7);
  await clip.drained();
  assert.deepEqual(got.map(([, t]) => t), lines);
  assert.ok(got[1][0] - got[0][0] >= 14, `apart: ${got[1][0] - got[0][0]} ms`);
  // a burst (fast forward): at most 30 wait, the oldest dropped
  got.length = 0;
  for (let i = 0; i < 50; i++) clip.send(`Burst ${i}`);
  await clip.drained();
  assert.ok(got.length <= 31, `written ${got.length}`);
  assert.equal(got.at(-1)[1], "Burst 49");
  // a clipboard held by another program: that line is lost, the next ones go
  let fail = true;
  const flaky = new ClipboardFeed({ mode: "on", gap: 1, write: (t) => { if (fail) { fail = false; throw Error("busy"); } got.push([0, t]); } });
  got.length = 0;
  flaky.send("Lost");
  flaky.send("Kept");
  await flaky.drained();
  assert.deepEqual(got.map(([, t]) => t), ["Kept"]);
  clip.close();
  flaky.close();
});

test("auto: the clipboard is touched only while LunaTranslator runs, looked for again after a while; off is never", { skip: NEED_WS }, async () => {
  const { ClipboardFeed } = feedModule();
  let t = 0, running = false, looks = 0;
  const got = [];
  const clip = new ClipboardFeed({ gap: 1, lookEvery: 5000, now: () => t, running: async () => { looks++; return running; }, write: (s) => got.push(s) });
  assert.deepEqual(clip.info(), { mode: "auto" });
  clip.send("Nobody is running it.");
  await clip.drained();
  clip.send("Still within the look.");
  await clip.drained();
  assert.deepEqual([got, looks], [[], 1], "one look, nothing written");
  running = true;
  t += 5000;   // the look has run out: LunaTranslator is found
  clip.send("LunaTranslator opened.");
  clip.send("And the next line.");
  await clip.drained();
  assert.deepEqual(got, ["LunaTranslator opened.", "And the next line."]);
  assert.equal(looks, 2);
  running = false;
  t += 4000;   // within the look: still taken as running
  clip.send("Just closed.");
  await clip.drained();
  t += 1000;
  clip.send("Noticed closed.");
  await clip.drained();
  assert.deepEqual(got.slice(2), ["Just closed."]);
  // off
  const off = new ClipboardFeed({ mode: "off", write: () => assert.fail("written") });
  off.send("Nothing.");
  await off.drained();
  assert.equal(off.info(), null);
  clip.close();
});

// ---- how the app and the page are wired --------------------------------------------------------------------------------------------------------
test("the desktop app starts the feed and the clipboard writer when ready, tells the page of them in info, takes lines through `text`, and packs textfeed.js and ws", () => {
  const main = read("web-dev/desktop/main.js");
  assert.match(main, /const \{ TextFeed, portOf, ClipboardFeed, clipboardModeOf \} = require\("\.\/textfeed\.js"\);/);
  assert.match(main, /const TEXT_PORT = portOf\(flag\("text-port"\)\);\nconst CLIPBOARD = clipboardModeOf\(flag\("clipboard"\)\);/);
  assert.match(main, /const feedInfo = \(\) => \{ const ws = feed\?\.info\(\), cb = clip\?\.info\(\); return ws \|\| cb \? \{ port: ws\?\.port \?\? null, clipboard: cb\?\.mode \?\? null \} : null; \};/);
  assert.match(main, /\n  info: async \(\) => \{ await feedStarted; return \{ [^\n]*text: feedInfo\(\) \}; \},/);
  assert.match(main, /\n  text: \(\{ line \}\) => \{ const s = typeof line === "string" \? line : ""; feed\?\.send\(s\); clip\?\.send\(s\); return \{\}; \},/);
  assert.match(main, /app\.whenReady\(\)\.then\(\(\) => \{\n    loadUpdater\(\);\n    feed = new TextFeed\(\{ port: TEXT_PORT \}\);\n    feedStarted = feed\.start\(\)\.catch\(\(\) => false\);[^\n]*\n    clip = new ClipboardFeed\(\{ mode: CLIPBOARD, write: TEST_DIR \? [^\n]* : \(t\) => clipboard\.writeText\(t\) \}\);/);
  assert.match(main, /app\.on\("will-quit", \(\) => \{ feed\?\.close\(\); clip\?\.close\(\); presence\?\.close\(\); presence = null; \}\);/);
  // nothing is sent to LunaTranslator's network service any more (its /api/textinput brought its window forward each line, and crashed it)
  assert.ok(!/api\/textinput|LunaFeed|luna-port/.test(main + read("web-dev/desktop/textfeed.js").replace(/^\/\/.*$/gm, "")));
  // listening on this computer only
  const feed = read("web-dev/desktop/textfeed.js");
  assert.match(feed, /await listen\("127\.0\.0\.1"\)/);
  assert.match(feed, /await listen\("::1"\)/);
  assert.equal((feed.match(/\.listen\(/g) || []).length, 1, "one listen call, given the address each time");
  // packed: the module in the app's files, ws as a dependency of the app (not of the build), installed by build.sh when missing
  const pack = JSON.parse(read("web-dev/desktop/package.json"));
  assert.ok(pack.build.files.includes("textfeed.js"));
  assert.match(pack.dependencies.ws, /^\d+\.\d+\.\d+$/, "an exact version");
  assert.equal(pack.devDependencies.ws, undefined);
  assert.equal(JSON.parse(read("web-dev/desktop/package-lock.json")).packages["node_modules/ws"].version, pack.dependencies.ws);
  assert.match(read("web-dev/desktop/build.sh"), /\[ -d node_modules\/electron-builder \] && \[ -d node_modules\/ws \] \|\| npm install/);
});

test("the page sends a line only when the app's info names a feed, and none of a run that passes everything at once", () => {
  const page = read("web/app/js/main.js");
  assert.match(page, /import \{ HOST \} from "\.\/apphost\.js";/);
  assert.match(page, /HOST\?\.call\("info"\)\.then\(\(info\) => \{\n  if \(info\?\.text\) text\.onLine = \(line\) => \{ if \(!vm\.fast\) HOST\.call\("text", \{ line \}\)\.catch\(\(\) => \{\}\); \};\n  presenceAvailable = !!info\?\.presence;\n  if \(presenceAvailable\) \{\n    presence = createPresence\(\{ vm \}\);\n    presence\.setEnabled\(!!settings\.discordPresence\);\n  \}\n\}\)\.catch\(\(\) => \{\}\);/);
  const host = read("web/app/js/apphost.js");
  assert.ok(host.includes("//   text         { line }"));
  // the Android app has no feed: `text` is the desktop's alone, and the page never asks it of an app whose info does not name one
  assert.ok(!read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java").includes('case "text":'));
});
