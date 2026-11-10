#!/usr/bin/env python3
"""Parser and planner checks against the published stock color map. No car, no network."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import farben
import hsfz

# Y. Reiser, April 2021, through the end of the six stock colors, then padding.
STOCK_A = bytes.fromhex(
    '0017'
    '0190E090FF0290E090000390E090FF'
    '01D76E14FF02D76E140003D76E14FF'
    '01931A01FF02931A010003931A01FF'
    '010020FEFF020020FE00030020FEFF'
    '0110FE32FF0210FE32000310FE32FF'
    '01783CFEFF02783CFE0003783CFEFF'
)
STOCK_A = STOCK_A + bytes([0xFF]) * (152 - len(STOCK_A))
STOCK_D = bytes.fromhex('01010100020202000000030303000404040005050500')


def expect(cond, text):
    if not cond:
        raise SystemExit(text)


def stock_with_spare():
    block = bytearray(STOCK_A)
    for number, starts in ((8, farben.DREIER[8]), (9, farben.DREIER[9])):
        tags = (0x01, 0x02, 0x03)
        for index, start in enumerate(starts):
            block[start - 1] = tags[index]
            block[start:start + 3] = b'\x11\x22\x33'
    return bytes(block)


def main():
    frame = hsfz.encode(0xF4, 0x40, [0x22, 0x36, 0x0A])
    got = hsfz.decode(frame)
    expect(got['src'] == 0xF4 and got['dst'] == 0x40 and got['uds'] == bytes([0x22, 0x36, 0x0A]), 'Rahmen')
    expect(hsfz.describe_nrc(bytes([0x7F, 0x2E, 0x33])).startswith('Dienst'), 'NRC')

    lib = farben.library(STOCK_A)
    green = next(item for item in lib if item['nr'] == 4)
    expect(all(rgb == bytes.fromhex('10FE32') for _n, rgb in green['zonen']), 'Grün')
    bronze = next(item for item in lib if item['nr'] == 1)
    expect(bronze['zonen'][0][1] == bytes.fromhex('D76E14'), 'Bronze')
    rows = farben.profiles(STOCK_D)
    expect(rows[8]['name'] == 'Grün-Weiß' and rows[8]['paar'] == (4, 0) and rows[8]['werk'], 'Profil 9')
    expect(farben.profile_by_name('Grün-Weiß') == 9, 'Name')
    expect(farben.profile_by_name('9') == 9, 'Nummer')

    rgb, clamped = farben.parse_rgb('FF0000')
    expect(rgb == bytes.fromhex('FE0000') and clamped, 'FE statt FF')

    blocked = farben.plan(STOCK_A, STOCK_D, 9, bytes.fromhex('FE0000'), bytes.fromhex('2010FE'))
    expect(not blocked['ok'], 'ohne freie Nummer kein Schreiben: %s' % blocked.get('grund'))

    spare = stock_with_spare()
    planned = farben.plan(spare, STOCK_D, 9, bytes.fromhex('FE0000'), bytes.fromhex('2010FE'))
    expect(planned['ok'] and planned['kollateral'] == [], 'frei ohne Kollateralschaden: %s' % planned)
    expect(planned['nachher'][0] != 4 and planned['nachher'][1] != 0, 'zeigt nicht mehr auf Grün und Weiß')
    expect('360A' in planned['dids'] and '360D' in planned['dids'], 'beide Blöcke')
    again = farben.library(planned['bibliothek'])
    upper = next(item for item in again if item['nr'] == planned['nachher'][0])
    expect(all(rgb == bytes.fromhex('FE0000') for _n, rgb in upper['zonen'] if rgb), 'neue Farbe oben')

    shared = farben.plan(STOCK_A, STOCK_D, 9, bytes.fromhex('FE0000'), bytes.fromhex('2010FE'), share=True)
    expect(shared['ok'] and 'Grün' in shared['kollateral'] and 'Bronze-Weiß' in shared['kollateral'],
           'geteilte Nummer nennt die anderen Profile: %s' % shared)

    same = farben.plan(STOCK_A, STOCK_D, 1, bytes.fromhex('FE0000'), bytes.fromhex('2010FE'), share=True)
    expect(not same['ok'], 'Bronze kann eine Nummer nicht in zwei Farben teilen')

    print('ok')


if __name__ == '__main__':
    main()
