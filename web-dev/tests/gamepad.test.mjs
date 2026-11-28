// Controller support (web/app/js/gamepad.js and its hooks in main.js, ui.js, gallery.js, flowchart.js, touch.css,
// words.js, sitewords-ru.js, and Android MainActivity.java).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  GamepadDriver, PadConfig,
  detectPadStyle, isLikelyGamepad, leftStickScrollY, padControlsList, padHints, readPad, readSticks, resetPadBaselines,
} = await import("../../web/app/js/gamepad.js");

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function makePad({ index = 0, id = "Xbox Wireless Controller", mapping = "standard", buttons = {}, axes = [0, 0, 0, 0], count = 16 } = {}) {
  const btns = Array.from({ length: count }, (_, i) => {
    const v = buttons[i];
    if (typeof v === "number") return { pressed: v > 0.9, value: v };
    return { pressed: !!v, value: v ? 1 : 0 };
  });
  return { index, id, mapping, connected: true, buttons: btns, axes };
}

test("detectPadStyle recognizes Nintendo, PlayStation, and defaults to Xbox", () => {
  assert.equal(detectPadStyle("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"), "nintendo");
  assert.equal(detectPadStyle("Nintendo Switch Joy-Con (L+R)"), "nintendo");
  assert.equal(detectPadStyle("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"), "playstation");
  assert.equal(detectPadStyle("Sony Wireless Controller"), "playstation");
  assert.equal(detectPadStyle("Xbox Wireless Controller (STANDARD GAMEPAD)"), "xbox");
  assert.equal(detectPadStyle("Valve Steam Deck"), "xbox");
});

test("PadConfig defaults to Nintendo East-confirm and Xbox/PS South-confirm, keeps Button prompts independent of Confirm/Cancel, and persists", () => {
  const store = fakeStorage();
  const cfg = new PadConfig(store);
  assert.equal(cfg.confirmEast("nintendo"), true);
  assert.equal(cfg.confirmEast("xbox"), false);
  assert.equal(cfg.confirmEast("playstation"), false);
  assert.equal(cfg.labels("xbox").confirm, "A");
  assert.equal(cfg.labels("xbox").cancel, "B");
  assert.equal(cfg.labels("playstation").confirm, "\u2715");
  assert.equal(cfg.labels("playstation").cancel, "\u25cb");
  assert.equal(cfg.labels("nintendo").confirm, "A");
  assert.equal(cfg.labels("nintendo").cancel, "B");

  // Changing Button prompts style to Nintendo must NOT swap confirm/cancel on an Xbox controller when layout is Auto
  assert.equal(cfg.cycleStyle(), "xbox");
  assert.equal(cfg.cycleStyle(), "playstation");
  assert.equal(cfg.cycleStyle(), "nintendo");
  assert.equal(cfg.layout, "auto");
  assert.equal(cfg.confirmEast("xbox"), false, "style override does not swap physical confirm/cancel");
  assert.equal(cfg.labels("xbox").confirm, "B", "south face label in Nintendo glyphs");
  assert.equal(cfg.labels("xbox").cancel, "A", "east face label in Nintendo glyphs");

  assert.equal(cfg.cycleLayout(), "south");
  assert.equal(cfg.confirmEast("nintendo"), false);
  assert.equal(cfg.cycleLayout(), "east");
  assert.equal(cfg.confirmEast("xbox"), true);
  assert.equal(cfg.labels("xbox").confirm, "A");
  assert.equal(cfg.labels("xbox").cancel, "B");

  const reloaded = new PadConfig(store);
  assert.equal(reloaded.layout, "east");
  assert.equal(reloaded.style, "nintendo");

  reloaded.reset();
  assert.equal(reloaded.layout, "auto");
  assert.equal(reloaded.style, "auto");
});

