# Am Auto prüfen

Was sich nur am Auto klären lässt, bevor eine echte Lichtsteuerung freigeschaltet wird. Reihenfolge bindend:
jeder Schritt erst, wenn der vorherige erledigt ist. Bis dahin bleibt „Lichtsteuerung“ auf „Simuliert“ und
`light_profile.js` / `light_bdc.js` haben `validated: false`.

1. **Codierungs-Backup der Headunit.** Das Root-Flashen mit idrive7-8-ssh-root löscht die Codierung der
   Headunit und die Digital-Key-Kopplungen.
2. **Nur lesend über ENET** (HSFZ, Port 6801, Client: `idrive7-8-ssh-root/mgu7/hsfz.py`): am BDC
   `22 F150` (Version) und `22 360A` (LIC_LCI_COLOR_LIBRARY_DATA) lesen und ablegen.
3. **Root einrichten** mit idrive7-8-ssh-root.
4. **SOME/IP-Katalog nach Licht-Feldern mit Setter durchsuchen** (Weg A, `light_profile.js`):
   `grep -o -i -E '"[A-Za-z0-9_.]*(ambien|interior|innenlicht|lci)[A-Za-z0-9_.]*"' /etc/oap/someip/someip-interfaces.json | sort -u`
5. **BDC-Beschreibungsdatei** (Tool32 / EdiabasLib) nach `STEUERN`-Jobs für LCI / Ambiente durchsuchen
   (Weg B, `light_bdc.js`): Job, Datenkennung, Datenformat, Rückgabe der Kontrolle.
6. **Quellen für Fahrmodus und Musikpegel** im Katalog suchen (Effekte „Fahrmodus“ und „Musik“, `inputs.js`).
7. **Erst dann einen Weg einzeln testen** (stehendes Auto, Zündung an), Ergebnis festhalten, und den Weg
   im Code freischalten (`validated: true` mit echter `apply`/`release`), mit Tests wie in
   `kit/tools/test_gs_ambient.js`.

Nie veröffentlichen: das Platzhalter- oder echte `oap-sdk/`, `dist/`, `*.mgu` (enthalten BMWs SDK).
