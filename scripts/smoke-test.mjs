import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prüft die Verkabelung: WebSocket, Aktionen, Snapshots, Reconnect. Die Regeln
 * selbst prüft scripts/engine-test.mjs.
 *
 * Ohne BBB_URL startet der Test seinen eigenen Server auf einem freien Port,
 * mit eigenem Spielstand und eigener Konfiguration. Der echte Spielstand der
 * Party wird dabei nie angefasst. Mit BBB_URL läuft er gegen einen Server, der
 * schon steht; dann gilt dessen Spielstand, und der Test setzt ihn am Ende
 * zurück.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWN_SERVER = !process.env.BBB_URL;
const PORT = Number(process.env.BBB_PORT) || 3100 + Math.floor(Math.random() * 400);
const URL = process.env.BBB_URL || `ws://127.0.0.1:${PORT}/ws`;
let failures = 0;
/** Wird im Shop-Block gesetzt und räumt den Katalog wieder auf. */
let restoreShop = null;
let child = null;
let tmpDir = null;

/** Eigener Server mit eigener Ablage, damit nichts Echtes überschrieben wird. */
async function startServer() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-smoke-'));
  // Der Server bekommt eine vollständige Kopie von server/data. Der Shop-Block
  // unten schreibt Testitems in den Katalog; auf dem Original wäre ein Absturz
  // mittendrin ein Datenverlust.
  const dataDir = path.join(tmpDir, 'data');
  fs.cpSync(path.join(ROOT, 'server', 'data'), dataDir, { recursive: true });
  for (const f of ['state.json', 'state.backup.json', 'config.json']) {
    fs.rmSync(path.join(dataDir, f), { force: true });
  }
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      BBB_DATA_DIR: dataDir,
      BBB_STATE_FILE: path.join(tmpDir, 'state.json'),
      BBB_CONFIG_FILE: path.join(tmpDir, 'config.json'),
    },
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  // Gewartet wird auf /api/health, nicht auf /. Ohne gebauten Client antwortet
  // die Wurzel mit 503 „Client noch nicht gebaut", und der Test liefe ins
  // Timeout, obwohl der Server längst da ist. Genau das ist in CI passiert:
  // client/dist ist gitignoriert und entsteht dort in einem eigenen Job.
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) break;
    } catch {
      /* noch nicht oben */
    }
    if (Date.now() > deadline) throw new Error(`Server kam auf Port ${PORT} nicht hoch.`);
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`[test] Eigener Server auf Port ${PORT}, Ablage ${tmpDir}`);
}

/**
 * Erst das Ende des Servers abwarten, dann aufräumen. Der Server sichert beim
 * Beenden seinen Spielstand und legt das Verzeichnis dabei neu an; wer vorher
 * löscht, lässt einen leeren Ordner in /tmp zurück.
 */
async function stopServer() {
  if (child) {
    const done = new Promise((r) => {
      child.once('exit', r);
      setTimeout(r, 3000);
    });
    child.kill('SIGTERM');
    await done;
    child = null;
  }
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    tmpDir = null;
  }
}

