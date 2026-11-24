// The Android and desktop apps (web-dev/android, web-dev/desktop): the opening page they show (four tabs, Japanese and Chinese downloaded when chosen, the save tools through the app),
// and how they bring themselves up to date from the site: what is decided in the page (web/app/js/update.js), what the app does (web-dev/desktop/updater.js,
// run here against a small server; the Android app's Updates.java is the same logic, checked on a device), and what both builds and the deployment say
// they hold (web-dev/tools/app_manifest.py).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const at = (rel) => new URL(`../../${rel}`, import.meta.url);
const read = (rel) => readFileSync(at(rel), "utf8");
const { APP_HOSTS, SHELL, appKind, connect, toBase64 } = await import("../../web/app/js/apphost.js");
const { langOf } = await import("../../web/app/js/lang.js");
const { tabsFor, TABS, noneLine, homeDue, UPDATE_PLATE, LANG_PLATES, langLineFor } = await import("../../web/app/js/home.js");
const { TOUCH } = await import("../../web/app/js/touch.js");
const { DOWNLOAD_PAGE, FORMAT, LANG_DIRS, LANG_NAMES, MANIFEST, SAFE_PATH, SEEN, UPDATED, UPDATE_TEXT, appFiles, assetFiles, checkUpdate, hasLang, heldDirs, idOf, langPlan, parseList, readManifest, runUpdate, sizeText, updateId, versionText } = await import("../../web/app/js/update.js");
const { LOCAL } = await import("../../web/app/js/savefile.js");
const { Updater } = createRequire(import.meta.url)("../desktop/updater.js");

const sha = (s) => createHash("sha256").update(s).digest("hex"), md5 = (s) => createHash("md5").update(s).digest("hex");
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }; };

// ---- the page inside an app -------------------------------------------------------------------------------------------------------------------
test("the apps are told by their own addresses, and nothing else is one", () => {
  assert.deepEqual(APP_HOSTS, { "appassets.androidplatform.net": "android", "tsukihime.desktop": "desktop" });
  assert.equal(appKind("appassets.androidplatform.net"), "android");
  assert.equal(appKind("tsukihime.desktop"), "desktop");
  for (const host of ["arcueid.date", "localhost", "127.0.0.1", "tsukirebuild.pages.dev", ""]) assert.equal(appKind(host), null, host);
  // the two apps answer at those names
  assert.match(read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), /static final String HOST = "appassets\.androidplatform\.net";/);
  assert.match(read("web-dev/desktop/main.js"), /const HOST = "tsukihime\.desktop";/);
});

test("the apps open on the opening page: ABOUT, SAVE DATA, LANGUAGE and PLAY, with no DOWNLOAD, and the three languages on LANGUAGE", () => {
  assert.equal(homeDue(new URLSearchParams("")), true);
  const app = tabsFor("android"), site = tabsFor(null);
  assert.equal(TABS, site, "(these tests run as the site)");
  assert.deepEqual(app.map((t) => t.plate), ["ABOUT", "SAVE DATA", "LANGUAGE", "PLAY"]);
  assert.deepEqual(tabsFor("desktop"), app);
  assert.deepEqual(site.map((t) => t.plate), ["ABOUT", "DOWNLOAD", "SAVE DATA", "LANGUAGE", "PLAY ONLINE"], "the site keeps five (GitHub's page in ABOUT, LANGUAGE its own: 2026-11-16)");
  const kinds = (t) => t.sections.flatMap((s) => s.blocks).filter((b) => Array.isArray(b)).map((b) => b[0]);
  const all = app.flatMap(kinds);
  assert.deepEqual(all.filter((k) => k === "lang"), ["lang"], "the language plates, once");
  assert.ok(!all.includes("gpu"), "no notice about a browser's graphics setting");
  assert.ok(!JSON.stringify(app).includes(".apk") && !JSON.stringify(app).includes("Tsukihime-win-x64.zip"), "no downloads");
  // ABOUT: the site's, but for the notice of which browsers the site works in (the source's section in it, as on the site)
  assert.equal(app[0].sections.length, site[0].sections.length);
  assert.deepEqual(app[0].sections[0].blocks, site[0].sections[0].blocks.filter((b) => b[0] !== "note" && b[0] !== "media"));
  // (the site's red lines where the sound or the movies can't play, formats.js, in place of a note about Safari for everyone: the user, 2026-11-24)
  assert.ok(site[0].sections[0].blocks.some((b) => b[0] === "media"));
  assert.ok(!JSON.stringify(site[0].sections[0].blocks).includes("Safari"));
  assert.deepEqual(app[0].sections.map((s) => s.head), site[0].sections.map((s) => s.head));
  assert.equal(app[0].sections[1].head, "The source, on GitHub");
  // SAVE DATA: the same tools and list, saying where the app keeps things
  assert.deepEqual(kinds(app[1]), ["data", "saves", "rows"]);
  assert.deepEqual(app[1].sections[0].blocks.slice(2), site[2].sections[0].blocks.slice(2), "what is held, the four plates, and what each does");
  assert.match(app[1].sections[0].blocks[0], /kept in this app/);
  assert.ok(!JSON.stringify(app[1]).includes("this browser"));
  // LANGUAGE: the same tab as the site's
  assert.equal(app[2], site[3]);
  assert.deepEqual(kinds(app[2]), ["lang"]);
  // PLAY: the language it starts in over the prompt that starts the game, as on the site's PLAY ONLINE, then the updates; the three plates (the
  // user, 2026-11-14: "yes add jp too") on LANGUAGE, with a line saying Japanese and Chinese are downloaded when first chosen
  assert.deepEqual(app[3].sections.map((s) => s.head), ["Play", "Updates"]);
  assert.deepEqual(kinds(app[3]), ["langnow", "press", "update"]);
  assert.deepEqual(kinds(site[4]), ["gpu", "media", "langnow", "press"]);   // (media: the site's red lines where the sound or the movies can't play, formats.js; the apps have none)
  assert.deepEqual(LANG_PLATES.map((l) => l.plate), ["ENGLISH", "日本語", "中文", "PORTUGUÊS", "РУССКИЙ"]);   // (PORTUGUÊS only where its folder is: home.js langShown)
  // (what each language is: a short list under the plates, a row a language, and one line under it; the user, 2026-11-16, of a long wrapped
  // paragraph: "looks messy")
  assert.deepEqual(langLineFor(null).rows.map((r) => r[0]), ["ENGLISH", "日本語", "中文", "PORTUGUÊS", "РУССКИЙ", "ESPAÑOL"]);   // (ESPAÑOL: on its way, no plate)
  assert.equal(langLineFor(null).note, "Saves and progress carry over between languages. L changes it.");
  assert.equal(langLineFor("android").note, "日本語, 中文, PORTUGUÊS and РУССКИЙ are downloaded the first time they are chosen.\nSaves and progress carry over between languages. L changes it.");
  assert.equal(noneLine(app), "An unofficial fan rebuild of the Tsukihime remake. Choose a page above: ABOUT, SAVE DATA, LANGUAGE, or PLAY to start the game.");
  assert.match(noneLine(site), /ABOUT, DOWNLOAD, SAVE DATA, LANGUAGE, or PLAY ONLINE to start the game\.$/);
  const home = read("web/app/js/home.js");
  assert.match(home, /export const TABS = tabsFor\(APP\);/);
  assert.match(home, /const HERE = APP \? "app" : "browser";/);
  assert.match(home, /\(k === "l" \|\| k === "L"\) && \(tab === LANGUAGE \|\| tab === PLAY\) && !e\.ctrlKey && !e\.metaKey && !e\.altKey\)/, "L goes through them in the apps too");
  assert.match(home, /const blocks = T && k === PLAY && n === 0 \?/, "how to play by touch once, under the prompt, not again under Updates");
  assert.equal(UPDATE_PLATE.plate, "CHECK FOR UPDATES");
  // by touch the four are in one row along the top (the user, 2026-11-13); the site's five stay three over two
  const T = TOUCH.homeRow, shown = TOUCH.bar.w * TOUCH.bar.scale, tall = TOUCH.bar.h * TOUCH.bar.scale;
  assert.equal(T.cols, 4);
  assert.ok(app.length <= T.cols && site.length > T.cols);
  assert.ok(T.pitch > shown && T.pitch * (T.cols - 1) + shown <= T.w, "the row inside the stage, no plate over the next");
  assert.ok(T.y + tall <= T.height && T.height < TOUCH.home.height, "a strip one row high");
  assert.match(home, /if \(T && LAND === TOUCH\.homeRow\) page\.classList\.add\("hm-row1"\);/);
  assert.match(read("web/app/touch.css"), /html\.touch:not\(\.upright\) \.hm-row1 \.hm-scroll \{ top: 150px; height: 930px; \}/, "and the page begins under it");
});

