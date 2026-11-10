#!/usr/bin/env python3
"""Plan, and only on request send, one ambient-profile change.

Dry run, nothing is sent except the same read as lesen.py:

    python3 tools/bdc_farben/schreiben.py --profil gruen-weiss --oben FE0000 --unten 2010FE

The write needs both flags, and it still does not restart the BDC:

    python3 tools/bdc_farben/schreiben.py --profil 9 --oben FE0000 --unten 2010FE --anwenden --ja profil-9

--neustart is a separate step after a write that the read-back confirmed. It
drops the central gateway for a few seconds. Do not use it while driving.
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import farben
import hsfz
import lesen


def log(text):
    print(text, flush=True)


def write_did(client, target, did, payload):
    request = bytes([0x2E, (did >> 8) & 0xFF, did & 0xFF]) + payload
    data = client.request(target, request, timeout=8)
    if len(data) >= 3 and data[0] == 0x6E and data[1] == request[1] and data[2] == request[2]:
        return None
    return hsfz.describe_nrc(data) or ('unerwartete Antwort ' + data.hex())


def main(argv):
    parser = argparse.ArgumentParser(description='Ein Farbprofil im BDC ändern')
    parser.add_argument('--profil', required=True, help='1..11 oder Name, zum Beispiel gruen-weiss')
    parser.add_argument('--oben', required=True, help='RRGGBB der oberen Zone')
    parser.add_argument('--unten', required=True, help='RRGGBB der unteren Zone')
    parser.add_argument('--warte', type=float, default=45)
    parser.add_argument('--teile-farbe', action='store_true',
                        help='belegte Farbnummer überschreiben, wenn keine freie da ist')
    parser.add_argument('--anwenden', action='store_true', help='wirklich schreiben')
    parser.add_argument('--ja', default='', help='zur Bestätigung profil-<Nummer>, zum Beispiel profil-9')
    parser.add_argument('--neustart', action='store_true', help='danach den BDC neu starten')
    args = parser.parse_args(argv)
    try:
        position = farben.profile_by_name(args.profil)
        upper, _clamped = farben.parse_rgb(args.oben)
        lower, _clamped = farben.parse_rgb(args.unten)
    except ValueError as exc:
        log(str(exc))
        return 2
    try:
        client, _host, vin = lesen.connect(args.warte)
    except hsfz.LinkError as exc:
        log(str(exc))
        return 2
    try:
        record = lesen.gather(client, vin)
        if record['ecu'] is None:
            path = lesen.save(record)
            log('Farbblöcke nicht gelesen. Sicherung der Antworten: %s' % path)
            return 3
        path = lesen.save(record)
        log('Sicherung vor jedem weiteren Schritt: %s' % path)
        lib = bytes.fromhex(record['bloecke']['360A'])
        profiles = bytes.fromhex(record['bloecke']['360D'])
        log(farben.report(lib, profiles))
        planned = farben.plan(lib, profiles, position, upper, lower, share=args.teile_farbe)
        if not planned['ok']:
            log(planned['grund'])
            return 4
        log('Profil %d %s: %02X/%02X wird %02X/%02X' % (
            planned['pos'], planned['name'], planned['vorher'][0], planned['vorher'][1],
            planned['nachher'][0], planned['nachher'][1]))
        for note in planned['hinweise']:
            log(note)
        if planned['kollateral']:
            log('Mit geändert, weil sie dieselbe Farbnummer nutzen: ' + ', '.join(planned['kollateral']))
        if not planned['dids']:
            log('Nichts zu schreiben.')
            return 0
        log('Blöcke: ' + ', '.join(planned['dids']))
        if not args.anwenden:
            log('Probelauf. Nichts geschrieben. Zum Senden --anwenden --ja profil-%d' % planned['pos'])
            return 0
        confirm = 'profil-%d' % planned['pos']
        if args.ja != confirm:
            log('Nicht geschrieben. Bestätigung fehlt, erwartet --ja %s' % confirm)
            return 4
        why = lesen.extended_session(client, record['ecu'])
        if why:
            log('Sitzung nicht geöffnet: %s' % why)
            log('Nichts geschrieben. Sicherung %s' % path)
            return 4
        for name, did, payload in (
            ('360A', 0x360A, planned['bibliothek']),
            ('360D', 0x360D, planned['profile']),
        ):
            if name not in planned['dids']:
                continue
            why = write_did(client, record['ecu'], did, payload)
            if why:
                log('%s nicht geschrieben: %s' % (name, why))
                log('Abbruch. Sicherung %s' % path)
                return 4
            log('%s angenommen' % name)
        checked, errors, _extended = lesen.read_blocks(client, record['ecu'])
        for name in planned['dids']:
            expected = planned['bibliothek'] if name == '360A' else planned['profile']
            if checked.get(name) != expected:
                log('%s liest sich nicht wie gesendet zurück (%s)' % (name, errors.get(name, 'anderer Inhalt')))
                log('Kein Neustart. Sicherung %s' % path)
                return 4
        log('Rücklesen stimmt.')
        if not args.neustart:
            log('BDC nicht neu gestartet. Die Farbe gilt nach einem Neustart des BDC, '
                'den dieses Programm nur mit --neustart auslöst.')
            return 0
        log('Starte den BDC neu. Das Gateway fällt für ein paar Sekunden aus.')
        data = client.request(record['ecu'], [0x11, 0x01], timeout=5)
        if data and data[0] == 0x51:
            log('Neustart angenommen.')
            return 0
        log(hsfz.describe_nrc(data) or ('Neustart nicht bestätigt: ' + (data.hex() if data else 'keine Antwort')))
        return 4
    except hsfz.LinkError as exc:
        log(str(exc))
        return 3
    finally:
        client.close()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