test("non-standard odd devices (wheels, flight sticks, resting -1 axes) never drive the game, while calibrated non-standard pads work", () => {
  resetPadBaselines();
  // Steering wheels, flight sticks, 3D mice, and <4-button HIDs without standard mapping are ignored
  assert.equal(isLikelyGamepad(makePad({ mapping: "", id: "Logitech G29 Driving Force Racing Wheel", axes: [-1, -1, 0, 0] })), false);
  assert.equal(isLikelyGamepad(makePad({ mapping: "", id: "Thrustmaster T.16000M Flight Stick", axes: [-1, 1, 0, 0] })), false);
  assert.equal(isLikelyGamepad(makePad({ mapping: "", id: "3Dconnexion SpaceMouse", count: 2 })), false);
  assert.equal(readPad(makePad({ mapping: "", id: "Logitech G29 Racing Wheel", buttons: { 0: true }, axes: [-1, -1, 0, 0] })), null);

  // Unknown generic non-standard device whose axes rest at -1 / +1 must produce zero stick, trigger, or hat input,
  // even after a trigger on axes[2] or an unnamed throttle on axes[1] is swept through 0 and parked/released!
  const oddRest = makePad({ index: 2, mapping: "", id: "Generic USB HID", count: 6, axes: [-1, -1, -1, 0, 1, 1, -1, -1, 0, -1] });
  const oddReading = readPad(oddRest, { confirmEast: false });
  assert.ok(oddReading);
  assert.equal(oddReading.pressed.size, 0, "resting -1/+1 hat and trigger axes do not fire");
  assert.deepEqual(oddReading.ls, { x: 0, y: 0 });
  assert.deepEqual(oddReading.rs, { x: 0, y: 0 });
  assert.equal(leftStickScrollY([oddRest]), 0);
  assert.deepEqual(readSticks([oddRest]), { lx: 0, ly: 0, rx: 0, ry: 0 });

  // Sweep throttle (axes[1]) and trigger (axes[2]) through centre (0), then park throttle at +0.8 and release trigger back to -1
  const oddMid = makePad({ index: 2, mapping: "", id: "Generic USB HID", count: 6, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.2857] });
  readPad(oddMid, { confirmEast: false });
  const oddParked = makePad({ index: 2, mapping: "", id: "Generic USB HID", count: 6, axes: [0, 0.8, -1, 0.9, 1, 1, -1, 0, 0, -1] });
  const parkedR = readPad(oddParked, { confirmEast: false });
  assert.equal(parkedR.pressed.size, 0, "sweeping uncentered hat/axes through neutral never promotes them");
  assert.deepEqual(parkedR.ls, { x: 0, y: 0 }, "unnamed throttle parked after sweeping centre stays ignored");
  assert.deepEqual(parkedR.rs, { x: 0, y: 0 }, "non-standard pad never reads right stick from axes[2..3]");
  assert.equal(leftStickScrollY([oddParked]), 0);
  assert.deepEqual(readSticks([oddParked]), { lx: 0, ly: 0, rx: 0, ry: 0 });

  // Non-standard pad trigger on axes[2] squeezed through 0 and released back to -1 must NOT drive menu Left presses
  let triggerPads = [makePad({ index: 4, mapping: "", id: "Generic USB Pad", axes: [0, 0, -1, 0] })];
  const trigDriver = new GamepadDriver({ config: new PadConfig(fakeStorage()), getPads: () => triggerPads });
  const trigKeys = [];
  const trigCtx = {
    menus: true, panelOpen: false, choosing: false, binding: false, screen: "titlemenu",
    leftStickScrolls: false, analogViewer: false, voiceKey: "V",
    keyDown: (spec) => trigKeys.push(spec.key), keyUp: () => {}, runAction: () => {},
    cancelStory: () => {}, fastForward: () => {}, wakeAudio: () => {},
  };
  trigDriver.poll(100, trigCtx);
  triggerPads = [makePad({ index: 4, mapping: "", id: "Generic USB Pad", axes: [0, 0, 0, 0] })];
  trigDriver.poll(120, trigCtx);
  triggerPads = [makePad({ index: 4, mapping: "", id: "Generic USB Pad", axes: [0, 0, 1, 0] })];
  trigDriver.poll(140, trigCtx);
  triggerPads = [makePad({ index: 4, mapping: "", id: "Generic USB Pad", axes: [0, 0, -1, 0] })];
  trigDriver.poll(160, trigCtx);
  trigDriver.poll(500, trigCtx);
  assert.deepEqual(trigKeys, [], "trigger on axes[2] never becomes right-stick Left");

  // A real non-standard gamepad seen neutral at rest calibrates cleanly and responds on left stick, D-pad, and triggers (no right stick)
  const odinIdle = makePad({ index: 3, mapping: "", id: "Odin Controller", count: 6, axes: [0, 0, 0, 0, -1, -1, 0, 0, 0, 3.2857] });
  const idleR = readPad(odinIdle, { confirmEast: false });
  assert.equal(idleR.pressed.size, 0);

  const odinActive = makePad({ index: 3, mapping: "", id: "Odin Controller", count: 6, axes: [0.5, -0.5, 0, 0.75, 0.6, -1, -1, 0, 0, -1] });
  const activeR = readPad(odinActive, { confirmEast: false });
  assert.ok(activeR.pressed.has("up"), "calibrated hat switch fires up");
  assert.ok(activeR.pressed.has("left"), "calibrated axis D-pad fires left");
  assert.ok(activeR.pressed.has("lt"), "calibrated trigger axis fires LT");
  assert.ok(!activeR.pressed.has("rt"));
  assert.equal(leftStickScrollY([odinActive]), 64);
  assert.deepEqual(readSticks([odinActive]), { lx: 0.5, ly: -0.5, rx: 0, ry: 0 });
  resetPadBaselines();
});

