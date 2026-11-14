// The original vertical flowchart (native cFlowchartScene: constructor 0xf8fc, chart 0xfffc, update 0x110d4), using its
// authored rows and interface atlas.
import { sprite } from "./ui.js";
import { reflowNote } from "./reflow.js";
import { chapterLine, flowChapter } from "./chapters.js";
import { DragFlick, FLOW_SCROLL_TIME, FLOW_VIEW, PadRepeat, STICK_DEAD, layoutChart, moveCursor, panFor, panMax, reselect, scrollFor, stickTarget, titleSize, viewHeight, viewWidth, wheelZoom, zoomScrollMax, zoomStep, zoomView } from "./flowchart-model.js";
import { EASE, MenuBgFade, Tween, fadeIn, fadeOut, wheelPixels } from "./uifx.js";
import { GuideFx, REPLAY_MENU_BG, cgCursorLight, fadeMusicOut, scrollBar } from "./gallery.js";
import { JA, asset } from "./lang.js";
import { pinch } from "./touch.js";

const PACK = "MENU_PARTS_JA";

const TITLE_FONT = '24px Helvetica, Arial, "Arimo Bundled", sans-serif';   // the size and --flow-font of .fc-preview-title
let titleRuler = null;
// Sets a preview title's size for its width.
function fitTitle(el, text) {
  titleRuler ??= document.createElement("canvas").getContext?.("2d");
  if (!titleRuler?.measureText) return;
  titleRuler.font = TITLE_FONT;
  el.style.fontSize = `${titleSize(titleRuler.measureText(text).width)}px`;
}
const url = (name) => asset(`/assets/ui/${PACK}/${name}.webp`);
const element = (tag, cls, text) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const place = (e, x, y, w, h) => {
  e.style.left = `${x}px`; e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
};
// The preview's change (0x16e00): the old picture and texts go from 1 to 0 over 1/12 s and the new texts come from 0 to
// 1 as long, quadratic in (0x21a20 channel 8, type 2 mode 0); the new picture shows at once, in front of the old.
export const PREVIEW_FADE = 1 / 12;
// Frames since the last change under which the next one counts as quick (a held direction repeats every 5, the wheel
// and a drag can change it every frame).
export const PREVIEW_QUICK = 12;

// The help band (a gallery guide drawn by 0x4a8f0): the flowchart's kind (0x123f4) is 0 (Back, Choose, Move, Scroll)
// while its scroll bar is on, else 10 (no Scroll).
export const HELP = { 0: ["Back", "Choose", "Move", "Scroll"], 10: ["Back", "Choose", "Move"] };
export const helpKind = (layout) => (layout.scrollMax > 0 ? 0 : 10);
// The port's own zoom (flowchart-model.js zoomView), after the kind's entries, under the CG viewer's names for the same
// two things (ui.helpBar: [label, keys]): the wheel with Ctrl (a touchpad's pinch) or + / -, and 0 for the game's size.
export const ZOOM_KEYS = { "+": 1, "=": 1, "-": -1, "0": 0 };
export const ZOOM_HELP = [["Zoom", ["Ctrl + Wheel", "+ −"]], ["Reset", ["0"]]];
export const helpEntries = (kind) => [...(HELP[kind] || HELP[10]), ...ZOOM_HELP];

// The first stick's value (-128 ... 128, up positive; 0xb38f4: the axis x 128, truncated, the pads summed and clamped)
// from the browser's pads (standard mapping: axes[1], down positive, is the left stick) and PageUp / PageDown, which the
// PC build binds to that stick pushed all the way (SUP / SDOWN).
export function stickY(pads = [], keys = new Set()) {
  let y = 0;
  for (const pad of pads) if (pad && pad.mapping === "standard" && pad.axes?.length > 1) y += Math.trunc(-pad.axes[1] * 128);
  if (keys.has("PageUp")) y += 128;
  if (keys.has("PageDown")) y -= 128;
  return Math.max(-128, Math.min(128, y));
}
// A wheel event's distance in the stage's pixels (uifx.js; the config scrolls by it too).
export { wheelPixels };

// The titles of a day stay at y 8 while the day scrolls by, and the next day's separator pushes them up (0x11eb4):
// the shift in chart pixels for titles at ys (top first), the separator edge at limit (null: none), the scroll s.
export function stickyShift(ys, limit, s) {
  if (!ys.length) return 0;
  let off = -s;
  if (ys[0] + off < 8) off = 8 - ys[0];
  const bottom = off + ys[ys.length - 1] + 32;
  if (limit !== null && limit - s < bottom) off -= bottom - (limit - s);
  return off + s;
}

