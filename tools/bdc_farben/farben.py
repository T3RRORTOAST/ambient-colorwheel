# BDC_BODY3 color library 360A and profile list 360D.
# Layout published by Y. Reiser, April 2021 (Bimmerpost thread 1708753,
# bimmerguide.de). A full 0xFF byte is stored as 0xFE; the BDC rejects 0xFF.

FARBEN = {
    0: 'Weiß', 1: 'Bronze', 2: 'Orange', 3: 'Blau', 4: 'Grün', 5: 'Lila',
    6: 'Farbe 6', 7: 'Farbe 7', 8: 'Farbe 8', 9: 'Farbe 9',
}

# Menu position 1..11. Position 5 is white/white in the stock list and has no
# second public name, so it stays "Position 5".
PROFILE = [
    (1, 'Bronze', (1, 1)),
    (2, 'Bronze-Weiß', (1, 0)),
    (3, 'Orange', (2, 2)),
    (4, 'Orange-Weiß', (2, 0)),
    (5, 'Position 5', (0, 0)),
    (6, 'Blau', (3, 3)),
    (7, 'Blau-Weiß', (3, 0)),
    (8, 'Grün', (4, 4)),
    (9, 'Grün-Weiß', (4, 0)),
    (10, 'Lila', (5, 5)),
    (11, 'Lila-Weiß', (5, 0)),
]

ZONEN = ('Türen und Armaturenbrett', 'Fußraum', 'Dachkonsole')

# Start of R for each zone. Colors 0..5 are a 15-byte block from byte 2.
# Colors 6..9 come from the same write-up and do not all have three zones.
DREIER = {}
for _i in range(6):
    _base = 2 + _i * 15
    DREIER[_i] = (_base + 1, _base + 6, _base + 11)
DREIER[6] = (93,)
DREIER[7] = (98, 103)
DREIER[8] = (108, 113)
DREIER[9] = (118, 123, 128)


def clamp(rgb):
    """Three channel bytes. 0xFF becomes 0xFE, which is the value the BDC accepts."""
    out = []
    changed = False
    for channel in rgb:
        if channel == 0xFF:
            out.append(0xFE)
            changed = True
        elif channel < 0 or channel > 0xFF:
            raise ValueError('Farbkanal außerhalb 00..FF')
        else:
            out.append(channel)
    return bytes(out), changed


def parse_rgb(text):
    raw = text.strip().replace('#', '').replace(' ', '')
    if len(raw) != 6:
        raise ValueError('Farbe als RRGGBB, zum Beispiel FE0000')
    try:
        rgb = bytes.fromhex(raw)
    except ValueError:
        raise ValueError('Farbe ist kein Hexwert: %s' % text)
    return clamp(rgb)


def _triple(block, start):
    if start < 0 or start + 3 > len(block):
        return None
    return bytes(block[start:start + 3])


def library(block):
    """Color number -> list of (zone name, rgb or None) for the zones this block has."""
    found = []
    for number in range(10):
        zones = []
        for zone, start in enumerate(DREIER[number]):
            zones.append((ZONEN[zone] if zone < len(ZONEN) else 'Zone %d' % (zone + 1), _triple(block, start)))
        found.append({'nr': number, 'name': FARBEN[number], 'zonen': zones})
    return found


def profiles(block):
    rows = []
    for pos, name, _stock in PROFILE:
        at = (pos - 1) * 2
        if at + 2 > len(block):
            pair = None
        else:
            pair = (block[at], block[at + 1])
        rows.append({'pos': pos, 'name': name, 'paar': pair, 'werk': pair == _stock if pair else False})
    return rows


def zone_ok(block, number):
    """The byte in front of each stored triple is a zone tag 01, 02 or 03."""
    for start in DREIER[number]:
        if start < 1 or start + 2 >= len(block):
            return False
        if block[start - 1] not in (0x01, 0x02, 0x03):
            return False
    return True


def all_zones(entry):
    values = [rgb for _name, rgb in entry['zonen'] if rgb is not None]
    if not values:
        return None
    if any(item != values[0] for item in values):
        return values
    return values[0]


def _referenced(profile_block):
    used = set()
    for row in profiles(profile_block):
        if row['paar']:
            used.add(row['paar'][0])
            used.add(row['paar'][1])
    return used


def _matching(lib, rgb):
    for entry in lib:
        triples = [item[1] for item in entry['zonen'] if item[1] is not None]
        if triples and all(item == rgb for item in triples):
            return entry['nr']
    return None


def _free_slots(lib_block, profile_block, reserved):
    used = _referenced(profile_block) | set(reserved)
    # 9 has three zones, then the shorter spare slots, then any unused stock color.
    ranked = [9, 8, 7, 6] + list(range(6))
    free = []
    for number in ranked:
        if number in used or not zone_ok(lib_block, number):
            continue
        if any(_triple(lib_block, start) is not None for start in DREIER[number]):
            free.append(number)
    return free


