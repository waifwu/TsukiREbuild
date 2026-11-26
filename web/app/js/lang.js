// lang.js - the language the game is played in: English (the translation, what the port's files are made from), Japanese (the original game) or Chinese
// (a fan translation of the original game: 月姬REMAKE汉化补丁 v2.13, by Letdo1945).
//
// Japanese is not a second copy of the game. web/assets/ja holds only what the original has that the translation changed (web-dev/tools/build_ja.py): the
// dialogue lines, the scripts the translation rewrote, the system's words, and the interface art, pictures and movies that carry text. ja/index.json lists
// those files, and asset() gives the Japanese file's address where there is one and the shared file's everywhere else.
//
// Chinese is laid over Japanese. Its patch changes files of the original and none of its code, so the game runs it as it runs Japanese: the engine sets
// and wraps the text the same way, the scripts are the original's, and the pictures it did not redraw are the original's. web/assets/zh holds only what
// the patch shows that Japanese does not (web-dev/tools/build_zh.py: the lines, with the rows the original engine gives them, the system's words, the art
// it redrew, two chapter titles, its faces, the prologue's subtitles); a file is asked for there first, then under ja/, then where it always was. ORIG
// names what the two share, the original game's way of setting its text; JA and ZH what is each one's own (words, faces).
//
// Portuguese is a fan translation of the English's kind, not the original's: the Brazilian Portuguese of HanabiWorks (hanabiworks.github.io/tsukihime; its
// files from github.com/ThiagoKrz/TsukihimeRE-PTBR), made with the tool the English was made with (deepLuna). It is unfinished, so web/assets/pt/text.json (web-dev/tools/build_pt.py) has the Portuguese of
// the scenes it has and the English line everywhere else: the story goes on in English where the Portuguese ends. It has nothing but lines: the
// scripts, pictures, menus and the page's words are the English ones, its text is wrapped as the English is (reflow.js), and a save goes between the
// two as it stands (scriptsOf). Its folder is fetched only by those who play it: on the site once it is the language, in the apps when it is first
// chosen (update.js LANG_DIRS). A device in Portuguese starts in it (deviceLang), and the opening page's own words are in Portuguese too (SITE_PT).
//
// Russian is Living FLCL's fan translation (web-dev/tools/build_ru.py, from their patch for the port's Windows app): of the English's kind too, but with
// scripts of its own where its sentences are split otherwise than the English ones (ru/scripts: a save is carried between the two by its line, as
// between English and Japanese), its own interface art, chapter titles and prologue, and a face of its own for the story (style.css html[lang="ru"]).
// It is unfinished: the scenes it has not (Ciel's day 14 after the branch, day 15, the Q&A corners) are the English ones, script and lines.
//
// The language is chosen on the opening page (home.js, LANGUAGE) and kept in this browser; until one is chosen it is the device's (deviceLang: the
// browser's own list of languages), English where that is none of the three. It is read once, as the page loads: every table is fetched in that language
// from the start, so changing it loads the page again. `?lang=ja` (or en) in the address chooses it for that visit. The opening page is in the same
// language as the game (UILANG, sitewords.js).
// The Android and desktop apps are built in English, without web/assets/ja, zh and pt: a language's folders are downloaded into the app when its plate is
// first chosen there (home.js, update.js langPlan), and the choice is kept only once they are in. Should they be gone after all (an update the app
// took out again), the app goes back to English (langReady). So an app plays the device's language only once it has been chosen; its opening page is in
// the device's language from the start (UILANG).
import { APP } from "./apphost.js";
import { codesOf, deviceCodes, htmlLangOf, isOriginal, layersOf, rowOf, scriptsOf as scriptsIn } from "./languages.js";

// The languages that can be chosen, from the table (languages.js): adding one is a row there.
export const LANGS = codesOf();
const KEY = "tsuki.lang";

