// The opening page in Japanese, Chinese and Portuguese (web/app/js/sitewords.js, sitewords-table.js) and the language picked from the device (lang.js
// deviceLang): every string the page can show has its Japanese, Chinese and Portuguese, the words made of parts are matched, and the language a visit starts in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = (init = {}) => ({ s: { ...init }, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); } });
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const H = await import("../../web/app/js/home.js");
const W = await import("../../web/app/js/welcome.js");
const U = await import("../../web/app/js/update.js");
const F = await import("../../web/app/js/formats.js");
const { tr, trBlock, localize } = await import("../../web/app/js/sitewords.js");
const { SITE_JA, SITE_ZH, SITE_PT, SAME } = await import("../../web/app/js/sitewords-table.js");
const { SITE_RU } = await import("../../web/app/js/sitewords-ru.js");
const { deviceLang, langOf, uiLangOf, chosenLang } = await import("../../web/app/js/lang.js");
const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// Every string the page can show, by walking its tables (the site's and the apps').
function pageStrings() {
  const out = new Set();
  const add = (s) => { if (typeof s === "string" && s && /[A-Za-z]/.test(s)) out.add(s); };
  const block = (b) => {
    if (typeof b === "string") { if (b !== "logo") add(b); return; }
    if (!Array.isArray(b)) return;
    if (b[0] === "h" || b[0] === "note") add(b[1]);
    else if (b[0] === "rows") for (const [n, w, f] of b[1]) { if (!f) add(n); add(w); }
    else if (b[0] === "facts") for (const [, w] of b[1]) add(w);
    else if (b[0] === "link") add(b[1]);
  };
  for (const app of [null, "android"]) for (const t of H.tabsFor(app)) { add(t.plate); for (const s of t.sections) { add(s.head); s.blocks.forEach(block); } }
  W.TOUCH_INTRO.forEach(block);
  add(H.GPU_NOTICE.head); add(H.GPU_NOTICE.off); block(["rows", H.GPU_NOTICE.rows]);
  add(H.NO_GL.head); add(H.NO_GL.why); block(["rows", H.NO_GL.rows]);
  for (const v of Object.values(H.SAVE_TEXT_EN)) add(v);
  for (const v of Object.values(U.UPDATE_TEXT)) add(v);
  for (const v of Object.values(F.MEDIA_TEXT)) add(v);
  for (const app of [null, "android"]) add(H.langLineFor(app).note);
  add(H.EN_LINE.head); add(H.EN_LINE.note);
  block(["rows", H.LANG_ROWS]);
  for (const v of Object.values(H.LANG_NOW)) add(v);
  for (const p of [...H.SAVE_PLATES, H.FULL_PLATE, H.CIEL_PLATE, H.UPDATE_PLATE]) add(p.plate);
  for (const v of Object.values(U.LANG_NAMES)) add(v);
  return [...out];
}

test("every string the opening page can show has its Japanese and its Chinese, or is shown as it is (paths, commands, names)", () => {
  const all = pageStrings();
  assert.ok(all.length > 250, `${all.length} strings`);
  const missing = all.filter((s) => !SAME.has(s) && !(Object.hasOwn(SITE_JA, s) && Object.hasOwn(SITE_ZH, s) && Object.hasOwn(SITE_PT, s)));
  assert.deepEqual(missing, [], "add these to web/app/js/sitewords-table.js");
  for (const [en, ja] of Object.entries(SITE_JA)) assert.ok(/[぀-ヿ一-鿿]/.test(ja) || /^\d/.test(ja) || ja === "ENGLISH", `Japanese for ${en}`);
  for (const [en, zh] of Object.entries(SITE_ZH)) assert.ok(/[一-鿿]/.test(zh), `Chinese for ${en}`);
  assert.deepEqual(Object.keys(SITE_PT), Object.keys(SITE_JA), "Portuguese has every entry the other two have");
  // Russian's table is a file of its own (sitewords-ru.js, from the translators' patch, with the game's screens' words too): every page string is in it
  const noRussian = all.filter((s) => !SAME.has(s) && !Object.hasOwn(SITE_RU, s));
  assert.deepEqual(noRussian, [], "add these to web/app/js/sitewords-ru.js");
  for (const k of Object.keys(SITE_JA)) assert.ok(/[\u0400-\u04ff]/.test(SITE_RU[k] ?? "") || /^\d/.test(SITE_RU[k] ?? "") || SITE_RU[k] === k, `Russian for ${k}`);
  assert.equal(tr("Language", "ru"), SITE_RU["Language"]);
  const samePt = Object.entries(SITE_PT).filter(([en, pt]) => en === pt).map(([en]) => en);
  assert.deepEqual(samePt, ["Extras"], "every other entry is in Portuguese");
  for (const [en, pt] of Object.entries(SITE_PT)) assert.equal(pt.split("\n").length, en.split("\n").length, `the same rows: ${en}`);
  // (the apps' words for "browser", which this walk, run as the site, does not reach)
  for (const s of ["In this app now", "No save data in this app yet.", "Nothing to export yet: the game has not been played in this app."]) assert.ok(SITE_JA[s] && SITE_ZH[s] && SITE_PT[s], s);
});

