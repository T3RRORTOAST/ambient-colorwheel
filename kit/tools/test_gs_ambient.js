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

// ---- run ----
(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
    }
    console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