def plan(lib_block, profile_block, position, upper, lower, share=False):
    """Decide the new 360A/360D bytes for one menu position.

    A color the library already stores is reused, so other profiles stay as they
    are. Otherwise a color number that no profile points at is filled in, and
    only this position is pointed at it. Sharing an existing number (and therefore
    recoloring every profile that uses it) happens only with share=True.
    """
    upper, upper_clamped = clamp(upper)
    lower, lower_clamped = clamp(lower)
    rows = profiles(profile_block)
    row = next((item for item in rows if item['pos'] == position), None)
    if row is None or row['paar'] is None:
        return {'ok': False, 'grund': 'Profil %d steht in den gelesenen Bytes nicht' % position}
    lib = library(lib_block)
    notes = []
    if upper_clamped or lower_clamped:
        notes.append('FF wird als FE geschrieben, das nimmt der BDC an')
    chosen = []
    reserved = []
    assigned = {}
    for label, rgb in (('oben', upper), ('unten', lower)):
        have = _matching(lib, rgb)
        if have is not None:
            number = have
            notes.append('%s benutzt die vorhandene Farbe %02X' % (label, number))
        elif upper == lower and chosen:
            number = chosen[0]
        else:
            free = [n for n in _free_slots(lib_block, profile_block, reserved) if n not in chosen]
            if free:
                number = free[0]
                reserved.append(number)
                notes.append('%s legt Farbnummer %02X neu an (%d von 3 Zonen)' % (label, number, len(DREIER[number])))
            elif not share:
                return {
                    'ok': False,
                    'grund': 'Keine freie Farbnummer für %s. Eine belegte Nummer zu ändern '
                             'färbt jedes Profil um, das sie benutzt. Dafür steht --teile-farbe.' % label,
                }
            else:
                number = row['paar'][0 if label == 'oben' else 1]
                notes.append('%s überschreibt die benutzte Farbnummer %02X' % (label, number))
        if number in assigned and assigned[number] != rgb:
            return {
                'ok': False,
                'grund': 'Profil %s zeigt oben und unten auf dieselbe Farbnummer %02X. '
                         'Zwei verschiedene Farben brauchen eine freie Nummer.' % (row['name'], number),
            }
        assigned[number] = rgb
        chosen.append(number)
    new_lib = bytearray(lib_block)
    new_profiles = bytearray(profile_block)
    changed_numbers = []
    for number, rgb in ((chosen[0], upper), (chosen[1], lower)):
        current = _matching(lib, rgb)
        if current == number:
            continue
        if not zone_ok(lib_block, number):
            return {
                'ok': False,
                'grund': 'Farbnummer %02X hat nicht die erwarteten Zonenkennungen. '
                         'An diesem Auto wird nichts geschrieben, die Sicherung bleibt die Referenz.' % number,
            }
        for start in DREIER[number]:
            new_lib[start:start + 3] = rgb
        changed_numbers.append(number)
    at = (position - 1) * 2
    new_profiles[at] = chosen[0]
    new_profiles[at + 1] = chosen[1]
    collateral = []
    for other in rows:
        if other['pos'] == position or not other['paar']:
            continue
        if other['paar'][0] in changed_numbers or other['paar'][1] in changed_numbers:
            collateral.append(other['name'])
    dids = []
    if bytes(new_lib) != bytes(lib_block):
        dids.append('360A')
    if bytes(new_profiles) != bytes(profile_block):
        dids.append('360D')
    if not dids:
        notes.append('diese Farben stehen in dem Profil schon so')
    return {
        'ok': True,
        'pos': position,
        'name': row['name'],
        'vorher': row['paar'],
        'nachher': (chosen[0], chosen[1]),
        'oben': upper,
        'unten': lower,
        'bibliothek': bytes(new_lib),
        'profile': bytes(new_profiles),
        'dids': dids,
        'kollateral': collateral,
        'hinweise': notes,
    }


def hex_bytes(data):
    return ' '.join('%02X' % b for b in data)


def fmt_rgb(rgb):
    if rgb is None:
        return '—'
    return '%02X%02X%02X' % (rgb[0], rgb[1], rgb[2])


def report(lib_block, profile_block):
    lines = []
    lines.append('Farbbibliothek 360A, %d Bytes' % len(lib_block))
    for entry in library(lib_block):
        parts = []
        for name, rgb in entry['zonen']:
            if rgb is None:
                continue
            parts.append('%s %s' % (name, fmt_rgb(rgb)))
        if parts:
            lines.append('  %02X %s: %s' % (entry['nr'], entry['name'], '; '.join(parts)))
    lines.append('Profile 360D, %d Bytes' % len(profile_block))
    lib = library(lib_block)
    by_nr = {entry['nr']: entry for entry in lib}
    for row in profiles(profile_block):
        if row['paar'] is None:
            lines.append('  %2d %s: fehlt' % (row['pos'], row['name']))
            continue
        halves = []
        for index in row['paar']:
            entry = by_nr.get(index)
            rgb = all_zones(entry) if entry else None
            shown = fmt_rgb(rgb) if isinstance(rgb, (bytes, bytearray)) else 'gemischt'
            halves.append('%02X %s' % (index, shown))
        mark = '' if row['werk'] else '  (weicht vom Werkspaar ab)'
        lines.append('  %2d %-14s oben %s, unten %s%s' % (row['pos'], row['name'], halves[0], halves[1], mark))
    return '\n'.join(lines)


def profile_by_name(text):
    wanted = text.strip().lower().replace('ü', 'u').replace('ö', 'o').replace('ä', 'a').replace('ß', 'ss')
    wanted = wanted.replace('_', '-').replace(' ', '-')
    aliases = {
        'bronze': 1, 'bronze-weiss': 2,
        'orange': 3, 'orange-weiss': 4,
        'position-5': 5, 'weiss': 5,
        'blau': 6, 'blau-weiss': 7,
        'grun': 8, 'gruen': 8, 'grun-weiss': 9, 'gruen-weiss': 9,
        'lila': 10, 'lila-weiss': 11,
    }
    # "grün" without umlaut becomes "grun" after the replace above? 
    # ü -> u, so grün -> grun. grün-weiß -> grun-weiss.
    if wanted in aliases:
        return aliases[wanted]
    if wanted.isdigit():
        number = int(wanted)
        if 1 <= number <= 11:
            return number
    raise ValueError('Profil nicht erkannt: %s (1..11 oder zum Beispiel gruen-weiss)' % text)
