# Architektur

Wie die App aufgebaut ist und warum. Gedacht für alle, die den Code lesen,
erweitern oder für eine eigene Party umbauen wollen.

Die Kurzfassung steht in drei Sätzen:

> Ein einziger Node-Prozess hält den kompletten Spielzustand im Arbeitsspeicher
> und verteilt ihn über WebSockets an die Handys. Der Zustand ist ein
> Ereignisprotokoll, aus dem alle Zahlen abgeleitet werden, nie ein direkt
> geschriebener Punktestand. Der Client ist reine Anzeige und trifft keine
> einzige Spielentscheidung.

---

## 1. Was die Umgebung vorgibt

Die Architektur folgt fast vollständig aus den Bedingungen des Abends. Wer sie
verstehen will, muss zuerst die kennen.

| Bedingung                                              | Folge im Aufbau                                                                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kein Internet am Ort, nur ein lokales WLAN             | Keine CDNs, keine externen Schriften, keine Cloud. Alles liegt auf der Platte oder entsteht im Code.                                                        |
| Kein HTTPS (der Server läuft auf `http://192.168.x.x`) | Keine Push-Benachrichtigungen, kein Service Worker, keine Notification-API. Aufmerksamkeit wird über die Oberfläche erzeugt, nicht über das Betriebssystem. |
| Ungefähr zwölf Handys, alle gleichzeitig               | Jede Änderung geht sofort an alle. Kein Abholen, kein Polling.                                                                                              |
| Handys gehen in Standby und verlieren die Verbindung   | Nach dem Wiederaufbau wird immer der **volle** Zustand geschickt, nie ein Delta. Es gibt keinen Zustand, der auf dem Handy entstehen könnte.                |
| Der Gastgeber ist betrunken und hat keine Zeit         | Alles, was schiefgehen kann, muss sich entweder selbst reparieren oder in der Host-Konsole mit einem Fingertipp zu beheben sein.                            |
| Die Leute sind betrunken                               | Der Server glaubt dem Client nichts. Jede Regel steht serverseitig.                                                                                         |

Ein Abend dauert fünf Stunden und findet einmal statt. Deshalb ist überall die
robuste Variante gewählt, nicht die elegante: ein Prozess statt Microservices,
eine JSON-Datei statt einer Datenbank, ein vollständiger Snapshot statt
Deltas, und ein Fehler, der aufgefangen wird, statt eines sauberen Absturzes.

---

## 2. Aufbau im Überblick

```text
   Handy (Gast)          Handy (Gast)         MacBook (Host)
   React im Browser      React im Browser     React im Browser
        │                     │                     │
        │  WebSocket          │                     │  WebSocket
        └─────────────┬───────┴─────────────────────┘   (kind: 'admin')
                      │
            ┌─────────▼──────────────────────────────┐
            │  Ein Node-Prozess (server/index.js)    │
            │                                        │
            │  express  ──  statische Dateien,       │
            │               Druckseiten, Exporte     │
            │  ws       ──  Aktionen und Snapshots   │
            │                                        │
            │  ┌──────────────────────────────────┐  │
            │  │  Game (server/game.js)           │  │
            │  │  der komplette Zustand + Regeln  │  │
            │  └───────────┬──────────────────────┘  │
            │              │                          │
            │   catalog.js │   store.js   config.js   │
            └──────────────┼──────────────────────────┘
                           │
                  server/data/*.json
            (Karten, Katalog, Spielstand, Einstellungen)
```

Es gibt keine Datenbank, keinen Cache, keine Warteschlange und keinen zweiten
Prozess. `npm start` ist alles.

---

## 3. Der Zustand

### 3.1 Das Ereignisprotokoll ist die Wahrheit

Alles Punkterelevante ist ein Eintrag in `state.events`. Ein Eintrag sieht so
aus:

```js
{
  id: 'e-0042',
  ts: '2026-09-12T22:14:03.120Z',
  playerId: 'p-0003',
  type: 'TASK_CONFIRMED',
  delta: 10,               // Punkte, die dieses Ereignis bewegt
  voided: false,           // vom Host gestrichen?
  level: 10,               // typabhängige Zusatzfelder
  feed: { icon: '✅', text: '…', kind: 'good' },   // optional, für den Feed
}
```

Daraus folgt die wichtigste Regel des Projekts:

