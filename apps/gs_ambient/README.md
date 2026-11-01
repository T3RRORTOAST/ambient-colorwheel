# Ambient

Farbrad für die Ambientebeleuchtung (BMW G2x, iDrive 7): zwei Zonen (oben, unten), Helligkeit, acht Effekte
(Farbverlauf, Überblenden, Atmen, Drehzahl, Geschwindigkeit, Fahrmodus, Fahrdynamik, Musik) und bis zu
8 Favoriten.

**Version 1 sendet nichts ans Auto.** Die Lichtsteuerung ist „Simuliert“; die Wege „Profil umschalten“ und
„BDC-Stellgliedtest“ sind gesperrt, bis sie am Auto geprüft sind (`docs/am-auto-pruefen.md`).

- Bedienung: Touch (Tippen, Ziehen auf Rad und Reglern) und iDrive-Controller (Kippen = Fokus, Drehen auf Rad
  und Reglern = Wert, Drücken = auslösen). Volle Bedienung nur im Vollbild mit GPU-Renderer.
- Emulator: `node kit/tools/emu.js gs_ambient` → http://localhost:8077
- Tests: `node kit/tools/test_gs_ambient.js`
- Design: `docs/superpowers/specs/2026-10-31-ambient-colorwheel-design.md`
