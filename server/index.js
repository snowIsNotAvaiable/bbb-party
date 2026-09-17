import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

import { DEFAULTS, getConfig, setConfig } from './config.js';
import * as catalog from './catalog.js';
import { Game } from './game.js';
import { persistNow } from './store.js';
import { cheatSheet } from './sheet.js';
import { recap } from './recap.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

const cfg = getConfig();
const PORT = Number(process.env.PORT) || cfg.port;

const game = new Game();
const app = express();
app.use(express.json({ limit: '4mb' }));

/* ── LAN-Adressen ─────────────────────────────────────────── */

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  // 192.168.x.x zuerst, das ist im Gigacube-Netz die richtige
  out.sort((a, b) => Number(b.address.startsWith('192.168')) - Number(a.address.startsWith('192.168')));
  return out;
}

const partyUrl = () => {
  const first = lanAddresses()[0];
  return `http://${first ? first.address : 'localhost'}:${PORT}`;
};

/* ── HTTP ─────────────────────────────────────────────────── */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, url: partyUrl(), players: game.state.players.length, phase: game.state.phase });
});

app.get('/api/qr.png', async (_req, res) => {
  try {
    const buf = await QRCode.toBuffer(partyUrl(), { width: 720, margin: 2, color: { dark: '#0f101a', light: '#ffffff' } });
    res.type('png').send(buf);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/party-url', (_req, res) => res.json({ url: partyUrl(), addresses: lanAddresses() }));

/**
 * Spielstand zum Mitnehmen. Wenn am Abend etwas gründlich schiefgeht, ist eine
 * Datei auf dem Handy des Hosts schneller zur Hand als die Datei auf dem
 * MacBook. Reine Sicherung, kein Import: zurückspielen geht über data/state.json.
 */
app.get('/api/export/state', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="bbb-spielstand-${stamp}.json"`);
  res.json(game.state);
});

/** Karten-Export für den Admin. */
app.get('/api/export/:kind', (req, res) => {
  const kind = req.params.kind;
  if (!['cards', 'wildcards', 'shopItems', 'penalties', 'specials', 'prizes', 'punishments'].includes(kind)) {
    return res.status(404).json({ error: 'Unbekannter Katalog.' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${kind}.json"`);
  res.json(catalog.all(kind));
});

/** Der Spickzettel zum Ausdrucken (siehe server/sheet.js). */
app.get('/spickzettel', (_req, res) => {
  res.type('html').send(cheatSheet({ url: partyUrl(), pin: getConfig().hostPin, config: getConfig(), catalog }));
});

/** Der Rückblick für den Morgen danach (siehe server/recap.js). */
app.get('/rueckblick', (_req, res) => {
  res.type('html').send(recap({ game, config: getConfig() }));
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(503)
      .type('html')
      .send('<h1>Client noch nicht gebaut</h1><p>Erst <code>npm run build</code> laufen lassen, dann neu starten.</p>'),
  );
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ── WebSocket ────────────────────────────────────────────── */

const sockets = new Set();

function sendSnapshot(ws, shared = null) {
  if (ws.readyState !== ws.OPEN) return;
  let payload;
  if (ws.kind === 'admin') payload = game.adminSnapshot(shared);
  else payload = game.snapshotFor(ws.playerId, shared);
  ws.send(JSON.stringify({ type: 'state', state: payload }));
}

function broadcast() {
  // Der öffentliche Teil ist für alle gleich: Rangliste, Feed, laufende
  // Aufgaben. Einmal rechnen und an alle verteilen, statt pro Handy einmal.
  const shared = game.publicSnapshot();
  for (const ws of sockets) sendSnapshot(ws, shared);
}

game.onChange(broadcast);

const PLAYER_ACTIONS = {
  draw: (g, pid) => g.draw(pid),
  pickObserver: (g, pid, m) => g.pickObserver(pid, m.observerId),
  observerAck: (g, pid) => g.observerAck(pid),
  pickLevel: (g, pid, m) => g.pickLevel(pid, m.level),
  taskDone: (g, pid) => g.taskDone(pid),
  reroll: (g, pid) => g.reroll(pid),
  clearRoll: (g, pid) => g.clearRoll(pid),
  ackSpecial: (g, pid) => g.ackSpecial(pid),
  playSpecial: (g, pid, m) => g.playSpecial(pid, m.specialId, m.targetId),
  confirmClaim: (g, pid, m) => g.confirmClaim(pid, m.claimId),
  rejectClaim: (g, pid, m) => g.rejectClaim(pid, m.claimId),
  wildcardAccept: (g, pid) => g.wildcardAccept(pid),
  wildcardDecline: (g, pid) => g.wildcardDecline(pid),
  createBet: (g, pid, m) => g.createBet(pid, m),
  acceptBet: (g, pid, m) => g.acceptBet(pid, m.betId),
  voteBet: (g, pid, m) => g.voteBet(pid, m.betId, m.winnerId),
  cancelBet: (g, pid, m) => g.cancelBet(pid, m.betId),
  buyItem: (g, pid, m) => g.buyItem(pid, m.itemId, m.targetId),
  seenRules: (g, pid) => (g.seenRules(pid), { ok: true }),
  updateProfile: (g, pid, m) => g.updateProfile(pid, m),
};

const ADMIN_ACTIONS = {
  adjust: (g, m) => g.adminAdjust(m.targetId, m.delta, m.note),
  settleClaim: (g, m) => g.adminSettleClaim(m.claimId, m.confirmed),
  resolveBet: (g, m) => g.adminResolveBet(m.betId, m.winnerId),
  cancelBet: (g, m) => g.cancelBet(null, m.betId, true),
  setActive: (g, m) => g.adminSetActive(m.targetId, m.active),
  setRole: (g, m) => g.adminSetRole(m.targetId, m.role),
  voidEvent: (g, m) => g.adminVoidEvent(m.eventId, m.voided),
  clearEffect: (g, m) => g.adminClearEffect(m.effectId),
  setPhase: (g, m) => g.adminSetPhase(m.phase),
  reshuffle: (g) => g.adminReshuffle(),
  wildcardNow: (g, m) => g.offerWildcard(m.targetId || null),
  wildcardCancel: (g) => g.wildcardDecline(null, true),
  endGame: (g) => g.endGame(),
  resetParty: (g) => g.adminResetParty(),
  setConfig: (g, m) => {
    setConfig(m.patch || {});
    g.scheduleWildcard();
    g.changed();
    return { ok: true };
  },
  saveCatalog: (g, m) => {
    if (!['cards', 'wildcards', 'shopItems', 'penalties', 'specials', 'prizes', 'punishments'].includes(m.kind)) {
      return { error: 'Unbekannter Katalog.' };
    }
    if (!Array.isArray(m.list)) return { error: 'Liste erwartet.' };
    catalog.save(m.kind, m.list);
    g.changed();
    return { ok: true };
  },
};

wss.on('connection', (ws) => {
  ws.kind = 'player';
  ws.isAlive = true;
  sockets.add(ws);
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      handle(ws, msg);
    } catch (err) {
      console.error('[ws] Fehler:', err);
      ws.send(JSON.stringify({ type: 'ack', reqId: msg.reqId, error: 'Serverfehler. Nochmal versuchen.' }));
    }
  });

  ws.on('close', () => sockets.delete(ws));
});

