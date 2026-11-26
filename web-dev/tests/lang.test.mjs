// The language switch: English (the translation), Japanese (the original game) or Chinese (the Chinese fan patch of the original), web/app/js/lang.js,
// langsave.js, and the original engine's rows (web-dev/tools/build_ja.py, build_zh.py, web-dev/data/ja_rows.json, zh_rows.json). The last tests read the
// generated files when they are there.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const store = (init = {}) => ({ s: { ...init }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });
globalThis.localStorage = store();
const { LANGS, langOf, storedLang, chooseLang, asset, setOwn, addOwn, has, overlays, LANG, ORIG, LAYERS, ENGLISHES, ENGLISH, OFFICIAL, storedEnglish, englishOf, chooseEnglish, PT, scriptsOf } = await import("../../web/app/js/lang.js");
const { mapPc, carryPoint, noteLine } = await import("../../web/app/js/langsave.js");
const { ROW, SOFT, parseMarkup, plain } = await import("../../web/app/js/textbox.js");

const ASSETS = new URL("../../web/assets/", import.meta.url);
const read = (rel) => JSON.parse(readFileSync(new URL(rel, ASSETS), "utf8"));
const there = (rel) => existsSync(new URL(rel, ASSETS));

test("the language is English unless Japanese or Chinese was chosen; the address can name one for a visit", () => {
  assert.deepEqual(LANGS, ["en", "ja", "zh", "pt", "ru"]);
  assert.equal(LANG, "en");
  assert.equal(ORIG, false);
  assert.deepEqual(LAYERS, []);
  assert.equal(storedLang(store({ "tsuki.lang": "zh" })), "zh");
  assert.equal(langOf("?lang=zh", store({ "tsuki.lang": "ja" })), "zh");
  assert.equal(storedLang(store()), "en");
  assert.equal(storedLang(store({ "tsuki.lang": "ja" })), "ja");
  assert.equal(storedLang(store({ "tsuki.lang": "fr" })), "en");
  assert.equal(langOf("?lang=ja", store()), "ja");
  assert.equal(langOf("?lang=en", store({ "tsuki.lang": "ja" })), "en");
  assert.equal(langOf("?lang=xx&mute", store({ "tsuki.lang": "ja" })), "ja");
  const s = store();
  assert.equal(chooseLang("ja", s), true);       // another language than this page's: it is loaded again
  assert.equal(s.s["tsuki.lang"], "ja");
  assert.equal(chooseLang("en", s), false);
  assert.equal(chooseLang("de", s), false);
  assert.equal(s.s["tsuki.lang"], "en");
});

test("English is the Tsukihimates translation unless Aniplex's was chosen, kept apart from the language; not chosen until the player picks one", async () => {
  assert.deepEqual(ENGLISHES, ["tsukihimates", "aniplex"]);
  assert.equal(ENGLISH, "tsukihimates");
  assert.equal(OFFICIAL, false);
  assert.deepEqual(storedEnglish(store()), { english: "tsukihimates", chosen: false });
  assert.deepEqual(storedEnglish(store({ "tsuki.english": "aniplex" })), { english: "aniplex", chosen: true });
  assert.deepEqual(storedEnglish(store({ "tsuki.english": "tsukihimates" })), { english: "tsukihimates", chosen: true });
  assert.deepEqual(storedEnglish(store({ "tsuki.english": "other" })), { english: "tsukihimates", chosen: false });
  assert.equal(englishOf("?english=aniplex", store(), null), "aniplex", "the address, for one visit");
  assert.equal(englishOf("?english=aniplex", store(), "android"), "tsukihimates", "but not in the apps");
  assert.equal(englishOf("", store({ "tsuki.english": "aniplex" }), "desktop"), "aniplex");
  const s = store({ "tsuki.lang": "ja" });
  assert.equal(chooseEnglish("aniplex", s), true, "another translation, and English again: loaded again");
  assert.deepEqual(s.s, { "tsuki.lang": "en", "tsuki.english": "aniplex" });
  const t = store();
  assert.equal(chooseEnglish("tsukihimates", t), false, "the one this page shows: kept as chosen, nothing to load");
  assert.equal(t.s["tsuki.english"], "tsukihimates");
  assert.equal(chooseEnglish("fr", t), false);
  const lang = readFileSync(new URL("../../web/app/js/lang.js", import.meta.url), "utf8");
  assert.match(lang, /export const OFFICIAL = LANG === "en" && ENGLISH === "aniplex";/, "only English shows it");
  // laid over the shared files as a language folder is (the folders from the table, languages.js)
  assert.match(lang, /export const LAYERS = layersOf\(LANG, OFFICIAL\);/);
  const { layersOf } = await import("../../web/app/js/languages.js");
  assert.deepEqual(["en", "ja", "zh", "pt"].map((c) => layersOf(c)), [[], ["ja"], ["ja", "zh"], ["pt"]]);
  assert.deepEqual(layersOf("en", true), ["aniplex"]);
  assert.match(readFileSync(new URL("../../web/app/js/savefile.js", import.meta.url), "utf8"), /"tsuki\.lang", "tsuki\.english",/, "kept by the browser, not in the save file");
});