test("a question in the game's Yes / No window stays within its rows in Japanese and Chinese (about 18 wide letters a row)", () => {
  for (const s of [H.SAVE_TEXT_EN.askRemove, H.SAVE_TEXT_EN.askFull, H.SAVE_TEXT_EN.askCiel, U.UPDATE_TEXT.askShell]) {
    for (const table of [SITE_JA, SITE_ZH]) for (const row of table[s].split("\n")) assert.ok([...row].length <= 18, `${row} (${[...row].length})`);
  }
  const ask = U.UPDATE_TEXT.askLang(tr("Japanese", "zh"), 101e6, true);
  for (const row of tr(ask, "zh").split("\n")) assert.ok([...row].length <= 18, row);
});

test("the hint bar in Portuguese: a word for every entry, and the mouse's part of each", async () => {
  const { HINTS, HINTS_PT, KEYS_PT } = await import("../../web/app/js/ui.js");
  assert.deepEqual(Object.keys(HINTS_PT).sort(), Object.keys(HINTS).sort());
  const mouse = new Set(Object.values(HINTS).flat().filter((k) => /[a-z]/.test(k) && !/^(Enter|Esc|Tab|Home|Page Up \/ Down|V)$/.test(k)));
  assert.deepEqual([...mouse].sort(), Object.keys(KEYS_PT).sort(), "every mouse word has its Portuguese; key names stay");
  assert.match(read("web/app/js/ui.js"), /const HINT_WORDS = JA \? HINTS_JA : ZH \? HINTS_ZH : PT \? HINTS_PT : \{\};/);
});

test("a question in the game's Yes / No window stays within its rows in Portuguese: no row wider than the English's widest", () => {
  const asks = [H.SAVE_TEXT_EN.askRemove, H.SAVE_TEXT_EN.askFull, H.SAVE_TEXT_EN.askCiel, U.UPDATE_TEXT.askShell, U.UPDATE_TEXT.askLang("Japanese", 101e6, true), U.UPDATE_TEXT.ask(12_300_000)];
  const widest = Math.max(...asks.flatMap((s) => s.split("\n").map((r) => r.length)));
  for (const s of asks) for (const row of tr(s.replace("Japanese", tr("Japanese", "pt")), "pt").split("\n")) assert.ok(row.length <= widest, `${row} (${row.length} > ${widest})`);
});

test("words made of parts: file names, sizes, versions, a language's name and the list of plates are matched, in both", () => {
  assert.equal(tr("Saved as savedata000.", "ja"), "savedata000 として保存しました。");
  assert.equal(tr("Saved as savedata000.", "zh"), "已保存为 savedata000。");
  assert.equal(tr("Loaded the 100% save.", "ja"), "100%セーブを読み込みました。", "a whole string before a pattern");
  assert.equal(tr(U.UPDATE_TEXT.ask(12_300_000), "zh"), "有可用的更新（12 MB）。\n现在下载吗？");
  assert.equal(tr(U.UPDATE_TEXT.loading(1, 4), "ja"), "アップデートをダウンロード中  25%\n押すと中止します");
  assert.equal(tr(U.UPDATE_TEXT.langLoading("日语", 1, 2), "zh"), "正在下载日语  50%\n按下即可停止");
  assert.match(tr(H.noneLine(H.TABS), "ja"), /「概要」「ダウンロード」「セーブデータ」「言語」、ゲームを始めるなら「プレイ」。$/);
  assert.match(tr(H.noneLine(H.tabsFor("android")), "zh"), /“关于”、“存档”、“语言”，或选择“游玩”开始游戏。$/);
  assert.equal(tr("saves made here: 3 in the list, 1 automatic", "ja"), "ここで作ったセーブ：一覧 3、自動 1");
  assert.match(tr("The 100% save is loaded: the scenes, pictures and songs above are its own, and yours are put aside until it is removed. The saves are still the ones made here.", "zh"), /^已载入100% 存档：/);
  assert.equal(tr("Saved as savedata000.", "pt"), "Salvo como savedata000.");
  assert.equal(tr("Loaded savedata000.", "pt"), "savedata000 carregado.", "a file's name keeps its small letter");
  assert.equal(tr("Loaded the 100% save.", "pt"), "Save 100% carregado.");
  assert.equal(tr(U.UPDATE_TEXT.ask(12_300_000), "pt"), "Há uma atualização disponível (12 MB).\nBaixar agora?");
  assert.equal(tr(U.UPDATE_TEXT.langLoading(tr("Chinese", "pt"), 1, 2), "pt"), "Baixando o chinês  50%\nAperte para parar");
  assert.match(tr(H.noneLine(H.TABS), "pt"), /SOBRE, BAIXAR, DADOS SALVOS, IDIOMA ou JOGAR ONLINE para começar o jogo\.$/);
  assert.equal(tr("saves made here: 3 in the list, 1 automatic", "pt"), "saves feitos aqui: 3 na lista, 1 automático");
  assert.equal(tr("saves made here: 1 in the list, 2 automatic", "pt"), "saves feitos aqui: 1 na lista, 2 automáticos");
  assert.match(tr("The 100% save is loaded: the scenes, pictures and songs above are its own, and yours are put aside until it is removed. The saves are still the ones made here.", "pt"), /^O save 100% está carregado: /);
  assert.equal(tr("Something new.", "ja"), "Something new.", "English where there is nothing");
  assert.equal(tr("Language", "en"), "Language");
});