test("an app plays the language kept once its files were in, never one an address asks for; both are built in English, without Japanese's and Chinese's files", () => {
  const ja = store({ "tsuki.lang": "ja" }), zh = store({ "tsuki.lang": "zh" });
  assert.equal(langOf("", ja, null), "ja", "(the site: the kept choice)");
  assert.equal(langOf("", zh, null), "zh");
  assert.equal(langOf("?lang=ja", store(), null), "ja", "(and the address)");
  for (const app of ["android", "desktop"]) {
    assert.equal(langOf("", store(), app), "en");
    assert.equal(langOf("", ja, app), "ja", "kept by the page only once Japanese's files were in (home.js updGet)");
    assert.equal(langOf("", zh, app), "zh");
    assert.equal(langOf("?lang=ja", store(), app), "en", "an address cannot ask for files the app may not have");
    assert.equal(langOf("?lang=en", zh, app), "zh");
  }
  const lang = read("web/app/js/lang.js");
  assert.match(lang, /if \(app\) return storedLang\(storage\);/);
  // files that are not there after all (an update the app took out again): back to English before anything is drawn
  // (and an app not yet updated to have the official English's folder: back to the fan translation)
  assert.match(lang, /if \(APP && lists\.some\(\(list\) => !list\) && typeof location !== "undefined"\) \{\n(    \/\/ [^\n]*\n)+    if \(OFFICIAL\) chooseEnglish\("tsukihimates"\); else chooseLang\("en"\);\n    location\.reload\(\);/);
  // the Android build leaves out what the bundle's description leaves out, read from the same list (app_manifest.py WITHOUT): written out by
  // hand it kept ja and zh out and let Portuguese's folder in, which the app then asked to download again (2026-11-21)
  const apk = read("web-dev/android/build_apk.sh");
  assert.match(apk, /import app_manifest; print\(' '\.join\(app_manifest\.WITHOUT\)\)/);
  assert.match(apk, /case "\$without" in \*" \$\(basename "\$f"\) "\*\) ;;/);
  assert.doesNotMatch(apk, /in voice\|se\|ja\|zh\)/);
  const pack = JSON.parse(read("web-dev/desktop/package.json")).build;
  // (the desktop build's list is written out: every folder of app_manifest.py WITHOUT must be in it, or a rebuilt app carries a language it then asks
  // to download again, as Portuguese's and Russian's folders would have been)
  assert.deepEqual(pack.extraResources[1].filter, ["**/*", "!voice/**", "!se/**", "!ja/**", "!zh/**", "!pt/**", "!ru/**", "!**/.*"]);
  // and the list the updates compare leaves them out too: app_manifest.py reads the page's own table of languages (languages.js)
  const py = JSON.parse(execFileSync("python3", ["-I", "-c", "import json, sys; sys.path.insert(0, 'web-dev/tools'); import app_manifest as a; print(json.dumps([a.LANG_DIRS, a.PACKED, a.WITHOUT]))"],
    { cwd: new URL("../../", import.meta.url).pathname, encoding: "utf8" }));
  assert.deepEqual(py, [["ja", "zh", "pt", "ru"], ["ja", "zh", "ru"], ["ja", "zh", "pt", "ru", "voice", "se"]]);
  for (const folder of py[2]) assert.ok(pack.extraResources[1].filter.includes(`!${folder}/**`), `the desktop app is built without ${folder}/`);
});

test("what the page asks of an app goes through one object: the desktop's promises, the Android app's numbered answers", async () => {
  assert.equal(connect({}), null, "in a browser there is none");
  // desktop (preload.js)
  const asked = [];
  let listener = null;
  const desk = connect({ desktopHost: { invoke: async (name, args) => { asked.push([name, args]); listener?.({ done: 1, total: 2 }); return { ok: name }; }, onEvent: (fn) => { listener = fn; } } });
  assert.equal(desk.kind, "desktop");
  const events = [];
  assert.deepEqual(await desk.call("stage", { id: "x" }, (e) => events.push(e)), { ok: "stage" });
  assert.deepEqual(asked, [["stage", { id: "x" }]]);
  assert.deepEqual(events, [{ done: 1, total: 2 }]);
  // Android (MainActivity.Bridge.invoke answers through appHostReply / appHostEvent)
  const g = { AndroidHost: { invoke: (call, name, args) => { g.sent = [call, name, JSON.parse(args)]; } } };
  const droid = connect(g);
  assert.equal(droid.kind, "android");
  const got = [], answer = droid.call("stage", { id: "y" }, (e) => got.push(e));
  assert.deepEqual(g.sent, [1, "stage", { id: "y" }]);
  g.appHostEvent(1, { done: 5, total: 9 });
  g.appHostReply(1, true, { ok: true });
  assert.deepEqual(await answer, { ok: true });
  assert.deepEqual(got, [{ done: 5, total: 9 }]);
  const refused = droid.call("apply", {});
  g.appHostReply(2, false, "not an update");
  await assert.rejects(refused, /not an update/);
  g.appHostReply(7, true, {});   // (an answer nobody waits for is dropped)
  assert.equal(toBase64(new Uint8Array([0, 255, 16, 32])), "AP8QIA==");
  // the commands the page uses are the ones both apps answer
  const java = read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), desktop = read("web-dev/desktop/main.js");
  for (const name of ["info", "open", "saveFile", "fetchText", "stage", "cancel", "apply", "confirm"]) {
    assert.ok(java.includes(`case "${name}":`), `Android: ${name}`);
    assert.match(desktop, new RegExp(`\\n  ${name}: `), `desktop: ${name}`);
    assert.ok(read("web/app/js/apphost.js").includes(`//   ${name} `), `listed: ${name}`);
  }
});

