'use strict';
/**
 * ui_favs.js - the Favoriten page: 8 places (a tap applies one; the first empty one saves the current
 * colours), "+ Aktuelle speichern" and Bearbeiten, in which only the X on a place deletes it.
 */
const { withAlpha } = require('./kit/canvas');
const { pill } = require('./ui_parts');

const TW = 380, TH = 150, GAP = 12, X0 = 24, Y0 = 56, BAR_Y = 392, MAX = 8;

function draw(cv, t, m, act) {
    const favs = m.base.favs, edit = m.view.editFavs;
    for (let i = 0; i < MAX; i++) {
        const x = X0 + (i % 4) * (TW + GAP), y = Y0 + Math.floor(i / 4) * (TH + GAP), f = favs[i];
        if (!f) {
            const next = i === favs.length && !edit;
            cv.strokeRoundRect(x, y, TW, TH, 14, 1.5, withAlpha('#ffffff', next ? 0.3 : 0.12));
            cv.text(next ? '+ Hier speichern' : 'Leer', x + TW / 2, y + TH / 2 + 8, 22, t.dim, { align: 'center', font: 'bold' });
            if (next) cv.target(x, y, TW, TH, () => act.addFav(), 'fav-' + i, 14);
            continue;
        }
        cv.roundRect(x, y, TW, TH, 14, withAlpha('#ffffff', 0.05));
        cv.roundRect(x + 24, y + 26, TW - 48, 24, 12, f.upper);
        cv.roundRect(x + 24, y + 62, TW - 48, 24, 12, f.lower);
        cv.text('Favorit ' + (i + 1), x + 24, y + 128, 24, t.text, { font: 'bold' });
        if (edit) {
            cv.circle(x + TW - 40, y + 120, 22, withAlpha(t.crit, 0.9));
            cv.text('X', x + TW - 40, y + 128, 24, '#ffffff', { align: 'center', font: 'bold' });
            cv.target(x + TW - 70, y + 90, 60, 60, () => act.removeFav(i), 'del-' + i, 30);
        } else cv.target(x, y, TW, TH, () => act.applyFav(i), 'fav-' + i, 14);
    }
    cv.roundRect(X0, BAR_Y, 4 * TW + 3 * GAP, 108, 14, withAlpha('#ffffff', 0.04));
    const x = X0 + 24 + pill(cv, t, X0 + 24, BAR_Y + 30, 380, 48, '+ Aktuelle speichern', () => act.addFav(),
        { off: favs.length >= MAX || edit, key: 'save' }) + 16;
    pill(cv, t, x, BAR_Y + 30, 240, 48, edit ? 'Fertig' : 'Bearbeiten', () => act.toggleEdit(), { off: !favs.length && !edit, key: 'edit' });
}

module.exports = { title: 'Favoriten', draw };
