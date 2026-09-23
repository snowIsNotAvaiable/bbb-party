# Spielregeln

Was die App tut, in Spielbegriffen. Wie sie es tut, steht in
[architecture.md](architecture.md).

---

## Die Kernschleife

**Es gibt keine Züge und keine Reihenfolge.** Alle spielen dauerhaft parallel.
Wer fertig ist, zieht sofort die nächste Karte. Niemand wartet je auf jemanden.

1. **Karte ziehen.** Sie bleibt verdeckt.
2. **Die App weist einen Beobachter zu**, zufällig, noch bevor irgendjemand die
   Aufgabe kennt.
3. Zu sehen sind nur Titel und Kategorie, dazu die drei Stufen als Risiko.
4. **Stufe festlegen** (1, 5 oder 10 Punkte). Blind.
5. **Jetzt erst** erscheint der Aufgabentext dieser Stufe.
6. Entweder **erledigen** und vom Beobachter abnehmen lassen, oder **rerollen**
   und dafür Minuspunkte kassieren.
7. Punkte und Rangliste aktualisieren sich auf allen Geräten sofort.

Der Reiz liegt in Schritt 4: höhere Stufe, mehr Punkte, aber man kauft die
Katze im Sack.

---

## Punkte und Stufen

| Stufe         | Punkte | Charakter                               |
| ------------- | ------ | --------------------------------------- |
| Stufe 1       | +1     | harmlos, in dreißig Sekunden erledigt   |
| Stufe 2       | +5     | leicht peinlich, kostet Überwindung     |
| Stufe 3       | +10    | richtig unangenehm, aufwendig oder laut |
| Sonderauftrag | +25    | blind angenommen, siehe unten           |

Punkte gibt es **erst nach der Bestätigung** durch den Beobachter. Wird eine
Aufgabe abgelehnt, kostet sie.

**Negative Punktestände sind ausdrücklich erlaubt.**

### Reroll

Eine Karte wegwerfen kostet einen Würfelwurf, multipliziert mit einem Faktor,
der **innerhalb derselben Karte** steigt.

| Reroll für diese Karte | Faktor | bei Würfel 4 | Schlimmstfall |
| ---------------------- | ------ | ------------ | ------------- |
| erster                 | ×1     | −4           | −6            |
| zweiter                | ×2     | −8           | −12           |
| dritter                | ×3     | −12          | −18           |

Drei Rerolls **pro Karte**, nicht pro Abend. Der Zähler startet bei jeder neuen
Karte wieder bei null. So bleibt der Reroll eine Notbremse für eine unpassende
Karte, ohne dass jemand nach drei schlechten Karten den ganzen Abend gesperrt
ist.

Ein Reroll gibt eine neue Karte; Stufe und Beobachter werden neu ausgewürfelt.
**Gekaufte Effekte überleben den Reroll**: eine Zwangsstufe bleibt eine
Zwangsstufe, ein Spickzettel und die Beobachter-Wahl gelten weiter. Sonst wäre
ein Reroll für ein paar Punkte die Flucht aus einem Effekt für dreißig.

Die Skalierung lässt sich im Admin auf exponentiell umstellen.

---

## Das Beobachter-Prinzip

Kein Selbst-Abhaken. Jede Aufgabe braucht einen Beobachter: ihm wird sie
gezeigt oder gewidmet, und er bestätigt anschließend in seiner eigenen App.

|                          |                                                         |
| ------------------------ | ------------------------------------------------------- |
| **Wann**                 | direkt beim Kartenzug, **vor** dem Reveal               |
| **Wer**                  | zufällig durch die App, keine freie Wahl, kein Tausch   |
| **Warum zufällig**       | sonst sucht man sich den nachsichtigsten Freund aus     |
| **Mehrere gleichzeitig** | ja, als Liste, nie als Fenster über der eigenen Aufgabe |
| **Reagiert niemand**     | der Host entscheidet im Admin unter „Freigeben"         |

Nebeneffekt, der das Spiel trägt: Die Beobachterrolle zieht Aufmerksamkeit auf
die Aufgabe. Niemand erledigt seine Aufgabe unbemerkt in einer Ecke.

---

## Sonderauftrag

Alle fünfzehn bis fünfundzwanzig Minuten bekommt eine zufällige Person ein
Angebot über 25 Punkte. Zwei Besonderheiten:

- **Blind annehmen.** Der Text erscheint erst nach der Zusage.
- **Ablehnen kostet nichts**, geht aber öffentlich in den Feed. Der Preis ist
  sozial, nicht rechnerisch.

Es gibt fünf Minuten Bedenkzeit, zwei Beobachter statt einem, und rerollen geht
nicht. Der Host kann einen Sonderauftrag jederzeit von Hand auslösen.

> Aus einem echten Abend: von fünfzehn Angeboten wurden drei angenommen. Wer
> mehr Zusagen will, schaltet `wildcardBlindAccept` im Admin ab; dann ist der
> Text vor der Entscheidung sichtbar.

---

## Shop

Punkte sind nicht nur für die Rangliste da, sondern auch Währung. Ausgegebene
Punkte sind **weg**, sie gehen nicht an andere. Das hält den Shop teuer und die
Tabelle aussagekräftig.