test("readPad handles standard pads and analog triggers", () => {
  const xbox = readPad(makePad({ buttons: { 0: true, 7: 0.75, 8: true, 10: true }, axes: [0.1, -0.8, 0.9, 0] }), { confirmEast: false });
  assert.ok(xbox.pressed.has("confirm"));
  assert.ok(xbox.pressed.has("rt"));
  assert.ok(xbox.pressed.has("back"));
  assert.ok(xbox.pressed.has("l3"));
  assert.equal(xbox.ls.x, 0, "inside dead zone");
  assert.equal(xbox.ls.y, -0.8);
  assert.equal(xbox.rs.x, 0.9);

  const nintendo = readPad(makePad({ id: "Nintendo Switch Pro Controller", buttons: { 0: true, 1: false } }), { confirmEast: true });
  assert.ok(nintendo.pressed.has("cancel"));
  assert.ok(!nintendo.pressed.has("confirm"));
});

test("GamepadDriver dispatches matching keydown/keyup, prevents blur double-fire, and protects keyboard rebinding", () => {
  let pads = [];
  const driver = new GamepadDriver({ config: new PadConfig(fakeStorage()), getPads: () => pads });
  const events = [];
  const baseCtx = {
    menus: true,
    panelOpen: false,
    choosing: false,
    binding: false,
    screen: "config",
    leftStickScrolls: true,
    analogViewer: false,
    voiceKey: "V",
    keyDown: (spec, repeat) => events.push(["down", spec.key, !!spec.shiftKey, !!repeat]),
    keyUp: (spec) => events.push(["up", spec.key, !!spec.shiftKey]),
    runAction: () => {},
    cancelStory: () => {},
    fastForward: () => {},
    wakeAudio: () => {},
  };

  // Hold confirm then release -> Enter keydown then Enter keyup (Config slider never sticks)
  pads = [makePad({ buttons: { 0: true } })];
  driver.poll(100, baseCtx);
  pads = [makePad({})];
  driver.poll(150, baseCtx);
  assert.deepEqual(events, [["down", "Enter", false, false], ["up", "Enter", false]]);

  // Hold D-pad Up in CG viewer then release -> ArrowUp keydown then ArrowUp keyup
  events.length = 0;
  const viewerCtx = { ...baseCtx, screen: "gallery", leftStickScrolls: false, analogViewer: true };
  pads = [makePad({ buttons: { 12: true } })];
  driver.poll(200, viewerCtx);
  pads = [makePad({})];
  driver.poll(250, viewerCtx);
  assert.deepEqual(events, [["down", "ArrowUp", false, false], ["up", "ArrowUp", false]]);

  // Window blur while holding Confirm releases cleanly and does NOT fire a second press while still held
  events.length = 0;
  pads = [makePad({ buttons: { 0: true } })];
  driver.poll(300, baseCtx);
  driver.releaseAll(baseCtx);
  driver.poll(320, baseCtx); // still physically held after blur -> must NOT re-fire
  assert.deepEqual(events, [["down", "Enter", false, false], ["up", "Enter", false]]);
  pads = [makePad({})];
  driver.poll(340, baseCtx); // physically released -> clears suppression
  pads = [makePad({ buttons: { 0: true } })];
  driver.poll(360, baseCtx); // fresh press now fires again
  assert.deepEqual(events, [["down", "Enter", false, false], ["up", "Enter", false], ["down", "Enter", false, false]]);
  pads = [makePad({})];
  driver.poll(380, baseCtx);

  // While waiting for a keyboard key bind on Config -> Controls, pad buttons/sticks cannot bind keys; Cancel sends Escape
  events.length = 0;
  const bindCtx = { ...baseCtx, binding: true };
  pads = [makePad({ buttons: { 0: true, 4: true, 6: true, 12: true }, axes: [0, 0, 0, 0.9] })];
  driver.poll(400, bindCtx);
  assert.deepEqual(events, [], "sticks and buttons ignored while binding a keyboard key");
  pads = [makePad({ buttons: { 1: true } })];
  driver.poll(420, bindCtx);
  assert.deepEqual(events, [["down", "Escape", false, false]], "Cancel still backs out of key binding");
});

