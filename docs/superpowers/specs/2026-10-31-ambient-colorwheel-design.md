# Ambient Colorwheel: Design

Stand: 2026-10-31. Status: vom Nutzer abschnittsweise freigegeben, Spec zur Prüfung.

## Ziel

Eine iDrive-App für den BMW G22/G23 (Baujahr 2023, vor LCI, iDrive 7 / MGU ID7, Ambientebeleuchtung ab Werk), mit der die Farben der Ambientebeleuchtung **live** über ein Farbrad eingestellt werden, statt wie bisher per OBD-Codierung der BDC-Farbschemata. Installation über den [mgu-store](https://github.com/robertnisipeanu/mgu-store).

Die App wird vollständig am Mac im Emulator entwickelt. Das ENET-Kabel und Root am Auto kommen erst, wenn die App fertig ist. Deshalb trennt das Design strikt zwischen der App (fertig und testbar ohne Auto) und dem Weg, auf dem Farben ins Auto kommen (erst am Auto prüfbar).

## Rahmenbedingungen und Wissensstand

- **Kein öffentlich bekannter Live-Weg.** Die Farben stehen im BDC (BDC_BODY3, CAFD 51DD) in `360A LIC_LCI_COLOR_LIBRARY_DATA` (10 RGB-Farben je Bereich) und `360D LIC_LCI_COLOR_PROFILES_DATA` (11 Paare oben/unten, entsprechen den iDrive-Menüeinträgen). Codieren startet den BDC neu, der beim G2x auch Zentralgateway ist, und ist damit nicht live.
- **Mögliche Steuerwege** (alle am Auto unbestätigt):
  - A: Profil umschalten über SOME/IP. Live, aber nur zwischen den codierten Farben.
  - B: BDC-Stellgliedtest per UDS `2F` über TASU, wie `live_adjustments` es am DME macht. Echtes Farbrad, falls es einen solchen Job gibt.
  - C: Codierung schreiben. Nicht live, wird nicht umgesetzt.
  - D: Hardware zwischen BDC und LIN-Kette. Nicht Teil dieser App.
- **Brain-Quellen:** Entity `bmw-ambient-colorwheel`, Fakten #214 (Architektur und Wege), #215 (Fahrzeugdaten, SDK braucht Root), #216 (Emulator mit Platzhalter-SDK, ENET-Kabel erst nach der App).

## Entscheidungen aus dem Brainstorming

| Thema | Entscheidung |
|---|---|
| Zonen | zwei: oben und unten |
| Extras | Favoriten, Helligkeit, Tauschen, Effekte |
| Bedienung | Touch und iDrive-Controller |
| Speichern | so dauerhaft, wie es der Steuerweg sauber erlaubt |
| Effekte | Farbverlauf, Überblenden, Atmen, Fahrdaten (Drehzahl, Geschwindigkeit, Fahrmodus, Fahrdynamik), Musik |
| Umfang | alles in Version 1 |
| Während der Fahrt | uneingeschränkt bedienbar |
| Zielgruppe | erst privat, später öffentlich |
| Favoriten | nur Farben (oben + unten), keine Effekte |
| Ansatz | Fork von [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps), neue App im Kit |
| Hauptbildschirm | Layout C: Farbrad plus Innenraum-Vorschau |
| Effekte-Reiter | Layout B: Kacheln plus Einstellungsleiste unten |

## Architektur

### Repository

- `ambient-colorwheel` wird ein Fork von idrive7-apps (Remote `upstream`). Die bestehende Historie dieses Repos (diese Spec) wird beim Einrichten mit `--allow-unrelated-histories` zusammengeführt.
- Neue App unter `apps/gs_ambient/`. Der Ordnername ist die App-ID (`build.py`, `emu.js` und der Store nutzen ihn). Das Präfix `gs_` verhindert Namenskollisionen mit anderen Store-Apps.
- `mgu-repo.json` bleibt wie im Upstream (`apps/*`, `app.json`). Der Store baut die App auf der Headunit mit dem SDK aus dem Auto. Wir brauchen das BMW-SDK nie selbst.
- Für den Emulator liegt ein Platzhalter `oap-sdk/` (leeres `index.js`, `package.json`) im Repo-Wurzelordner. Er steht in `.gitignore`, wird nie committet und nie ins Auto gespielt.
- Upstream-Dateien (Kit, andere Apps) werden möglichst nicht verändert, damit Upstream-Updates konfliktfrei bleiben. Ausnahmen:
  - neue Testdateien `kit/tools/test_gs_ambient.js` und `kit/tools/test_target_input.js`;
  - eine kleine Kit-Erweiterung (siehe „Kit-Erweiterung: Ziehen und Drehen“), als Pull Request an Upstream anbietbar;
  - die Kit-Schriften (`kit/runtime/fonts/*.json`) neu gebacken mit `äöüÄÖÜß` (`kit/tools/bake_fonts.py`: Zeichensatz, Schriftordner per `UBUNTU_FONT_DIR`, `cacheKey`, damit der Renderer keine alten Glyphen-Texturen wiederverwendet). Die mitgelieferten Schriften enthalten nur ASCII; ohne das würden gezeichnete Umlaute als „?“ erscheinen.
- Die App läuft auf der Headunit unter Node 8: keine Syntax oder Funktionen, die Node 8 nicht kennt (`?.`, `??`, Klassenfelder, `catch` ohne Variable, `Array.prototype.flat`, `Object.fromEntries`).

### Kit-Erweiterung: Ziehen und Drehen

Wenn das Kit den Bildschirm führt (GPU-Renderer mit Touch, Vollbild), gibt es der App nur Tipps und senkrechtes Scrollen weiter, und der Controller bewegt den Fokus zwischen Bedienelementen. Für das Farbrad wird `cv.target(x, y, w, h, run, key, r, opts)` um zwei Optionen erweitert:

- `opts.drag(phase, x, y)`: Ein Finger, der auf diesem Element aufsetzt, wird bis zum Loslassen verfolgt (Phase 1 = aufsetzen, 2 = bewegen, 3 = loslassen; Koordinaten in App-Pixeln). Ein Tipp ist Phase 1 + 3. `run` wird bei Touch dann nicht aufgerufen, beim Controller-Drücken schon.
- `opts.turn(d)`: Steht der Controller-Fokus auf diesem Element, ändert Drehen dessen Wert (`d` = Rastungen, + = rechts) statt den Fokus zu bewegen. Kippen bewegt den Fokus weiter wie gewohnt.

Geändert werden nur `kit/runtime/record.js` (`target`) und `kit/runtime/display.js` (`_touch`, `_ccu`).

### Dateien der App

`build.py` kopiert nur Dateien direkt im App-Ordner als Code; Unterordner würden als Datenpaket verpackt. Deshalb ist die App flach aufgebaut, Gruppen werden über Präfixe gebildet.

| Datei | Aufgabe | Hängt ab von |
|---|---|---|
| `app.json` | ID `gs_ambient`, Titel „Ambient“, Signale, Bildschirm, Einstellungen | – |
| `main.js` | Einstieg: verdrahtet Zustand, Effekt-Schleife, Lichtsteuerung, UI | allen |
| `color.js` | Farbrad-Mathematik: Position ↔ Farbton/Sättigung ↔ RGB, Treffer-Test, Helligkeit einrechnen | – |
| `state.js` | Zustand: Farbe oben/unten, Helligkeit, aktive Zone, aktiver Effekt + Parameter, Favoriten (max. 8). Laden/Speichern als JSON in `ctx.dataDir` | `fs` |
| `fx.js` | Register der acht Effekte und die Effekt-Schleife (ca. 20 Hz, gedrosselt auf die Lichtsteuerung) | `fx_*.js` |
| `fx_cycle.js`, `fx_fade.js`, `fx_breathe.js`, `fx_rpm.js`, `fx_speed.js`, `fx_mode.js`, `fx_dynamics.js`, `fx_music.js` | je ein Effekt als reine Funktion | `color.js` |
| `inputs.js` | Fahrdaten aus dem Kit (Drehzahl, Geschwindigkeit, Längs-/Querbeschleunigung). Fahrmodus und Musikpegel: „nicht verfügbar“, mit Demo-Daten simuliert | `kit/runtime/car.js` |
| `light.js` | Auswahl der Lichtsteuerung nach Einstellung, gemeinsame Schnittstelle | `light_*.js` |
| `light_sim.js` | simulierte Lichtsteuerung, sendet nichts (Standard) | – |
| `light_profile.js` | Weg A, gesperrt | `ctx.signals` |
| `light_bdc.js` | Weg B, gesperrt | `kit/runtime/diag.js` |
| `ui.js` | Kopfzeile mit Status-Abzeichen, Reiter, Aktionen, Zeichenschleife | Kit-UI, `ui_*.js` |
| `ui_parts.js` | gemeinsame Bedienelemente: Knopf (`pill`), Schieberegler (`slider`) | Kit-UI |
| `ui_color.js`, `ui_effects.js`, `ui_favs.js` | die drei Reiter; Touch und Controller über `cv.target` mit `drag`/`turn` | `ui_parts.js`, `color.js`, `fx.js` |

### Effekt-Schnittstelle

Jeder Effekt ist eine Funktion ohne Nebenwirkungen außerhalb seines eigenen Notizobjekts `mem` (nur Fahrdynamik braucht es, für die Dauer des Aufleuchtens; es wird bei jedem Effektstart geleert):

```
effect.run(t, inputs, params, base, mem) -> { upper: RGB, lower: RGB, brightness: 0..1 }
```

- `t`: Zeit in Sekunden seit Effektstart.
- `inputs`: `{ rpm, speed, gLong, gLat, mode, music }`; nicht verfügbare Werte sind `null`.
- `params`: die Regler des Effekts.
- `base`: die Farben und die Helligkeit aus dem Reiter „Farbe“ sowie die Favoriten, alles als RGB.

Jeder Effekt meldet außerdem, welche `inputs` er braucht. Fehlt einer, gilt der Effekt als „Daten nicht verfügbar“.

### Lichtsteuerungs-Schnittstelle

Nach dem Muster von `live_adjustments/real_adapters.js` (`armed`, `_guard()`):

```
apply({ upper, lower, brightness }) -> Promise<{ ok, reason? }>
release() -> Promise                 // Kontrolle zurück an das Auto
status() -> 'simuliert' | 'aktiv' | 'fehler' | 'gesperrt'
maxRate                              // Aktualisierungen pro Sekunde, die der Weg verträgt
capabilities                         // { freeColor, brightness }
```

- **Simuliert** (`light_sim.js`): `freeColor` und `brightness` ja, `maxRate` 20. Sendet nichts. Die Innenraum-Vorschau zeigt das Ergebnis.
- **Profil umschalten** (`light_profile.js`): `freeColor` nein. Die App wählt das codierte Farbpaar, das der gewünschten Farbe am nächsten liegt.
- **BDC-Stellgliedtest** (`light_bdc.js`): `freeColor` ja. `release()` sendet die Rückgabe der Kontrolle an das Steuergerät (`2F … 00`).
- Gesperrte Wege sind in Version 1 fest im Code gesperrt (`validated: false`). `apply()` verweigert dann mit `reason: 'gesperrt'`. Freigeschaltet werden sie erst nach der Prüfung am Auto (siehe Checkliste), durch eine Code-Änderung, nicht durch eine Einstellung.
- Kann ein Weg die Helligkeit nicht getrennt annehmen (`brightness: false`), rechnet `color.js` die Helligkeit in die RGB-Werte ein.
- Kanalwerte `0xFF` werden auf `0xFE` begrenzt (bekannte BDC-Eigenheit bei `360A`).

### Datenfluss

1. Bedienung (Touch oder Controller) ändert `state`.
2. `state` speichert verzögert (500 ms nach der letzten Änderung, atomar über Temp-Datei und Umbenennen).
3. Die Effekt-Schleife berechnet bei aktivem Effekt das nächste Bild, sonst die festen Farben aus `state`.
4. Die Schleife gibt nur weiter, wenn sich der Wert geändert hat, und höchstens mit `maxRate`.
5. `light.apply()` sendet. Die Vorschau im Reiter „Farbe“ zeigt immer, was gerade gesendet wird.

### Einstellungen (`app.json`)

- **Lichtsteuerung:** „Simuliert (sicher)“ ist Standard. „Profil umschalten“ und „BDC-Stellgliedtest“ stehen mit dem Zusatz „gesperrt, noch nicht am Auto geprüft“ in der Liste. Das Kit-Einstellungsmenü kann keine Optionen ausgrauen; wählt man sie trotzdem, sendet die App nichts und zeigt „GESPERRT“.
- **Demo-Daten:** Auto / Immer / Nie, wie in den anderen Kit-Apps.
- **Bildschirm-Layout** und **Renderer:** wie in den anderen Kit-Apps.

## Bedienung

### Touch

- **Farbe:**
  - Antippen der oberen oder unteren Linie in der Innenraum-Vorschau wählt die Zone, die gewählte ist weiß umrandet.
  - Tippen oder Ziehen auf dem Farbrad setzt deren Farbe: Winkel = Farbton, Abstand zur Mitte = Sättigung (innen weißlich, außen kräftig).
  - Regler für Sättigung (der gewählten Zone) und Helligkeit; Tippen oder Ziehen auf dem Regler.
  - „Tauschen“ vertauscht oben und unten. „Gleich“ übernimmt die Farbe der gewählten Zone für die andere.
  - Ändert der Nutzer eine Farbe, während ein Effekt läuft: Effekte, die die Grundfarben nutzen (Atmen, Musik, Fahrdynamik, Geschwindigkeit im Modus Helligkeit), laufen mit den neuen Farben weiter. Alle anderen werden beendet.
- **Effekte:**
  - Ein Tipp auf eine Kachel startet den Effekt.
  - „Aus“ in der Leiste beendet ihn und stellt die festen Farben wieder ein.
  - Die Leiste zeigt nur die Regler des aktiven Effekts.
  - Kacheln ohne Daten sind ausgegraut mit „Daten nicht verfügbar“ und lassen sich nicht starten.
- **Favoriten:**
  - Raster mit 8 Plätzen. Ein Tipp wendet den Favoriten an (beendet einen laufenden Effekt).
  - „+ Aktuelle speichern“ legt die aktuellen Farben auf den ersten freien Platz. Sind alle voll, ist der Knopf deaktiviert.
  - Löschen über „Bearbeiten“ und das X auf der Kachel. Kein langes Drücken.

### iDrive-Controller

Der Controller folgt dem Fokus-Modell des Kits, wie in allen Kit-Apps: Kippen bewegt den Fokus zum nächsten Bedienelement in diese Richtung (nach oben bis zu den Reitern; links am Rand = zurück), Drücken löst das fokussierte Element aus. Drehen bewegt den Fokus weiter, außer auf Elementen mit eigenem Drehwert (`opts.turn`):

| Element | Drehen | Drücken |
|---|---|---|
| Farbrad | Farbton der gewählten Zone (5° pro Rastung) | Zone wechseln (oben ↔ unten) |
| Linie oben / unten in der Vorschau | Fokus weiter | diese Zone wählen |
| Regler Sättigung / Helligkeit | Wert (5 % pro Rastung) | – |
| Effekt-Kachel | Fokus weiter | Effekt starten |
| Regler in der Effekt-Leiste | Wert einen Schritt (ohne Umlauf) | nächster Wert (mit Umlauf) |
| Favoriten-Platz | Fokus weiter | anwenden; leerer erster Platz: aktuelle Farben speichern |
| Knöpfe | Fokus weiter | auslösen |

Die Kit-Steuerung braucht `mgu-inputgate` (wird über `mgu-repo.json` vom Store mitinstalliert). Ohne sie funktioniert Touch weiter, der Controller bleibt beim HMI. Ohne Vollbild mit GPU-Renderer (Software-Pfad oder Layout „Standard“) zeigt die App die Seiten, aber nur die HMI-Knöpfe „Nächste Seite“ und „Einstellungen“ sind bedienbar; ein Hinweis unten auf der Seite sagt das.

### Status und Fehlerverhalten

- **Abzeichen in der Kopfzeile:** „SIMULIERT“, „AKTIV“, „GESPERRT“ oder „FEHLER“, bei Fehler mit kurzer Ursache (zum Beispiel „BDC lehnt ab“).
- **Ablehnung durch das Auto:** erneut senden nach wachsender Pause (0,5 s, dann 1 s, dann 2 s). Der 4. Fehlschlag in Folge stoppt das Senden: „FEHLER“, Effekt pausiert. Erneuter Versuch erst nach einer Bedienung durch den Nutzer.
- **Gesperrter Weg gewählt:** es wird gar nichts gesendet (auch kein Versuch), Abzeichen „GESPERRT“.
- **Beim Start:** letzten Zustand laden. Läuft eine echte Lichtsteuerung, Farben und Effekt sofort wieder anwenden. Kaputte oder fehlende Speicherdatei: Standardwerte, Warnung im Log, kein Absturz.
- **Beim Beenden:** `light.release()`, falls der Weg es braucht.

## Effekte

Alle Effekte beziehen sich auf die Farben aus dem Reiter „Farbe“, außer wo eigene Farben genannt sind.

| Effekt | Verhalten | Regler (Standard) |
|---|---|---|
| Farbverlauf | wandert mit voller Sättigung durch das ganze Farbrad | Umlaufzeit 10 s – 5 min (60 s); oben/unten gleich oder versetzt (versetzt = 180°) |
| Überblenden | weicher Wechsel zwischen den ersten 2 oder 3 Favoriten (Reihenfolge im Favoriten-Reiter) | Anzahl 2/3 (2), Haltezeit 1–30 s (5 s), Übergang 1–10 s (2 s) |
| Atmen | Helligkeit pulsiert sinusförmig, Farben bleiben | Periode 2–10 s (4 s), Tiefe 10–80 % (50 %) |
| Drehzahl | Blau → Grün → Rot von Leerlauf (800/min) bis Schaltpunkt | Schaltpunkt 3000–7000/min (6500), Blinken am Schaltpunkt (an), Bereich beide/nur oben (beide) |
| Geschwindigkeit | Farbe Blau → Rot oder Helligkeit 20–100 % über das Tempo | Skalenende 50–250 km/h (200), Modus Farbe/Helligkeit (Farbe) |
| Fahrmodus | eigene Farbe je Fahrmodus | je Modus ein Favorit: Eco Pro, Comfort, Sport |
| Fahrdynamik | kurzes Aufleuchten (300 ms) in der Blitzfarbe, wenn die Beschleunigung die Schwelle übersteigt; Stärke nach Betrag, nicht nach Richtung | Schwelle 0,3–0,8 g (0,5 g), Blitzfarbe (Rot) |
| Musik | Helligkeit folgt dem Pegel | Empfindlichkeit 1–10 (5) |

- Überblenden braucht mindestens 2 Favoriten, sonst ist die Kachel ausgegraut mit „Mindestens 2 Favoriten nötig“.
- Fahrmodus ohne zugeordneten Favoriten („Standard“) nutzt: Eco Pro = Blau, Comfort = Grundfarben, Sport = Rot.
- Wird ein Favorit gelöscht, setzt die App Effekt-Regler, die auf diesen oder einen späteren Favoriten zeigen, auf „Standard“ zurück (Regler-Schlüssel, die mit `fav` beginnen).
- Fahrdynamik zeigt nur die Stärke, weil es nur die Zonen oben und unten gibt, keine Seiten.
- Fahrmodus und Musik haben vorerst keine Datenquelle im Auto. Ihre Kacheln sind am Auto ausgegraut, bis eine Quelle gefunden ist. Mit Demo-Daten (Emulator) laufen sie mit simulierten Werten.

## Tests ohne Auto

1. **Automatische Tests** in `kit/tools/test_gs_ambient.js`, im Stil der Kit-Tests (reines Node, `assert`, keine Pakete):
   - `color.js`: Position ↔ RGB hin und zurück, Treffer am Rand, in der Mitte, außerhalb; Helligkeit einrechnen; Begrenzung auf `0xFE`.
   - `state.js`: Speichern/Laden, Tauschen, Gleich, Favoriten-Grenze 8, kaputte und fehlende Datei.
   - Jeder Effekt: feste Zeit und feste Fahrdaten ergeben die erwarteten Farben (zum Beispiel Drehzahl am Schaltpunkt = Rot); fehlende Daten werden als „nicht verfügbar“ gemeldet.
   - Lichtsteuerung: Simuliert sendet nichts; gesperrte Wege verweigern; Drosselung auf `maxRate`; Wiederholen mit wachsender Pause und Stopp nach 4 Fehlschlägen, mit künstlicher Uhr.
   - Seiten: jede Seite auf einem Recorder zeichnen und prüfen, dass die erwarteten Bedienelemente (mit `drag`/`turn`) da sind.
   - Kit-Erweiterung in `kit/tools/test_target_input.js`: Ziehen und Drehen werden an das Element geleitet, normale Elemente verhalten sich wie vorher.
2. **Emulator:** `node kit/tools/emu.js gs_ambient`. Maus = Touch, Mausrad = Drehen, Pfeiltasten = Kippen. Fahrdaten aus der Demo-Fahrt oder manuell über die Regler des Emulators.
3. **Bildschirmfotos** der drei Reiter aus dem Emulator (Vollbild-Modus) als Vergleich bei späteren Änderungen, abgelegt unter `docs/screens/`.
4. **Store-Probe:** `python3 kit/tools/build.py gs_ambient` erzeugt das Paket, und die App wird über `mgu-repo.json` gefunden.

## Checkliste „Am Auto prüfen“

Kommt als `docs/am-auto-pruefen.md` ins Repo. Reihenfolge bindend, jeder Schritt erst nach dem vorherigen:

1. Codierungs-Backup der Headunit (das Root-Flashen löscht Codierung und Digital-Key-Kopplungen).
2. Nur lesend über ENET (HSFZ, Port 6801): `22 F150` und `22 360A` am BDC.
3. Root über idrive7-8-ssh-root einrichten.
4. Im SOME/IP-Katalog nach Licht-Feldern mit Setter suchen:
   `grep -o -i -E '"[A-Za-z0-9_.]*(ambien|interior|innenlicht|lci)[A-Za-z0-9_.]*"' /etc/oap/someip/someip-interfaces.json | sort -u`
5. In der BDC-Beschreibungsdatei (Tool32/EdiabasLib) nach `STEUERN`-Jobs für LCI/Ambiente suchen.
6. Quellen für Fahrmodus und Musikpegel suchen.
7. Erst dann einen Weg einzeln testen und im Code freischalten.

## Nicht Teil von Version 1

- Codierung schreiben (Weg C) und Hardware (Weg D).
- Effekte als Favoriten.
- Mehr als zwei Zonen oder links/rechts getrennt.
- Veröffentlichung im Store (erst nach Prüfung am Auto).

## Sicherheit

- Standard ist immer „Simuliert“. Echte Wege sind im Code gesperrt, bis sie am Auto geprüft sind.
- Kein Befehlsschwall: Drosselung auf `maxRate`, Stopp nach wiederholten Fehlern.
- Das Platzhalter-SDK und `.mgu`-Dateien (enthalten das BMW-SDK) werden nie committet oder veröffentlicht.
