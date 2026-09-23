# Inhalte schreiben

Alles Inhaltliche liegt als JSON unter `server/data/` und **nie** im Code. Eine
neue Kartensammlung heißt: Datei austauschen. Kein Deploy, kein Neustart.

> **Der mitgelieferte Katalog ist echt.** Es sind die 86 Karten einer
> tatsächlich gespielten Party, auf Deutsch, mit reichlich Alkohol. Sie sind
> als Beispiel gedacht und nicht als Vorlage für jede Runde. Wer sie benutzt,
> sollte sie vorher lesen. Wer sie ersetzt, soll genau das tun.

Nach jeder Änderung:

```bash
npm run lint:data
```

Der Prüfer findet die stummen Fehler, also die, die nichts kaputtmachen und
einfach nicht wirken.

---

## Aufgabenkarten (`cards.json`)

```json
{
  "id": "card-001",
  "title": "Kurzer Titel",
  "category": "trinken",
  "tags": [],
  "enabled": true,
  "levels": {
    "1": { "text": "Harmlos.", "timerSec": null },
    "5": { "text": "Peinlich.", "timerSec": null },
    "10": { "text": "Richtig blöd.", "timerSec": null }
  },
  "requires": { "props": [], "minPlayers": 1, "targetsOtherPlayer": false },
  "onlyRole": null,
  "authoredBy": "…",
  "createdAt": "2026-09-12T10:00:00Z"
}
```

| Feld       | Regel                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| `id`       | eindeutig über die ganze Datei                                                    |
| `category` | `trinken`, `sozial`, `performance`, `körperlich`, `wissen`, `geburtstagskind`     |
| `levels`   | **genau** die Schlüssel `1`, `5`, `10`; sie sind gleichzeitig die Punktwerte      |
| Textlänge  | 5 bis 300 Zeichen, darauf ist das Reveal-Layout ausgelegt                         |
| `timerSec` | bei normalen Karten `null`; eine Uhr haben nur Sonderaufträge                     |
| `onlyRole` | `null` oder `birthday`; solange niemand die Rolle hat, wird die Karte nie gezogen |
| `enabled`  | `false` nimmt die Karte aus dem Spiel, ohne sie zu löschen                        |

### Die drei Stufen müssen sich unterscheiden

Nicht nur im Wortlaut, sondern im Risiko. Stufe 1 traut sich jeder, Stufe 3
erzählt man am nächsten Tag noch. Wenn die drei Texte gleich unangenehm sind,
ist die blinde Stufenwahl eine Farce, und genau das ist der Kern des Spiels.

### Keine Namen in Aufgaben

Eine Aufgabe mit einem Vornamen trifft entweder die falsche Person oder eine,
die gar nicht da ist. Statt „Trink mit Robby einen Shot" also „Such dir jemanden
und trinkt zusammen einen Shot".

Das Kartenformular im Admin warnt mit einem Popup, wenn es einen Vornamen
findet, und `lint:data` prüft dieselbe Regel über die ganze Datei. Erkannt
werden die Namen der beigetretenen Spieler plus eine mitgelieferte Liste
deutscher Vornamen (`client/src/lib/names.js`).

### Was nicht in den Katalog gehört

Die Auswahl für die echte Party hat eine Reihe von Einsendungen aussortiert.
Dieselben Kriterien sind auch für eigene Kataloge brauchbar:

- **Strafbares.** Verfassungsfeindliche Symbole, Sachbeschädigung, alles was
  jemandem eine Anzeige einbringt.
- **Medizinisch riskantes.** Drogen, Ersticken, Zigaretten in der Nase,
  unbegrenzte Mengen Alkohol, Zimt oder Cayenne als Mutprobe.
- **Unbeteiligte.** Aufgaben, die Fremde einbeziehen, die nicht mitspielen und
  nicht gefragt wurden. Anrufe bei Dritten, Sprachnachrichten an Ex-Partner,
  Nachbarn.
- **Zu persönliches.** Nacktheit, echte Beleidigungen gegen echte Anwesende,
  ein fremdes Handy offenlegen.
- **Körperliche Gewalt**, auch als Spaß gemeint.

Vier Einsendungen wurden statt gestrichen entschärft: Aus „Plank halten und
fünf Shots" wurde „Plank halten und ein Glas", aus „misch dem Betrunkensten
etwas" wurde ein Getränk aus drei benannten Zutaten, aus der Zimt-Mutprobe eine
Blindverkostung, und aus Personennamen wurden Rollen. **Jede Alkoholmenge im
Katalog ist gedeckelt.**