> **`score(pid)` = Summe aller `delta` der nicht gestrichenen Ereignisse dieses
> Spielers.** Es wird nirgends ein Punktestand geschrieben.

Das klingt nach Mehraufwand und ist in Wirklichkeit der Grund, warum die App
einen Partyabend übersteht:

- **Jede Zahl ist erklärbar.** Wer fragt „wieso habe ich nur 40?", bekommt die
  Liste.
- **Jeder Fehler ist umkehrbar.** Der Host streicht im Protokoll ein Ereignis
  (`voided: true`), und die Punkte stimmen sofort wieder. Es gibt keine
  Gegenbuchung, kein Aufräumen, keinen inkonsistenten Zwischenzustand.
- **Ein Absturz kann nichts halb erledigen.** Entweder das Ereignis steht im
  Protokoll oder nicht. Es gibt keinen Zustand dazwischen.

Der letzte Punkt ist auch der Grund, warum `server/index.js` unerwartete Fehler
auffängt statt den Prozess zu beenden (siehe [Abschnitt 8](#8-was-passiert-wenn-etwas-kaputtgeht)).

### 3.2 Was sonst noch im Zustand steht

```js
{
  version, createdAt,
  phase,        // 'lobby' | 'running' | 'finale' | 'ended'
  players: [],  // wer mitspielt, inklusive Avatar-Konfiguration
  turns: {},    // pro Spieler der laufende Zug, siehe 4.
  claims: [],   // offene und erledigte Abnahmen
  events: [],   // das Protokoll
  bets: [],     // Wetten im Black Market
  effects: [],  // gekaufte Effekte, die gerade wirken
  drawn: [],    // schon gezogene Karten-ids (der Stapel)
  wildcard,     // das gerade offene Sonderauftrag-Angebot
  result,       // die eingefrorene Auswertung nach Spielende
  counter,      // Zähler für die id-Vergabe
}
```

`turns`, `claims` und `effects` sind bewusst **kein** Teil des Protokolls. Sie
beschreiben, was gerade läuft, nicht was passiert ist. Wenn ein Zug endet,
bleibt vom Zug nichts übrig außer den Ereignissen, die er erzeugt hat.

### 3.3 Abgeleitet, nicht gespeichert

Diese Werte werden bei jedem Zugriff neu gerechnet und nie abgelegt:

| Wert                | Quelle                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Punktestand         | Summe der Deltas                                                    |
| Rangliste           | Punkte, bei Gleichstand die frühere letzte Punktzeit, dann der Name |
| Persönliche Bilanz  | ein Durchlauf durch das Protokoll                                   |
| Verbleibende Karten | Katalog minus `drawn`                                               |
| Host-Checkliste     | Katalog, Spieler und Konfiguration im Vergleich                     |
| Rückblick-Seite     | ein Durchlauf durch das Protokoll                                   |

Genau eine Sache wird eingefroren: `state.result`. Die Auswertung soll nach
dem Spielende nicht mehr wackeln, auch wenn der Host danach noch etwas
korrigiert.

---

## 4. Der Zug: eine Zustandsmaschine pro Spieler

Es gibt keine Reihenfolge und kein Warten. Jeder Spieler hat seine eigene
Zustandsmaschine, und alle laufen gleichzeitig. `state.turns[playerId]` hält
den Stand.

```text
                    ┌──────────────────────────────────────┐
                    │                                      │
  idle ──draw()──►  observer ──observerAck()──►  level ──pickLevel()──►  reveal
    ▲                  ▲                                                  │  │
    │                  │                                         reroll() │  │ taskDone()
    │           pickObserver()                          (bis zu 3×, neue  │  │
    │                  │                                    Karte)  ──────┘  │
    │            chooseObserver                                              │
    │           (nur mit gekauftem                                           ▼
    │            Effekt, sonst wird                                       waiting
    │            zufällig zugewiesen)                                        │
    │                                                     Beobachter bestätigt
    └────────────────────────────────────────────────────────oder lehnt ab───┘
```

Drei Eigenheiten, die man kennen muss:

**Der Beobachter steht vor der Aufgabe fest.** Beim Ziehen wird eine zufällige
aktive Person zugewiesen, noch bevor irgendjemand den Kartentext kennt. Das ist
der Kern des Spiels: man kann sich den nachsichtigsten Freund nicht aussuchen.

**Die Stufe wird blind gewählt.** In `level` kennt der Client nur Titel und
Kategorie. Der Aufgabentext geht erst über die Leitung, wenn die Stufe
feststeht. Das ist in `snapshotFor()` durchgesetzt, nicht im Client:

```js
const revealed = t.status === 'reveal' || t.status === 'waiting';
const revealText = !revealed ? null : card?.levels?.[levelKey]?.text;
```

Wer das Protokoll mitliest, sieht den Text also wirklich nicht vorher.

**`waiting` blockiert nicht.** Wer auf eine Abnahme wartet, darf schon die
nächste Karte ziehen. Sonst steht das halbe Spiel still, weil jemand sein Handy
in der Jackentasche hat.

---

## 5. Der Weg einer Aktion durch das System

Ein Gast tippt auf „Erledigt":

1. **Client** ruft `action('taskDone')`. Er prüft nichts, er sperrt nichts, er
   rechnet nichts aus.
2. **`server/index.js`** schlägt die Aktion in `PLAYER_ACTIONS` nach, prüft die
   Anmeldung und ruft `game.taskDone(playerId)`.
3. **`server/game.js`** prüft die Regeln (`status === 'reveal'`?), erzeugt die
   Abnahme, schreibt ein Ereignis ins Protokoll und ruft `changed()`.
4. **`changed()`** stößt zwei Dinge an: den gebündelten Schreibvorgang auf die
   Platte und den Rundruf an alle Verbindungen.
5. **Rundruf** baut den öffentlichen Teil des Snapshots **einmal** und schickt
   jedem Gerät sein persönliches Bild.
6. **Client** ersetzt seinen kompletten Zustand durch das Empfangene und
   rendert neu.

Die Quittung an den Auslöser (`{ type: 'ack', … }`) transportiert nur Erfolg
oder Fehlermeldung, nie Zustand. Zustand kommt ausschließlich über `state`.

### Das Protokoll auf der Leitung

| Richtung | Nachricht                             | Zweck                                                         |
| -------- | ------------------------------------- | ------------------------------------------------------------- |
| → Server | `{ type: 'hello', role, token, pin }` | Anmelden, Wiedererkennen über den Token                       |
| → Server | `{ type: 'join', name, cfg }`         | Neu beitreten                                                 |
| → Server | `{ type: 'action', action, … }`       | Spieleraktion, siehe `PLAYER_ACTIONS`                         |
| → Server | `{ type: 'admin', action, … }`        | Hostaktion, siehe `ADMIN_ACTIONS`, nur für `kind === 'admin'` |
| → Server | `{ type: 'ping' }`                    | Lebenszeichen prüfen                                          |
| ← Client | `{ type: 'state', state }`            | **Voller** Snapshot                                           |
| ← Client | `{ type: 'ack', reqId, ok \| error }` | Quittung zur ausgelösten Aktion                               |
| ← Client | `{ type: 'tokenInvalid' }`            | Der gespeicherte Token gehört zu niemandem mehr               |

Jede Nachricht vom Client trägt eine `reqId`; die Quittung trägt sie zurück.
So kann der Client auf genau seine Antwort warten, ohne den Zustandsstrom zu
vermischen.

### Drei Sichten auf denselben Zustand

```text
publicSnapshot()  Rangliste, Feed, laufende Aufgaben, Phase.
                  Für alle identisch, wird pro Rundruf einmal gebaut.
        │
        ├── snapshotFor(pid, shared)   + me, turn, observations, Markt
        │                                Aufgabentext nur wenn freigegeben
        │
        └── adminSnapshot(shared)      + Konfiguration, Checkliste, alle
                                         Kataloge, Protokoll, Effekte
```

Ein Snapshot ist rund 18 kB. Bei zwölf Geräten und ein paar hundert Aktionen
pro Abend ist das für ein WLAN belanglos, und es macht jede Frage nach
Synchronisierung gegenstandslos.

---

## 6. Die Module

### Server

| Datei        | Verantwortung                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.js`   | HTTP, WebSocket, Aktionstabellen, Startausgabe mit QR-Code, Signalbehandlung. Kennt keine Spielregeln.                         |
| `game.js`    | **Der ganze Rest.** Zustand, Regeln, Zufall, Punkte, Snapshots. Die einzige Datei, in der eine Spielentscheidung fällt.        |
| `catalog.js` | Lädt die Inhalte aus `data/*.json` in den Speicher und schreibt sie atomar zurück. Der Karten-Editor im Admin geht hier durch. |
| `store.js`   | Spielstand auf die Platte: gebündelt, atomar per `rename`, mit Sicherungsdatei und stündlichen Zwischenständen.                |
| `config.js`  | Die Stellschrauben. `DEFAULTS` im Code, Abweichungen in `data/config.json`, zur Laufzeit im Admin änderbar.                    |
| `page.js`    | Gemeinsames Gerüst der beiden gedruckten Seiten.                                                                               |
| `sheet.js`   | Der Spickzettel für den Host (`/spickzettel`).                                                                                 |
| `recap.js`   | Der Rückblick auf den Abend (`/rueckblick`).                                                                                   |

`game.js` ist mit rund 1600 Zeilen die größte Datei. Das ist Absicht: die
Regeln hängen so eng zusammen, dass eine Aufteilung nach Themen (Shop, Wetten,
Auswertung) vor allem Importe erzeugen würde. Wer sie trotzdem aufteilt, sollte
den Zustand und `changed()` an genau einer Stelle lassen.

### Client

| Ordner           | Inhalt                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `lib/net.js`     | Die einzige Stelle, die den WebSocket kennt. Reconnect, Aufwach-Prüfung, Quittungen.       |
| `lib/sprites.js` | Avatare und Katzen als prozedurale Pixelgrafik, siehe unten.                               |
| `lib/globe.js`   | Der Pixel-Planet auf dem Startscreen (Canvas).                                             |
| `lib/names.js`   | Erkennt Vornamen in Aufgabentexten. Wird vom Admin-Formular und vom Inhaltsprüfer benutzt. |
| `screens/`       | Beitritt, Regeln, die Spieler-App mit den Tabs.                                            |
| `tabs/`          | Die sechs Tabs.                                                                            |
| `overlays/`      | Vollbild-Einblendungen: Würfel, Sonderauftrag, Special Card, Auswertung, Profil.           |
| `components/`    | Hintergrund, Pixel-Icons, Logo, Avatar-Editor, Absturz-Auffangnetz.                        |
| `host/Admin.jsx` | Die Host-Konsole. Gleiche Bauart wie die Spieler-App.                                      |

**Alle Grafiken entstehen im Code.** Es gibt kein einziges Bild im Repository.
Avatare und Katzen werden aus ASCII-Gittern zu SVG-Data-URLs zusammengesetzt
(`sprites.js`), Icons sind gezeichnete Pixelraster (`PixelIcon.jsx`), Planet
und Hintergrund sind Canvas. Das hält die App klein, macht sie offline-tauglich
und erlaubt beliebig viele Avatar-Kombinationen ohne Assets.

---

## 7. Inhalte

Alles Inhaltliche liegt als JSON unter `server/data/` und **nie** im Code.
Karten schreiben heißt: Datei ändern oder im Admin tippen. Kein Deploy.

| Datei              | Inhalt                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `cards.json`       | Aufgabenkarten, je drei Stufen mit den Schlüsseln `1`, `5`, `10` |
| `wildcards.json`   | Sonderaufträge, kein Stufensystem, eigene Uhr                    |
| `specials.json`    | Special Cards; ihre **Wirkung** steht im Code                    |
| `shopItems.json`   | Shop-Angebote mit Preis und Wirkung                              |
| `penalties.json`   | Strafkarten für das Shop-Item „Strafe verhängen"                 |
| `prizes.json`      | Preise für die Podiumsplätze                                     |
| `punishments.json` | Strafen für die Verlierer-Stufen                                 |

Zwei dieser Dateien zeigen auf Code und können deshalb stumm ins Leere laufen:
Eine unbekannte `effect`-Zeichenkette in `shopItems.json` kostet Punkte und tut
nichts, und ein `label` in `punishments.json`, das zu keiner Verlierer-Stufe
passt, führt dazu, dass ein Verlierer am Ende schlicht nichts angezeigt
bekommt. Genau dagegen gibt es `npm run lint:data`, und die Listen, gegen die
er prüft, sind aus `game.js` exportiert statt abgeschrieben:

```js
export const BUCKET_NAMES = { 4: [...], 3: [...], 2: [...], 1: [...] };
export const KNOWN_SPECIALS = ['sp-steal', 'sp-swap', 'sp-king', 'sp-cat', 'sp-joker'];
export const KNOWN_EFFECTS  = ['forceLevel10', 'rerollBlock', …];
```

Ein Test vergleicht diese Listen mit den tatsächlichen `case`-Zweigen im Code,
damit der Prüfer nicht irgendwann gegen eine Behauptung prüft.

Details zum Schreiben von Karten: [content.md](content.md).

---

## 8. Was passiert, wenn etwas kaputtgeht

| Fall                    | Antwort                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fehler im Server        | Wird aufgefangen, gemeldet, der Spielstand gesichert, der Prozess läuft weiter. Vertretbar, weil der Zustand ein Protokoll ist: eine abgebrochene Aktion hinterlässt kein halbes Ergebnis, sondern gar keins. |
| Fehler in der Anzeige   | `components/Crash.jsx` fängt ihn ab und zeigt „Neu laden". Auf dem Handy liegt nichts, was verloren gehen könnte.                                                                                             |
| Handy aus dem Standby   | Beim Aufwachen wird angeklopft; bleibt die Antwort vier Sekunden aus, wird neu verbunden. iOS meldet den Abbruch nicht zuverlässig.                                                                           |
| Serverneustart          | Alle Handys verbinden sich von selbst, mit Zufallsanteil in der Wartezeit, damit sie nicht im Gleichtakt anklopfen.                                                                                           |
| Spielstand beschädigt   | `state.backup.json` daneben, dazu ein Stand pro Stunde unter `data/snapshots/`. Im Admin jederzeit als Datei zu ziehen.                                                                                       |
| Jemand rät die Host-PIN | Nach drei Fehlversuchen wächst die Wartezeit pro Verbindung.                                                                                                                                                  |
| Kartenstapel leer       | Wird neu gemischt, bereits ausgeteilte Karten bleiben gesperrt. Der Host sieht es im Feed.                                                                                                                    |

Die Absturzsicherung ist keine Behauptung: mit `BBB_CRASH_TEST=1` wirft der
Server absichtlich aus einem Timer heraus, also dort, wo kein `try/catch`
greift, und der Servertest prüft danach, dass er noch antwortet.

---

## 9. Tempo

Zwei Stellen waren teuer genug, um sie zu messen.

**Der Rundruf wuchs mit dem Abend.** Die Rangliste lief zweimal pro Spieler
durch das Protokoll, und das einmal pro Gerät. Bei zehn Gästen also 240
Durchläufe für eine einzige Aktion. Jetzt berechnet `scoreboard()` alle
Punktestände in einem Durchlauf, und der öffentliche Teil des Snapshots wird
pro Rundruf einmal gebaut.

| Ereignisse im Protokoll  | vorher  | nachher |
| ------------------------ | ------- | ------- |
| 2 122 (ein echter Abend) | 9,2 ms  | 1,4 ms  |
| 6 000                    | 25,4 ms | 3,8 ms  |

**Der Hintergrund lief auf jedem Screen.** Er legte pro Bild drei
bildschirmfüllende Farbverläufe neu an. Jetzt entstehen Himmel und Farbwolken
auf einer viertelgroßen Hilfsfläche und werden einmal hochskaliert kopiert; bei
vierfach gedrosselter CPU stieg das von 17 auf 60 Bilder pro Sekunde.

Der Planet auf dem Startscreen bleibt bei rund 14 Bildern pro Sekunde unter
derselben Drosselung. Er ist zeichenbegrenzt, nicht rechenbegrenzt: rund 1300
`fillRect` pro Bild für Konfetti, Luftschlangen und Tanzfläche. Das ließe sich
nur durch weniger Deko senken. Bei ungedrosselter CPU läuft er mit 59 Bildern
pro Sekunde.

---

## 10. Prüfung

Drei Schichten, alle ohne Vorbereitung lauffähig, keine fasst echte Daten an.

| Befehl                | Prüft                          | Wie                                                 |
| --------------------- | ------------------------------ | --------------------------------------------------- |
| `npm run lint:data`   | die **Inhalte** gegen den Code | liest `data/*.json`                                 |
| `npm run test:engine` | die **Regeln**                 | `new Game()` direkt, ohne Server                    |
| `npm run test:server` | die **Verkabelung**            | startet einen eigenen Server auf einem freien Port  |
| `npm run audit:ui`    | das **Aussehen**               | headless Chrome, 84 Ansichten auf vier Handybreiten |

Die Trennung ist nützlich: ein Regelfehler zeigt sich im Engine-Test in
Millisekunden, ein Protokollfehler im Servertest, und ein abgeschnittener Text
auf einem 320-Pixel-Display nur im Audit.

**Kein Test kann echte Daten beschädigen.** Jeder Lauf kopiert `server/data`
nach `/tmp` und arbeitet über `BBB_DATA_DIR` nur auf der Kopie. Das ist keine
Vorsichtsmaßnahme auf Verdacht: ein abgestürzter Testlauf hat den echten
Shop-Katalog schon einmal mit Testdaten überschrieben.

| Variable              | Wirkung                                                        |
| --------------------- | -------------------------------------------------------------- |
| `BBB_DATA_DIR`        | verlegt Karten, Katalog und Spielstand komplett                |
| `BBB_STATE_FILE`      | verlegt nur den Spielstand; `none` hält ihn im Arbeitsspeicher |
| `BBB_CONFIG_FILE`     | verlegt die Laufzeit-Einstellungen                             |
| `BBB_CRASH_TEST`      | lässt den Server einmal absichtlich abstürzen                  |
| `PORT`, `CHROME_PATH` | Port, Chrome-Pfad für das Audit                                |

`npm run probelauf` nutzt dieselbe Mechanik für einen zweiten Server auf Port
3001, mit eigener Kopie der Karten. Zum Üben mit fremden Handys, ohne dass der
echte Abend etwas mitbekommt.

---

## 11. Erweitern

### Eine Karte hinzufügen

Im Admin unter **Karten** drei Texte eintippen, fertig. Oder `cards.json`
ergänzen. Danach `npm run lint:data`.

### Ein Shop-Item mit neuer Wirkung

1. Wirkung in `buyItem()` behandeln oder an der passenden Stelle im Zug mit
   `takeEffect(pid, 'name')` einlösen.
2. Den Namen in `KNOWN_EFFECTS` eintragen.
3. Einen Text in `effectLabel()` ergänzen, sonst sieht der Gast den rohen
   Bezeichner.
4. Eintrag in `shopItems.json`.

Schritt 2 und 3 vergisst man leicht; `lint:data` und der Engine-Test schlagen
dann an.

### Eine neue Special Card

`playSpecial()` um einen `case` erweitern, die id in `KNOWN_SPECIALS`
eintragen, Eintrag in `specials.json`. Die Wirkung einer Special Card steht
bewusst im Code, weil sie am Zustand arbeitet und nicht nur Text ist.

### Eine neue Stellschraube

In `DEFAULTS` eintragen und im Admin unter `SWITCHES` oder `NUMBERS`
auflisten. Die Startausgabe meldet danach von selbst, wenn der laufende Wert
vom Standard abweicht.

---

## 12. Bewusste Grenzen

Damit niemand danach sucht:

- **Keine Authentifizierung.** Ein Token im `localStorage` erkennt den Spieler
  wieder, mehr nicht. Wer den Token einer anderen Person hat, ist diese Person.
  Für ein lokales Netz mit zwölf Freunden ausreichend, für alles andere nicht.
- **Die Host-PIN ist vierstellig.** Sie hat eine Bremse, aber sie ist kein
  Passwort.
- **Kein Mehrbenutzerbetrieb.** Ein Prozess trägt genau eine Party. Zwei
  Partys heißen zwei Prozesse mit verschiedenem `BBB_DATA_DIR` und `PORT`.
- **Der Snapshot geht immer vollständig raus.** Bei sehr viel mehr als
  fünfzehn Gästen wäre das die erste Stelle, die man anfasst.
- **Das Protokoll wird nie gekürzt.** Nach fünf Stunden stehen dort ein paar
  tausend Einträge, das ist eingeplant. Nach fünf Tagen Dauerbetrieb wird es
  unhandlich.
- **Keine Push-Benachrichtigungen.** Geht ohne HTTPS nicht, siehe Abschnitt 1.
