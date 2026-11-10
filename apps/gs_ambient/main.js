'use strict';
/**
 * Ambient - a colour wheel for the ambient lighting: two zones (upper, lower), brightness, three
 * effects (cycle, fade, breathe), favourites. Simulated by default. BDC-Licht is written by the
 * comfort keeper, which keeps renewing after this screen closes and hands the colour back when the
 * car is parked or standby, or the factory ambient light is off.
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
        if (signals.hasNative()) comfort.ensure(ctx.dataDir, log);
        let sender = light.createSender(backendFor(settings.get('light')), { log });
        settings.onChange((key) => {
            if (key !== 'light' && key !== 'debug') return;
            publish();
            if (key !== 'light') { log.info('debug: ' + settings.get('debug')); return; }
            sender.release();
            sender = light.createSender(backendFor(settings.get('light')), { log });
            log.info('light backend: ' + settings.get('light'));
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
