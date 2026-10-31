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
