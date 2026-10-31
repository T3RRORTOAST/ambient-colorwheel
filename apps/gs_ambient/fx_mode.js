'use strict';
/** Fahrmodus: a favourite per driving mode; without one Eco Pro is blue, Comfort the own colours, Sport red. */
const C = require('./color');

const KEYS = { eco: 'favEco', comfort: 'favComfort', sport: 'favSport' };

module.exports = {
    id: 'mode',
    name: 'Fahrmodus',
    needs: ['mode'],
    swatch: [[16, 254, 50], [61, 139, 255], [255, 48, 48]],
    params: [
        { key: 'favEco', label: 'Eco Pro', type: 'fav', default: -1 },
        { key: 'favComfort', label: 'Comfort', type: 'fav', default: -1 },
        { key: 'favSport', label: 'Sport', type: 'fav', default: -1 },
    ],
    usesBase: () => false,
    run(t, inputs, p, base) {
        const fav = KEYS[inputs.mode] ? base.favs[p[KEYS[inputs.mode]]] : null;
        if (fav) return { upper: fav.upper, lower: fav.lower, brightness: base.brightness };
        const col = inputs.mode === 'eco' ? C.hsvToRgb(220, 1, 1) : inputs.mode === 'sport' ? C.hsvToRgb(0, 1, 1) : null;
        return col ? { upper: col, lower: col, brightness: base.brightness } : { upper: base.upper, lower: base.lower, brightness: base.brightness };
    },
};