test("in an app Export's file goes where the player chooses, Import has a file chooser, and a link opens in the system's browser", () => {
  const home = read("web/app/js/home.js"), java = read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), desktop = read("web-dev/desktop/main.js");
  assert.match(home, /const kept = await HOST\.call\("saveFile", \{ name: FILE_NAME, data: toBase64\(file\) \}\);\n          if \(kept\.saved\) say\(SAVE_TEXT\.exported\(kept\.name \|\| FILE_NAME\)\);/, "said only once it is saved, under the name it was given");
  assert.match(home, /if \(HOST && \/\^https:\\\/\\\/\/\.test\(a\.href\)\) \{ e\.preventDefault\(\); HOST\.call\("open", \{ url: a\.href \}\)/);
  // Android: the WebView has no file chooser or downloads of its own
  assert.match(java, /public boolean onShowFileChooser\(WebView v, ValueCallback<Uri\[\]> answer, FileChooserParams params\)/);
  assert.match(java, /new Intent\(Intent\.ACTION_CREATE_DOCUMENT\)/);
  assert.match(java, /new Intent\(Intent\.ACTION_VIEW, u\)/);
  assert.match(java, /if \(u == null \|\| !"https"\.equals\(u\.getScheme\(\)\)\) return;/);
  // the Android app is in landscape only, its opening page included (the user, 2026-11-13): nothing turns it
  assert.match(read("web-dev/android/AndroidManifest.xml"), /android:screenOrientation="sensorLandscape"/);
  assert.doesNotMatch(java, /setRequestedOrientation/);
  // desktop
  assert.match(desktop, /dialog\.showSaveDialog\(win, \{ title: "Export save data", defaultPath: path\.join\(app\.getPath\("downloads"\), name\) \}\)/);
  assert.match(desktop, /if \(!\/\^https:\\\/\\\/\/i\.test\(target\)\) return;/);
  // a Save dialog taken down by the closing app answers as if Save had been pressed, with the name it opened on: nothing is written then
  // (2026-11-13: quitting the Mac app with the dialog up wrote over a savedata000 that was already in Downloads)
  assert.match(desktop, /if \(closing \|\| asked\.canceled \|\| !asked\.filePath \|\| !win \|\| win\.isDestroyed\(\)\) return \{ saved: false \};/);
  assert.match(desktop, /app\.on\("before-quit", \(\) => \{ closing = true; \}\);/);
  assert.match(desktop, /win\.on\("close", \(e\) => \{\n    closing = true;/);
  // the saves made on leaving are not made over an import that is about to be read (the file chooser takes the Android app to the background)
  assert.match(read("web/app/js/main.js"), /globalThis\.appSuspend = \(\) => \{ if \(!savesReplaced\(\)\) \{ autosave\(\); vm\.saveRead\(\); vm\.unlocks\.save\(\); \} \};/);
  // the stage cannot be scrolled, so nothing can shift the picture up and leave black under it (seen on a phone, 2026-11-13)
  assert.match(read("web/app/style.css"), /#stage \{[^}]*overflow: hidden; overflow: clip;/);
});

// ---- what is decided in the page (update.js) ----------------------------------------------------------------------------------------------------
const V = { a: "aaaaaaaaaaaa", b: "bbbbbbbbbbbb" };
const listOf = (files) => Object.entries(files).sort().map(([p, body]) => `${md5(body)} ${body.length} ${p}`).join("\n") + "\n";
// A description as app_manifest.py writes it, of app files { path: body } and the game's files { path: body }.
// langs: { folder: { path under the folder: body } }, the languages' own folders, listed apart (paths under assets/, as the site lists them).
const describe = (version, time, app, assets, shell = 1, langs = null) => {
  const list = listOf(assets), named = (l, key) => ({ md5: md5(l), size: l.length, path: key });
  const m = { format: 1, time, shell, version, app: Object.entries(app).sort().map(([p, body]) => [p, body.length, sha(body)]), assets: named(list, `update/assets-${md5(list).slice(0, 12)}.txt`) };
  const lists = {};
  if (langs) {
    m.langs = {};
    for (const [d, files] of Object.entries(langs)) {
      lists[d] = listOf(Object.fromEntries(Object.entries(files).map(([p, body]) => [`${d}/${p}`, body])));
      m.langs[d] = named(lists[d], `update/lang-${d}-${md5(lists[d]).slice(0, 12)}.txt`);
    }
  }
  return { m, list, lists };
};
const APP1 = { "index.html": "<html>1", "js/main.js": "main 1", "js/vm.js": "vm 1", "style.css": "css" };
const ASSETS1 = { "img/A.avif": "picture a", "img/B.avif": "picture b", "text.json": "{}" };
// A pretend app: what it was built with, what it has taken since (`current`), and the site it asks.
function world({ built = describe(V.a, 1000, APP1, ASSETS1), site = null, current = null, rejected = [], shell = 1, down = false } = {}) {
  const asked = [];
  const host = { kind: "desktop", call: async (name, args = {}) => {
    asked.push(name === "fetchText" ? args.path : name);
    if (name === "info") return { kind: "desktop", shell, version: "1", update: { current, rejected } };
    if (name === "fetchText") {
      if (down || !site) throw Error("no connection");
      if (args.path === MANIFEST) return JSON.stringify(site.m);
      if (args.path === `${site.m.assets.path}?h=${site.m.assets.md5.slice(0, 12)}`) { assert.equal(args.hash, site.m.assets.md5, "the list is checked against its hash"); return site.list; }
      for (const [d, l] of Object.entries(site.m.langs || {})) if (args.path === `${l.path}?h=${l.md5.slice(0, 12)}`) { assert.equal(args.hash, l.md5); return site.lists[d]; }
      throw Error(`404 ${args.path}`);
    }
    throw Error(`unexpected ${name}`);
  } };
  const local = async (p) => { if (p === "/bundled.json") return JSON.stringify(built.m); if (p === "/bundled-assets.txt") return built.list; throw Error(p); };
  return { host, local, asked, storage: store() };
}

test("a description is read only in the form both sides write it", () => {
  const { m } = describe(V.a, 1000, APP1, ASSETS1);
  assert.equal(readManifest(m), m);
  assert.equal(FORMAT, 1);
  const bad = (change, why) => { const c = structuredClone(m); change(c); assert.throws(() => readManifest(c), /not an update description/, why); };
  bad((c) => { c.format = 2; }, "another format");
  bad((c) => { delete c.time; }, "no time");
  bad((c) => { c.version = "xyz"; }, "version");
  bad((c) => { c.app = []; }, "no files");
  bad((c) => { c.app[0][0] = "../outside.js"; }, "a path that climbs out");
  bad((c) => { c.app[0][0] = "/etc/passwd"; }, "an absolute path");
  bad((c) => { c.app[0][0] = ".hidden"; }, "a hidden file");
  bad((c) => { c.app[0][0] = "assets/img/A.avif"; }, "an app file among the game's");
  bad((c) => { c.app[0][2] = "abc"; }, "not a hash");
  bad((c) => { c.app[0][1] = -1; }, "a size");
  bad((c) => { c.assets.md5 = "x"; }, "the list's hash");
  bad((c) => { c.assets.path = "update/../../x"; }, "the list's path");
  const withLangs = describe(V.a, 1000, APP1, ASSETS1, 1, { ja: { "index.json": "{}" } }).m;
  assert.equal(readManifest(withLangs), withLangs, "a description that lists the languages' folders");
  const badLang = (change, why) => { const c = structuredClone(withLangs); change(c); assert.throws(() => readManifest(c), /not an update description/, why); };
  badLang((c) => { c.langs = 5; }, "langs");
  badLang((c) => { c.langs.ja.md5 = "x"; }, "a language list's hash");
  badLang((c) => { c.langs.ja.path = "../x"; }, "a language list's path");
  const later = structuredClone(withLangs);
  later.langs.ko = { what: "a folder this page does not know" };
  assert.equal(readManifest(later), later, "a folder of a later page's is no reason to refuse the rest");
  for (const p of ["js/main.js", "assets/img/IMG0316.avif", "fonts/Inter-Regular.woff2", "v_1/a-b.c"]) assert.ok(SAFE_PATH.test(p), p);
  for (const p of ["", "/a", "a/", "a//b", "..", "a/../b", "a/.b", "a b", "a?b", "a\\b", "http://x/y"]) assert.ok(!SAFE_PATH.test(p), p);
  // the list of the game's files
  assert.deepEqual([...parseList(`${md5("x")} 1 img/A.avif\n${md5("y")} 22 text.json\n\n`)], [["img/A.avif", [1, md5("x")]], ["text.json", [22, md5("y")]]]);
  assert.throws(() => parseList("nonsense"), /not a list/);
  assert.throws(() => parseList(`${md5("x")} 1 ../../x`), /not a list/);
});

test("the update is what the site has that the app was not built with, each file at an address of its own", () => {
  const built = describe(V.a, 1000, APP1, ASSETS1);
  const site = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2", "js/new.js": "new" }, { ...ASSETS1, "img/B.avif": "picture b, corrected", "img/C.avif": "picture c" });
  const app = appFiles(built.m, site.m);
  assert.deepEqual(app.map((f) => f.path), ["js/main.js", "js/new.js"], "the changed and the new, not the rest");
  assert.deepEqual(app[0], { path: "js/main.js", size: 6, hash: sha("main 2"), from: `v/${V.b}/js/main.js?h=${sha("main 2").slice(0, 12)}` });
  const assets = assetFiles(parseList(built.list), parseList(site.list));
  assert.deepEqual(assets.map((f) => f.path), ["assets/img/B.avif", "assets/img/C.avif"]);
  assert.deepEqual(assets[0], { path: "assets/img/B.avif", size: 20, hash: md5("picture b, corrected"), from: `assets/img/B.avif?h=${md5("picture b, corrected").slice(0, 12)}` });
  assert.equal(updateId(site.m), `${V.b}-${site.m.assets.md5.slice(0, 8)}`);
});

test("looking for an update: none without a connection, none when the app is as new as the site, the changed files and their size otherwise", async () => {
  // no connection, or a site that has no description: the game plays as it is
  let w = world({ down: true });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "offline", version: V.a, time: 1000 });
  w = world({ site: null });
  assert.equal((await checkUpdate(w.host, w)).state, "offline");
  // the site has what the app was built with
  w = world({ site: describe(V.a, 2000, APP1, ASSETS1) });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "current", version: V.a, time: 1000 });
  assert.deepEqual(w.asked, ["info", MANIFEST], "one small file asked for, no lists");
  // an app built from newer work than the site has is left alone
  w = world({ built: describe(V.b, 3000, { ...APP1, "js/main.js": "main 3" }, ASSETS1), site: describe(V.a, 2000, APP1, ASSETS1) });
  assert.equal((await checkUpdate(w.host, w)).state, "current");
  // a changed script: that file alone, and the game's files' list is not even fetched
  const site2 = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2!" }, ASSETS1);
  w = world({ site: site2 });
  let u = await checkUpdate(w.host, w);
  assert.equal(u.state, "update");
  assert.deepEqual(u.files.map((f) => f.path), ["js/main.js"]);
  assert.equal(u.bytes, 7);
  assert.equal(u.count, 1);
  assert.equal(u.id, updateId(site2.m));
  assert.deepEqual(u.meta, { id: u.id, time: 2000, version: V.b, assets: site2.m.assets.md5, files: { "js/main.js": [7, sha("main 2!")] } });
  assert.deepEqual([u.version, u.time], [V.a, 1000], "the version in use, for the page to name");
  assert.deepEqual(w.asked, ["info", MANIFEST]);
  // a corrected picture too: the two lists are compared
  const site3 = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2!" }, { ...ASSETS1, "img/B.avif": "picture b, corrected" });
  w = world({ site: site3 });
  u = await checkUpdate(w.host, w);
  assert.deepEqual(u.files.map((f) => f.path), ["js/main.js", "assets/img/B.avif"]);
  assert.equal(u.bytes, 7 + 20);
  assert.equal(w.asked.length, 3);
});