test("GamepadDriver isolates Quick Bar / Choices overlays from PageUp (LT), ignores horizontal stick in Backlog, and routes sticks per screen", () => {
  let pads = [];
  const driver = new GamepadDriver({ config: new PadConfig(fakeStorage()), getPads: () => pads });
  const actions = [], keys = [], ff = [];
  let cancels = 0;

  const makeCtx = (extra = {}) => ({
    menus: false,
    panelOpen: false,
    choosing: false,
    binding: false,
    screen: null,
    leftStickScrolls: false,
    analogViewer: false,
    voiceKey: "V",
    keyDown: (spec, repeat) => keys.push(["down", spec.key, !!spec.shiftKey, !!repeat]),
    keyUp: (spec) => keys.push(["up", spec.key, !!spec.shiftKey]),
    runAction: (a, o) => actions.push([a, !!o?.repeat]),
    cancelStory: () => cancels++,
    fastForward: (on) => ff.push(on),
    wakeAudio: () => {},
    ...extra,
  });

  // Story screen: Select/View hides text, L3 replays voice, RT holds fast-forward, B cancels
  pads = [makePad({ buttons: { 8: true, 10: true, 7: true, 1: true } })];
  driver.poll(100, makeCtx());
  assert.deepEqual(actions, [["hide", false], ["voice", false]]);
  assert.deepEqual(ff, [true]);
  assert.equal(cancels, 1);

  pads = [makePad({})];
  driver.poll(120, makeCtx());
  assert.deepEqual(ff, [true, false]);

  // Quick bar open in keyboard mode: LT / RT / LB / RB / North must NOT dispatch PageUp (which would open Log)
  keys.length = 0;
  pads = [makePad({ buttons: { 4: true, 5: true, 6: true, 7: true, 3: true } })];
  driver.poll(200, makeCtx({ menus: true, panelOpen: true, screen: null }));
  assert.deepEqual(keys, []);
  pads = [makePad({ buttons: { 0: true, 15: true } })];
  driver.poll(220, makeCtx({ menus: true, panelOpen: true, screen: null }));
  assert.deepEqual(keys, [["down", "Enter", false, false], ["down", "ArrowRight", false, false]]);

  // Choices overlay: LT must NOT dispatch PageUp either
  keys.length = 0;
  pads = [makePad({})];
  driver.poll(240, makeCtx({ menus: true, choosing: true, screen: null }));
  keys.length = 0;
  pads = [makePad({ buttons: { 6: true } })];
  driver.poll(260, makeCtx({ menus: true, choosing: true, screen: null }));
  assert.deepEqual(keys, []);

  // Backlog ("log"): diagonal left stick only emits vertical ArrowUp/ArrowDown, never horizontal ArrowLeft/ArrowRight
  keys.length = 0;
  pads = [makePad({ axes: [-0.9, -0.9, 0.9, 0] })];
  driver.poll(300, makeCtx({ menus: true, screen: "log" }));
  assert.deepEqual(keys, [["down", "ArrowUp", false, false]]);
  // D-pad Left still works intentionally in Backlog (stick Up releases cleanly first)
  keys.length = 0;
  pads = [makePad({ buttons: { 14: true } })];
  driver.poll(320, makeCtx({ menus: true, screen: "log" }));
  assert.deepEqual(keys, [["up", "ArrowUp", false], ["down", "ArrowLeft", false, false]]);

  // Flowchart: LB/RB zoom out/in, Back resets zoom ("0")
  keys.length = 0;
  pads = [makePad({})];
  driver.poll(340, makeCtx({ menus: true, screen: "flowchart", leftStickScrolls: true }));
  keys.length = 0;
  pads = [makePad({ buttons: { 4: true, 5: true, 8: true } })];
  driver.poll(360, makeCtx({ menus: true, screen: "flowchart", leftStickScrolls: true }));
  assert.deepEqual(keys, [["down", "-", false, false], ["down", "+", false, false], ["down", "0", false, false]]);

  // CG viewer (analogViewer): sticks don't fire Arrow keys; North resets via Home
  keys.length = 0;
  pads = [makePad({})];
  driver.poll(380, makeCtx({ menus: true, screen: "gallery", analogViewer: true }));
  keys.length = 0;
  pads = [makePad({ buttons: { 3: true }, axes: [0.9, 0.9, 0.9, 0.9] })];
  driver.poll(400, makeCtx({ menus: true, screen: "gallery", analogViewer: true }));
  assert.deepEqual(keys, [["down", "Home", false, false]]);
});

