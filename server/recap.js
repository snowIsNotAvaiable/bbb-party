/**
 * Der Rückblick auf den Abend, erreichbar unter /rueckblick.
 *
 * Alles hier wird aus dem Event-Log gerechnet, nichts wird zusätzlich
 * gespeichert. Die Seite funktioniert deshalb auch mitten in der Party, dann
 * eben als Zwischenstand, und sie funktioniert noch Wochen später, solange
 * state.json existiert.
 *
 * Gedacht ist sie für den Morgen danach: Endstand, ein paar Titel, die sich
 * aus dem Log ableiten lassen, und der Abend als durchlesbare Liste.
 */

import { esc, shell } from './page.js';

const MIN = 60 * 1000;

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

function dauer(ms) {
  const min = Math.round(ms / MIN);
  const minuten = (n) => `${n} ${n === 1 ? 'Minute' : 'Minuten'}`;
  const stunden = (n) => `${n} ${n === 1 ? 'Stunde' : 'Stunden'}`;
  if (min < 60) return minuten(min);
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${stunden(h)} ${minuten(r)}` : stunden(h);
}

/**
 * Ereignisse, die von allein passieren. Sie taugen nicht als Lebenszeichen:
 * der Server bietet die ganze Nacht weiter Sonderaufträge an, auch wenn längst
 * alle schlafen, und die laufen dann von selbst ab.
 */
const VON_ALLEIN = new Set([
  'SPECIAL_TICK',
  'WILDCARD_OFFERED',
  'WILDCARD_DECLINED',
  'WILDCARD_EXPIRED',
  'EFFECT_EXPIRED',
  'POOL_RESHUFFLED',
  'BET_EXPIRED',
]);

/**
 * Das Log läuft oft über mehrere Tage, weil der Server zwischen den Abenden
 * einfach weiterläuft. Für den Rückblick zählt der Block, in dem wirklich
 * gespielt wurde: Ereignisse, zwischen denen keine lange Pause liegt.
 */
function letzterAbend(events, luecke = 3 * 60 * MIN) {
  const echte = events.filter((e) => !VON_ALLEIN.has(e.type));
  if (!echte.length) return [];

  // Anfang des letzten zusammenhängenden Blocks suchen, gemessen nur an dem,
  // was jemand auch wirklich getippt hat.
  let start = 0;
  for (let i = 1; i < echte.length; i += 1) {
    if (Date.parse(echte[i].ts) - Date.parse(echte[i - 1].ts) > luecke) start = i;
  }
  const von = Date.parse(echte[start].ts);
  const bis = Date.parse(echte[echte.length - 1].ts);

  // Innerhalb des Fensters zählt dann wieder alles, auch die abgelaufenen
  // Sonderaufträge: die gehören zum Abend dazu.
  return events.filter((e) => {
    const t = Date.parse(e.ts);
    return t >= von && t <= bis && e.type !== 'SPECIAL_TICK';
  });
}

/**
 * Ein Titel bekommt nur, wer ihn sich auch verdient hat.
 *
 * Die Titel sind bewusst geschlechtsneutral formuliert. „Der Fleißige" über
 * einem Frauennamen liest sich falsch, und die Seite hängt am Ende an der
 * Kühlschranktür.
 */
function titel(label, beschreibung, kandidaten, minimum = 1) {
  const best = kandidaten.filter((k) => k.wert >= minimum).sort((a, b) => b.wert - a.wert)[0];
  if (!best) return null;
  const einheit = best.wert === 1 ? best.einzahl || best.einheit : best.einheit;
  return { label, beschreibung, name: best.name, wert: best.wert, einheit: einheit || '' };
}

export function recap({ game, config }) {
  const alle = game.state.events.filter((e) => !e.voided);
  const abend = letzterAbend(alle);
  const namen = {};
  for (const p of game.state.players) namen[p.id] = p.name;
  const name = (id) => namen[id] || 'Unbekannt';

  const ranking = game.ranking();
  const von = abend.length ? abend[0].ts : null;
  const bis = abend.length ? abend[abend.length - 1].ts : null;

  /* ── Zählwerk ───────────────────────────────────────────── */

  const z = {};
  const bump = (pid, key, n = 1) => {
    if (!pid) return;
    z[pid] = z[pid] || {};
    z[pid][key] = (z[pid][key] || 0) + n;
  };

  let groessterGewinn = null;
  let groessterVerlust = null;

  for (const e of abend) {
    const pid = e.playerId;
    switch (e.type) {
      case 'TASK_CONFIRMED':
        bump(pid, 'erledigt');
        if (e.level === 10) bump(pid, 'stufe3');
        if (e.level === 1) bump(pid, 'stufe1');
        break;
      case 'TASK_REJECTED':
        bump(pid, 'abgelehnt');
        break;
      case 'REROLL':
        bump(pid, 'rerolls');
        break;
      case 'WILDCARD_CONFIRMED':
        bump(pid, 'sonderauftraege');
        break;
      case 'WILDCARD_DECLINED':
        bump(pid, 'gekniffen');
        break;
      case 'SHOP_PURCHASE':
        bump(pid, 'kaeufe');
        bump(pid, 'ausgegeben', Math.abs(e.delta || 0));
        break;
      case 'SPECIAL_PLAYED':
        bump(pid, 'specials');
        break;
      default:
        break;
    }
    const d = e.delta || 0;
    if (pid && d > 0 && (!groessterGewinn || d > groessterGewinn.delta)) groessterGewinn = { ...e, delta: d };
    if (pid && d < 0 && (!groessterVerlust || d < groessterVerlust.delta)) groessterVerlust = { ...e, delta: d };
  }

  // Wer als Beobachter wie oft bestätigt und wie oft abgelehnt hat.
  for (const c of game.state.claims) {
    if (c.status === 'confirmed') for (const id of c.observerIds) bump(id, 'abgenommen');
    if (c.status === 'rejected') for (const id of c.observerIds) bump(id, 'verweigert');
  }

  const w = (pid, key) => z[pid]?.[key] || 0;
  const kandidaten = (key, einheit, einzahl) =>
    game.state.players.map((p) => ({ name: p.name, wert: w(p.id, key), einheit, einzahl }));

  const titles = [
    titel('Rampensau', 'die meisten Aufgaben auf Stufe 3', kandidaten('stufe3', '× Stufe 3'), 2),
    titel('Arbeitstier', 'die meisten erledigten Aufgaben', kandidaten('erledigt', 'Aufgaben', 'Aufgabe'), 3),
    titel('Angsthase', 'die meisten Rerolls', kandidaten('rerolls', 'Rerolls', 'Reroll'), 2),
    titel('Sicher ist sicher', 'am liebsten Stufe 1', kandidaten('stufe1', '× Stufe 1'), 3),
    titel('Wort gehalten', 'die meisten angenommenen Sonderaufträge', kandidaten('sonderauftraege', 'Sonderaufträge', 'Sonderauftrag'), 1),
    titel('Lieber nicht', 'die meisten abgelehnten Sonderaufträge', kandidaten('gekniffen', '× abgelehnt'), 3),
    titel('Shop-Rekord', 'die meisten Punkte im Shop gelassen', kandidaten('ausgegeben', 'Punkte', 'Punkt'), 10),
    titel('Strenges Auge', 'als Beobachtung am häufigsten abgelehnt', kandidaten('verweigert', '× abgelehnt'), 1),
    titel('Mildes Auge', 'als Beobachtung am häufigsten bestätigt', kandidaten('abgenommen', 'Abnahmen', 'Abnahme'), 3),
    titel('Hartes Los', 'die meisten abgelehnten eigenen Aufgaben', kandidaten('abgelehnt', '× nicht anerkannt'), 2),
  ].filter(Boolean);

  /* ── Verlauf ────────────────────────────────────────────── */

  const feed = abend.filter((e) => e.feed);
  const stunden = new Map();
  for (const e of feed) {
    const k = new Date(e.ts);
    k.setMinutes(0, 0, 0);
    stunden.set(k.getTime(), (stunden.get(k.getTime()) || 0) + 1);
  }
  const verlauf = [...stunden.entries()].sort((a, b) => a[0] - b[0]);
  const maxStunde = Math.max(1, ...verlauf.map(([, n]) => n));

  const gespielt = abend.filter((e) => e.type === 'TASK_CONFIRMED').length;
  const gezogen = abend.filter((e) => e.type === 'CARD_DRAWN').length;
  const punkteGesamt = ranking.reduce((sum, p) => sum + Math.max(0, p.score), 0);

  /* ── Seite ──────────────────────────────────────────────── */

  const leer = !abend.length;

  const body = `
  <h1>${esc(config.partyTitle)}</h1>
  <p class="lead">${
    leer
      ? 'Noch ist nichts passiert. Sobald die erste Karte gezogen wird, steht hier etwas.'
      : `${esc(fmtDate(von))}, ${esc(fmtTime(von))} bis ${esc(fmtTime(bis))} Uhr. ${esc(dauer(Date.parse(bis) - Date.parse(von)))} Party.`
  }</p>

  ${
    leer
      ? ''
      : `
  <div class="card">
    <h2>Der Abend in Zahlen</h2>
    <div class="big">
      <div><span>Mitgespielt</span><b>${ranking.length}</b></div>
      <div><span>Karten gezogen</span><b>${gezogen}</b></div>
      <div><span>Aufgaben geschafft</span><b>${gespielt}</b></div>
      <div><span>Punkte verteilt</span><b>${punkteGesamt}</b></div>
    </div>
  </div>

  <div class="card">
    <h2>Endstand</h2>
    <table>
      <tr><th></th><th>Wer</th><th class="right">Punkte</th><th class="right">Aufgaben</th><th class="right">Rerolls</th></tr>
      ${ranking
        .map((p, i) => {
          const medaille = ['🥇', '🥈', '🥉'][i] || '';
          return `<tr>
            <td class="num">${medaille || i + 1}</td>
            <td><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="rule">(pausiert)</span>'}</td>
            <td class="right"><b>${p.score}</b></td>
            <td class="right">${w(p.id, 'erledigt')}</td>
            <td class="right">${w(p.id, 'rerolls')}</td>
          </tr>`;
        })
        .join('')}
    </table>
  </div>

  ${
    titles.length
      ? `<div class="card">
    <h2>Titel, die sich niemand ausgesucht hat</h2>
    <table>
      ${titles
        .map(
          (t) => `<tr>
        <td class="num">${esc(t.label)}</td>
        <td><b>${esc(t.name)}</b><br><span class="rule">${esc(t.beschreibung)}: ${t.wert} ${esc(t.einheit)}</span></td>
      </tr>`,
        )
        .join('')}
    </table>
  </div>`
      : ''
  }

  <div class="grid">
    ${
      groessterGewinn
        ? `<div class="card">
      <h2>Der beste Moment</h2>
      <p class="rule" style="margin-bottom:4px"><b>${esc(name(groessterGewinn.playerId))}</b>, ${esc(fmtTime(groessterGewinn.ts))} Uhr</p>
      <p class="rule" style="margin-bottom:0">${esc(groessterGewinn.feed?.text || groessterGewinn.type)}, plus ${groessterGewinn.delta} Punkte.</p>
    </div>`
        : ''
    }
    ${
      groessterVerlust
        ? `<div class="card">
      <h2>Der teuerste Moment</h2>
      <p class="rule" style="margin-bottom:4px"><b>${esc(name(groessterVerlust.playerId))}</b>, ${esc(fmtTime(groessterVerlust.ts))} Uhr</p>
      <p class="rule" style="margin-bottom:0">${esc(groessterVerlust.feed?.text || groessterVerlust.type)}, ${groessterVerlust.delta} Punkte.</p>
    </div>`
        : ''
    }
  </div>

  ${
    verlauf.length > 1
      ? `<div class="card">
    <h2>Wann war was los</h2>
    <table>
      ${verlauf
        .map(([t, n]) => {
          const balken = '█'.repeat(Math.max(1, Math.round((n / maxStunde) * 18)));
          return `<tr><td class="num">${esc(fmtTime(t))}</td><td class="num" style="color:#9c4f76">${balken}</td><td class="right">${n}</td></tr>`;
        })
        .join('')}
    </table>
    <p class="rule" style="margin: 10px 0 0">Ereignisse pro Stunde, also wie voll der Feed war.</p>
  </div>`
      : ''
  }

  <div class="card page-break">
    <h2>Der Abend, von vorne</h2>
    <table>
      ${feed
        .slice()
        .reverse()
        .map(
          (e) => `<tr>
        <td class="num">${esc(fmtTime(e.ts))}</td>
        <td>${esc(e.feed.icon || '')} ${esc(e.feed.text)}${e.delta ? ` <span class="rule">(${e.delta > 0 ? '+' : ''}${e.delta})</span>` : ''}</td>
      </tr>`,
        )
        .join('')}
    </table>
  </div>
  `
  }

  <footer>
    Gerechnet aus ${alle.length} Ereignissen im Spielprotokoll. Diese Seite entsteht bei jedem Aufruf neu;
    gestrichene Ereignisse zählen nicht mit.
  </footer>
  `;

  return shell({ title: `Rückblick · ${config.partyTitle}`, body });
}
