'use strict';
/**
 * Ambient - a colour wheel for the ambient lighting: two zones (upper, lower), brightness, three
 * effects (cycle, fade, breathe), favourites. Simulated by default. BDC-Licht is written by the
 * comfort keeper, which keeps renewing after this screen closes and hands the colour back when the
 * car is parked or standby. The head unit starts this process on its own. The Autostart setting
 * decides whether the saved colour is applied then, and again after the car is left and come back to.
 */
const path = require('path');
const mgu = require('./kit/mgu');
const signals = require('./kit/signals');
const Car = require('./kit/car');
const { createState } = require('./state');
const { readInputs } = require('./inputs');
const fx = require('./fx');
const light = require('./light');
const comfort = require('./comfort');
const ui = require('./ui');

mgu.run({
    async start(ctx) {
        const { settings, log } = ctx;
        const files = comfort.paths(ctx.dataDir);
        const car = new Car(ctx, ['rpm', 'speed', 'accel']);
        const state = createState(path.join(ctx.dataDir, 'gs_ambient_state.json'), { log });
        const t0 = Date.now();
        const inputs = () => readInputs(car.data(), (Date.now() - t0) / 1000);
        const publish = () => comfort.writeJson(files.light, { light: settings.get('light'), debug: settings.get('debug') });
        const backendFor = (name) => (name === 'bdc' ? comfort.createMirror(files.status) : light.createBackend(name, ctx));
        state.flush();
        publish();
        let parked = false, opened = false;
        const gate = (why) => ({
            light: settings.get('light'), autostart: settings.get('autostart') === true,
            boot: why === 'boot', opened: opened, woke: why === 'woke', parked: parked,
        });
        const consider = (why) => {
            if (!comfort.shouldEnsure(gate(why)) || !signals.hasNative()) return;
            comfort.ensure(ctx.dataDir, log);
            log.info('comfort keeper, ' + why);
        };
        consider('boot');
        if (signals.hasNative()) signals.watch('de.bmw.infrastructure.VehicleCondition', '1', {
            VehicleCondition: (v) => {
                const n = comfort.codeOf(v);
                if (n === null) return;
                if (comfort.leftCar(n)) { parked = true; state.flush(); log.info('Autostart wartet, Auto zu (' + n + ')'); return; }
                if (parked && comfort.inCar(n)) { parked = false; consider('woke'); }
            },
        }, log).catch((e) => log.warn('Fahrzeugzustand: ' + (e && e.message ? e.message : e)));
        setInterval(() => {
            const screens = (ctx.spec && ctx.spec.screens) || [];
            let vis = false;
            for (let i = 0; i < screens.length; i++) if (ctx.ui.isVisible(screens[i].name)) vis = true;
            if (vis && !opened) { opened = true; parked = false; consider('opened'); }
            if (!vis) opened = false;
        }, 1000);
        let sender = light.createSender(backendFor(settings.get('light')), { log });
        settings.onChange((key) => {
            if (key !== 'light' && key !== 'debug' && key !== 'autostart') return;
            publish();
            if (key === 'debug') { log.info('debug: ' + settings.get('debug')); return; }
            if (key === 'autostart') {
                log.info('autostart: ' + settings.get('autostart'));
                if (settings.get('autostart')) { parked = false; consider('boot'); }
                return;
            }
            sender.release();
            sender = light.createSender(backendFor(settings.get('light')), { log });
            log.info('light backend: ' + settings.get('light'));
            if (settings.get('light') === 'bdc') { opened = true; consider('opened'); }
        });
        state.onChange(() => sender.resume());
        const loop = fx.createLoop({ getState: () => state.get(), readInputs: inputs, sink: (frame) => sender.push(frame) });
        loop.start();
        if (ctx.app && ctx.app.on) ctx.app.on('shutdown', () => {
            loop.stop();
            state.flush();
            publish();
            if (settings.get('light') !== 'bdc') sender.release();
        });
        ui.start(ctx, { state, loop, sender: () => sender, inputs });
    },
});
