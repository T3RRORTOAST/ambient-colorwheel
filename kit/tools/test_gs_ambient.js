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
test('light: simulated is the safe default; BDC-Licht needs a link; profile stays locked', async () => {
    const light = app('light.js');
    const sim = light.createBackend('sim'), profile = light.createBackend('profile'), bdc = light.createBackend('bdc');
    assert.deepStrictEqual([sim.kind, sim.validated, sim.maxRate], ['sim', true, 20]);
    assert.deepStrictEqual([bdc.validated, bdc.maxRate, bdc.capabilities.brightness], [true, 2, true]);
    assert.strictEqual(profile.validated, false);
    assert.deepStrictEqual(await bdc.apply(F([1, 2, 3])), { ok: false, reason: 'keine Verbindung' });
    assert.deepStrictEqual(await bdc.survey(), { ok: false, reason: 'keine Verbindung' });
    assert.deepStrictEqual(await profile.apply(F([1, 2, 3])), { ok: false, reason: 'gesperrt' });
    assert.strictEqual(light.createBackend('nonsense').name, 'sim');
});
test('comfort: on while someone is in the car and the factory light is on, off when the car is left', () => {
    const c = app('comfort.js');
    assert.strictEqual(c.shouldLight({ backend: 'bdc', cond: null, ambientOn: null, ambientKnown: false }), true);
    assert.strictEqual(c.shouldLight({ backend: 'bdc', cond: 5, ambientOn: true, ambientKnown: true }), true);
    assert.strictEqual(c.shouldLight({ backend: 'bdc', cond: 10, ambientOn: true, ambientKnown: true }), true);
    [1, 2, 3].forEach((n) => assert.strictEqual(c.inCar(n), false, 'cond ' + n));
    assert.strictEqual(c.shouldLight({ backend: 'bdc', cond: 1, ambientOn: true, ambientKnown: true }), false);
    assert.strictEqual(c.whyNot({ backend: 'bdc', cond: 'PARKEN', ambientOn: true, ambientKnown: true }), 'Auto aus');
    assert.strictEqual(c.shouldLight({ backend: 'bdc', cond: 8, ambientOn: false, ambientKnown: true }), false);
    assert.strictEqual(c.whyNot({ backend: 'bdc', cond: 8, ambientOn: false, ambientKnown: true }), 'Ambiente aus');
    assert.strictEqual(c.shouldLight({ backend: 'sim', cond: 8, ambientOn: true, ambientKnown: true }), false);
    assert.strictEqual(c.inCar('WOHNEN'), true);
    assert.strictEqual(c.leftCar(null), false);
    assert.strictEqual(c.leftCar(5), false);
    assert.strictEqual(c.codeOf({ statusConditionVehicle: 'STANDFUNKTIONEN_KUNDE_NICHT_IM_FZG' }), 3);
    assert.strictEqual(c.leftCar({ VehicleCondition: { statusConditionVehicle: 3 } }), true);
    assert.strictEqual(c.codeOf([0, 0, 0, 0, 0, 2]), 2);
    assert.strictEqual(c.leftCar(2), true);
    const boot = { light: 'bdc', autostart: true, boot: true };
    assert.strictEqual(c.shouldEnsure(boot), true);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: false, boot: true }), false);
    assert.strictEqual(c.shouldEnsure({ light: 'sim', autostart: true, boot: true }), false);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: false, opened: true }), true);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: true, woke: true, parked: true }), true);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: false, woke: true, parked: true }), false);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: true, boot: true, parked: true }), false);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: true, opened: true, left: true }), false);
    assert.strictEqual(c.shouldEnsure({ light: 'bdc', autostart: true, boot: true, left: true }), false);
    assert.strictEqual(c.keeperCurrent(null), false);
    assert.strictEqual(c.keeperCurrent({ rev: 1 }), false);
    assert.strictEqual(c.keeperCurrent({ rev: c.REV }), true);
    assert.deepStrictEqual(c.catalogNames('x "de.bmw.infotainment.misc.ComfortFunctionIuK" "de.bmw.infotainment.vehicle.VehicleCondition" "de.bmw.other.Speed"'),
        ['de.bmw.infotainment.misc.ComfortFunctionIuK', 'de.bmw.infotainment.vehicle.VehicleCondition']);
    const dbg = path.join(os.tmpdir(), 'gs-ambient-debug-' + process.pid);
    fs.mkdirSync(dbg);
    const files = c.paths(dbg);
    const saved = c.record(files, { debug: true, catalog: ['de.bmw.x.Comfort'], bdc: { ok: false, reason: 'keine Verbindung' } });
    assert.strictEqual(saved.debug, true);
    assert.strictEqual(c.readJson(files.probe).bdc.reason, 'keine Verbindung');
    assert.ok(fs.readFileSync(files.debug, 'utf8').indexOf('keine Verbindung') > 0);
    const mirror = c.createMirror(path.join(os.tmpdir(), 'gs-comfort-missing.json'));
    assert.deepStrictEqual(mirror.liveStatus(), { state: 'aus', reason: 'Dienst nicht gestartet' });
    return mirror.release();
});
test('bdc: modules, zones and the write that holds a colour', () => {
    const p = app('bdc_proto.js');
    const uds = [0x62, 0xE3, 0xD1, 0x01, 0, 0, 254, 100, 0, 0, 0, 0, 0, 0x15, 0, 0, 10, 80, 0, 0, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F, 3, 7, 7, 7, 7];
    const mods = p.parseModules(uds, 'lin2');
    assert.deepStrictEqual(mods.map((m) => [m.nad, m.zone]), [[1, 'lower'], [2, 'upper']]);
    assert.strictEqual(p.zoneOf(0x08), 'lower');
    assert.strictEqual(p.zoneOf(0x0F), 'lower');
    assert.strictEqual(p.zoneOf(0x1D), 'lower');
    assert.strictEqual(p.zoneOf(0x05), 'upper');
    assert.strictEqual(p.zoneOf(0x35), 'upper');
    assert.strictEqual(p.nameOf(0x1D), 'Centre stack tray');
    assert.strictEqual(p.sgbdOf([0x62, 0xF1, 0x50, 0x0F, 0x26, 0x80]), '0F2680');
    assert.strictEqual(p.sgbdOf([0x62, 0xF1, 0x50, 0x0F, 0x20, 0x50]), '0F2050');
    const planned = p.plan(mods, { upper: [254, 0, 0], lower: [0, 0, 254], brightness: 0.5 });
    assert.deepStrictEqual(planned[0].bytes, [0xE3, 0xD1, 1, 1, 50, 0, 0, 254, 254]);
    assert.deepStrictEqual(planned[1].bytes, [0xE3, 0xD1, 2, 1, 50, 254, 0, 0, 254]);
    assert.deepStrictEqual(p.frameWrite({ bus: 'lin1', nad: 1 }, [255, -4, 10], 150), [0xDA, 0x5E, 1, 1, 100, 254, 0, 10, 254]);
    assert.deepStrictEqual(p.frameRelease(mods[0]), [0xE3, 0xD1, 1, 0, 0, 0, 0, 0, 0]);
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
    assert.deepStrictEqual(fx.EFFECTS.map((e) => e.id), ['cycle', 'pairs', 'fade', 'breathe']);
    assert.deepStrictEqual(fx.paramsOf(fx.byId.cycle, { period: 30, speed: 7.5 }), { speed: 7.5, zones: 'same' });
    assert.strictEqual(fx.paramsOf(fx.byId.breathe, { period: 4 }).period, 15);
    const st = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    st.addFav();
    const b = fx.baseOf(st.get());
    assert.deepStrictEqual([b.upper, b.lower, b.brightness, b.favs], [[255, 0, 0], [0, 85, 255], 0.8,
        [{ upper: [255, 0, 0], lower: [0, 85, 255], upperC: { h: 0, s: 1 }, lowerC: { h: 220, s: 1 } }]]);
});
test('fx: stepping settings (tap wraps, the knob stops at the ends)', () => {
    const fx = app('fx.js');
    const speed = fx.byId.cycle.params[0], zones = fx.byId.cycle.params[1];
    assert.strictEqual(fx.stepParam(speed, 5.5, 1, 0, true), 5.55);
    assert.strictEqual(fx.stepParam(speed, 10, 1, 0, true), 1);
    assert.strictEqual(fx.stepParam(speed, 10, 1, 0, false), 10);
    assert.strictEqual(fx.stepParam(speed, 1, -3, 0, false), 1);
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
    assert.strictEqual(fx.formatParam(fx.byId.cycle.params[0], 5.5), '5,50');
    assert.strictEqual(fx.formatParam(fx.byId.cycle.params[0], 1.25), '1,25');
    assert.strictEqual(fx.formatParam(fx.byId.cycle.params[0], 7.5), '7,50');
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
    assert.strictEqual(fx.availability(fx.byId.pairs, {}, base0()), 'Mindestens 2 Favoriten nötig');
    assert.strictEqual(fx.availability({ needs: ['rpm'], params: [] }, { rpm: null }, base0()), 'Daten nicht verfügbar');
});
test('fx: which effects go on when the colours change', () => {
    const fx = app('fx.js');
    const st = (effect, params) => ({ effect, params: params || {} });
    assert.strictEqual(fx.keepsRunning(st(null)), false);
    assert.strictEqual(fx.keepsRunning(st('cycle')), false);
    assert.strictEqual(fx.keepsRunning(st('fade')), false);
    assert.strictEqual(fx.keepsRunning(st('pairs')), false);
    assert.strictEqual(fx.keepsRunning(st('breathe')), true);
});

