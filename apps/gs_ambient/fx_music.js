'use strict';
/** Musik: the brightness follows the audio level (0..1), scaled by the sensitivity. */
const C = require('./color');

module.exports = {
    id: 'music',
    name: 'Musik',
    needs: ['music'],
    swatch: [[155, 60, 255], [5, 7, 10]],
    params: [
        { key: 'sens', label: 'Empfindlichkeit', type: 'range', min: 1, max: 10, step: 1, default: 5, unit: '' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base) {
        const level = C.clamp(inputs.music * p.sens / 5, 0, 1);
        return { upper: base.upper, lower: base.lower, brightness: base.brightness * (0.15 + 0.85 * level) };
    },
};
