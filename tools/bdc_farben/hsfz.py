# HSFZ over ENET (TCP 6801, UDP 6811). Read path for the BDC color blocks.
# Frame layout: https://github.com/rawmind0/rawenet/blob/master/docs/hsfz-protocol.md
# LENGTH counts source, destination and the UDS payload. TYPE 0x0001 is a diagnosis
# frame, 0x0002 is the gateway's acknowledge and is ignored.

import socket
import struct
import subprocess
import time

TESTER = 0xF4
DIAG_PORT = 6801
IDENT_PORT = 6811
IDENT_REQUEST = bytes.fromhex('000000000011')
TYPE_DIAG = 0x0001
TYPE_ACK = 0x0002
TYPE_IDENT = 0x0011

NRC = {
    0x10: 'allgemeine Ablehnung',
    0x11: 'Dienst nicht unterstützt',
    0x12: 'Unterfunktion nicht unterstützt',
    0x13: 'falsche Länge',
    0x22: 'Bedingungen nicht erfüllt',
    0x31: 'außerhalb des Bereichs',
    0x33: 'Freischaltung verweigert',
    0x72: 'Schreibfehler',
    0x78: 'Antwort folgt',
    0x7E: 'in dieser Sitzung nicht unterstützt',
    0x7F: 'in dieser Sitzung nicht unterstützt',
}


class LinkError(Exception):
    pass


def encode(src, dst, uds, type_=TYPE_DIAG):
    payload = bytes(uds)
    length = 2 + len(payload)
    return struct.pack('>IHBB', length, type_, src & 0xFF, dst & 0xFF) + payload


def decode(frame):
    if len(frame) < 8:
        raise LinkError('Rahmen zu kurz (%d Bytes)' % len(frame))
    length, type_, src, dst = struct.unpack('>IHBB', frame[:8])
    payload = frame[8:]
    if length != 2 + len(payload):
        raise LinkError('Längenfeld %d passt nicht zur Nutzlast %d' % (length, len(payload)))
    return {'type': type_, 'src': src, 'dst': dst, 'uds': payload}


def _recv_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise LinkError('Verbindung vom Auto geschlossen')
        buf += chunk
    return buf


def read_frame(sock):
    length_b = _recv_exact(sock, 4)
    length = struct.unpack('>I', length_b)[0]
    if length > 4096:
        raise LinkError('Rahmen zu groß (%d)' % length)
    rest = _recv_exact(sock, 2 + length)
    return decode(length_b + rest)


def link_local_interfaces():
    """Physical en* adapters that already have a 169.254 address. awdl0 is not one of them."""
    try:
        text = subprocess.check_output(['ifconfig'], text=True, errors='replace')
    except (OSError, subprocess.CalledProcessError) as exc:
        raise LinkError('ifconfig fehlgeschlagen: %s' % exc)
    found = []
    name, active, addrs = None, False, []
    def flush():
        if name and name.startswith('en') and active:
            for addr in addrs:
                found.append((name, addr))
    for line in text.splitlines():
        if line and not line[0].isspace():
            flush()
            name = line.split(':', 1)[0]
            active = False
            addrs = []
            continue
        stripped = line.strip()
        if stripped.startswith('status:') and 'active' in stripped:
            active = True
        if stripped.startswith('inet '):
            ip = stripped.split()[1]
            if ip.startswith('169.254.'):
                addrs.append(ip)
    flush()
    return found