---

## Sonderaufträge (`wildcards.json`)

Kein Stufensystem, ein Text, 25 Punkte, eigene Uhr.

```json
{ "id": "wc-01", "text": "…", "timerSec": 300, "enabled": true }
```

`timerSec` läuft ab dem Reveal. Sinnvoll sind zwei bis zwanzig Minuten; der
Prüfer meckert außerhalb davon.

---

## Shop (`shopItems.json`)

```json
{
  "id": "item-peek",
  "icon": "👀",
  "name": "Spickzettel",
  "description": "Du siehst Kategorie und Länge der nächsten Karte.",
  "price": 12,
  "requiresTarget": false,
  "targetSelf": true,
  "durationMin": null,
  "consumesOn": "NEXT_CARD_DRAWN",
  "effect": "peek",
  "enabled": true
}
```

**`effect` zeigt auf Code.** Nur diese Werte tun etwas:

`forceLevel10`, `rerollBlock`, `penalty`, `redirect`, `chooseObserver`,
`rerollDiscount`, `doublePoints`, `peek`, `immunity`

Jeder andere Wert lässt den Kauf Punkte kosten und nichts bewirken. `lint:data`
meldet das, und die Checkliste im Admin zeigt es auch während der Party an.

Eine neue Wirkung einzubauen ist in
[architecture.md, Abschnitt 11](architecture.md#11-erweitern) beschrieben.

---

## Preise und Strafen (`prizes.json`, `punishments.json`)

```json
{ "id": "prize-1", "place": 1, "icon": "🥇", "title": "…", "text": "…", "enabled": true }
```

```json
{
  "id": "pun-4",
  "label": "Endboss der Schande",
  "severity": 4,
  "icon": "💀",
  "title": "…",
  "text": "…",
  "enabled": true
}
```

Zwei Fallen:

1. **Für jeden Podiumsplatz muss ein Preis existieren**, sonst bleibt der Platz
   in der Auswertung leer.
2. **`label` muss exakt einer Verlierer-Stufe entsprechen**:
   `Knapp vorbei`, `Mitläufer`, `Solide enttäuschend`, `Endboss der Schande`.
   Ein Tippfehler bedeutet, dass jemand am Ende des Abends nichts angezeigt
   bekommt. Stumm, ohne Fehlermeldung.

Beides prüft `lint:data`.

`severity` von 1 bis 4 steuert nur die Punkte-Anzeige in der Auswertung.

---

## Strafkarten (`penalties.json`)

Werden vom Shop-Item „Strafe verhängen" gezogen.

```json
{ "id": "pen-01", "text": "…", "enabled": true }
```

---

## Special Cards (`specials.json`)

Die Datei enthält nur Name und Text. **Die Wirkung steht im Code**
(`playSpecial()` in `server/game.js`), weil sie am Zustand arbeitet. Eine
erfundene id in dieser Datei erzeugt eine Karte, die gezogen wird und nichts
tut; `lint:data` meldet das.

---

## Im Admin arbeiten

Unter `/admin` im Abschnitt **Karten**:

- Karte antippen schaltet sie ab oder wieder an, sofort für alle
- **Neue Karte schreiben**: Kategorie wählen, drei Texte tippen, fertig.
  Die id wird vergeben, `timerSec` bleibt leer, ein Popup warnt bei Namen
- jeden Katalog als JSON exportieren

Änderungen im Admin schreiben direkt in `server/data/*.json`. Wer parallel die
Dateien von Hand bearbeitet, überschreibt sich selbst.

---

## Was der Prüfer findet

`npm run lint:data` meldet unter anderem:

- fehlende Stufe, leerer Text, zu kurz, zu lang
- zwei Stufen mit identischem Text
- doppelte ids, unbekannte Kategorie, unbekannte Rolle
- Vornamen in Aufgaben und Sonderaufträgen
- Shop-Wirkungen, die die Engine nicht kennt, und Preise von null
- Strafen-Label, das zu keiner Stufe passt, und fehlende Podiumsplätze
- Special Cards ohne Wirkung im Code
- lange Striche, doppelte Leerzeichen, gerade Anführungszeichen

Er liest nur und schreibt nie.
