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