// The language chosen in this browser, or null.
export function chosenLang(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(KEY); return LANGS.includes(v) ? v : null; } catch { return null; }
}
export const storedLang = (storage = globalThis.localStorage) => chosenLang(storage) || "en";
// The device's language: the first of the browser's languages, in its order of preference, that a language of the table starts in (its `device`; any
// Chinese: the one Chinese here is the simplified patch's; any Portuguese: the one Portuguese is Brazil's), else English.
const DEVICE = deviceCodes();
export function deviceLang(nav = globalThis.navigator) {
  const list = nav?.languages?.length ? nav.languages : [nav?.language || ""];
  for (const l of list) {
    const primary = String(l || "").toLowerCase().split(/[-_]/)[0];
    if (DEVICE.includes(primary)) return primary;
  }
  return "en";
}
export function langOf(search = "", storage = globalThis.localStorage, app = APP, nav = globalThis.navigator) {
  if (app) return storedLang(storage);   // (in the apps only what was chosen once its files were in)
  const asked = new URLSearchParams(search).get("lang");
  return LANGS.includes(asked) ? asked : chosenLang(storage) || deviceLang(nav);
}
export const LANG = langOf(globalThis.location?.search || "");
export const JA = LANG === "ja";
export const ZH = LANG === "zh";
export const PT = LANG === "pt";
export const RU = LANG === "ru";
export const ORIG = isOriginal(LANG);   // (Japanese and Chinese)
// The scripts a language plays (the table's `scripts`): Portuguese's are the English ones (its folder has only lines), so a record made in one of the two
// stands at the same command in the other and is not carried (vm.js restore).
export const scriptsOf = (lang) => scriptsIn(lang);
// The language of the opening page's own words (sitewords.js): the game's, and in an app where none has been chosen yet, the device's.
export const uiLangOf = (lang = LANG, storage = globalThis.localStorage, app = APP, nav = globalThis.navigator) => (app && !chosenLang(storage) ? deviceLang(nav) : lang);
export const UILANG = uiLangOf();

// English has two translations: the Tsukihimates fan translation, what the port's files are made from (the default, and the one recommended on
// PLAY), and the official one of the global edition, Aniplex's (web-dev/tools/build_aniplex.py: web/assets/aniplex holds only its lines, numbered as
// the port's). Which one is kept apart from the language, in `tsuki.english`, so that 日本語 and back keeps it; `?english=aniplex` (or tsukihimates)
// chooses it for one visit. `chosen` is false until the player has picked one on LANGUAGE (home.js). The folder is not published on the site (the
// whole official script): where it is missing, the list does not come and the game plays the fan translation (langReady), and LANGUAGE offers no choice.
export const ENGLISHES = ["tsukihimates", "aniplex"];
const EN_KEY = "tsuki.english";
export function storedEnglish(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(EN_KEY); return ENGLISHES.includes(v) ? { english: v, chosen: true } : { english: "tsukihimates", chosen: false }; }
  catch { return { english: "tsukihimates", chosen: false }; }
}
export function englishOf(search = "", storage = globalThis.localStorage, app = APP) {
  const asked = app ? null : new URLSearchParams(search).get("english");
  return ENGLISHES.includes(asked) ? asked : storedEnglish(storage).english;
}
export const ENGLISH = englishOf(globalThis.location?.search || "");
export const OFFICIAL = LANG === "en" && ENGLISH === "aniplex";
// The folders laid over the shared files, lowest first (the table's `layers`; English's official translation is aniplex/).
export const LAYERS = layersOf(LANG, OFFICIAL);

// Keeps the choice for the next load. Returns whether it is another language than the one this page was loaded in.
export function chooseLang(lang, storage = globalThis.localStorage) {
  if (!LANGS.includes(lang)) return false;
  try { storage?.setItem(KEY, lang); } catch { /* kept for this visit only */ }
  return lang !== LANG;
}
// The English translation, kept the same way (and English with it). Returns whether the page must load again to show it.
export function chooseEnglish(english, storage = globalThis.localStorage) {
  if (!ENGLISHES.includes(english)) return false;
  try { storage?.setItem(EN_KEY, english); } catch { /* kept for this visit only */ }
  const langChanged = chooseLang("en", storage);
  return langChanged || english !== ENGLISH;
}

