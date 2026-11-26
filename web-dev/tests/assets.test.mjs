// The game's own files are not in the repository: the site's bucket has them, the repository keeps their list (web-dev/assets-manifest.txt), and
// web-dev/tools/fetch_assets.py brings them back by it. The deployment (tools/cloudflare/deploy.py, in the repository only) stores the app alone.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const at = (name) => new URL(`../../${name}`, import.meta.url);
const read = (name) => readFileSync(at(name), "utf8");
const lines = read("web-dev/assets-manifest.txt").split("\n").filter(Boolean).map((l) => { const [md5, size, ...rest] = l.split(" "); return { md5, size: Number(size), path: rest.join(" ") }; });

test("the manifest lists every asset the site serves: an MD5, a size and a path each, in order, the loose voices and sounds left out", () => {
  assert.equal(lines.length, 11394);   // 10,517 the translation's, 474 Japanese's own (ja/, 17 of them the apps' packs), 143 Chinese's own (zh/, the patch v3.0; 5 packs), 2 official English (aniplex/), 2 Portuguese (pt/), 256 Russian (ru/, Living FLCL's translation; 9 packs)
  for (const l of lines) {
    assert.match(l.md5, /^[0-9a-f]{32}$/, l.path);
    assert.ok(Number.isInteger(l.size) && l.size > 0, l.path);
    assert.ok(l.path && !l.path.startsWith("/") && !l.path.includes(".."), l.path);
  }
  const paths = lines.map((l) => l.path);
  assert.deepEqual(paths, [...paths].sort(), "by path");
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(!paths.some((p) => p.startsWith("voice/") || p.startsWith("se/")), "the site plays those from the packs");
  for (const p of ["text.json", "system.json", "scripts/index.json", "pack/index.json", "gallery.json", "flowchart.json"]) assert.ok(paths.includes(p), p);
  assert.equal(lines.reduce((n, l) => n + l.size, 0), 3118348343, "3.1 GB");
  assert.ok(paths.includes("ja/index.json") && paths.filter((p) => p.startsWith("ja/")).length === 474, "Japanese's own, under ja/");
  assert.ok(paths.includes("zh/index.json") && paths.filter((p) => p.startsWith("zh/")).length === 143, "Chinese's own, under zh/");
  for (const lang of ["ja", "zh"]) assert.ok(paths.includes(`${lang}/pack/index.json`), `${lang}: the apps' packs (build_langpacks.py)`);
  assert.deepEqual(paths.filter((p) => p.startsWith("aniplex/")), ["aniplex/index.json", "aniplex/text.json"], "both official English files are published for the site and app updates");
  assert.deepEqual(paths.filter((p) => p.startsWith("pt/")), ["pt/index.json", "pt/text.json"], "Portuguese's lines, for the site and app updates (ordinary assets: no download of its own in the apps)");
});