test("blocks and word tables are looked up as they are drawn; paths and commands stay", () => {
  assert.deepEqual(trBlock(["rows", [["web/app", "The game: its engine, its interface and its styles."]]], "zh"), ["rows", [["web/app", "游戏本身：引擎、界面和样式。"]]]);
  assert.deepEqual(trBlock(["rows", [["Georgia", "The story, choices, the log and Yes / No questions. Then Times New Roman, then the included Gelasio, which has Georgia's widths.", "Georgia"]]], "ja")[1][0][0], "Georgia", "a font's name in its own font");
  assert.equal(trBlock("logo", "ja"), "logo");
  const save = localize(H.SAVE_TEXT_EN, "zh");
  assert.equal(save.keys, "按键：E 导出，I 导入。");
  assert.equal(save.exported("a.bin"), "已保存为 a.bin。");
  assert.equal(localize(H.SAVE_TEXT_EN, "en"), H.SAVE_TEXT_EN);
  const home = read("web/app/js/home.js");
  for (const hook of ['el("h2", "", tr(s.head))', "blockEl(trBlock(b))", "label: tr(t.plate)", 'const U = localize(UPDATE_TEXT)', 'tr(EN_LINE.note)', "text = tr(text)"]) assert.ok(home.includes(hook), hook);
  assert.match(read("web-dev/tools/build_zh.py"), /sitewords-table\.js/, "the Chinese faces keep the page's letters too");
});

test("the language a visit starts in: the one chosen, else the device's first of English, Japanese, Chinese and Portuguese, else English", () => {
  const nav = (...languages) => ({ languages, language: languages[0] });
  assert.equal(deviceLang(nav("ja-JP", "en-US")), "ja");
  assert.equal(deviceLang(nav("zh-TW")), "zh", "any Chinese: the one Chinese here");
  assert.equal(deviceLang(nav("zh-Hans-CN")), "zh");
  assert.equal(deviceLang(nav("fr-FR", "ja")), "ja", "the first of the three in the device's order");
  assert.equal(deviceLang(nav("en-GB", "ja")), "en");
  assert.equal(deviceLang(nav("fr", "de")), "en", "none of them: English");
  assert.equal(deviceLang(nav("pt-BR", "en")), "pt", "any Portuguese: the one Portuguese here (the user, 2026-11-17: \"select pt if device is in pt\")");
  assert.equal(deviceLang(nav("pt-PT")), "pt");
  assert.equal(uiLangOf("en", store(), "android", nav("pt-BR")), "pt", "an app's page in Portuguese from the start");
  assert.equal(deviceLang({ language: "ja" }), "ja");
  assert.equal(deviceLang(undefined), "en");
  assert.equal(langOf("", store(), null, nav("ja-JP")), "ja", "the site, nothing chosen: the device's");
  assert.equal(langOf("", store({ "tsuki.lang": "en" }), null, nav("ja-JP")), "en", "a choice wins");
  assert.equal(langOf("?lang=zh", store({ "tsuki.lang": "ja" }), null, nav("en")), "zh", "and the address over that");
  assert.equal(langOf("", store(), "android", nav("ja-JP")), "en", "an app plays a language only once its files are in");
  assert.equal(chosenLang(store()), null);
  assert.equal(uiLangOf("en", store(), "android", nav("zh-CN")), "zh", "but its page is in the device's language from the start");
  assert.equal(uiLangOf("en", store({ "tsuki.lang": "en" }), "android", nav("zh-CN")), "en", "until one is chosen");
  assert.equal(uiLangOf("ja", store(), null, nav("zh-CN")), "ja", "on the site the page is in the game's language");
});
