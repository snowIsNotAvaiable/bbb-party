# BBB · Buki's Birthday Bash

Eine Party-WebApp für einen einzigen Abend, gebaut für zwölf Leute in einer
Wohnung ohne Internet.

Gäste scannen einen QR-Code, tragen ihren Namen ein, bauen sich ein
Pixel-Memoji und spielen dann durchgehend parallel: **Karte ziehen, Risikostufe
blind wählen, Aufgabe erfüllen, von einem zufällig zugewiesenen Beobachter
abnehmen lassen.** Es gibt keine Züge, keine Reihenfolge und kein Warten.

Das Ganze ist ein einziger Node-Prozess. Kein Internet, keine Cloud, keine
Konten, kein Build-Server. `npm run party`, QR-Code aufhängen, fertig.

---

## Schnellstart

```bash
npm install
npm run assets     # Inter einmalig lokal ablegen, braucht Internet
npm run party      # baut den Client und startet den Server
```

Der Start druckt alle erreichbaren Adressen, die Host-PIN und einen QR-Code ins
Terminal und legt `qr-party.png` zum Ausdrucken ab.

| Wer | Adresse |
|---|---|
| Gäste | `http://<LAN-IP>:3000` |
| Host | `http://<LAN-IP>:3000/admin` |

`localhost` funktioniert nur auf dem Rechner selbst; die Handys brauchen die
IP-Adresse aus der Startausgabe. Der Server lauscht auf `0.0.0.0`.

Zum Ausprobieren ohne Party reicht `npm run probelauf`: zweiter Server auf Port
3001 mit einer eigenen Kopie der Karten.

---

## Warum es so gebaut ist

Die Umgebung gibt fast alles vor, und daraus folgen vier Entscheidungen, die
den ganzen Code prägen:

**Kein Internet am Ort.** Keine CDNs, keine externen Schriften, kein einziges
Bild im Repository. Avatare, Katzen, Icons, der Planet auf dem Startscreen:
alles entsteht im Code als Pixelgrafik.

**Der Server entscheidet, der Client zeigt an.** Jede Regel, jeder Zufall und
jede Punktzahl entsteht serverseitig. Der Client hält keinen Zustand, den er
verlieren könnte.

**Der Zustand ist ein Ereignisprotokoll.** `score` wird nie geschrieben,
sondern als Summe aller Deltas gerechnet. Deshalb kann der Gastgeber um zwei
Uhr nachts jedes Ereignis streichen, und die Punkte stimmen sofort wieder,
ohne Gegenbuchung und ohne halben Zustand.

**Es ist eine Party.** Handys gehen in Standby, Leute sind betrunken, der
Gastgeber hat keine Zeit. Also: voller Snapshot statt Deltas, ein Fehler wird
aufgefangen statt den Server zu beenden, und alles Wichtige ist im Admin mit
einem Fingertipp zu beheben.

Ausführlich in **[docs/architecture.md](docs/architecture.md)**.

---

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Aufbau, Zustandsmodell, Protokoll, Module, Grenzen |
| [docs/rules.md](docs/rules.md) | Die Spielregeln in Spielbegriffen |
| [docs/content.md](docs/content.md) | Eigene Karten schreiben |
| [docs/operations.md](docs/operations.md) | Den Abend betreiben, Netz, Notfälle |
| [docs/design.md](docs/design.md) | Farben, Schrift, Pixelgrafik, Bedienung im Dunkeln |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Mitarbeiten |
| [CHANGELOG.md](CHANGELOG.md) | Was sich wann geändert hat |

---

## Aufbau

```text
server/          ein Node-Prozess: HTTP, WebSocket, alle Spielregeln
  game.js        der komplette Zustand und jede Regel
  index.js       Verkabelung, Aktionstabellen, Startausgabe
  catalog.js     Inhalte laden und zurückschreiben
  store.js       Spielstand auf Platte, atomar, mit Sicherungen
  config.js      die Stellschrauben
  sheet.js       druckbarer Spickzettel für den Host
  recap.js       Rückblick auf den Abend aus dem Protokoll
  data/          alle Inhalte als JSON

client/src/      React, mobile-first
  lib/           WebSocket, Sprites, Canvas-Planet, Namenserkennung
  screens/       Beitritt, Regeln, Spieler-App
  tabs/          die sechs Tabs
  overlays/      Vollbild-Einblendungen
  host/          die Admin-Konsole

scripts/         Inhaltsprüfer, zwei Testsuiten, UI-Audit, Probelauf
docs/            siehe oben
```