test("fetch_assets.py reads that list, fetches from the site, and can take the scripts and tables alone", () => {
  const tool = read("web-dev/tools/fetch_assets.py");
  assert.match(tool, /MANIFEST = ROOT \/ "web-dev\/assets-manifest\.txt"/);
  assert.match(tool, /SITE = "https:\/\/arcueid\.date\/assets\/"/);
  assert.match(tool, /MEDIA = \("img\/", "ui\/", "bgm\/", "movie\/", "pack\/", "sys\/", "fonts\/"\)/);
  assert.match(tool, /return path\.removeprefix\("ja\/"\)\.removeprefix\("zh\/"\)\.removeprefix\("ru\/"\)\.startswith\(MEDIA\)/, "Japanese's, Chinese's and Russian's own media are media too");
  const media = ["img/", "ui/", "bgm/", "movie/", "pack/", "sys/", "fonts/"];
  const tables = lines.filter((l) => !media.some((m) => l.path.replace(/^(ja|zh|ru)\//, "").startsWith(m)));
  assert.ok(tables.every((l) => l.path.endsWith(".json")), "everything else is a script or a table");
  assert.ok(tables.reduce((n, l) => n + l.size, 0) < 100e6, "small enough to fetch for the tests");   // (92.9 MB with Russian's lines and the scripts its translators changed)
  assert.match(tool, /part\.stat\(\)\.st_size != size or digest\.hexdigest\(\) != md5/, "a download is checked against the list before it is kept");
});

test("what needs the files says how to get them", () => {
  assert.match(read("web/server.py"), /python3 web-dev\/tools\/fetch_assets\.py/);
  for (const script of ["web-dev/desktop/build.sh", "web-dev/android/build_apk.sh"]) assert.match(read(script), /assets\/text\.json" \] \|\| \{ echo "the game's files are not in web\/assets: run python3 web-dev\/tools\/fetch_assets\.py first"/, script);
});

// (the deployment and git are the repository's; the working folder this is developed in has neither)
// What a browser keeps for 30 days and what for 5 minutes (deploy.py cache_control; the Pages worker has the same rule). A language's own pictures,
// faces, movies and content-named packs were left at 5 minutes until 2026-11-16: the rule named only the folders at the top.
test("the cache rule: media are kept 30 days in a language's folder as at the top; lists, scripts, tables and interface art 5 minutes", { skip: !existsSync(at("tools/cloudflare/deploy.py")) }, () => {
  const paths = lines.map((l) => l.path);
  const keys = [...paths.map((p) => `assets/${p}`), "index.html", "js/main.js", "style.css", "update/app.json", "v/f24929f4ffdb/js/main.js", "assets/jazz/img/a.avif", "assets/ja/pack/index-0123456789.json"];
  const long = new Set(JSON.parse(execFileSync("python3", ["-c", `import sys, json
sys.path.insert(0, ${JSON.stringify(at("tools/cloudflare").pathname)})
import deploy
print(json.dumps([k for k in json.load(sys.stdin) if deploy.cache_control(k) == deploy.LONG]))`], { input: JSON.stringify(keys), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })));
  const kind = (p) => { const parts = p.split("/"), lang = ["ja", "zh", "ru", "aniplex"].includes(parts[0]) ? parts.shift() : null; return { lang, dir: parts.length > 1 ? parts[0] : null, file: parts.at(-1) }; };
  for (const p of paths) {
    const { dir, file } = kind(p);
    const media = ["img", "movie", "fonts", "bgm", "sys"].includes(dir) || (dir === "pack" && /^[a-z]+-[0-9a-f]{10}\./.test(file));
    assert.equal(long.has(`assets/${p}`), media, p);
  }
  // each language has something of each kind for this to say anything
  for (const lang of ["ja", "zh"]) for (const dir of ["img", "movie", "fonts", "pack", "ui"]) assert.ok(paths.some((p) => p.startsWith(`${lang}/${dir}/`)), `${lang}/${dir}`);
  for (const dir of ["movie", "fonts", "pack", "ui", "scripts"]) assert.ok(paths.some((p) => p.startsWith(`ru/${dir}/`)), `ru/${dir}`);   // (Russian redrew no story picture)
  assert.ok(long.has("assets/ja/pack/ja-34a76cd29f.pack") || paths.every((p) => p !== "ja/pack/ja-34a76cd29f.pack"));
  for (const p of ["ja/pack/index.json", "zh/pack/index.json", "pack/index.json", "ja/index.json", "zh/text.json", "aniplex/text.json", "ja/ui/CG_THUMB_PARTS_JA/cg_thumb_all.webp"]) if (paths.includes(p)) assert.ok(!long.has(`assets/${p}`), `${p}: asked about again after 5 minutes`);
  assert.deepEqual(["index.html", "js/main.js", "style.css", "update/app.json", "assets/jazz/img/a.avif"].filter((k) => long.has(k)), [], "the app at its plain addresses, and a folder that is no language");
  assert.ok(long.has("v/f24929f4ffdb/js/main.js") && long.has("assets/ja/pack/index-0123456789.json"), "the app's content-named copy; a content-named index");
  // the Pages worker answers /assets/ by the same rule
  const worker = /const MEDIA = (\/.+\/);/.exec(read("web/cloudflare/worker.js"));
  assert.ok(worker);
  const re = new RegExp(worker[1].slice(1, -1));
  for (const k of keys.filter((x) => x.startsWith("assets/"))) assert.equal(re.test(k), long.has(k), `worker.js: ${k}`);
  // the languages named are the ones the apps' lists know
  assert.match(read("tools/cloudflare/deploy.py"), /% "\|"\.join\(app_manifest\.PACKED\)\)/);
  // (app_manifest.py reads both from the page's table of languages, web/app/js/languages.js: the order of PACKED is the cache rule's)
  const langs = JSON.parse(execFileSync("python3", ["-I", "-c", "import json, sys; sys.path.insert(0, 'web-dev/tools'); import app_manifest as a; print(json.dumps([a.PACKED, a.LANG_DIRS]))"], { cwd: at("."), encoding: "utf8" }));
  assert.deepEqual(langs, [["ja", "zh", "ru"], ["ja", "zh", "pt", "ru"]], "the languages with media of their own; those the apps download");
});

test("in the repository nothing under web/assets is tracked, and the deployment stores the app alone and refuses if that changes", { skip: !existsSync(at("tools/cloudflare/deploy.py")) }, () => {
  assert.equal(execFileSync("git", ["ls-files", "--", "web/assets"], { cwd: at("."), encoding: "utf8" }).trim(), "");
  assert.match(read("web/.gitignore"), /^assets\/$/m, "fetched files are ignored");
  const deploy = read("tools/cloudflare/deploy.py");
  assert.match(deploy, /objects, index, version = site_objects\(tracked_files\("web\/app"\)\)/);
  assert.doesNotMatch(deploy, /tracked_files\("web\/assets"\)/);
  assert.match(deploy, /raise RuntimeError\("web\/assets is tracked again/);
  assert.doesNotMatch(deploy, /delete_object/, "a deployment never deletes from the bucket");
});