test("an app that has taken an update is compared from there: what it holds is not downloaded again, and nothing is asked when it is the newest", async () => {
  const site3 = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2!" }, { ...ASSETS1, "img/B.avif": "picture b, corrected" });
  let w = world({ site: site3 });
  const first = await checkUpdate(w.host, w);
  // it has that one now
  w = world({ site: site3, current: first.meta });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "current", version: V.b, time: 2000 });
  assert.deepEqual(w.asked, ["info", MANIFEST]);
  // the site moves on: another script changed, the picture the same. The picture is kept, the list not fetched again
  const site4 = describe("cccccccccccc", 3000, { ...APP1, "js/main.js": "main 2!", "js/vm.js": "vm 4" }, { ...ASSETS1, "img/B.avif": "picture b, corrected" });
  w = world({ site: site4, current: first.meta });
  const u = await checkUpdate(w.host, w);
  assert.equal(u.state, "update");
  assert.deepEqual(u.files.map((f) => f.path).sort(), ["assets/img/B.avif", "js/main.js", "js/vm.js"], "all that differs from what the app was built with");
  assert.equal(u.bytes, 4, "only vm.js is still to download");
  assert.equal(u.count, 1);
  assert.deepEqual(w.asked, ["info", MANIFEST]);
  // the site goes back to what the app was built with: the update is to hold nothing
  w = world({ site: describe(V.a, 4000, APP1, ASSETS1), current: first.meta });
  const back = await checkUpdate(w.host, w);
  assert.equal(back.state, "update");
  assert.deepEqual(back.files, []);
  assert.equal(back.bytes, 0);
  assert.equal(sizeText(back.bytes), "0 KB");
});

test("lists that differ only in what the app does not carry are compared once, then remembered", async () => {
  // (a file the site no longer lists: nothing to download)
  const { "img/B.avif": gone, ...fewer } = ASSETS1;
  const site = describe(V.a, 2000, APP1, fewer);
  const w = world({ site });
  assert.equal((await checkUpdate(w.host, w)).state, "current");
  assert.equal(w.asked.length, 3, "the list was fetched and compared");
  assert.equal(w.storage.getItem(SEEN), `built-${V.a}-${describe(V.a, 1000, APP1, ASSETS1).m.assets.md5.slice(0, 8)}|${updateId(site.m)}`);
  w.asked.length = 0;
  assert.equal((await checkUpdate(w.host, w)).state, "current");
  assert.deepEqual(w.asked, ["info", MANIFEST], "not again");
  assert.ok(LOCAL.includes(SEEN) && LOCAL.includes(UPDATED), "the page's notes are none of the save file's business");
});

test("an update made for a newer app is not taken: the app itself has to be downloaded again", async () => {
  const site = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2" }, ASSETS1, 2);
  let w = world({ site });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "shell", version: V.a, time: 1000 });
  w = world({ site, shell: 2 });
  assert.equal((await checkUpdate(w.host, w)).state, "update", "an app that does what it needs takes it");
  // a description in a form this page does not read is one for a newer app too
  w = world({ site: { m: { format: 2 }, list: "" } });
  assert.equal((await checkUpdate(w.host, w)).state, "shell");
  // the three numbers agree: the page's, and each app's
  assert.equal(SHELL, 1);
  assert.match(read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), new RegExp(`static final int SHELL = ${SHELL};`));
  assert.match(read("web-dev/desktop/main.js"), new RegExp(`const SHELL = ${SHELL};`));
  assert.match(read("web/app/js/apphost.js"), /^export const SHELL = \d+;/m, "where app_manifest.py reads it");
});

test("an update that did not come up here is not offered again by itself; asking for it is", async () => {
  const site = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2" }, ASSETS1);
  const w = world({ site, rejected: [updateId(site.m)] });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "rejected", id: updateId(site.m), version: V.a, time: 1000 });
  assert.equal((await checkUpdate(w.host, { ...w, force: true })).state, "update");
});

// ---- languages: downloaded when first chosen (update.js langPlan, home.js getLang) --------------------------------------------------------------
const JA1 = { "index.json": '{"files":["text.json","fonts/T.ttf"]}', "text.json": "ja text", "fonts/T.ttf": "a face" };
const ZH1 = { "index.json": '{"files":["text.json"]}', "text.json": "zh text!" };
const size = (files) => Object.values(files).reduce((n, b) => n + b.length, 0);
const inside = (d, files) => Object.keys(files).map((p) => `assets/${d}/${p}`).sort();

test("a language is downloaded when it is first chosen, as an update over the version in use; Chinese brings Japanese's folder too", async () => {
  const built = describe(V.a, 1000, APP1, ASSETS1), site = describe(V.a, 2000, APP1, ASSETS1, 1, { ja: JA1, zh: ZH1 });
  assert.deepEqual(LANG_DIRS, { ja: ["ja"], zh: ["ja", "zh"], pt: ["pt"], ru: ["ru"] }, "Chinese is laid over Japanese (lang.js LAYERS); Portuguese and Russian are their own");
  assert.deepEqual(LANG_NAMES, { en: "English", ja: "Japanese", zh: "Chinese", pt: "Portuguese", ru: "Russian" });
  // the site lists the languages, the app has none of them: nothing is offered by itself, and their lists are not even fetched
  let w = world({ site });
  assert.deepEqual(await checkUpdate(w.host, w), { state: "current", version: V.a, time: 1000 });
  assert.deepEqual(w.asked, ["info", MANIFEST]);
  // 日本語 chosen: its folder, over the app as it is (the site's page is the app's own: nothing else to download, so newer is false)
  w = world({ site });
  const ja = await langPlan(w.host, "ja", w);
  assert.equal(ja.state, "update");
  assert.equal(ja.newer, false);
  assert.deepEqual(ja.files.map((f) => f.path).sort(), inside("ja", JA1));
  assert.deepEqual([ja.bytes, ja.count], [size(JA1), 3]);
  assert.deepEqual(ja.files.find((f) => f.path === "assets/ja/text.json"), { path: "assets/ja/text.json", size: 7, hash: md5("ja text"), from: `assets/ja/text.json?h=${md5("ja text").slice(0, 12)}` });
  assert.match(ja.id, /^[0-9a-f]{12}-[0-9a-f]{8}$/, "a name both apps take (updater.js and Updates.java ID)");
  assert.equal(ja.id, idOf(V.a, built.m.assets.md5, [`ja:${site.m.langs.ja.md5}`]));
  assert.notEqual(ja.id, idOf(V.a, built.m.assets.md5), "another update than the version alone");
  assert.deepEqual({ ...ja.meta, files: null }, { id: ja.id, time: 2000, version: V.a, assets: built.m.assets.md5, files: null }, "the site's version, which is the app's");
  assert.deepEqual(w.asked, ["info", MANIFEST, `${site.m.langs.ja.path}?h=${site.m.langs.ja.md5.slice(0, 12)}`], "the folder's list, checked against its hash");
  // what the app then holds: Japanese, not Chinese
  assert.deepEqual(heldDirs(ja.meta), ["ja"]);
  assert.deepEqual([hasLang(ja.meta, "ja"), hasLang(ja.meta, "zh"), hasLang(null, "ja"), hasLang(null, "en")], [true, false, false, true]);
  // with it in: nothing is offered by itself; 中文 then needs zh/ alone
  w = world({ site, current: ja.meta });
  assert.equal((await checkUpdate(w.host, w)).state, "current");
  const zh = await langPlan(w.host, "zh", w);
  assert.deepEqual(zh.files.map((f) => f.path).sort(), [...inside("ja", JA1), ...inside("zh", ZH1)].sort());
  assert.deepEqual([zh.bytes, zh.count], [size(ZH1), 2], "Japanese's files are held, so not downloaded again");
  assert.deepEqual(heldDirs(zh.meta), ["ja", "zh"]);
  // 中文 first: both folders
  w = world({ site });
  const zh0 = await langPlan(w.host, "zh", w);
  assert.deepEqual([zh0.bytes, zh0.count], [size(JA1) + size(ZH1), 5]);
  assert.equal(zh0.id, zh.id, "the same files, the same update");
  // no connection, or a site that lists no languages: nothing to take
  w = world({ down: true });
  assert.equal((await langPlan(w.host, "ja", w)).state, "offline");
  w = world({ site: describe(V.a, 2000, APP1, ASSETS1) });
  assert.equal((await langPlan(w.host, "zh", w)).state, "offline");
  // an update the app has already: kept as it is, the language's folder added to it (its own files are taken from it, not fetched)
  const site2 = describe(V.b, 2000, { ...APP1, "js/main.js": "main 2" }, ASSETS1, 1, { ja: JA1, zh: ZH1 });
  w = world({ site: site2 });
  const first = await checkUpdate(w.host, w);
  w = world({ site: site2, current: first.meta });
  const over = await langPlan(w.host, "ja", w);
  assert.equal(over.newer, false);
  assert.deepEqual(over.files.find((f) => f.path === "js/main.js"), { path: "js/main.js", size: 6, hash: sha("main 2"), from: `v/${V.b}/js/main.js?h=${sha("main 2").slice(0, 12)}` });
  assert.equal(over.bytes, size(JA1));
  assert.deepEqual([over.meta.version, over.meta.time, over.meta.assets], [V.b, 2000, first.meta.assets]);
});