---

## Befehle

```bash
npm run dev          # Server auf 3000, Vite mit Hot Reload auf 5173
npm run build        # Produktionsbuild nach client/dist
npm start            # nur den Server
npm run party        # bauen und starten
npm run probelauf    # zweiter Server auf 3001, eigene Kopie der Karten

npm test             # Inhaltsprüfer, Regeln, Verkabelung
npm run lint:data    # nur die Karten und Kataloge
npm run test:engine  # nur die Spielregeln, ohne Server
npm run test:server  # nur die WebSocket-Verkabelung
npm run audit:ui     # jeden Screen auf vier Handybreiten, braucht Chrome
```

`npm test` läuft ohne Vorbereitung und **fasst keine echten Daten an**: jeder
Lauf kopiert `server/data` nach `/tmp` und arbeitet nur auf der Kopie.

| Suite | Prüft |
|---|---|
| `lint:data` | Die Inhalte gegen den Code: fehlende Stufen, zu lange Texte, Vornamen in Aufgaben, Shop-Wirkungen, die die Engine nicht kennt, Strafen-Label, die zu keiner Verlierer-Stufe passen. Findet die stummen Fehler, die nichts kaputtmachen und einfach nicht wirken. |
| `test:engine` | Die Regeln direkt an der Engine, ohne Server. |
| `test:server` | WebSocket, Aktionen, Snapshots, Reconnect, Admin, Absturzsicherung. Startet sich seinen eigenen Server. |
| `audit:ui` | 84 Ansichten in headless Chrome auf 320, 360, 390 und 430 Pixeln: Querlauf, zu kleine Tippziele, abgeschnittene Beschriftungen, Konsolenfehler. Ohne Chrome überspringt es sich. |

### Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `PORT` | Port des Servers, sonst 3000 |
| `BBB_DATA_DIR` | Karten, Katalog und Spielstand komplett woandershin legen |
| `BBB_STATE_FILE` | nur den Spielstand; `none` hält ihn im Arbeitsspeicher |
| `BBB_CONFIG_FILE` | Laufzeit-Einstellungen woandershin legen |
| `BBB_CRASH_TEST` | lässt den Server einmal absichtlich abstürzen, für den Servertest |
| `CHROME_PATH` | Pfad zu Chrome für `audit:ui` |

---

## Die Inhalte sind echt

Der mitgelieferte Katalog sind die **86 Karten einer tatsächlich gespielten
Party**: 258 Aufgabentexte auf Deutsch, dazu 15 Sonderaufträge, 12 Strafkarten,
9 Shop-Items, 5 Special Cards, 3 Preise und 4 Strafen.

Sie sind als Beispiel gedacht, nicht als Vorlage für jede Runde. **Es geht
reichlich um Alkohol.** Wer sie benutzt, sollte sie vorher lesen; wer sie
ersetzt, tut genau das Richtige. Wie das geht und welche Aufgaben bei der
Auswahl gestrichen wurden, steht in [docs/content.md](docs/content.md).

Die Preise sind persönlich („Buki backt dir einen Kuchen deiner Wahl"). Das ist
Absicht: ein echter Katalog zeigt besser, wie das Spiel funktioniert, als leere
Platzhalter.

---

## Grenzen

Damit niemand danach sucht:

- **Keine Authentifizierung.** Ein Token im `localStorage` erkennt den Spieler
  wieder. Wer den Token einer anderen Person hat, ist diese Person. Für ein
  lokales Netz mit zwölf Freunden reicht das, für alles andere nicht.
- **Die Host-PIN ist vierstellig** und hat eine Bremse, aber sie ist kein
  Passwort.
- **Eine Party pro Prozess.** Zwei Partys heißen zwei Prozesse mit
  verschiedenem `BBB_DATA_DIR` und `PORT`.
- **Keine Push-Benachrichtigungen.** Ohne HTTPS gibt der Browser die API nicht
  frei, und `http://192.168.x.x` ist kein sicherer Kontext.
- Ausgelegt auf ungefähr fünfzehn Gäste und einen Abend.

---

## Lizenz

Code unter [MIT](LICENSE).

Die Schrift **Inter** liegt nicht im Repository; `npm run assets` holt sie von
Google Fonts. Sie steht unter der SIL Open Font License 1.1.

Die Kartentexte unter `server/data/` sind Teil des Projekts und fallen
ebenfalls unter die MIT-Lizenz. Ob sie auf eure Party passen, ist eine andere
Frage.
