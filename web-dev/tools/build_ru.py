#!/usr/bin/env python3
"""build_ru.py [source] [text] [scripts] [tables] [ui] [movie] [font]: Living FLCL's Russian translation -> web/assets/ru, for the language switch.

The translation came (2026-11-22) as a patch for the port's Windows app: a zip laid over the app's folder, with a language folder of its own
(resources/www/assets/ru), the app's scripts with Russian added to them, the game's scripts where the translators changed them, and the app's wrapper.
Only the language is taken from it. The source is the unpacked zip (default ~/Downloads/tsukire-pc-port/ru-source); nothing in it is run.

The translation is of the English's kind (the Tsukihimates scripts, lines numbered as the port's), with two things of its own:

  - 202 scripts differ from the English ones. Where the English glues a line to the one before with a pause between (WNTY, WKAD F823), the Russian often
    reads on without it, or splits the sentence elsewhere, so those commands are passed over there (DMMY, a command the game does not know and skips).
    The Russian lines are written for these scripts, so the language plays its own (languages.js "scripts": "ru") and a save is carried between the two
    by its line (langsave.js), as between English and Japanese.
  - It is unfinished. It has the prologue, all of Arcueid's route and Ciel's route up to the first branch on day 14; what it has not translated (the
    other branch of Ciel's day 14, day 15, the Q&A corners) was left in Japanese in its files, on scripts changed towards the Japanese ones; the
    text.json they sent on 2026-11-25 has the English there instead (untranslated). A scene with any line left untranslated is played in English whole
    here: the English lines on the English script (the port's own files, so nothing of it is in ru/). A few Russian lines in those scenes (names, a
    choice) go with them.

  ru/text.json            every line: the Russian of the scenes it has, the English everywhere else. Three marks the 2026-11-22 files had letter for
                          letter in Cyrillic (a Latin-to-Cyrillic table was run over the whole file) are put back: @g, @t, @k (the 2026-11-25 text.json
                          has them right).
  ru/scripts/N.json       the translators' script, for the Russian scenes whose script is not the English one
  ru/system.json          the system's words (laid over the shared table: vm.js init)
  ru/flowchart.json, ru/gallery.json   titles, notes and credits
  ru/ui/...               the interface art they redrew (title, menu, save, config, gallery, the start-up notices): only what is not the shared picture,
                          and not the Q&A corners' balloons (BALLOONS)
  ru/movie/...            their chapter titles, the logo and the prologue with Russian words
  ru/fonts/Russian-Story.woff2     the story's face. The patch's own (fonts/Mahoyo-Story.ttf) is 89 letters cut from Microsoft's Calibri, which is
                          not ours to hand out; Carlito (SIL OFL 1.1) is the free face made to Calibri's widths, cut here to the letters the Russian
                          and English lines use (macOS has it; fontTools with brotli: FONTTOOLS_PYTHON names a Python that has them),
                          under a name of its own (FONT_NAME: "Carlito" is a reserved name)
  ru/index.json           the list of all of it, which app/js/lang.js reads
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "web" / "assets"
OUT = ASSETS / "ru"
SOURCE = Path.home() / "Downloads" / "tsukire-pc-port" / "ru-source"
CARLITO = Path("/System/Library/PrivateFrameworks/FontServices.framework/Versions/A/Resources/Fonts/ApplicationSupport/Carlito.ttc")
FONT = "fonts/Russian-Story.woff2"
# Carlito is a Reserved Font Name: a cut-down copy is a modified version and may not carry it, so the file's own name is this one (its copyright and
# licence lines stay as they are).
FONT_NAME = "Russian Story"

CYRILLIC = re.compile("[Ѐ-ӿ]")
JAPANESE = re.compile("[぀-ヿ一-鿿]")
LATIN_WORD = re.compile("[A-Za-z\ue000-\uf8ff]{2,}")
LINE = re.compile(r"\$(\d+)")
# The marks as the patch's files have them: the mark's letter went through the same Latin-to-Cyrillic table as the Japanese left in the file ("7.62mm"
# is "7.62оо" there). @g: the second face to the end of the line, @t: two parts typed side by side, @k: wait for a key.
MARKS = {"@и": "@g", "@х": "@t", "@м": "@k"}
# The Q&A corners' balloons: the patch has thirteen of them in the original's sizes, and its corners are not translated. Here the corners are the
# English ones, lines and rows, so their balloons are the English ones too (the shared pictures).
BALLOONS = "tw_t_L"
# Rows the translators set flush against the text box's right edge with spaces (the 2026-11-25 text.json): leading ones, or in 23613 the gap
# before its second part (@t), its two parts side by side on one row. In the port's face each of these ends under 8 px from the edge, or past it:
# the port itself breaks 31490 in two, and WebKit, which sets a row a pixel or two wider than Chromium, breaks several more (measured:
# 03_00_ARC03_5B's mirrored lines, 09_01_CIEL09_6, 12_01_CIEL12_4B, 13_01_01_CIEL13_5B). One space less (10 px) keeps each row whole; nothing else
# in the line changes. Text id -> (spaces in the line's longest run of them in their file, spaces kept). Measured in Chromium with the story face
# at 44 px and its letter spacing; a line whose run no longer has the count measured stops the build, so a new text.json is measured again.
FLUSH_RIGHT = {
    4527: (62, 61), 4529: (72, 71), 4531: (89, 88), 8449: (70, 69), 31427: (42, 41), 31490: (102, 101), 31600: (130, 129), 31602: (90, 89),
    31604: (95, 94), 31606: (85, 84), 33447: (58, 57), 33449: (73, 72), 35092: (52, 51), 35106: (114, 113), 35927: (110, 109), 35929: (96, 95),
    35931: (107, 106), 35933: (92, 91), 23613: (37, 36),
}


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def dump(value, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, separators=(",", ":"))


def lines_of(script):
    """The numbers of the lines a script's commands name."""
    return {int(m) for op in script["ops"] for arg in op[1:] if isinstance(arg, str) for m in LINE.findall(arg)}