test("LANGUAGE: English's two translations shown under the three while the game is in English, Tsukihimates recommended", () => {
  const home = readFileSync(new URL("../../web/app/js/home.js", import.meta.url), "utf8");
  assert.match(home, /export const EN_PLATES = \[\{ english: "tsukihimates", plate: "TSUKIHIMATES" \}, \{ english: "aniplex", plate: "ANIPLEX" \}\];/);
  assert.match(home, /Tsukihimates \(the fan translation\) is recommended\./);
  assert.doesNotMatch(home, /enOpen|pressEnglish/, "nothing to open: the user, 2026-11-16: \"keep this open all the time\"");
  assert.match(home, /plateRow\(langPlates, langSheet, \(l\) => l\.lang === LANG, \(l\) => setLang\(l\.lang\)\)/, "ENGLISH plays it in the translation lit");
  assert.match(home, /if \(LANG === "en" && official\) \{\n[^\n]*\n\s+const pick = el\("div", "hm-en"\);/, "the user, 2026-11-16: \"show it only when on english\"");
  assert.match(home, /plateRow\(EN_PLATES, enSheet, \(l\) => l\.english === ENGLISH, \(l\) => setEnglish\(l\.english\)\)/);
  assert.match(home, /const officialThere = fetch\("\/assets\/aniplex\/index\.json"\)\.then\(\(r\) => r\.ok\)\.catch\(\(\) => false\);/, "only where the official English's folder is (it is not published)");
  assert.match(home, /if \(LANG === "en" && official\) \{/);
});

test("Aniplex's English has a line for every number of the port's, in markup the text box reads", { skip: !there("aniplex/index.json") }, () => {
  assert.deepEqual(read("aniplex/index.json"), { files: ["text.json"] });
  const lines = read("aniplex/text.json"), port = read("text.json");
  assert.equal(lines.length, port.length);
  assert.ok(lines.filter((l) => l.trim()).length > port.length - 100, "nearly every line has words");
  const marks = new Set(lines.flatMap((l) => l.match(/@[a-z]|\[[a-z]+\d*\]/g) || []));
  for (const m of marks) assert.ok(["@t", "@b", "@k", "[ber00]", "[zap00]"].includes(m), `${m}: a mark parseMarkup does not read`);
  // no line breaks of its own, the text box wraps it; but the 512 corner lines the official scripts break from the next one ("$a^$b") end in the
  // break the port's scripts lost (build_aniplex.py, balloon-rows.test.mjs)
  const broken = lines.filter((l) => l.includes("\n"));
  assert.equal(broken.length, 512);
  assert.ok(broken.every((l) => l.indexOf("\n") === l.length - 1), "only a break at the end");
  const italic = lines.filter((l) => /[\uE020-\uE07E]/.test(l)).length;
  assert.ok(italic > 1000, "its italics, as the fan translation writes them");
  assert.ok(parseMarkup(lines.find((l) => /[\uE041-\uE05A]/.test(l))).some((p) => p.i), "read as italics");
});

test("Portuguese: a fourth language, its lines only, a Portuguese device's own; a save goes between it and English as it stands", async () => {
  assert.equal(PT, false);
  assert.equal(langOf("?lang=pt", store()), "pt");
  assert.equal(storedLang(store({ "tsuki.lang": "pt" })), "pt");
  const s = store();
  assert.equal(chooseLang("pt", s), true);
  assert.equal(s.s["tsuki.lang"], "pt");
  const { deviceLang } = await import("../../web/app/js/lang.js");
  assert.equal(deviceLang({ languages: ["pt-BR", "en"] }), "pt", "a device in Portuguese starts in it (the user, 2026-11-17)");
  assert.equal(langOf("", store(), null, { languages: ["pt-BR"] }), "pt");
  assert.equal(langOf("", store({ "tsuki.lang": "en" }), null, { languages: ["pt-BR"] }), "en", "a choice wins");
  assert.equal(scriptsOf("pt"), "en");
  assert.equal(scriptsOf(undefined), "en");
  assert.equal(scriptsOf("ja"), "ja");
  assert.equal(scriptsOf("zh"), "zh", "Chinese is still carried from Japanese's scripts as before");
  assert.match(readFileSync(new URL("../../web/app/js/vm.js", import.meta.url), "utf8"), /if \(scriptsOf\(s\.lang\) !== scriptsOf\(LANG\)\) s = await this\.carry\(s\);/);
  const H = await import("../../web/app/js/home.js");
  assert.deepEqual(H.LANG_PLATES.at(3), { lang: "pt", plate: "PORTUGUÊS" }, "after the first three, which keep their places on the plate sheet");
  // only those who play it fetch it (the user, 2026-11-17: "make sure only people who select that download it"): the opening page asks nothing of
  // pt/, the site fetches its lines only as a layer of the language in use, and the apps are built without it and download it when it is chosen
  const home = readFileSync(new URL("../../web/app/js/home.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /assets\/pt\//, "the opening page fetches nothing of Portuguese's");
  assert.equal(LAYERS.includes("pt"), false, "English here: no Portuguese layer");
  const U = await import("../../web/app/js/update.js");
  assert.deepEqual(U.LANG_DIRS.pt, ["pt"]);
  assert.equal(U.LANG_NAMES.pt, "Portuguese");
  assert.deepEqual((await import("../../web/app/js/languages.js")).foldersOf(), ["ja", "zh", "pt", "ru"], "the apps are built without it (app_manifest.py reads the same table)");
  assert.ok(H.LANG_NOW.pt);
});

test("Portuguese's lines: one for every number of the port's, the English wherever the translation has no scene, in markup the text box reads", { skip: !there("pt/index.json") }, () => {
  assert.deepEqual(read("pt/index.json"), { files: ["text.json"] });
  const pt = read("pt/text.json"), en = read("text.json");
  assert.equal(pt.length, en.length);
  const changed = pt.filter((l, i) => l !== en[i]).length;
  assert.ok(changed > 20000 && changed < en.length * 0.6, `${changed} lines in Portuguese`);
  for (const l of pt) assert.ok(!/%\{[^}]*\}|[\t\r]/.test(l), `a code or tab left: ${JSON.stringify(l.slice(0, 60))}`);
  const marks = new Set(pt.flatMap((l) => l.match(/@[a-z]|\[[a-z]+\d*\]/g) || []));
  for (const m of marks) assert.ok(["@g", "@t", "@k", "[ber00]", "[zap00]"].includes(m), `${m}: a mark parseMarkup does not read`);
  assert.ok(/[ãçõ]/.test(pt[1146] + pt[1147] + pt[1148]), "the first scene of the story is in Portuguese");
  assert.equal(pt[35000], en[35000], "Ciel's day 13: past where the translation ends, English");
});

test("a file Japanese has of its own is asked for under ja/, every other where it always was", () => {
  setOwn([]);
  assert.equal(asset("/assets/ui/TITLE_PARTS_JA/title_bg1.webp"), "/assets/ui/TITLE_PARTS_JA/title_bg1.webp");
  setOwn(["text.json", "scripts/5.json", "ui/CONF_PARTS_JA/system_bg.webp"]);
  assert.equal(has("text.json"), true);
  assert.equal(asset("/assets/text.json"), "/assets/ja/text.json");
  assert.equal(asset("/assets/scripts/5.json"), "/assets/ja/scripts/5.json");
  assert.equal(asset("/assets/scripts/6.json"), "/assets/scripts/6.json");
  assert.equal(asset("/assets/ui/CONF_PARTS_JA/system_bg.webp"), "/assets/ja/ui/CONF_PARTS_JA/system_bg.webp");
  assert.equal(asset("/js/main.js"), "/js/main.js");
  setOwn([]);
});

test("Chinese is laid over Japanese: a file is asked for under zh/, then ja/, then where it always was; a table is laid over in that order", () => {
  setOwn(["text.json", "system.json", "images.json", "scripts/5.json", "scripts/6.json", "img/IMG0316.avif"], "ja");
  addOwn(["text.json", "system.json", "scripts/6.json", "ui/MENU_PARTS_JA/menu_btn_ja.webp"], "zh");
  assert.equal(asset("/assets/text.json"), "/assets/zh/text.json");
  assert.equal(asset("/assets/scripts/5.json"), "/assets/ja/scripts/5.json");    // the original's script, which the patch did not change
  assert.equal(asset("/assets/scripts/6.json"), "/assets/zh/scripts/6.json");    // one with Chinese rows
  assert.equal(asset("/assets/scripts/7.json"), "/assets/scripts/7.json");
  assert.equal(asset("/assets/ui/MENU_PARTS_JA/menu_btn_ja.webp"), "/assets/zh/ui/MENU_PARTS_JA/menu_btn_ja.webp");
  assert.equal(asset("/assets/img/IMG0316.avif"), "/assets/ja/img/IMG0316.avif?v=2");   // a picture with writing stays the original's
  assert.deepEqual(overlays("system.json"), ["/assets/ja/system.json", "/assets/zh/system.json"]);
  assert.deepEqual(overlays("images.json"), ["/assets/ja/images.json"]);
  assert.deepEqual(overlays("effects.json"), []);
  setOwn([]);
});

test("a corrected file is asked for at an address no browser has kept (REVISED)", () => {
  setOwn([]);
  // IMG0316 was corrected after the site served it, so it carries a number; its neighbours do not.
  assert.equal(asset("/assets/img/IMG0316.avif"), "/assets/img/IMG0316.avif?v=2");
  assert.equal(asset("/assets/img/IMG0317.avif"), "/assets/img/IMG0317.avif");
  // the mark follows the file into Japanese's own copy of that path
  setOwn(["img/IMG0316.avif"]);
  assert.equal(asset("/assets/img/IMG0316.avif"), "/assets/ja/img/IMG0316.avif?v=2");
  setOwn([]);
});

test("ROW is a row break on the page, no letter, and nothing in plain text", () => {
  const line = `「あ${ROW}い<漢|かん>${ROW}<字|じ>」`;
  assert.equal(plain(line), "「あい漢字」");
  const parts = parseMarkup(line);
  assert.equal(parts[0].t, `「あ${ROW}い`);
  assert.deepEqual([parts[1].base, parts[1].ruby], ["漢", "かん"]);
  assert.equal(plain(`a${SOFT}b`), "a b");
});

// ---- a save made in the other language ---------------------------------------------------------------------------------------------
// The translation's script and the original's for the same stretch: the original's glued line is the translation's MSAD, its "@k@e" a wait.
const en = { ops: [["PGST", "1"], ["WKAD", "F823", "1"], ["MSG", "$000010@n"], ["WTTM", "4158", "1"], ["MSAD", "$000011"], ["WKAD", "F823", "1"], ["MSG", "$000012"],
  ["ATSV", "1"], ["SELR", "0", "$000020"], ["SELR", "1", "$000021"], ["SELD", "_D000", "1"], ["MSG", "$000013"]] };
const ja = { ops: [["PGST", "1"], ["WKAD", "F823", "1"], ["MSG", "$000010@k@e"], ["WKAD", "F823", "1"], ["MSG", "@x$000011"], ["WKAD", "F823", "1"], ["MSG", "$000012"],
  ["ATSV", "1"], ["SELR", "0", "$000020"], ["SELR", "1", "$000021"], ["SELD", "_D000", "1"], ["MSG", "$000013"]] };
const texts = { $000020: "はい", $000021: "いいえ" };

test("a command is found again by the line nearest to it", () => {
  assert.equal(mapPc(en, ja, 6), 6);          // the same message
  assert.equal(mapPc(en, ja, 8), 8);          // the first choice row, after the scene's point
  assert.equal(mapPc(en, ja, 10), 10);        // the choice itself: no line of its own, the rows before it
  assert.equal(mapPc(en, ja, 4), 4);
  assert.equal(mapPc(ja, en, 3), 3);          // the command after the line before: what follows it differs in the two (a row count, a wait)
});

test("a record waiting at a line runs that line again in the other script", () => {
  // waiting after the translation's MSAD (pc 5): the original shows that line with its glued message
  const a = carryPoint({ script: 3, pc: 5, waiting: true, html: "<span>English</span>", page: ["English"], vars: { F823: 1 } }, en, ja, (t) => texts[t], "ja");
  assert.deepEqual([a.pc, a.msgStart, a.waiting, a.html, a.lang], [4, true, false, "", "ja"]);
  // and back: waiting after the original's glued message (pc 5) is the translation's MSAD
  const b = carryPoint({ script: 3, pc: 5, waiting: true, html: "x", page: ["x"], lang: "ja" }, ja, en, (t) => t, "en");
  assert.deepEqual([b.pc, b.msgStart, b.waiting, b.lang], [4, true, false, "en"]);
  // a message about to run stays one
  const c = carryPoint({ script: 3, pc: 2, msgStart: true, waiting: false, html: "" }, en, ja, (t) => t, "ja");
  assert.deepEqual([c.pc, c.msgStart], [2, true]);
});

test("a choice keeps its place and takes its rows' words from the script", () => {
  const s = { script: 3, pc: 10, choices: [{ value: 0, text: "Yes", locked: false }, { value: 1, text: "No", locked: true }], html: "<span>Q</span>", page: ["Q"] };
  const c = carryPoint(s, en, ja, (t) => texts[t], "ja");
  assert.equal(c.pc, 10);
  assert.deepEqual(c.choices, [{ value: 0, text: "はい", locked: false }, { value: 1, text: "いいえ", locked: true }]);
  assert.equal(c.html, "<span>Q</span>");
});

test("a scene's point keeps its place", () => {
  const c = carryPoint({ script: 3, pc: 8, waiting: false, html: "", page: [] }, en, ja, (t) => t, "ja");
  assert.deepEqual([c.pc, c.msgStart], [8, undefined]);
});

// ---- the generated files -----------------------------------------------------------------------------------------------------------
test("the system and picture tables are the shared ones with Japanese's (and Chinese's) few entries laid over them, never replaced by them", () => {
  const vm = readFileSync(new URL("../../web/app/js/vm.js", import.meta.url), "utf8");
  const shared = vm.match(/const shared = new Set\((\[[^\]]*\])\);/);
  assert.ok(shared, "vm.js names the tables read from the shared files");
  assert.deepEqual(JSON.parse(shared[1]).sort(), ["images", "system"]);
  assert.match(vm, /for \(const u of overlays\("images\.json"\)\) Object\.assign\(this\.gfx\.images, await fetch\(u\)/);
  assert.match(vm, /const systemOver = Promise\.all\(overlays\("system\.json"\)\.map/);
  assert.match(vm, /for \(const over of await systemOver\) Object\.assign\(this\.system, over \|\| \{\}\);/);
  for (const k of ["imageSizes", "pivots", "pivotCuts", "windows", "voices"]) if (there("zh/system.json")) assert.ok(!(k in read("zh/system.json")), `zh/system.json lays no ${k} over`);
  if (there("ja/images.json")) {
    const base = read("images.json"), over = read("ja/images.json");
    assert.ok(Object.keys(over).length < Object.keys(base).length / 10, "ja/images.json is an overlay, not a table of its own");
    for (const k of Object.keys(over)) assert.ok(k in base, `${k}: a picture the shared table has`);
  }
});

test("Japanese's help bar has a label for every number its screens name, as English has, each cut whole from its sheet", { skip: !there("ja/system.json") }, () => {
  const en = read("system.json").help, ja = read("ja/system.json").help;
  const wanted = 1 + Math.max(...ja.screens.flat().filter(([kind]) => kind === 1).map(([, id]) => id));
  assert.equal(en.labels.length, wanted);
  assert.equal(ja.labels.length, wanted, "a word cut in two would shift every label after it (ロード, データコピー, 拡大・縮小)");
  assert.deepEqual(ja.labels[8], [84, 42, 149, 71], "ロード is one label");
  assert.deepEqual(ja.labels[24], [255, 186, 370, 216], "拡大・縮小 is one label");
});

test("a save's note is found again by its line, so the save screen shows it in the language in use", () => {
  const ops = [["MSG", "$000010@n"], ["WKAD", "F823", "1"], ["MSG", "$000011^$000012@k@e"], ["ATSV"], ["STCH", "1", "img0001"]];
  assert.equal(noteLine({ pc: 2, waiting: true }, ops), 10);          // waiting after the first line
  assert.equal(noteLine({ pc: 2, msgStart: true }, ops), 12);         // about to run a glued message: its newest piece
  assert.equal(noteLine({ pc: 3, waiting: true }, ops), 12);
  assert.equal(noteLine({ pc: 5 }, ops), 12);                          // a scene's point: the nearest line before it
  assert.equal(noteLine({ pc: 0 }, ops), null);
  const en = [["MSG", "$042770@n"], ["MSAD", "$042771"], ["WKST", "F823", "eq", "0"], ["MSG", "$042772"]];
  assert.equal(noteLine({ pc: 0, msgStart: true }, en), 42771, "the translation's glued piece, which the record's note shows");
  const vm = readFileSync(new URL("../../web/app/js/vm.js", import.meta.url), "utf8"), ui = readFileSync(new URL("../../web/app/js/ui.js", import.meta.url), "utf8");
  assert.match(vm, /async noteIn\(s\) \{\n    if \(!s \|\| \(s\.lang \|\| "en"\) === LANG\) return s\?\.note \|\| "";/);
  assert.match(ui, /if \(\(rec\.lang \|\| "en"\) !== LANG && this\.vm\?\.noteIn\) this\.vm\.noteIn\(rec\)/);
});

test("Japanese has its own text, scripts and tables, listed in ja/index.json", { skip: !there("ja/index.json") }, () => {
  const files = new Set(read("ja/index.json").files);
  for (const f of ["text.json", "system.json", "gallery.json", "flowchart.json", "fonts/TsukuMin.ttf"]) assert.ok(files.has(f), f);
  const ja = read("ja/text.json"), en = read("text.json");
  assert.equal(ja.length, en.length);                         // the same lines, by the same numbers
  assert.equal(ja[0].replaceAll(ROW, ""), "　誰も彼も眠った頃、夜の冷気で瞼を開ける。");
  // a row is 28 cells; a letter the row's rules let hang makes it 29 (a narrow letter is half a cell)
  const cells = (row) => [...row.replace(/<([^|>]*)\|[^>]*>/g, "$1").replace(/\[[a-z]+\d*\]/g, "□").replace(/@[a-z]\d?/g, "")].reduce((n, c) => n + (c.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);
  let rows = 0, over = 0;
  for (const line of ja) for (const part of line.split("^")) { const r = part.split(ROW); if (r.length > 1) for (const row of r.slice(0, -1)) { rows++; if (cells(row) > 29) over++; } }
  assert.ok(rows > 13000, String(rows));
  assert.ok(over <= 6, `${over} rows longer than 29 cells`);   // (a run of dashes is never cut: a few rows carry one past the edge)
  const sys = read("ja/system.json");
  assert.equal(sys.messages["178"], "セーブしますか？");
  assert.equal(read("ja/flowchart.json").groups[0].parts[0].title, "硝子の月");
});

test("every line a Japanese script shows is one the translation's script shows, so a save carries both ways", { skip: !there("ja/index.json") }, () => {
  const names = read("scripts/index.json").names;
  const own = read("ja/index.json").files.filter((f) => /^scripts\/\d+\.json$/.test(f)).map((f) => Number(f.match(/\d+/)[0]));
  assert.ok(own.length > 200 && own.length < names.length, String(own.length));
  const ids = (op) => ((op[0] === "MSG" || op[0] === "MSAD") ? [...(op[1] || "").matchAll(/\$(\d+)/g)].map((m) => Number(m[1])) : []);
  let checked = 0;
  for (const i of own.filter((_, k) => k % 6 === 0)) {
    const a = read(`scripts/${i}.json`), b = read(`ja/scripts/${i}.json`);
    assert.equal(a.name, b.name);
    const shown = new Set(b.ops.flatMap(ids));
    let missing = 0;
    a.ops.forEach((op, at) => {
      const line = ids(op)[0];
      if (line === undefined) return;
      if (!shown.has(line)) { missing++; return; }
      // waiting at the translation's message: the original's message that shows the line, run again
      const there2 = carryPoint({ script: i, pc: at + 1, waiting: true, html: "x", page: ["x"] }, a, b, (t) => t, "ja");
      assert.ok(there2.msgStart && ids(b.ops[there2.pc]).includes(line), `${a.name} line ${line}`);
      // and back: the translation's message for that message's first line
      const back = carryPoint({ ...there2, lang: "ja" }, b, a, (t) => t, "en");
      assert.ok(ids(a.ops[back.pc]).includes(ids(b.ops[there2.pc])[0]), `${a.name} line ${line} back`);
      checked++;
    });
    assert.ok(missing <= 2, `${a.name}: ${missing} lines the original does not show`);
    if (b.rows) for (const [op, texts] of Object.entries(b.rows)) {
      const ids = [...b.ops[Number(op)][1].matchAll(/\$(\d+)/g)];
      assert.equal(ids.length, texts.length, `${b.name} op ${op}`);
    }
  }
  assert.ok(checked > 3000, String(checked));
});

// ---- Chinese -------------------------------------------------------------------------------------------------------------------------
test("Chinese has the patch's lines, words and rows, laid over Japanese, listed in zh/index.json", { skip: !there("zh/index.json") }, () => {
  // (the patch is v3.0 since 2026-11-16, GitHub issue 12; nothing here quotes its words, only what they must be)
  const files = new Set(read("zh/index.json").files);
  for (const f of ["text.json", "system.json", "gallery.json", "flowchart.json", "rows.json", "fonts/TsukuMin.woff2", "fonts/TsukuGo.woff2", "fonts/SeuratPro.woff2",
    "movie/phasetitle_02_00.mp4", "movie/phasetitle_14_01.mp4", "movie/prologue.mp4", "ui/DISP_PARTS_JA/help_txt_ja.webp"]) assert.ok(files.has(f), f);
  // the scripts are Japanese's, the openings stay the translation's, and the prologue is the patch's own movie, with no subtitles drawn over it
  for (const f of files) assert.ok(!/^(scripts|subs)\//.test(f) && !/^movie\/(op|ed)/.test(f), f);
  // the story's pictures the patch redrew with Chinese writing, under the original's names; none of its pre-blurred copies (the port blurs the sharp one)
  const img = [...files].filter((f) => f.startsWith("img/"));
  assert.ok(img.length > 80, `${img.length} pictures`);
  for (const f of img) assert.match(f, /^img\/IMG\d{4}\.avif$/, f);
  const renames = JSON.parse(readFileSync(new URL("../../web-dev/data/zh_v3_pictures.json", import.meta.url), "utf8"));
  for (const f of img) assert.ok(f.slice(4, 11) in renames, `${f}: one the patch renamed`);
  const zh = read("zh/text.json"), ja = read("ja/text.json");
  assert.equal(zh.length, ja.length, "the same lines, by the same numbers");
  const han = (s) => /[\u4e00-\u9fff]/.test(s);
  assert.ok(zh.filter((l) => l.trim() && han(l)).length > 42000, "Chinese words in nearly every line");   // (42,598 in v3.0: the rest are dashes, dots, sounds)
  assert.ok(zh.filter((l, i) => l !== ja[i]).length > 43000, "not Japanese's");
  const cells = (row) => [...row.replace(/<([^|>]*)\|[^>]*>/g, "$1").replace(/\[[a-z]+\d*\]/g, "□").replace(/@[a-z]\d?/g, "")].reduce((n, c) => n + (c.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);
  let rows = 0, over = 0;
  for (const line of zh) for (const part of line.split("^")) { const r = part.split(ROW); if (r.length > 1) for (const row of r.slice(0, -1)) { rows++; if (cells(row.trimEnd()) > 29) over++; } }
  assert.ok(rows > 7000, String(rows));   // (v3.0: 8,000 and more; Chinese says it in fewer letters than Japanese)
  assert.ok(over <= 6, `${over} rows longer than 29 cells`);
  // a space where the engine ended a row by it is left out of the game's rows: here it stays at the end of the row above, where it shows nothing
  assert.ok(zh.some((l) => l.includes(` ${ROW}`)), "a space kept at a row's end");
  const sys = read("zh/system.json");
  assert.deepEqual(Object.keys(sys).sort(), ["help", "messages", "saves"]);
  assert.ok(han(sys.messages["178"]), "the system's questions in Chinese");
  const wanted = 1 + Math.max(...sys.help.screens.flat().filter(([kind]) => kind === 1).map(([, id]) => id));
  assert.equal(sys.help.labels.length, wanted, "the help bar's labels cut whole from the patch's picture of them");
  assert.ok(han(read("zh/flowchart.json").groups[0].parts[0].title), "the flowchart's titles in Chinese");
});

test("Chinese's rows go with Japanese's scripts: each names the lines of the command it is for", { skip: !there("zh/rows.json") }, () => {
  const table = read("zh/rows.json"), jaOwn = new Set(read("ja/index.json").files);
  let n = 0;
  for (const [i, rows] of Object.entries(table)) {
    const s = read(jaOwn.has(`scripts/${i}.json`) ? `ja/scripts/${i}.json` : `scripts/${i}.json`);
    if (rows === null) { assert.ok(s.rows, `${s.name}: null takes away rows the script has`); continue; }
    for (const [op, texts] of Object.entries(rows)) {
      const o = s.ops[Number(op)];
      assert.ok(o && (o[0] === "MSG" || o[0] === "MSAD"), `${s.name} op ${op}`);
      assert.equal([...o[1].matchAll(/\$(\d+)/g)].length, texts.length, `${s.name} op ${op}`);
      n++;
    }
  }
  assert.ok(n > 200, String(n));
});

test("a script is read with Chinese's own rows in place of Japanese's", async () => {
  const lang = await import("../../web/app/js/lang.js");
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ 5: { 12: ["甲", "乙"] }, 6: null }) });
  try {
    lang.setOwn(["rows.json"], "zh");
    const s = { name: "x", ops: [], rows: { 3: ["あ"] } };
    assert.deepEqual((await lang.ownRows(s, 5)).rows, { 12: ["甲", "乙"] });
    assert.equal((await lang.ownRows(s, 6)).rows, undefined, "null: the script shows each line's own rows");
    assert.equal(await lang.ownRows(s, 7), s, "a script the table does not name is as it is");
    assert.deepEqual(s.rows, { 3: ["あ"] }, "the script read is not changed");
    lang.setOwn([]);
    assert.equal(await lang.ownRows(s, 5), s, "not in Chinese");
  } finally { globalThis.fetch = saved; lang.setOwn([]); }
});

test("the prologue's subtitles: the line at a frame, none between lines, and only where the language has them", async () => {
  const { lineAt, subsFor } = await import("../../web/app/js/subs.js");
  const subs = [{ start: 43, end: 177, text: "a" }, { start: 265, end: 315, text: "b" }, { start: 325, end: 385, text: "c" }];
  assert.equal(lineAt(subs, 42), null);
  assert.equal(lineAt(subs, 43).text, "a");
  assert.equal(lineAt(subs, 176).text, "a");
  assert.equal(lineAt(subs, 177), null, "end is the first frame it is gone");
  assert.equal(lineAt(subs, 300).text, "b");
  assert.equal(lineAt(subs, 384).text, "c");
  assert.equal(lineAt(subs, 9999), null);
  assert.equal(await subsFor("prologue"), null, "English has none");
  const { pictureLevel } = await import("../../web/app/js/subs.js");
  const p = { start: 100, full: 110, out: 200, end: 210 };
  assert.deepEqual([pictureLevel(p, 99), pictureLevel(p, 109) > 0.9, pictureLevel(p, 150), pictureLevel(p, 205) < 0.5, pictureLevel(p, 210)], [0, true, 1, true, 0]);
  assert.equal(pictureLevel({ start: 0, full: 10, out: null, end: 50 }, 49), 1, "cut, not faded");
  const main = readFileSync(new URL("../../web/app/js/main.js", import.meta.url), "utf8");
  assert.match(main, /subsFor\(name\)\.then\(\(data\) => \{ if \(data && !over\) stopSubs = showSubs\(v, data, movieSubs\(\)\); \}\);/, "every movie asks (the story's and the gallery's)");
  if (there("zh/subs/prologue.json")) {
    const d = read("zh/subs/prologue.json");
    assert.equal(d.fps, 30);
    assert.ok(d.subs.length > 50, String(d.subs.length));
    d.subs.forEach((s, i) => { assert.ok(s.start < s.end && (!i || d.subs[i - 1].end <= s.start), `subtitle ${i} in order`); assert.ok(s.text.trim(), `subtitle ${i}`); });
    assert.ok(d.subs.at(-1).end <= 11529, "within the original's movie (11,529 frames)");
    assert.equal(d.inPicture.length, 10, "and the lines the patch set beside the movie's own words, in three scenes");
    assert.ok(!read("zh/index.json").files.includes("movie/prologue.mp4"), "the original's movie, not the patch's");
  }
});

test("the Controls page has a Chinese word for each of its own words, and keeps the English in the other languages", async () => {
  const { CONTROLS_ZH, say } = await import("../../web/app/js/words.js");
  const { ACTIONS, MENU_KEYS, MOUSE, keyLabel } = await import("../../web/app/js/keys.js");
  const { TOUCH_CONTROLS } = await import("../../web/app/js/touch.js");
  const words = ["Keyboard", "Click a key to change it.  Esc cancels, Backspace clears.", "Menus", "Mouse", "Touch", "Press a key", "key", "Space",
    "Desktop", "Discord Rich Presence", "On", "Off",
    ...ACTIONS.map((a) => a.label), ...MENU_KEYS.map(([l]) => l), ...MOUSE.flat(), ...TOUCH_CONTROLS.flat()];
  for (const w of words) assert.ok(CONTROLS_ZH[w] && /[一-鿿]/.test(CONTROLS_ZH[w]), w);
  assert.equal(say("Advance text"), "Advance text", "English here (the tests run in English)");
  assert.equal(say(keyLabel("Space")), "Space");
  const ui = readFileSync(new URL("../../web/app/js/ui.js", import.meta.url), "utf8");
  for (const s of ['head(say("Keyboard")', 'line(say(a.label)', 'cap(say(what)', 'say(keyLabel(k))', 'say("Press a key")', 'say(how)', 'say("Touch")',
    'say("Desktop")', 'say("Discord Rich Presence")', 'say(on ? "On" : "Off")'])
    assert.ok(ui.includes(s), s);
});

// ---- Russian (web-dev/tools/build_ru.py: Living FLCL's translation, from their patch for the Windows app) -------------------------------------------
test("Russian: a fifth language with scripts of its own, played in English where it is not translated; a save carries both ways by its line", { skip: !there("ru/index.json") }, async () => {
  const T = await import("../../web/app/js/languages.js");
  const { deviceLang } = await import("../../web/app/js/lang.js");
  const { VM } = await import("../../web/app/js/vm.js");
  assert.equal(T.scriptsOf("ru"), "ru", "its own scripts: a record made in English is carried to its commands (vm.js restore)");
  assert.deepEqual(T.layersOf("ru"), ["ru"]);
  assert.equal(T.isOriginal("ru"), false, "set as the English is, wrapped by the text box (reflow.js)");
  assert.equal(deviceLang({ languages: ["ru-RU", "en"] }), "ru");
  const files = read("ru/index.json").files, names = read("scripts/index.json").names;
  const own = files.filter((f) => /^scripts\/\d+\.json$/.test(f)).map((f) => Number(f.match(/\d+/)[0]));
  assert.ok(own.length > 100 && own.length < names.length, String(own.length));
  for (const f of ["text.json", "system.json", "flowchart.json", "gallery.json", "fonts/Russian-Story.woff2", "movie/prologue.mp4", "ui/TITLE_PARTS_JA/titlemenu.webp"]) assert.ok(files.includes(f), f);
  // the patch's own face is Microsoft's (cut from Calibri): never in the folder; nor the Q&A corners' balloons, which are the English ones with the English corners
  assert.deepEqual(files.filter((f) => /Mahoyo|\.ttf$|tw_t_L/.test(f)), []);
  // every line: Russian or the English one, nothing left in Japanese (the patch leaves its untranslated scenes in Japanese), no mark gone Cyrillic
  const ru = read("ru/text.json"), en = read("text.json");
  assert.equal(ru.length, en.length);
  const japanese = /[぀-ヿ一-鿿]/, cyrillic = /[Ѐ-ӿ]/;
  assert.deepEqual(ru.map((line, k) => (japanese.test(line) && line !== en[k] ? k : -1)).filter((k) => k >= 0), []);
  assert.deepEqual(ru.filter((line) => /@[Ѐ-ӿ]/.test(line)), []);
  assert.ok(ru.filter((line) => cyrillic.test(line)).length > 35000);
  const ids = (op) => ((op[0] === "MSG" || op[0] === "MSAD") ? [...(op[1] || "").matchAll(/\$(\d+)/g)].map((m) => Number(m[1])) : []);
  // a scene is Russian whole or English whole: an English scene keeps the English script (none of its own), and no line of it is Russian
  const qa = names.indexOf("QA_02"), late = names.indexOf("15_01A_CIEL15A_1");
  for (const i of [qa, late]) {
    assert.equal(own.includes(i), false, names[i]);
    for (const op of read(`scripts/${i}.json`).ops) for (const k of ids(op)) assert.equal(ru[k], en[k], `${names[i]} line ${k}`);
  }
  let checked = 0, unknown = new Set();
  const known = new Set(Object.getOwnPropertyNames(VM.prototype).filter((n) => n.startsWith("op_")).map((n) => n.slice(3)));
  for (const i of own) {
    const a = read(`scripts/${i}.json`), b = read(`ru/scripts/${i}.json`);
    assert.equal(a.name, b.name);
    assert.deepEqual([...new Set(b.ops.flatMap(ids))].sort((x, y) => x - y), [...new Set(a.ops.flatMap(ids))].sort((x, y) => x - y), `${a.name}: the same lines`);
    for (const op of b.ops) if (!known.has(op[0]) && !a.ops.some((o) => o[0] === op[0])) unknown.add(op[0]);
    a.ops.forEach((op, at) => {
      const line = ids(op)[0];
      if (line === undefined) return;
      // waiting at the English message: the Russian script's message that shows the line, run again; and back
      const there2 = carryPoint({ script: i, pc: at + 1, waiting: true, html: "x", page: ["x"] }, a, b, (t) => t, "ru");
      assert.ok(there2.msgStart && ids(b.ops[there2.pc]).includes(line), `${a.name} line ${line}`);
      const back = carryPoint({ ...there2, lang: "ru" }, b, a, (t) => t, "en");
      assert.ok(ids(a.ops[back.pc]).includes(line), `${a.name} line ${line} back`);
      checked++;
    });
  }
  assert.ok(checked > 10000, String(checked));
  assert.deepEqual([...unknown], [], "every command of the Russian scripts is one the game runs (DMMY: passed over, vm.js op_DMMY)");
});