// What each folder has of its own: path -> the folders that have it, lowest first (paths under /assets/ja/, /assets/zh/).
let own = new Map();
export function setOwn(files, layer = "ja") { own = new Map(); addOwn(files, layer); }
export function addOwn(files, layer) { for (const f of files || []) { const at = own.get(f); if (at) at.push(layer); else own.set(f, [layer]); } }
export const has = (rel) => own.has(rel);
// The addresses of a table each folder lays over the shared one, lowest first (system.json, images.json: vm.js init).
export const overlays = (rel) => (own.get(rel) || []).map((layer) => packed.get(`${layer}/${rel}`) || `/assets/${layer}/${rel}`);
// A file corrected after the site first served it. The game's own files are stored to be kept for 30 days and never
// asked about again (`immutable`), which is right for files that never change but leaves a corrected one unseen until
// a browser's copy expires. Giving it the next number here asks for it at `...?v=<n>` instead, an address no browser
// has, so everyone has it at once; the stored file keeps its name. Japanese's own copy of the same path is marked too.
// Only the paths that pass through `asset` are covered: pictures, interface art and movies, not sounds, whose fetches
// would have to be wrapped here first.
const REVISED = {
  "img/IMG0316.avif": 2,   // the tree's cut-out, so the Ciel Day 9 scene has no bright rectangles (GitHub issue 7)
  "movie/phasetitle_14_01.mp4": 2,   // Russian's chapter title re-encoded by its translators (AV1; it was H.264), 2026-11-25
};

// A script as the language has it. Chinese's scripts are Japanese's, but for the rows of the messages laid out together with others (the engine's own,
// which hold the lines' text): zh/rows.json has those by script number, where they are not Japanese's (null: the script has none). vm.js getScript.
let rowsTable = null;
export async function ownRows(script, i) {
  if (!own.has("rows.json")) return script;
  rowsTable ||= fetch(asset("/assets/rows.json")).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const table = await rowsTable;
  if (!(String(i) in table)) return script;
  const out = { ...script };
  if (table[i]) out.rows = table[i]; else delete out.rows;
  return out;
}

// The address to ask for: a file under /assets/ is the one of the same path in the highest folder that has it (/assets/zh/, /assets/ja/); in the apps,
// where that folder's file came in a pack, the address of its slice of the pack (loadPacks).
export function asset(url) {
  if (!url.startsWith("/assets/")) return url;
  const rel = url.slice(8);
  const at = own.size ? own.get(rel) : null;
  if (at && packed.size) {
    const slice = packed.get(`${at[at.length - 1]}/${rel}`);
    if (slice) return slice;
  }
  const out = at ? `/assets/${at[at.length - 1]}/${rel}` : url;
  const rev = REVISED[rel];
  return rev ? `${out}${out.includes("?") ? "&" : "?"}v=${rev}` : out;
}

// ---- the apps' packs ------------------------------------------------------------------------------------------------------------------------------
// In the Android and desktop apps a language folder's small files come in packs (web-dev/tools/build_langpacks.py): the apps download one file at a time,
// about 150 ms a request, so a few packs come far sooner than hundreds of files. A pack is its files end to end; pack/index.json says where each is.
// The page reads a file out of its pack: the language in use has its packs opened as the page loads (loadPacks, in langReady), so asset() can give a
// file's address at once, a blob: address of its slice; another language's file (a save made in it: vm.js scriptIn) is read from its pack when asked
// (fetchOwn). An app that holds a language without packs (an update from before them) has the files themselves, and asks for those as before; a pack
// that will not come leaves its files to be asked for themselves too. The site never uses packs: a browser asks for each picture when a scene needs it.
const TYPES = { json: "application/json", avif: "image/avif", webp: "image/webp", png: "image/png", jpg: "image/jpeg", mp4: "video/mp4", ogg: "audio/ogg",
  woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };
