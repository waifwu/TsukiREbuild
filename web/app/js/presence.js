// presence.js - what the desktop app shows on Discord: the route being played, the in-game day, and the play time.
//
// Discord counts the elapsed time itself, so the page sends the moment the play time stood at 0 (the start of the
// activity's timer), not the time as words. The play time is kept in localStorage, in milliseconds, and grows only
// while a story runs and the page is visible: menus count, the title and a gallery replay do not. A player from before
// this feature starts at 0.
//
// The page's wish goes to the desktop app through apphost.js (host `presence`). The app finds Discord's local pipe and
// keeps the wish (desktop/discord.js); nothing here reaches the network. The feature is desktop-only: the module is
// made only when the app's info says it has `presence`, and the Config -> Controls -> Desktop switch is shown only then.
import { HOST } from "./apphost.js";

const STORE = "tsuki.playtime";
const FLUSH_MS = 15000;
const SPLIT = "03_00_ARC03_5B";                  // the day-3 scene after which the route is Arcueid's or Ciel's
const SENSEI = "Ciel-sensei's Corner";
// Ciel's day-3 scenes that sort (and so are indexed) after the split but are played before the route is chosen.
const PRE_SPLIT_CIEL = new Set(["03_01_CIEL03_1", "03_01_CIEL03_2_1", "03_01_CIEL03_2_3"]);

export const PROLOGUE = "Prologue";
export const COMMON = "Common Route";
export const ARCUEID = "Arcueid Route";
export const CIEL = "Ciel Route";
export { SENSEI };

export function readPlaytime(storage = globalThis.localStorage) {
  try {
    const value = Number(storage?.getItem(STORE));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

// The route a script belongs to. `split` is the index of 03_00_ARC03_5B in the script list (the story's common route
// runs through it); -1 when the list is not known yet, where the day stands in for it.
export function routeOf(name, index = 0, split = -1) {
  if (!name) return null;
  if (/^QA/i.test(name)) return SENSEI;
  if (/^00_/.test(name)) return PROLOGUE;
  if (split >= 0) {
    if (index <= split) return COMMON;
  } else {
    const day = dayOf(name);
    if (day === null || day <= 3) return COMMON;
  }
  if (PRE_SPLIT_CIEL.has(name)) return COMMON;
  if (name.includes("CIEL")) return CIEL;
  if (name.includes("ARC")) return ARCUEID;
  return COMMON;
}

export function dayOf(name) {
  const match = /^(\d\d)_/.exec(name || "");
  return match ? Number(match[1]) : null;
}

// The activity the app sends. The timer's start is now minus the play time: Discord then shows the whole time, live.
export function activityFor(name, index, split, playtimeMs, nowMs) {
  const details = routeOf(name, index, split);
  if (!details) return null;
  const day = dayOf(name);
  const assets = { large_image: "tsukihime", large_text: "Tsukihime" };
  if (details === ARCUEID) Object.assign(assets, { small_image: "route_arc", small_text: ARCUEID });
  else if (details === CIEL) Object.assign(assets, { small_image: "route_ciel", small_text: CIEL });
  const activity = { details, start: Math.max(1, Math.floor((nowMs - playtimeMs) / 1000)), assets };
  if (details !== PROLOGUE && details !== SENSEI && day !== null) activity.state = `Day ${day}`;
  return activity;
}

// What makes two activities the same on the profile: the route, day and picture. The timer is left out (the app sends
// only a changed one, and the app in turn keeps the start it already sent for the same words).
export function activitySignature(activity) {
  if (!activity) return null;
  return JSON.stringify([activity.details, activity.state ?? null, activity.assets?.small_image ?? null]);
}

// The page's side. send(activity, force) is the desktop app's `presence` command; the returned promise may be ignored.
export function createPresence({
  vm, send = (activity, force) => (HOST ? HOST.call("presence", { activity, force }) : Promise.resolve()),
  now = Date.now, storage = globalThis.localStorage, hidden = () => !!globalThis.document?.hidden, flushMs = FLUSH_MS,
} = {}) {
  let enabled = false;
  let playtimeMs = readPlaytime(storage);
  let storedMs = playtimeMs;
  let lastTick = null;
  let lastFlush = now();
  let lastSignature = null;

  const flush = () => {
    const value = Math.max(0, Math.floor(playtimeMs));
    if (value === storedMs) return;
    try { storage?.setItem(STORE, String(value)); storedMs = value; } catch { /* no room: the timer goes on from memory */ }
  };

  const tell = (activity, force = false) => {
    try { send(activity, force)?.catch?.(() => {}); } catch { /* the app is gone: nothing to do */ }
  };

  const clear = ({ force = false } = {}) => {
    if (lastSignature === null && !force) return;
    lastSignature = null;
    tell(null, force);
  };

  const splitIndex = () => {
    const names = vm?.index?.names;
    return Array.isArray(names) ? names.indexOf(SPLIT) : -1;
  };

  const refresh = ({ force = false } = {}) => {
    if (!enabled || hidden() || !vm?.running || vm.replay) { clear(); return; }
    const name = vm.script?.name;
    if (!name) { clear(); return; }
    const activity = activityFor(name, vm.scriptIndex, splitIndex(), playtimeMs, now());
    const signature = activitySignature(activity);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    tell(activity);
  };

  const tick = () => {
    const t = now();
    const visible = !hidden();
    const story = !!vm?.running && !vm.replay;
    // A stall (or the computer waking) is not play: count at most a second of one step.
    if (story && visible && lastTick !== null) playtimeMs += Math.min(Math.max(0, t - lastTick), 1000);
    lastTick = visible ? t : null;
    if (t - lastFlush >= flushMs) { flush(); lastFlush = t; }
    if (!enabled) { clear(); return; }
    if (!story || !visible) { clear(); return; }
    refresh();
  };

  const setEnabled = (on) => {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    if (!on) { flush(); clear({ force: true }); return; }
    lastTick = now();
    refresh({ force: true });
  };

  // The page went out of sight (a hidden window or tab): save the time and take the activity down. Back in sight, the
  // story (if it still runs) goes up again with the time played so far, not the time that passed unseen.
  const visibility = (isHidden) => {
    if (isHidden) { flush(); lastTick = null; clear(); return; }
    lastTick = null;
    refresh();
  };

  const suspend = () => { flush(); clear({ force: true }); };

  return {
    tick, setEnabled, visibility, suspend, flush,
    clear: (options) => { clear(options); flush(); },
    refresh,
    get playtimeMs() { return playtimeMs; },
    get enabled() { return enabled; },
  };
}
