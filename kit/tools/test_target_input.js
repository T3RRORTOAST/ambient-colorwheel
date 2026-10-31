'use strict';

// Kit targets that follow a finger (opts.drag) or take the controller's knob (opts.turn), against a Display
// with a stubbed renderer. No SDK, renderer or HMI needed:
//   node kit/tools/test_target_input.js

const assert = require('assert');
const { Recorder } = require('../runtime/record');
const { Display } = require('../runtime/display');

const log = { info() {}, warn() {}, debug() {}, error(...a) { throw new Error(a.map(String).join(' ')); } };

/** A Display as where the kit runs the screen (own), at scale 1, with these page targets. */
function display(targets) {
    const d = new Display({}, log, { screens: [] }, { get() {}, onChange() {} }, () => ({}));
    d.own = () => true;
    d.place = { scale: 1, ox: 0, oy: 0, x: 0, w: 1920, h: 720 };
    d.barH = () => 48;
    d.buttons = () => [];
    d.tabs = [];
    d._repaint = () => {};
    d.pageTargets = targets;
    return d;
}
const ccu = (d, k, pb, df) => d._ccu({ frontRotaryEncoderOperation: k, frontRotaryEncoderPushButton: pb || 0, frontRotaryEncoderDeflection: df || 0 });

const tests = [
    ['record.target keeps drag and turn', () => {
        const r = new Recorder(100, 100), drag = () => {}, turn = () => {};
        r.target(0, 0, 10, 10, null, 'a', 0, { drag, turn });
        r.target(0, 0, 10, 10, null, 'b');
        assert.strictEqual(r.targets[0].drag, drag);
        assert.strictEqual(r.targets[0].turn, turn);
        assert.strictEqual(r.targets[1].drag, undefined);
        assert.strictEqual(r.targets[1].turn, undefined);
    }],
    ['a finger that lands on a drag target is followed until it lifts', () => {
        const seen = [];
        let runs = 0;
        const d = display([{ x: 100, y: 100, w: 200, h: 200, key: 'wheel', run: () => { runs++; }, drag: (ph, x, y) => seen.push([ph, x, y]) }]);
        d._touch(1, 150, 150);
        d._touch(2, 180, 160);
        d._touch(2, 400, 400);          // outside the target: still followed
        d._touch(3, 410, 410);
        d._touch(2, 150, 150);          // lifted: nothing more
        assert.deepStrictEqual(seen, [[1, 150, 150], [2, 180, 160], [2, 400, 400], [3, 410, 410]]);
        assert.strictEqual(runs, 0);
    }],
    ['a tap on a plain target still runs it', () => {
        let runs = 0;
        const d = display([{ x: 0, y: 0, w: 50, h: 50, key: 'btn', run: () => { runs++; } }]);
        d._touch(1, 10, 10);
        d._touch(3, 12, 12);
        assert.strictEqual(runs, 1);
    }],
    ['the knob turns a turn target while it has the focus; pushing moves on', () => {
        const turns = [];
        let presses = 0;
        const d = display([
            { x: 0, y: 0, w: 50, h: 50, key: 'wheel', run: () => { presses++; }, turn: (n) => turns.push(n) },
            { x: 100, y: 0, w: 50, h: 50, key: 'other', run() {} },
        ]);
        ccu(d, 10);                      // the counter's start
        ccu(d, 11);                      // first turn: the focus lands on the first place
        assert.strictEqual(d.focusKey, 'tgt:wheel');
        assert.deepStrictEqual(turns, []);
        ccu(d, 13);                      // two notches on the wheel: its value, the focus stays
        assert.deepStrictEqual(turns, [2]);
        assert.strictEqual(d.focusKey, 'tgt:wheel');
        ccu(d, 13, 1);                   // press runs it as before
        assert.strictEqual(presses, 1);
        ccu(d, 13, 0, 4);                // pushed right: the next place
        assert.strictEqual(d.focusKey, 'tgt:other');
        ccu(d, 14);                      // a plain target: turning moves the focus, no turn call
        assert.deepStrictEqual(turns, [2]);
    }],
];

let failed = 0;
for (const [name, fn] of tests) {
    try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed');
process.exit(failed ? 1 : 0);
