# Ambient Colorwheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine iDrive-7-App `gs_ambient` („Ambient“) im Fork von idrive7-apps: Farbrad für zwei Ambiente-Zonen, Helligkeit, acht Effekte, Favoriten; Lichtsteuerung in Version 1 nur simuliert, echte Wege im Code gesperrt.

**Architecture:** Fork von [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) mit flacher App unter `apps/gs_ambient/`. Reine Logik-Module (Farbe, Zustand, Effekte, Sender) sind ohne Kit testbar; die Seiten zeichnen mit dem Kit (`kit/runtime/gauges.js`, `record.js`) und bekommen Touch/Controller über `cv.target`. Zwei kleine Kit-Erweiterungen: Umlaute in den Schriften und `cv.target`-Optionen `drag`/`turn`.

**Tech Stack:** Node.js (App: Node 8 auf der Headunit; Tests/Emulator: Node am Mac), Python 3 (`build.py`, `bake_fonts.py`, Pillow), Kit-Emulator `kit/tools/emu.js`.

**Spec:** `docs/superpowers/specs/2026-10-31-ambient-colorwheel-design.md`

## Global Constraints

- Arbeitsverzeichnis: `/Users/gilniclasschwarte/Projekte/BMWApps/ambient-colorwheel` (alle Pfade relativ dazu).
- App-ID und Ordner: `gs_ambient`, Ordner `apps/gs_ambient/`, flach (keine Unterordner: `build.py` würde sie als Datenpaket verpacken).
- App-Code (`apps/gs_ambient/*.js`) muss unter **Node 8** laufen: kein `?.`, kein `??`, keine Klassenfelder, kein `catch` ohne Variable, kein Objekt-Spread (`{...a}`), kein `Array.prototype.flat`, kein `Object.fromEntries`. Tests unter `kit/tools/` dürfen modernes Node nutzen.
- App-Code lädt das Kit als `./kit/...` (dort legt `build.py` es ab), z. B. `require('./kit/gauges')`.
- Oberfläche auf Deutsch. Code-Kommentare auf Englisch im Stil des Kits (nur Einschränkungen, die der Code nicht zeigt).
- Nichts sendet ans Auto: Standard-Lichtsteuerung „Simuliert“; „Profil umschalten“ und „BDC-Stellgliedtest“ sind `validated: false` und senden nie.
- `oap-sdk/`, `dist/`, `*.mgu`, `*.tgz` niemals committen (stehen in Upstreams `.gitignore`).
- Upstream-Dateien nur dort ändern, wo dieser Plan es sagt: `kit/tools/bake_fonts.py`, `kit/runtime/fonts/*.json`, `kit/runtime/record.js`, `kit/runtime/display.js`, neue Tests in `kit/tools/`.
- Tests laufen mit `node kit/tools/test_gs_ambient.js` und `node kit/tools/test_target_input.js` (Exit-Code 0 = alles grün).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `kit/tools/bake_fonts.py` (ändern) | Umlaute + ß im Zeichensatz, Schriftordner per Umgebungsvariable, `cacheKey` in den Atlanten |
| `kit/runtime/fonts/{label,bold,num,light,gear}.json` (neu gebacken) | Glyphen-Atlanten mit Umlauten |
| `kit/runtime/record.js` (ändern) | `target(..., opts)` speichert `opts.drag` / `opts.turn` |
| `kit/runtime/display.js` (ändern) | `_touch` leitet Ziehen an `drag`-Ziele, `_ccu` leitet Drehen an `turn`-Ziele |
| `kit/tools/test_target_input.js` (neu) | Tests der Kit-Erweiterung |
| `kit/tools/test_gs_ambient.js` (neu) | Tests der App |
| `apps/gs_ambient/app.json` | Manifest: ID, Titel, Signale, Bildschirm, Einstellungen |
| `apps/gs_ambient/icon.png` | Kachel-Icon (aus `make_icon.js`) |
| `apps/gs_ambient/main.js` | Verdrahtung: Zustand, Fahrdaten, Effekt-Schleife, Sender, UI |
| `apps/gs_ambient/color.js` | Farbrad-Mathematik, RGB, Drahtformat |
| `apps/gs_ambient/state.js` | Zustand + atomares Speichern |
| `apps/gs_ambient/fx.js` | Effekt-Register, Regler-Hilfen, Effekt-Schleife |
| `apps/gs_ambient/fx_{cycle,fade,breathe,rpm,speed,mode,dynamics,music}.js` | je ein Effekt |
| `apps/gs_ambient/inputs.js` | Fahrdaten → Effekt-Eingaben, Fahrmodus/Musik simuliert in Demo |
| `apps/gs_ambient/light.js` | Backend-Auswahl, Sender (Drosselung, Wiederholung, Stopp) |
| `apps/gs_ambient/light_{sim,profile,bdc}.js` | Backends (sim aktiv, die anderen gesperrt) |
| `apps/gs_ambient/ui.js` | Seitenrahmen, Status-Abzeichen, Aktionen, Zeichenschleife |
| `apps/gs_ambient/ui_parts.js` | `pill`, `pillWidth`, `slider` |
| `apps/gs_ambient/ui_color.js`, `ui_effects.js`, `ui_favs.js` | die drei Seiten |
| `apps/gs_ambient/README.md` | Kurzbeschreibung der App |
| `docs/am-auto-pruefen.md` | Checkliste für die Prüfung am Auto |
| `docs/screens/*.png` | Emulator-Bildschirmfotos der drei Seiten |

---

### Task 1: Fork einrichten

**Files:**
- Modify: `.gitignore` (Merge-Konflikt auflösen)
- Create (nicht committet): `oap-sdk/index.js`, `oap-sdk/package.json`

**Interfaces:**
- Consumes: –
- Produces: Repo enthält Upstream-Kit und -Apps; `python3 kit/tools/build.py <id>` und `node kit/tools/emu.js <id>` laufen lokal.

- [ ] **Step 1: Upstream holen und zusammenführen**

```bash
cd /Users/gilniclasschwarte/Projekte/BMWApps/ambient-colorwheel
git remote add upstream https://github.com/cauliflowermossgrape/idrive7-apps.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories -m "Merge idrive7-apps (upstream) als Basis" || true
git status --short
```

Expected: Konflikt nur in `.gitignore` (`AA .gitignore` bzw. `both added`).

- [ ] **Step 2: `.gitignore` auflösen**

Upstreams Datei übernehmen (sie enthält schon `oap-sdk`, `dist/`, `*.mgu`, `*.tgz`) und den Brainstorming-Ordner anhängen:

```bash
git checkout --theirs .gitignore
printf '\n# brainstorming companion (local)\n.superpowers/\n' >> .gitignore
git add .gitignore
git commit --no-edit
```

Expected: `git log --oneline -3` zeigt den Merge-Commit; `git status` sauber.

- [ ] **Step 3: Platzhalter-SDK für den Emulator anlegen**

`oap-sdk/index.js`:

```js
'use strict';
// placeholder: the emulator replaces kit/mgu, so nothing here runs
module.exports = {};
```

`oap-sdk/package.json`:

```json
{"name":"oap-sdk","version":"0.0.0-placeholder"}
```

Run: `git status --short`
Expected: keine Zeile mit `oap-sdk` (ignoriert).

- [ ] **Step 4: Grundzustand prüfen**

```bash
python3 kit/tools/build.py redline
node kit/tools/test_live_adjustments.js
```

Expected: Build endet ohne Fehler, `dist/redline@*.tgz` existiert; der Test meldet Erfolg (Exit-Code 0).

---

### Task 2: Kit-Schriften mit Umlauten

**Files:**
- Modify: `kit/tools/bake_fonts.py`
- Regenerate: `kit/runtime/fonts/label.json`, `bold.json`, `num.json`, `light.json`, `gear.json`

**Interfaces:**
- Consumes: –
- Produces: `fonts.get('label'|'bold'|'light', size, text).glyphs` enthält Codes 228, 246, 252, 196, 214, 220, 223; jede Familie hat `cacheKey: 'de1'`.

- [ ] **Step 1: Fehlende Glyphen nachweisen**

```bash
node -e "const f=require('./kit/runtime/fonts');const g=f.get('bold',24,'a').glyphs;console.log('äöüÄÖÜß'.split('').map(c=>c+':'+!!g[c.codePointAt(0)]).join(' '))"
```

Expected: `ä:false ö:false ü:false Ä:false Ö:false Ü:false ß:false`

- [ ] **Step 2: `bake_fonts.py` ändern**

In `kit/tools/bake_fonts.py` ersetzen:

```python
FONTDIR = '/usr/share/fonts/truetype/ubuntu'

TEXT = ''.join(chr(c) for c in range(32, 127)) + '°μ│·–—…×±²³€↑↓→←✓✕'
```

durch:

```python
FONTDIR = os.environ.get('UBUNTU_FONT_DIR', '/usr/share/fonts/truetype/ubuntu')
# bumped whenever the atlases change: the renderer keys its glyph textures by family, size and this
CACHE_KEY = 'de1'

TEXT = ''.join(chr(c) for c in range(32, 127)) + '°μ│·–—…×±²³€↑↓→←✓✕' + 'äöüÄÖÜß'
```

und in `main()`:

```python
        data = {'family': fam, 'source': fname, 'sizes': [bake(fname, var, s, cs) for s, cs in sizes]}
```

durch:

```python
        data = {'family': fam, 'source': fname, 'cacheKey': CACHE_KEY, 'sizes': [bake(fname, var, s, cs) for s, cs in sizes]}
```

- [ ] **Step 3: Ubuntu-Schrift holen und prüfen**

```bash
mkdir -p /tmp/ubuntu-font
curl -fL -o "/tmp/ubuntu-font/Ubuntu[wdth,wght].ttf" "https://github.com/google/fonts/raw/main/ufl/ubuntu/Ubuntu%5Bwdth,wght%5D.ttf"
python3 -c "from PIL import ImageFont; f=ImageFont.truetype('/tmp/ubuntu-font/Ubuntu[wdth,wght].ttf', 24); f.set_variation_by_axes([85, 700]); print('ok', f.getlength('Ä'))"
```

Expected: `ok <Zahl>`. Falls `curl` 404 meldet: die Datei liegt im Repo `google/fonts` unter `ufl/ubuntu/`; den aktuellen Dateinamen dort nachsehen und den Befehl anpassen. Die Achsen `wdth,wght` sind Pflicht (`bake_fonts.py` setzt sie).

- [ ] **Step 4: Atlanten neu backen**

```bash
UBUNTU_FONT_DIR=/tmp/ubuntu-font python3 kit/tools/bake_fonts.py
```

Expected: fünf Zeilen `label: [18, 24, 32, 44] -> … KiB` usw., ohne Fehler.

- [ ] **Step 5: Glyphen prüfen**

```bash
node -e "const f=require('./kit/runtime/fonts');for(const fam of ['label','bold','light']){const x=f.get(fam,24,'a');console.log(fam,x.cacheKey,'äöüÄÖÜß'.split('').every(c=>x.glyphs[c.codePointAt(0)]))}"
```

Expected:
```
label de1 true
bold de1 true
light de1 true
```

- [ ] **Step 6: Bestehende Kit-Tests laufen weiter**

```bash
node kit/tools/test_zh.js && node kit/tools/test_live_adjustments.js && python3 kit/tools/build.py redline
```

Expected: alle ohne Fehler.

- [ ] **Step 7: Commit**

```bash
git add kit/tools/bake_fonts.py kit/runtime/fonts/label.json kit/runtime/fonts/bold.json kit/runtime/fonts/num.json kit/runtime/fonts/light.json kit/runtime/fonts/gear.json
git commit -m "kit: Schriften mit deutschen Umlauten und ß neu gebacken"
```

---

### Task 3: Kit-Erweiterung Ziehen und Drehen

**Files:**
- Modify: `kit/runtime/record.js` (Methode `target`, ca. Zeile 111-116)
- Modify: `kit/runtime/display.js` (`_touch` ca. Zeile 417, `_ccu` ca. Zeile 342-344)
- Test: `kit/tools/test_target_input.js`

**Interfaces:**
- Consumes: –
- Produces:
  - `cv.target(x, y, w, h, run, key, r, opts)` mit `opts.drag(phase: 1|2|3, x, y)` und `opts.turn(d: number)`; gespeichert als `target.drag` / `target.turn`.
  - Touch, das auf einem `drag`-Ziel aufsetzt, geht bis zum Loslassen an `drag` (kein `run` per Touch).
  - Drehen, während der Controller-Fokus auf einem `turn`-Ziel steht, ruft `turn(d)`; der Fokus bleibt.

- [ ] **Step 1: Failing test schreiben**

`kit/tools/test_target_input.js`:

```js
'use strict';

// Kit targets that follow a finger (opts.drag) or take the controller's knob (opts.turn), against a Display
// with a stubbed renderer. No SDK, renderer or HMI needed:
//   node kit/tools/test_target_input.js

const assert = require('assert');
const { Recorder } = require('../runtime/record');
const { Display } = require('../runtime/display');

const log = { info() {}, warn() {}, debug() {}, error(...a) { throw new Error(a.map(String).join(' ')); } };

/** A Display as where the kit runs the screen (own), at scale 1, with these page targets. */
function display(targets) {
    const d = new Display({}, log, { screens: [] }, { get() {}, onChange() {} }, () => ({}));
    d.own = () => true;
    d.place = { scale: 1, ox: 0, oy: 0, x: 0, w: 1920, h: 720 };
    d.barH = () => 48;
    d.buttons = () => [];
    d.tabs = [];
    d._repaint = () => {};
    d.pageTargets = targets;
    return d;
}
const ccu = (d, k, pb, df) => d._ccu({ frontRotaryEncoderOperation: k, frontRotaryEncoderPushButton: pb || 0, frontRotaryEncoderDeflection: df || 0 });

const tests = [
    ['record.target keeps drag and turn', () => {
        const r = new Recorder(100, 100), drag = () => {}, turn = () => {};
        r.target(0, 0, 10, 10, null, 'a', 0, { drag, turn });
        r.target(0, 0, 10, 10, null, 'b');
        assert.strictEqual(r.targets[0].drag, drag);
        assert.strictEqual(r.targets[0].turn, turn);
        assert.strictEqual(r.targets[1].drag, undefined);
        assert.strictEqual(r.targets[1].turn, undefined);
    }],
    ['a finger that lands on a drag target is followed until it lifts', () => {
        const seen = [];
        let runs = 0;
        const d = display([{ x: 100, y: 100, w: 200, h: 200, key: 'wheel', run: () => { runs++; }, drag: (ph, x, y) => seen.push([ph, x, y]) }]);
        d._touch(1, 150, 150);
        d._touch(2, 180, 160);
        d._touch(2, 400, 400);          // outside the target: still followed
        d._touch(3, 410, 410);
        d._touch(2, 150, 150);          // lifted: nothing more
        assert.deepStrictEqual(seen, [[1, 150, 150], [2, 180, 160], [2, 400, 400], [3, 410, 410]]);
        assert.strictEqual(runs, 0);
    }],
    ['a tap on a plain target still runs it', () => {
        let runs = 0;
        const d = display([{ x: 0, y: 0, w: 50, h: 50, key: 'btn', run: () => { runs++; } }]);
        d._touch(1, 10, 10);
        d._touch(3, 12, 12);
        assert.strictEqual(runs, 1);
    }],
    ['the knob turns a turn target while it has the focus; pushing moves on', () => {
        const turns = [];
        let presses = 0;
        const d = display([
            { x: 0, y: 0, w: 50, h: 50, key: 'wheel', run: () => { presses++; }, turn: (n) => turns.push(n) },
            { x: 100, y: 0, w: 50, h: 50, key: 'other', run() {} },
        ]);
        ccu(d, 10);                      // the counter's start
        ccu(d, 11);                      // first turn: the focus lands on the first place
        assert.strictEqual(d.focusKey, 'tgt:wheel');
        assert.deepStrictEqual(turns, []);
        ccu(d, 13);                      // two notches on the wheel: its value, the focus stays
        assert.deepStrictEqual(turns, [2]);
        assert.strictEqual(d.focusKey, 'tgt:wheel');
        ccu(d, 13, 1);                   // press runs it as before
        assert.strictEqual(presses, 1);
        ccu(d, 13, 0, 4);                // pushed right: the next place
        assert.strictEqual(d.focusKey, 'tgt:other');
        ccu(d, 14);                      // a plain target: turning moves the focus, no turn call
        assert.deepStrictEqual(turns, [2]);
    }],
];

let failed = 0;
for (const [name, fn] of tests) {
    try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node kit/tools/test_target_input.js`
