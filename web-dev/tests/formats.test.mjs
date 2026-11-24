// Whether the browser plays the game's sound (Ogg Opus) and its movies (AV1), and what the page says where it does not (web/app/js/formats.js):
// PLAY ONLINE's red lines (home.js) and the notice before the title (main.js). A player on iPadOS 17.7 heard nothing at all (WebKit opens Ogg only from 18.4).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = () => ({ s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const F = await import("../../web/app/js/formats.js");
const H = await import("../../web/app/js/home.js");
const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// A window whose decoder answers as told: "ok", "refuse" (the promise rejects), "callback" (only the error callback, as older WebKit), "throw", "never".
const win = (how, extra = {}) => ({
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  OfflineAudioContext: class {
    decodeAudioData(buf, ok, fail) {
      assert.ok(buf instanceof ArrayBuffer && buf.byteLength > 100);
      if (how === "throw") throw new Error("no");
      if (how === "callback") { setTimeout(() => fail(null)); return undefined; }
      if (how === "never") return new Promise(() => {});
      return how === "ok" ? Promise.resolve({}) : Promise.reject(new DOMException("Decoding failed", "EncodingError"));
    }
  },
  ...extra,
});
const ask = (w, wait) => { F.forgetSound(); return F.soundPlays(w, wait); };

test("the probe is a real Ogg Opus file: OggS pages, an OpusHead at 48 kHz", () => {
  const src = read("web/app/js/formats.js");
  const b64 = /const PROBE = "([^"]+)"/.exec(src)[1];
  const bytes = Buffer.from(b64, "base64");
  assert.equal(bytes.subarray(0, 4).toString("latin1"), "OggS");
  const head = bytes.indexOf("OpusHead");
  assert.ok(head > 0);
  assert.equal(bytes.readUInt32LE(head + 12), 48000);
});

test("the sound counts as unplayable only when the browser refuses the decode outright", async () => {
  assert.equal(await ask(win("ok")), true);
  assert.equal(await ask(win("refuse")), false);
  assert.equal(await ask(win("callback")), false, "older WebKit answers through the error callback");
  assert.equal(await ask(win("throw")), true, "a question that throws says nothing");
  assert.equal(await ask(win("never"), 20), true, "no answer says nothing");
  assert.equal(await ask({ atob: () => "" }), true, "no decoder at all says nothing");
  F.forgetSound();
});

test("the answer is asked once and kept", async () => {
  F.forgetSound();
  let n = 0;
  const w = win("refuse");
  const Ctx = w.OfflineAudioContext;
  w.OfflineAudioContext = class extends Ctx { decodeAudioData(...a) { n++; return super.decodeAudioData(...a); } };
  assert.equal(await F.soundPlays(w), false);
  assert.equal(await F.soundPlays(win("ok")), false);
  assert.equal(n, 1);
  F.forgetSound();
});

test("the movies count as unplayable only where the browser says it can't play their AV1", () => {
  const doc = (answer) => ({ document: { createElement: () => ({ canPlayType: (t) => (assert.equal(t, F.AV1), answer) }) } });
  assert.equal(F.moviesPlay(doc("probably")), true);
  assert.equal(F.moviesPlay(doc("maybe")), true);
  assert.equal(F.moviesPlay(doc("")), false);
  assert.equal(F.moviesPlay({}), true);
  assert.equal(F.AV1, 'video/mp4; codecs="av01.0.08M.08"');   // the movies' own: av1 Main, level 4.0, 8 bit
});

test("an iPhone or an iPad is told what fits it: never another browser, which is the same WebKit there", () => {
  const ipad = { navigator: { userAgent: "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) CriOS/131", vendor: "Apple Computer, Inc.", maxTouchPoints: 5 } };
  const pc = { navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/131", vendor: "Google Inc.", maxTouchPoints: 0 } };
  for (const kind of ["sound", "movies", "note"]) {
    assert.equal(F.mediaLine(kind, ipad), F.MEDIA_TEXT[`${kind}Apple`]);
    assert.equal(F.mediaLine(kind, pc), F.MEDIA_TEXT[kind]);
    assert.doesNotMatch(F.MEDIA_TEXT[`${kind}Apple`], /Chrome|Firefox/);
  }
  assert.doesNotMatch(F.MEDIA_TEXT.playApple, /Chrome|Firefox/, "PLAY ONLINE's line for everyone, as an iPhone or an iPad has it");
  assert.match(read("web/app/js/home.js"), /if \(b === PLAY_LINE && appleTouch\(\)\) return blockEl\(trBlock\(MEDIA_TEXT\.playApple\)\);/);
  assert.match(F.MEDIA_TEXT.soundApple, /18\.4/);
  assert.match(F.MEDIA_TEXT.noteApple, /18\.4/);
});

test("PLAY ONLINE: the line for everyone no longer speaks of Safari; the red lines come under it", () => {
  const play = H.TABS[H.PLAY].sections[0].blocks;
  const at = play.findIndex((b) => Array.isArray(b) && b[0] === "media");
  assert.ok(at > 0);
  assert.equal(play[at - 1], "Plays in Chrome or Firefox, on a computer, phone or tablet. Saves and progress stay in this browser.");
  assert.ok(!play.some((b) => typeof b === "string" && /Safari|AV1/.test(b)));
  assert.match(read("web/app/style.css"), /\.wl-text \.hm-cant \{ color: #ff7a7a;/);
  // ABOUT, where a first visit opens: the same lines, where its note about Safari stood, set as a note
  const about = H.TABS[H.ABOUT].sections[0].blocks;
  assert.equal(JSON.stringify(about[0]), '["media"]');
  assert.ok(!about.some((b) => Array.isArray(b) && b[0] === "note"));
  assert.match(read("web/app/js/home.js"), /const cls = tab === ABOUT \? "wl-note hm-cant" : "hm-cant";/);
});

test("the notice before the title: once, after the first screens, never with ?mute or once a sound has decoded", () => {
  const main = read("web/app/js/main.js");
  assert.match(main, /if \(audio\.muted \|\| \(await soundPlays\(\)\) \|\| audio\.decoded\) return;/);
  const start = main.indexOf("await soundNotice();"), title = main.indexOf("else if (await boot()) ui.title();");
  assert.ok(start > 0 && start < title && start > main.indexOf("if (firstVisit) { await loadingScreen();"));
  assert.match(read("web/app/js/audio.js"), /this\.decoded = true;/);
});
