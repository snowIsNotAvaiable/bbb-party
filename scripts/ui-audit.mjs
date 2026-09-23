/**
 * Geht jeden Screen auf mehreren Handybreiten durch und meldet, was kaputt
 * aussieht: Querlauf, Elemente außerhalb des Bildes, zu kleine Tippziele,
 * abgeschnittene Knopfbeschriftungen, überlaufender Text und Konsolenfehler.
 *
 * Startet sich alles selbst: eigener Server mit eigener Ablage, eigene
 * Testparty, headless Chrome. Der echte Spielstand wird nie angefasst.
 *
 *   npm run audit:ui
 *   npm run audit:ui -- --shots     zusätzlich Screenshots nach /tmp
 *
 * Ohne Chrome bricht das Skript nicht ab, sondern überspringt sich.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv.includes('--shots');
const PORT = 3500 + Math.floor(Math.random() * 300);
const DEBUG_PORT = 9300 + Math.floor(Math.random() * 300);

const WIDTHS = [
  [320, 568, 'iPhone SE 1'],
  [360, 640, 'Android klein'],
  [390, 844, 'iPhone 14'],
  [430, 932, 'iPhone Pro Max'],
];

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.CHROME_PATH,
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.log('[audit] Kein Chrome gefunden, übersprungen.');
  console.log(`[audit] Gesucht in:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  console.log('[audit] Mit CHROME_PATH=/pfad/zu/chrome nachhelfen.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-audit-'));
const shotDir = path.join(tmp, 'shots');
if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

let server = null;
let browser = null;
/**
 * Server und Browser beenden und danach aufräumen. Beide schreiben beim
 * Beenden noch (Spielstand, Chrome-Profil), deshalb erst auf ihr Ende warten.
 */
const cleanup = async () => {
  const ends = [];
  for (const proc of [server, browser]) {
    if (!proc) continue;
    ends.push(
      new Promise((r) => {
        proc.once('exit', r);
        setTimeout(r, 3000);
      }),
    );
    proc.kill('SIGTERM');
  }
  server = null;
  browser = null;
  await Promise.all(ends);
  if (SHOTS) return;
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch {
    /* Das Betriebssystem räumt /tmp selbst auf */
  }
};
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    await cleanup();
    process.exit(130);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* noch nicht so weit */
    }
    if (Date.now() > until) throw new Error(`Timeout: ${what}`);
    await sleep(120);
  }
}

/* ── Server und Testparty ──────────────────────────────────── */

server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  cwd: ROOT,
  stdio: ['ignore', 'ignore', 'pipe'],
  env: {
    ...process.env,
    PORT: String(PORT),
    BBB_STATE_FILE: path.join(tmp, 'state.json'),
    BBB_CONFIG_FILE: path.join(tmp, 'config.json'),
  },
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, 15000, 'Server');

class Client {
  constructor() {
    this.reqId = 1;
    this.pending = new Map();
    this.state = null;
  }

  connect(role = 'player', pin = null) {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ type: 'hello', role, token: this.token, pin }));
        res();
      });
      this.ws.on('error', rej);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'state') this.state = m.state;
        if (m.reqId && this.pending.has(m.reqId)) {
          this.pending.get(m.reqId)(m);
          this.pending.delete(m.reqId);
        }
      });
    });
  }

  send(msg) {
    return new Promise((res) => {
      const i = this.reqId++;
      this.pending.set(i, res);
      this.ws.send(JSON.stringify({ ...msg, reqId: i }));
      setTimeout(() => {
        if (this.pending.has(i)) {
          this.pending.delete(i);
          res({ error: 'timeout' });
        }
      }, 4000);
    });
  }

  act(action, m = {}) {
    return this.send({ type: 'action', action, ...m });
  }

  admin(action, m = {}) {
    return this.send({ type: 'admin', action, ...m });
  }
}