Expected: FAIL bei „record.target keeps drag and turn“, „a finger that lands …“ und „the knob turns …“; „a tap on a plain target still runs it“ ok.

- [ ] **Step 3: `record.js` erweitern**

In `kit/runtime/record.js` ersetzen:

```js
    /**
     * Something on the page a tap (or the iDrive controller, turned onto it and pressed) runs: run().
     * key names it from frame to frame (the controller stays on it). Drawn by the caller; where the kit
     * runs the screen (display.js) it rings the one the controller is on.
     */
    target(x, y, w, h, run, key, r) { this.targets.push({ x, y, w, h, run, key: String(key), r }); return this; }
```

durch:

```js
    /**
     * Something on the page a tap (or the iDrive controller, turned onto it and pressed) runs: run().
     * key names it from frame to frame (the controller stays on it). Drawn by the caller; where the kit
     * runs the screen (display.js) it rings the one the controller is on.
     * opts.drag(phase, x, y): a finger that lands on it is followed until it lifts (1 down, 2 move, 3 up;
     * page px), and a tap no longer runs it. opts.turn(d): turning the knob while the controller is on it
     * changes its value (d notches, + clockwise) instead of moving on; pushing still moves on.
     */
    target(x, y, w, h, run, key, r, opts) {
        const q = { x, y, w, h, run, key: String(key), r };
        if (opts && opts.drag) q.drag = opts.drag;
        if (opts && opts.turn) q.turn = opts.turn;
        this.targets.push(q);
        return this;
    }
```

- [ ] **Step 4: `display.js` `_touch` erweitern**

In `kit/runtime/display.js` in `_touch`, direkt nach der Zeile

```js
            const key = bar ? 'bar:' + bar.id : tab ? 'tab:' + tab.i : tgt ? 'tgt:' + tgt.key : this.sheet ? 'sheet:' + (this.sheetTargets || []).findIndex(inside) : null;
```

einfügen:

```js
            // a target that follows the finger (opts.drag): every move goes to it until the finger lifts
            if (phase === 1 && tgt && tgt.drag) this.dragKey = tgt.key;
            if (this.dragKey) {
                const q = (this.pageTargets || []).find((p) => p.key === this.dragKey);
                if (phase === 3) this.dragKey = null;
                if (q && q.drag) { try { q.drag(phase, x, y); } catch (e) { this.log.error('drag', e); } }
                this.tickHandlers.forEach((fn) => fn());
                return;
            }
```

- [ ] **Step 5: `display.js` `_ccu` erweitern**

In `_ccu` direkt nach

```js
        if (d && i >= 0 && ring[i].scroll && this._scrollBy(d * 70)) return;
```

einfügen:

```js
        // a target that takes the knob (opts.turn): turning changes its value, the focus stays
        if (d && i >= 0 && ring[i].tgt && ring[i].tgt.turn) {
            try { ring[i].tgt.turn(d); } catch (e) { this.log.error('turn', e); }
            this.tickHandlers.forEach((fn) => fn());
            return;
        }
```

- [ ] **Step 6: Tests grün**

Run: `node kit/tools/test_target_input.js`
Expected: `all 4 passed`

- [ ] **Step 7: Bestehendes unverändert**

Run: `node kit/tools/test_live_adjustments.js && node kit/tools/test_zh.js`
Expected: Exit-Code 0.

- [ ] **Step 8: Commit**

```bash
git add kit/runtime/record.js kit/runtime/display.js kit/tools/test_target_input.js
git commit -m "kit: cv.target mit drag (Finger folgen) und turn (Controller-Drehwert)"
```

---

### Task 4: Test-Gerüst und `color.js`

**Files:**
- Create: `kit/tools/test_gs_ambient.js`
- Create: `apps/gs_ambient/color.js`

**Interfaces:**
- Consumes: –
- Produces (`color.js`): `clamp(x, a, b)`, `hsvToRgb(h, s, v) -> [r,g,b]`, `toRgb({h,s}) -> [r,g,b]`, `fromPoint(dx, dy, r) -> {h,s} | null`, `toPoint({h,s}, r) -> [dx, dy]`, `mixRgb(a, b, f) -> [r,g,b]`, `scale(rgb, k) -> [r,g,b]`, `toWire(frame, caps) -> frame`. Frame = `{ upper: [r,g,b], lower: [r,g,b], brightness: 0..1 }`.
- Produces (Testdatei): Helfer `test(name, fn)`, `app(file)`, `near(a, b, tol, msg)`, `tmpFile()`, `fakeClock()`, `settle()`, Marker-Zeile `// ---- run ----` (spätere Tasks fügen ihre Abschnitte **direkt über** dieser Zeile ein).

- [ ] **Step 1: Testdatei mit Gerüst und Farb-Tests anlegen**

`kit/tools/test_gs_ambient.js`:

```js
'use strict';

// Ambient Colorwheel (apps/gs_ambient): colour maths, state, effects, effect loop, light sender, pages.
// No SDK, vehicle or emulator needed:
//   node kit/tools/test_gs_ambient.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'gs_ambient');
const KIT = path.join(ROOT, 'kit', 'runtime');
// the app requires the kit as ./kit/... (where build.py puts it); here that is kit/runtime
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent) {
    if (parent && parent.filename && path.dirname(parent.filename) === APP && request.indexOf('./kit/') === 0) {
        request = path.join(KIT, request.slice(6));
    }
    return resolve.apply(this, [request].concat(Array.prototype.slice.call(arguments, 1)));
};
const app = (name) => require(path.join(APP, name));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const settle = () => new Promise((r) => setImmediate(r));
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs_ambient-')), 'state.json');
function near(a, b, tol, msg) {
    const x = [].concat(a), y = [].concat(b);
    assert.strictEqual(x.length, y.length, msg);
    x.forEach((v, i) => assert.ok(Math.abs(v - y[i]) <= (tol || 1e-9), (msg || 'near') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)));
}
/** Timers on a clock that only moves when told (advance), for throttling and retries. */
function fakeClock() {
    let now = 0;
    const timers = [];
    const add = (fn, ms, every) => { const tm = { at: now + (ms || 0), fn, every }; timers.push(tm); return tm; };
    const remove = (tm) => { const i = timers.indexOf(tm); if (i >= 0) timers.splice(i, 1); };
    return {
        now: () => now,
        setTimeout: (fn, ms) => add(fn, ms, 0),
        clearTimeout: remove,
        setInterval: (fn, ms) => add(fn, ms, ms),
        clearInterval: remove,
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                timers.sort((a, b) => a.at - b.at);
                const tm = timers[0];
                if (!tm || tm.at > end) break;
                now = tm.at;
                if (tm.every) tm.at += tm.every; else remove(tm);
                tm.fn();
                await settle(); await settle();
            }
            now = end;
            await settle();
        },
    };
}

/* ---------- color.js ---------- */
test('color: hsv to rgb at the primaries and white', () => {
    const C = app('color.js');
    assert.deepStrictEqual(C.hsvToRgb(0, 1, 1), [255, 0, 0]);
    assert.deepStrictEqual(C.hsvToRgb(120, 1, 1), [0, 255, 0]);
    assert.deepStrictEqual(C.hsvToRgb(240, 1, 1), [0, 0, 255]);
    assert.deepStrictEqual(C.hsvToRgb(360, 1, 1), [255, 0, 0]);
    assert.deepStrictEqual(C.hsvToRgb(-120, 1, 1), [0, 0, 255]);
    assert.deepStrictEqual(C.hsvToRgb(77, 0, 1), [255, 255, 255]);
    assert.deepStrictEqual(C.toRgb({ h: 120, s: 1 }), [0, 255, 0]);
});
test('color: wheel point to colour (0 deg at 12 o\'clock, clockwise)', () => {
    const C = app('color.js');
    near([C.fromPoint(0, -100, 100).h, C.fromPoint(0, -100, 100).s], [0, 1]);
    near(C.fromPoint(100, 0, 100).h, 90);
    near(C.fromPoint(0, 100, 100).h, 180);
    near(C.fromPoint(-100, 0, 100).h, 270);
    near(C.fromPoint(0, -50, 100).s, 0.5);
    near(C.fromPoint(0, 0, 100).s, 0);
    near(C.fromPoint(0, -105, 100).s, 1);            // just over the rim counts as the rim
    assert.strictEqual(C.fromPoint(0, -120, 100), null);
});
test('color: colour to wheel point and back', () => {
    const C = app('color.js');
    const p = C.toPoint({ h: 90, s: 0.5 }, 100);
    near(p, [50, 0], 1e-9);
    const back = C.fromPoint(p[0], p[1], 100);
    near([back.h, back.s], [90, 0.5], 1e-9);
});
test('color: mix and scale', () => {
    const C = app('color.js');
    assert.deepStrictEqual(C.mixRgb([0, 0, 0], [255, 100, 10], 0.5), [128, 50, 5]);
    assert.deepStrictEqual(C.mixRgb([0, 0, 0], [255, 100, 10], 2), [255, 100, 10]);
    assert.deepStrictEqual(C.scale([255, 100, 10], 0.5), [128, 50, 5]);
});
test('color: wire format caps channels at 0xFE and folds brightness where the backend cannot take it', () => {
    const C = app('color.js');
    const f = { upper: [255, 0, 0], lower: [0, 255, 255], brightness: 0.5 };
    assert.deepStrictEqual(C.toWire(f, { brightness: true }), { upper: [254, 0, 0], lower: [0, 254, 254], brightness: 0.5 });
    assert.deepStrictEqual(C.toWire(f, { brightness: false }), { upper: [128, 0, 0], lower: [0, 128, 128], brightness: 1 });
});

// ---- run ----
(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
    }
    console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: FAIL in allen `color:`-Tests mit `Cannot find module '.../apps/gs_ambient/color.js'`.

- [ ] **Step 3: `color.js` schreiben**

`apps/gs_ambient/color.js`:

```js
'use strict';
/**
 * color.js - the colour wheel's maths. A colour is { h, s }: hue in degrees (0 = red at 12 o'clock,
 * clockwise, as the kit draws arcs) and saturation 0..1 (0 = white in the middle, 1 = the rim).
 * RGB values are [r, g, b], 0..255. A frame is { upper: RGB, lower: RGB, brightness: 0..1 }.
 */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Hue (degrees), saturation and value (0..1) -> [r, g, b]. */
function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    const p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return p.map((k) => Math.round((k + m) * 255));
}
const toRgb = (col) => hsvToRgb(col.h, col.s, 1);

/** Point (dx, dy from the wheel's centre, y down) on a wheel of radius r -> colour; null well outside it. */
function fromPoint(dx, dy, r) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r * 1.08) return null;
    return { h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, s: clamp(d / r, 0, 1) };
}
/** Colour -> [dx, dy] from the centre of a wheel of radius r. */
function toPoint(col, r) {
    const a = col.h * Math.PI / 180;
    return [Math.sin(a) * col.s * r, -Math.cos(a) * col.s * r];
}
const mixRgb = (a, b, f) => a.map((c, i) => Math.round(c + (b[i] - c) * clamp(f, 0, 1)));
const scale = (rgb, k) => rgb.map((c) => Math.round(c * clamp(k, 0, 1)));

/** The frame as a backend gets it: channels at most 0xFE (the BDC's colour data), brightness folded in unless caps.brightness. */
function toWire(frame, caps) {
    const fold = !(caps && caps.brightness);
    const out = (rgb) => (fold ? scale(rgb, frame.brightness) : rgb).map((c) => Math.min(254, c));
    return { upper: out(frame.upper), lower: out(frame.lower), brightness: fold ? 1 : frame.brightness };
}

module.exports = { clamp, hsvToRgb, toRgb, fromPoint, toPoint, mixRgb, scale, toWire };
```

- [ ] **Step 4: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 5 passed`

- [ ] **Step 5: Commit**

```bash
git add kit/tools/test_gs_ambient.js apps/gs_ambient/color.js
git commit -m "gs_ambient: Farbrad-Mathematik (color.js) mit Tests"
```

---

### Task 5: `state.js`

**Files:**
- Create: `apps/gs_ambient/state.js`
- Test: `kit/tools/test_gs_ambient.js` (Abschnitt über `// ---- run ----` einfügen)

**Interfaces:**
- Consumes: –
- Produces: `createState(file, opts?) -> State`; `opts = { log, timers: { setTimeout, clearTimeout } }`.
  State: `MAX_FAVS` (8), `get() -> snapshot`, `onChange(fn)`, `flush()`, `setColor(zone, {h,s})`, `setZone('upper'|'lower')`, `setBrightness(0.05..1)`, `swap()`, `same()`, `setEffect(id|null)`, `param(id, key, dflt)`, `setParam(id, key, v)`, `addFav() -> index | -1`, `removeFav(i)`, `applyFav(i)`.
  Snapshot: `{ v: 1, upper: {h,s}, lower: {h,s}, brightness, zone, effect, params: { [effectId]: { [key]: value } }, favs: [{ upper: {h,s}, lower: {h,s} }] }`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- state.js ---------- */