function check(label, cond, extra = '') {
  const ok = !!cond;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${extra ? ` :: ${extra}` : ''}`);
}

class Client {
  constructor(label) {
    this.label = label;
    this.reqId = 1;
    this.pending = new Map();
    this.state = null;
    this.token = null;
  }

  /** Nur die Leitung aufbauen, ohne sich anzumelden. */
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => this.onMessage(raw));
    });
  }

  onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'state') this.state = msg.state;
    if (msg.reqId && this.pending.has(msg.reqId)) {
      this.pending.get(msg.reqId)(msg);
      this.pending.delete(msg.reqId);
    }
  }

  connect(role = 'player', pin = null) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ type: 'hello', role, token: this.token, pin }));
        resolve();
      });
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state') this.state = msg.state;
        if (msg.reqId && this.pending.has(msg.reqId)) {
          this.pending.get(msg.reqId)(msg);
          this.pending.delete(msg.reqId);
        }
      });
    });
  }

  send(msg) {
    return new Promise((resolve) => {
      const reqId = this.reqId++;
      this.pending.set(reqId, resolve);
      this.ws.send(JSON.stringify({ ...msg, reqId }));
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          resolve({ error: 'timeout' });
        }
      }, 4000);
    });
  }

  async join(name, cfg = {}) {
    const res = await this.send({ type: 'join', name, cfg });
    if (res.token) this.token = res.token;
    this.playerId = res.playerId;
    return res;
  }

  act(action, payload = {}) {
    return this.send({ type: 'action', action, ...payload });
  }

  admin(action, payload = {}) {
    return this.send({ type: 'admin', action, ...payload });
  }

  close() {
    this.ws.close();
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scoreOf = (client, id) => client.state.ranking.find((p) => p.id === id)?.score;

async function run() {
  console.log('\n── Spieler treten bei ─────────────────────────────');
  const a = new Client('A');
  const b = new Client('B');
  const c = new Client('C');
  await Promise.all([a.connect(), b.connect(), c.connect()]);

  await a.join('Anna', { skin: 1, hair: 2, style: 1, acc: 2, outfit: 0, fur: 3 });
  await b.join('Bela', { skin: 3, hair: 0, style: 3, acc: 0, outfit: 2, fur: 1 });
  await c.join('Cem', { skin: 0, hair: 4, style: 2, acc: 1, outfit: 4, fur: 5 });
  await wait(120);

  check('drei Spieler registriert', a.state.ranking.length === 3, `${a.state.ranking.length}`);
  const dup = await c.send({ type: 'join', name: 'anna', cfg: {} });
  check('doppelter Name wird abgelehnt', !!dup.error, dup.error);

  console.log('\n── Kernschleife: ziehen, Stufe, erledigt, Abnahme ──');
  await a.act('seenRules');
  let res = await a.act('draw');
  check('Karte gezogen', !res.error, res.error);
  await wait(80);

  // Special Card kann statt einer Karte kommen; dann nochmal ziehen
  if (a.state.turn.pendingSpecial) {
    check('Special Card landet in der Hand', a.state.me.heldSpecials.length === 1);
    await a.act('ackSpecial');
    await a.act('draw');
    await wait(80);
  }

  check('Status ist observer', a.state.turn.status === 'observer', a.state.turn.status);
  check('Beobachter zugewiesen', a.state.turn.observers.length === 1);
  check('Aufgabentext noch verborgen', a.state.turn.revealText === null);
  const observerId = a.state.turn.observers[0].id;
  const observer = [b, c].find((x) => x.playerId === observerId);

  await a.act('observerAck');
  await wait(60);
  check('Status ist level', a.state.turn.status === 'level', a.state.turn.status);
  check('Kartentitel sichtbar', !!a.state.turn.title);
  check('Text weiterhin verborgen', a.state.turn.revealText === null);

  res = await a.act('pickLevel', { level: 5 });
  await wait(60);
  check('Status ist reveal', a.state.turn.status === 'reveal', a.state.turn.status);
  check(
    'Aufgabentext jetzt da',
    typeof a.state.turn.revealText === 'string' && a.state.turn.revealText.length > 0,
  );

  await a.act('taskDone');
  await wait(80);
  check('Status ist waiting', a.state.turn.status === 'waiting', a.state.turn.status);
  check('noch keine Punkte', scoreOf(a, a.playerId) === 0, String(scoreOf(a, a.playerId)));

  const selfConfirm = await a.act('confirmClaim', { claimId: a.state.myClaims[0].id });
  check('Selbst-Abhaken wird verweigert', !!selfConfirm.error, selfConfirm.error);

  check('Beobachter sieht die Aufgabe', observer.state.observations.length === 1);
  check('Beobachter sieht den vollen Text', !!observer.state.observations[0].text);
  await observer.act('confirmClaim', { claimId: observer.state.observations[0].id });
  await wait(100);
  check('Punkte nach Abnahme gutgeschrieben', scoreOf(a, a.playerId) === 5, String(scoreOf(a, a.playerId)));
  check('Zug ist zurück auf idle', a.state.turn.status === 'idle', a.state.turn.status);

  console.log('\n── Parallelität: waiting blockiert nicht ──────────');
  await b.act('draw');
  await wait(60);
  if (b.state.turn.pendingSpecial) {
    await b.act('ackSpecial');
    await b.act('draw');
    await wait(60);
  }
  await b.act('observerAck');
  await b.act('pickLevel', { level: 1 });
  await b.act('taskDone');
  await wait(80);
  const drawWhileWaiting = await b.act('draw');
  check('Ziehen trotz offener Abnahme möglich', !drawWhileWaiting.error, drawWhileWaiting.error);
  await wait(60);

  console.log('\n── Reroll: Würfel mal Faktor ─────────────────────');
  if (b.state.turn.pendingSpecial) {
    await b.act('ackSpecial');
    await b.act('draw');
    await wait(60);
  }
  await b.act('observerAck');
  await b.act('pickLevel', { level: 10 });
  await wait(60);
  const before = scoreOf(b, b.playerId);
  const roll = await b.act('reroll');
  await wait(80);
  check('Reroll ausgeführt', !roll.error, roll.error);
  check('Würfel zwischen 1 und 6', roll.dice >= 1 && roll.dice <= 6, String(roll.dice));
  check('erster Faktor ist 1', roll.factor === 1, String(roll.factor));
  check(
    'Minuspunkte verrechnet',
    scoreOf(b, b.playerId) === before - roll.dice * roll.factor,
    `${before} → ${scoreOf(b, b.playerId)}`,
  );
  check('Overlay-Daten liegen an', b.state.turn.lastRoll?.total === roll.dice * roll.factor);
  await b.act('clearRoll');
  await wait(40);
  check('nächster Faktor ist 2', b.state.me.nextRerollFactor === 2, String(b.state.me.nextRerollFactor));
  check('noch zwei Rerolls für diese Karte', b.state.me.rerollsLeft === 2, String(b.state.me.rerollsLeft));

  // Drei pro Karte, der vierte muss abgelehnt werden
  const toReveal = async () => {
    await b.act('draw');
    await wait(80);
    if (b.state.turn.pendingSpecial) {
      await b.act('ackSpecial');
      await b.act('draw');
      await wait(80);
    }
    await b.act('observerAck');
    await b.act('pickLevel', { level: 1 });
    await wait(60);
  };
  for (const expected of [2, 3]) {
    await toReveal();
    const r = await b.act('reroll');
    await wait(80);
    check(`Faktor steigt auf ${expected}`, r.factor === expected, String(r.factor));
    await b.act('clearRoll');
    await wait(40);
  }
  await toReveal();
  const fourth = await b.act('reroll');
  check('vierter Reroll wird abgelehnt', !!fourth.error, fourth.error);
  check('kein Reroll mehr übrig', b.state.me.rerollsLeft === 0, String(b.state.me.rerollsLeft));

  // Karte durchziehen: der Zähler startet danach wieder bei drei
  await b.act('taskDone');
  await wait(100);
  check(
    'Zähler setzt sich nach der Karte zurück',
    b.state.me.rerollsLeft === 3,
    String(b.state.me.rerollsLeft),
  );
  check('Faktor wieder bei 1', b.state.me.nextRerollFactor === 1, String(b.state.me.nextRerollFactor));

  console.log('\n── Black Market: Einsatz und Auflösung ───────────');
  const aBefore = scoreOf(a, a.playerId);
  const cBefore = scoreOf(c, c.playerId);
  const overCap = await a.act('createBet', { text: 'Zu hoher Einsatz', stake: 999 });
  check('Einsatz-Cap greift', !!overCap.error, overCap.error);

  await a.act('createBet', { text: 'Cem tanzt heute noch auf dem Tisch.', stake: 10 });
  await wait(80);
  const betId = a.state.bets[0].id;
  const ownAccept = await a.act('acceptBet', { betId });
  check('eigene Wette nicht annehmbar', !!ownAccept.error, ownAccept.error);

  await c.act('acceptBet', { betId });
  await wait(100);
  check(
    'Einsatz bei A sofort abgezogen',
    scoreOf(a, a.playerId) === aBefore - 10,
    String(scoreOf(a, a.playerId)),
  );
  check(
    'Einsatz bei C sofort abgezogen',
    scoreOf(c, c.playerId) === cBefore - 10,
    String(scoreOf(c, c.playerId)),
  );
  check('kein Escrow mehr im Snapshot', a.state.me.escrow === undefined, String(a.state.me.escrow));

  await a.act('voteBet', { betId, winnerId: a.playerId });
  await wait(60);
  check(
    'einseitige Stimme löst noch nicht auf',
    a.state.bets.find((x) => x.id === betId)?.status === 'running',
  );
  await c.act('voteBet', { betId, winnerId: a.playerId });
  await wait(100);
  check(
    'Gewinner holt den ganzen Pott',
    scoreOf(a, a.playerId) === aBefore + 10,
    String(scoreOf(a, a.playerId)),
  );
  check(
    'Verlierer bleibt beim Einsatz-Minus',
    scoreOf(c, c.playerId) === cBefore - 10,
    String(scoreOf(c, c.playerId)),
  );

  console.log('\n── Shop: Kauf, Effekt, Stapel-Sperre ─────────────');
  const host = new Client('host');
  await host.connect('admin', '2409');
  await wait(120);

  // Der Test spielt eigene Items ein, um die Mechanik zu prüfen. Der echte
  // Katalog muss danach zurück, auch wenn eine Prüfung dazwischen abbricht.
  const shopBackup = host.state.shopItems.slice();
  restoreShop = async () => {
    await host.admin('saveCatalog', { kind: 'shopItems', list: shopBackup });
    await wait(150);
    restoreShop = null;
    return shopBackup;
  };
  await host.admin('saveCatalog', {
    kind: 'shopItems',
    list: [
      {
        id: 'item-forcelevel',
        icon: '🔟',
        name: 'Zwangsstufe',
        description: 'Test',
        price: 20,
        requiresTarget: true,
        targetSelf: false,
        durationMin: null,
        consumesOn: 'NEXT_CARD_DRAWN',
        effect: 'forceLevel10',
        enabled: true,
      },
      {
        id: 'item-rerollblock',
        icon: '🚫',
        name: 'Reroll-Sperre',
        description: 'Test',
        price: 15,
        requiresTarget: true,
        targetSelf: false,
        durationMin: null,
        consumesOn: 'TASK_END',
        effect: 'rerollBlock',
        enabled: true,
      },
    ],
  });
  await wait(150);
  check('Testkatalog eingespielt', host.state.shopItems.length === 2, String(host.state.shopItems.length));

  const aPre = scoreOf(a, a.playerId);
  const buy = await a.act('buyItem', { itemId: 'item-forcelevel', targetId: c.playerId });
  await wait(100);
  check('Zwangsstufe gekauft', !buy.error, buy.error);
  check('Preis abgezogen', scoreOf(a, a.playerId) === aPre - 20, String(scoreOf(a, a.playerId)));
  check(
    'Effekt liegt beim Ziel',
    c.state.effects.some((e) => e.effect === 'forceLevel10'),
  );
  const stack = await b.act('buyItem', { itemId: 'item-rerollblock', targetId: c.playerId });
  check('nur ein Fremdeffekt gleichzeitig', !!stack.error, stack.error);
  const self = await a.act('buyItem', { itemId: 'item-forcelevel', targetId: a.playerId });
  check('kein Effekt auf sich selbst', !!self.error, self.error);

  await c.act('draw');
  await wait(80);
  if (c.state.turn.pendingSpecial) {
    await c.act('ackSpecial');
    await c.act('draw');
    await wait(80);
  }
  await c.act('observerAck');
  await wait(60);
  check('Zwangsstufe erzwingt Stufe 10', c.state.turn.forcedLevel === 10, String(c.state.turn.forcedLevel));
  const wrongLevel = await c.act('pickLevel', { level: 1 });
  check('andere Stufe wird abgelehnt', !!wrongLevel.error, wrongLevel.error);
  await c.act('pickLevel', { level: 10 });
  await wait(60);
  check('Stufe 10 geht durch', c.state.turn.status === 'reveal', c.state.turn.status);

  console.log('\n── Admin: PIN, Ruf, Korrektur, Undo ──────────────');
  const bad = new Client('badadmin');
  await bad.connect('admin', '0000');
  const badRes = await bad.send({ type: 'admin', action: 'reshuffle' });
  check('falsche PIN sperrt den Admin', !!badRes.error, badRes.error);
  bad.close();

  check('Admin-Snapshot da', !!host.state?.config, 'kein Snapshot');
  check('Karten im Admin sichtbar', host.state.cards.length >= 10, String(host.state.cards?.length));

  await host.admin('wildcardNow', { targetId: b.playerId });
  await wait(120);
  check('Ruf erreicht den Spieler', !!b.state.wildcardForMe, 'kein Angebot');
  await b.act('wildcardAccept');
  await wait(100);
  check('Ruf angenommen, Reveal läuft', b.state.turn.status === 'reveal' && b.state.turn.kind === 'wildcard');
  check(
    'zwei Beobachter beim Ruf',
    b.state.turn.observers.length === 2,
    String(b.state.turn.observers.length),
  );
  const noReroll = await b.act('reroll');
  check('Ruf lässt sich nicht rerollen', !!noReroll.error, noReroll.error);

  const bPre = scoreOf(b, b.playerId);
  await b.act('taskDone');
  await wait(80);
  const wildObservers = [a, c].filter((x) => b.state.turn.observers.some((o) => o.id === x.playerId));
  await wildObservers[0].act('confirmClaim', { claimId: wildObservers[0].state.observations.at(-1).id });
  await wait(80);
  check('ein Beobachter reicht nicht', scoreOf(b, b.playerId) === bPre, String(scoreOf(b, b.playerId)));
  await wildObservers[1].act('confirmClaim', { claimId: wildObservers[1].state.observations.at(-1).id });
  await wait(120);
  check(
    '25 Punkte nach beiden Bestätigungen',
    scoreOf(b, b.playerId) === bPre + 25,
    String(scoreOf(b, b.playerId)),
  );

  const adjPre = scoreOf(host, c.playerId);
  await host.admin('adjust', { targetId: c.playerId, delta: 7, note: 'Test' });
  await wait(100);
  check('Host-Korrektur wirkt', scoreOf(host, c.playerId) === adjPre + 7, String(scoreOf(host, c.playerId)));
  const lastAdjust = host.state.events.find((e) => e.type === 'ADMIN_ADJUST');
  await host.admin('voidEvent', { eventId: lastAdjust.id, voided: true });
  await wait(100);
  check(
    'Entwerten macht die Korrektur rückgängig',
    scoreOf(host, c.playerId) === adjPre,
    String(scoreOf(host, c.playerId)),
  );

  await restoreShop();
  check('Katalog wieder wie ausgeliefert', host.state.shopItems.length === shopBackup.length);

  console.log('\n── Wette stornieren: Einsätze zurück ─────────────');
  const rBefore = scoreOf(a, a.playerId);
  const sBefore = scoreOf(c, c.playerId);
  await a.act('createBet', { text: 'Wird gleich storniert.', stake: 12 });
  await wait(80);
  const openBet = a.state.bets.find((x) => x.status === 'open');
  await c.act('acceptBet', { betId: openBet.id });
  await wait(100);
  check(
    'beide haben eingezahlt',
    scoreOf(a, a.playerId) === rBefore - 12 && scoreOf(c, c.playerId) === sBefore - 12,
  );
  await host.admin('cancelBet', { betId: openBet.id });
  await wait(120);
  check('A bekommt den Einsatz zurück', scoreOf(a, a.playerId) === rBefore, String(scoreOf(a, a.playerId)));
  check('C bekommt den Einsatz zurück', scoreOf(c, c.playerId) === sBefore, String(scoreOf(c, c.playerId)));

  console.log('\n── Karten-Editor ─────────────────────────────────');
  const cards = host.state.cards.slice();
  cards.push({
    id: 'card-test',
    title: 'Testkarte',
    category: 'test',
    tags: [],
    enabled: true,
    levels: {
      1: { text: 'A', timerSec: null },
      5: { text: 'B', timerSec: null },
      10: { text: 'C', timerSec: null },
    },
  });
  await host.admin('saveCatalog', { kind: 'cards', list: cards });
  await wait(120);
  check(
    'Karte gespeichert',
    host.state.cards.some((x) => x.id === 'card-test'),
  );
  // Testkarte wieder entfernen, damit der echte Katalog sauber bleibt
  await host.admin('saveCatalog', {
    kind: 'cards',
    list: host.state.cards.filter((x) => x.id !== 'card-test'),
  });
  await wait(120);
  check('Testkarte wieder entfernt', !host.state.cards.some((x) => x.id === 'card-test'));

  console.log('\n── Reconnect ─────────────────────────────────────');
  a.close();
  await wait(150);
  const again = new Client('A2');
  again.token = a.token;
  await again.connect();
  await wait(150);
  check('Token stellt den Spieler wieder her', again.state.me?.name === 'Anna', again.state.me?.name);
  check('voller Zustand nach Reconnect', again.state.ranking.length === 3);

  console.log('\n── Seiten und Downloads ──────────────────────────');
  const base = `http://127.0.0.1:${PORT}`;

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  check('Health antwortet', health.ok === true);
  check('Health kennt die Party-Adresse', /^http:\/\//.test(health.url || ''), health.url);

  const sheetRes = await fetch(`${base}/spickzettel`);
  const sheet = await sheetRes.text();
  check(
    'Spickzettel kommt als HTML',
    sheetRes.ok && /text\/html/.test(sheetRes.headers.get('content-type') || ''),
  );
  check('Spickzettel nennt die PIN', sheet.includes('2409'));
  check('Spickzettel nennt die Adresse', sheet.includes(health.url));
  check(
    'Spickzettel braucht kein Netz',
    !/https?:\/\/(?!127\.|10\.|192\.168\.)/.test(sheet.replace(/http:\/\/[0-9.]+:\d+/g, '')),
  );

  const recapRes = await fetch(`${base}/rueckblick`);
  const recapHtml = await recapRes.text();
  check(
    'Rückblick kommt als HTML',
    recapRes.ok && /text\/html/.test(recapRes.headers.get('content-type') || ''),
  );
  check('Rückblick nennt den Endstand', recapHtml.includes('Endstand'));
  check('Rückblick zählt die Spieler', recapHtml.includes('Mitgespielt'));
  check('Rückblick nennt einen Namen aus der Runde', recapHtml.includes(host.state.players[0].name));
  check('Rückblick ohne undefined', !recapHtml.includes('undefined'));
  check('Rückblick ohne lange Striche', !/[\u2014\u2013\u2015]/.test(recapHtml));

  const dump = await fetch(`${base}/api/export/state`);
  const dumpBody = await dump.json();
  check('Spielstand-Download kommt an', dump.ok);
  check(
    'Download hat einen Dateinamen',
    /bbb-spielstand-/.test(dump.headers.get('content-disposition') || ''),
  );
  check('Download enthält die Spieler', Array.isArray(dumpBody.players) && dumpBody.players.length > 0);
  check('Download enthält das Protokoll', Array.isArray(dumpBody.events));

  const cardsDump = await fetch(`${base}/api/export/cards`);
  check('Kartenexport geht weiter', cardsDump.ok && Array.isArray(await cardsDump.json()));
  check('Unbekannter Export gibt 404', (await fetch(`${base}/api/export/quatsch`)).status === 404);

  console.log('\n── Host-Checkliste ───────────────────────────────');
  check('Checkliste kommt im Admin-Zustand an', Array.isArray(host.state.checks), typeof host.state.checks);
  const rollenWarnung = (host.state.checks || []).some((x) => /Geburtstagskind/.test(x.text));
  check('Fehlende Rolle wird gemeldet', rollenWarnung, JSON.stringify(host.state.checks));
  const someone = host.state.players[0];
  await host.admin('setRole', { targetId: someone.id, role: 'birthday' });
  await wait(120);
  check(
    'Nach dem Vergeben ist die Warnung weg',
    !(host.state.checks || []).some((x) => /Geburtstagskind/.test(x.text)),
    JSON.stringify(host.state.checks),
  );
  await host.admin('setRole', { targetId: someone.id, role: 'guest' });
  await wait(120);

  console.log('\n── PIN-Bremse ────────────────────────────────────');
  {
    const knacker = new Client('knacker');
    await knacker.open();
    const versuche = [];
    for (let i = 0; i < 5; i += 1) {
      versuche.push(await knacker.send({ type: 'hello', role: 'admin', pin: String(1000 + i) }));
    }
    check(
      'Erster Fehlversuch sagt nur „falsch"',
      /Falsche PIN/.test(versuche[0].error || ''),
      versuche[0].error,
    );
    check('Später wird gebremst', /Zu viele Versuche/.test(versuche[4].error || ''), versuche[4].error);
    check('Die Bremse nennt eine Wartezeit', /\d+ Sekunden/.test(versuche[4].error || ''), versuche[4].error);

    // Eine frische Verbindung ist nicht gesperrt: die Bremse gilt pro Socket,
    // der Host soll sich nach einem Vertipper nicht selbst aussperren.
    const ehrlich = new Client('ehrlich');
    await ehrlich.open();
    const ok = await ehrlich.send({ type: 'hello', role: 'admin', pin: '2409' });
    check('Richtige PIN kommt trotzdem durch', ok.ok === true, JSON.stringify(ok));
    knacker.close();
    ehrlich.close();
  }

  console.log('\n── Absturzsicherung ──────────────────────────────');
  {
    // Eigener, kurzlebiger Server, der absichtlich aus einem Timer heraus
    // wirft. Genau dort greift kein try/catch; die Sicherung in index.js muss
    // ihn am Leben halten, sonst steht am Abend die ganze Party.
    const crashDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-crash-'));
    const crashData = path.join(crashDir, 'data');
    fs.cpSync(path.join(ROOT, 'server', 'data'), crashData, { recursive: true });
    for (const f of ['state.json', 'state.backup.json', 'config.json']) {
      fs.rmSync(path.join(crashData, f), { force: true });
    }
    const crashPort = PORT + 1;
    const victim = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        PORT: String(crashPort),
        BBB_CRASH_TEST: '1',
        BBB_DATA_DIR: crashData,
        BBB_STATE_FILE: path.join(crashDir, 'state.json'),
        BBB_CONFIG_FILE: path.join(crashDir, 'config.json'),
      },
    });
    let stderr = '';
    victim.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    let alive = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${crashPort}/api/health`);
        if (res.ok && stderr.includes('Unerwarteter Fehler')) {
          alive = true;
          break;
        }
      } catch {
        /* noch nicht oben oder gerade gestorben */
      }
      await wait(200);
    }

    check('Der Fehler wird gemeldet', stderr.includes('Unerwarteter Fehler'), stderr.slice(0, 120));
    check('Der Server antwortet danach weiter', alive);
    check('Der Prozess lebt noch', victim.exitCode === null, String(victim.exitCode));

    const gone = new Promise((r) => {
      victim.once('exit', r);
      setTimeout(r, 3000);
    });
    victim.kill('SIGTERM');
    await gone;
    fs.rmSync(crashDir, { recursive: true, force: true });
  }

  console.log('\n── Auswertung ────────────────────────────────────');
  await host.admin('endGame');
  await wait(150);
  check('Phase beendet', host.state.phase === 'ended', host.state.phase);
  check('Podium gefüllt', host.state.result.podium.length === 3, String(host.state.result?.podium?.length));
  check('Verlierertabelle vorhanden', Array.isArray(host.state.result.losers));
  check(
    'Podium ist absteigend sortiert',
    host.state.result.podium[0].score >= host.state.result.podium[1].score,
  );

  await host.admin('resetParty');
  await wait(120);
  check('Reset leert die Party', host.state.players.length === 0, String(host.state.players.length));

  for (const cl of [b, c, again, host]) cl.close();

  console.log(
    `\n${failures === 0 ? '✅ Alle Prüfungen bestanden.' : `❌ ${failures} Prüfung(en) fehlgeschlagen.`}\n`,
  );
  await stopServer();
  process.exit(failures === 0 ? 0 : 1);
}

const boot = OWN_SERVER ? startServer() : Promise.resolve();

boot.then(run).catch(async (err) => {
  console.error(err);
  // Ein Abbruch darf den echten Katalog nicht mit Testdaten zurücklassen.
  if (restoreShop) {
    try {
      await restoreShop();
      console.error('[aufräumen] Shop-Katalog wiederhergestellt.');
    } catch (e) {
      console.error('[aufräumen] Shop-Katalog NICHT wiederhergestellt:', e.message);
    }
  }
  await stopServer();
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await stopServer();
    process.exit(130);
  });
}
