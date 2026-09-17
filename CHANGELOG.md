# Changelog

Die Versionsnummern zählen den Stand des Spielkonzepts, nicht ein
Veröffentlichungsdatum. Die Einträge bis 0.5 beschreiben die Konzeptphase, ab
0.6 die tatsächliche Umsetzung.

## 0.8 (2026-09-17)

Vorbereitung als öffentliches Repository.

- Dokumentation nach `docs/` aufgeteilt: Architektur, Regeln, Inhalte, Betrieb,
  Aussehen. Das interne Planungsdokument und die Design-Übergabe sind nicht mehr
  Teil des Repositorys.
- MIT-Lizenz, `CONTRIBUTING.md`, `.editorconfig`, GitHub-Actions-Ablauf für
  Inhaltsprüfer, beide Testsuiten und den Build.
- Die acht Schriftdateien waren nur zwei verschiedene, viermal dupliziert. Auf
  zwei reduziert, `fetch-assets.mjs` legt sie künftig gleich so ab.
  532 kB auf 134 kB.

## 0.7 (2026-09-16)

Betrieb und Sicherheit.

**Für den Gastgeber**

- Checkliste im Admin: Karten, die für eine Rolle reserviert sind, die niemand
  hat; Shop-Items mit unbekannter Wirkung; Abnahmen ohne Reaktion; strittige
  Wetten; leere Kataloge; abgeschaltete Bereiche.
- Druckbarer Spickzettel unter `/spickzettel`.
- Rückblick auf den Abend unter `/rueckblick`: Endstand, Titel, bester und
  teuerster Moment, Verlaufskurve, der ganze Abend als Liste.
- Spielstand als Datei herunterladen.
- `npm run probelauf`: zweiter Server auf Port 3001 mit eigener Kopie der
  Karten.

**Robustheit**

- Reconnect klopft beim Aufwachen an und verbindet ohne Antwort neu; iOS meldet
  den Abbruch nicht zuverlässig.
- Zufallsanteil in der Wartezeit, damit nach einem Serverneustart nicht alle
  Handys im Gleichtakt anklopfen.
- Immer nur eine Verbindung gleichzeitig; die alte wird abgeklemmt.
- Unerwartete Fehler im Server werden aufgefangen statt den Prozess zu beenden.
- Auffangnetz für Anzeigefehler im Client statt einer weißen Seite.
- Stündliche Zwischenstände des Spielstands, die letzten zwölf.
- Bremse nach drei falschen PIN-Versuchen, pro Verbindung.

**Tempo**

- Punkte aller Spieler in einem Durchlauf durch das Protokoll statt zwei
  Durchläufen pro Spieler.
- Der öffentliche Teil des Snapshots wird pro Rundruf einmal gebaut statt pro
  Gerät. Bei 6000 Ereignissen: 25,4 ms auf 3,8 ms.

**Prüfung**

- `npm run lint:data` vergleicht die Inhalte mit dem, was der Code daraus macht.
- Beide Testsuiten arbeiten über `BBB_DATA_DIR` auf einer Kopie und können
  echte Daten nicht mehr beschädigen.

## 0.6 (2026-09-12)

Das Konzeptdokument an die fertige Umsetzung angeglichen.

- Escrow ersatzlos gestrichen, der Wetteinsatz wird direkt abgezogen.
- Stufen heißen nur noch 1, 2, 3 statt Chill, Spicy, Unhinged.
- Reroll auf drei **pro Karte** begrenzt statt auf den Abend.
- „Der Ruf" heißt jetzt Sonderauftrag und lässt sich wegklappen.
- Special Cards kommen über eine niedrige Wahrscheinlichkeit statt über ein
  Intervall.
- Neu: Preise für die Top 3, vier Strafen nach Härtegrad, Karten nur für das
  Geburtstagskind, Kartenanlage im Admin mit Namensprüfung.

**Behoben**

- Die Verlierer-Stufen waren invertiert: der beste Verlierer bekam „Endboss der
  Schande", der letzte Platz „Knapp vorbei".
- Gekaufte Effekte ließen sich per Reroll abschütteln. Eine Zwangsstufe für 30
  Punkte kostete so nur einen Würfelwurf, und bezahlte Effekte gingen still
  verloren.

## 0.5 (2026-09-08)

Sonderauftrag (25 Punkte, zufällig getimt, kostenlos ablehnbar), Black Market
mit Wetten, Shop mit Effekt-Items, neuer Markt-Tab. Festgehalten, dass es ohne
HTTPS keine Push-Benachrichtigungen geben kann.

## 0.4 (2026-09-08)

Kein Zugsystem mehr, durchgängig paralleles Spiel. Der Beobachter wird zufällig
zugewiesen. Reroll-Kosten skalieren. Spieler-App als Tab-Navigation mit eigenem
Beobachtung-Tab.

## 0.3 (2026-09-08)

Aufgabenkatalog als eigenes, späteres Arbeitspaket ausgelagert.

## 0.2 (2026-09-08)

Beobachter-Prinzip als Kernmechanik: Bestätigung durch eine andere Person statt
Selbst-Abhaken. Perzentil-Fallback nach Gruppengröße.

## 0.1 (2026-09-08)

Erstfassung: Spielkonzept, Datenmodell, Screens, Technik-Setup.