test("padHints match each screen (including Flowchart and Config) and padControlsList matches active style", () => {
  const cfg = new PadConfig(fakeStorage());
  const xbox = cfg.labels("xbox");
  const flowHints = padHints(xbox, "flowchart");
  assert.deepEqual(flowHints.Move, ["D-Pad", "R-Stick"]);
  assert.deepEqual(flowHints.Zoom, ["LB / RB"]);
  assert.deepEqual(flowHints.Reset, ["View"]);

  const cfgHints = padHints(xbox, "config");
  assert.deepEqual(cfgHints.Move, ["D-Pad", "R-Stick"]);

  const psHints = padHints(cfg.labels("playstation"), "gallery");
  assert.deepEqual(psHints.Choose, ["\u2715"]);
  assert.deepEqual(psHints.Back, ["\u25cb"]);
  assert.deepEqual(psHints.Reset, ["\u25b3"]);

  const nRows = padControlsList(cfg.labels("nintendo"));
  assert.ok(nRows.some(([label, what]) => label === "Hide text" && what === "-"));
  assert.ok(nRows.some(([label, what]) => label === "Replay voice" && what === "L-Click"));
});

test("web, touch, Chinese & Russian Controls labels, and Android wrapper wire controller support cleanly", async () => {
  const main = read("web/app/js/main.js");
  const gallery = read("web/app/js/gallery.js");
  const android = read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java");
  const touchCss = read("web/app/touch.css");
  const { CONTROLS_ZH } = await import("../../web/app/js/words.js");
  const { SITE_RU } = await import("../../web/app/js/sitewords-ru.js");

  assert.match(main, /new GamepadDriver\(/);
  assert.match(main, /new KeyboardEvent\("keyup"/);
  assert.match(main, /panelKeyMode = !ui\.open && ui\.panelOpen && !!ui\.panel\.keyboard/);
  assert.match(main, /binding: !!ui\.binding/);
  assert.match(main, /gamepaddisconnected/);
  assert.match(main, /e\.isTrusted/);
  assert.match(gallery, /readSticks\(/);
  assert.match(gallery, /ui\.analogViewer = true/);
  assert.match(android, /dispatchKeyEvent\(KeyEvent event\)/);
  assert.match(android, /dispatchGenericMotionEvent\(MotionEvent event\)/);
  // a pad button the page left unhandled does not become its fallback key (B's is Back), seen on the emulator 2026-11-23
  assert.match(android, /public void onUnhandledKeyEvent\(WebView v, KeyEvent event\) \{\n\s+if \(KeyEvent\.isGamepadButton\(event\.getKeyCode\(\)\)\) return;/);
  assert.match(android, /setDefaultFocusHighlightEnabled\(false\)/);
  assert.match(android, /web\.requestFocus\(\)/);
  assert.match(android, /KEYCODE_BACK/);
  assert.match(android, /KEYCODE_VOLUME_UP/);
  assert.match(android, /KeyEvent\.isGamepadButton\(code\) \|\| \(padSource && dpadKey\)/);
  assert.match(touchCss, /html\.touch\[data-input="pad"\] \.helpbar/);
  assert.match(touchCss, /html\.touch #stage :focus \{ outline: none; \}/);

  for (const w of ["Controller", "Confirm / Cancel", "Button prompts", "Auto", "South (A / \u2715)", "East (A / \u25cb)",
    "Desktop", "Discord Rich Presence", "On", "Off"]) {
    assert.ok(CONTROLS_ZH[w] && /[\u4e00-\u9fff]/.test(CONTROLS_ZH[w]), `Chinese label for ${w}`);
    assert.ok(SITE_RU[w] && /[\u0400-\u04ff]/.test(SITE_RU[w]), `Russian label for ${w}`);
  }
});