def japanese(line):
    return bool(JAPANESE.search(line))


def untranslated(line, english):
    """A line the translation has not done. The 2026-11-22 text.json left those in Japanese; the one they sent on 2026-11-25 has the port's English
    line there instead (the same 56 scenes either way): a line with words in Latin letters (or the English's italic letters, U+E000-U+F8FF) and no
    Cyrillic that is the English line itself."""
    return japanese(line) or (line == english and not CYRILLIC.search(line) and bool(LATIN_WORD.search(line)))


def plan(source=SOURCE, assets=ASSETS):
    """What is Russian: {"russian": the scripts played in Russian, "english": those played in English, "own": the Russian ones whose script is the
    translators' own, "text": every line}."""
    theirs = source / "resources" / "www" / "assets"
    ru = load(theirs / "ru" / "text.json")
    en = load(assets / "text.json")
    if len(ru) != len(en):
        raise SystemExit(f"the patch has {len(ru)} lines, the port {len(en)}")
    count = len(load(assets / "scripts" / "index.json")["names"])
    russian, english, own = [], [], []
    keep = set()      # the lines of the scenes played in Russian
    drop = set()      # the lines of the scenes played in English
    for i in range(count):
        mine = (assets / "scripts" / f"{i}.json").read_bytes()
        raw = (theirs / "scripts" / f"{i}.json").read_bytes()
        script = json.loads(raw)
        ids = lines_of(script)
        if ids != lines_of(json.loads(mine)):
            raise SystemExit(f"script {i}: the patch's names other lines than the port's")
        if any(untranslated(ru[k], en[k]) for k in ids):
            english.append(i)
            drop |= ids
            continue
        russian.append(i)
        keep |= ids
        if raw != mine:
            if script.get("name") != json.loads(mine).get("name"):
                raise SystemExit(f"script {i}: another scene")
            own.append(i)
    text = []
    for k, line in enumerate(ru):
        # a line of a Russian scene is the patch's; a line of no scene (the system's own) too, unless it was left in Japanese
        mine = k in keep or (k not in drop and not untranslated(line, en[k]))
        if mine and CYRILLIC.search(line):
            for mark, real in MARKS.items():
                line = line.replace(mark, real)
        text.append(line if mine else en[k])
    for k, (theirs, kept) in FLUSH_RIGHT.items():
        run = max(re.finditer(" +", text[k]), key=lambda m: len(m.group()), default=None)
        if not run or len(run.group()) != theirs:
            raise SystemExit(f"line {k}: its longest run of spaces is not the {theirs} FLUSH_RIGHT was measured for: measure its row again")
        text[k] = text[k][:run.start()] + " " * kept + text[k][run.end():]
    return {"russian": russian, "english": english, "own": own, "text": text, "shared": sorted(keep & drop)}


def build_text(p):
    dump(p["text"], OUT / "text.json")
    en = load(ASSETS / "text.json")
    n = sum(1 for a, b in zip(p["text"], en) if a != b)
    print(f"text.json: {len(p['text'])} lines, {n} the translation's; {len(p['russian'])} scripts in Russian, {len(p['english'])} in English")
    if p["shared"]:
        print(f"  lines named by a Russian scene and an English one (Russian in both): {p['shared']}")


def build_scripts(p, source=SOURCE):
    shutil.rmtree(OUT / "scripts", ignore_errors=True)
    (OUT / "scripts").mkdir(parents=True)
    for i in p["own"]:
        shutil.copyfile(source / "resources" / "www" / "assets" / "scripts" / f"{i}.json", OUT / "scripts" / f"{i}.json")
    print(f"scripts: {len(p['own'])} of the translators' own")