test("a language chosen while the site has a newer version comes with it; every later update keeps the languages held, brought up to date", async () => {
  const site = describe(V.a, 2000, APP1, ASSETS1, 1, { ja: JA1, zh: ZH1 });
  let w = world({ site });
  const ja = await langPlan(w.host, "ja", w);
  // the site moves on: a changed script, a corrected Japanese line, a new Chinese file
  const JA2 = { ...JA1, "text.json": "ja text, corrected" }, site2 = describe(V.b, 3000, { ...APP1, "js/main.js": "main 2" }, ASSETS1, 1, { ja: JA2, zh: { ...ZH1, "x.json": "x" } });
  w = world({ site: site2, current: ja.meta });
  const u = await checkUpdate(w.host, w);
  assert.equal(u.state, "update");
  assert.equal(u.newer, true);
  assert.deepEqual(u.files.map((f) => f.path), ["js/main.js", ...inside("ja", JA2)], "the update, with the Japanese the app holds and no Chinese");
  assert.deepEqual([u.bytes, u.count], [6 + JA2["text.json"].length, 2], "of Japanese, only the corrected file");
  assert.equal(u.id, updateId(site2.m, ["ja"]));
  assert.deepEqual([u.meta.version, u.meta.time], [V.b, 3000]);
  assert.ok(w.asked.includes(`${site2.m.langs.ja.path}?h=${site2.m.langs.ja.md5.slice(0, 12)}`) && !w.asked.some((a) => a.startsWith("update/lang-zh")));
  // once taken: current, and remembered as such
  w = world({ site: site2, current: u.meta });
  assert.equal((await checkUpdate(w.host, w)).state, "current");
  // 中文 chosen on an app as built while the site is newer: the newer version and both folders, and the question says so
  w = world({ site: site2 });
  const both = await langPlan(w.host, "zh", w);
  assert.equal(both.newer, true);
  assert.ok(both.files.some((f) => f.path === "js/main.js") && both.files.some((f) => f.path === "assets/zh/x.json"));
  assert.deepEqual([both.meta.version, both.meta.time], [V.b, 3000]);
  assert.equal(UPDATE_TEXT.askLang("Japanese", 1.04e8, false), "Japanese needs a download (104 MB).\nDownload it now?");
  assert.equal(UPDATE_TEXT.askLang("Chinese", 1.13e8, true), "Chinese needs a download (113 MB),\nwith the latest update.\nDownload it now?");
  // each line short enough for the question window (seen wrapping into No / Yes at 40 letters, 2026-11-14)
  for (const text of [UPDATE_TEXT.askLang("Japanese", 1.04e8, true), UPDATE_TEXT.askLang("Japanese", 9.99e8, false), UPDATE_TEXT.askLang("Chinese", 9.2e6, false), UPDATE_TEXT.langOffline("Japanese")]) for (const line of text.split("\n")) assert.ok(line.length <= 36, line);
  assert.equal(UPDATE_TEXT.langLoading("Chinese", 50, 100), "Downloading Chinese  50%\nPress to stop");
  // the page: a language the app has not got is asked about first, downloaded as an update is, and kept only once it is in
  const home = read("web/app/js/home.js");
  assert.match(home, /if \(HOST && lang !== LANG && LANG_DIRS\[lang\] && !\(await langIn\(lang\)\)\) \{ getLang\(lang\); return; \}/);
  assert.match(home, /try \{ plan = await langPlan\(HOST, lang\); \} catch \{ plan = \{ state: "offline" \}; \}/);
  assert.match(home, /else ui\.dialog\(U\.askLang\(name, plan\.bytes, plan\.newer\), \(back\) => \{ back\(\); updGet\(plan, lang\); \}, no, plan\.newer \? \{ three: true \} : \{\}\);/);
  assert.match(home, /if \(lang\) \{ chooseLang\(lang\); sessionStorage\.setItem\(REOPEN, "language"\); \}/, "chosen once it is in, and the page comes back on LANGUAGE");
});

test("the app: a language's folder is downloaded into the update in use and answered from there; the version's own files are not fetched again", async (t) => {
  const main2 = "main, version 2", text = "ja text";
  const s = await site({ "v/bbbbbbbbbbbb/js/main.js": main2, "assets/ja/text.json": text });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  const u = updaterAt(dir, s.origin);
  const v2 = [file("js/main.js", main2, `v/bbbbbbbbbbbb/js/main.js?h=${sha(main2).slice(0, 12)}`)];
  await u.stage({ id: ID1, files: v2 });
  u.apply({ id: ID1, meta: metaOf(ID1, v2) });
  u.confirm();
  s.hits.length = 0;
  const id = idOf("bbbbbbbbbbbb", "0".repeat(32), ["ja:0123"]), withJa = [...v2, file("assets/ja/text.json", text, `assets/ja/text.json?h=${md5(text).slice(0, 12)}`)];
  assert.deepEqual(await u.stage({ id, files: withJa }), { ok: true });
  assert.deepEqual(s.hits, [`/assets/ja/text.json?h=${md5(text).slice(0, 12)}`], "only the language's file");
  u.apply({ id, meta: metaOf(id, withJa) });
  assert.equal(readFileSync(u.fileFor("assets/ja/text.json"), "utf8"), text);
  assert.equal(readFileSync(u.fileFor("js/main.js"), "utf8"), main2);
  assert.deepEqual(heldDirs(u.info().current), [], "(no index.json in this small one)");
});

