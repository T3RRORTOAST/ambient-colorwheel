'use strict';
/**
 * Route B: the BDC's actuator test (UDS 2F over the head unit's TASU link, as live_adjustments does on the
 * DME); release would return control to the BDC (2F ... 00). Locked: which job and identifier drive the
 * LCI colours is not known yet (docs/am-auto-pruefen.md, steps 2 and 5). Until verified it sends nothing.
 */
function create() {
    return {
        name: 'bdc', label: 'BDC-Stellgliedtest', kind: 'real', validated: false, maxRate: 10,
        capabilities: { freeColor: true, brightness: false },
        apply: () => Promise.resolve({ ok: false, reason: 'gesperrt' }),
        release: () => Promise.resolve(),
    };
}

module.exports = { create };