const typeOf = (rel) => TYPES[rel.split(".").pop().toLowerCase()] || "application/octet-stream";
const packed = new Map();       // "<layer>/<file>" -> the blob: address of its slice
const packIndex = new Map();    // layer -> a promise of { file: [pack, at, size] }, or of null where the folder has no packs
const packData = new Map();     // "<layer>/<pack>" -> a promise of its Blob
function packsOf(layer, get = fetch) {
  if (!packIndex.has(layer)) {
    packIndex.set(layer, get(`/assets/${layer}/pack/index.json`).then((r) => (r.ok ? r.json() : null)).then((ix) => {
      if (!ix || ix.version !== 1 || !Array.isArray(ix.packs)) return null;
      const where = {};
      for (const [name, list] of ix.packs) {
        let at = 0;
        for (let k = 0; k < list.length; k += 2) { where[list[k]] = [name, at, list[k + 1]]; at += list[k + 1]; }
      }
      return where;
    }).catch(() => null));
  }
  return packIndex.get(layer);
}
function packBlob(layer, name, get = fetch) {
  const key = `${layer}/${name}`;
  if (!packData.has(key)) packData.set(key, get(`/assets/${layer}/pack/${name}`).then((r) => { if (!r.ok) throw new Error(`no pack ${name}`); return r.blob(); }));
  return packData.get(key);
}
// Every file of `layer`'s packs given its address (asset). Resolves to how many.
export async function loadPacks(layer, get = fetch) {
  const where = await packsOf(layer, get);
  if (!where) return 0;
  const names = [...new Set(Object.values(where).map((w) => w[0]))];
  const blobs = new Map(await Promise.all(names.map(async (n) => [n, await packBlob(layer, n, get).catch(() => null)])));
  let n = 0;
  for (const [rel, [name, at, size]] of Object.entries(where)) {
    const blob = blobs.get(name);
    if (!blob) continue;
    packed.set(`${layer}/${rel}`, URL.createObjectURL(blob.slice(at, at + size, typeOf(rel))));
    n++;
  }
  return n;
}
// A language folder's file (url: /assets/<folder>/<file>) as fetch() gives it: out of its pack in the apps where it is in one, else the file itself.
export async function fetchOwn(url, get = fetch, app = APP) {
  const m = /^\/assets\/([a-z]+)\/(.+)$/.exec(url);
  if (app && m) {
    const key = `${m[1]}/${m[2]}`;
    if (packed.has(key)) return get(packed.get(key));
    const w = (await packsOf(m[1], get))?.[m[2]];
    if (w) {
      try { const blob = await packBlob(m[1], w[0], get); return new Response(blob.slice(w[1], w[1] + w[2], typeOf(m[2]))); } catch { /* the file itself */ }
    }
  }
  return get(url);
}

// Resolved once the lists are in (at once in English). A list that does not come leaves the game in the files below it.
export const langReady = (async () => {
  if (!LAYERS.length || typeof fetch !== "function") return;
  const lists = await Promise.all(LAYERS.map((layer) => fetch(`/assets/${layer}/index.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (APP && lists.some((list) => !list) && typeof location !== "undefined") {
    // an app without the language's files: back to English (an app not yet updated to have the official English: back to the fan one), before
    // anything is drawn
    if (OFFICIAL) chooseEnglish("tsukihimates"); else chooseLang("en");
    location.reload();
    await new Promise(() => {});
  }
  if (!APP && rowOf(LANG)?.gated && lists.some((list) => !list) && typeof location !== "undefined") {
    // the site, a language not yet released whose folder is not here (the table's `gated`): English. Asked for by the address, the address without it
    // (the language kept stays); kept, English kept in its place.
    const u = new URL(location.href);
    if (u.searchParams.get("lang") === LANG) u.searchParams.delete("lang"); else chooseLang("en");
    location.replace(u);
    await new Promise(() => {});
  }
  lists.forEach((list, k) => addOwn(list?.files, LAYERS[k]));
  if (APP) await Promise.all(LAYERS.map((layer) => loadPacks(layer)));   // (in the apps: the language's small files from its packs)
  if (typeof document !== "undefined" && htmlLangOf(LANG) !== "en") document.documentElement.lang = htmlLangOf(LANG);   // (the table's `html`)
  if (ORIG && typeof document !== "undefined") {
    // html.ja: the original's way of setting text (style.css), in both; html.zh: Chinese's faces over it
    document.documentElement.classList.add("ja");
    if (ZH) document.documentElement.classList.add("zh");
    localizeStyles();
  }
  if (RU && typeof document !== "undefined") {
    // Russian's own interface art where the style sheets name the shared one (its story face: style.css html[lang="ru"], fetched in main.js)
    localizeStyles();
  }
})();

// The style sheets name interface art by its shared address (the text window, the wait marks, the save rows ...). Each such picture the language has of its
// own is named again here, rule by rule.
const ART = /url\((["']?)(?:https?:\/\/[^\/"')]+)?(\/assets\/[^"')]+)\1\)/g;   // (a browser may give the address back whole)
export function localizeStyles(doc = document) {
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.style) { walk(rule.cssRules); continue; }
      if (!rule.style) continue;
      for (const prop of ["background-image", "border-image-source"]) {
        const v = rule.style.getPropertyValue(prop);
        if (!v || !v.includes("/assets/")) continue;
        const next = v.replace(ART, (m, q, url) => `url("${asset(url)}")`);
        if (next !== v) rule.style.setProperty(prop, next, rule.style.getPropertyPriority(prop));
      }
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* a sheet from elsewhere */ }
  }
}