def build_tables(source=SOURCE):
    theirs = source / "resources" / "www" / "assets" / "ru"
    system = load(theirs / "system.json")
    if set(system) - {"messages", "saves", "help"}:
        raise SystemExit(f"system.json: keys the game does not lay over ({sorted(system)})")
    dump(system, OUT / "system.json")
    for name in ("flowchart.json", "gallery.json"):
        table, mine = load(theirs / name), load(ASSETS / name)
        if set(table) != set(mine):
            raise SystemExit(f"{name}: not the port's table")
        dump(table, OUT / name)
    print("tables: system.json, flowchart.json, gallery.json")


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def build_media(kind, source=SOURCE):
    """ui/ or movie/: the patch's files that are not the shared ones (it carries a whole copy of the interface art)."""
    theirs = source / "resources" / "www" / "assets" / "ru" / kind
    shutil.rmtree(OUT / kind, ignore_errors=True)
    n = size = 0
    for path in sorted(theirs.rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        rel = path.relative_to(theirs)
        shared = ASSETS / kind / rel
        if not shared.exists():
            raise SystemExit(f"{kind}/{rel}: a file the game does not have")
        if md5(path) == md5(shared):
            continue
        if kind == "ui" and rel.name.startswith(BALLOONS):
            continue
        (OUT / kind / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, OUT / kind / rel)
        n += 1
        size += path.stat().st_size
    print(f"{kind}: {n} files, {size / 1e6:.1f} MB")


def letters(p):
    """The letters the face must have: every one in the language's lines (Russian and the English it falls back to), its tables, and the usual
    punctuation, so that a row never changes face mid-word."""
    used = set()
    for line in p["text"]:
        used.update(line)
    for name in ("system.json", "flowchart.json", "gallery.json"):
        used.update(json.dumps(load(OUT / name), ensure_ascii=False))
    used.update(chr(c) for c in range(0x20, 0x7f))
    used.update(chr(c) for c in range(0xa0, 0x180))
    used.update(chr(c) for c in range(0x400, 0x460))
    used.update("–—―‘’‚“”„…‰‹›€№™−")
    return "".join(sorted(c for c in used if ord(c) >= 0x20 and not (0xe000 <= ord(c) <= 0xf8ff)))


def build_font(p):
    py = os.environ.get("FONTTOOLS_PYTHON") or sys.executable
    if subprocess.run([py, "-c", "import fontTools, brotli"], capture_output=True).returncode:
        raise SystemExit("fontTools and brotli are needed for the font: pip install fonttools brotli, or set FONTTOOLS_PYTHON")
    if not CARLITO.exists():
        raise SystemExit(f"Carlito is not at {CARLITO}")
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "fonts").iterdir():
        old.unlink()
    code = (
        "import sys\n"
        "from fontTools.ttLib import TTCollection\n"
        "from fontTools import subset\n"
        "ttc, out, text = sys.argv[1], sys.argv[2], open(sys.argv[3], encoding='utf-8').read()\n"
        "font = next(f for f in TTCollection(ttc).fonts if f['name'].getDebugName(4) == 'Carlito')\n"
        "o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'liga', 'locl', 'mark', 'mkmk', 'ccmp']; o.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]\n"
        "s = subset.Subsetter(o); s.populate(text=text); s.subset(font)\n"
        "for rec in list(font['name'].names):\n"
        "    if rec.nameID in (1, 3, 4, 6): font['name'].setName(sys.argv[4] if rec.nameID != 6 else sys.argv[4].replace(' ', ''), rec.nameID, rec.platformID, rec.platEncID, rec.langID)\n"
        "font.flavor = 'woff2'; font.save(out)\n"
        "print(len(font.getBestCmap()))\n"
    )
    wanted = OUT / "fonts" / ".letters"
    wanted.write_text(letters(p), encoding="utf-8")
    try:
        done = subprocess.run([py, "-c", code, str(CARLITO), str(OUT / FONT), str(wanted), FONT_NAME], capture_output=True, text=True)
    finally:
        wanted.unlink()
    if done.returncode:
        raise SystemExit(done.stderr)
    print(f"{FONT}: {done.stdout.strip()} letters, {(OUT / FONT).stat().st_size / 1e3:.0f} KB")


def build_index():
    files = sorted(str(p.relative_to(OUT)).replace(os.sep, "/") for p in OUT.rglob("*")
                   if p.is_file() and p.name != "index.json" and not p.name.startswith(".") and "pack" not in p.relative_to(OUT).parts)
    dump({"files": files}, OUT / "index.json")
    size = sum((OUT / f).stat().st_size for f in files)
    print(f"index.json: {len(files)} files, {size / 1e6:.1f} MB")


def main():
    args = sys.argv[1:]
    global SOURCE
    if args and os.path.isdir(args[0]):
        SOURCE = Path(args.pop(0))
    steps = args or ["text", "scripts", "tables", "ui", "movie", "font"]
    p = plan(SOURCE)
    OUT.mkdir(parents=True, exist_ok=True)
    if "text" in steps:
        build_text(p)
    if "scripts" in steps:
        build_scripts(p)
    if "tables" in steps:
        build_tables()
    if "ui" in steps:
        build_media("ui")
    if "movie" in steps:
        build_media("movie")
    if "font" in steps:
        build_font(p)
    build_index()


if __name__ == "__main__":
    main()