/* ---------- time-based effects ---------- */
test('fx cycle: runs through the wheel, offset puts the lower zone half a turn on', () => {
    assert.deepStrictEqual(run('cycle', 0).upper, RED);
    assert.deepStrictEqual(run('cycle', 50, {}, { speed: 10 }).upper, GREEN);
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
    near(run('breathe', 15, {}, { period: 30, depth: 50 }).brightness, 0.4);
    assert.deepStrictEqual(run('breathe', 15).upper, RED);
});
test('color: the short arc from blue toward red passes magenta, and the way back is the same arc', () => {
    const C = app('color.js');
    near(C.lerpColor({ h: 240, s: 1 }, { h: 0, s: 1 }, 0.5).h, 300, 1e-6);
    near(C.lerpColor({ h: 0, s: 1 }, { h: 240, s: 1 }, 0.5).h, 300, 1e-6);
});
test('fx pairs: each zone walks its own arc and has not jumped halfway', () => {
    const C = app('color.js');
    const pair = (uh, lh) => ({ upper: C.toRgb({ h: uh, s: 1 }), lower: C.toRgb({ h: lh, s: 1 }), upperC: { h: uh, s: 1 }, lowerC: { h: lh, s: 1 } });
    const base = base0({ favs: [pair(0, 240), pair(90, 0)] });
    const mem = {};
    assert.deepStrictEqual(run('pairs', 0, {}, { speed: 10 }, base, mem).upper, RED);
    const mid = run('pairs', 25, {}, { speed: 10 }, base, mem);
    const upper = C.toRgb({ h: 45, s: 1 }), lower = C.toRgb({ h: 300, s: 1 });
    mid.upper.forEach((c, i) => near(c, upper[i], 8));
    mid.lower.forEach((c, i) => near(c, lower[i], 8));
});