const manualTimers = () => { const t = { fn: null }; t.setTimeout = (fn) => { t.fn = fn; return 1; }; t.clearTimeout = () => { t.fn = null; }; return t; };
test('state: defaults without a file, no warning', () => {
    const warns = [];
    const s = app('state.js').createState(tmpFile(), { log: { warn: (m) => warns.push(m), info() {} } });
    const st = s.get();
    assert.deepStrictEqual([st.upper, st.lower, st.brightness, st.zone, st.effect, st.favs], [{ h: 0, s: 1 }, { h: 220, s: 1 }, 0.8, 'upper', null, []]);
    assert.deepStrictEqual(warns, []);
});
test('state: a broken file gives the defaults and a warning, no crash', () => {
    const f = tmpFile(), warns = [];
    fs.writeFileSync(f, '{ not json');
    const s = app('state.js').createState(f, { log: { warn: (m) => warns.push(m), info() {} } });
    assert.strictEqual(s.get().brightness, 0.8);
    assert.strictEqual(warns.length, 1);
});
test('state: saved 500 ms after the last change (temp file + rename) and loaded again', () => {
    const f = tmpFile(), timers = manualTimers();
    const { createState } = app('state.js');
    const s = createState(f, { timers });
    s.setColor('upper', { h: 30, s: 0.5 });
    s.setBrightness(0.6);
    assert.ok(!fs.existsSync(f), 'not before the timer');
    timers.fn();
    assert.ok(fs.existsSync(f) && !fs.existsSync(f + '.tmp'));
    const again = createState(f).get();
    assert.deepStrictEqual([again.upper, again.brightness], [{ h: 30, s: 0.5 }, 0.6]);
});
test('state: flush saves at once', () => {
    const f = tmpFile();
    const s = app('state.js').createState(f, { timers: manualTimers() });
    s.setZone('lower');
    s.flush();
    assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).zone, 'lower');
});
test('state: values are kept in range', () => {
    const s = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    s.setColor('upper', { h: -30, s: 3 });
    s.setBrightness(5);
    assert.deepStrictEqual(s.get().upper, { h: 330, s: 1 });
    assert.strictEqual(s.get().brightness, 1);
    s.setBrightness(0);
    assert.strictEqual(s.get().brightness, 0.05);
});
test('state: swap and same', () => {
    const s = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    s.swap();
    assert.deepStrictEqual([s.get().upper.h, s.get().lower.h], [220, 0]);
    s.setZone('lower');
    s.same();
    assert.deepStrictEqual(s.get().upper, s.get().lower);
});
test('state: at most 8 favourites; apply; delete resets effect settings that point at it or later', () => {
    const s = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    for (let i = 0; i < 8; i++) { s.setColor('upper', { h: i * 10, s: 1 }); assert.strictEqual(s.addFav(), i); }
    assert.strictEqual(s.addFav(), -1);
    s.applyFav(3);
    assert.strictEqual(s.get().upper.h, 30);
    s.setParam('mode', 'favEco', 0);
    s.setParam('mode', 'favSport', 2);
    s.setParam('fade', 'count', 3);
    s.removeFav(1);
    assert.strictEqual(s.get().favs.length, 7);
    assert.deepStrictEqual(s.get().params, { mode: { favEco: 0, favSport: -1 }, fade: { count: 3 } });
    assert.strictEqual(s.param('mode', 'favEco', -1), 0);
    assert.strictEqual(s.param('cycle', 'period', 60), 60);
});
test('state: listeners hear every change', () => {
    const s = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    let n = 0;
    s.onChange(() => n++);
    s.setZone('lower'); s.swap(); s.setEffect('cycle');
    assert.strictEqual(n, 3);
    assert.strictEqual(s.get().effect, 'cycle');
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: alle `state:`-Tests FAIL mit `Cannot find module …state.js`; `color:`-Tests ok.

- [ ] **Step 3: `state.js` schreiben**

`apps/gs_ambient/state.js`:

```js
'use strict';
/**
 * state.js - what the user set: the colours of both zones, brightness, the zone the wheel edits, the
 * running effect and every effect's settings, the favourites. Saved as JSON 500 ms after the last change
 * (temp file + rename: a power cut leaves the old file whole). Effect settings whose key starts with
 * "fav" hold a favourite's index.
 */
const fs = require('fs');

const MAX_FAVS = 8;
const DEFAULTS = { v: 1, upper: { h: 0, s: 1 }, lower: { h: 220, s: 1 }, brightness: 0.8, zone: 'upper', effect: null, params: {}, favs: [] };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const copy = (o) => JSON.parse(JSON.stringify(o));
const isNum = (x) => typeof x === 'number' && isFinite(x);
const colorOk = (c) => !!c && isNum(c.h) && isNum(c.s);
const normColor = (c, dflt) => (colorOk(c) ? { h: ((c.h % 360) + 360) % 360, s: clamp(c.s, 0, 1) } : copy(dflt));

function sanitize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        v: 1,
        upper: normColor(r.upper, DEFAULTS.upper),
        lower: normColor(r.lower, DEFAULTS.lower),
        brightness: isNum(r.brightness) ? clamp(r.brightness, 0.05, 1) : DEFAULTS.brightness,
        zone: r.zone === 'lower' ? 'lower' : 'upper',
        effect: typeof r.effect === 'string' ? r.effect : null,
        params: r.params && typeof r.params === 'object' ? copy(r.params) : {},
        favs: Array.isArray(r.favs) ? r.favs.filter((f) => f && colorOk(f.upper) && colorOk(f.lower)).slice(0, MAX_FAVS)
            .map((f) => ({ upper: normColor(f.upper), lower: normColor(f.lower) })) : [],
    };
}

function createState(file, opts) {
    const o = opts || {};
    const log = o.log || { warn() {}, info() {} };
    const timers = o.timers || { setTimeout, clearTimeout };
    let s;
    try {
        s = sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
        if (e.code !== 'ENOENT') log.warn('state: ' + file + ' unreadable, using the defaults: ' + e.message);
        s = sanitize(null);
    }
    const listeners = [];
    let timer = null;
    const save = () => {
        timer = null;
        try { fs.writeFileSync(file + '.tmp', JSON.stringify(s)); fs.renameSync(file + '.tmp', file); } catch (e) { log.warn('state save: ' + e.message); }
    };
    const changed = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = timers.setTimeout(save, 500);
        listeners.forEach((fn) => { try { fn(); } catch (e) { log.warn('state listener: ' + e.message); } });
    };
    const other = (z) => (z === 'upper' ? 'lower' : 'upper');
    return {
        MAX_FAVS,
        get: () => copy(s),
        onChange(fn) { listeners.push(fn); },
        flush() { if (timer !== null) { timers.clearTimeout(timer); save(); } },
        setColor(zone, c) { const z = zone === 'lower' ? 'lower' : 'upper'; s[z] = normColor(c, s[z]); changed(); },
        setZone(z) { s.zone = z === 'lower' ? 'lower' : 'upper'; changed(); },
        setBrightness(b) { if (isNum(b)) { s.brightness = clamp(b, 0.05, 1); changed(); } },
        swap() { const u = s.upper; s.upper = s.lower; s.lower = u; changed(); },
        same() { s[other(s.zone)] = copy(s[s.zone]); changed(); },
        setEffect(id) { s.effect = id || null; changed(); },
        param(id, key, dflt) { const p = s.params[id]; return p && p[key] !== undefined ? p[key] : dflt; },
        setParam(id, key, v) { (s.params[id] = s.params[id] || {})[key] = v; changed(); },
        addFav() {
            if (s.favs.length >= MAX_FAVS) return -1;
            s.favs.push({ upper: copy(s.upper), lower: copy(s.lower) });
            changed();
            return s.favs.length - 1;
        },
        removeFav(i) {
            if (!(i >= 0 && i < s.favs.length)) return;
            s.favs.splice(i, 1);
            Object.keys(s.params).forEach((id) => {
                const p = s.params[id];
                Object.keys(p).forEach((k) => { if (/^fav/.test(k) && isNum(p[k]) && p[k] >= i) p[k] = -1; });
            });
            changed();
        },
        applyFav(i) { const f = s.favs[i]; if (!f) return; s.upper = copy(f.upper); s.lower = copy(f.lower); changed(); },
    };
}

module.exports = { createState, MAX_FAVS };
```

- [ ] **Step 4: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 13 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/gs_ambient/state.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Zustand mit atomarem Speichern (state.js)"
```

---

### Task 6: Effekt-Register und zeitbasierte Effekte

**Files:**
- Create: `apps/gs_ambient/fx.js`, `apps/gs_ambient/fx_cycle.js`, `apps/gs_ambient/fx_fade.js`, `apps/gs_ambient/fx_breathe.js`
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: `color.js` (`hsvToRgb`, `toRgb`, `mixRgb`, `clamp`)
- Produces:
  - Effekt-Modul: `{ id, name, needs: string[], swatch: RGB[], params: Param[], usesBase(params) -> bool, available?(base) -> string|null, run(t, inputs, params, base, mem) -> Frame }`.
  - Param: `{ key, label, type: 'range'|'choice'|'fav', min?, max?, step?, unit?, options?: [[value, label]], default }`.
  - `base = { upper: RGB, lower: RGB, brightness, favs: [{ upper: RGB, lower: RGB }] }`.
  - `fx.js`: `EFFECTS`, `byId`, `paramsOf(e, stored)`, `baseOf(snapshot)`, `availability(e, inputs, base) -> null|string`, `keepsRunning(snapshot) -> bool`, `stepParam(p, cur, dir, favCount, wrap)`, `formatParam(p, v)`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- effects: helpers ---------- */
const RED = [255, 0, 0], BLUE = [0, 0, 255], GREEN = [0, 255, 0];
const base0 = (o) => Object.assign({ upper: RED, lower: BLUE, brightness: 0.8, favs: [] }, o || {});
const run = (id, t, inputs, params, base, mem) => {
    const fx = app('fx.js'), e = fx.byId[id];
    return e.run(t, inputs || {}, fx.paramsOf(e, params), base || base0(), mem || {});
};

/* ---------- fx.js ---------- */
test('fx: registry, defaults and base', () => {
    const fx = app('fx.js');
    assert.deepStrictEqual(fx.EFFECTS.slice(0, 3).map((e) => e.id), ['cycle', 'fade', 'breathe']);
    assert.deepStrictEqual(fx.paramsOf(fx.byId.cycle, { period: 30 }), { period: 30, zones: 'same' });
    const st = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    st.addFav();
    const b = fx.baseOf(st.get());
    assert.deepStrictEqual([b.upper, b.lower, b.brightness, b.favs], [[255, 0, 0], [0, 85, 255], 0.8, [{ upper: [255, 0, 0], lower: [0, 85, 255] }]]);
});
test('fx: stepping settings (tap wraps, the knob stops at the ends)', () => {
    const fx = app('fx.js');
    const period = fx.byId.cycle.params[0], zones = fx.byId.cycle.params[1];
    assert.strictEqual(fx.stepParam(period, 60, 1, 0, true), 70);
    assert.strictEqual(fx.stepParam(period, 300, 1, 0, true), 10);
    assert.strictEqual(fx.stepParam(period, 300, 1, 0, false), 300);
    assert.strictEqual(fx.stepParam(period, 10, -3, 0, false), 10);
    assert.strictEqual(fx.stepParam(zones, 'same', 1, 0, true), 'offset');
    assert.strictEqual(fx.stepParam(zones, 'offset', 1, 0, true), 'same');
    assert.strictEqual(fx.stepParam(zones, 'offset', 1, 0, false), 'offset');
    const fav = { key: 'favEco', type: 'fav', default: -1 };
    assert.strictEqual(fx.stepParam(fav, -1, 1, 2, true), 0);
    assert.strictEqual(fx.stepParam(fav, 1, 1, 2, true), -1);
    assert.strictEqual(fx.stepParam(fav, 5, 1, 2, true), 0);       // a deleted favourite counts as Standard
    const g = { type: 'range', min: 0.3, max: 0.8, step: 0.1 };
    assert.strictEqual(fx.stepParam(g, 0.3, 1, 0, false), 0.4);
});
test('fx: settings as text', () => {
    const fx = app('fx.js');
    assert.strictEqual(fx.formatParam(fx.byId.cycle.params[0], 60), '60 s');
    assert.strictEqual(fx.formatParam(fx.byId.cycle.params[1], 'offset'), 'Versetzt');
    assert.strictEqual(fx.formatParam({ type: 'range', step: 0.1, unit: 'g' }, 0.5), '0,5 g');
    assert.strictEqual(fx.formatParam({ type: 'fav' }, -1), 'Standard');
    assert.strictEqual(fx.formatParam({ type: 'fav' }, 2), 'Favorit 3');
});
test('fx: availability (missing data, too few favourites)', () => {
    const fx = app('fx.js');
    assert.strictEqual(fx.availability(fx.byId.cycle, {}, base0()), null);
    assert.strictEqual(fx.availability(fx.byId.fade, {}, base0()), 'Mindestens 2 Favoriten nötig');
    assert.strictEqual(fx.availability(fx.byId.fade, {}, base0({ favs: [{ upper: RED, lower: RED }, { upper: BLUE, lower: BLUE }] })), null);
    assert.strictEqual(fx.availability({ needs: ['rpm'], params: [] }, { rpm: null }, base0()), 'Daten nicht verfügbar');
});
test('fx: which effects go on when the colours change', () => {
    const fx = app('fx.js');
    const st = (effect, params) => ({ effect, params: params || {} });
    assert.strictEqual(fx.keepsRunning(st(null)), false);
    assert.strictEqual(fx.keepsRunning(st('cycle')), false);
    assert.strictEqual(fx.keepsRunning(st('fade')), false);
    assert.strictEqual(fx.keepsRunning(st('breathe')), true);
});

/* ---------- time-based effects ---------- */
test('fx cycle: runs through the wheel, offset puts the lower zone half a turn on', () => {
    assert.deepStrictEqual(run('cycle', 0).upper, RED);
    assert.deepStrictEqual(run('cycle', 20, {}, { period: 60 }).upper, GREEN);
    const f = run('cycle', 0, {}, { zones: 'offset' });
    assert.deepStrictEqual([f.upper, f.lower, f.brightness], [RED, [0, 255, 255], 0.8]);
});
test('fx fade: holds, blends, wraps', () => {
    const b = base0({ favs: [{ upper: RED, lower: RED }, { upper: BLUE, lower: BLUE }, { upper: GREEN, lower: GREEN }] });
    const p = { count: 2, hold: 5, trans: 2 };
    assert.deepStrictEqual(run('fade', 1, {}, p, b).upper, RED);
    assert.deepStrictEqual(run('fade', 6, {}, p, b).upper, [128, 0, 128]);
    assert.deepStrictEqual(run('fade', 7.5, {}, p, b).upper, BLUE);
    assert.deepStrictEqual(run('fade', 14.5, {}, p, b).upper, RED);
    assert.deepStrictEqual(run('fade', 15, {}, Object.assign({}, p, { count: 3 }), b).upper, GREEN);
});
test('fx breathe: full brightness at the start, depth at half the period', () => {
    near(run('breathe', 0).brightness, 0.8);
    near(run('breathe', 2, {}, { period: 4, depth: 50 }).brightness, 0.4);
    assert.deepStrictEqual(run('breathe', 2).upper, RED);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `fx:`-Tests FAIL mit `Cannot find module …fx.js`.

- [ ] **Step 3: Effekte schreiben**

`apps/gs_ambient/fx_cycle.js`:

```js
'use strict';
/** Farbverlauf: both zones run through the whole wheel at full saturation, together or half a turn apart. */
const C = require('./color');

module.exports = {
    id: 'cycle',
    name: 'Farbverlauf',
    needs: [],
    swatch: [[255, 48, 48], [255, 208, 0], [16, 254, 50], [0, 229, 255], [32, 80, 255], [255, 48, 255]],
    params: [
        { key: 'period', label: 'Umlauf', type: 'range', min: 10, max: 300, step: 10, default: 60, unit: 's' },
        { key: 'zones', label: 'Zonen', type: 'choice', options: [['same', 'Gleich'], ['offset', 'Versetzt']], default: 'same' },
    ],
    usesBase: () => false,
    run(t, inputs, p, base) {
        const h = (t / p.period) * 360, upper = C.hsvToRgb(h, 1, 1);
        return { upper, lower: p.zones === 'offset' ? C.hsvToRgb(h + 180, 1, 1) : upper, brightness: base.brightness };
    },
};
```

`apps/gs_ambient/fx_fade.js`:

```js
'use strict';
/** Überblenden: holds each of the first 2 or 3 favourites, then blends smoothly into the next. */
const C = require('./color');

module.exports = {
    id: 'fade',
    name: 'Überblenden',
    needs: [],
    swatch: [[255, 48, 48], [32, 80, 255]],
    params: [
        { key: 'count', label: 'Anzahl', type: 'choice', options: [[2, '2'], [3, '3']], default: 2 },
        { key: 'hold', label: 'Halten', type: 'range', min: 1, max: 30, step: 1, default: 5, unit: 's' },
        { key: 'trans', label: 'Übergang', type: 'range', min: 1, max: 10, step: 1, default: 2, unit: 's' },
    ],
    usesBase: () => false,
    available: (base) => (base.favs.length >= 2 ? null : 'Mindestens 2 Favoriten nötig'),
    run(t, inputs, p, base) {
        const list = base.favs.slice(0, Math.min(p.count, base.favs.length));
        const seg = p.hold + p.trans, n = list.length, tau = t % (n * seg);
        const i = Math.floor(tau / seg), w = tau - i * seg;
        const a = list[i], b = list[(i + 1) % n];
        const f = w < p.hold ? 0 : (w - p.hold) / p.trans, k = f * f * (3 - 2 * f);
        return { upper: C.mixRgb(a.upper, b.upper, k), lower: C.mixRgb(a.lower, b.lower, k), brightness: base.brightness };
    },
};
```

`apps/gs_ambient/fx_breathe.js`:

```js
'use strict';
/** Atmen: the brightness swells down and up again (cosine), the colours stay. */
module.exports = {
    id: 'breathe',
    name: 'Atmen',
    needs: [],
    swatch: [[255, 255, 255], [40, 40, 40]],
    params: [
        { key: 'period', label: 'Tempo', type: 'range', min: 2, max: 10, step: 1, default: 4, unit: 's' },
        { key: 'depth', label: 'Tiefe', type: 'range', min: 10, max: 80, step: 10, default: 50, unit: '%' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base) {
        const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / p.period);
        return { upper: base.upper, lower: base.lower, brightness: base.brightness * (1 - (p.depth / 100) * k) };
    },
};
```

- [ ] **Step 4: `fx.js` schreiben (ohne Schleife, die kommt in Task 8)**

`apps/gs_ambient/fx.js`:

```js
'use strict';
/**
 * fx.js - the effects (fx_*.js) and their settings. An effect's settings are stored per effect in the
 * state (params[id]); paramsOf fills in the defaults.
 */
const C = require('./color');

const EFFECTS = [require('./fx_cycle'), require('./fx_fade'), require('./fx_breathe')];
const byId = {};
EFFECTS.forEach((e) => { byId[e.id] = e; });

/** The effect's settings: the stored ones over the defaults. */
function paramsOf(e, stored) {
    const out = {};
    e.params.forEach((p) => { out[p.key] = stored && stored[p.key] !== undefined ? stored[p.key] : p.default; });
    return out;
}

/** The state's colours and favourites as RGB, for the effects. */
function baseOf(st) {
    return {
        upper: C.toRgb(st.upper), lower: C.toRgb(st.lower), brightness: st.brightness,
        favs: st.favs.map((f) => ({ upper: C.toRgb(f.upper), lower: C.toRgb(f.lower) })),
    };
}

/** null when effect e can run now, else why not (shown on its tile). */
function availability(e, inputs, base) {
    if (e.needs.some((k) => inputs[k] === null || inputs[k] === undefined)) return 'Daten nicht verfügbar';
    return e.available ? e.available(base) : null;
}

/** Whether the running effect goes on when the user changes a colour (it is built on the colours). */
function keepsRunning(st) {
    const e = st.effect && byId[st.effect];
    return !!e && e.usesBase(paramsOf(e, st.params[e.id]));
}

const decimals = (step) => (String(step).split('.')[1] || '').length;

/** Setting p moved dir steps on from cur. wrap: past an end starts over (a tap); else it stops there (the knob). */
function stepParam(p, cur, dir, favCount, wrap) {
    if (p.type === 'range') {
        let v = cur + dir * p.step;
        if (wrap && v > p.max + 1e-9) v = p.min;
        if (wrap && v < p.min - 1e-9) v = p.max;
        return Number(C.clamp(v, p.min, p.max).toFixed(decimals(p.step)));
    }
    const values = p.type === 'fav' ? [-1].concat(Array.from({ length: favCount }, (_, i) => i)) : p.options.map((o) => o[0]);
    const i = Math.max(0, values.indexOf(cur));
    const j = wrap ? ((i + dir) % values.length + values.length) % values.length : C.clamp(i + dir, 0, values.length - 1);
    return values[j];
}

/** A setting's value as shown on its button. */
function formatParam(p, v) {
    if (p.type === 'fav') return v < 0 ? 'Standard' : 'Favorit ' + (v + 1);
    if (p.type === 'choice') { const o = p.options.find((x) => x[0] === v); return o ? o[1] : String(v); }
    return v.toFixed(decimals(p.step)).replace('.', ',') + (p.unit ? ' ' + p.unit : '');
}

module.exports = { EFFECTS, byId, paramsOf, baseOf, availability, keepsRunning, stepParam, formatParam };
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 21 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/gs_ambient/fx.js apps/gs_ambient/fx_cycle.js apps/gs_ambient/fx_fade.js apps/gs_ambient/fx_breathe.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Effekt-Register mit Farbverlauf, Überblenden, Atmen"
```

---

### Task 7: Fahrdaten- und Musik-Effekte

**Files:**
- Create: `apps/gs_ambient/fx_rpm.js`, `fx_speed.js`, `fx_mode.js`, `fx_dynamics.js`, `fx_music.js`
- Modify: `apps/gs_ambient/fx.js` (Zeile `const EFFECTS = …`)
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: Effekt-Modul-Format aus Task 6; `inputs = { rpm, speed, gLong, gLat, mode: 'eco'|'comfort'|'sport'|null, music: 0..1|null }`
- Produces: `fx.EFFECTS` in der Reihenfolge `cycle, fade, breathe, rpm, speed, mode, dynamics, music`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- driving and music effects ---------- */
test('fx: all eight effects, at most three settings each', () => {
    const fx = app('fx.js');
    assert.deepStrictEqual(fx.EFFECTS.map((e) => e.id), ['cycle', 'fade', 'breathe', 'rpm', 'speed', 'mode', 'dynamics', 'music']);
    fx.EFFECTS.forEach((e) => {
        assert.ok(e.params.length <= 3, e.id);
        e.params.forEach((p) => assert.ok(p.default !== undefined, e.id + '.' + p.key));
    });
});
test('fx rpm: blue at idle, red at the shift point, blinking above it', () => {
    assert.deepStrictEqual(run('rpm', 0, { rpm: 800 }).upper, [0, 85, 255]);
    assert.deepStrictEqual(run('rpm', 0, { rpm: 6500 }).upper, RED);
    assert.deepStrictEqual(run('rpm', 0.2, { rpm: 6600 }).upper, [0, 0, 0]);
    assert.deepStrictEqual(run('rpm', 0.2, { rpm: 6600 }, { blink: 'off' }).upper, RED);
    const f = run('rpm', 0, { rpm: 6500 }, { zones: 'upper' });
    assert.deepStrictEqual([f.upper, f.lower], [RED, BLUE]);
    const fx = app('fx.js');
    assert.strictEqual(fx.availability(fx.byId.rpm, { rpm: null }, base0()), 'Daten nicht verfügbar');
});
test('fx speed: colour or brightness over the scale', () => {
    assert.deepStrictEqual(run('speed', 0, { speed: 0 }).upper, [0, 85, 255]);
    assert.deepStrictEqual(run('speed', 0, { speed: 250 }).lower, RED);
    const f = run('speed', 0, { speed: 100 }, { mode: 'brightness', max: 200 });
    assert.deepStrictEqual(f.upper, RED);
    near(f.brightness, 0.8 * 0.6);
});
test('fx mode: favourite per mode, else blue / own colours / red', () => {
    const b = base0({ favs: [{ upper: GREEN, lower: GREEN }] });
    assert.deepStrictEqual(run('mode', 0, { mode: 'eco' }, {}, b).upper, [0, 85, 255]);
    assert.deepStrictEqual(run('mode', 0, { mode: 'comfort' }, {}, b).lower, BLUE);
    assert.deepStrictEqual(run('mode', 0, { mode: 'sport' }, {}, b).upper, RED);
    assert.deepStrictEqual(run('mode', 0, { mode: 'sport' }, { favSport: 0 }, b).upper, GREEN);
});
test('fx dynamics: flash above the threshold, fading out over 300 ms', () => {
    const mem = {}, b = base0({ upper: BLUE, lower: BLUE, brightness: 0.5 });
    const step = (t, g) => run('dynamics', t, { gLong: g, gLat: 0 }, { thresh: 0.5, color: 'red' }, b, mem);
    assert.deepStrictEqual(step(0, 0.2).upper, BLUE);
    const hit = step(1, 1.0);
    assert.deepStrictEqual([hit.upper, hit.brightness], [RED, 1]);
    const mid = step(1.15, 0);
    near(mid.upper, [128, 0, 128], 1);
    near(mid.brightness, 0.75, 1e-6);
    assert.deepStrictEqual(step(1.4, 0).upper, BLUE);
});
test('fx music: brightness follows the level', () => {
    near(run('music', 0, { music: 0 }).brightness, 0.8 * 0.15);
    near(run('music', 0, { music: 1 }, { sens: 5 }).brightness, 0.8);
    near(run('music', 0, { music: 0.25 }, { sens: 10 }).brightness, 0.8 * (0.15 + 0.85 * 0.5));
});
test('fx: which driving effects go on when the colours change', () => {
    const fx = app('fx.js');
    const st = (effect, params) => ({ effect, params: params || {} });
    assert.strictEqual(fx.keepsRunning(st('rpm')), false);
    assert.strictEqual(fx.keepsRunning(st('rpm', { rpm: { zones: 'upper' } })), true);
    assert.strictEqual(fx.keepsRunning(st('speed')), false);
    assert.strictEqual(fx.keepsRunning(st('speed', { speed: { mode: 'brightness' } })), true);
    assert.strictEqual(fx.keepsRunning(st('mode')), false);
    assert.strictEqual(fx.keepsRunning(st('dynamics')), true);
    assert.strictEqual(fx.keepsRunning(st('music')), true);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: die neuen Tests FAIL (Liste hat nur 3 Effekte bzw. `fx.byId.rpm` undefined).

- [ ] **Step 3: Effekte schreiben**

`apps/gs_ambient/fx_rpm.js`:

```js
'use strict';
/** Drehzahl: blue at idle through green to red at the shift point; at and above it, optionally blinking. */
const C = require('./color');

const IDLE = 800;

module.exports = {
    id: 'rpm',
    name: 'Drehzahl',
    needs: ['rpm'],
    swatch: [[32, 80, 255], [16, 254, 50], [255, 48, 48]],
    params: [
        { key: 'shift', label: 'Schaltpunkt', type: 'range', min: 3000, max: 7000, step: 250, default: 6500, unit: '/min' },
        { key: 'blink', label: 'Blinken', type: 'choice', options: [['on', 'An'], ['off', 'Aus']], default: 'on' },
        { key: 'zones', label: 'Bereich', type: 'choice', options: [['both', 'Beide'], ['upper', 'Nur oben']], default: 'both' },
    ],
    usesBase: (p) => p.zones === 'upper',
    run(t, inputs, p, base) {
        const f = C.clamp((inputs.rpm - IDLE) / (p.shift - IDLE), 0, 1);
        let col = C.hsvToRgb(220 * (1 - f), 1, 1);
        if (inputs.rpm >= p.shift && p.blink === 'on' && Math.floor(t * 8) % 2 === 1) col = [0, 0, 0];
        return { upper: col, lower: p.zones === 'upper' ? base.lower : col, brightness: base.brightness };
    },
};
```

`apps/gs_ambient/fx_speed.js`:

```js
'use strict';
/** Geschwindigkeit: the colour (blue to red) or the brightness (20 to 100 %) follows the speed. */
const C = require('./color');

module.exports = {
    id: 'speed',
    name: 'Geschwindigkeit',
    needs: ['speed'],
    swatch: [[32, 80, 255], [255, 48, 48]],
    params: [
        { key: 'max', label: 'Skala bis', type: 'range', min: 50, max: 250, step: 10, default: 200, unit: 'km/h' },
        { key: 'mode', label: 'Zeigt', type: 'choice', options: [['color', 'Farbe'], ['brightness', 'Helligkeit']], default: 'color' },
    ],
    usesBase: (p) => p.mode === 'brightness',
    run(t, inputs, p, base) {
        const f = C.clamp(inputs.speed / p.max, 0, 1);
        if (p.mode === 'brightness') return { upper: base.upper, lower: base.lower, brightness: base.brightness * (0.2 + 0.8 * f) };
        const col = C.hsvToRgb(220 * (1 - f), 1, 1);
        return { upper: col, lower: col, brightness: base.brightness };
    },
};
```

`apps/gs_ambient/fx_mode.js`:

```js
'use strict';
/** Fahrmodus: a favourite per driving mode; without one Eco Pro is blue, Comfort the own colours, Sport red. */
const C = require('./color');

const KEYS = { eco: 'favEco', comfort: 'favComfort', sport: 'favSport' };

module.exports = {
    id: 'mode',
    name: 'Fahrmodus',
    needs: ['mode'],
    swatch: [[16, 254, 50], [61, 139, 255], [255, 48, 48]],
    params: [
        { key: 'favEco', label: 'Eco Pro', type: 'fav', default: -1 },
        { key: 'favComfort', label: 'Comfort', type: 'fav', default: -1 },
        { key: 'favSport', label: 'Sport', type: 'fav', default: -1 },
    ],
    usesBase: () => false,
    run(t, inputs, p, base) {
        const fav = KEYS[inputs.mode] ? base.favs[p[KEYS[inputs.mode]]] : null;
        if (fav) return { upper: fav.upper, lower: fav.lower, brightness: base.brightness };
        const col = inputs.mode === 'eco' ? C.hsvToRgb(220, 1, 1) : inputs.mode === 'sport' ? C.hsvToRgb(0, 1, 1) : null;
        return col ? { upper: col, lower: col, brightness: base.brightness } : { upper: base.upper, lower: base.lower, brightness: base.brightness };
    },
};
```

`apps/gs_ambient/fx_dynamics.js`:

```js
'use strict';
/**
 * Fahrdynamik: a short flash (300 ms, fading) when the combined acceleration passes the threshold; the
 * harder, the stronger. Only the size counts: there are two zones, upper and lower, no sides.
 */
const C = require('./color');

const FLASH_S = 0.3;
const FLASH = { red: [255, 0, 0], white: [255, 255, 255], blue: [0, 85, 255], amber: [255, 140, 0] };

module.exports = {
    id: 'dynamics',
    name: 'Fahrdynamik',
    needs: ['gLong', 'gLat'],
    swatch: [[255, 48, 48], [48, 0, 0]],
    params: [
        { key: 'thresh', label: 'Schwelle', type: 'range', min: 0.3, max: 0.8, step: 0.1, default: 0.5, unit: 'g' },
        { key: 'color', label: 'Blitz', type: 'choice', options: [['red', 'Rot'], ['white', 'Weiß'], ['blue', 'Blau'], ['amber', 'Orange']], default: 'red' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base, mem) {
        const g = Math.sqrt(inputs.gLong * inputs.gLong + inputs.gLat * inputs.gLat);
        if (g >= p.thresh) {
            if (!(t < mem.until)) mem.peak = 0;
            mem.until = t + FLASH_S;
            mem.peak = Math.max(mem.peak || 0, g);
        }
        if (!(t < mem.until)) return { upper: base.upper, lower: base.lower, brightness: base.brightness };
        const strength = C.clamp(0.4 + 0.6 * (mem.peak - p.thresh) / 0.5, 0, 1);
        const k = C.clamp(strength * (mem.until - t) / FLASH_S, 0, 1), c = FLASH[p.color] || FLASH.red;
        return { upper: C.mixRgb(base.upper, c, k), lower: C.mixRgb(base.lower, c, k), brightness: base.brightness + (1 - base.brightness) * k };
    },
};
```

`apps/gs_ambient/fx_music.js`:

```js
'use strict';
/** Musik: the brightness follows the audio level (0..1), scaled by the sensitivity. */
const C = require('./color');

module.exports = {
    id: 'music',
    name: 'Musik',
    needs: ['music'],
    swatch: [[155, 60, 255], [5, 7, 10]],
    params: [
        { key: 'sens', label: 'Empfindlichkeit', type: 'range', min: 1, max: 10, step: 1, default: 5, unit: '' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base) {
        const level = C.clamp(inputs.music * p.sens / 5, 0, 1);
        return { upper: base.upper, lower: base.lower, brightness: base.brightness * (0.15 + 0.85 * level) };
    },
};
```

- [ ] **Step 4: Register erweitern**

In `apps/gs_ambient/fx.js` ersetzen:

```js
const EFFECTS = [require('./fx_cycle'), require('./fx_fade'), require('./fx_breathe')];
```

durch:

```js
const EFFECTS = [
    require('./fx_cycle'), require('./fx_fade'), require('./fx_breathe'), require('./fx_rpm'),
    require('./fx_speed'), require('./fx_mode'), require('./fx_dynamics'), require('./fx_music'),
];
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 28 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/gs_ambient/fx.js apps/gs_ambient/fx_rpm.js apps/gs_ambient/fx_speed.js apps/gs_ambient/fx_mode.js apps/gs_ambient/fx_dynamics.js apps/gs_ambient/fx_music.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Effekte Drehzahl, Geschwindigkeit, Fahrmodus, Fahrdynamik, Musik"
```

---

### Task 8: Effekt-Schleife und Eingaben

**Files:**
- Create: `apps/gs_ambient/inputs.js`
- Modify: `apps/gs_ambient/fx.js` (`createLoop` + Export)
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: `car.data()` aus `kit/runtime/car.js` (`{ rpm, speed, gLong, gLat, demo }`), `fx.baseOf/availability/paramsOf/byId`
- Produces:
  - `readInputs(carData, tSec) -> { rpm, speed, gLong, gLat, mode, music, demo }` (fehlende Werte `null`; `mode`/`music` nur in Demo).
  - `fx.createLoop({ getState, readInputs, sink, clock?, hz? }) -> { start() -> Frame, stop(), tick() -> Frame, frame() -> Frame|null, why() -> string|null }`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- inputs.js ---------- */
test('inputs: car values pass, bad ones are null; mode and music only in demo', () => {
    const { readInputs } = app('inputs.js');
    const live = readInputs({ rpm: 2000, speed: NaN, gLong: 0.1, demo: false }, 0);
    assert.deepStrictEqual(live, { rpm: 2000, speed: null, gLong: 0.1, gLat: null, mode: null, music: null, demo: false });
    const demo = readInputs({ rpm: 900, speed: 0, gLong: 0, gLat: 0, demo: true }, 0);
    assert.strictEqual(demo.mode, 'eco');
    assert.ok(demo.music >= 0 && demo.music <= 1);
    assert.strictEqual(readInputs({ demo: true }, 25).mode, 'comfort');
    assert.strictEqual(readInputs({ demo: true }, 45).mode, 'sport');
    assert.strictEqual(readInputs(null, 0).rpm, null);
});

/* ---------- effect loop ---------- */
test('loop: the fixed colours without an effect, the effect\'s frame with one, time from its start', async () => {
    const fx = app('fx.js'), clk = fakeClock();
    const st = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    const frames = [];
    const loop = fx.createLoop({ getState: () => st.get(), readInputs: () => ({}), sink: (f) => frames.push(f), clock: clk, hz: 20 });
    assert.deepStrictEqual(loop.start().upper, RED);
    st.setEffect('cycle');
    await clk.advance(50);                      // the effect starts at this tick
    assert.deepStrictEqual(frames[frames.length - 1].upper, RED);
    await clk.advance(20000);                   // 20 s into a 60 s turn
    assert.deepStrictEqual(loop.frame().upper, GREEN);
    st.setEffect('breathe');
    await clk.advance(50);
    near(loop.frame().brightness, 0.8);         // a new effect starts at its own beginning
    loop.stop();
    const n = frames.length;
    await clk.advance(1000);
    assert.strictEqual(frames.length, n);
});
test('loop: an effect without its data pauses on the fixed colours and says why', () => {
    const fx = app('fx.js');
    const st = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    st.setEffect('rpm');
    const loop = fx.createLoop({ getState: () => st.get(), readInputs: () => ({ rpm: null }), sink() {}, clock: fakeClock() });
    assert.deepStrictEqual(loop.tick().upper, RED);
    assert.strictEqual(loop.why(), 'Daten nicht verfügbar');
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `inputs:` FAIL (Modul fehlt), `loop:` FAIL (`fx.createLoop is not a function`).

- [ ] **Step 3: `inputs.js` schreiben**

`apps/gs_ambient/inputs.js`:

```js
'use strict';
/**
 * inputs.js - what the effects read: the kit's driving data (car.js data()) and, with demo data, a
 * simulated driving mode (20 s each: eco, comfort, sport) and music level. On the car the driving mode
 * and the music level are null until a source for them is found (docs/am-auto-pruefen.md).
 */
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const MODES = ['eco', 'comfort', 'sport'];

/** A beat: two pulses a second, louder and softer over 7 s. */
function beat(t) {
    const p = (t * 2) % 1;
    return Math.max(0, 1 - p * 3) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI / 7));
}

function readInputs(d, t) {
    const c = d || {}, demo = !!c.demo;
    return {
        rpm: num(c.rpm), speed: num(c.speed), gLong: num(c.gLong), gLat: num(c.gLat),
        mode: demo ? MODES[Math.floor(t / 20) % MODES.length] : null,
        music: demo ? Math.min(1, Math.max(0, beat(t))) : null,
        demo,
    };
}

module.exports = { readInputs };
```

- [ ] **Step 4: `createLoop` in `fx.js` ergänzen**

In `apps/gs_ambient/fx.js` vor `module.exports` einfügen:

```js
/**
 * The loop that turns the state into the frame the lights get, hz times a second: the running effect's
 * frame (time from its start; mem cleared at every start), else the fixed colours, also while the
 * effect has no data. sink(frame) gets every frame; the light sender drops unchanged ones.
 */
function createLoop(o) {
    const clock = o.clock || { now: Date.now, setInterval, clearInterval };
    const hz = o.hz || 20;
    let timer = null, id = null, t0 = 0, mem = {}, last = null, why = null;
    function tick() {
        const st = o.getState(), base = baseOf(st), inputs = o.readInputs();
        if (st.effect !== id) { id = st.effect; t0 = clock.now(); mem = {}; }
        const e = id ? byId[id] : null;
        let frame = { upper: base.upper, lower: base.lower, brightness: base.brightness };
        why = e ? availability(e, inputs, base) : null;
        if (e && !why) frame = e.run((clock.now() - t0) / 1000, inputs, paramsOf(e, st.params[e.id]), base, mem);
        last = frame;
        o.sink(frame);
        return frame;
    }
    return {
        tick,
        start() { if (timer === null) timer = clock.setInterval(tick, 1000 / hz); return tick(); },
        stop() { if (timer !== null) clock.clearInterval(timer); timer = null; },
        frame: () => last,
        why: () => why,
    };
}
```

und die Export-Zeile ersetzen durch:

```js
module.exports = { EFFECTS, byId, paramsOf, baseOf, availability, keepsRunning, stepParam, formatParam, createLoop };
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 31 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/gs_ambient/inputs.js apps/gs_ambient/fx.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Effekt-Schleife und Eingaben (Fahrmodus/Musik in Demo simuliert)"
```

---

### Task 9: Lichtsteuerung (Sender und Backends)

**Files:**
- Create: `apps/gs_ambient/light.js`, `light_sim.js`, `light_profile.js`, `light_bdc.js`
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: `color.toWire`
- Produces:
  - Backend: `{ name, label, kind: 'sim'|'real', validated: bool, maxRate: number, capabilities: { freeColor, brightness }, apply(frame) -> Promise<{ ok, reason? }>, release() -> Promise }`.
  - `light.createBackend(kind: 'sim'|'profile'|'bdc', ctx) -> Backend` (unbekannt → sim).
  - `light.createSender(backend, { log?, clock? }) -> { push(frame), resume(), status() -> { state: 'simuliert'|'aktiv'|'fehler'|'gesperrt', reason }, sent() -> Frame|null, release() -> Promise }`.
  - Konstanten `light.BACKOFF = [500, 1000, 2000]`, `light.MAX_FAILS = 4`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- light.js ---------- */
const F = (rgb, b) => ({ upper: rgb, lower: rgb, brightness: b === undefined ? 1 : b });
function fakeBackend(o) {
    const be = Object.assign({ name: 'test', label: 'Test', kind: 'sim', validated: true, maxRate: 20, capabilities: { freeColor: true, brightness: true }, calls: [], releases: 0, answer: { ok: true } }, o || {});
    be.apply = (f) => { be.calls.push(f); return Promise.resolve(be.answer); };
    be.release = () => { be.releases++; return Promise.resolve(); };
    return be;
}
test('light: sends a new frame once, in wire format', async () => {
    const light = app('light.js'), be = fakeBackend(), s = light.createSender(be, { clock: fakeClock() });
    s.push(F([255, 0, 0]));
    await settle(); await settle();
    s.push(F([255, 0, 0]));
    await settle(); await settle();
    assert.strictEqual(be.calls.length, 1);
    assert.deepStrictEqual(be.calls[0], { upper: [254, 0, 0], lower: [254, 0, 0], brightness: 1 });
    assert.deepStrictEqual(s.status(), { state: 'simuliert', reason: null });
});
test('light: brightness folded into RGB where the backend cannot take it', async () => {
    const light = app('light.js'), be = fakeBackend({ capabilities: { freeColor: true, brightness: false } });
    light.createSender(be, { clock: fakeClock() }).push(F([255, 0, 0], 0.5));
    await settle(); await settle();
    assert.deepStrictEqual(be.calls[0], { upper: [128, 0, 0], lower: [128, 0, 0], brightness: 1 });
});
test('light: at most maxRate frames a second, the newest one wins', async () => {
    const light = app('light.js'), clk = fakeClock(), be = fakeBackend({ maxRate: 10 }), s = light.createSender(be, { clock: clk });
    s.push(F([1, 0, 0]));
    await settle(); await settle();
    s.push(F([2, 0, 0]));
    s.push(F([3, 0, 0]));
    await clk.advance(99);
    assert.strictEqual(be.calls.length, 1);
    await clk.advance(1);
    assert.strictEqual(be.calls.length, 2);
    assert.deepStrictEqual(be.calls[1].upper, [3, 0, 0]);
});
test('light: retries after 0.5, 1 and 2 s, stops at the 4th failure, a user action tries again', async () => {
    const light = app('light.js'), clk = fakeClock();
    const be = fakeBackend({ kind: 'real', answer: { ok: false, reason: 'BDC lehnt ab' } }), s = light.createSender(be, { clock: clk });
    s.push(F([9, 9, 9]));
    await settle(); await settle();
    assert.strictEqual(be.calls.length, 1);
    await clk.advance(499); assert.strictEqual(be.calls.length, 1);
    await clk.advance(1); assert.strictEqual(be.calls.length, 2);
    await clk.advance(1000); assert.strictEqual(be.calls.length, 3);
    await clk.advance(2000); assert.strictEqual(be.calls.length, 4);
    assert.deepStrictEqual(s.status(), { state: 'fehler', reason: 'BDC lehnt ab' });
    await clk.advance(60000);
    s.push(F([8, 8, 8]));
    await settle(); await settle();
    assert.strictEqual(be.calls.length, 4);
    be.answer = { ok: true };
    s.resume();
    await settle(); await settle();
    assert.strictEqual(be.calls.length, 5);
    assert.deepStrictEqual(be.calls[4].upper, [8, 8, 8]);
    assert.deepStrictEqual(s.status(), { state: 'aktiv', reason: null });
});
test('light: a locked backend is never called', async () => {
    const light = app('light.js'), be = fakeBackend({ kind: 'real', validated: false }), s = light.createSender(be, { clock: fakeClock() });
    s.push(F([255, 0, 0]));
    s.resume();
    await settle(); await settle();
    assert.strictEqual(be.calls.length, 0);
    assert.deepStrictEqual(s.status(), { state: 'gesperrt', reason: 'noch nicht am Auto geprüft' });
});
test('light: release hands back and stops sending', async () => {
    const light = app('light.js'), be = fakeBackend(), s = light.createSender(be, { clock: fakeClock() });
    await s.release();
    s.push(F([255, 0, 0]));
    await settle(); await settle();
    assert.deepStrictEqual([be.releases, be.calls.length], [1, 0]);
});
test('light: backends - simulated is the only one unlocked in version 1', async () => {
    const light = app('light.js');
    const sim = light.createBackend('sim'), profile = light.createBackend('profile'), bdc = light.createBackend('bdc');
    assert.deepStrictEqual([sim.kind, sim.validated, sim.maxRate], ['sim', true, 20]);
    assert.deepStrictEqual([profile.validated, bdc.validated], [false, false]);
    assert.deepStrictEqual(await bdc.apply(F([1, 2, 3])), { ok: false, reason: 'gesperrt' });
    assert.deepStrictEqual(await profile.apply(F([1, 2, 3])), { ok: false, reason: 'gesperrt' });
    assert.strictEqual(light.createBackend('nonsense').name, 'sim');
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `light:`-Tests FAIL mit `Cannot find module …light.js`.

- [ ] **Step 3: Backends schreiben**

`apps/gs_ambient/light_sim.js`:

```js
'use strict';
/** Simulated lighting: takes every frame and sends nothing to the car. The Farbe page shows the result. */
function create() {
    return {
        name: 'sim', label: 'Simuliert', kind: 'sim', validated: true, maxRate: 20,
        capabilities: { freeColor: true, brightness: true },
        apply: () => Promise.resolve({ ok: true }),
        release: () => Promise.resolve(),
    };
}

module.exports = { create };
```

`apps/gs_ambient/light_profile.js`:

```js
'use strict';
/**
 * Route A: switch the ambient light profile over SOME/IP (the iDrive menu's 11 coded colour pairs), the
 * nearest coded pair for each frame. Locked: the field and its setter are not known yet
 * (docs/am-auto-pruefen.md, step 4). Until verified on the car it sends nothing.
 */
function create() {
    return {
        name: 'profile', label: 'Profil umschalten', kind: 'real', validated: false, maxRate: 2,
        capabilities: { freeColor: false, brightness: false },
        apply: () => Promise.resolve({ ok: false, reason: 'gesperrt' }),
        release: () => Promise.resolve(),
    };
}

module.exports = { create };
```

`apps/gs_ambient/light_bdc.js`:

```js
'use strict';
/**
 * Route B: the BDC's actuator test (UDS 2F over the head unit's TASU link, as live_adjustments does on the
 * DME); release would return control to the BDC (2F ... 00). Locked: which job and identifier drive the
 * LCI colours is not known yet (docs/am-auto-pruefen.md, steps 2 and 5). Until verified it sends nothing.
 */
function create() {
    return {
        name: 'bdc', label: 'BDC-Stellgliedtest', kind: 'real', validated: false, maxRate: 10,
        capabilities: { freeColor: true, brightness: false },
        apply: () => Promise.resolve({ ok: false, reason: 'gesperrt' }),
        release: () => Promise.resolve(),
    };
}

module.exports = { create };
```

- [ ] **Step 4: `light.js` schreiben**

`apps/gs_ambient/light.js`:

```js
'use strict';
/**
 * light.js - the lighting backend for the "light" setting, and the sender in front of it: only changed
 * frames, at most maxRate a second (the newest wins), a failed one retried after 0.5, 1 and 2 s; the 4th
 * failure in a row stops it until the user does something (resume). A backend that is not validated on
 * the car is never called.
 */
const C = require('./color');

const KINDS = { sim: require('./light_sim'), profile: require('./light_profile'), bdc: require('./light_bdc') };
const BACKOFF = [500, 1000, 2000];
const MAX_FAILS = 4;
const LOCKED = { state: 'gesperrt', reason: 'noch nicht am Auto geprüft' };

function createBackend(kind, ctx) { return (KINDS[kind] || KINDS.sim).create(ctx); }

const same = (a, b) => !!a && !!b && a.brightness === b.brightness && String(a.upper) === String(b.upper) && String(a.lower) === String(b.lower);

function createSender(backend, opts) {
    const o = opts || {};
    const log = o.log || { info() {}, warn() {} };
    const clock = o.clock || { now: Date.now, setTimeout, clearTimeout };
    const gap = 1000 / backend.maxRate, okState = backend.kind === 'sim' ? 'simuliert' : 'aktiv';
    let pending = null, inflight = null, sent = null, lastAt = -Infinity, timer = null, fails = 0, stopped = false;
    let st = backend.validated ? { state: okState, reason: null } : LOCKED;
    const later = (ms) => { if (timer === null) timer = clock.setTimeout(() => { timer = null; flush(); }, ms); };
    function flush() {
        if (stopped || inflight || !pending || timer !== null) return;
        const wait = lastAt + gap - clock.now();
        if (wait > 0) { later(wait); return; }
        const frame = pending;
        inflight = frame; pending = null; lastAt = clock.now();
        Promise.resolve().then(() => backend.apply(C.toWire(frame, backend.capabilities)))
            .catch((e) => ({ ok: false, reason: String((e && e.message) || e) }))
            .then((r) => {
                inflight = null;
                if (stopped) return;
                if (r && r.ok) { fails = 0; sent = frame; st = { state: okState, reason: null }; flush(); return; }
                fails++;
                const why = (r && r.reason) || 'keine Antwort';
                if (!pending) pending = frame;
                log.warn('light ' + backend.name + ': ' + why + ' (' + fails + '. Fehlschlag in Folge)');
                if (fails >= MAX_FAILS) { stopped = true; st = { state: 'fehler', reason: why }; return; }
                later(BACKOFF[fails - 1]);
            });
    }
    return {
        push(frame) {
            if (!backend.validated) return;
            if (same(frame, pending || inflight || sent)) return;
            pending = frame;
            flush();
        },
        resume() {
            if (!backend.validated || st.state !== 'fehler') return;
            stopped = false; fails = 0; st = { state: okState, reason: null };
            flush();
        },
        status: () => ({ state: st.state, reason: st.reason }),
        sent: () => sent,
        release() {
            stopped = true;
            if (timer !== null) { clock.clearTimeout(timer); timer = null; }
            return Promise.resolve().then(() => backend.release()).catch((e) => log.warn('light release: ' + e));
        },
    };
}

module.exports = { createBackend, createSender, BACKOFF, MAX_FAILS };
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 38 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/gs_ambient/light.js apps/gs_ambient/light_sim.js apps/gs_ambient/light_profile.js apps/gs_ambient/light_bdc.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Lichtsteuerung mit Drosselung, Wiederholung und gesperrten echten Wegen"
```

---

### Task 10: App-Gerüst, Seitenrahmen und Seite „Farbe“ (lauffähig im Emulator)

**Files:**
- Create: `apps/gs_ambient/app.json`, `apps/gs_ambient/main.js`, `apps/gs_ambient/ui.js`, `apps/gs_ambient/ui_parts.js`, `apps/gs_ambient/ui_color.js`, `apps/gs_ambient/icon.png`
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: `state.js`, `fx.js` (`createLoop`, `baseOf`, `availability`, `paramsOf`, `keepsRunning`, `stepParam`, `EFFECTS`), `inputs.js`, `light.js`, `color.js`; Kit: `./kit/mgu` (`run`), `./kit/car`, `./kit/gauges` (`frame`, `panel`, `layer`), `./kit/canvas` (`withAlpha`), `cv.target(..., opts)` aus Task 3.
- Produces:
  - Seitenmodul: `{ title: string, draw(cv, t, m, act) }`.
  - `ui.js`: `start(ctx, deps)`, `drawPage(cv, t, deps, view, act) -> m`, `makeActions(state, view)`, `model(deps, view)`, `badge(status)`, `PAGES`, `W` (1600), `H` (520).
  - `deps = { state, loop, sender: () => Sender, inputs: () => Inputs }`; `view = { page: number, editFavs: bool }`.
  - `m = { st, view, base, inputs, frame, why, status, avail: [{ e, why }], params(e) }`.
  - `act`: `get()`, `wheel({h,s}|null)`, `turnHue(d)`, `setSat(v)`, `setBrightness(v)`, `zone(z)`, `toggleZone()`, `swap()`, `same()`, `startEffect(id)`, `stopEffect()`, `stepParam(e, p, dir, wrap)`, `applyFav(i)`, `addFav()`, `removeFav(i)`, `toggleEdit()`.
  - `ui_parts.js`: `pill(cv, t, x, y, w, h, label, run, o?) -> w` (`o = { key, on, off, turn }`), `pillWidth(cv, label, h)`, `slider(cv, t, x, y, w, label, get, set, step, key)`.
  - `ui_color.js` exportiert zusätzlich `WX` (300), `WY` (282), `WR` (200).

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
/* ---------- pages ---------- */
function pageRig(o) {
    const { Recorder } = require(path.join(KIT, 'record'));
    const themes = require(path.join(KIT, 'themes'));
    const ui = app('ui.js'), { readInputs } = app('inputs.js');
    const state = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    const car = Object.assign({ demo: true, rpm: 2000, speed: 50, gLong: 0, gLat: 0 }, (o && o.car) || {});
    const deps = {
        state,
        loop: { frame: () => null, why: () => null },
        sender: () => ({ status: () => ({ state: 'simuliert', reason: null }) }),
        inputs: () => readInputs(car, 0),
    };
    const view = { page: (o && o.page) || 0, editFavs: false };
    const act = ui.makeActions(state, view);
    const draw = () => {
        const cv = new Recorder(ui.W, ui.H);
        ui.drawPage(cv, themes.theme(), deps, view, act);
        return (k) => cv.targets.find((q) => q.key === k);
    };
    return { state, view, act, draw };
}
test('pages: the kit fonts carry the German letters', () => {
    const fonts = require(path.join(KIT, 'fonts'));
    ['label', 'bold'].forEach((fam) => 'äöüÄÖÜß'.split('').forEach((ch) => assert.ok(fonts.get(fam, 24, 'a').glyphs[ch.codePointAt(0)], fam + ' ' + ch)));
});
test('pages: badge per sender state', () => {
    const ui = app('ui.js');
    assert.deepStrictEqual(ui.badge({ state: 'simuliert', reason: null }), { text: 'SIMULIERT', color: 'cold' });
    assert.deepStrictEqual(ui.badge({ state: 'fehler', reason: 'BDC lehnt ab' }), { text: 'FEHLER · BDC lehnt ab', color: 'crit' });
    assert.deepStrictEqual(ui.badge({ state: 'gesperrt', reason: 'x' }), { text: 'GESPERRT', color: 'warn' });
});
test('Farbe: the wheel follows the finger and the knob, the lines pick the zone, sliders turn', () => {
    const page = app('ui_color.js'), r = pageRig();
    const by = r.draw();
    ['wheel', 'zone-upper', 'zone-lower', 'sat', 'bri', 'Tauschen', 'Gleich'].forEach((k) => assert.ok(by(k), 'target ' + k));
    assert.ok(by('wheel').drag && by('wheel').turn && by('bri').drag && by('bri').turn);
    by('wheel').drag(1, page.WX + page.WR, page.WY);
    near([r.state.get().upper.h, r.state.get().upper.s], [90, 1], 1e-6);
    by('wheel').turn(2);
    near(r.state.get().upper.h, 100, 1e-6);
    by('wheel').drag(2, page.WX + 400, page.WY);      // far outside: ignored
    near(r.state.get().upper.h, 100, 1e-6);
    by('zone-lower').run();
    assert.strictEqual(r.state.get().zone, 'lower');
    by('bri').turn(-2);
    near(r.state.get().brightness, 0.7, 1e-9);
    by('sat').drag(1, 0, 0);                           // far left: saturation 0
    near(r.state.get().lower.s, 0);
    by('Tauschen').run();
    near(r.state.get().upper.s, 0);
});
test('Farbe: a colour change ends an effect that does not use the colours', () => {
    const r = pageRig();
    r.state.setEffect('cycle');
    r.act.wheel({ h: 10, s: 1 });
    assert.strictEqual(r.state.get().effect, null);
    r.state.setEffect('breathe');
    r.act.wheel({ h: 20, s: 1 });
    assert.strictEqual(r.state.get().effect, 'breathe');
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `pages:`/`Farbe:`-Tests FAIL (`Cannot find module …ui.js`); der Schrift-Test ist ok (Task 2).

- [ ] **Step 3: `ui_parts.js` schreiben**

`apps/gs_ambient/ui_parts.js`:

```js
'use strict';
/**
 * ui_parts.js - controls the pages share: a pill button and a slider. Both are drawn in every mode and
 * reach touch and the controller through cv.target (opts.drag / opts.turn: kit/runtime/record.js).
 */
const { withAlpha } = require('./kit/canvas');

const TEXT = { font: 'bold', spacing: 1.5 };

/** Width a pill needs for label at height h. */
function pillWidth(cv, label, h) { return Math.max(h * 3, cv.textWidth(String(label).toUpperCase(), h * 0.4, TEXT) + h * 1.2); }

/** Pill button run by a tap or a press. o: { key (default: label), on (lit), off (dimmed, nothing to press), turn }. Returns w. */
function pill(cv, t, x, y, w, h, label, run, o) {
    o = o || {};
    const S = t.sel || t.accent;
    cv.roundRect(x, y, w, h, h / 2, o.on ? withAlpha(S, 0.85) : withAlpha('#ffffff', 0.07));
    if (!o.on) cv.strokeRoundRect(x, y, w, h, h / 2, 1.5, withAlpha('#ffffff', o.off ? 0.12 : 0.3));
    cv.text(String(label).toUpperCase(), x + w / 2, y + h / 2 + h * 0.15, h * 0.4, o.off ? t.dim : o.on ? '#ffffff' : t.text,
        { align: 'center', font: 'bold', spacing: 1.5 });
    if (run && !o.off) cv.target(x, y, w, h, run, o.key || label, h / 2, o.turn ? { turn: o.turn } : null);
    return w;
}

/** Slider for a value 0..1 (get / set): label left, track right; follows the finger, the knob moves it step per notch. */
function slider(cv, t, x, y, w, label, get, set, step, key) {
    const tx = x + 220, tw = w - 260, v = get();
    cv.text(String(label).toUpperCase(), x + 24, y + 8, 20, t.dim, TEXT);
    cv.roundRect(tx, y - 6, tw, 12, 6, t.track);
    cv.roundRect(tx, y - 6, Math.max(12, tw * v), 12, 6, t.sel || t.accent);
    cv.circle(tx + tw * v, y, 16, '#ffffff');
    cv.target(tx - 24, y - 28, tw + 48, 56, () => null, key, 12, {
        drag: (phase, px) => set((px - tx) / tw),
        turn: (d) => set(get() + d * step),
    });
}

module.exports = { pill, pillWidth, slider };
```

- [ ] **Step 4: `ui_color.js` schreiben**

`apps/gs_ambient/ui_color.js`:

```js
'use strict';
/**
 * ui_color.js - the Farbe page: the colour wheel (left) and a sketch of the interior (right) with the upper
 * and lower light line in the colours being sent. A tap on a line picks the zone the wheel edits; below
 * it the saturation and brightness sliders, Tauschen and Gleich.
 */
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const C = require('./color');
const { pill, slider } = require('./ui_parts');

const WX = 300, WY = 282, WR = 200, RINGS = 16;
const HUES = [0, 60, 120, 180, 240, 300, 360];
const PX = 580, PW = 990;

/** The wheel: RINGS rings, each through all hues at its saturation; recorded once as a layer. */
function wheel() {
    return G.layer('gs_ambient_wheel', WR * 2 + 4, WR * 2 + 4, (r) => {
        const c = WR + 2;
        for (let i = 0; i < RINGS; i++) {
            const s = (i + 0.5) / RINGS;
            r.arc(c, c, i * WR / RINGS, (i + 1) * WR / RINGS + 0.5, 0, 360, '#ffffff',
                { ramp: HUES.map((h) => C.hsvToRgb(h, s, 1)), rampFrom: 0, rampTo: 360 });
        }
    });
}

function draw(cv, t, m, act) {
    const st = m.st;
    cv.blit(wheel(), WX - WR - 2, WY - WR - 2);
    ['upper', 'lower'].forEach((z) => {
        const p = C.toPoint(st[z], WR), on = z === st.zone;
        cv.circle(WX + p[0], WY + p[1], on ? 22 : 12, on ? '#ffffff' : withAlpha('#ffffff', 0.6));
        cv.circle(WX + p[0], WY + p[1], on ? 16 : 8, C.toRgb(st[z]));
    });
    cv.target(WX - WR, WY - WR, WR * 2, WR * 2, () => act.toggleZone(), 'wheel', WR, {
        drag: (phase, x, y) => act.wheel(C.fromPoint(x - WX, y - WY, WR)),
        turn: (d) => act.turnHue(d),
    });

    G.panel(cv, t, PX, 52, PW, 262, 'Vorschau Innenraum');
    [['upper', 160, 'Oben'], ['lower', 250, 'Unten']].forEach((row) => {
        const z = row[0], y = row[1], on = z === st.zone, c = C.scale(m.frame[z], m.frame.brightness);
        cv.line(PX + 170, y, PX + PW - 50, y, 24, withAlpha(c, 0.3));
        cv.line(PX + 170, y, PX + PW - 50, y, 6, c);
        cv.text(row[2].toUpperCase(), PX + 32, y + 8, 20, on ? t.text : t.dim, { font: 'bold', spacing: 1.5 });
        if (on) cv.strokeRoundRect(PX + 14, y - 30, PW - 28, 60, 14, 2, '#ffffff');
        cv.target(PX + 14, y - 30, PW - 28, 60, () => act.zone(z), 'zone-' + z, 14);
    });

    slider(cv, t, PX, 352, PW, 'Sättigung', () => { const s = act.get(); return s[s.zone].s; }, (v) => act.setSat(v), 0.05, 'sat');
    slider(cv, t, PX, 410, PW, 'Helligkeit', () => act.get().brightness, (v) => act.setBrightness(v), 0.05, 'bri');
    const x = PX + 24 + pill(cv, t, PX + 24, 448, 220, 48, 'Tauschen', () => act.swap()) + 16;
    pill(cv, t, x, 448, 220, 48, 'Gleich', () => act.same());
}

module.exports = { title: 'Farbe', draw, WX, WY, WR };
```

- [ ] **Step 5: `ui.js` schreiben**

`apps/gs_ambient/ui.js`:

```js
'use strict';
/**
 * ui.js - the screen: header tabs (one per page module) with the status badge, the page, and the actions
 * the pages call. A page is { title, draw(cv, t, m, act) }.
 */
const G = require('./kit/gauges');
const fx = require('./fx');

const W = 1600, H = 520;
const PAGES = [require('./ui_color')];
const BADGE = { simuliert: ['SIMULIERT', 'cold'], aktiv: ['AKTIV', 'ok'], fehler: ['FEHLER', 'crit'], gesperrt: ['GESPERRT', 'warn'] };

function badge(st) {
    const b = BADGE[st.state] || BADGE.simuliert;
    return { text: st.state === 'fehler' && st.reason ? b[0] + ' · ' + st.reason : b[0], color: b[1] };
}

/** What the pages draw from. deps = { state, loop, sender(), inputs() } */
function model(deps, view) {
    const st = deps.state.get(), inputs = deps.inputs(), base = fx.baseOf(st);
    return {
        st, view, base, inputs,
        frame: deps.loop.frame() || { upper: base.upper, lower: base.lower, brightness: base.brightness },
        why: deps.loop.why(),
        status: deps.sender().status(),
        avail: fx.EFFECTS.map((e) => ({ e, why: fx.availability(e, inputs, base) })),
        params: (e) => fx.paramsOf(e, st.params[e.id]),
    };
}

/** The changes the pages make. Changing a colour ends an effect that is not built on the colours. */
function makeActions(state, view) {
    const zoneColor = () => { const st = state.get(); return st[st.zone]; };
    const colorChanged = () => { const st = state.get(); if (st.effect && !fx.keepsRunning(st)) state.setEffect(null); };
    return {
        get: () => state.get(),
        wheel(col) { if (!col) return; state.setColor(state.get().zone, col); colorChanged(); },
        turnHue(d) { const c = zoneColor(); state.setColor(state.get().zone, { h: c.h + d * 5, s: c.s }); colorChanged(); },
        setSat(v) { const c = zoneColor(); state.setColor(state.get().zone, { h: c.h, s: v }); colorChanged(); },
        setBrightness(v) { state.setBrightness(v); },
        zone(z) { state.setZone(z); },
        toggleZone() { state.setZone(state.get().zone === 'upper' ? 'lower' : 'upper'); },
        swap() { state.swap(); colorChanged(); },
        same() { state.same(); colorChanged(); },
        startEffect(id) { state.setEffect(id); },
        stopEffect() { state.setEffect(null); },
        stepParam(e, p, dir, wrap) {
            const st = state.get();
            state.setParam(e.id, p.key, fx.stepParam(p, fx.paramsOf(e, st.params[e.id])[p.key], dir, st.favs.length, wrap));
        },
        applyFav(i) { state.applyFav(i); state.setEffect(null); },
        addFav() { return state.addFav(); },
        removeFav(i) { state.removeFav(i); },
        toggleEdit() { view.editFavs = !view.editFavs; },
    };
}

/** One frame of page view.page on cv. */
function drawPage(cv, t, deps, view, act) {
    const m = model(deps, view);
    PAGES[view.page].draw(cv, t, m, act);
    if (!cv.own) cv.text('Bedienung per Touch und Controller nur im Vollbild mit GPU-Renderer', W / 2, 510, 18, t.dim, { align: 'center' });
    G.frame(cv, t, PAGES.map((p) => p.title), view.page, [badge(m.status), m.inputs.demo && { text: 'DEMO' }]);
    return m;
}

function start(ctx, deps) {
    const { ui, log } = ctx;
    const view = { page: 0, editFavs: false };
    const act = makeActions(deps.state, view);
    const render = () => {
        const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
        drawPage(cv, t, deps, view, act);
        return ui.image('MAIN_GFX', cv);
    };
    const open = (i) => { view.page = i; view.editFavs = false; return render(); };
    ctx.onTab((i) => open(i));
    ui.onClick('BTN_PAGE', () => open((view.page + 1) % PAGES.length));
    ctx.loop('MAIN', 10, render);
    render().catch((e) => log.warn('first render: ' + e));
}

module.exports = { start, drawPage, makeActions, model, badge, PAGES, W, H };
```

- [ ] **Step 6: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 42 passed`

- [ ] **Step 7: `app.json`, `main.js` und Icon anlegen**

`apps/gs_ambient/app.json`:

```json
{
  "id": "gs_ambient",
  "title": "Ambient",
  "description": "Farbrad für die Ambientebeleuchtung: zwei Zonen (oben und unten), Helligkeit, acht Effekte und Favoriten. Version 1 steuert das Licht nur simuliert, bis ein Weg am Auto geprüft ist",
  "version": "0.1.0",
  "vendor": "custom",
  "loggingId": "OAB0",
  "iconGlyph": "Am",
  "signals": {
    "de.bmw.infotainment.vehicle.CDS": { "statusEngineSpeed2": "rs" },
    "de.bmw.infotainment.vehicle.Vehicle2": { "statusCarSpeed2": "rs" },
    "de.bmw.infotainment.vehicle.CDS2": {
      "statusLongitudinalAccelerationMassCenter": "rs",
      "statusLateralAccelerationMassCenter": "rs"
    }
  },
  "screens": [
    {
      "name": "MAIN",
      "kind": "canvas",
      "title": "Ambient",
      "buttons": [
        ["BTN_PAGE", "Nächste Seite"],
        ["BTN_SETTINGS", "Einstellungen"]
      ]
    }
  ],
  "settings": [
    {"key": "light", "label": "Lichtsteuerung", "type": "choice", "default": "sim",
     "options": [["sim", "Simuliert (sicher)"], ["profile", "Profil umschalten · gesperrt, noch nicht am Auto geprüft"], ["bdc", "BDC-Stellgliedtest · gesperrt, noch nicht am Auto geprüft"]]},
    {"key": "layout", "label": "Bildschirm-Layout", "type": "choice", "default": "full",
     "options": [["full", "Vollbild"], ["standard", "Standard"]]},
    {"key": "renderer", "label": "Renderer", "type": "choice", "default": "auto",
     "options": [["auto", "GPU 60 fps (Standard)"], ["software", "Software"]]},
    {"key": "demo", "label": "Demo-Daten", "type": "choice", "default": "auto",
     "options": [["auto", "Auto"], ["on", "Immer"], ["off", "Nie"]]}
  ]
}
```

`apps/gs_ambient/main.js`:

```js
'use strict';
/**
 * Ambient - a colour wheel for the ambient lighting: two zones (upper, lower), brightness, eight effects,
 * favourites. The colours go through a lighting backend (light.js); in version 1 only the simulated one
 * is unlocked, the real ones stay locked until verified on the car (docs/am-auto-pruefen.md).
 * The effect loop runs while the app runs, not only while its screen shows.
 */
const path = require('path');
const mgu = require('./kit/mgu');
const Car = require('./kit/car');
const { createState } = require('./state');
const { readInputs } = require('./inputs');
const fx = require('./fx');
const light = require('./light');
const ui = require('./ui');

mgu.run({
    async start(ctx) {
        const { settings, log } = ctx;
        const car = new Car(ctx, ['rpm', 'speed', 'accel']);
        const state = createState(path.join(ctx.dataDir, 'gs_ambient_state.json'), { log });
        const t0 = Date.now();
        const inputs = () => readInputs(car.data(), (Date.now() - t0) / 1000);
        let sender = light.createSender(light.createBackend(settings.get('light'), ctx), { log });
        settings.onChange((key) => {
            if (key !== 'light') return;
            sender.release();
            const backend = light.createBackend(settings.get('light'), ctx);
            sender = light.createSender(backend, { log });
            log.info('light backend: ' + backend.name);
        });
        state.onChange(() => sender.resume());
        const loop = fx.createLoop({ getState: () => state.get(), readInputs: inputs, sink: (frame) => sender.push(frame) });
        loop.start();
        if (ctx.app && ctx.app.on) ctx.app.on('shutdown', () => { loop.stop(); state.flush(); sender.release(); });
        ui.start(ctx, { state, loop, sender: () => sender, inputs });
    },
});
```

Icon:

```bash
node kit/tools/make_icon.js Am apps/gs_ambient/icon.png
```

Expected: `apps/gs_ambient/icon.png` (140×140) existiert.

- [ ] **Step 8: Build prüfen**

Run: `python3 kit/tools/build.py gs_ambient`
Expected: kein Fehler; `dist/gs_ambient@0.1.0.tgz` existiert.

- [ ] **Step 9: Im Emulator prüfen**

```bash
node kit/tools/emu.js gs_ambient --port 8077
```

Im Browser `http://localhost:8077` öffnen und prüfen (Touch-Routing an, Layout Vollbild):
1. Kopfzeile: Reiter „FARBE“, Abzeichen „SIMULIERT“, nach etwa 5 s „DEMO“.
2. Farbrad wird als glatter Farbkreis gezeichnet (kein Streifenmuster in den Grundfarben, Mitte weiß).
3. Ziehen mit der Maus auf dem Rad: großer Knopf folgt, obere Linie der Vorschau ändert die Farbe sofort.
4. Klick auf die Linie „UNTEN“: weißer Rahmen springt dorthin, das Rad bearbeitet nun unten.
5. „SÄTTIGUNG“ und „HELLIGKEIT“ zeigen das Ä korrekt; Ziehen auf den Reglern ändert die Werte.
6. Pfeiltasten (Kippen) bis der Fokus-Ring auf dem Rad liegt, dann Mausrad bzw. `[`/`]`: der Farbton dreht, der Fokus bleibt auf dem Rad; Enter wechselt die Zone.
7. „TAUSCHEN“ und „GLEICH“ wirken.
8. Emulator mit Ctrl+C beenden und neu starten: die Farben sind noch da (`preview/emu/gs_ambient/gs_ambient_state.json`).

Wenn ein Punkt nicht stimmt: Ursache suchen (systematic-debugging), nicht weiterbauen.

- [ ] **Step 10: Commit**

```bash
git add apps/gs_ambient/app.json apps/gs_ambient/main.js apps/gs_ambient/ui.js apps/gs_ambient/ui_parts.js apps/gs_ambient/ui_color.js apps/gs_ambient/icon.png kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: App-Gerüst und Seite Farbe (Rad, Vorschau, Regler)"
```

---

### Task 11: Seite „Effekte“

**Files:**
- Create: `apps/gs_ambient/ui_effects.js`
- Modify: `apps/gs_ambient/ui.js` (Zeile `const PAGES = …`)
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: Seitenmodul-Format, `m.avail`, `m.params(e)`, `act.startEffect/stopEffect/stepParam`, `fx.byId`, `fx.formatParam`, `pill`, `pillWidth`
- Produces: Seite `{ title: 'Effekte', draw }`; Ziel-Schlüssel `fx-<id>` (Kacheln), `fx-off`, `p-<key>` (Regler mit `turn`).

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
test('Effekte: tiles start effects, tiles without data cannot be started', () => {
    const r = pageRig({ page: 1 });
    r.state.setColor('upper', { h: 0, s: 1 }); r.state.addFav(); r.state.addFav();
    let by = r.draw();
    ['cycle', 'fade', 'breathe', 'rpm', 'speed', 'mode', 'dynamics', 'music'].forEach((id) => assert.ok(by('fx-' + id), 'tile ' + id));
    const live = pageRig({ page: 1, car: { demo: false } });
    by = live.draw();
    assert.ok(by('fx-rpm') && !by('fx-mode') && !by('fx-music') && !by('fx-fade'));
    by('fx-cycle').run();
    assert.strictEqual(live.state.get().effect, 'cycle');
});
test('Effekte: the bar has Aus and the running effect\'s settings (tap steps with wrap, the knob without)', () => {
    const r = pageRig({ page: 1 });
    let by = r.draw();
    assert.ok(!by('fx-off'), 'Aus is dimmed without an effect');
    by('fx-cycle').run();
    by = r.draw();
    assert.ok(by('fx-off') && by('p-period') && by('p-zones') && by('p-period').turn);
    by('p-period').run();
    assert.strictEqual(r.state.get().params.cycle.period, 70);
    by('p-period').turn(-1);
    assert.strictEqual(r.state.get().params.cycle.period, 60);
    by('p-zones').run();
    assert.strictEqual(r.state.get().params.cycle.zones, 'offset');
    by('fx-off').run();
    assert.strictEqual(r.state.get().effect, null);
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `Effekte:`-Tests FAIL (`PAGES[1]` undefined → `Cannot read properties of undefined (reading 'draw')`).

- [ ] **Step 3: `ui_effects.js` schreiben**

`apps/gs_ambient/ui_effects.js`:

```js
'use strict';
/**
 * ui_effects.js - the Effekte page: eight tiles (a tap starts the effect; one without data is greyed out
 * with the reason) and a bar along the bottom with Aus and the running effect's settings.
 */
const { withAlpha } = require('./kit/canvas');
const fx = require('./fx');
const { pill, pillWidth } = require('./ui_parts');

const TW = 380, TH = 150, GAP = 12, X0 = 24, Y0 = 56, BAR_Y = 392;

function tile(cv, t, x, y, a, on, act) {
    const e = a.e, S = t.sel || t.accent, n = e.swatch.length;
    cv.roundRect(x, y, TW, TH, 14, on ? withAlpha(S, 0.22) : withAlpha('#ffffff', a.why ? 0.02 : 0.05));
    cv.strokeRoundRect(x, y, TW, TH, 14, on ? 3 : 1.5, on ? S : withAlpha('#ffffff', a.why ? 0.08 : 0.2));
    cv.gradientRect(x + 24, y + 24, 140, 36, e.swatch.map((c, i) => [n > 1 ? i / (n - 1) : 0, a.why ? withAlpha(c, 0.3) : c]));
    cv.text(e.name, x + 24, y + 102, 30, a.why ? t.dim : t.text, { font: 'bold' });
    cv.text(a.why || (on ? 'Läuft' : ''), x + 24, y + 134, 20, a.why ? t.dim : S, { font: 'bold' });
    if (!a.why) cv.target(x, y, TW, TH, () => act.startEffect(e.id), 'fx-' + e.id, 14);
}

function draw(cv, t, m, act) {
    const active = m.st.effect;
    m.avail.forEach((a, i) => tile(cv, t, X0 + (i % 4) * (TW + GAP), Y0 + Math.floor(i / 4) * (TH + GAP), a, a.e.id === active, act));
    cv.roundRect(X0, BAR_Y, 4 * TW + 3 * GAP, 108, 14, withAlpha('#ffffff', 0.04));
    let x = X0 + 24;
    x += pill(cv, t, x, BAR_Y + 30, 140, 48, 'Aus', () => act.stopEffect(), { off: !active, key: 'fx-off' }) + 24;
    const e = active ? fx.byId[active] : null;
    if (!e) { cv.text('Kein Effekt aktiv', x, BAR_Y + 62, 22, t.dim); return; }
    const vals = m.params(e);
    e.params.forEach((p) => {
        const label = p.label + ': ' + fx.formatParam(p, vals[p.key]);
        x += pill(cv, t, x, BAR_Y + 30, pillWidth(cv, label, 48), 48, label, () => act.stepParam(e, p, 1, true),
            { key: 'p-' + p.key, turn: (d) => act.stepParam(e, p, d, false) }) + 16;
    });
}

module.exports = { title: 'Effekte', draw };
```

- [ ] **Step 4: Seite eintragen**

In `apps/gs_ambient/ui.js` ersetzen:

```js
const PAGES = [require('./ui_color')];
```

durch:

```js
const PAGES = [require('./ui_color'), require('./ui_effects')];
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 44 passed`

- [ ] **Step 6: Im Emulator prüfen**

`node kit/tools/emu.js gs_ambient --port 8077` (läuft er noch, baut er nach dem Speichern selbst neu):
1. Reiter „EFFEKTE“: 8 Kacheln; mit Demo-Daten alle aktiv außer „Überblenden“ („Mindestens 2 Favoriten nötig“).
2. „Farbverlauf“ antippen: Kachel leuchtet, „Läuft“; im Reiter „Farbe“ wandert die Vorschau durch die Farben.
3. Leiste: „UMLAUF: 60 S“ antippen → 70 s; Fokus darauf und drehen → Wert ändert sich, Fokus bleibt.
4. „Drehzahl“ starten: Vorschau folgt der Demo-Fahrt (blau im Leerlauf, rot am Schaltpunkt, Blinken).
5. Emulator-Regler „Demo-Daten: Nie“: „Fahrmodus“ und „Musik“ ausgegraut mit „Daten nicht verfügbar“.
6. „AUS“ beendet den Effekt.

- [ ] **Step 7: Commit**

```bash
git add apps/gs_ambient/ui_effects.js apps/gs_ambient/ui.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Seite Effekte (Kacheln und Einstellungsleiste)"
```

---

### Task 12: Seite „Favoriten“

**Files:**
- Create: `apps/gs_ambient/ui_favs.js`
- Modify: `apps/gs_ambient/ui.js` (Zeile `const PAGES = …`)
- Test: `kit/tools/test_gs_ambient.js`

**Interfaces:**
- Consumes: `m.base.favs`, `m.view.editFavs`, `act.applyFav/addFav/removeFav/toggleEdit`, `pill`
- Produces: Seite `{ title: 'Favoriten', draw }`; Ziel-Schlüssel `fav-<i>` (anwenden bzw. auf dem ersten leeren Platz speichern), `del-<i>` (im Bearbeiten-Modus), `save`, `edit`.

- [ ] **Step 1: Failing tests einfügen**

Direkt über `// ---- run ----`:

```js
test('Favoriten: save on the first empty place, apply, delete in edit mode', () => {
    const r = pageRig({ page: 2 });
    let by = r.draw();
    assert.ok(by('fav-0') && by('save') && !by('fav-1') && !by('edit'));
    by('fav-0').run();                                  // the first empty place saves the current colours
    assert.strictEqual(r.state.get().favs.length, 1);
    r.state.setColor('upper', { h: 120, s: 1 });
    r.state.setEffect('cycle');
    by = r.draw();
    by('fav-0').run();                                  // applies it and ends the effect
    assert.deepStrictEqual([r.state.get().upper.h, r.state.get().effect], [0, null]);
    by('edit').run();
    by = r.draw();
    assert.ok(by('del-0') && !by('save'));
    by('del-0').run();
    assert.strictEqual(r.state.get().favs.length, 0);
});
test('Favoriten: save is dimmed with 8 favourites', () => {
    const r = pageRig({ page: 2 });
    for (let i = 0; i < 8; i++) r.state.addFav();
    assert.ok(!r.draw()('save'));
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `Favoriten:`-Tests FAIL (`PAGES[2]` undefined).

- [ ] **Step 3: `ui_favs.js` schreiben**

`apps/gs_ambient/ui_favs.js`:

```js
'use strict';
/**
 * ui_favs.js - the Favoriten page: 8 places (a tap applies one; the first empty one saves the current
 * colours), "+ Aktuelle speichern" and Bearbeiten, in which only the X on a place deletes it.
 */
const { withAlpha } = require('./kit/canvas');
const { pill } = require('./ui_parts');

const TW = 380, TH = 150, GAP = 12, X0 = 24, Y0 = 56, BAR_Y = 392, MAX = 8;

function draw(cv, t, m, act) {
    const favs = m.base.favs, edit = m.view.editFavs;
    for (let i = 0; i < MAX; i++) {
        const x = X0 + (i % 4) * (TW + GAP), y = Y0 + Math.floor(i / 4) * (TH + GAP), f = favs[i];
        if (!f) {
            const next = i === favs.length && !edit;
            cv.strokeRoundRect(x, y, TW, TH, 14, 1.5, withAlpha('#ffffff', next ? 0.3 : 0.12));
            cv.text(next ? '+ Hier speichern' : 'Leer', x + TW / 2, y + TH / 2 + 8, 22, t.dim, { align: 'center', font: 'bold' });
            if (next) cv.target(x, y, TW, TH, () => act.addFav(), 'fav-' + i, 14);
            continue;
        }
        cv.roundRect(x, y, TW, TH, 14, withAlpha('#ffffff', 0.05));
        cv.roundRect(x + 24, y + 26, TW - 48, 24, 12, f.upper);
        cv.roundRect(x + 24, y + 62, TW - 48, 24, 12, f.lower);
        cv.text('Favorit ' + (i + 1), x + 24, y + 128, 24, t.text, { font: 'bold' });
        if (edit) {
            cv.circle(x + TW - 40, y + 120, 22, withAlpha(t.crit, 0.9));
            cv.text('X', x + TW - 40, y + 128, 24, '#ffffff', { align: 'center', font: 'bold' });
            cv.target(x + TW - 70, y + 90, 60, 60, () => act.removeFav(i), 'del-' + i, 30);
        } else cv.target(x, y, TW, TH, () => act.applyFav(i), 'fav-' + i, 14);
    }
    cv.roundRect(X0, BAR_Y, 4 * TW + 3 * GAP, 108, 14, withAlpha('#ffffff', 0.04));
    const x = X0 + 24 + pill(cv, t, X0 + 24, BAR_Y + 30, 380, 48, '+ Aktuelle speichern', () => act.addFav(),
        { off: favs.length >= MAX || edit, key: 'save' }) + 16;
    pill(cv, t, x, BAR_Y + 30, 240, 48, edit ? 'Fertig' : 'Bearbeiten', () => act.toggleEdit(), { off: !favs.length && !edit, key: 'edit' });
}

module.exports = { title: 'Favoriten', draw };
```

- [ ] **Step 4: Seite eintragen**

In `apps/gs_ambient/ui.js` ersetzen:

```js
const PAGES = [require('./ui_color'), require('./ui_effects')];
```

durch:

```js
const PAGES = [require('./ui_color'), require('./ui_effects'), require('./ui_favs')];
```

- [ ] **Step 5: Tests grün**

Run: `node kit/tools/test_gs_ambient.js`
Expected: `all 46 passed`

- [ ] **Step 6: Im Emulator prüfen**

1. Reiter „FAVORITEN“: Platz 1 zeigt „+ Hier speichern“; Antippen speichert die aktuellen Farben.
2. Zwei Favoriten anlegen → im Reiter „Effekte“ ist „Überblenden“ jetzt startbar und blendet zwischen beiden.
3. „BEARBEITEN“: X auf den Kacheln; nur das X löscht; „FERTIG“ beendet den Modus.
4. „Fahrmodus“ mit „Sport: Favorit 1“ einstellen, dann Favorit 1 löschen → Regler zeigt „Standard“.

- [ ] **Step 7: Commit**

```bash
git add apps/gs_ambient/ui_favs.js apps/gs_ambient/ui.js kit/tools/test_gs_ambient.js
git commit -m "gs_ambient: Seite Favoriten"
```

---

### Task 13: Abnahme, Bildschirmfotos und Dokumentation

**Files:**
- Create: `docs/am-auto-pruefen.md`, `apps/gs_ambient/README.md`, `docs/screens/farbe.png`, `docs/screens/effekte.png`, `docs/screens/favoriten.png`

**Interfaces:**
- Consumes: alles aus Task 1-12
- Produces: geprüfte App, Bildschirmfotos als Vergleich, Checkliste für das Auto.

- [ ] **Step 1: Alle Tests**

```bash
node kit/tools/test_gs_ambient.js && node kit/tools/test_target_input.js && node kit/tools/test_live_adjustments.js && node kit/tools/test_zh.js
```

Expected: alle Exit-Code 0 (`all 46 passed`, `all 4 passed`).

- [ ] **Step 2: Node-8-Prüfung des App-Codes**

```bash
rg -n '\?\.|\?\?|catch \{|\.flat\(|fromEntries|\{\s*\.\.\.' apps/gs_ambient/*.js
```

Expected: keine Treffer.

- [ ] **Step 3: Store-Probe**

```bash
python3 kit/tools/build.py gs_ambient
ls dist | rg gs_ambient
python3 -c "import json;m=json.load(open('mgu-repo.json'));print(m['apps']['path'], m['apps']['manifest'])"
```

Expected: `gs_ambient@0.1.0.tgz` (und `.mgu`) in `dist/`; `apps/* app.json` (die App liegt unter `apps/gs_ambient/app.json` und wird damit gefunden).

- [ ] **Step 4: Bildschirmfotos aus dem Emulator**

Emulator starten (`node kit/tools/emu.js gs_ambient --port 8077`), im Browser jeden Reiter öffnen und ein Bildschirmfoto der App-Fläche speichern als `docs/screens/farbe.png`, `docs/screens/effekte.png` (mit laufendem „Farbverlauf“), `docs/screens/favoriten.png` (mit zwei Favoriten). Jedes Bild ansehen: keine Fragezeichen statt Umlauten, nichts abgeschnitten, Kopfzeile mit „SIMULIERT“.

- [ ] **Step 5: Checkliste „Am Auto prüfen“ schreiben**

`docs/am-auto-pruefen.md`:

```markdown
# Am Auto prüfen

Was sich nur am Auto klären lässt, bevor eine echte Lichtsteuerung freigeschaltet wird. Reihenfolge bindend:
jeder Schritt erst, wenn der vorherige erledigt ist. Bis dahin bleibt „Lichtsteuerung“ auf „Simuliert“ und
`light_profile.js` / `light_bdc.js` haben `validated: false`.

1. **Codierungs-Backup der Headunit.** Das Root-Flashen mit idrive7-8-ssh-root löscht die Codierung der
   Headunit und die Digital-Key-Kopplungen.
2. **Nur lesend über ENET** (HSFZ, Port 6801, Client: `idrive7-8-ssh-root/mgu7/hsfz.py`): am BDC
   `22 F150` (Version) und `22 360A` (LIC_LCI_COLOR_LIBRARY_DATA) lesen und ablegen.
3. **Root einrichten** mit idrive7-8-ssh-root.
4. **SOME/IP-Katalog nach Licht-Feldern mit Setter durchsuchen** (Weg A, `light_profile.js`):
   `grep -o -i -E '"[A-Za-z0-9_.]*(ambien|interior|innenlicht|lci)[A-Za-z0-9_.]*"' /etc/oap/someip/someip-interfaces.json | sort -u`
5. **BDC-Beschreibungsdatei** (Tool32 / EdiabasLib) nach `STEUERN`-Jobs für LCI / Ambiente durchsuchen
   (Weg B, `light_bdc.js`): Job, Datenkennung, Datenformat, Rückgabe der Kontrolle.
6. **Quellen für Fahrmodus und Musikpegel** im Katalog suchen (Effekte „Fahrmodus“ und „Musik“, `inputs.js`).
7. **Erst dann einen Weg einzeln testen** (stehendes Auto, Zündung an), Ergebnis festhalten, und den Weg
   im Code freischalten (`validated: true` mit echter `apply`/`release`), mit Tests wie in
   `kit/tools/test_gs_ambient.js`.

Nie veröffentlichen: das Platzhalter- oder echte `oap-sdk/`, `dist/`, `*.mgu` (enthalten BMWs SDK).
```

- [ ] **Step 6: App-README schreiben**

`apps/gs_ambient/README.md`:

```markdown
# Ambient

Farbrad für die Ambientebeleuchtung (BMW G2x, iDrive 7): zwei Zonen (oben, unten), Helligkeit, acht Effekte
(Farbverlauf, Überblenden, Atmen, Drehzahl, Geschwindigkeit, Fahrmodus, Fahrdynamik, Musik) und bis zu
8 Favoriten.

**Version 1 sendet nichts ans Auto.** Die Lichtsteuerung ist „Simuliert“; die Wege „Profil umschalten“ und
„BDC-Stellgliedtest“ sind gesperrt, bis sie am Auto geprüft sind (`docs/am-auto-pruefen.md`).

- Bedienung: Touch (Tippen, Ziehen auf Rad und Reglern) und iDrive-Controller (Kippen = Fokus, Drehen auf Rad
  und Reglern = Wert, Drücken = auslösen). Volle Bedienung nur im Vollbild mit GPU-Renderer.
- Emulator: `node kit/tools/emu.js gs_ambient` → http://localhost:8077
- Tests: `node kit/tools/test_gs_ambient.js`
- Design: `docs/superpowers/specs/2026-10-31-ambient-colorwheel-design.md`
```

- [ ] **Step 7: Commit**

```bash
git add docs/am-auto-pruefen.md apps/gs_ambient/README.md docs/screens/farbe.png docs/screens/effekte.png docs/screens/favoriten.png
git commit -m "gs_ambient: Checkliste Am Auto prüfen, README, Emulator-Bildschirmfotos"
```
