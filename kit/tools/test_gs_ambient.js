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

// ---- run ----
(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
    }
    console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