test('fx: the slow effects, at most three settings each', () => {
    const fx = app('fx.js');
    assert.deepStrictEqual(fx.EFFECTS.map((e) => e.id), ['cycle', 'pairs', 'fade', 'breathe']);
    fx.EFFECTS.forEach((e) => {
        assert.ok(e.params.length <= 3, e.id);
        e.params.forEach((p) => assert.ok(p.default !== undefined, e.id + '.' + p.key));
    });
});

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
    st.setParam('cycle', 'speed', 10);
    st.setEffect('cycle');
    await clk.advance(50);                      // the effect starts at this tick
    assert.deepStrictEqual(frames[frames.length - 1].upper, RED);
    await clk.advance(50000);                   // 50 s into a 150 s turn at tempo 10
    assert.deepStrictEqual(loop.frame().upper, GREEN);
    st.setEffect('breathe');
    await clk.advance(50);
    near(loop.frame().brightness, 0.8);         // a new effect starts at its own beginning
    loop.stop();
    const n = frames.length;
    await clk.advance(1000);
    assert.strictEqual(frames.length, n);
});
test('loop: the saved effect resumes on the group that was open', () => {
    const state = app('state.js'), fx = app('fx.js');
    const f = tmpFile();
    const pair = (uh, lh) => ({ upper: { h: uh, s: 1 }, lower: { h: lh, s: 1 } });
    fs.writeFileSync(f, JSON.stringify({
        effect: 'pairs', group: 1, params: { pairs: { speed: 10 } },
        groups: [
            { name: 'Favoriten', favs: [pair(0, 0), pair(30, 30)] },
            { name: 'Nacht', favs: [pair(120, 240), pair(90, 0)] },
        ],
    }));
    const st = state.readState(f);
    assert.strictEqual(st.groups[st.group].name, 'Nacht');
    const loop = fx.createLoop({ getState: () => st, readInputs: () => ({}), sink() {}, clock: fakeClock() });
    assert.deepStrictEqual(loop.tick().upper, GREEN);
});
test('loop: an effect without its data pauses on the fixed colours and says why', () => {
    const fx = app('fx.js');
    const st = app('state.js').createState(tmpFile(), { timers: manualTimers() });
    st.setEffect('fade');
    const loop = fx.createLoop({ getState: () => st.get(), readInputs: () => ({}), sink() {}, clock: fakeClock() });
    assert.deepStrictEqual(loop.tick().upper, RED);
    assert.strictEqual(loop.why(), 'Mindestens 2 Favoriten nötig');
});

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
    assert.deepStrictEqual(ui.badge({ state: 'aus', reason: 'Auto aus' }), { text: 'AUS · Auto aus', color: 'warn' });
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
    const dot = app('color.js').toPoint(r.state.get().lower, page.WR);
    by('wheel').drag(1, page.WX + dot[0], page.WY + dot[1]);
    assert.strictEqual(r.state.get().zone, 'lower');
    near(r.state.get().lower.h, 220, 1e-6);
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

