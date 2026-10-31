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
