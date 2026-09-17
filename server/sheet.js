/**
 * Der Spickzettel für den Host, erreichbar unter /spickzettel.
 *
 * Eine einzelne HTML-Seite ohne Skript, ohne externe Schrift und ohne Bilder:
 * Sie muss auch dann noch lesbar sein, wenn das WLAN weg ist, und sie muss
 * sauber auf zwei A4-Seiten drucken. Die Zahlen holt sie sich zur Laufzeit aus
 * Konfiguration und Katalog, damit ein Ausdruck nie etwas anderes behauptet
 * als die laufende App.
 */

import { esc, shell } from './page.js';

function row(a, b) {
  return `<tr><td class="num">${esc(a)}</td><td>${esc(b)}</td></tr>`;
}

export function cheatSheet({ url, pin, config, catalog }) {
  const cfg = config;
  const cards = catalog.enabled('cards');
  const prizes = catalog.enabled('prizes').slice().sort((a, b) => a.place - b.place);
  const punishments = catalog.enabled('punishments');
  const shop = catalog.enabled('shopItems').slice().sort((a, b) => a.price - b.price);

  const heute = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const scaling = cfg.rerollScaling === 'exponential' ? 'verdoppelt sich jedes Mal' : 'steigt mit jedem Versuch um eins';

  const body = `

  <h1>Spickzettel für den Abend</h1>
  <p class="lead">${esc(cfg.partyTitle)}, ${esc(cfg.partyAge)}. Geburtstag. Stand: ${esc(heute)}. Ausdrucken und neben das MacBook legen.</p>

  <div class="card">
    <h2>Die drei Angaben, nach denen gefragt wird</h2>
    <div class="big">
      <div><span>Für die Gäste</span><b>${esc(url)}</b></div>
      <div><span>Host-Admin</span><b>${esc(url)}/admin</b></div>
      <div><span>PIN</span><b>${esc(pin)}</b></div>
    </div>
    <p class="rule" style="margin-top:12px">
      Die Handys brauchen diese Adresse, <b>localhost</b> funktioniert nur auf dem MacBook selbst.
      Alle müssen im selben WLAN hängen. Der QR-Code liegt als <b>qr-party.png</b> im Projektordner.
    </p>
  </div>

  <div class="grid">
    <div class="card">
      <h2>In einer Minute erklärt</h2>
      <ul class="rule">
        <li>Jeder spielt gleichzeitig, es gibt keine Reihenfolge und kein Warten.</li>
        <li>Karte ziehen, dann <b>blind</b> die Stufe wählen: du siehst den Text erst danach.</li>
        <li>Die App zieht eine zufällige Person als Beobachter. Die nimmt ab, nicht der Host.</li>
        <li>Erledigt und bestätigt gibt Punkte, abgelehnt kostet.</li>
        <li>Am Ende gibt es ein Podium und für alle anderen eine Strafe nach Platzierung.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Was was zählt</h2>
      <table>
        <tr><th>Punkte</th><th>Wofür</th></tr>
        ${row('1', 'Stufe 1, traut sich jeder')}
        ${row('5', 'Stufe 2, kostet Überwindung')}
        ${row('10', 'Stufe 3, davon erzählt man noch')}
        ${row(String(cfg.wildcardPoints), 'Sonderauftrag, blind angenommen')}
        ${row('bis ' + cfg.betStakeCap, 'Wetteinsatz im Black Market')}
      </table>
    </div>

    <div class="card">
      <h2>Reroll</h2>
      <p class="rule">
        ${esc(cfg.rerollLimitPerCard)} Versuche pro Karte. Gewürfelt wird ein Würfel, der Verlust ${esc(scaling)}:
        beim ersten Reroll die Augenzahl mal eins, beim zweiten mal zwei, beim dritten mal drei.
      </p>
      <p class="rule" style="margin-bottom:0">
        Eine gekaufte Zwangsstufe und ein gekaufter Peek überleben den Reroll. Das ist Absicht:
        sonst wäre ein teures Item für ein paar Punkte wegzuwerfen.
      </p>
    </div>

    <div class="card">
      <h2>Nebenbei läuft</h2>
      <ul class="rule">
        <li><b>Sonderauftrag:</b> alle ${esc(cfg.wildcardIntervalMinMin)} bis ${esc(cfg.wildcardIntervalMaxMin)} Minuten bekommt jemand ein Angebot und muss blind zusagen. ${esc(cfg.wildcardTimeoutMin)} Minuten Zeit.</li>
        <li><b>Shop:</b> Punkte gegen Vorteile und Gemeinheiten, ${esc(shop.length)} Angebote.</li>
        <li><b>Black Market:</b> Wetten untereinander, Einsatz höchstens ${esc(cfg.betStakeCap)} Punkte.</li>
        <li><b>Special Cards:</b> seltene Karten, die statt einer Aufgabe kommen.</li>
      </ul>
    </div>
  </div>

  <div class="card warn">
    <h2>Zwei Sätze, die du am Anfang sagst</h2>
    <p class="rule" style="margin-bottom:6px">
      „Niemand muss etwas trinken. Wer eine Aufgabe nicht will, rerollt sie oder lässt sie einfach liegen."
    </p>
    <p class="rule" style="margin-bottom:0">
      „Wasser steht da drüben, und es gibt nichts zu gewinnen, wofür sich das Kotzen lohnt."
    </p>
  </div>

  <div class="card page-break">
    <h2>Wenn etwas hakt</h2>
    <table>
      <tr><th>Problem</th><th>Handgriff</th></tr>
      <tr><td class="num">Handy zeigt nichts</td><td>Seite neu laden. Der Spielstand liegt auf dem Server, nichts geht verloren.</td></tr>
      <tr><td class="num">Kommt nicht rein</td><td>Falsches WLAN. Adresse oben prüfen, nicht localhost.</td></tr>
      <tr><td class="num">Abnahme hängt</td><td>Admin, Abschnitt <b>Freigeben</b>: selbst bestätigen oder ablehnen.</td></tr>
      <tr><td class="num">Wette strittig</td><td>Admin, <b>Freigeben</b>: Sieger festlegen.</td></tr>
      <tr><td class="num">Karte unpassend</td><td>Admin, <b>Karten</b>: antippen schaltet sie ab. Wirkt sofort für alle.</td></tr>
      <tr><td class="num">Punkte falsch</td><td>Admin, <b>Protokoll</b>: das Ereignis streichen. Oder unter <b>Spieler</b> von Hand korrigieren.</td></tr>
      <tr><td class="num">Jemand geht</td><td>Admin, <b>Spieler</b>: pausieren. Dann wird die Person nicht mehr als Beobachter gezogen.</td></tr>
      <tr><td class="num">Server abgestürzt</td><td>Im Terminal <b>npm start</b>. Der Spielstand wird von Platte geladen.</td></tr>
      <tr><td class="num">Alles kaputt</td><td>Admin, <b>Spiel</b>: Spielstand sichern. Erst danach zurücksetzen.</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Vor dem ersten Zug abhaken</h2>
    <ul class="rule">
      <li>Buki unter <b>Spieler</b> die Rolle <b>Geburtstagskind</b> geben. Sonst bleiben ihre eigenen Karten im Stapel liegen.</li>
      <li>Ruhezustand des MacBooks auf „nie", Netzteil dran.</li>
      <li>Oben im Admin unter <b>Spieler</b> steht, was noch im Argen liegt. Steht dort nichts, ist alles bereit.</li>
      <li>${esc(cards.length)} Karten sind freigeschaltet. Vorher einmal durchscrollen, ob etwas raus soll.</li>
    </ul>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Das bekommt das Podium</h2>
      <table>
        ${prizes.map((p) => `<tr><td class="num">Platz ${esc(p.place)}</td><td><b>${esc(p.title)}</b><br>${esc(p.text || '')}</td></tr>`).join('')}
      </table>
    </div>

    <div class="card">
      <h2>Das bekommt der Rest</h2>
      <table>
        ${punishments
          .slice()
          .sort((a, b) => (a.severity || 0) - (b.severity || 0))
          .map((p) => `<tr><td class="num">${esc(p.label)}</td><td><b>${esc(p.title || '')}</b><br>${esc(p.text || '')}</td></tr>`)
          .join('')}
      </table>
    </div>
  </div>

  <div class="card">
    <h2>Shop-Preise</h2>
    <table>
      ${shop.map((i) => `<tr><td class="num">${esc(i.price)} P</td><td><b>${esc(i.name)}</b> ${esc(i.description || '')}</td></tr>`).join('')}
    </table>
    <p class="rule" style="margin: 10px 0 0">
      Zu billig gekauft? Unter <b>Spiel</b> stehen alle Stellschrauben, Änderungen wirken sofort.
    </p>
  </div>

  <footer>
    Diese Seite entsteht beim Aufruf neu aus der laufenden Konfiguration.
    Nach einer Änderung im Admin einfach ${esc(url)}/spickzettel neu laden.
  </footer>

`;

  return shell({ title: `Spickzettel · ${cfg.partyTitle}`, body });
}