// Lange Namen, große Zahlen, volle Listen: der unbequemste realistische Fall.
const NAMES = [
  'Maximiliane-Charlott',
  'Ben',
  'Cem',
  'Dana',
  'Emre',
  'Finja',
  'Gino',
  'Hana',
  'Ilay',
  'Jo',
  'Kira',
];
const avatar = (i) => ({
  skin: i % 8,
  hair: (i * 3) % 8,
  style: i % 6,
  acc: (i * 2) % 6,
  outfit: (i * 5) % 8,
  fur: i % 12,
  pattern: i % 5,
});

const players = [];
for (const [i, name] of NAMES.entries()) {
  const c = new Client();
  await c.connect();
  const r = await c.send({ type: 'join', name, cfg: avatar(i) });
  c.token = r.token;
  c.playerId = r.playerId;
  await c.act('seenRules');
  players.push(c);
}

const host = new Client();
await host.connect('admin', '2409');
await sleep(200);
for (const [i, c] of players.entries()) {
  await host.admin('adjust', { targetId: c.playerId, delta: (players.length - i) * 6 + 4, note: 'audit' });
}
await host.admin('setRole', { targetId: players[1].playerId, role: 'birthday' });

// Laufende Aufgabe, offene Abnahme, Wette, Shop-Effekt: möglichst volle Screens
const me = players[0];
await me.act('draw');
await sleep(80);
if (me.state.turn?.status === 'observer') {
  await me.act('observerAck');
  await me.act('pickLevel', { level: 10 });
}
await players[2].act('createBet', { text: 'Ich schaffe drei Stufe 3 hintereinander.', stake: 12 });
await sleep(80);
const open = players[3].state.bets?.find((b) => b.status === 'open');
if (open) await players[3].act('acceptBet', { betId: open.id });
await players[4].act('buyItem', { itemId: 'item-peek' });
await players[5].act('draw');
await sleep(80);
if (players[5].state.turn?.status === 'observer') {
  await players[5].act('observerAck');
  await players[5].act('pickLevel', { level: 5 });
  await players[5].act('taskDone');
}
await sleep(250);

/* ── Browser ───────────────────────────────────────────────── */

browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${path.join(tmp, 'chrome')}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const target = await waitFor(
  async () => {
    const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    return list.find((t) => t.type === 'page');
  },
  20000,
  'Chrome',
);

