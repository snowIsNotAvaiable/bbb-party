# Aussehen

Die Oberfläche ist ein dunkles, kompaktes Interface mit Pixelgrafik darin. Sie
soll in einem dunklen Wohnzimmer auf einem Handy mit Fettfingern bedienbar sein,
und sie soll aussehen, als hätte sich jemand Mühe gegeben.

**Die verbindliche Quelle ist [`client/src/styles.css`](../client/src/styles.css).**
Dieses Dokument erklärt die Absichten dahinter; die Werte stehen dort.

---

## Die Grundhaltung

Dunkler, fast neutraler blaugrauer Grund. Inter in mittleren Gewichten. Weiche
Radien. Der Akzent wird als **Linie und Schimmer** benutzt, nicht als Fläche.
Kontrast kommt aus den Tonwerten, nicht aus Sättigung.

Die wichtigste Regel: **Auf dunklem Grund ist Erhebung eine Kante plus
Umgebungsdunkelheit**, nicht ein gestapelter weicher Schatten. Deshalb beginnt
jeder Schatten-Token mit `0 0 0 1px …`.

---

## Farben

Die Palette sitzt vollständig in `:root` als CSS-Variablen. Vier Akzente tragen
Bedeutung und werden nicht dekorativ eingesetzt:

| Token | Bedeutung |
|---|---|
| `--accent` (Blauviolett) | Primäraktion, Rang, Links |
| `--rose` | Kicker, Badges, Minuspunkte, die mittlere Stufe |
| `--gold` | Punkte, Krone, Special Card |
| `--mint` | Bestätigen, Pluspunkte |

Tint-Füllungen immer als `rgba(...)` über dem Grund, nie deckend. Eine deckende
Akzentfläche zerstört die Tiefenstaffelung sofort.

Die Kanten sind nach Tiefe gestaffelt (`--line`, `--line-2`, `--line-3`) und
haben eine eigene Akzentreihe (`--line-accent` bis `--line-accent-3`). Welche
Kante ein Element bekommt, sagt, wie weit vorne es liegt.

---

## Schrift

Inter, lokal eingebunden, in vier Gewichten. **Kein Google-Fonts-CDN**, die App
läuft offline. `npm run assets` holt die Dateien einmalig nach
`client/public/fonts/`.

Die Größenskala reicht von 9,5 px (Tab-Label) bis 62 px (das „BBB" auf dem
Startscreen). Zwei Dinge sind durchgehend:

- Große Überschriften bekommen negatives Tracking (bis −.05em), damit sie
  gebaut statt gesetzt wirken.
- Versalien-Kicker bekommen viel Sperrung (.14em bis .22em), sonst kleben sie.

Längere Fließtexte bekommen `text-wrap: pretty`. Die Aufgabentexte sind
zwischen 5 und 300 Zeichen lang, das Layout muss beides tragen.

---

## Pixelgrafik ohne eine einzige Bilddatei

Im Repository liegt kein einziges Bild. Alles entsteht im Code:

| Was | Wie |
|---|---|
| Avatare und Katzen | ASCII-Gitter in `lib/sprites.js` werden zu SVG-Data-URLs zusammengesetzt |
| Icons | gezeichnete Pixelraster in `components/PixelIcon.jsx` |
| Logo | `components/PixelLogo.jsx` |
| Startscreen-Planet | Canvas, `lib/globe.js` |
| Hintergrund | Canvas, `components/PartyBackground.jsx` |

Das hält die App klein, macht sie offline-tauglich und erlaubt beliebig viele
Avatar-Kombinationen, ohne für jede eine Datei zu pflegen. Der Preis ist, dass
Änderungen am Aussehen Code-Änderungen sind.

Pixelgrafik braucht `image-rendering: pixelated` und ganzzahlige Skalierung,
sonst matscht sie. Dafür gibt es die Klasse `.bbb-pixel`.

---

## Bewegung

Animationen sind kurz und haben einen Anlass. Die Kurve ist fast überall
`cubic-bezier(.32,.72,.24,1)`: schnell los, weich aus.

Drei Dinge dürfen auffällig sein, weil sie die lauten Momente des Spiels sind:
der Sonderauftrag als Vollbild-Einblendung, die Special Card mit ihrem goldenen
Schimmer, und der Würfelwurf beim Reroll.

Alles andere ist ruhig. Ein Tab-Wechsel schiebt, er springt nicht.

---

## Bedienung im Dunkeln mit Alkohol

Konkrete Folgen für das Layout:

- **Trefferflächen mindestens 30 Pixel.** Auch dort, wo das Sichtbare kleiner
  ist: die Achsen-Punkte im Avatar-Editor sind 7 Pixel groß und haben 34 Pixel
  Trefferfläche. Das Audit prüft das.
- **Nie ein Fenster über der eigenen laufenden Aufgabe.** Eingehende
  Beobachtungsaufträge werden als Liste mit Badge angezeigt, nicht als Modal.
  Einzige Ausnahme ist der Sonderauftrag, und der ist wegklickbar.
- **Kein Zustand im Client.** Ein Tab-Wechsel oder ein Reload darf den eigenen
  Aufgabenstatus nie zurücksetzen. Er liegt serverseitig.
- **Kein Ausweg über den Zurück-Button.** Die gewählte Stufe wird auf dem
  Server festgehalten, bevor der Text erscheint.

---

## Vier Breiten

Jeder Screen wird auf 320, 360, 390 und 430 Pixeln geprüft:

```bash
npm run audit:ui
```

Das fährt 84 Ansichten in headless Chrome an und meldet seitlichen Querlauf,
Elemente außerhalb des Bildes, Trefferflächen unter 30 Pixeln, abgeschnittene
Beschriftungen und Konsolenfehler. `--shots` legt zusätzlich Screenshots ab.

Absichtlich neben dem Bild liegende Dinge sind ausgenommen: die inaktiven Tabs
in der Schiene (`.bbb-track`), die Laufschrift (`.bbb-marquee`) und breite
Tabellen in ihrem Scrollkasten (`.scroll`). Alle drei sind in einem Container
eingesperrt, der sie abschneidet.

---

## Die gedruckten Seiten

Spickzettel und Rückblick folgen bewusst **nicht** dem dunklen System. Sie sind
hell, serifenlos und für Papier gebaut, mit `break-inside: avoid` auf den Karten
und eigenen Seitenumbrüchen. Gemeinsames Gerüst in
[`server/page.js`](../server/page.js).