def discover(local_ip, timeout=2.0):
    """UDP vehicle identification. Returns (gateway_ip, vin or '')."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(timeout)
        sock.bind((local_ip, 0))
        sock.sendto(IDENT_REQUEST, ('169.254.255.255', IDENT_PORT))
        data, addr = sock.recvfrom(512)
    except socket.timeout:
        return None
    finally:
        sock.close()
    vin = ''
    mark = data.find(b'BMWVIN')
    if mark >= 0 and mark + 6 + 17 <= len(data):
        raw = data[mark + 6:mark + 6 + 17]
        if raw.isalnum():
            vin = raw.decode('ascii')
    return addr[0], vin


def probe_doip(local_ip, timeout=0.8):
    """One vehicle-identification packet. Returns a short note, never a diagnosis."""
    packet = bytes.fromhex('02fd000100000000')
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(timeout)
        sock.bind((local_ip, 0))
        sock.sendto(packet, ('169.254.255.255', 13400))
        data, addr = sock.recvfrom(256)
    except (socket.timeout, OSError):
        return None
    finally:
        sock.close()
    return 'DoIP antwortet von %s (%d Bytes). Dieser Lauf spricht HSFZ.' % (addr[0], len(data))


class Client(object):
    def __init__(self, host, timeout=2.5):
        self.host = host
        self.timeout = timeout
        self.sock = None

    def connect(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        sock.settimeout(self.timeout)
        try:
            sock.connect((self.host, DIAG_PORT))
        except OSError as exc:
            sock.close()
            raise LinkError('TCP %s:%d nicht erreichbar (%s)' % (self.host, DIAG_PORT, exc))
        self.sock = sock
        return self

    def close(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def request(self, target, uds, timeout=None):
        if self.sock is None:
            raise LinkError('keine Verbindung')
        wait = self.timeout if timeout is None else timeout
        self.sock.sendall(encode(TESTER, target, uds))
        deadline = time.monotonic() + wait
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise LinkError('keine Antwort von Steuergerät 0x%02X' % target)
            self.sock.settimeout(remaining)
            try:
                frame = read_frame(self.sock)
            except socket.timeout:
                raise LinkError('keine Antwort von Steuergerät 0x%02X' % target)
            if frame['type'] == TYPE_ACK:
                continue
            if frame['type'] >= 0x0040:
                raise LinkError('Gateway lehnt ab (Typ 0x%04X)' % frame['type'])
            if frame['type'] != TYPE_DIAG or frame['dst'] != TESTER:
                continue
            data = frame['uds']
            if len(data) >= 3 and data[0] == 0x7F and data[2] == 0x78:
                deadline = time.monotonic() + max(wait, 5.0)
                continue
            return data


def describe_nrc(data):
    if not data or data[0] != 0x7F or len(data) < 3:
        return None
    name = NRC.get(data[2], 'Code 0x%02X' % data[2])
    return 'Dienst 0x%02X abgelehnt: %s' % (data[1], name)


def find_gateway(wait_s, log):
    """Wait until an en* interface has a link-local address, then identify the car."""
    deadline = time.monotonic() + wait_s
    last = None
    announced = set()
    while True:
        ifaces = link_local_interfaces()
        if not ifaces:
            last = LinkError(
                'Keine 169.254-Adresse an einem Ethernet-Anschluss. '
                'Kabel am Mac und Zündung an? WLAN zählt nicht.')
        else:
            for name, ip in ifaces:
                if ip not in announced:
                    log('Schnittstelle %s %s' % (name, ip))
                    announced.add(ip)
                found = discover(ip)
                note = probe_doip(ip)
                if note and note not in announced:
                    log(note)
                    announced.add(note)
                if found:
                    host, vin = found
                    log('Gateway %s%s' % (host, (', VIN ' + vin) if vin else ''))
                    return host, vin, ip
            # The identification broadcast is not always answered. The two addresses
            # this car's ENET path uses are still worth one TCP attempt each.
            for host in ('169.254.1.1', '169.254.254.36'):
                try:
                    client = Client(host, timeout=1.5).connect()
                    client.close()
                    log('Gateway %s antwortet ohne Kennung' % host)
                    return host, '', ifaces[0][1]
                except LinkError as exc:
                    last = exc
        if time.monotonic() >= deadline:
            if last:
                raise last
            raise LinkError('das Auto antwortet auf Port 6801 nicht')
        time.sleep(1.0)
