# Der Abend

Wie man die App tatsächlich betreibt. Geschrieben für die Person, die am Abend
das MacBook aufklappt.

---

## Das eigentliche Risiko ist das Netz, nicht die App

Die App braucht kein Internet. Sie braucht ein lokales Netz, in dem MacBook und
alle Handys hängen. Drei Wege dorthin:

| Weg | Vorgehen | Bewertung |
|---|---|---|
| **Handy-Hotspot** (empfohlen) | Ein Handy spannt den Hotspot auf, MacBook **und** Gäste verbinden sich damit. Mobile Daten dürfen aus sein, das lokale Netz funktioniert trotzdem. | Zuverlässigste Variante, iOS und Android machen beide mit |
| **Vorhandenes WLAN** | Alle im selben Heimnetz | Geht, wenn die Gastgeberwohnung eines hat und keine Client-Isolation aktiv ist |
| **Reise-Router** | Kleiner Travel-Router, MacBook per Kabel dran | Am stabilsten, braucht aber Hardware |

Ein macOS-Ad-hoc-Netz („Netzwerk erstellen") funktioniert, wird aber von
manchen Handys schlecht angenommen. Nicht als einzigen Plan einpacken.

**Der Zugang läuft immer über die IP-Adresse**, nie über einen
`.local`-Hostnamen: mDNS ist auf Android unzuverlässig. Der Server bindet
deshalb auf `0.0.0.0` und druckt beim Start alle erreichbaren Adressen.

---

## Starten

```bash
npm install
npm run assets     # Inter einmalig lokal ablegen, braucht Internet
npm run party      # baut den Client und startet den Server
```

Der Start druckt die Adressen, die PIN und einen QR-Code ins Terminal und legt
`qr-party.png` zum Ausdrucken ab.

| Wer | Adresse |
|---|---|
| Gäste | `http://<LAN-IP>:3000` |
| Host | `http://<LAN-IP>:3000/admin` |

`localhost` funktioniert **nur** auf dem MacBook selbst. Die Handys brauchen
die IP.

Die Host-PIN steht in `DEFAULTS` in `server/config.js` und lässt sich im Admin
unter **Spiel** ändern. Der Standardwert ist in jedem Klon derselbe; wer das
Repository benutzt, sollte ihn einmal austauschen.

Die Startausgabe meldet außerdem, wie viele Karten im Katalog liegen und ob
eine `data/config.json` von den Standardwerten abweicht. Eine vergessene
Einstellung fällt so auf, bevor der erste Gast zieht, und nicht erst dann, wenn
den ganzen Abend keine Special Card kommt.

---

## Vorher abhaken

- [ ] MacBook am Strom, Ruhezustand auf „nie". Sonst stirbt der Server mitten im Spiel.
- [ ] macOS-Firewall für Node freigeben, sonst kommt kein Handy durch.
- [ ] QR-Code ausdrucken und an zwei, drei Stellen aufhängen.
- [ ] `http://<LAN-IP>:3000/spickzettel` ausdrucken und neben das MacBook legen.
- [ ] Mit zwei fremden Handys testen: `npm run probelauf`, dann Beitritt, Karte ziehen, Abnahme. Läuft auf Port 3001 mit eigener Kopie der Karten, der echte Spielstand bleibt unberührt.
- [ ] **Dem Geburtstagskind im Admin die Rolle „Geburtstagskind" geben.** Sonst bleiben die dafür reservierten Karten den ganzen Abend im Stapel liegen.
- [ ] Den Katalog einmal durchscrollen. Passt alles zu dieser Runde?
- [ ] `npm test` laufen lassen.

---

## Die Checkliste im Admin

Oben im Abschnitt **Spieler** steht, was am Abend still schiefgehen kann. Der
Server rechnet sie bei jeder Änderung neu. Steht dort nichts, ist alles in
Ordnung.

Geprüft werden unter anderem:

- Karten, die für eine Rolle reserviert sind, die niemand hat
- Shop-Items mit einer Wirkung, die die Engine nicht kennt
- Abnahmen, auf die seit über zwanzig Minuten niemand reagiert hat
- strittige Wetten, leere Kataloge, abgeschaltete Bereiche

---

## Wenn etwas hakt

| Problem | Handgriff |
|---|---|
| Handy zeigt nichts | Seite neu laden. Der Spielstand liegt auf dem Server, nichts geht verloren. |
| Kommt nicht rein | Falsches WLAN, oder es wurde `localhost` statt der IP getippt. |
| Abnahme hängt | Admin, **Freigeben**: selbst bestätigen oder ablehnen. |
| Wette strittig | Admin, **Freigeben**: Sieger festlegen. |
| Karte unpassend | Admin, **Karten**: antippen schaltet sie ab. Wirkt sofort für alle. |
| Punkte falsch | Admin, **Protokoll**: das Ereignis streichen. Die Punkte werden neu gerechnet. |
| Jemand geht | Admin, **Spieler**: pausieren. Dann wird die Person nicht mehr als Beobachter gezogen. |
| Server abgestürzt | Im Terminal `npm start`. Der Spielstand wird von der Platte geladen. |
| Alles kaputt | Admin, **Spiel**: Spielstand sichern. **Erst danach** zurücksetzen. |

Ein Fehler im Server beendet ihn nicht mehr. Er wird im Terminal gemeldet, der
Spielstand gesichert, und es läuft weiter. Wenn dort etwas steht, lohnt ein
Blick ins Admin-Protokoll, ob die letzte Aktion angekommen ist.

---

## Sicherungen

| Was | Wo |
|---|---|
| laufender Spielstand | `server/data/state.json` |
| letzte Sicherung | `server/data/state.backup.json`, höchstens eine Minute alt |
| Stand pro Stunde | `server/data/snapshots/`, die letzten zwölf |
| Download | Admin, **Spiel**, „Spielstand sichern" |

Zum Zurückspielen: Server stoppen, die gewünschte Datei nach
`server/data/state.json` kopieren, `npm start`.

---

## Danach

`http://<LAN-IP>:3000/rueckblick` rechnet aus dem Protokoll den Endstand, ein
paar Titel, den besten und den teuersten Moment, eine Kurve, wann am meisten
los war, und den ganzen Abend als durchlesbare Liste. Nichts davon wird
gespeichert, die Seite entsteht bei jedem Aufruf neu. Sie funktioniert auch
schon mittendrin als Zwischenstand.

Die Seite erkennt selbst, welcher Block im Protokoll der letzte Abend war.
Ereignisse, die von allein passieren (Sonderaufträge, die nachts um vier
ablaufen), zählen dabei nicht als Lebenszeichen.

---

## Zwei Sätze für den Anfang

Die App kann viel, aber das hier nicht:

> „Niemand muss etwas trinken. Wer eine Aufgabe nicht will, rerollt sie oder
> lässt sie einfach liegen."

> „Wasser steht da drüben, und es gibt nichts zu gewinnen, wofür sich das
> Kotzen lohnt."

Beides steht auch auf dem Spickzettel.
