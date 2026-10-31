'use strict';
/** Atmen: the brightness swells down and up again (cosine), the colours stay. */
module.exports = {
    id: 'breathe',
    name: 'Atmen',
    needs: [],
    swatch: [[255, 255, 255], [40, 40, 40]],
    params: [
        { key: 'period', label: 'Tempo', type: 'range', min: 2, max: 10, step: 1, default: 4, unit: 's' },
        { key: 'depth', label: 'Tiefe', type: 'range', min: 10, max: 80, step: 10, default: 50, unit: '%' },
    ],
    usesBase: () => true,
    run(t, inputs, p, base) {
        const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / p.period);
        return { upper: base.upper, lower: base.lower, brightness: base.brightness * (1 - (p.depth / 100) * k) };
    },
};