test('Effekte: tiles start effects, tiles without data cannot be started', () => {
    const r = pageRig({ page: 1 });
    r.state.setColor('upper', { h: 0, s: 1 }); r.state.addFav(); r.state.addFav();
    let by = r.draw();
    ['cycle', 'pairs', 'fade', 'breathe'].forEach((id) => assert.ok(by('fx-' + id), 'tile ' + id));
    const live = pageRig({ page: 1, car: { demo: false } });
    by = live.draw();
    assert.ok(by('fx-cycle') && by('fx-breathe') && !by('fx-fade') && !by('fx-pairs'));
    by('fx-cycle').run();
    assert.strictEqual(live.state.get().effect, 'cycle');
});
test('Effekte: the bar has Aus and the running effect\'s settings (tap steps with wrap, the knob without)', () => {
    const r = pageRig({ page: 1 });
    let by = r.draw();
    assert.ok(!by('fx-off'), 'Aus is dimmed without an effect');
    by('fx-cycle').run();
    by = r.draw();
    assert.ok(by('fx-off') && by('p-speed') && by('p-zones') && by('p-speed').turn);
    by('p-speed').run();
    assert.strictEqual(r.state.get().params.cycle.speed, 5.55);
    by('p-speed').turn(-1);
    assert.strictEqual(r.state.get().params.cycle.speed, 5.5);
    by('p-zones').run();
    assert.strictEqual(r.state.get().params.cycle.zones, 'offset');
    by('fx-off').run();
    assert.strictEqual(r.state.get().effect, null);
});

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
test('state: an old favourite list becomes the Favoriten group; a new group keeps its own pairs', () => {
    const f = tmpFile();
    fs.writeFileSync(f, JSON.stringify({ favs: [{ upper: { h: 10, s: 1 }, lower: { h: 20, s: 1 } }] }));
    const s = app('state.js').createState(f, { timers: manualTimers() });
    assert.strictEqual(s.get().groups[0].name, 'Favoriten');
    assert.strictEqual(s.get().favs[0].upper.h, 10);
    assert.strictEqual(s.addGroup(''), -1);
    assert.strictEqual(s.addGroup('Sonnenuntergang'), 1);
    assert.strictEqual(s.get().groups[1].name, 'Sonnenuntergang');
    s.renameGroup('  Nacht   ');
    assert.strictEqual(s.get().groups[1].name, 'Nacht');
    assert.strictEqual(s.get().favs.length, 0);
    s.addFav();
    assert.strictEqual(s.get().groups[1].favs.length, 1);
    s.cycleGroup(-1);
    assert.strictEqual(s.get().group, 0);
    assert.strictEqual(s.get().favs[0].upper.h, 10);
});
test('Favoriten: a group is named on the keyboard, then chosen from its card', () => {
    const r = pageRig({ page: 2 });
    let by = r.draw();
    assert.ok(by('grp-0') && by('grp-new') && by('rename'));
    by('grp-new').run();
    by = r.draw();
    assert.ok(by('key-S') && by('key-shift') && !by('key-ok') && !by('fav-0'));
    by('key-S').run();
    'onnenuntergang'.split('').forEach((ch) => by('key-' + ch.toUpperCase()).run());
    by = r.draw();
    by('key-ok').run();
    assert.strictEqual(r.state.get().groups[1].name, 'Sonnenuntergang');
    assert.strictEqual(r.state.get().group, 1);
    by = r.draw();
    by('grp-0').run();
    assert.strictEqual(r.state.get().group, 0);
    by('rename').run();
    by = r.draw();
    by('key-del').run();
    by('key-ok').run();
    assert.strictEqual(r.state.get().groups[0].name, 'Favorite');
});
test('Favoriten: save is dimmed with 8 favourites', () => {
    const r = pageRig({ page: 2 });
    for (let i = 0; i < 8; i++) r.state.addFav();
    assert.ok(!r.draw()('save'));
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
