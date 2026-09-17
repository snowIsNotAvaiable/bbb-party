# Mitarbeiten

Das Projekt ist für genau einen Abend gebaut worden und danach aufgeräumt
veröffentlicht. Beiträge sind willkommen, vor allem eigene Kartenkataloge,
Übersetzungen und Fehlerberichte von echten Partys.

## Sprache

Code, Kommentare, Dokumentation und Oberfläche sind **deutsch**. Das ist keine
Ideologie, sondern Konsistenz: die Inhalte sind deutsch, also ist alles deutsch.
Wer das Projekt in einer anderen Sprache will, ist mit einem Fork besser dran
als mit einer Mischung.

## Loslegen

```bash
npm install
npm run assets     # Inter einmalig lokal ablegen, braucht Internet
npm run dev        # Server auf 3000, Vite mit Hot Reload auf 5173
```

Zum Ausprobieren braucht man mehr als einen Browser-Tab: die Mechanik lebt
davon, dass sich Leute gegenseitig abnehmen. Zwei Fenster im privaten Modus
reichen, oder `npm run probelauf` und zwei Handys im selben WLAN.

## Vor jedem Pull Request

```bash
npm test           # Inhaltsprüfer, Regeln, Verkabelung
npm run build      # muss durchlaufen
npm run audit:ui   # wenn du etwas an der Oberfläche geändert hast
```

`npm test` läuft ohne Vorbereitung und fasst keine echten Daten an: jeder Lauf
kopiert `server/data` nach `/tmp` und arbeitet auf der Kopie.

Das UI-Audit braucht Chrome. Wenn keiner gefunden wird, überspringt es sich
selbst; mit `CHROME_PATH` lässt sich einer angeben.

## Wo was hingehört

| Änderung | Datei |
|---|---|
| Spielregel | `server/game.js`, sonst nirgends |
| neue Aktion | Tabelle in `server/index.js` plus Methode in `game.js` |
| Inhalte | `server/data/*.json`, siehe [docs/content.md](docs/content.md) |
| Aussehen | `client/src/styles.css` und die betroffene Komponente |
| neue Stellschraube | `DEFAULTS` in `server/config.js` plus Eintrag im Admin |

Der ausführliche Überblick steht in
[docs/architecture.md](docs/architecture.md).

## Die vier Regeln, die das Projekt zusammenhalten

1. **Der Server entscheidet, der Client zeigt an.** Keine Spielregel im
   Client. Keine Ausnahme.
2. **Punkte werden nie geschrieben, nur gerechnet.** Alles Punkterelevante ist
   ein Ereignis mit einem `delta`. Wer `score` zuweist, bricht die
   Korrigierbarkeit für den ganzen Abend.
3. **Inhalte gehören in JSON, nicht in den Code.** Wer einen Kartentext in eine
   `.jsx`-Datei schreibt, nimmt dem Gastgeber die Möglichkeit, ihn um zwei Uhr
   nachts zu ändern.
4. **Nichts lädt zur Laufzeit aus dem Netz.** Keine CDNs, keine externen
   Schriften, keine Tracker. Die App läuft in einer Wohnung ohne Internet.

## Codestil

Es gibt keinen Formatter im Projekt. Richte dich nach den Dateien drumherum:
zwei Leerzeichen Einrückung, einfache Anführungszeichen, Semikolons,
Zeilenlänge ungefähr 110.

Kommentare erklären **warum**, nicht was. Ein Kommentar, der den Code
nacherzählt, wird beim nächsten Umbau zur Lüge.

Keine langen Striche im Fließtext, weder im Code noch in der Dokumentation noch
in Kartentexten. Komma, Doppelpunkt, Semikolon oder zwei Sätze. Der
Inhaltsprüfer meldet Verstöße in den Kartendateien.

## Fehlerberichte

Am nützlichsten sind Berichte von echten Abenden. Wenn etwas schiefging, hilft:

- die Ausgabe im Terminal
- `server/data/state.json`, **aber bitte vorher die Namen ersetzen**; die Datei
  enthält alles, was an dem Abend passiert ist
- wie viele Leute mitgespielt haben und auf welchen Geräten

## Was nicht ins Repository gehört

`.gitignore` hält das schon fern, aber zur Sicherheit: `state.json` und
`state.backup.json` enthalten die echten Namen und den kompletten Verlauf einer
Party. `qr-party.png` enthält die lokale IP-Adresse. Beides bleibt lokal.