function handle(ws, msg) {
  const reply = (payload) => ws.send(JSON.stringify({ ...payload, reqId: msg.reqId }));

  switch (msg.type) {
    case 'hello': {
      if (msg.role === 'admin') {
        // Vier Ziffern sind in Sekunden durchprobiert, und wer drin ist, kann
        // die Party zurücksetzen. Nach drei Fehlversuchen wird deshalb
        // gebremst, mit wachsender Wartezeit pro Verbindung.
        if (ws.pinWaitUntil && Date.now() < ws.pinWaitUntil) {
          const sek = Math.ceil((ws.pinWaitUntil - Date.now()) / 1000);
          return reply({ type: 'ack', error: `Zu viele Versuche. Noch ${sek} Sekunden warten.` });
        }
        if (String(msg.pin || '') !== String(getConfig().hostPin)) {
          ws.pinTries = (ws.pinTries || 0) + 1;
          if (ws.pinTries >= 3) {
            const wait = Math.min(60, 2 ** (ws.pinTries - 2)) * 1000;
            ws.pinWaitUntil = Date.now() + wait;
            console.warn(`[ws] ${ws.pinTries} Fehlversuche bei der Host-PIN, ${wait / 1000} s Sperre.`);
          }
          return reply({ type: 'ack', error: 'Falsche PIN.' });
        }
        ws.pinTries = 0;
        ws.pinWaitUntil = 0;
        ws.kind = 'admin';
        reply({ type: 'ack', ok: true });
        sendSnapshot(ws);
        return;
      }
      ws.kind = 'player';
      const player = msg.token ? game.playerByToken(msg.token) : null;
      ws.playerId = player ? player.id : null;
      if (msg.token && !player) reply({ type: 'tokenInvalid' });
      sendSnapshot(ws);
      return;
    }

    case 'join': {
      const res = game.join({ name: msg.name, cfg: msg.cfg });
      if (res.error) return reply({ type: 'ack', error: res.error });
      ws.playerId = res.player.id;
      reply({ type: 'joined', token: res.player.token, playerId: res.player.id });
      sendSnapshot(ws);
      return;
    }

    case 'action': {
      const fn = PLAYER_ACTIONS[msg.action];
      if (!fn) return reply({ type: 'ack', error: 'Unbekannte Aktion.' });
      if (!ws.playerId || !game.player(ws.playerId)) {
        return reply({ type: 'ack', error: 'Du bist nicht angemeldet.' });
      }
      const res = fn(game, ws.playerId, msg) || {};
      reply({ type: 'ack', ...res });
      if (!res.error) sendSnapshot(ws);
      return;
    }

    case 'admin': {
      if (ws.kind !== 'admin') return reply({ type: 'ack', error: 'Nicht angemeldet.' });
      const fn = ADMIN_ACTIONS[msg.action];
      if (!fn) return reply({ type: 'ack', error: 'Unbekannte Aktion.' });
      const res = fn(game, msg) || {};
      reply({ type: 'ack', ...res });
      if (!res.error) sendSnapshot(ws);
      return;
    }

    case 'ping':
      return reply({ type: 'pong' });

    default:
      return reply({ type: 'ack', error: 'Unbekannter Nachrichtentyp.' });
  }
}

