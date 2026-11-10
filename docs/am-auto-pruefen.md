# Am Auto prüfen

Was sich nur am Auto klären lässt. „Lichtsteuerung“ steht ab Werk auf „Simuliert“. „BDC-Licht“ ist der
bestätigte Kurzzeit-Weg (`2E DA5E` / `2E E3D1`) und schreibt erst, wenn der BDC sich als `0F2680` meldet.
`light_profile.js` bleibt `validated: false`.

1. **Codierungs-Backup der Headunit.** Das Root-Flashen mit idrive7-8-ssh-root löscht die Codierung der
   Headunit und die Digital-Key-Kopplungen.
2. **Nur lesend über ENET** (HSFZ, Port 6801, Client: `idrive7-8-ssh-root/mgu7/hsfz.py`): am BDC
   `22 F150` (Version) und `22 360A` (LIC_LCI_COLOR_LIBRARY_DATA) lesen und ablegen.
3. **Root einrichten** mit idrive7-8-ssh-root.
4. **SOME/IP-Katalog nach Licht-Feldern mit Setter durchsuchen** (Weg A, `light_profile.js`):
   `grep -o -i -E '"[A-Za-z0-9_.]*(ambien|interior|innenlicht|lci)[A-Za-z0-9_.]*"' /etc/oap/someip/someip-interfaces.json | sort -u`
5. **Am stehenden Auto, Ambiente an:** in der App „BDC-Licht“ wählen. Schreibt nur, wenn `22 F150`
   `0F2680` liefert und Lichtmodule gemeldet werden. Der Comfort-Dienst erneuert die Farbe alle 2 Minuten,
   auch nachdem die Oberfläche zu ist. Geparkt oder Standby gibt sie zurück. Der G22 ist noch nie gelesen worden.
6. **Profil umschalten** (`light_profile.js`) bleibt gesperrt, bis ein Setter im Katalog gefunden und
   einzeln geprüft ist.

Nie veröffentlichen: das Platzhalter- oder echte `oap-sdk/`, `dist/`, `*.mgu` (enthalten BMWs SDK).