test("taking an update: its files are brought, then it is switched to; a failure leaves it at that", async () => {
  const calls = [];
  const plan = { id: "x", files: [{ path: "js/main.js" }], meta: { id: "x" } };
  await runUpdate({ call: async (name, args, onEvent) => { calls.push([name, args]); onEvent?.({ done: 1, total: 1 }); return { ok: true }; } }, plan, () => calls.push("progress"));
  assert.deepEqual(calls, [["stage", { id: "x", files: plan.files }], "progress", ["apply", { id: "x", meta: plan.meta }]]);
  calls.length = 0;
  await assert.rejects(runUpdate({ call: async (name) => { calls.push(name); throw Error("cut off"); } }, plan), /cut off/);
  assert.deepEqual(calls, ["stage"], "nothing is switched to");
  // the page: asked first, with the size; the page loads again only once the update is in
  const home = read("web/app/js/home.js");
  assert.match(home, /if \(upd\.state === "update"\) ui\.dialog\(U\.ask\(upd\.bytes\), \(back\) => \{ back\(\); updGet\(\); \}, no\);/);
  assert.match(home, /const updGet = async \(plan = upd, lang = null\) => \{/);
  assert.match(home, /await runUpdate\(HOST, plan, \(p\) => \{ got = p; \}\);\n      \} catch \{/);
  assert.match(home, /if \(leaving \|\| updBusy \|\| ui\.items !== own\) return;/, "nothing is asked once the game has been started, or over another question");
  assert.match(home, /HOST\.call\("confirm"\)\.catch\(\(\) => \{\}\);/, "the page tells the app it has come up");
  assert.equal(UPDATE_TEXT.ask(1234567), "An update is available (1.2 MB).\nDownload it now?");
  // an update made for a newer app: the site's DOWNLOAD page is offered instead, and the site opens on it for that address
  assert.equal(DOWNLOAD_PAGE, "https://arcueid.date/#download");
  assert.match(home, /else if \(upd\.state === "shell"\) ui\.dialog\(U\.askShell, \(back\) => \{ back\(\); HOST\.call\("open", \{ url: DOWNLOAD_PAGE \}\)/);
  assert.match(home, /if \(downloads >= 0 && globalThis\.location\?\.hash === "#download"\) \{ show\(downloads\); ui\.select\(downloads\); \}/);
  assert.deepEqual([0, 900, 340000, 1234567, 48e6, 1.31e9].map(sizeText), ["0 KB", "1 KB", "340 KB", "1.2 MB", "48 MB", "1.3 GB"]);
  assert.equal(versionText({ version: V.a, time: 1794587528 }), `2026-11-13 (${V.a})`);
});

// ---- what the app does (the desktop's updater.js; Updates.java is the same, line for line) ---------------------------------------------------
// A pretend site: files by path, served to the updater's own fetch. mode: "cut" sends half a body and drops the connection.
async function site(files) {
  const state = { files, mode: "", hits: [] };
  const server = http.createServer((req, res) => {
    const rel = new URL(req.url, "http://x").pathname.slice(1), body = state.files[rel];
    state.hits.push(req.url);
    if (body === undefined) { res.writeHead(404); res.end(); return; }
    const data = Buffer.from(body);
    res.writeHead(200, { "Content-Length": data.length });
    if (state.mode === "cut" && rel.startsWith("v/")) { res.write(data.subarray(0, data.length >> 1)); setTimeout(() => req.socket.destroy(), 20); return; }
    res.end(data);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  state.origin = `http://127.0.0.1:${server.address().port}`;
  state.close = () => new Promise((ok) => { server.closeAllConnections(); server.close(ok); });
  return state;
}
const scratch = () => mkdtempSync(path.join(tmpdir(), "tsuki-update-"));
const ID1 = "bbbbbbbbbbbb-11111111", ID2 = "cccccccccccc-22222222";
const file = (rel, body, from = rel) => ({ path: rel, size: Buffer.byteLength(body), hash: rel.startsWith("assets/") ? md5(body) : sha(body), from });
const metaOf = (id, files) => ({ id, time: 2000, version: id.slice(0, 12), assets: "0".repeat(32), files: Object.fromEntries(files.map((f) => [f.path, [f.size, f.hash]])) });
const updaterAt = (dir, origin, bundle = "built-1") => new Updater({ dir: path.join(dir, "update"), origin, bundle, fetch: (url, o) => fetch(url, o) }).load();

test("the app: an update is downloaded, checked, switched to in one step, and from then on answered first", async (t) => {
  const main2 = "main, version 2", picture = "a corrected picture";
  const s = await site({ "v/bbbbbbbbbbbb/js/main.js": main2, "assets/img/B.avif": picture });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  const u = updaterAt(dir, s.origin);
  assert.equal(u.fileFor("js/main.js"), null, "as built: every request is answered from the app's own files");
  assert.deepEqual(u.info(), { current: null, rejected: [] });
  const files = [file("js/main.js", main2, `v/bbbbbbbbbbbb/js/main.js?h=${sha(main2).slice(0, 12)}`), file("assets/img/B.avif", picture, `assets/img/B.avif?h=${md5(picture).slice(0, 12)}`)];
  const seen = [];
  assert.deepEqual(await u.stage({ id: ID1, files }, (p) => seen.push(p)), { ok: true });
  assert.deepEqual(seen.at(-1), { done: main2.length + picture.length, total: main2.length + picture.length });
  assert.equal(u.fileFor("js/main.js"), null, "downloaded is not switched to: the app is still as it was");
  assert.ok(!existsSync(path.join(dir, "update", "state.json")));
  u.apply({ id: ID1, meta: metaOf(ID1, files) });
  assert.equal(readFileSync(u.fileFor("js/main.js"), "utf8"), main2);
  assert.equal(readFileSync(u.fileFor("assets/img/B.avif"), "utf8"), picture);
  assert.equal(u.fileFor("js/vm.js"), null, "what the update does not hold still comes from the app");
  assert.equal(u.info().current.id, ID1);
  // the next start finds it
  const again = updaterAt(dir, s.origin);
  assert.equal(readFileSync(again.fileFor("js/main.js"), "utf8"), main2);
  again.confirm();
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "update", "state.json"), "utf8")), { bundle: "built-1", current: ID1, previous: null, confirmed: true, tries: 0, rejected: [] });
});

test("the app: a download cut off halfway, or a file that is not the one listed, changes nothing; what had arrived whole is not fetched twice", async (t) => {
  const main2 = "main, version 2, long enough to be cut in half", vm2 = "vm, version 2";
  const s = await site({ "v/bbbbbbbbbbbb/js/main.js": main2, "v/bbbbbbbbbbbb/js/vm.js": vm2, "style.css": "css 2" });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  const u = updaterAt(dir, s.origin);
  const files = [file("style.css", "css 2"), file("js/main.js", main2, "v/bbbbbbbbbbbb/js/main.js"), file("js/vm.js", vm2, "v/bbbbbbbbbbbb/js/vm.js")];
  s.mode = "cut";
  await assert.rejects(u.stage({ id: ID1, files }));
  assert.equal(u.fileFor("js/main.js"), null);
  assert.equal(u.fileFor("style.css"), null);
  assert.ok(!existsSync(path.join(dir, "update", "state.json")), "nothing was switched");
  assert.throws(() => u.apply({ id: ID1, meta: metaOf(ID1, files) }), /has not been downloaded/, "and it cannot be, with a file missing");
  assert.equal(updaterAt(dir, s.origin).fileFor("style.css"), null, "nor after a restart");
  const left = readdirSync(path.join(dir, "update", ID1, "files"), { recursive: true }).map(String).filter((n) => n.includes("."));
  assert.deepEqual(left, ["style.css"], "the whole file is kept, the half one is gone");
  // the connection is back: only what is missing is fetched
  s.mode = ""; s.hits.length = 0;
  const v = updaterAt(dir, s.origin);
  await v.stage({ id: ID1, files });
  assert.deepEqual(s.hits.sort(), ["/v/bbbbbbbbbbbb/js/main.js", "/v/bbbbbbbbbbbb/js/vm.js"]);
  v.apply({ id: ID1, meta: metaOf(ID1, files) });
  assert.equal(readFileSync(v.fileFor("js/main.js"), "utf8"), main2);
  // a file that is not the one the site lists (another size, or the same size and other bytes) is refused
  s.files["v/cccccccccccc/js/main.js"] = "tampered with!!";
  const wrong = [{ ...file("js/main.js", "what was listed"), from: "v/cccccccccccc/js/main.js" }];
  assert.equal(wrong[0].size, "tampered with!!".length);
  await assert.rejects(v.stage({ id: ID2, files: wrong }), /not the file the site lists/);
  await assert.rejects(v.stage({ id: ID2, files: [{ ...wrong[0], size: 3 }] }), /larger than expected/);
  assert.equal(readFileSync(v.fileFor("js/main.js"), "utf8"), main2, "the version in use is untouched");
  await assert.rejects(v.fetchText({ path: "style.css", hash: sha("something else") }), /not the file the site lists/);
  assert.equal(await v.fetchText({ path: "style.css", hash: sha("css 2") }), "css 2");
});

test("the app: downloads come from the site's address alone, and are kept only under plain paths", async (t) => {
  const s = await site({ "js/main.js": "x" });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  const u = updaterAt(dir, s.origin);
  const good = file("js/main.js", "x");
  for (const from of ["https://evil.example/x.js", "//evil.example/x.js", "../x", "a/../../b", "js/main.js?h=zz", "js/main.js?x=1", "js/main.js#f", "js/main.js?h=1?h=2", ""]) {
    await assert.rejects(u.stage({ id: ID1, files: [{ ...good, from }] }), /not a path of the site's/, from);
    await assert.rejects(u.fetchText({ path: from }), /not a path of the site's/, from);
  }
  for (const rel of ["../outside.js", "/abs.js", "a/../../b.js", ".hidden", "a\\b.js", "state.json/../x"]) {
    await assert.rejects(u.stage({ id: ID1, files: [{ ...good, path: rel }] }), /not an update's file/, rel);
    assert.throws(() => u.apply({ id: ID1, meta: { ...metaOf(ID1, []), files: { [rel]: [1, good.hash] } } }), /not an update's file/, rel);
  }
  for (const id of ["", "..", "../x", "state.json", "bbbbbbbbbbbb", `${ID1}/x`]) await assert.rejects(u.stage({ id, files: [good] }), /not an update/, id);
  assert.deepEqual(s.hits, [], "nothing was asked for");
  assert.equal(new Updater({ dir, origin: "https://arcueid.date/", bundle: "b", fetch }).address("update/app.json?h=abc123"), "https://arcueid.date/update/app.json?h=abc123");
  // both apps fix that address themselves, and accept another only for testing, on the same computer
  const java = read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), desktop = read("web-dev/desktop/main.js");
  assert.match(java, /static final String SITE = "https:\/\/arcueid\.date";/);
  assert.match(java, /String origin = SITE, asked = debuggable \? getIntent\(\)\.getStringExtra\("update_origin"\) : null;/);
  assert.match(java, /TEST_ORIGIN = Pattern\.compile\("http:\/\/\(127\\\\\.0\\\\\.0\\\\\.1\|localhost\):\\\\d\+"\);/);
  assert.match(desktop, /const SITE = "https:\/\/arcueid\.date";/);
  assert.match(desktop, /const ORIGIN = \/\^http:\\\/\\\/\(127\\\.0\\\.0\\\.1\|localhost\):\\d\+\$\/\.test\(flag\("update-origin"\) \|\| ""\) \? flag\("update-origin"\) : SITE;/);
  // the same rules in Java as here
  const rules = read("web-dev/android/src/date/arcueid/tsukirebuild/Updates.java");
  assert.ok(rules.includes('SAFE_PATH = Pattern.compile("[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*");'));
  assert.equal(SAFE_PATH.source, "^[A-Za-z0-9_][A-Za-z0-9_.-]*(\\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$");
  assert.ok(rules.includes('ID = Pattern.compile("[0-9a-f]{12}-[0-9a-f]{8}");') && rules.includes("TRIES = 2"));
});

test("the app: an update that does not come up twice running is taken out, the version before it is back, and it is not offered again", async (t) => {
  const s = await site({ "v/bbbbbbbbbbbb/js/main.js": "main 2", "v/cccccccccccc/js/main.js": "main 3, broken" });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  const state = () => JSON.parse(readFileSync(path.join(dir, "update", "state.json"), "utf8"));
  let u = updaterAt(dir, s.origin);
  const two = [file("js/main.js", "main 2", "v/bbbbbbbbbbbb/js/main.js")], three = [file("js/main.js", "main 3, broken", "v/cccccccccccc/js/main.js")];
  await u.stage({ id: ID1, files: two });
  u.apply({ id: ID1, meta: metaOf(ID1, two) });
  assert.deepEqual([state().confirmed, state().tries], [false, 1], "switched to, and not yet seen to come up");
  u.confirm();
  await u.stage({ id: ID2, files: three });
  u.apply({ id: ID2, meta: metaOf(ID2, three) });
  assert.deepEqual([state().current, state().previous], [ID2, ID1], "the one before is kept until this one has come up");
  assert.equal(readFileSync(u.fileFor("js/main.js"), "utf8"), "main 3, broken");
  // it never confirms: one more start is given it
  u = updaterAt(dir, s.origin);
  assert.equal(u.info().current.id, ID2);
  assert.equal(state().tries, 2);
  // ... and at the next the app is back on the version before, by itself
  u = updaterAt(dir, s.origin);
  assert.equal(readFileSync(u.fileFor("js/main.js"), "utf8"), "main 2");
  assert.deepEqual(state(), { bundle: "built-1", current: ID1, previous: null, confirmed: true, tries: 0, rejected: [ID2] });
  assert.deepEqual(u.info().rejected, [ID2]);
  assert.ok(!existsSync(path.join(dir, "update", ID2)), "its files are gone");
  // a version that came up stays through any number of starts
  for (let i = 0; i < 4; i++) u = updaterAt(dir, s.origin);
  assert.equal(u.info().current.id, ID1);
  // an update whose files have been damaged on disk is not served: the app's own files are
  writeFileSync(u.fileFor("js/main.js"), "short");
  u = updaterAt(dir, s.origin);
  assert.equal(u.fileFor("js/main.js"), null);
  assert.equal(u.info().current, null);
});

test("the app: a later update keeps what the earlier one had and still wants, and a newer app drops every update made for the old one", async (t) => {
  const s = await site({ "v/bbbbbbbbbbbb/js/main.js": "main 2", "v/cccccccccccc/js/vm.js": "vm 3", "assets/img/B.avif": "picture" });
  const dir = scratch();
  t.after(async () => { await s.close(); rmSync(dir, { recursive: true, force: true }); });
  let u = updaterAt(dir, s.origin);
  const first = [file("js/main.js", "main 2", "v/bbbbbbbbbbbb/js/main.js"), file("assets/img/B.avif", "picture")];
  await u.stage({ id: ID1, files: first });
  u.apply({ id: ID1, meta: metaOf(ID1, first) });
  u.confirm();
  // the next: main.js and the picture as they were, vm.js new
  s.hits.length = 0;
  const second = [...first, file("js/vm.js", "vm 3", "v/cccccccccccc/js/vm.js")];
  const seen = [];
  await u.stage({ id: ID2, files: second }, (p) => seen.push(p));
  assert.deepEqual(s.hits, ["/v/cccccccccccc/js/vm.js"], "only the new file is downloaded");
  assert.deepEqual(seen.at(-1), { done: 4, total: 4 });
  u.apply({ id: ID2, meta: metaOf(ID2, second) });
  u.confirm();
  assert.deepEqual(readdirSync(path.join(dir, "update")).sort(), [ID2, "state.json"], "the version before is cleared away once the new one has come up");
  assert.equal(readFileSync(u.fileFor("js/main.js"), "utf8"), "main 2");
  // the app itself is replaced by a newer build: it is the newer, and the old updates must not cover its files
  u = updaterAt(dir, s.origin, "built-2");
  assert.equal(u.fileFor("js/main.js"), null);
  assert.equal(u.info().current, null);
  assert.ok(!existsSync(path.join(dir, "update", ID2)));
});

test("the app: a download can be stopped, and stopping changes nothing", async (t) => {
  const big = "x".repeat(1 << 20);
  const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Length": big.length }); res.write(big.slice(0, 4096)); });   // (and never the rest)
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const dir = scratch();
  t.after(async () => { server.closeAllConnections(); await new Promise((ok) => server.close(ok)); rmSync(dir, { recursive: true, force: true }); });
  const u = updaterAt(dir, `http://127.0.0.1:${server.address().port}`);
  const going = u.stage({ id: ID1, files: [file("js/main.js", big)] });
  setTimeout(() => u.cancel(), 150);   // (the page's "Press to stop")
  await assert.rejects(going, /stopped/);
  assert.equal(u.fileFor("js/main.js"), null);
  assert.ok(!existsSync(path.join(dir, "update", ID1, "files", "js", "main.js.part")), "the half file is gone");
  assert.ok(!u.busy, "and another can be started");
});

// ---- what each side says it holds (web-dev/tools/app_manifest.py) -----------------------------------------------------------------------------
const python = (() => { try { execFileSync("python3", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

test("the published manifest delivers Aniplex's two files through the ordinary update in both apps", { skip: !python }, async () => {
  const generated = JSON.parse(execFileSync("python3", ["-c", `import sys, json, pathlib
root = pathlib.Path(${JSON.stringify(at(".").pathname)})
sys.path.insert(0, str(root / "web-dev/tools"))
import app_manifest
desc, lists = app_manifest.site_description(root / "web/app", app_manifest.visible(root / "web/app"), root / "web-dev/assets-manifest.txt", made=2000)
print(json.dumps({"m": json.loads(desc), "list": lists[0][1].decode()}))`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
  const before = generated.list.split("\n").filter((line) => line && !line.split(" ")[2].startsWith("aniplex/")).join("\n") + "\n";
  const built = { m: { ...generated.m, time: 1000, assets: { md5: md5(before), size: before.length } }, list: before };
  const expected = [
    ["assets/aniplex/index.json", 23, "eb6a03f024456b50ee62bbab40dfccfc"],
    ["assets/aniplex/text.json", 2834843, "5b24332b17d732e9e799bb84738da585"],   // (rebuilt 2026-11-17: the corners' official row breaks)
  ];
  for (const kind of ["android", "desktop"]) {
    const w = world({ built, site: generated });
    w.host.kind = kind;
    const plan = await checkUpdate(w.host, w);
    assert.equal(plan.state, "update", kind);
    assert.deepEqual(plan.files.map((f) => [f.path, f.size, f.hash]), expected, `${kind}: no unchanged app files or game media downloaded`);
    assert.equal(plan.bytes, 2834866);   // the two files (23 + 2,834,843)
    assert.equal(plan.count, 2);
    assert.equal(plan.meta.version, built.m.version, "the app code version stays the same; the asset list changes");
    for (const f of plan.files) assert.equal(f.from, `${f.path}?h=${f.hash.slice(0, 12)}`);
    const after = world({ built, site: generated, current: plan.meta });
    after.host.kind = kind;
    assert.equal((await checkUpdate(after.host, after)).state, "current", `${kind}: not downloaded again after installation`);
  }
});

test("an app build's description of itself: every app file with its hash, the game's files without Japanese's and the loose sounds, in the form the page reads", { skip: !python }, (t) => {
  const dir = scratch();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const put = (rel, body) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), body); };
  put("app/index.html", "<html>"); put("app/js/main.js", "main"); put("app/js/apphost.js", "export const SHELL = 7;\n"); put("app/style.css", "css"); put("app/.DS_Store", "x");
  put("assets/text.json", "{}"); put("assets/img/A.avif", "aaa"); put("assets/ja/text.json", "ja"); put("assets/voice/V.ogg", "v"); put("assets/se/S.ogg", "s"); put("assets/.hidden", "h");
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(path.dirname(at("web-dev/tools/app_manifest.py").pathname))}); import app_manifest, pathlib
d = pathlib.Path(${JSON.stringify(dir)}); app_manifest.bundle(d / "out", d / "app", d / "assets")`;
  execFileSync("python3", ["-c", code], { stdio: "pipe" });
  const m = readManifest(JSON.parse(readFileSync(path.join(dir, "out", "bundled.json"), "utf8"))), list = readFileSync(path.join(dir, "out", "bundled-assets.txt"), "utf8");
  assert.deepEqual(m.app, [["index.html", 6, sha("<html>")], ["js/apphost.js", 24, sha("export const SHELL = 7;\n")], ["js/main.js", 4, sha("main")], ["style.css", 3, sha("css")]]);
  assert.equal(m.shell, 7, "the app the page needs, read from apphost.js");
  assert.equal(list, `${md5("aaa")} 3 img/A.avif\n${md5("{}")} 2 text.json\n`, "no ja/, voice/, se/ or hidden files");
  assert.deepEqual(m.assets, { md5: md5(list), size: list.length });
  assert.ok(Math.abs(m.time - Date.now() / 1000) < 120, "when it was built");
  // the version is the site's name for the same files (deploy.py's v/<version>/), index.html among them: an update is named by it, so
  // a page that changed alone must have another name (an app running the update of that name refuses it: "that update is in use")
  const versionOf = (page) => {
    const digest = createHash("sha256");
    for (const [rel, body] of [["index.html", page], ["js/apphost.js", "export const SHELL = 7;\n"], ["js/main.js", "main"], ["style.css", "css"]]) digest.update(`${rel}\0${body}\0`);
    return digest.digest("hex").slice(0, 12);
  };
  assert.equal(m.version, versionOf("<html>"));
  put("app/index.html", "<html lang>");
  execFileSync("python3", ["-c", code], { stdio: "pipe" });
  const again = readManifest(JSON.parse(readFileSync(path.join(dir, "out", "bundled.json"), "utf8")));
  assert.equal(again.version, versionOf("<html lang>"));
  assert.notEqual(again.version, m.version, "index.html alone changed: another version, so another update id");
  put("app/index.html", "<html>");
  assert.deepEqual([...parseList(list).keys()], ["img/A.avif", "text.json"]);
  // the site's description: the same list of the game's files, and one list for each language folder, named under "langs"
  const manifest = path.join(dir, "assets-manifest.txt"), line = (p, body) => `${md5(body)} ${body.length} ${p}`;
  writeFileSync(manifest, [line("text.json", "{}"), line("ja/text.json", "ja"), line("ja/index.json", "{}"), line("zh/text.json", "zh"), line("img/A.avif", "aaa"), line("voice/V.ogg", "v")].join("\n") + "\n");
  const out = JSON.parse(execFileSync("python3", ["-c", `import sys, json, pathlib; sys.path.insert(0, ${JSON.stringify(path.dirname(at("web-dev/tools/app_manifest.py").pathname))}); import app_manifest
d = pathlib.Path(${JSON.stringify(dir)}); desc, lists = app_manifest.site_description(d / "app", [pathlib.Path("js/main.js")], d / "assets-manifest.txt", made=5)
print(json.dumps({"desc": json.loads(desc), "lists": [[k, v.decode()] for k, v in lists]}))`], { encoding: "utf8" }));
  assert.deepEqual(out.lists.map(([k]) => k.replace(/-[0-9a-f]{12}\.txt$/, "")), ["update/assets", "update/lang-ja", "update/lang-zh"]);
  assert.equal(out.lists[0][1], list, "the apps' list: what a build holds, no language");
  assert.equal(out.lists[1][1], `${line("ja/index.json", "{}")}\n${line("ja/text.json", "ja")}\n`);
  assert.equal(out.lists[2][1], `${line("zh/text.json", "zh")}\n`);
  for (const [k, body] of out.lists.slice(1)) assert.deepEqual(out.desc.langs[k.slice(12, 14)], { md5: md5(body), size: body.length, path: k });
  assert.equal(readManifest(out.desc).assets.md5, md5(list));
  // both builds pack it, and a deployment stores the site's
  assert.match(read("web-dev/android/build_apk.sh"), /python3 "\$here\/\.\.\/tools\/app_manifest\.py" --bundle "\$work\/stage\/assets\/www"/);
  assert.match(read("web-dev/desktop/build.sh"), /python3 \.\.\/tools\/app_manifest\.py --bundle out\/bundle/);
  assert.deepEqual(JSON.parse(read("web-dev/desktop/package.json")).build.extraResources[2], { from: "out/bundle", to: "www" });
});

test("the Android app's one permission is the internet, for its updates; the page itself stays off the network in both apps", () => {
  const manifest = read("web-dev/android/AndroidManifest.xml"), java = read("web-dev/android/src/date/arcueid/tsukirebuild/MainActivity.java"), desktop = read("web-dev/desktop/main.js");
  assert.deepEqual(manifest.match(/<uses-permission [^>]*>/g), ['<uses-permission android:name="android.permission.INTERNET" />']);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(java, /s\.setBlockNetworkLoads\(true\);/);
  assert.match(java, /if \(!"https"\.equals\(u\.getScheme\(\)\) \|\| !HOST\.equals\(u\.getHost\(\)\)\) return status\(403, "Forbidden"\);/);
  assert.match(java, /new File\(getNoBackupFilesDir\(\), "update"\)/, "kept apart from the saves, in the app's own storage");
  assert.match(desktop, /ses\.webRequest\.onBeforeRequest\(\{ urls: \["http:\/\/\*\/\*", "https:\/\/\*\/\*", "ws:\/\/\*\/\*", "wss:\/\/\*\/\*"\] \}, \(details, done\) => done\(\{ cancel: true \}\)\);/);
  assert.match(desktop, /const net = \(\) => session\.fromPartition\("update"\);/, "the updates have a session of their own");
  assert.match(desktop, /if \(!event\.senderFrame \|\| !String\(event\.senderFrame\.url\)\.startsWith\(HOME\) \|\| !Object\.hasOwn\(host, name\)\) throw Error\("not available"\);/);
  // (the text feed, textfeed.js, is the app's, not the page's: it listens on the computer itself, and the page only hands it lines through `host`)
  assert.deepEqual(JSON.parse(read("web-dev/desktop/package.json")).build.files, ["main.js", "preload.js", "updater.js", "textfeed.js", "package.json"]);
});

test("a deployment publishes what the apps update from, after every file it names", { skip: !existsSync(at("tools/cloudflare/deploy.py")) }, () => {
  const workflow = read(".github/workflows/deploy-cloudflare.yml");
  assert.match(workflow, /^      - web-dev\/assets-manifest\.txt$/m, "asset-list-only fixes trigger deployment");
  assert.match(workflow, /^      - web-dev\/tools\/app_manifest\.py$/m, "changes to the update description trigger deployment too");
  const deploy = read("tools/cloudflare/deploy.py");
  assert.match(deploy, /return \[\(key, Path\(key\), data\) for key, data in lists\], \("update\/app\.json", Path\("update\/app\.json"\), description\)/, "the lists, the languages' among them, then app.json");
  assert.match(deploy, /lists, description = update_objects\(tracked_files\("web\/app"\)\)\n    objects \+= lists/);
  assert.match(deploy, /objects\.append\(\(f"v\/\{version\}\/\{name\}", path, None\)\)\n            continue/, "the page as web/app has it, for the apps");
  assert.ok(deploy.indexOf("uploaded = sum(pool.map(upload, objects))") < deploy.indexOf("uploaded += upload(description)"));
  assert.ok(deploy.indexOf("uploaded += upload(description)") < deploy.indexOf("uploaded += upload(index)"), "then the page, last");
  assert.match(deploy, /n\.startswith\(\("assets\/", "v\/", "update\/"\)\)/);
});
