// The flowchart's zoom (the port's own: the game's flowchart has one size, its input 0x11418 reads no zoom). At the game's
// size everything is as it was; zoomed, the chart is drawn larger and the view kept inside it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const fcm = await import("../../web/app/js/flowchart-model.js");
const fcPage = await import("../../web/app/js/flowchart.js");
const { EASE } = await import("../../web/app/js/uifx.js");
const { FlowProgress, FLOW_VIEW, FLOW_ZOOM, clampZoom, zoomScrollMax, panMax, viewHeight, viewWidth, zoomView, zoomStep, wheelZoom, panFor, scrollFor, reselect, DragFlick, layoutChart } = fcm;

const chartUrl = new URL("../../web/assets/flowchart.json", import.meta.url);
const realChart = existsSync(chartUrl) ? JSON.parse(readFileSync(chartUrl, "utf8")) : null;
const memoryStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const near = (a, b, msg = "", e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${msg} ${a} vs ${b}`);
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const progress = ({ completed = [], lines = [], path = [] } = {}) => {
  const f = new FlowProgress(memoryStore());
  f.migrated = true;
  for (const n of completed) { f.completed.add(n); f.started.add(n); }
  for (const n of lines) f.secondary.add(n);
  for (const n of path) f.path.add(n);
  return f;
};
// the reference save's progress (as function-map.test.mjs F5-F9): every scene but a few completed, lines 565-1194 revealed
const savedFlow = () => progress({ completed: [...R(1, 495), ...R(498, 530), ...R(533, 557)], lines: R(565, 1194) });

// ---- the model -------------------------------------------------------------------------------------------------------
test("zoom: 1 is the game's size and the floor, 3 the ceiling; the keys' steps; the wheel at most 25 of its pixels an event", () => {
  assert.deepEqual([clampZoom(0.5), clampZoom(1), clampZoom(1.004), clampZoom(1.25), clampZoom(9), clampZoom(NaN)], [1, 1, 1, 1.25, 3, 1]);
  assert.deepEqual(FLOW_ZOOM.steps, [1, 1.25, 1.5, 2, 2.5, 3]);
  const up = [1]; for (let i = 0; i < 6; i++) up.push(zoomStep(up.at(-1), 1));
  assert.deepEqual(up, [1, 1.25, 1.5, 2, 2.5, 3, 3]);
  const down = [3]; for (let i = 0; i < 6; i++) down.push(zoomStep(down.at(-1), -1));
  assert.deepEqual(down, [3, 2.5, 2, 1.5, 1.25, 1, 1]);
  assert.deepEqual([zoomStep(1.7, 1), zoomStep(1.7, -1), zoomStep(2.7, 0)], [2, 1.5, 1], "from between steps, the next one either way; 0 the game's size");
  // a touchpad's pinch (small deltas): e ^ -(0.01 d) each; a mouse's turn with Ctrl (100) counts as 25
  near(wheelZoom(1, -10), Math.exp(0.1));
  near(wheelZoom(2, 10), 2 * Math.exp(-0.1));
  near(wheelZoom(1, -100), Math.exp(0.25));
  assert.equal(wheelZoom(1, 100), 1, "not under the game's size");
  assert.equal(wheelZoom(2.9, -100), 3);
});

test("zoom: the view stays inside the chart; the point under the pointer stays put; back at 1 there is no pan and a whole scroll", () => {
  const L = { scrollMax: 5000 };
  assert.equal(zoomScrollMax(L, 1), 5000, "at the game's size the scroll bar's end, as ever");
  assert.equal(zoomScrollMax({ scrollMax: -300 }, 1), 0);
  assert.equal(zoomScrollMax(L, 2), 5000 + 511);
  assert.equal(zoomScrollMax({ scrollMax: -300 }, 2), 511, "a chart that does not scroll does zoomed");
  // zoomed the view is the stage's width (the user: "it should expand all the way, not cut off like that on right"); the
  // scroll across reaches as far as puts the chart's right edge where it is at the game's size, growing from 0 at z 1
  assert.deepEqual([viewWidth(1), viewWidth(1.25), viewWidth(3)], [1440, 1920, 1920]);
  assert.deepEqual([panMax(1), panMax(2), panMax(3)], [0, 720, 960]);
  // ... and on a touch device, which draws no hint bar, down to the stage's bottom at any zoom (the user: "on phones helper
  // bar isnt drawn so push it all the down", "not just zoomed unzoomed too"); with a mouse above the bar, as ever
  assert.deepEqual([viewHeight(1), viewHeight(2), viewHeight(1, true), viewHeight(1.25, true), viewHeight(3, true)], [1022, 1022, 1080, 1080, 1080]);
  assert.equal(zoomScrollMax(L, 1, true), 5000 + 1022 - 1080, "the chart's end 58 higher in the taller view, as far from its bottom");
  assert.equal(zoomScrollMax(L, 2, true), 5000 + 1022 - 540);
  assert.equal(zoomScrollMax({ scrollMax: -300 }, 1.02, true), 0, "a short chart: not under 0");
  near(zoomView(L, { z: 2, x: 0, s: 0 }, 2, [0, 0], [0, -1e6], true).s, 5000 + 1022 - 540, "held at the touch view's end");
  near(panMax(1.01), 1440 - 1440 / 1.01);
  // about (680, 500) of the view at scroll 1000: chart (680, 1500) stays there
  const v = zoomView(L, { z: 1, x: 0, s: 1000 }, 2, [680, 500]);
  assert.equal(v.z, 2);
  near(v.x + 680 / 2, 680); near(v.s + 500 / 2, 1500);
  // a pinch: the chart's point between the fingers follows them
  const p = zoomView(L, { z: 2, x: 100, s: 2000 }, 2.5, [400, 300], [500, 350]);
  near(p.x + 500 / 2.5, 100 + 400 / 2); near(p.s + 350 / 2.5, 2000 + 300 / 2);
  // at the edges it is held inside
  const tl = zoomView(L, { z: 1, x: 0, s: 0 }, 3, [0, 0], [1440, 1022]);
  assert.deepEqual([tl.x, tl.s], [0, 0]);
  const br = zoomView(L, { z: 3, x: 960, s: zoomScrollMax(L, 3) }, 3, [0, 0], [-5000, -5000]);
  assert.deepEqual([br.x, br.s], [panMax(3), zoomScrollMax(L, 3)]);
  // back to 1 from anywhere: the game's view (no pan; the scroll a whole number within the scroll bar's)
  const back = zoomView(L, { z: 2.5, x: 333.3, s: 5400.4 }, 1, [700, 700]);
  assert.deepEqual(back, { z: 1, x: 0, s: 4980 }, "chart y 5680.4 stays at 700: 4980.4, made whole");
  assert.deepEqual(zoomView(L, { z: 2.5, x: 333.3, s: 5600 }, 1, [700, 100]), { z: 1, x: 0, s: 5000 }, "held at the scroll bar's end");
  const mid = zoomView(L, { z: 2, x: 200, s: 1000.3 }, 1.001, [0, 0]);
  assert.deepEqual(mid, { z: 1, x: 0, s: 1000 });
});

// The functions as they were before the zoom, to show that at z 1 nothing changed.
function scrollForBefore(L, at, scroll) {
  const p = L.part(at.row, at.col);
  if (!p) return null;
  const y = p.y - scroll, last = L.rows.length - 1;
  let to;
  if (y < 2) to = L.part(Math.max(0, at.row - 1), 0)?.y ?? p.y;
  else if (y > 966) to = L.rows[Math.min(last, at.row + 1)].parts[0].y;
  else return null;
  const value = y < 2 ? to - 4 : to - 966;
  return Math.max(0, Math.min(Math.max(0, L.scrollMax), value));
}
function reselectBefore(L, at, scroll) {
  const last = L.rows.length - 1;
  let r = at.row, c = at.col;
  const look = (rr) => { let k = fcm.nearestColumn(L, rr, c, 0); if (k < 0) k = fcm.nearestColumn(L, rr, c, 1); return k; };
  if (r < last) for (;;) { const k = look(r); if (k >= 0) { c = k; if (L.part(r, k).y - scroll >= 4) break; } if (++r >= last) break; }
  if (r > 0) for (;;) { const k = look(r); if (k >= 0) { c = k; if (L.part(r, k).y - scroll < 994) break; } if (--r < 1) break; }
  return r === at.row ? null : { row: r, col: c };
}
class DragFlickBefore {
  constructor() { this.v = 0; this.last = null; }
  step(y, scroll) {
    if (Math.abs(this.v) > 1.1920929e-7) { this.v = Math.fround(this.v * Math.fround(0.9)); if (Math.abs(this.v) < 0.5) this.v = 0; }
    if (y === null) this.last = null;
    else {
      if (this.last !== null) { const dy = y - this.last; if (dy >= 1 && this.v > -dy) this.v = -dy; else if (dy < 0 && this.v < -dy) this.v = -dy; }
      this.last = y;
    }
    const d = Math.fround(this.v * 6);
    return Math.abs(d) > 1.1920929e-7 ? Math.trunc(d + scroll) : null;
  }
}

test("zoom: at the game's size the selection's scroll, the re-selection and the drag are exactly what they were", { skip: !realChart }, () => {
  for (const game of [false, true]) {
    const flow = savedFlow();
    if (game) for (const n of R(1, 300)) flow.path.add(n);
    const L = layoutChart(realChart, flow, { game });
    const scrolls = [0, 1, 3.5, 500, 966, 4000, 9999.75, L.scrollMax - 1, L.scrollMax];
    let n = 0;
    for (const p of L.nodes) for (const s of scrolls) {
      const at = { row: p.row, col: p.col };
      assert.equal(scrollFor(L, at, s), scrollForBefore(L, at, s));
      assert.equal(scrollFor(L, at, s, 1), scrollForBefore(L, at, s));
      assert.deepEqual(reselect(L, at, s), reselectBefore(L, at, s));
      assert.deepEqual(reselect(L, at, s, 1, 0), reselectBefore(L, at, s));
      assert.equal(panFor(L, at, 0, 1), null, "nothing moves across");
      n++;
    }
    assert.ok(n > 1000, `${n}`);
  }
  // the drag's flick, frame by frame through a drag and its coast
  const a = new DragFlick(), b = new DragFlickBefore();
  const ys = [400, 390, 371, 340, 341, 300, 300, 290, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  let scroll = 1200;
  for (const y of ys) { const u = a.step(y, scroll), w = b.step(y, scroll); assert.equal(u, w); if (u !== null) scroll = u; }
});

test("zoom: zoomed, the keys' selection is brought into view down and across, and a scroll re-selects a node in view both ways", { skip: !realChart }, () => {
  const L = layoutChart(realChart, savedFlow());
  const z = 2, h = FLOW_VIEW.h / z;   // 511 of the chart in view
  const p = L.nodes.find((q) => q.row === 20);
  // on a touch device the view is 1080 high zoomed: 540 of the chart at 2
  assert.equal(scrollFor(L, p, p.y - (540 - 56) - 10, z, true), L.rows[21].parts[0].y - (540 - 56));
  assert.equal(scrollFor(L, p, p.y - (h - 56) - 10, z, true), null, "in view there");
  // down: a node past 511 - 56 brings the row below to there; within it nothing moves
  assert.equal(scrollFor(L, p, p.y - 300, z), null);
  assert.equal(scrollFor(L, p, p.y - (h - 56) - 10, z), L.rows[21].parts[0].y - (h - 56));
  assert.equal(scrollFor(L, p, p.y + 10, z), L.rows[19].parts[0].y - 4, "above 2 as ever");
  // across: one right of the open part's (1360 / 2 = 680) edge less 8 comes to there; one left of 8 to 8
  const right = L.nodes.find((q) => q.x >= 1100);
  assert.equal(panFor(L, right, 0, z), right.x + 104 - 680 + 8);
  const left = L.nodes.find((q) => q.x === 438);
  assert.equal(panFor(L, left, 600, z), 438 - 8);
  assert.equal(panFor(L, left, 400, z), null, "in view");
  assert.equal(panFor(L, right, 0, 3), Math.min(panMax(3), right.x + 104 - 1360 / 3 + 8));
  const last = L.nodes.reduce((a, b) => (b.x > a.x ? b : a));
  for (const z of [1.25, 1.5, 2, 2.5, 3]) {
    const x = panFor(L, last, 0, z);
    assert.ok((last.x + 104 - x) * z <= 1360 - 8 * z + 1e-9, `the last column clears the preview at ${z}`);
  }
  // a scroll down re-selects within the zoomed view's height, and a node in view across
  const at = { row: 0, col: 0 }, s = 3000, x = 500;
  const r = reselect(L, at, s, z, x);
  const q = L.part(r.row, r.col), y = q.y - s;
  assert.ok(y >= 4 && y < h - 28, `row ${r.row} at ${y}`);
  if (L.rows[r.row].parts.some((pp, k) => pp.reg && pp.x >= x && pp.x + 104 <= x + 680 && k >= 0)) assert.ok(q.x >= x && q.x + 104 <= x + 680, `column ${r.col} at ${q.x}`);
  // a move across alone re-selects too, zoomed: a node out of view across gives way to one of its row in view
  const row = L.rows.findIndex((rr) => rr.parts.filter((pp) => pp.reg).length >= 3);
  const cols = L.rows[row].parts.map((pp, k) => (pp.reg ? k : -1)).filter((k) => k >= 0);
  const sel = { row, col: cols[0] }, far = L.part(row, cols.at(-1)).x - 100;
  const re = reselect(L, sel, L.part(row, 0).y - 100, z, far);
  assert.ok(re && re.row === row && re.col !== cols[0], JSON.stringify(re));
  assert.equal(reselect(L, sel, L.part(row, 0).y - 100, z, L.part(row, cols[0]).x - 20), null, "in view: no change");
});

// ---- the page ----------------------------------------------------------------------------------------------------------
// A stand-in for the document, enough for openFlowchart (as function-map.test.mjs's galleryPage); the stage at 1:1.
function fakePage(uiExtra = {}) {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.style = {}; this.dataset = {}; this.attrs = {}; this.on = {}; this.cls = new Set(); this.text = ""; this.scrollTop = 0; this.scrollLeft = 0; }
    set className(c) { this.cls = new Set(String(c).split(/\s+/).filter(Boolean)); }
    get className() { return [...this.cls].join(" "); }
    get classList() { const s = this.cls; return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), toggle: (c, on = !s.has(c)) => { if (on) s.add(c); else s.delete(c); return on; }, contains: (c) => s.has(c) }; }
    append(...cs) { for (const c of cs) { if (typeof c === "string") { this.text += c; continue; } c.remove(); c.parent = this; this.children.push(c); } }
    appendChild(c) { this.append(c); return c; }
    remove() { if (this.parent) { const p = this.parent.children; p.splice(p.indexOf(this), 1); this.parent = null; } }
    get isConnected() { let e = this; while (e.parent) e = e.parent; return e === root; }
    set textContent(t) { for (const c of [...this.children]) c.remove(); this.text = String(t); }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
    addEventListener(t, f, capture) { (this.on[t] ||= []).push({ f, capture: !!capture }); }
    removeEventListener(t, f) { this.on[t] = (this.on[t] || []).filter((g) => g.f !== f); }
    // capture listeners first, then the rest unless one stopped it (as the browser does for a press on a child)
    fire(t, e = {}) {
      let stopped = false;
      const ev = { stopPropagation() { stopped = true; }, preventDefault() {}, button: 0, pointerType: "mouse", deltaX: 0, deltaMode: 0, ...e };
      for (const l of (this.on[t] || []).filter((x) => x.capture)) l.f(ev);
      if (!stopped) for (const l of (this.on[t] || []).filter((x) => !x.capture)) l.f(ev);
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; }
    getContext() { return { measureText: () => ({ width: 100 }) }; }
    findAll(fn, out = []) { for (const c of this.children) { if (fn(c)) out.push(c); c.findAll(fn, out); } return out; }
  }
  const root = new El("div");
  globalThis.document = { createElement: (t) => new El(t), getElementById: () => new El("div") };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const fx = [], sounds = [], items = [], bands = [];
  const ui = {
    root, keyFn: null, backFn: null, sounds, dialogs: [], items, sel: 0,
    begin() { for (const c of [...root.children]) c.remove(); items.length = 0; fx.length = 0; const p = new El("div"); root.append(p); return p; },
    menuBackground() {}, animate(fn) { fx.push(fn); }, sound(n) { sounds.push(n); }, ghost() {},
    helpBar(parent, labels) { bands.push(labels); parent.append(new El("div")); },
    add(el, fn, o = {}) { items.push({ el, fn, ...o }); return el; },
    select(i) { ui.sel = i; items[i]?.onSelect?.(); },
    move(i) { ui.select(i); ui.sound(0); },
    system() { ui.systemShown = true; },
    dialog(q, yes, no) { ui.dialogs.push(q); ui.yes = yes; ui.no = no; },
    env: { toast() {} },
    frames(n) { for (let i = 0; i < n; i++) for (const f of [...fx]) f(1); },
    key(k, extra = {}) { return ui.keyFn({ key: k, repeat: false, type: "keydown", ...extra }); },
    ...uiExtra,
  };
  const find = (fn) => root.findAll(fn);
  return { ui, find, bands };
}
async function open(flow, opts = { gallery: true }, vmExtra = {}, uiExtra = {}) {
  const { ui, find, bands } = fakePage(uiExtra);
  const jumps = [];
  const vm = { flowChart: realChart, flow, running: true, system: {}, ...vmExtra };
  await fcPage.openFlowchart(ui, vm, (i, p) => jumps.push([i, p.flag]), null, opts);
  const pg = { ui, find, bands, jumps, vm };
  pg.view = () => find((e) => e.cls.has("fc-view"))[0];
  pg.map = () => find((e) => e.cls.has("fc-map"))[0];
  pg.cursor = () => find((e) => e.cls.has("fc-cursor"))[0];
  pg.title = () => find((e) => e.cls.has("fc-preview-title")).at(-1)?.text;
  // the map's transform read back: [x, s, z] (no transform: the game's size, scrolled by the view's scrollTop)
  pg.zoomed = () => {
    const t = pg.map().style.transform || "";
    const m = t.match(/^translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\(([\d.]+)\)$/);
    if (!t) return null;
    assert.ok(m, t);
    const z = Number(m[3]);
    return [(-Number(m[1]) / z) || 0, (-Number(m[2]) / z) || 0, z];
  };
  // where a chart point is on the stage now
  pg.onScreen = (cx, cy) => { const v = pg.zoomed(); return v ? [(cx - v[0]) * v[2], (cy - v[1]) * v[2]] : [cx, cy - pg.view().scrollTop]; };
  return pg;
}

test("page: the help band names the zoom after the flowchart's own entries, with its keys; the CG viewer's names", { skip: !realChart }, async () => {
  assert.deepEqual(fcPage.helpEntries(0), ["Back", "Choose", "Move", "Scroll", ["Zoom", ["Ctrl + Wheel", "+ −"]], ["Reset", ["0"]]]);
  assert.deepEqual(fcPage.helpEntries(10).slice(0, 3), ["Back", "Choose", "Move"]);
  const pg = await open(savedFlow());
  assert.deepEqual(pg.bands[0], fcPage.helpEntries(0));
  // the bar itself: [label, keys] shows those keys under that label (a mouse); a finger's words by the label (touch)
  const { UI } = await import("../../web/app/js/ui.js");
  const { KeyMap } = await import("../../web/app/js/keys.js");
  const had = globalThis.document;
  const mk = (tag) => ({ tag, children: [], className: "", textContent: "", attrs: {}, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; } });
  globalThis.document = { createElement: mk };
  try {
    const words = (bar) => bar.children.map((h) => h.children.map((c) => c.textContent).join(" "));
    const store = () => ({ getItem: () => null, setItem() {} });
    const d = Object.assign(Object.create(UI.prototype), { touch: null, keys: new KeyMap(store()) });
    const bar = d.helpBar(mk("div"), fcPage.helpEntries(0));
    assert.deepEqual(words(bar), ["Esc Right click Back", "Enter Click Choose", "↑ ↓ ← → Move", "Wheel Page Up / Down Scroll", "Ctrl + Wheel + − Zoom", "0 Reset"]);
    assert.equal(bar.attrs["aria-label"], "Back, Choose, Move, Scroll, Zoom, Reset");
    const t = Object.assign(Object.create(UI.prototype), { touch: { on: true }, keys: new KeyMap(store()) });
    assert.deepEqual(words(t.helpBar(mk("div"), fcPage.helpEntries(0))), ["Tap Choose", "Drag Scroll", "Pinch Zoom"]);
    assert.deepEqual(words(d.helpBar(mk("div"), ["Back", "Picture", "Zoom", "Fill", "Reset"])).slice(2), ["Wheel ↑ ↓ Zoom", "Enter Fill", "Home Reset"], "the CG viewer's keys are its own");
  } finally { globalThis.document = had; }
});

test("page: + / - step the zoom about the selection, 0 goes back to the game's size; at 1 the map has no transform and the view scrolls as ever", { skip: !realChart }, async () => {
  const pg = await open(savedFlow());
  const { ui } = pg;
  ui.frames(31);
  // the wheel at the game's size: as before (function-map.test.mjs F6), the map untouched
  pg.view().fire("wheel", { deltaY: 300 });
  ui.frames(11);
  assert.equal(pg.view().scrollTop, 300);
  assert.equal(pg.zoomed(), null);
  const sel = ui.items[ui.sel].el, cx = parseFloat(sel.style.left) + 52, cy = parseFloat(sel.style.top) + 32;
  const before = pg.onScreen(cx, cy);
  assert.equal(ui.key("+"), true);
  let v = pg.zoomed();
  assert.equal(v[2], 1.25);
  assert.equal(pg.view().scrollTop, 0, "zoomed, the view itself stays at 0");
  pg.onScreen(cx, cy).forEach((c, i) => near(c, before[i], "the selection stays where it was"));
  for (const k of ["=", "+", "+", "+", "+"]) ui.key(k);
  assert.equal(pg.zoomed()[2], 3);
  ui.key("-");
  assert.equal(pg.zoomed()[2], 2.5);
  // with Ctrl or Cmd the keys are the browser's
  assert.equal(ui.key("+", { ctrlKey: true }), false);
  assert.equal(ui.key("0", { metaKey: true }), false);
  assert.equal(pg.zoomed()[2], 2.5);
  const sounds = ui.sounds.length;
  ui.key("0");
  assert.equal(pg.zoomed(), null, "the game's size: no transform at all");
  assert.equal(pg.map().style.transform, "");
  assert.ok(Number.isInteger(pg.view().scrollTop), `${pg.view().scrollTop}`);
  assert.equal(ui.sounds.length, sounds + 1);
  ui.key("0");
  ui.key("-");
  assert.equal(ui.sounds.length, sounds + 1, "nothing to do: no sound");
  assert.equal(pg.map().style.transform, "");
});

test("page: the wheel with Ctrl zooms about the pointer; zoomed, the wheel scrolls by its distance on screen, Shift across, the view inside the chart", { skip: !realChart }, async () => {
  const pg = await open(savedFlow());
  const { ui } = pg;
  ui.frames(31);
  const view = pg.view();
  view.fire("wheel", { deltaY: -100, ctrlKey: true, clientX: 600, clientY: 400 });
  let v = pg.zoomed();
  near(v[2], Math.exp(0.25));
  near((600 / v[2]) + v[0], 600, "the chart's point under the pointer stays"); near((400 / v[2]) + v[1], 400);
  for (let i = 0; i < 8; i++) view.fire("wheel", { deltaY: -100, ctrlKey: true, clientX: 600, clientY: 400 });
  assert.equal(pg.zoomed()[2], 3);
  // down 300 on screen: 100 of the chart, eased over 1/6 s
  const s0 = pg.zoomed()[1];
  view.fire("wheel", { deltaY: 300 });
  ui.frames(11);
  near(pg.zoomed()[1], s0 + 100);
  // across: Shift turns it; a touchpad's sideways scroll comes as deltaX
  const x0 = pg.zoomed()[0];
  view.fire("wheel", { deltaY: 150, shiftKey: true });
  ui.frames(11);
  near(pg.zoomed()[0], x0 + 50);
  view.fire("wheel", { deltaX: 30000 });
  ui.frames(11);
  near(pg.zoomed()[0], panMax(3), "not past the chart's right edge");
  view.fire("wheel", { deltaX: -30000, deltaY: -300000 });
  ui.frames(11);
  assert.deepEqual(pg.zoomed().slice(0, 2), [0, 0], "nor past its top left");
  view.fire("wheel", { deltaY: 10 ** 7 });
  ui.frames(11);
  const L = layoutChart(realChart, savedFlow());
  near(pg.zoomed()[1], zoomScrollMax(L, 3), "nor past its bottom");
  // and the wheel with Ctrl down all the way: the game's size again
  for (let i = 0; i < 10; i++) view.fire("wheel", { deltaY: 100, ctrlKey: true, clientX: 600, clientY: 400 });
  assert.equal(pg.map().style.transform, "");
  assert.ok(pg.view().scrollTop <= L.scrollMax);
});

test("page: zoomed, the keys' moves keep the selection in view, and opening a scene, the question and Back work as before", { skip: !realChart }, async () => {
  const flow = savedFlow();
  for (const n of R(1, 300)) flow.path.add(n);
  flow.current = 2;
  const pg = await open(flow, {});   // the game's flowchart
  const { ui } = pg;
  ui.frames(31);
  for (let i = 0; i < 3; i++) ui.key("+");
  assert.equal(pg.zoomed()[2], 2);
  for (let i = 0; i < 12; i++) { ui.items[ui.sel].down(); ui.frames(11); }
  const sel = ui.items[ui.sel].el, [sx, sy] = pg.onScreen(parseFloat(sel.style.left), parseFloat(sel.style.top));
  assert.ok(sx >= 0 && sx + 208 <= 1360 && sy >= 0 && sy + 128 <= 1022 + 16, `the selection at ${sx}, ${sy}`);
  // Decide: the rewind question; No draws the chart again as it was, zoom and all
  const was = pg.zoomed(), title = pg.title();
  ui.items[ui.sel].fn();
  assert.equal(ui.dialogs.length, 1);
  await ui.no();
  assert.deepEqual(pg.zoomed(), was);
  assert.equal(pg.title(), title);
  // Yes jumps
  ui.items[ui.sel].fn();
  ui.yes();
  assert.equal(pg.jumps.length, 1);
  // and Back fades it out to the system menu, zoomed or not
  const p2 = await open(flow, {});
  p2.ui.frames(31);
  p2.ui.key("+");
  p2.ui.backFn();
  p2.ui.frames(31);
  assert.ok(p2.ui.systemShown);
});

test("page: two fingers pinch the chart about the point between them and move it; the second lights nothing, and the press opens nothing", { skip: !realChart }, async () => {
  const pg = await open(savedFlow());
  const { ui } = pg;
  ui.frames(31);
  const view = pg.view(), sel = ui.sel;
  const touch = (type, id, x, y, isPrimary = id === 1) => view.fire(type, { pointerType: "touch", pointerId: id, isPrimary, clientX: x, clientY: y });
  touch("pointerdown", 1, 500, 400);
  const lit = (sel + 3) % ui.items.length;
  ui.select(lit);                             // (the first finger's press lights the scene under it: ui.add, touch)
  assert.equal(ui.sel, lit);
  touch("pointerdown", 2, 700, 400);
  assert.equal(ui.sel, sel, "a pinch is no press on a scene: the selection is given back");
  // a finger is 100 from the middle (600, 400); both go to 200 from it and the middle moves to (650, 450)
  touch("pointermove", 1, 450, 450);
  touch("pointermove", 2, 850, 450);
  const v = pg.zoomed();
  near(v[2], 2);
  near(650 / 2 + v[0], 600, "the chart's point between them follows them"); near(450 / 2 + v[1], 400);
  ui.frames(20);
  assert.deepEqual(pg.zoomed(), v, "no drag's coast after it");
  touch("pointerup", 2, 850, 450);
  touch("pointermove", 1, 300, 600);
  ui.frames(20);
  assert.deepEqual(pg.zoomed(), v, "one finger left: the pinch is over, and it is no drag");
  touch("pointerup", 1, 300, 600);
  assert.equal(ui.sel, sel, "the selection is as it was");
  // a pinch closed all the way: the game's size again
  touch("pointerdown", 1, 400, 400);
  touch("pointerdown", 2, 800, 400);
  touch("pointermove", 2, 410, 400);
  assert.equal(pg.map().style.transform, "");
  touch("pointerup", 1, 400, 400); touch("pointerup", 2, 410, 400);
  // and one finger alone still drags the chart as before (function-map.test.mjs F6)
  const s0 = view.scrollTop;
  touch("pointerdown", 1, 700, 600);
  ui.frames(1);
  for (let k = 1; k <= 5; k++) { touch("pointermove", 1, 700, 600 - 30 * k); ui.frames(1); }
  touch("pointerup", 1, 700, 450);
  ui.frames(60);
  assert.ok(view.scrollTop > s0 + 100, `${view.scrollTop}`);
});

test("page: zoomed, a drag moves the chart across too, as far on the screen as the finger or the mouse", { skip: !realChart }, async () => {
  const pg = await open(savedFlow());
  const { ui } = pg;
  ui.frames(31);
  for (let i = 0; i < 4; i++) ui.key("+");
  ui.key("0"); for (let i = 0; i < 2; i++) ui.key("+");   // 1.5, about the selection
  assert.equal(pg.zoomed()[2], 1.5);
  const view = pg.view();
  view.fire("pointerdown", { clientX: 900, clientY: 500, pointerId: 7 });
  ui.frames(1);
  const [x0, s0] = pg.zoomed();
  for (let k = 1; k <= 5; k++) { view.fire("pointermove", { clientX: 900 - 30 * k, clientY: 500 - 30 * k }); ui.frames(1); }
  view.fire("pointerup", {});
  ui.frames(60);
  const [x1, s1] = pg.zoomed();
  assert.ok(x1 > x0 + 30 && s1 > s0 + 30, `${x0} -> ${x1}, ${s0} -> ${s1}`);
  assert.ok(x1 <= panMax(1.5));
});

test("page: zoomed, the chart takes the stage's whole width, and the preview panel over it keeps the pointer and passes the wheel on", { skip: !realChart }, async () => {
  const pg = await open(savedFlow());
  const { ui, find } = pg;
  ui.frames(31);
  const base = find((e) => (e.style.cssText || "").includes("/flow_infobase.webp"))[0];
  assert.equal(pg.view().style.width, "1440px");
  assert.ok(!base.style.pointerEvents, "at the game's size the panel lets the pointer through, as ever");
  ui.key("+");
  assert.equal(pg.view().style.width, "1920px", "the user: \"it should expand all the way, not cut off like that on right\"");
  assert.equal(base.style.pointerEvents, "auto", "a scene hidden under the panel is neither lit nor chosen");
  const s0 = pg.zoomed()[1];
  base.fire("wheel", { deltaY: 250 });
  ui.frames(11);
  near(pg.zoomed()[1], s0 + 200, "the wheel over the panel scrolls the chart");
  // a drag starts right of 1360 too, zoomed
  pg.view().fire("pointerdown", { clientX: 1700, clientY: 900, pointerId: 3 });
  ui.frames(1);
  for (let k = 1; k <= 5; k++) { pg.view().fire("pointermove", { clientX: 1700, clientY: 900 - 30 * k }); ui.frames(1); }
  pg.view().fire("pointerup", {});
  ui.frames(40);
  assert.ok(pg.zoomed()[1] > s0 + 260, `${pg.zoomed()[1]}`);
  ui.key("0");
  assert.equal(pg.view().style.width, "1440px");
  assert.equal(base.style.pointerEvents, "");
  assert.equal(pg.view().style.height, "1022px", "with a mouse it stops above the hint bar, zoomed or not");
  // a touch device draws no hint bar: the chart runs down to the stage's bottom, at the game's size too
  const t = await open(savedFlow(), { gallery: true }, {}, { touch: { on: true } });
  t.ui.frames(31);
  assert.equal(t.view().style.height, "1080px");
  const TL = layoutChart(realChart, savedFlow());
  t.view().fire("wheel", { deltaY: 1e7 });
  t.ui.frames(11);
  assert.equal(t.view().scrollTop, TL.scrollMax - 58, "its scroll ends 58 sooner: the chart's end as far from the view's bottom as with a mouse");
  t.ui.key("+");
  assert.deepEqual([t.view().style.width, t.view().style.height], ["1920px", "1080px"]);
  t.view().fire("wheel", { deltaY: 1e7 });
  t.ui.frames(11);
  near(t.zoomed()[1], zoomScrollMax(layoutChart(realChart, savedFlow()), 1.25, true), "its scroll ends with the chart's bottom at the stage's");
  t.ui.key("0");
  assert.equal(t.view().style.height, "1080px");
  assert.ok(t.view().scrollTop <= TL.scrollMax - 58);
});

test("page: the transform is the zoom's only change to the page's style; the CSS gives the map its corner", () => {
  const css = readFileSync(new URL("../../web/app/style.css", import.meta.url), "utf8");
  assert.match(css, /\.fc-map \{ position: relative; overflow: hidden; transform-origin: 0 0; \}/);
  assert.doesNotMatch(css, /\.fc-(map|view)[^{]*\{[^}]*will-change/, "no will-change: the browser would keep a picture of the chart and enlarge it");
  const js = readFileSync(new URL("../../web/app/js/flowchart.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /willChange|style\.zoom/);
});