/* Tote Verbindungen aufräumen, Handys gehen in Standby. */
setInterval(() => {
  for (const ws of sockets) {
    if (!ws.isAlive) {
      ws.terminate();
      sockets.delete(ws);
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* egal */
    }
  }
}, 20000);

setInterval(() => game.tick(), 5000);

/* ── Start ────────────────────────────────────────────────── */

server.listen(PORT, '0.0.0.0', async () => {
  const url = partyUrl();
  const addresses = lanAddresses();

  console.log('');
  console.log('  🎀  BBB · Buki\'s Birthday Bash');
  console.log('  ─────────────────────────────────────────');
  console.log(`  Gäste:          ${url}`);
  for (const a of addresses.slice(1)) console.log(`  auch über:      http://${a.address}:${PORT}  (${a.name})`);
  console.log(`  Host-Admin:     ${url}/admin        PIN ${getConfig().hostPin}`);
  console.log('  ─────────────────────────────────────────');
  console.log('  Auf diesem MacBook geht auch http://localhost:' + PORT + '.');
  console.log('  Die Handys der Gäste brauchen aber die IP-Adresse oben.');
  console.log('');

  // Eine data/config.json überschreibt die Standardwerte still. Wenn dort etwas
  // Abweichendes steht, soll man das beim Start sehen und nicht erst merken,
  // wenn den ganzen Abend keine Special Card kommt.
  const changed = Object.keys({ ...DEFAULTS, ...getConfig() }).filter(
    (k) => JSON.stringify(DEFAULTS[k]) !== JSON.stringify(getConfig()[k]),
  );
  if (changed.length) {
    console.log('  Abweichende Einstellungen:');
    for (const k of changed) {
      console.log(`    ${k}: ${JSON.stringify(DEFAULTS[k])} → ${JSON.stringify(getConfig()[k])}`);
    }
    console.log('');
  }

  // Ein leerer Katalog fällt sonst erst auf, wenn der erste Gast zieht.
  const counts = {
    Karten: catalog.enabled('cards').length,
    Sonderaufträge: catalog.enabled('wildcards').length,
    Strafkarten: catalog.enabled('penalties').length,
    'Shop-Items': catalog.enabled('shopItems').length,
    Preise: catalog.enabled('prizes').length,
    Strafen: catalog.enabled('punishments').length,
  };
  const leer = Object.entries(counts).filter(([, n]) => n === 0).map(([k]) => k);
  console.log(`  Katalog: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  if (leer.length) console.log(`  ⚠️  Leer und damit wirkungslos: ${leer.join(', ')}`);
  console.log('');

  try {
    console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
    const qrFile = path.join(ROOT, 'qr-party.png');
    await QRCode.toFile(qrFile, url, { width: 1000, margin: 2 });
    console.log(`  QR zum Ausdrucken: ${qrFile}`);
  } catch (err) {
    console.warn('  QR-Code konnte nicht erzeugt werden:', err.message);
  }
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n[bbb] Spielstand wird gesichert …');
    persistNow(game.state);
    process.exit(0);
  });
}

/**
 * Ein Absturz mitten in der Party ist schlimmer als ein Fehler, den niemand
 * merkt: alle zwölf Handys verlieren gleichzeitig die Verbindung und der Host
 * muss im Terminal nachsehen. Deshalb wird hier aufgefangen statt beendet.
 *
 * Das ist vertretbar, weil der Zustand ein Event-Log ist: eine abgebrochene
 * Aktion hinterlässt kein halb geschriebenes Ergebnis, sondern schlicht kein
 * Event. Der Spielstand wird sofort gesichert, damit ein späterer harter
 * Abbruch nichts mitnimmt.
 */
function survive(kind, err) {
  console.error(`\n[bbb] ${kind}:`, err);
  console.error('[bbb] Der Server läuft weiter. Bitte im Admin prüfen, ob die letzte Aktion angekommen ist.\n');
  try {
    persistNow(game.state);
  } catch (e) {
    console.error('[bbb] Spielstand konnte nicht gesichert werden:', e.message);
  }
}

process.on('uncaughtException', (err) => survive('Unerwarteter Fehler', err));
process.on('unhandledRejection', (err) => survive('Unbehandelte Zusage', err));

// Eine Sicherung, die nie ausgelöst wurde, ist eine Behauptung. Mit
// BBB_CRASH_TEST=1 wirft der Server absichtlich einmal aus einem Timer heraus,
// also genau dort, wo kein try/catch greift. scripts/smoke-test.mjs prüft
// damit, dass er danach noch antwortet. Ohne die Variable passiert nichts.
if (process.env.BBB_CRASH_TEST) {
  setTimeout(() => {
    throw new Error('Testabsturz: absichtlich geworfen, um die Sicherung zu prüfen.');
  }, 600);
}
