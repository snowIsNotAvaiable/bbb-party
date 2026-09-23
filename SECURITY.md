# Sicherheit

## Was diese App ist, und was sie nicht ist

BBB ist für ein **lokales WLAN mit einer Handvoll Freunden** gebaut. Das
Bedrohungsmodell ist „jemand ist betrunken und tippt Unsinn", nicht „jemand
greift den Server an".

Daraus folgt, was bewusst fehlt. Das sind keine Lücken, sondern Entscheidungen:

| Fehlt                               | Warum                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Authentifizierung                   | Ein zufälliger Token im `localStorage` erkennt den Spieler wieder. Wer den Token einer anderen Person hat, ist diese Person. |
| Verschlüsselung                     | Alles läuft über `http://`. Ohne HTTPS gibt es auch keine Push-Benachrichtigungen.                                           |
| Autorisierung über die PIN hinaus   | Die Host-Konsole hängt an einer vierstelligen PIN mit einer Bremse nach drei Fehlversuchen. Ein Passwort ist das nicht.      |
| Rate Limiting auf Spieleraktionen   | Ein Gast kann so schnell tippen, wie er will.                                                                                |
| Absicherung gegen Denial of Service | Der Server ist ein Node-Prozess ohne Reverse Proxy.                                                                          |

**Stelle diese App niemals ins offene Internet.** Sie bindet absichtlich auf
`0.0.0.0`, damit die Handys im lokalen Netz sie erreichen. Hinter einem
Port-Forward wäre die Host-Konsole für jeden erreichbar, der die PIN rät, und
jeder Gastname wäre öffentlich lesbar.

## Was trotzdem abgesichert ist

Die Dinge, die innerhalb des Bedrohungsmodells zählen:

- **Der Server glaubt dem Client nichts.** Jede Regel, jeder Zufall und jede
  Punktzahl entsteht serverseitig. Ein manipulierter Client kann keine Punkte
  erzeugen, keine Stufe umgehen und keinen Aufgabentext vorzeitig sehen.
- **Der Aufgabentext geht erst nach der Stufenwahl über die Leitung.** Wer das
  WebSocket-Protokoll mitliest, sieht ihn wirklich nicht vorher.
- **Host-Aktionen prüfen `ws.kind === 'admin'`** bei jeder einzelnen Nachricht,
  nicht nur beim Anmelden.
- **Die PIN-Bremse gilt pro Verbindung**, damit ein Vertipper des Gastgebers
  niemanden aussperrt.
- **Alle Inhalte werden beim Rendern der gedruckten Seiten maskiert**
  (`esc()` in `server/page.js`).
- **Schreibvorgänge auf die Platte sind atomar** (`rename`), mit Sicherungsdatei
  und stündlichen Zwischenständen.

## Eine Lücke melden

Wenn du etwas findest, das **innerhalb** dieses Bedrohungsmodells kaputt ist,
also zum Beispiel:

- ein Gast kann sich Punkte geben, ohne dass ein Beobachter bestätigt
- der Aufgabentext ist vor der Stufenwahl auslesbar
- die Host-Konsole lässt sich ohne die PIN benutzen
- ein Kartentext kann Code im Browser eines anderen Gastes ausführen

dann mach bitte ein Issue auf. Das Projekt ist ein Partyspiel, es gibt keine
Nutzerkonten und keine Zahlungsdaten; eine vertrauliche Meldung ist deshalb
nicht nötig.

## Personenbezogene Daten

Die App speichert **Vornamen oder Spitznamen**, die Gäste selbst eintragen, und
ein vollständiges Protokoll dessen, was sie im Spiel getan haben. Das liegt als
Klartext in `server/data/state.json` auf dem Rechner des Gastgebers.

Für den Gastgeber heißt das:

- `state.json`, `state.backup.json` und `server/data/snapshots/` sind
  gitignoriert. Sie gehören in kein Repository und in keinen Issue-Anhang.
- Der Rückblick unter `/rueckblick` ist für jeden im WLAN erreichbar und zeigt
  alle Namen. Das ist auf einer Party gewollt, in einem Büro vermutlich nicht.
- Nach der Party: `server/data/state.json` löschen, dann ist der Abend weg.
  Eine neue Party startet auf einem leeren Protokoll.
- `qr-party.png` enthält die lokale IP-Adresse des Rechners.

## Unterstützte Versionen

Das Projekt hat keine Release-Zweige. Gepflegt wird `main`, und es braucht
Node 20 oder neuer.
