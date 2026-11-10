# Ambient

Farbrad für die Ambientebeleuchtung (BMW G2x, iDrive 7): zwei Zonen (oben, unten), Helligkeit, drei Effekte
(Farbverlauf, Überblenden, Atmen) und bis zu 8 Favoriten.

**Standard sendet nichts.** „BDC-Licht“ schreibt die freie Farbe an den BDC, derselbe Kurzzeit-Weg wie
bei IterioDevs Comfort-Dienst: Halt 254 Sekunden, Erneuerung alle 2 Minuten. Der Dienst läuft weiter,
wenn die Oberfläche zu ist. Geparkt, Standby oder ausgeschaltete Werk-Ambiente gibt die Farbe sofort
zurück. Der BDC muss sich als `0F2680` melden, sonst wird nichts geschrieben. „Profil umschalten“ bleibt
gesperrt. Das Debug-Protokoll steht in den Einstellungen auf Aus. An schreibt auf der Headunit
`/var/opt/public/oap/oap_<uid>/data/gs_ambient_probe.json` (und `gs_ambient_debug.log`): die
Namen aus dem SOME/IP-Katalog, die rohe Antwort von `22 F150`, `360A`, `360D` und `F190`, die
gefundenen Lichtmodule und ob Fahrzeugzustand und Werk-Ambiente ankamen.

- Bedienung: Touch (Tippen, Ziehen auf Rad und Reglern) und iDrive-Controller (Kippen = Fokus, Drehen auf Rad
  und Reglern = Wert, Drücken = auslösen). Volle Bedienung nur im Vollbild mit GPU-Renderer.
- Emulator: `node kit/tools/emu.js gs_ambient` → http://localhost:8077
- Tests: `node kit/tools/test_gs_ambient.js`
- MGU App Store: Quelle `github-name/ambient-colorwheel`, Kanal Branch `main`. Der Store liest `mgu-repo.json` im Repo-Wurzelverzeichnis und bietet jede App unter `apps/` an, deren Ordner eine `app.json` hat. Ambient ist `gs_ambient`, Version aus `app.json` (`0.1.0`). Gebaut wird auf der Headunit mit `kit/tools/build.py`; das SDK legt der Store aus der Unit in `oap-sdk`. Mit der App kommen der GPU-Renderer (`idrive7-renderd` 2.1.6) und das Controller-Gate (`mgu-inputgate` 1.0.0).
- Design: `docs/superpowers/specs/2026-10-31-ambient-colorwheel-design.md`
