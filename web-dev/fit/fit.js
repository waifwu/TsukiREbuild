// fit.js - how a translation's pages fit the game's text box (translator tool, Stage 0: web-dev/TRANSLATOR-TOOL-PLAN.md).
//
// /fit/?text=/assets/pt/text.json lays the pages of that text.json out with the game's own code and styles: the VM's message commands
// (op_MSG, op_MSAD, op_SELR and the variables that place blank rows and pick the window), the TextBox that sets the letters, and style.css.
// Nothing is drawn by the GPU and nothing is saved (fit.html makes storage read-only). The pages come from web-dev/data/line_map.json
// (web-dev/tools/line_map.py): each is played along every way through it the map found, and the fullest way counts.
//
//   fit.page(n)          one page: rows used, the lowest letter's bottom, and for a choice its rows' widths, for a balloon how its letters sit
//                        in the balloon's picture. ?page=n shows that page on screen (the fullest way through it).
// Checked against the game itself on 2026-11-17 (/?script=S&pc=P, the text finished): English pages of 14 and 12 rows, blank rows, glued MSADs,
// a balloon and a two-row choice, and an 11-row page and a balloon each in Portuguese (lang=pt) and Aniplex (english=aniplex), gave the same rows,
// bottoms and edges to the tenth of a pixel. The language stays English here: lang.js PT and OFFICIAL only choose the files.
//   fit.run(from, to)    pages from..to-1, in the compact form the report keeps; fit.report() the head of a report.
//
// What is measured, in stage pixels (the stage is 1920 x 1080 here, unscaled):
//   - rows: the rows from the box's top to the last letter's row (blank rows between paragraphs count). The box is 12 rows of 77.5 px from y 146,
//     so row 12's line ends at 1,076: more than 12 rows runs off the screen.
//   - bottom: the bottom of the last row's letter boxes (font ascent + descent, centred in the row), about 14 px above that row's line end.
//   - a choice: each row's letters from their first to their last (the button itself is a fixed 1,455 px), its right edge from x 264, and where
//     its rows start: a blank row under the page's text, pushed up over the text when they would pass y 1,040 (ui.js choices).
//   - a balloon (the Q&A corners): the letters against the balloon picture's opaque pixels (alpha 128 and up). Each box the layout gives
//     (in a balloon a letter's own, in the story box a row's) is checked at its corners 6 px in: "out" counts the boxes with a corner off the
//     picture, and "room" is how far the picture goes on below each box at its middle, the least of them (-1: that point is off the picture).
//     The English (Tsukihimates) has no box out in any of the 649 balloon pages, so a box out is the translation's. "width" and "right" are
//     the widest row's, from its first letter to its last.
import { LANG, ORIG, asset } from "/js/lang.js";
import { Renderer } from "/js/renderer.js";
import { Audio } from "/js/audio.js";
import { TextBox, fillSegment, BALLOON_INSIDE } from "/js/textbox.js";
import { VM } from "/js/vm.js";
import { FlowProgress } from "/js/flowchart-model.js";
import { Unlocks } from "/js/unlocks.js";
import { CHOICE, px } from "/js/uifx.js";

const q = new URLSearchParams(location.search);
const TEXT = q.get("text") || "/assets/text.json";
const MAP = q.get("map") || "/fit/line_map.json";
const out = document.getElementById("o");
const say = (s) => { out.textContent = s; };
const ROWS = 12;
const CHOICE_FLOOR = 1080 - 40;   // ui.js choices: the rows never go below this
const PLAYED = new Set(["WKST", "WKAD", "WKOR", "WNTY", "MSG", "MSAD", "SELR"]);
const WINDOW = ["F1105", "F1106", "F1107", "F1111", "F1112", "F1113"];
const IDS = /\$(\d+)/g;
const r1 = (x) => Math.round(x * 10) / 10;

if (q.get("font") === "gelasio") document.documentElement.style.setProperty("--story-font", '"Gelasio Bundled", serif');