| Wirkung          | Was sie tut                                            |
| ---------------- | ------------------------------------------------------ |
| `forceLevel10`   | Die nächste Karte des Ziels geht zwingend auf Stufe 3  |
| `rerollBlock`    | Das Ziel muss die laufende Aufgabe durchziehen         |
| `penalty`        | Das Ziel zieht eine Strafkarte                         |
| `redirect`       | Ein fremder Effekt auf dir wandert zu jemand anderem   |
| `chooseObserver` | Du suchst dir deinen nächsten Beobachter selbst aus    |
| `rerollDiscount` | Dein nächster Reroll kostet nur ×1                     |
| `doublePoints`   | Deine nächste Aufgabe zählt doppelt                    |
| `peek`           | Du siehst Kategorie und Länge der nächsten Karte vorab |
| `immunity`       | Fremde Effekte prallen an dir ab                       |

Schutzschalter gegen Konzentration auf eine Person: `maxForeignEffects`
begrenzt, wie viele fremde Effekte gleichzeitig auf jemandem liegen, und
`immunity` blockt komplett.

---

## Black Market

Wetten zwischen zwei Spielern, Einsatz bis 25 Punkte. Der Einsatz wird beim
Annehmen **sofort abgezogen**; der Pott liegt in der Wette selbst. Wer gewinnt,
bekommt ihn komplett. Bei Streit entscheidet der Host im Admin.

---

## Special Cards

Mit niedriger Wahrscheinlichkeit kommt statt einer Aufgabe eine Special Card.
Sie wird nicht gespielt, sondern gehalten und später eingesetzt.

| Karte        | Wirkung                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| Joker        | streicht eine Aufgabe komplett: keine Punkte, keine Kosten, kein Reroll-Zähler        |
| Punkte-Raub  | nimmt einer Person 15 Punkte und gibt sie dir. Sie erfährt, wer es war                |
| Rollentausch | tauscht deinen Punktestand mit dem einer beliebigen Person, sofort und ohne Rückfrage |
| Königsmacher | zwingt eine Person auf Stufe 3 bei ihrer nächsten Karte                               |
| Katzen-Segen | deine Katze auf der Karte sammelt ab jetzt passiv einen Punkt alle fünf Minuten       |

Die Wirkung steht im Code, nicht in der Datendatei, weil sie am Zustand
arbeitet.

---

## Rollen

| Rolle      | Bedeutung                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `guest`    | der Normalfall                                                            |
| `birthday` | das Geburtstagskind; bekommt Karten, die nur für diese Rolle gedacht sind |
| `host`     | organisatorisch                                                           |

Die Rolle wird **nicht** beim Beitritt vergeben, sondern vom Host im Admin
gesetzt. Sonst erklärt sich jeder zum Geburtstagskind.

> Wichtig: Solange niemand die Rolle `birthday` hat, bleiben die dafür
> reservierten Karten den ganzen Abend ungezogen im Stapel liegen. Die
> Checkliste im Admin weist darauf hin.

---

## Spielende und Auswertung

Der Host beendet das Spiel von Hand. Dann friert die Auswertung ein.

**Die Top 3** bekommen die Preise aus `prizes.json`.

**Alle anderen** landen in der Verlierertabelle und werden von oben nach unten
in Stufen geteilt. Je weiter unten, desto härter.

| Stufe               | wer                  |
| ------------------- | -------------------- |
| Knapp vorbei        | die besten Verlierer |
| Mitläufer           |                      |
| Solide enttäuschend |                      |
| Endboss der Schande | der letzte Platz     |

Die Anzahl der Stufen passt sich der Gruppengröße an, damit keine leer bleibt:

| Verlierer      | Stufen                        |
| -------------- | ----------------------------- |
| 8 oder mehr    | 4                             |
| 5 bis 7        | 3                             |
| 3 bis 4        | 2                             |
| 2 oder weniger | 1, alle bekommen die härteste |

Bei Punktgleichstand entscheidet, wer den Stand **früher** erreicht hat.

Die Zuordnung Stufe zu Strafe läuft über den exakten Namen der Stufe in
`punishments.json`. Ein Tippfehler dort bedeutet, dass jemand am Ende des
Abends nichts angezeigt bekommt; `npm run lint:data` prüft das.

---

## Was der Host kann

Alles, ohne Neustart und ohne Terminal, unter `/admin`:

- Punkte korrigieren, Rollen setzen, Leute pausieren
- offene Abnahmen selbst entscheiden, wenn ein Beobachter nicht reagiert
- Wetten entscheiden und Streit auflösen
- Sonderaufträge von Hand auslösen oder abbrechen
- **jedes Ereignis streichen**; die Punkte werden aus dem Protokoll neu
  gerechnet, es geht nichts verloren
- Karten schreiben, bearbeiten, deaktivieren, importieren, exportieren
- alle Stellschrauben zur Laufzeit ändern
- Spielstand sichern, Spickzettel drucken, Rückblick öffnen
- Runde beenden, die Auswertung erscheint auf allen Geräten
