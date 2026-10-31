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
