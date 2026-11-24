// formats.js - whether this browser plays the game's sound and its movies, and what the page says where it does not (home.js: PLAY ONLINE's red
// lines; main.js: the notice before the title).
// Every sound is Ogg Opus (bgm, se, sys, voice and their packs) and every movie AV1 (MP4, Main profile, 8 bit, level 4.0). WebKit opens Ogg only from
// Safari 18.4 (iOS and iPadOS 18.4, macOS 15.4: webkit.org/blog/16574): before that every sound's decode is refused, and the game played on in silence with
// nothing said (a player on iPadOS 17.7, in Chrome, 2026-11-24). Safari plays AV1 only on the devices that decode it in hardware, Apple's newest. Every browser
// on an iPhone or an iPad is WebKit, so there another browser changes neither.
import { appleTouch } from "./touch.js";

// 66 ms of silence: Ogg Opus, mono, 48 kHz (ffmpeg, libopus), 177 bytes. The game's own files are Opus in Ogg too, packet for packet.
const PROBE = "T2dnUwACAAAAAAAAAAAuZ5AcAAAAAOOvOAABE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAC5nkBwBAAAAhbF2dQEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABHgMAAAAAAAALmeQHAIAAABBn/bUBAcGBgYIC+Y7I6tgCAissw7GCAissw7GCAissw7G";
// The movies' codec (ffprobe: av1, Main, level 8, which is 4.0, yuv420p)
export const AV1 = 'video/mp4; codecs="av01.0.08M.08"';

// What the page says: PLAY ONLINE's lines in red (home.js), the one that fits the device; and the notice in the game's own window before the title (main.js).
// On an iPhone or an iPad no other browser is offered: they are all the same WebKit.
export const MEDIA_TEXT = {
  // (PLAY ONLINE's line for everyone, as an iPhone or an iPad has it: there every browser is the same WebKit; home.js PLAY_LINE)
  playApple: "On an iPhone or iPad every browser is Safari underneath, so they all play it the same. Saves and progress stay in this browser.",
  soundApple: "This iPhone or iPad can't play the game's sound: that needs iOS or iPadOS 18.4 or newer, in every browser. Settings › General › Software Update.",
  sound: "This browser can't play the game's sound. Update it, or play in Chrome or Firefox; Safari needs macOS 15.4 or newer.",
  moviesApple: "This iPhone or iPad can't play the movies: they are AV1 video, which only Apple's newest devices play. The story goes on without them.",
  movies: "This browser can't play the movies: they are AV1 video, which Safari plays only on Apple's newest devices. Chrome or Firefox plays them.",
  noteApple: "No sound: the game's sound needs\niOS or iPadOS 18.4 or newer.",
  note: "No sound: this browser can't play\nthe game's sound. Try Chrome or Firefox.",
};
export const mediaLine = (kind, win = globalThis) => MEDIA_TEXT[appleTouch(win) ? `${kind}Apple` : kind];

// Whether the game's sound plays here: false only when the browser has refused to decode the probe. A decode that worked, no means to decode, a question
// that threw or no answer within `wait` ms all count as playing: a warning missing is better than a wrong one. Asked once; the answer is kept.
let heard = null;
export function soundPlays(win = globalThis, wait = 3000) {
  return (heard ||= new Promise((done) => {
    const Ctx = win.OfflineAudioContext || win.webkitOfflineAudioContext;
    if (!Ctx || typeof win.atob !== "function") { done(true); return; }
    const timer = setTimeout(() => done(true), wait);
    const answer = (ok) => { clearTimeout(timer); done(ok); };
    try {
      const bytes = Uint8Array.from(win.atob(PROBE), (c) => c.charCodeAt(0));
      // (the callbacks and the promise both: older WebKit answers through the callbacks; the first answer counts)
      const p = new Ctx(1, 1, 48000).decodeAudioData(bytes.buffer, () => answer(true), () => answer(false));
      p?.then?.(() => answer(true), () => answer(false));
    } catch { answer(true); }
  }));
}
// (for the tests: ask again)
export function forgetSound() { heard = null; }

// Whether the movies play here: false only where the browser says outright that it can't play their AV1.
export function moviesPlay(win = globalThis) {
  try {
    const v = win.document?.createElement?.("video");
    return typeof v?.canPlayType !== "function" || v.canPlayType(AV1) !== "";
  } catch { return true; }
}