// opts.gallery: opened from the gallery, over its background, and Back returns there (opts.back); opts.ghost: the
// gallery's page, kept over this one as it fades out; opts.reopened: shown again after a No, with no fade;
// opts.select: the scene to start on (the gallery's after a replay, 0x7f38 -> 0xf8fc's third argument).
export async function openFlowchart(ui, vm, jump, keep = null, opts = {}) {
  let chart = vm.flowChart;
  if (!chart || chart.version !== 2) {
    try {
      const response = await fetch(asset("/assets/flowchart.json"));
      if (!response.ok) throw Error("Run web/tools/build_flowchart.py to build the flowchart");
      chart = await response.json();
      if (chart.version !== 2) throw Error("Rebuild the flowchart with web/tools/build_flowchart.py");
      vm.flowChart = chart;
      vm.flow.install(chart, (i) => vm.isRead(i));
    } catch (e) { ui.env.toast(e.message, 5000); return; }
  }
  const fromTitle = !vm.running && !vm.restoring;
  const game = !opts.gallery;
  const page = ui.begin("flowchart", { blur: !fromTitle && !opts.gallery });
  page.classList.add("fc-page");
  // From the gallery the system menu's background is still up under flow_bg (57% black); conf_BG is empty.
  const menuBg = new MenuBgFade(1, 1);
  if (opts.gallery) { page.style.background = "#000"; ui.menuBackground(page, { settled: true, fade: menuBg }); }
  else if (fromTitle) page.append(sprite("DISP_PARTS_JA", "bg_backlog", 0, 0, 1920, 1080));
  else if (ui.menuBg) ui.menuBackground(page, { fade: ui.menuBg });   // the system menu's background stays up under it (0x4d8c0 state 0xf)
  page.append(sprite(PACK, "flow_bg", 0, 0, 1920, 1080));

  vm.flow.infer();
  const layout = layoutChart(chart, vm.flow, { game });
  // (a touch device draws no hint bar, touch.css: there the chart's window runs down to the stage's bottom, the port's own;
  // with a mouse it ends at 1022 above the bar, as the game's does above its help band: viewHeight)
  const tall = !!ui.touch;
  const view = place(element("div", "fc-view"), 0, 0, 1440, viewHeight(1, tall));
  const map = element("div", "fc-map");
  // the scroll runs from 0 to the chart's end as 0xfffc gives it (the scroll bar's range), not to the last pixel drawn
  map.style.width = "1440px"; map.style.height = `${Math.max(0, layout.scrollMax) + 1022}px`;
  view.append(map); page.append(view);

  // The day bands (0x13b54, z 460: flow_sam_bg_middle_fullhd's one row stretched) from the top to the chart's bottom,
  // broken at each day by flow_sam_bg_under_fullhd / flow_sam_bg_upper_fullhd in front (0x13d04 / 0x14b58, z 450).
  for (const b of layout.bands) if (b.name === "flow_sam_bg_middle_fullhd") map.append(place(element("div", "fc-band"), 0, b.y, 1440, b.h));
  for (const b of layout.bands) if (b.name !== "flow_sam_bg_middle_fullhd") map.append(sprite(PACK, b.name, 0, b.y, 1440, b.h));
  // The day titles (0xfffc: at (208, 8 + 32 k) from the day's first row, for each new phase whose line is revealed),
  // a group per day that sticks to the top (stickyShift).
  const titleDays = layout.labels.map((d) => {
    const group = element("div", "fc-titles");
    // written out (chapters.js) where the game has a picture of each (flow_phasetitle: cells of 200 x 32, the words set
    // right in them), larger than the picture's, ending where the picture's words ended
    for (const label of d.labels) {
      const r = chart.phaseRects[label.phase], c = flowChapter(r);
      if (!c) continue;
      // Japanese: the game's own picture of the chapter (flow_phasetitle), where the cell is
      if (JA) { group.append(sprite(PACK, "flow_phasetitle", label.x, label.y, r[2], r[3], r[0], r[1])); continue; }
      const t = place(element("div", `fc-chapter${c.struck ? " struck" : ""}`), 0, label.y, label.x + r[2], r[3]);
      if (c.struck) { t.textContent = c.day === null ? "" : `${c.day} / `; t.append(element("s", "", c.name)); } else t.textContent = chapterLine(c);
      group.append(t);
    }
    map.append(group);
    return { group, ys: d.labels.map((l) => l.y), limit: d.limit };
  });

  // The line pieces (z 450), the path's in front (z 440, in the game only), then the nodes (z 400).
  for (const path of [false, true]) for (const pc of layout.pieces) {
    if (pc.path !== path) continue;
    const r = chart.connectorRects[pc.rect];
    if (r) map.append(sprite(PACK, "flow_line_merge", pc.x, pc.y, r[2], r[3], r[0], r[1], "fc-line"));
  }

  const panel = element("div", "fc-preview");
  panel.setAttribute("aria-live", "polite");
  // flow_infobase (0x468eb8) and "This scene" (flow_info, 0x468ee0 at (1672, 120)): both always shown with the panel
  // (z 500 / 300: "This scene" is in front of the pictures, z 400 / 350)
  const thisScene = sprite(PACK, "flow_info", 1672, 120, 144, 32);
  thisScene.style.zIndex = "2";
  // (zoomed, the chart runs on under the panel: the panel's base then takes the pointer, so a scene hidden under it is
  // neither lit nor chosen, and passes the wheel on to the chart; setView)
  const panelBase = sprite(PACK, "flow_infobase", ...chart.layout.previewPanel);
  panel.append(panelBase, thisScene);
  page.append(panel);

  const at = { row: 0, col: 0 };
  let press = null, dragged = false;
  const nodes = layout.nodes;
  const index = new Map(nodes.map((n, i) => [`${n.row}:${n.col}`, i]));
  // The cursor (0xf8fc: flow_cur cell (8, 8), z 150) and its flash in front (cell (120, 8)), which program 0x34b7f0
  // runs from alpha 1 down to -1 over 30 frames whenever a selection changes the preview (0x10ba4): shown 15 frames.
  const cursor = place(element("div", "fc-cursor"), 0, 0, 104, 64);
  cursor.style.backgroundImage = `url("${url("flow_cur")}")`;
  cursor.style.backgroundPosition = "-8px -8px";
  const flash = place(element("div", "fc-cursor"), 0, 0, 104, 64);
  flash.style.backgroundImage = `url("${url("flow_cur")}")`;
  flash.style.backgroundPosition = "-120px -8px";
  flash.style.opacity = "0";
  let flashAt = 30;

  // The preview (0x16e00), as layers: each change fades the shown one out and brings a new one in. A quick change swaps
  // the texts at once: the game cross-fades these too, and with changes in a row two or three texts lie over each other.
  let shown = null, fades = [], sinceChange = Infinity;
  function preview(p) {
    const quick = sinceChange < PREVIEW_QUICK;
    sinceChange = 0;
    if (quick) {
      for (const f of fades) if (f.text && f.remove) for (const e of f.els) e.remove();
      fades = fades.filter((f) => !f.text);
    }
    if (shown) {
      const old = shown;
      if (old.image) old.image.style.zIndex = "0";   // the old picture behind the new (z 350 / 400)
      if (old.image) fades.push({ els: [old.image], tw: new Tween(1, 0, PREVIEW_FADE, EASE.quad.in), remove: true });
      if (quick) { old.title.remove(); old.note.remove(); }
      else fades.push({ els: [old.title, old.note], text: true, tw: new Tween(1, 0, PREVIEW_FADE, EASE.quad.in), remove: true });
      shown = null;
    }
    if (!p || p.preview < 0 || !p.previewName) return;
    const image = place(element("img", "fc-preview-image"), 1380, 120, 432, 244);
    image.alt = ""; image.decoding = "async"; image.style.zIndex = "1";
    image.src = asset(`/assets/img/${encodeURIComponent(p.previewName)}.avif`);
    const title = place(element("div", "fc-preview-title", p.title.replace(/\^/g, "\n")), 1392, 404, 400, 48);
    fitTitle(title, p.title);
    const note = place(element("div", "fc-preview-note", JA ? p.note.replace(/\^/g, "\n") : reflowNote(p.note)), 1392, 452, 400, 200);
    title.style.opacity = note.style.opacity = quick ? "1" : "0";
    panel.append(image, title, note);
    if (!quick) fades.push({ els: [title, note], text: true, tw: new Tween(0, 1, PREVIEW_FADE, EASE.quad.in) });
    shown = { image, title, note, preview: p.preview };
  }

  // Scrolling: only the chart moves it (the view does not scroll by itself). A selection's move eases there (0x10d5c);
  // the player's stick, drag and wheel ease to their own targets (0x27bd4, restarted from where the scroll is) and
  // mark the scroll as the player's: while it runs, and once more as it ends, a node in view takes the selection
  // (0x11418 -> 0x12d1c). The scroll bar is the lists' (0x276b0 / 0x2788c).
  const bar = scrollBar(page);
  const flick = new DragFlick(), flickX = new DragFlick(), padRepeat = new PadRepeat();
  let scrollTw = null, panTw = null, player = false;
  // The zoom (the port's own, flowchart-model.js zoomView). At z 1, the game's size, the view scrolls by its scrollTop as it
  // always did and nothing else is set. Zoomed, the view takes the stage's whole width (viewWidth) and stays at 0, and the
  // map is drawn larger by a transform from its scroll (zoomTop down, panX across, the chart's pixels): the browser paints
  // its text and art at that size, sharp, not a picture of the chart enlarged, and into the view's own 1920 x 1022 at
  // most (1080 on a touch device, which draws no hint bar under it: tall, viewHeight), so nothing grows in memory with it.
  // Only the keys' moves, the player's scroll and the zoom move it across.
  let zoom = 1, panX = 0, zoomTop = 0;
  const top = () => (zoom === 1 ? view.scrollTop : zoomTop);
  const clampScroll = (v) => Math.max(0, Math.min(zoomScrollMax(layout, zoom, tall), v));
  const clampPan = (v) => Math.max(0, Math.min(panMax(zoom), v));
  function setView(s, x = panX, z = zoom) {
    if (z === 1) {
      if (zoom !== 1) { map.style.transform = ""; view.style.width = `${FLOW_VIEW.w}px`; panelBase.style.pointerEvents = ""; flickX.reset(); }
      zoom = 1; panX = 0;
      view.scrollTop = s;
    } else {
      if (zoom === 1) { view.style.width = `${viewWidth(z)}px`; panelBase.style.pointerEvents = "auto"; }
      zoom = z; panX = x; zoomTop = s;
      view.scrollTop = 0; view.scrollLeft = 0;
      map.style.transform = `translate(${-x * z}px, ${-s * z}px) scale(${z})`;
    }
    scrolled();
  }
  function setScroll(v) { setView(v); }
  function scrolled() {
    const s = top();
    bar.set(s, zoom === 1 && !tall ? layout.scrollMax : zoomScrollMax(layout, zoom, tall));
    for (const d of titleDays) d.group.style.transform = `translateY(${stickyShift(d.ys, d.limit, s) }px)`;
  }
  function playerScroll(to) {
    scrollTw = new Tween(top(), clampScroll(to), FLOW_SCROLL_TIME, EASE.quad.out);
    player = true;
  }
  function playerPan(to) {
    panTw = new Tween(panX, clampPan(to), FLOW_SCROLL_TIME, EASE.quad.out);
    player = true;
  }
  // A zoom to z: the chart's point at `at` (view pixels) comes to `to`, from the view as it is or as it was (a pinch's
  // start). It stops the scrolls under way. False when nothing changed.
  function zoomTo(z, at, to = at, from = { z: zoom, x: panX, s: top() }) {
    const v = zoomView(layout, from, z, at, to, tall);
    if (v.z === zoom && v.x === panX && v.s === top()) return false;
    scrollTw = panTw = null; player = false;
    setView(v.s, v.x, v.z);
    return true;
  }
  // The keys zoom about the selection while it is in the open part of the view, else about that part's middle.
  function keyAnchor() {
    const p = layout.part(at.row, at.col);
    if (p) {
      const x = (p.x + 52 - panX) * zoom, y = (p.y + 32 - top()) * zoom;
      if (x >= 0 && x <= FLOW_VIEW.open && y >= 0 && y <= viewHeight(zoom, tall)) return [x, y];
    }
    return [FLOW_VIEW.open / 2, viewHeight(zoom, tall) / 2];
  }

  // A selection (0x10ba4): the cursor to the node; when the preview differs, the preview changes and the flash starts;
  // a key's move scrolls the chart to show it (0x10d5c), a pointer's or the player's scroll does not.
  function select(p, how = "key") {
    at.row = p.row; at.col = p.col;
    place(cursor, p.x, p.y); place(flash, p.x, p.y);
    cursor.style.display = flash.style.display = "block";
    if (!shown || shown.preview !== p.preview) {
      preview(p);
      if (how !== "open") { flashAt = 0; flash.style.opacity = String(cgCursorLight(0)); }
    }
    if (how === "key") {
      const to = scrollFor(layout, at, top(), zoom, tall);
      if (to !== null) scrollTw = new Tween(top(), to, FLOW_SCROLL_TIME, EASE.quad.out);
      const x = panFor(layout, at, panX, zoom);   // (zoomed only)
      if (x !== null) panTw = new Tween(panX, x, FLOW_SCROLL_TIME, EASE.quad.out);
    }
  }
  let how = "pointer";
  function move(dir) {
    const to = moveCursor(layout, at, dir);
    const i = to ? index.get(`${to.row}:${to.col}`) : undefined;
    if (i === undefined) return;
    how = "key";
    ui.move(i);
    how = "pointer";
  }

  // No to the jump: the flowchart again as it was (the native keeps drawing it under the dialog, 0x11a58), without the
  // gallery's page to fade out over it or its own fade in (opts.ghost, opts.reopened).
  function reopen() {
    return openFlowchart(ui, vm, jump, { flag: layout.part(at.row, at.col)?.flag, top: top(), zoom, x: panX }, { ...opts, ghost: null, reopened: true });
  }

  // Decide (0x11418) acts on the part at the selection, a node or not: from the gallery the scene plays at once (0x5040
  // with the part's jump and flag, state 3: no question); in the story the native flowchart (state 4, 0x11a58) asks
  // dialog 26 (0x49710), SYSMES 1497 by table 0x3c9340, before rewinding to it (0x178c8). The selection rests on a part
  // that is no node only from the opening (0xf8fc: the requested scene's part, else row 0, column 0), e.g. scene 485 when
  // the current scene is a virtual one such as 520 (after 181 -> 184 with F054 = 0), whose part is a placeholder.
  function decide(p) {
    if (!p || dragged || !ready()) return;
    if (!Number.isInteger(p.script)) return;   // a part with no scene (a placeholder or a bare line): nothing to start
    ui.keyFn = null;
    if (opts.gallery) { replayOut(() => jump(p.script, p)); return; }
    const ask = vm.system?.messages?.["1497"] || "Rewind to the selected scene?^Any progress will be lost.";
    ui.dialog(ask.replace("^", "\n"), () => jump(p.script, p), reopen);
  }

  // The nodes: thumbnails of completed scenes, flow_sam_non otherwise; only the selectable ones take the cursor.
  for (const row of layout.rows) for (const p of row.parts) {
    if (!p.node) continue;
    const look = (e) => {
      if (p.node === "thumb") {
        e.style.backgroundImage = `url("${url("flow_thumb_all_nx")}")`;
        e.style.backgroundPosition = `${-(p.thumb % 20 * 104 + 1)}px ${-(Math.floor(p.thumb / 20) * 64 + 1)}px`;
      } else e.style.backgroundImage = `url("${url("flow_sam_non")}")`;
      return e;
    };
    if (!p.reg) { map.append(look(place(element("div", "fc-node"), p.x, p.y, 104, 64))); continue; }
    const b = look(place(element("button", "fc-node" + (p.node === "thumb" ? " read" : " unread")), p.x, p.y, 104, 64));
    b.setAttribute("aria-label", `${p.title}${p.node === "thumb" ? "" : " (not read yet)"}`);
    b.setAttribute("aria-disabled", p.jumpable ? "false" : "true");
    b.dataset.flag = p.flag;
    // (a touch device: a first tap shows the scene at the right, a tap on the scene shown opens it; ui.add's twoTap)
    map.append(ui.add(b, () => decide(p), { up: () => move("up"), down: () => move("down"), left: () => move("left"),
      right: () => move("right"), onSelect: () => select(p, how), twoTap: true }));
  }
  map.append(cursor, flash);

  // Keys: Decide on a selection that is no node acts on its part (decide); PageUp / PageDown are the first stick pushed
  // all the way while held (the PC build's SUP / SDOWN), which scrolls; Home / End (the port's) go to the first / last
  // selectable node; + / - zoom a step in / out and 0 goes back to the game's size (the port's, about keyAnchor; with
  // Ctrl or Cmd they are left to the browser).
  const held = new Set();
  const win = globalThis;
  const unhold = (e) => {
    if (!page.isConnected) { win.removeEventListener?.("keyup", unhold); win.removeEventListener?.("blur", unhold); return; }
    if (e.type === "blur") held.clear(); else held.delete(e.key);
  };
  win.addEventListener?.("keyup", unhold); win.addEventListener?.("blur", unhold);
  ui.keyFn = (e) => {
    if (e.key === "PageUp" || e.key === "PageDown") { if (ready()) held.add(e.key); return true; }
    if (!ready()) return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(e.key);
    if (Object.hasOwn(ZOOM_KEYS, e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const dir = ZOOM_KEYS[e.key];
      if (zoomTo(zoomStep(zoom, dir), keyAnchor()) && dir === 0) ui.sound(0);
      return true;
    }
    if ((e.key === "Enter" || e.key === " ") && !index.has(`${at.row}:${at.col}`)) {
      if (!e.repeat) { ui.sound(1); decide(layout.part(at.row, at.col)); }
      return true;
    }
    if (!nodes.length) return false;
    let next;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = nodes.length - 1;
    else return false;
    how = "key"; ui.move(next); how = "pointer"; return true;
  };

  // The pointer: a press in the chart (x 0-1360, y 0-1022) drags it as the touch screen does (DragFlick, in the touch
  // screen's 720-line pixels); a move past 6 pixels makes it a drag, not a click. The wheel (no native one: the PC build
  // gives it buttons) eases the chart by its own distance over 1/6 s as the other scrolls do. Zoomed (the port's), a drag
  // and the wheel move it as far on the screen, across too (Shift turns a wheel sideways); the wheel with Ctrl or Cmd,
  // which is also what a touchpad's pinch sends, zooms about the pointer, and so does Safari's own pinch (gesture events).
  const stage = () => document.getElementById("stage").getBoundingClientRect();
  const scale = () => stage().width / 1920;
  const touchY = (clientY) => Math.floor(((clientY - stage().top) / scale()) * 720 / 1080);
  const touchX = (clientX) => Math.floor(((clientX - stage().left) / scale()) * 720 / 1080);
  // a point of the window in the view's pixels (the view lies at the stage's top left), kept inside the view
  const inView = (cx, cy) => {
    const s = stage(), k = scale();
    return [Math.max(0, Math.min(viewWidth(zoom), (cx - s.left) / k)), Math.max(0, Math.min(viewHeight(zoom, tall), (cy - s.top) / k))];
  };
  // Fingers on the chart (a touch screen): two pinch it, zooming about the point between them and moving with it
  // (touch.js pinch). The second finger is the pinch's alone: it lights no scene (ui.add's press) and starts no drag; the
  // pinch ends when a finger lifts, and the press as a whole selects and opens nothing.
  const fingers = new Map();
  let pinched = null, firstSel = null;
  const fingerDown = (e) => {
    if (e.pointerType !== "touch") return;
    // (a new touch: a finger whose lift never came holds nothing up; the selection as it was, which the first finger's
    // press may light another scene over, ui.add)
    if (e.isPrimary) { fingers.clear(); pinched = null; firstSel = { i: ui.sel, row: at.row, col: at.col }; }
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size < 2) return;
    e.stopPropagation();
    if (fingers.size !== 2 || pinched || !ready()) return;
    const [a, b] = [...fingers.values()];
    pinched = { a, b, z: zoom, x: panX, s: top(), at: inView((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), on: true };
    press = null; dragged = true; view.classList.remove("drag");
    flick.reset(); flickX.reset(); scrollTw = panTw = null; player = false;
    // a pinch is no press on a scene: the one the first finger lit gives the selection back
    const f = firstSel;
    if (f && (f.row !== at.row || f.col !== at.col) && index.get(`${f.row}:${f.col}`) === f.i) ui.select(f.i);
  };
  view.addEventListener("pointerdown", fingerDown, true);
  // (zoomed, the view is the stage's width and a drag starts anywhere in it; at the game's size in x 0-1360, 0x6a0)
  view.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || (e.pointerType === "touch" && fingers.size > 1)) return;
    const s = stage(), k = scale(), x = (e.clientX - s.left) / k, y = (e.clientY - s.top) / k;
    dragged = false;
    if (x < 0 || x > (zoom === 1 ? 1360 : FLOW_VIEW.full) || y < 0 || y > viewHeight(zoom, tall)) return;
    press = { x: e.clientX, y: e.clientY, cur: e.clientY, curX: e.clientX, id: e.pointerId };
  });
  const pointerMove = (e) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinched) {
      if (pinched.on && fingers.size === 2 && ready()) {
        const [a, b] = [...fingers.values()], p = pinch(pinched.a, pinched.b, a, b);
        zoomTo(pinched.z * p.ratio, pinched.at, inView(p.at[0], p.at[1]), pinched);
      }
      return;
    }
    if (!press) return;
    press.cur = e.clientY; press.curX = e.clientX;
    const dx = (e.clientX - press.x) / scale(), dy = (e.clientY - press.y) / scale();
    if (!dragged && Math.hypot(dx, dy) > 6) { dragged = true; view.setPointerCapture?.(press.id); view.classList.add("drag"); }
  };
  view.addEventListener("pointermove", pointerMove);
  const release = (e) => {
    if (fingers.delete(e?.pointerId) && pinched) { pinched.on = false; if (fingers.size) return; pinched = null; }
    press = null; view.classList.remove("drag"); setTimeout(() => { dragged = false; });
  };
  view.addEventListener("pointerup", release); view.addEventListener("pointercancel", release);
  let gesture = null;
  function wheel(e) {
    e.preventDefault(); e.stopPropagation();
    if (!ready()) return;
    if (e.ctrlKey || e.metaKey) { if (!gesture) zoomTo(wheelZoom(zoom, wheelPixels(e)), inView(e.clientX, e.clientY)); return; }
    if (zoom === 1) {
      if (zoomScrollMax(layout, 1, tall) <= 0) return;
      const from = scrollTw && player ? scrollTw.to : view.scrollTop;
      playerScroll(Math.trunc(from + wheelPixels(e, scale())));
      return;
    }
    let dx = e.deltaX || 0, dy = e.deltaY || 0;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (dy) playerScroll((scrollTw && player ? scrollTw.to : top()) + wheelPixels({ deltaY: dy, deltaMode: e.deltaMode }, scale()) / zoom);
    if (dx) playerPan((panTw && player ? panTw.to : panX) + wheelPixels({ deltaY: dx, deltaMode: e.deltaMode }, scale()) / zoom);
  }
  view.addEventListener("wheel", wheel, { passive: false });
  // The panel's base takes the pointer only while zoomed (setView): fingers on it still pinch, and the wheel and a drag
  // that passes over it still move the chart.
  panelBase.addEventListener("pointerdown", fingerDown);
  panelBase.addEventListener("pointermove", pointerMove);
  panelBase.addEventListener("pointerup", release); panelBase.addEventListener("pointercancel", release);
  panelBase.addEventListener("wheel", wheel, { passive: false });
  // (Safari on a Mac: a touchpad's pinch comes as gesture events, not as the wheel; a touch device's fingers are the pinch above)
  if (!ui.touch && globalThis.GestureEvent) for (const el of [view, panelBase]) {
    el.addEventListener("gesturestart", (e) => { e.preventDefault(); gesture = ready() ? { z: zoom, x: panX, s: top(), at: inView(e.clientX, e.clientY) } : null; });
    el.addEventListener("gesturechange", (e) => { e.preventDefault(); if (gesture && ready()) zoomTo(gesture.z * e.scale, gesture.at, gesture.at, gesture); });
    el.addEventListener("gestureend", (e) => { e.preventDefault(); gesture = null; });
  }
  // The player's scroll, each frame as 0x11418 runs it: the first stick (pads, PageUp / PageDown) on its pulses, else
  // the drag's flick; then, while that scroll is on, the re-selection (0x12d1c) as long as the scroll bar is on.
  // Zoomed (the port's), the stick's and the flick's distances are the screen's, the flick moves across too, and the
  // re-selection goes on wherever the view can move.
  function playerInput(dt) {
    if (!ready()) return;
    const y = stickY(globalThis.navigator?.getGamepads?.() || [], held);
    if (padRepeat.step(Math.abs(y) > STICK_DEAD, dt)) {
      const d = zoom === 1 ? null : stickTarget(0, y);
      const to = zoom === 1 ? stickTarget(Math.round(view.scrollTop), y) : d === null ? null : top() + d / zoom;
      if (to !== null) playerScroll(to);
    }
    const to = flick.step(press ? touchY(press.cur) : null, zoom === 1 ? Math.round(view.scrollTop) : top(), zoom);
    if (to !== null) playerScroll(to);
    if (zoom !== 1) { const x = flickX.step(press ? touchX(press.curX) : null, panX, zoom); if (x !== null) playerPan(x); }
    if (!player) return;
    if (zoom === 1 && zoomScrollMax(layout, 1, tall) <= 0) { player = false; return; }
    if ((!scrollTw || scrollTw.done) && (!panTw || panTw.done)) player = false;
    const r = reselect(layout, at, top(), zoom, panX, tall);
    const i = r ? index.get(`${r.row}:${r.col}`) : undefined;
    if (i !== undefined) { how = "scroll"; ui.move(i); how = "pointer"; }
  }

  // The help band: from the gallery its own guide takes the flowchart's kind (0x7624 -> 0x5c4c: the column's kind 10 goes
  // out over half a second and the new one comes in, sliding 25 units); in the story 0x1776c makes one with that kind,
  // drawn at the flowchart's fade (0x1783c -> 0x60e4) without the slide.
  const backToGame = () => { if (opts.back) opts.back(); else if (fromTitle) ui.title(); else ui.system({ flowBack: true }); };
  const kind = helpKind(layout);
  const help = element("div", "fc-help gl-guide");
  ui.helpBar(help, helpEntries(kind), kind);
  page.append(help);
  let guide = null;
  if (opts.gallery) {
    guide = new GuideFx(opts.guide?.kind ?? kind);
    if (opts.guide?.alpha > 0) { guide.alpha = opts.guide.alpha; guide.phase = "on"; guide.hold = Infinity; }
    if (opts.reopened) { guide.kind = kind; guide.alpha = 1; guide.phase = "on"; guide.hold = Infinity; }
    guide.to(kind);
  }
  let helpShown = null;
  function drawHelp(alpha) {
    if (guide && guide.kind !== helpShown) { helpShown = guide.kind; help.textContent = ""; ui.helpBar(help, helpEntries(guide.kind), guide.kind); }
    help.style.opacity = String(alpha);
    help.style.transform = guide ? `translateY(${guide.offset}px)` : "";
  }

  // Opening (state 0 / 1, 0x110d4 / 0x1121c), in the game as from the gallery: the pieces come in from 0 to 1 over half a
  // second, eased in; input waits for it (state 2), and then the selection is made again (0x10ba4). From the gallery its
  // column leaves meanwhile, eased out (0x8400 -> 0x7624). Closing (state 5, 0x11bec): the day titles go at once and the
  // rest from 1 to 0 over half a second, eased out; from the gallery the gallery fades the page out (0x7624, 0x6bbc).
  const fading = [...page.children].filter((e) => !e.classList.contains("menubg") && !e.classList.contains("fc-help"));
  let fx = fadeIn(), closing = false;
  if (opts.reopened) fx.step(Infinity);
  let replaying = false;
  const ready = () => fx.done && !closing && !replaying;
  const setAlpha = () => { for (const e of fading) e.style.opacity = String(fx.value); if (!guide) drawHelp(fx.value); };
  setAlpha();
  if (guide) drawHelp(guide.alpha);
  // (the pointer waits for the fade in; drawn again after a question there is none, so it works at once)
  if (!fx.done) page.style.pointerEvents = "none";
  if (opts.ghost) ui.ghost(opts.ghost, fadeOut());
  let opened = false;
  ui.animate((dt) => {
    if (!fx.done) {
      fx.step(dt); setAlpha();
      if (fx.done && closing) { closing.then(); return; }
      if (fx.done) page.style.pointerEvents = "";
    }
    if (guide) { guide.step(dt); drawHelp(guide.alpha); }
    if (fx.done && !opened && !closing) {
      opened = true;
      const i = index.get(`${at.row}:${at.col}`);
      if (i !== undefined && !keep) { how = "key"; ui.select(i); how = "pointer"; }
    }
    playerInput(dt);
    if (scrollTw || panTw) {
      const s = scrollTw ? scrollTw.step(dt) : top(), x = panTw ? panTw.step(dt) : panX;
      if (scrollTw?.done) scrollTw = null;
      if (panTw?.done) panTw = null;
      setView(s, x);
    }
    if (flashAt < 30) { flashAt += dt; flash.style.opacity = String(cgCursorLight(flashAt)); }
    sinceChange += dt;
    fades = fades.filter((f) => {
      const v = f.tw.step(dt);
      for (const e of f.els) e.style.opacity = String(v);
      if (f.tw.done && f.remove) for (const e of f.els) e.remove();
      return !f.tw.done;
    });
  });
  // A replay from the gallery's flowchart (0x11418 -> 0x5040, then the column's state 6, 0x7918): a black cover over
  // everything goes from 0 to 1 over half a second, quadratic out, the band going as long; the menu's background goes
  // down at 0.04 a frame and the music out at 3.33 a frame. The scene starts only then (N2-57, N2-62).
  function replayOut(then) {
    replaying = true;
    const cover = element("div", "fc-replay-cover"), tw = new Tween(0, 1, 0.5, EASE.quad.out);
    page.append(cover);
    page.style.pointerEvents = "none";
    guide.hide();
    menuBg.set(REPLAY_MENU_BG);
    fadeMusicOut(vm.audio);
    ui.animate((dt) => {
      cover.style.opacity = String(tw.step(dt));
      if (tw.done && then) { const go = then; then = null; go(); }
    });
  }
  function close(then) {
    if (closing || replaying || !fx.done) return;
    for (const d of titleDays) d.group.style.visibility = "hidden";
    ui.keyFn = () => true;
    if (opts.gallery) { then(); return; }
    closing = { then };
    page.style.pointerEvents = "none";
    fx = fadeOut();
  }
  ui.backFn = () => close(() => (opts.gallery && opts.back ? opts.back({ ghost: page }) : backToGame()));

  // The first selection (0xf8fc): the requested scene's part (the game's current scene F110, the gallery's after a
  // replay, else row 0, column 0), scrolled to at once; its preview shows. The cursor shows on it if it is selectable.
  cursor.style.display = flash.style.display = "none";
  const requested = keep?.flag ?? (game ? vm.flow.current : opts.select ?? -1);
  const start = layout.rows.flatMap((r) => r.parts).find((p) => requested >= 0 && p.flag === requested);
  if (start) { at.row = start.row; at.col = start.col; }
  const first = layout.part(at.row, at.col);
  const i = index.get(`${at.row}:${at.col}`);
  if (i !== undefined) { how = "open"; ui.select(i); how = "pointer"; }
  else preview(first);
  if (keep) setView(keep.top, keep.x ?? 0, keep.zoom ?? 1);   // (No to the rewind: as it was, zoom and all)
  else if (start) {
    // (0x10d5c(0) reads the cursor's place: on a part that cannot be selected it is still at 0, so the row above comes to 4)
    const to = i !== undefined ? scrollFor(layout, at, 0, 1, tall) : Math.max(0, Math.min(zoomScrollMax(layout, 1, tall), layout.part(Math.max(0, at.row - 1), 0).y - 4));
    if (to !== null) setScroll(to);
  } else setScroll(0);
  if (shown) shown.title.style.opacity = shown.note.style.opacity = "1";
  fades = [];
  scrolled();
}
