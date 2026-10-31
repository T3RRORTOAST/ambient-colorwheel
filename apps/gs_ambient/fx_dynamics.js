'use strict';
/**
 * Fahrdynamik: a short flash (300 ms, fading) when the combined acceleration passes the threshold; the
 * harder, the stronger. Only the size counts: there are two zones, upper and lower, no sides.
 */
const C = require('./color');

const FLASH_S = 0.3;
const FLASH = { red: [255, 0, 0], white: [255, 255, 255], blue: [0, 85, 255], amber: [255, 140, 0] };

module.exports = {
    id: 'dynamics',
    name: 'Fahrdynamik',
    needs: ['gLong', 'gLat'],
    swatch: [[255, 48, 48], [48, 0, 0]],
    params: [
        { key: 'thresh', label: 'Schwelle', type: 'range', min: 0.3, max: 0.8, step: 0.1, default: 0.5, unit: 'g' },
        { key: 'color', label: 'Blitz', type: 'choice', options: [['red', 'Rot'], ['white', 'Weiß'], ['blue', 'Blau'], ['amber', 'Orange']], default: 'red' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base, mem) {
        const g = Math.sqrt(inputs.gLong * inputs.gLong + inputs.gLat * inputs.gLat);
        if (g >= p.thresh) {
            if (!(t < mem.until)) mem.peak = 0;
            mem.until = t + FLASH_S;
            mem.peak = Math.max(mem.peak || 0, g);
        }
        if (!(t < mem.until)) return { upper: base.upper, lower: base.lower, brightness: base.brightness };
        const strength = C.clamp(0.4 + 0.6 * (mem.peak - p.thresh) / 0.5, 0, 1);
        const k = C.clamp(strength * (mem.until - t) / FLASH_S, 0, 1), c = FLASH[p.color] || FLASH.red;
        return { upper: C.mixRgb(base.upper, c, k), lower: C.mixRgb(base.lower, c, k), brightness: base.brightness + (1 - base.brightness) * k };
    },
};
