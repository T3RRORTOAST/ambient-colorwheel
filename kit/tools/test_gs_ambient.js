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

// ---- run ----
(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
    }
    console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
