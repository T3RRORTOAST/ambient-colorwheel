#!/usr/bin/env python3
"""Read the BDC ambient-color blocks over the ENET cable. Writes nothing.

    python3 tools/bdc_farben/lesen.py

Zündung an, Wagen steht, Kabel vom OBD-Stecker an den Mac. Das Programm wartet
auf die 169.254-Adresse, liest 360A und 360D und legt die Bytes unter
tools/bdc_farben/sicherungen/ ab.
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import farben
import hsfz

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(HERE, 'sicherungen')
BDC = 0x40
GATEWAY = 0x10
SESSION_NRC = (0x22, 0x7E, 0x7F)


def log(text):
    print(text, flush=True)


def read_did(client, target, did):
    data = client.request(target, [0x22, (did >> 8) & 0xFF, did & 0xFF])
    if len(data) >= 3 and data[0] == 0x62 and data[1] == ((did >> 8) & 0xFF) and data[2] == (did & 0xFF):
        return data[3:], None, None
    nrc = data[2] if len(data) >= 3 and data[0] == 0x7F else None
    return None, hsfz.describe_nrc(data) or ('unerwartete Antwort ' + data.hex()), nrc


def extended_session(client, target):
    data = client.request(target, [0x10, 0x03])
    if len(data) >= 2 and data[0] == 0x50 and data[1] == 0x03:
        return None
    return hsfz.describe_nrc(data) or ('Sitzung abgelehnt: ' + data.hex())


def read_blocks(client, target):
    """Read the color blocks. One extended session only if the first read asks for it."""
    out, errors, nrcs = {}, {}, {}

    def take(did, name):
        try:
            payload, why, nrc = read_did(client, target, did)
        except hsfz.LinkError as exc:
            payload, why, nrc = None, str(exc), None
        if payload is None:
            errors[name] = why or 'keine Antwort'
            if nrc is not None:
                nrcs[name] = nrc
        else:
            out[name] = payload
            errors.pop(name, None)

    for did, name in ((0x360A, '360A'), (0x360D, '360D'), (0xF150, 'F150'), (0xF190, 'F190')):
        take(did, name)
    if '360A' in out and '360D' in out:
        return out, errors, False
    if not any(nrcs.get(name) in SESSION_NRC for name in ('360A', '360D')):
        return out, errors, False
    log('erste Lesung will eine erweiterte Sitzung, die bleibt nur lesend')
    why = extended_session(client, target)
    if why:
        errors['sitzung'] = why
        return out, errors, False
    for did, name in ((0x360A, '360A'), (0x360D, '360D')):
        take(did, name)
    return out, errors, True


def save(record):
    os.makedirs(STORE, exist_ok=True)
    vin = record.get('vin') or 'unbekannt'
    stamp = record['gelesen'].replace(':', '').replace('-', '')
    path = os.path.join(STORE, '%s-%s.json' % (vin, stamp))
    with open(path, 'w') as handle:
        json.dump(record, handle, indent=2, sort_keys=True)
        handle.write('\n')
    return path


def connect(wait_s):
    host, vin, local_ip = hsfz.find_gateway(wait_s, log)
    client = hsfz.Client(host).connect()
    log('verbunden mit %s über %s' % (host, local_ip))
    return client, host, vin


def gather(client, vin_hint):
    record = {
        'gelesen': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'gateway': client.host,
        'vin': vin_hint,
        'ecu': None,
        'sitzung': 'standard',
        'bloecke': {},
        'fehler': {},
    }
    for target in (BDC, GATEWAY):
        log('lese Steuergerät 0x%02X' % target)
        blocks, errors, extended = read_blocks(client, target)
        if '360A' in blocks and '360D' in blocks:
            record['ecu'] = target
            record['sitzung'] = 'erweitert' if extended else 'standard'
            record['bloecke'] = {name: blocks[name].hex() for name in blocks}
            record['fehler'] = errors
            if 'F190' in blocks and len(blocks['F190']) >= 17:
                text = blocks['F190'][:17]
                if text.isalnum():
                    record['vin'] = text.decode('ascii')
            return record
        record['fehler']['0x%02X' % target] = errors
    return record


def main(argv):
    parser = argparse.ArgumentParser(description='BDC-Farbprofile nur lesen')
    parser.add_argument('--warte', type=float, default=45, help='Sekunden auf das Kabel warten')
    args = parser.parse_args(argv)
    try:
        client, _host, vin = connect(args.warte)
    except hsfz.LinkError as exc:
        log(str(exc))
        return 2
    try:
        record = gather(client, vin)
    finally:
        client.close()
    if record['ecu'] is None:
        log('360A/360D nicht gelesen.')
        log(json.dumps(record['fehler'], ensure_ascii=False, indent=2))
        path = save(record)
        log('Antworten liegen in %s' % path)
        log('Nichts geschrieben.')
        return 3
    lib = bytes.fromhex(record['bloecke']['360A'])
    profiles = bytes.fromhex(record['bloecke']['360D'])
    log('Steuergerät 0x%02X, Sitzung %s, VIN %s' % (record['ecu'], record['sitzung'], record['vin'] or 'unbekannt'))
    log(farben.report(lib, profiles))
    if record['fehler']:
        log('Nebenbei nicht gelesen: ' + ', '.join('%s (%s)' % item for item in sorted(record['fehler'].items())))
    path = save(record)
    log('Sicherung %s' % path)
    log('Nichts geschrieben.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