// The engine, set up as the script smoke test sets it (web-dev/smoketest/smoketest.js): full-speed skipping, no pictures, no sound, no saving.
const gfx = new Renderer(document.getElementById("gl"));
gfx.load = () => Promise.resolve({ tex: null, w: 2, h: 2, nw: 2, nh: 2 });
const text = new TextBox();
// Balloon rows wrap inside the picture for text laid over the English (textbox.js BALLOON_INSIDE), as the game does in that language; the page
// itself runs in English, so it goes by the text: inside for any text.json but the English base, or as &balloons=inside / table says.
text.insideBalloons = q.get("balloons") ? q.get("balloons") === "inside" : TEXT !== "/assets/text.json";
const vm = new VM({ gfx, audio: new Audio(), text, onChoice: async () => 0, playMovie: async () => {}, onWait: () => {}, toast: () => {} });
say("starting the engine");
await vm.init();
vm.saveGlobals = () => {};
vm.saveRead = () => {};
vm.saveReadSoon = () => {};
vm.readBlocks = new Uint8Array(vm.readBlocks.length);
vm.flow = new FlowProgress(null);
vm.unlocks = new Unlocks(null);
vm.skip = true;
vm.skipPaced = false;
vm.audio.ctx = null;
say(`reading ${TEXT} and the line map`);
const [lines, map] = await Promise.all([fetch(TEXT).then((r) => r.json()), fetch(MAP).then((r) => r.json())]);
vm.lines = lines;
for (const p of vm.scripts.values()) p.then((s) => { delete s.wrap; }).catch(() => {});   // wrapped against the English lines before
await document.fonts.ready;
// the story's face: the original's, or a language's own (Russian's, from its stylesheet), which fonts.ready alone does not wait for: without it a
// Russian page was measured in the fallback face (2026-11-25). (Not the computed `font`: it is "" where the shorthand cannot say it all, as with
// Russian's font-kerning.)
{
  const cs = getComputedStyle(document.getElementById("text"));
  await document.fonts.load(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`).catch(() => null);
}
await Promise.all(['42px "Gelasio Bundled"', 'italic 42px "Gelasio Bundled"', '42px "SeuratPro"'].map((f) => document.fonts.load(f).catch(() => null)));

const stage = document.getElementById("stage");
const box = document.getElementById("text");
const meter = document.createElement("button");
meter.className = "choice";
meter.id = "fit-meter";
meter.style.cssText = `left:${px(CHOICE.labelX)}px;top:0;`;
stage.append(meter);

// Whether this machine has Georgia (the story's first face; without it the page falls back to the bundled Gelasio).
function hasFace(face) {
  const c = document.createElement("canvas").getContext("2d");
  const w = (f) => { c.font = f; return c.measureText("The quick brown fox jumps over the lazy dog 0123456789").width; };
  return w(`42px ${face}, monospace`) !== w("42px monospace");
}

// ---- the balloon pictures --------------------------------------------------------------------------------------------------------------
const arts = new Map();
function art(path) {
  if (!arts.has(path)) {
    arts.set(path, (async () => {
      const img = new Image();
      img.src = asset(`/assets/ui/${path}.webp`);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const a = g.getImageData(0, 0, c.width, c.height).data;
      return { w: c.width, h: c.height, solid: (x, y) => x >= 0 && y >= 0 && x < c.width && y < c.height && a[(Math.floor(y) * c.width + Math.floor(x)) * 4 + 3] >= 128 };
    })());
  }
  return arts.get(path);
}
// Each balloon style's inside (textbox.js BALLOON_INSIDE): how far a row may run from the text's left edge and stay on the picture. The picture
// and the text move together (F1106 / F1107 offset both), so this is one width per style: the least, over the rows that lie inside the picture,
// of where the picture ends to the right of the row's letter boxes (SeuratPro 42 px: row top + 18 to + 60), less 8 px. A row counts when the
// picture is under its left end and it reaches at least 3/4 of the first two rows (the "b" balloons' bottoms leave a third row a stub).
async function insideWidths() {
  const styles = vm.system.windows.styles;
  const out = {};
  for (let i = 3; i < styles.length; i++) {
    const st = styles[i];
    if (!st || !st[0]) continue;
    const pic = await art(`DISP_PARTS_JA/${st[0]}`);
    const L = st[3] * 1.5 - 3, T = st[4] * 1.5 - 11;
    const ends = [];
    for (let k = 0; k < 6; k++) {
      const y0 = T + k * 77.5 + 18, y1 = T + k * 77.5 + 60;
      if (!pic.solid(L + 8, y0) || !pic.solid(L + 8, y1)) break;
      let end = Infinity;
      for (let y = y0; y <= y1; y += 2) { let x = L + 8; while (x < pic.w && pic.solid(x, y)) x++; end = Math.min(end, x); }
      ends.push(end - L);
    }
    const base = Math.min(...ends.slice(0, 2));
    const rows = ends.filter((e, k) => k < 2 || e >= 0.75 * base);
    if (rows.length) out[i] = Math.floor(Math.min(...rows) - 8);
  }
  return out;
}
// How far a balloon's picture goes on below y at column x (stage pixels), from the picture placed at (left, top).
function below(pic, left, top, x, y) {
  let k = 0;
  while (pic.solid(x - left, y - top + k + 1)) k++;
  return pic.solid(x - left, y - top) ? k : -1;
}

// ---- one page ------------------------------------------------------------------------------------------------------------------------
function reset(page) {
  text.clear();
  text.pagePending = false;
  text.history = [];
  vm.choices = [];
  vm.trail = [];
  vm.pageEnd = false;
  vm.vars = {};
  const w = page.w || [0, 0, 0, 0, 0, 0];
  WINDOW.forEach((k, i) => { vm.vars[k] = w[i]; });
  vm.applyWindow();
}

function rowRects() {
  const rects = [];
  for (const seg of box.querySelectorAll(".seg")) {
    const second = !!seg.closest(".second");
    for (const r of seg.getClientRects()) if (r.width > 0 && r.height > 0) rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, second });
  }
  return rects;
}

async function balloonCheck(rects) {
  const pics = text.pictures();
  const out = { art: [], out: 0, room: Infinity };
  for (const [k, p] of pics.entries()) {
    if (p.full) return null;
    out.art.push(p.path.split("/").pop());
    const pic = await art(p.path);
    const mine = rects.filter((r) => r.second === (k === 1));
    // the widest row: the boxes grouped by their top
    const rows = new Map();
    for (const r of mine) {
      const t = Math.round(r.top);
      const row = rows.get(t) || { left: Infinity, right: -Infinity };
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      rows.set(t, row);
    }
    for (const row of rows.values()) {
      out.width = Math.max(out.width ?? 0, r1(row.right - row.left));
      out.right = Math.max(out.right ?? 0, r1(row.right));
    }
    for (const r of mine) {
      const pts = [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6]];
      if (pts.some(([x, y]) => !pic.solid(x - p.x, y - p.y))) out.out++;
      out.room = Math.min(out.room, below(pic, p.x, p.y, (r.left + r.right) / 2, r.bottom));
    }
  }
  if (out.room === Infinity) out.room = null;
  return out;
}

function choiceCheck(labels, next, used, pitch) {
  const rows = labels.map((label) => {
    meter.textContent = "";
    fillSegment(meter, label.replace(/@g/g, ""));
    const range = document.createRange();
    range.selectNodeContents(meter);
    const r = range.getBoundingClientRect();
    return { width: r1(r.width), right: r1(r.right) };
  });
  const top = next + (used ? pitch : 0);
  return { rows, room: r1(CHOICE_FLOOR - (top + pitch * labels.length)) };
}

// The ways through a page as the map gives them, or the page as it stands.
const runsOf = (p) => p.runs || [[[p.a, p.b]]];

async function playWay(page, runs) {
  reset(page);
  const s = vm.script;
  const ids = [];
  const choices = [];
  const measureChoice = () => {
    const rows = vm.choiceRows();
    if (!rows.length) return;
    const { pitch, next, used } = text.rows();
    choices.push({ ids: vm.__selr.splice(0), ...choiceCheck(rows.map((r) => r.label), next, used, pitch) });
    vm.choices = [];
  };
  vm.__selr = [];
  for (const [x, y] of runs) {
    for (let pc = x; pc < y; pc++) {
      const op = s.ops[pc];
      if (op[0] === "SELD") { measureChoice(); continue; }
      if (op[0] === "CLO2") { text.clear(); continue; }
      if (!PLAYED.has(op[0])) continue;
      if (op[0] === "MSG" || op[0] === "MSAD" || op[0] === "SELR") {
        const found = [...op.slice(1).join(",").matchAll(IDS)].map((m) => Number(m[1]));
        ids.push(...found);
        if (op[0] === "SELR") vm.__selr.push(...found);
      }
      vm.pc = pc + 1;
      const r = vm[`op_${op[0]}`](...op.slice(1));
      if (r && r.then) await r;
    }
  }
  measureChoice();
  const cs = getComputedStyle(box);
  const top = parseFloat(cs.top), pitch = parseFloat(cs.lineHeight);
  const rects = rowRects();
  // (QA_09's one page with a second balloon: its line is placed in that balloon, which the balloon check covers; rows count the first)
  const own = rects.filter((r) => !r.second);
  const bottom = own.length ? Math.max(...own.map((r) => r.bottom)) : null;
  const rows = bottom === null ? 0 : Math.ceil((bottom - top) / pitch - 1e-6);
  const result = { ids, rows, bottom: bottom === null ? null : r1(bottom), top: r1(top) };
  if (text.balloon) result.balloon = await balloonCheck(rects);
  if (choices.length) result.choices = choices;
  return result;
}

// A page: every way through it, and the fullest. `keep` leaves the fullest way on screen.
async function page(n, keep = false) {
  const p = map.pages[n];
  vm.script = await vm.getScript(p.s);
  vm.scriptIndex = p.s;
  const ways = [];
  for (const runs of runsOf(p)) ways.push(await playWay(p, runs));
  const worst = ways.reduce((a, b) => (fuller(b, a) ? b : a));
  if (keep && ways.length > 1) await playWay(p, runsOf(p)[ways.indexOf(worst)]);
  return { page: n, s: p.s, k: p.k, ways: ways.length, ...worst };
}
const fuller = (a, b) => a.rows > b.rows || (a.rows === b.rows && (a.bottom ?? 0) > (b.bottom ?? 0))
  || (a.balloon && b.balloon && a.balloon.room !== null && b.balloon.room !== null && a.balloon.room < b.balloon.room);

// The compact rows a report keeps (numbers and line ids only): [page, rows, bottom, ways] for every page, and the choices and balloons apart.
async function run(from = 0, to = map.pages.length) {
  const pages = [], choices = [], balloons = [], errors = [];
  for (let n = from; n < Math.min(to, map.pages.length); n++) {
    try {
      const r = await page(n);
      pages.push([n, r.rows, r.bottom, r.ways]);
      if (r.choices) for (const c of r.choices) choices.push({ page: n, ids: c.ids, widths: c.rows.map((x) => x.width), right: Math.max(...c.rows.map((x) => x.right)), room: c.room });
      if (r.balloon) balloons.push({ page: n, art: r.balloon.art, out: r.balloon.out, room: r.balloon.room, rows: r.rows, width: r.balloon.width ?? null, right: r.balloon.right ?? null });
    } catch (e) {
      errors.push({ page: n, error: String(e?.message || e).slice(0, 160) });
    }
    if (n % 200 === 0) say(`page ${n} of ${map.pages.length}`);
  }
  return { pages, choices, balloons, errors };
}

async function report() {
  const cs = getComputedStyle(box);
  return {
    format: 1,
    text: TEXT,
    lines: lines.length,
    map: map.source.sha1,
    pageCount: map.pages.length,
    lang: LANG,
    orig: ORIG,
    font: { story: getComputedStyle(document.documentElement).getPropertyValue("--story-font").trim(), georgia: hasFace("Georgia"), forced: q.get("font") || null },
    box: { top: parseFloat(cs.top), left: parseFloat(cs.left), width: parseFloat(cs.width), pitch: parseFloat(cs.lineHeight), rows: ROWS, end: parseFloat(cs.top) + ROWS * parseFloat(cs.lineHeight) },
    stage: (({ left, top, width, height }) => ({ left, top, width, height }))(stage.getBoundingClientRect()),
    balloons: text.insideBalloons ? "inside" : "table",
    userAgent: navigator.userAgent,
    // textbox.js's table against the pictures as they are
    insideTable: JSON.stringify(await insideWidths()) === JSON.stringify(Object.fromEntries(Object.entries(BALLOON_INSIDE).map(([k, v]) => [k, v]))),
  };
}

window.fit = { page, run, report, insideWidths, map, vm, text, ready: true };
const show = q.get("page");
if (show !== null) {
  const r = await page(Number(show), true);
  say(JSON.stringify({ ...r, ids: r.ids.length }, null, 1));
} else say(`ready: ${map.pages.length} pages, text ${TEXT} (${lines.length} lines), language ${LANG}. fit.page(n), fit.run(from, to), fit.report()`);