const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
let msgId = 1;
const waiting = new Map();
let errors = [];
await new Promise((r) => cdp.on('open', r));
cdp.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(`EX ${String(m.params.exceptionDetails.exception?.description || '').split('\n')[0]}`);
  }
  // Headless Chrome verbietet navigator.vibrate ohne vorherige Berührung. Auf
  // einem echten Handy greift es, die Meldung ist hier also kein Befund.
  const noise = (t) => /navigator\.vibrate/i.test(String(t));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !noise(m.params.entry.text)) {
    errors.push(`LOG ${m.params.entry.text}`);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(`CON ${m.params.args.map((a) => a.value || a.description).join(' ')}`);
  }
});
const cmd = (method, params = {}) =>
  new Promise((r) => {
    const i = msgId++;
    waiting.set(i, r);
    cdp.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (e) =>
  (await cmd('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;
await cmd('Runtime.enable');
await cmd('Log.enable');
await cmd('Page.enable');

/* ── Die eigentliche Prüfung ───────────────────────────────── */

let problems = 0;
const rows = [];

async function inspect(label, w) {
  await sleep(450);
  const r = await ev(`(() => {
    const de = document.documentElement;
    // Absichtlich neben dem Bild: die inaktiven Tabs im Slide-Container, die
    // Laufschrift und die breiten Tabellen auf den Druckseiten. Alle drei
    // stecken in einem Kasten, der sie abschneidet oder scrollen lässt.
    // Ob die Seite selbst seitwärts läuft, misst die Prüfung darunter separat,
    // und genau das ist der Fehler, auf den es ankommt.
    const ignored = (el) => !!el.closest('.bbb-track, .bbb-marquee, .scroll');
    const all = [...document.querySelectorAll('body *')];
    const over = all.filter((el) => {
      if (ignored(el)) return false;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return false;
      return b.right > ${w} + 1.5 || b.left < -1.5;
    }).slice(0, 3).map((el) => {
      const b = el.getBoundingClientRect();
      return el.tagName + '.' + String(el.className || '').slice(0, 20) + '[' + Math.round(b.left) + '..' + Math.round(b.right) + ']';
    });

    const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && !ignored(b));
    const tiny = btns.filter((b) => {
      const q = b.getBoundingClientRect();
      return q.height < 30 || q.width < 20;
    }).slice(0, 3).map((b) => {
      const q = b.getBoundingClientRect();
      return String(b.getAttribute('aria-label') || b.textContent || '?').trim().slice(0, 16)
        + ' ' + Math.round(q.width) + 'x' + Math.round(q.height);
    });

    // Nur den echten Text messen: scrollWidth zählt dekorative Pseudo-Elemente
    // mit, etwa den Lichtstreifen auf Primärknöpfen.
    const textWidth = (el) => {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      return rg.getBoundingClientRect().width;
    };
    const innerWidth_ = (el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    };
    const clipped = btns.filter((b) => innerWidth_(b) > 0 && textWidth(b) > innerWidth_(b) + 2)
      .slice(0, 3).map((b) => String(b.textContent || '').trim().slice(0, 18)
        + ' ' + Math.round(textWidth(b)) + '>' + Math.round(innerWidth_(b)));

    const spill = all.filter((el) => {
      if (ignored(el) || el.children.length) return false;
      const cs = getComputedStyle(el);
      if (cs.overflow !== 'visible' || cs.position === 'absolute') return false;
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 4;
    }).slice(0, 3).map((el) => String(el.textContent || '').trim().slice(0, 20));

    return { scrollW: de.scrollWidth, clientW: de.clientWidth, over, tiny, clipped, spill };
  })()`);

  const bad = [];
  if (r.scrollW > r.clientW + 1) bad.push(`Querlauf ${r.scrollW}>${r.clientW}`);
  if (r.over.length) bad.push(`ragt raus: ${r.over.join(' | ')}`);
  if (r.tiny.length) bad.push(`Tippziel zu klein: ${r.tiny.join(', ')}`);
  if (r.clipped.length) bad.push(`Knopftext beschnitten: ${r.clipped.join(', ')}`);
  if (r.spill.length) bad.push(`Text läuft über: ${r.spill.join(', ')}`);
  if (errors.length) bad.push(`Konsole: ${errors.slice(0, 2).join(' | ')}`);
  if (bad.length) problems += 1;
  rows.push({ label, w, ok: bad.length === 0, bad });
  console.log(
    `${bad.length ? ' !! ' : ' ok '} ${String(w).padStart(3)}px  ${label.padEnd(28)}${bad.join('  ')}`,
  );
  if (SHOTS) {
    const s = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(shotDir, `${w}-${label.replace(/[^\w]+/g, '-')}.png`),
      Buffer.from(s.result.data, 'base64'),
    );
  }
  errors = [];
}

// Gesucht wird das Element, dessen eigener Text exakt die Beschriftung ist,
// geklickt wird der Knopf darum. Vorher wurde der ganze Knopftext verglichen;
// sobald ein Tab ein Badge bekam, stand dort „Markt·" statt „Markt", und der
// Tab wurde stillschweigend übersprungen statt geprüft.
const clickExact = (label) =>
  ev(
    `(()=>{const t=[...document.querySelectorAll('button,[role=tab],button *,[role=tab] *')]` +
      `.find(x=>x.textContent.trim()===${JSON.stringify(label)});` +
      `const b=t&&(t.closest('button')||t.closest('[role=tab]'));` +
      `if(b){b.click();return true} return false})()`,
  );
const clickMatch = (re) =>
  ev(`[...document.querySelectorAll('button')].find(b=>/${re}/.test(b.textContent))?.click()`);
const goto = async (url, ms = 1700) => {
  await cmd('Page.navigate', { url });
  await sleep(ms);
};

for (const [w, h, device] of WIDTHS) {
  console.log(`\n── ${device} (${w}×${h}) ${'─'.repeat(Math.max(0, 30 - device.length))}`);
  await cmd('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // Beitritt, ohne gespeicherten Spieler
  await goto(`http://127.0.0.1:${PORT}/`, 1200);
  await ev(`localStorage.removeItem('bbb.token')`);
  await goto(`http://127.0.0.1:${PORT}/`, 2000);
  await inspect('Beitritt', w);
  for (let i = 0; i < 6; i += 1) {
    await clickMatch('Weiter');
    await sleep(200);
  }
  await inspect('Beitritt, letzte Achse', w);

  // Regeln, dann die Tabs
  const fresh = new Client();
  await fresh.connect();
  const r = await fresh.send({ type: 'join', name: `Gast${w}`, cfg: avatar(3) });
  await ev(`localStorage.setItem('bbb.token', ${JSON.stringify('PLATZ')})`);
  await ev(`localStorage.setItem('bbb.token', ${JSON.stringify(r.token)})`);
  await goto(`http://127.0.0.1:${PORT}/`, 2000);
  await inspect('Regeln', w);
  await ev(`[...document.querySelectorAll('button')].at(-1).click()`);
  await sleep(900);

  await ev(`localStorage.setItem('bbb.token', ${JSON.stringify(me.token)})`);
  await goto(`http://127.0.0.1:${PORT}/`, 2000);
  for (const tab of ['Start', 'Aufgabe', 'Beobachten', 'Markt', 'Rang', 'Feed']) {
    if (await clickExact(tab)) {
      await sleep(600);
      await inspect(`Tab: ${tab}`, w);
    }
  }

  // Overlays: Sonderauftrag und Auswertung sind Vollbild-Takeover
  await host.admin('wildcardNow', { targetId: me.playerId });
  await sleep(700);
  await inspect('Overlay: Sonderauftrag', w);
  await host.admin('wildcardCancel');
  await sleep(500);

  await host.admin('endGame');
  await sleep(900);
  await inspect('Overlay: Auswertung', w);
  await ev(`document.querySelector('.bbb-scroll')?.scrollTo(0, 99999)`);
  await inspect('Overlay: Auswertung, unten', w);
  await host.admin('setPhase', { phase: 'running' });
  await sleep(500);

  // Admin
  await goto(`http://127.0.0.1:${PORT}/admin`, 1600);
  await inspect('Admin: PIN', w);
  await ev(
    `(()=>{const i=document.querySelector('input');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'2409');i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await sleep(250);
  await ev(`[...document.querySelectorAll('button')].at(-1).click()`);
  await sleep(1100);
  for (const tab of ['Spieler', 'Freigeben', 'Karten', 'Spiel', 'Protokoll']) {
    if (await clickExact(tab)) {
      await sleep(550);
      await inspect(`Admin: ${tab}`, w);
    }
  }
  await clickMatch('Neue Karte schreiben');
  await sleep(550);
  await inspect('Admin: Kartenformular', w);
  await ev(`(()=>{const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
    [...document.querySelectorAll('textarea')].forEach((t,i)=>{s.call(t,'Trink mit Robby einen Shot. Stufe '+(i+1));t.dispatchEvent(new Event('input',{bubbles:true}))});})()`);
  await sleep(300);
  await clickMatch('In den Pool legen');
  await sleep(600);
  await inspect('Admin: Namens-Popup', w);
  await clickMatch('Umformulieren');
  await sleep(300);

  // Die beiden gedruckten Seiten. Sie sind zum Ausdrucken gedacht, werden aber
  // garantiert auch auf einem Handy geöffnet.
  await goto(`http://127.0.0.1:${PORT}/spickzettel`, 900);
  await inspect('Seite: Spickzettel', w);
  await goto(`http://127.0.0.1:${PORT}/rueckblick`, 900);
  await inspect('Seite: Rückblick', w);
}

console.log(
  `\n${problems === 0 ? '✅ Kein Layout- oder Konsolenproblem gefunden.' : `❌ ${problems} von ${rows.length} Ansichten auffällig.`}`,
);
console.log(`   ${rows.length} Ansichten auf ${WIDTHS.length} Breiten geprüft.`);
if (SHOTS) console.log(`   Screenshots: ${shotDir}`);
await cleanup();
process.exit(problems ? 1 : 0);
