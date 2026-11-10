'use strict';
/**
 * bdc_proto.js - the body controller's temporary RGB actuator, as confirmed on BDC_G05:
 * read the LIN modules (22 DA5F / 22 E3D1, 10 bytes each), write one module
 * (2E DA5E / 2E E3D1) for up to 254 s. Nothing here sends.
 */
const BDC = 0x40;
const SGBD_G05 = '0F2680';
const HOLD_S = 254;
const RENEW_MS = 120000;
const BUSES = [
    { name: 'lin1', read: [0xDA, 0x5F], write: [0xDA, 0x5E] },
    { name: 'lin2', read: [0xE3, 0xD1], write: [0xE3, 0xD1] },
];
// Footwells are the lower zone. Everything else fitted on the car is the upper zone.
const FOOTWELL = [[0x01, 0x04], [0x23, 0x24]];

const cap = (n) => Math.max(0, Math.min(254, Math.round(Number(n) || 0)));
const hex2 = (n) => (n & 255).toString(16).toUpperCase().padStart(2, '0');

function zoneOf(loc) {
    for (let i = 0; i < FOOTWELL.length; i++) {
        if (loc >= FOOTWELL[i][0] && loc <= FOOTWELL[i][1]) return 'lower';
    }
    return 'upper';
}

/** 62 F1 50 -> the 6-digit SGBD index, or null. */
function sgbdOf(uds) {
    if (!uds || uds[0] !== 0x62 || uds[1] !== 0xF1 || uds[2] !== 0x50 || uds.length < 6) return null;
    return hex2(uds[3]) + hex2(uds[4]) + hex2(uds[5]);
}

/** One status reply -> the modules that are fitted. NAD is the record's place, starting at 1. */
function parseModules(uds, bus) {
    const out = [];
    for (let i = 3, nad = 1; i + 10 <= (uds ? uds.length : 0); i += 10, nad++) {
        if (uds[i] === 0xFF) continue;
        out.push({ bus: bus, nad: nad, loc: uds[i], zone: zoneOf(uds[i]) });
    }
    return out;
}

function busOf(name) {
    for (let i = 0; i < BUSES.length; i++) if (BUSES[i].name === name) return BUSES[i];
    return null;
}

/** The write for one module. bright is 0..100. Colour bytes never use 0xFF (that means "no change"). */
function frameWrite(mod, rgb, bright) {
    const bus = busOf(mod.bus);
    const b = Math.max(0, Math.min(100, Math.round(bright)));
    return bus.write.concat([mod.nad, 1, b, cap(rgb[0]), cap(rgb[1]), cap(rgb[2]), HOLD_S]);
}

/** Hand the module back to the car's own colour at once. */
function frameRelease(mod) {
    return busOf(mod.bus).write.concat([mod.nad, 0, 0, 0, 0, 0, 0]);
}

/** Which bytes each fitted module should get for this frame. brightness is 0..1. */
function plan(mods, frame) {
    const bright = Math.round(Math.max(0, Math.min(1, frame.brightness)) * 100);
    return mods.map((m) => ({ mod: m, bytes: frameWrite(m, frame[m.zone] || frame.upper, bright) }));
}

module.exports = {
    BDC: BDC, SGBD_G05: SGBD_G05, HOLD_S: HOLD_S, RENEW_MS: RENEW_MS, BUSES: BUSES,
    zoneOf: zoneOf, sgbdOf: sgbdOf, parseModules: parseModules, frameWrite: frameWrite, frameRelease: frameRelease, plan: plan,
};
