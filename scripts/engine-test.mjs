/**
 * Prüft die Spiellogik direkt, ohne Server und ohne WebSocket. Ergänzt
 * scripts/smoke-test.mjs: der testet die Verkabelung, dieser hier die Regeln,
 * inklusive der Fälle, die über die Oberfläche kaum herzustellen sind.
 *
 * Läuft mit BBB_STATE_FILE=none, schreibt also nie in den echten Spielstand.
 *
 *   node scripts/engine-test.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Eigene Ablage: weder der echte Spielstand noch die echte Konfiguration
// dürfen von einem Testlauf angefasst werden.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bbb-test-'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Auf einer Kopie des Katalogs arbeiten. Der Test schaltet unten Karten und
// Shop-Items um; auf dem Original wäre ein Absturz mittendrin ein Datenverlust.
fs.cpSync(path.join(HERE, '..', 'server', 'data'), path.join(TMP, 'data'), { recursive: true });
fs.rmSync(path.join(TMP, 'data', 'state.json'), { force: true });
fs.rmSync(path.join(TMP, 'data', 'state.backup.json'), { force: true });
fs.rmSync(path.join(TMP, 'data', 'config.json'), { force: true });
process.env.BBB_DATA_DIR = path.join(TMP, 'data');
process.env.BBB_STATE_FILE = 'none';
process.env.BBB_CONFIG_FILE = path.join(TMP, 'config.json');
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const { Game, BUCKET_NAMES, KNOWN_EFFECTS, KNOWN_SPECIALS } = await import('../server/game.js');
const { getConfig, setConfig } = await import('../server/config.js');
const catalog = await import('../server/catalog.js');
const { findNames } = await import('../client/src/lib/names.js');

let pass = 0;
let fail = 0;
const failed = [];

function check(label, cond, extra = '') {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    failed.push(label);
  }
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${extra ? ` :: ${extra}` : ''}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}`);
}

const CFG = { skin: 0, hair: 0, style: 0, acc: 0, outfit: 0, fur: 0, pattern: 0 };

// Special Cards kommen sonst mit 5 Prozent dazwischen und machen die Läufe
// zufällig. Sie bekommen unten einen eigenen Abschnitt.
const SPECIAL_CHANCE = getConfig().specialChance;
setConfig({ specialChance: 0 });

/** Frische Runde mit n Gästen, alle mit 0 Punkten. */
function party(n, names = null) {
  const g = new Game();
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const name = names ? names[i] : `P${i + 1}`;
    ids.push(g.join({ name, cfg: CFG }).player.id);
  }
  return { g, ids };
}

/** Eine Karte komplett durchspielen, inklusive Abnahme. */
function playCard(g, pid, level, confirm = true) {
  // Eine Special Card kommt statt einer Karte und lässt den Zug auf „idle“.
  // Wegklicken und nochmal ziehen, sonst hängt der Helfer an der Zufallschance.
  for (let guard = 0; guard < 20; guard += 1) {
    g.draw(pid);
    if (!g.turn(pid).pendingSpecial) break;
    g.ackSpecial(pid);
  }
  if (g.turn(pid).status === 'chooseObserver') {
    const other = g.state.players.find((p) => p.id !== pid);
    g.pickObserver(pid, other.id);
  }
  g.observerAck(pid);
  g.pickLevel(pid, level);
  g.taskDone(pid);
  const claim = g.state.claims.at(-1);
  for (const oid of claim.observerIds) {
    if (confirm) g.confirmClaim(oid, claim.id);
    else g.rejectClaim(oid, claim.id);
  }
  return claim;
}

/* ══ Katalog ═══════════════════════════════════════════════ */

section('Katalog');
{
  const cards = catalog.all('cards');
  check('Karten vorhanden', cards.length >= 60, String(cards.length));
  check(
    'jede Karte hat alle drei Stufen',
    cards.every((c) => ['1', '5', '10'].every((k) => c.levels?.[k]?.text?.trim())),
  );
  check('Karten-IDs eindeutig', new Set(cards.map((c) => c.id)).size === cards.length);
  check(
    'keine Platzhalter mehr im Katalog',
    !JSON.stringify(cards).includes('PLATZHALTER'),
  );
  check(
    'keine Timer auf normalen Karten',
    cards.every((c) => Object.values(c.levels).every((l) => !l.timerSec)),
  );
  check(
    'keine langen Striche in Kartentexten',
    // Em-Dash, En-Dash, Horizontal Bar. Als Escape geschrieben, damit die
    // Datei selbst keinen enthält.
    !/[\u2014\u2013\u2015]/.test(JSON.stringify(cards)),
  );
  check(
    'keine Namen in den Kartentexten',
    cards.every((c) => Object.values(c.levels).every((l) => findNames(l.text, []).length === 0)),
  );

  const wilds = catalog.all('wildcards');
  check('Sonderaufträge vorhanden', wilds.length >= 10, String(wilds.length));
  check('Sonderaufträge haben zwei Beobachter', wilds.every((w) => w.observerCount === 2));

  // Jedes Shop-Item muss eine Wirkung haben, die die Engine auch kennt.
  const IMPLEMENTED = new Set([
    'forceLevel10', 'rerollBlock', 'penalty', 'chooseObserver', 'rerollDiscount',
    'doublePoints', 'peek', 'immunity', 'redirect',
  ]);
  const shop = catalog.all('shopItems');
  check('Shop-Items vorhanden', shop.length > 0, String(shop.length));
  check(
    'jedes Shop-Item hat eine implementierte Wirkung',
    shop.every((i) => IMPLEMENTED.has(i.effect)),
    shop.filter((i) => !IMPLEMENTED.has(i.effect)).map((i) => i.effect).join(', '),
  );
  check('jedes Shop-Item hat einen Preis', shop.every((i) => Number.isFinite(i.price) && i.price > 0));

  const prizes = catalog.all('prizes');
  check('drei Preise, Plätze 1 bis 3', [1, 2, 3].every((n) => prizes.some((p) => p.place === n)));
  const puns = catalog.all('punishments');
  const TIERS = ['Knapp vorbei', 'Mitläufer', 'Solide enttäuschend', 'Endboss der Schande'];
  check('für jede Verliererstufe eine Strafe', TIERS.every((t) => puns.some((p) => p.label === t)));
  check('Härtegrade 1 bis 4 vergeben', [1, 2, 3, 4].every((n) => puns.some((p) => p.severity === n)));
}

/* ══ Punkte ════════════════════════════════════════════════ */

section('Punkte kommen nur aus dem Event-Log');
{
  const { g, ids } = party(3);
  const [a] = ids;
  check('Start bei null', g.score(a) === 0);
  playCard(g, a, 5);
  check('Stufe 2 bringt 5', g.score(a) === 5, String(g.score(a)));
  playCard(g, a, 10);
  check('Stufe 3 bringt 10 dazu', g.score(a) === 15, String(g.score(a)));

  const ev = g.state.events.find((e) => e.type === 'TASK_CONFIRMED');
  g.adminVoidEvent(ev.id, true);
  check('Entwerten senkt den Stand', g.score(a) === 10, String(g.score(a)));
  g.adminVoidEvent(ev.id, false);
  check('Zurücknehmen stellt ihn wieder her', g.score(a) === 15, String(g.score(a)));

  const stats = g.playerStats(a);
  check('Bilanz zählt beide Stufen', stats.done[5] === 1 && stats.done[10] === 1);
  check('Bilanz zählt die Summe', stats.total === 2);
}

/* ══ Abnahme ═══════════════════════════════════════════════ */

section('Abnahme durch Beobachter');
{
  const { g, ids } = party(4);
  const [a] = ids;
  const claim = playCard(g, a, 10, false);
  check('Ablehnung gibt keine Punkte', g.score(a) === 0, String(g.score(a)));
  check('Claim ist abgelehnt', claim.status === 'rejected', claim.status);
  check('Zug ist danach wieder frei', g.turn(a).status === 'idle', g.turn(a).status);

  // Zwei Beobachter beim Sonderauftrag: einer reicht nicht
  const { g: g2, ids: ids2 } = party(4);
  const [b] = ids2;
  g2.offerWildcard(b);
  g2.wildcardAccept(b);
  check('Sonderauftrag läuft', g2.turn(b).status === 'reveal', g2.turn(b).status);
  check('zwei Beobachter zugelost', g2.turn(b).observerIds.length === 2);
  g2.taskDone(b);
  const wc = g2.state.claims.at(-1);
  g2.confirmClaim(wc.observerIds[0], wc.id);
  check('ein Beobachter reicht nicht', g2.score(b) === 0, String(g2.score(b)));
  g2.confirmClaim(wc.observerIds[1], wc.id);
  check('beide zusammen geben 25', g2.score(b) === 25, String(g2.score(b)));
}

/* ══ Reroll ════════════════════════════════════════════════ */

section('Reroll: drei pro Karte, Faktor steigt');
{
  const { g, ids } = party(3);
  const [a] = ids;
  const cfg = getConfig();
  g.draw(a); g.observerAck(a); g.pickLevel(a, 1);

  const factors = [];
  for (let i = 0; i < cfg.rerollLimitPerCard; i += 1) {
    const r = g.reroll(a);
    factors.push(r.factor);
    g.draw(a); g.observerAck(a); g.pickLevel(a, 1);
  }
  check('Faktor steigt 1, 2, 3', factors.join(',') === '1,2,3', factors.join(','));
  check('vierter Reroll wird abgelehnt', !!g.reroll(a).error);
  check('kein Reroll mehr übrig', g.rerollsLeft(a) === 0);
  check('Punkte sind im Minus', g.score(a) < 0, String(g.score(a)));

  g.taskDone(a);
  check('Zähler startet nach der Karte neu', g.rerollsLeft(a) === cfg.rerollLimitPerCard);
  check('Faktor wieder bei 1', g.rerollFactor(a) === 1);
}

/* ══ Shop-Effekte über den Reroll hinweg ═══════════════════ */

section('Gekaufte Effekte überleben einen Reroll');
{
  const { g, ids } = party(3);
  const [a, o] = ids;
  g.adminAdjust(a, 200, 'setup');

  g.buyItem(a, 'item-forcelevel', o);
  g.draw(o); g.observerAck(o);
  check('Zwangsstufe greift sofort', g.turn(o).forcedLevel === 10);
  g.pickLevel(o, 10);
  g.reroll(o); g.draw(o); g.observerAck(o);
  check('Zwangsstufe überlebt den Reroll', g.turn(o).forcedLevel === 10, String(g.turn(o).forcedLevel));
  check('andere Stufe bleibt gesperrt', !!g.pickLevel(o, 1).error);
  g.pickLevel(o, 10); g.taskDone(o); g.draw(o);
  check('nach der Karte wieder frei', g.turn(o).forcedLevel === null, String(g.turn(o).forcedLevel));

  const { g: g2, ids: ids2 } = party(3);
  const [b] = ids2;
  g2.adminAdjust(b, 200, 'setup');
  g2.buyItem(b, 'item-peek');
  g2.draw(b);
  check('Spickzettel beim ersten Zug da', !!g2.turn(b).peek);
  g2.observerAck(b); g2.pickLevel(b, 1);
  g2.reroll(b); g2.draw(b);
  check('Spickzettel überlebt den Reroll', !!g2.turn(b).peek);
  g2.observerAck(b); g2.pickLevel(b, 1); g2.taskDone(b); g2.draw(b);
  check('Spickzettel danach verbraucht', !g2.turn(b).peek);

  const { g: g3, ids: ids3 } = party(3);
  const [c, other] = ids3;
  g3.adminAdjust(c, 200, 'setup');
  g3.buyItem(c, 'item-chooseobserver');
  g3.draw(c);
  check('Beobachter-Wahl beim ersten Zug', g3.turn(c).status === 'chooseObserver');
  g3.pickObserver(c, other); g3.observerAck(c); g3.pickLevel(c, 1);
  g3.reroll(c); g3.draw(c);
  check('Beobachter-Wahl überlebt den Reroll', g3.turn(c).status === 'chooseObserver', g3.turn(c).status);
  g3.pickObserver(c, other); g3.observerAck(c); g3.pickLevel(c, 1); g3.taskDone(c); g3.draw(c);
  check('Beobachter-Wahl danach verbraucht', g3.turn(c).status === 'observer', g3.turn(c).status);

  const { g: g4, ids: ids4 } = party(3);
  const [d] = ids4;
  g4.draw(d); g4.observerAck(d); g4.pickLevel(d, 1);
  g4.reroll(d); g4.draw(d);
  const t = g4.turn(d);
  check('ohne Kauf kein Zwang und kein Spickzettel', t.forcedLevel === null && !t.peek && t.status === 'observer');
}

/* ══ Shop ══════════════════════════════════════════════════ */

section('Shop: Preise, Immunität, Fremdeffekt-Grenze');
{
  const { g, ids } = party(4);
  const [a, o, c] = ids;
  g.adminAdjust(a, 200, 'setup');
  g.adminAdjust(c, 200, 'setup');

  const before = g.score(a);
  const item = catalog.all('shopItems').find((i) => i.id === 'item-rerollblock');
  g.buyItem(a, 'item-rerollblock', o);
  check('Preis wird abgezogen', g.score(a) === before - item.price, String(g.score(a)));
  check('Effekt liegt beim Ziel', g.hasEffect(o, 'rerollBlock'));
  check('nur ein Fremdeffekt gleichzeitig', !!g.buyItem(c, 'item-forcelevel', o).error);
  check('nichts auf sich selbst', !!g.buyItem(a, 'item-forcelevel', a).error);

  g.buyItem(c, 'item-immunity');
  check('Immunität liegt bei einem selbst', g.hasEffect(c, 'immunity'));
  check('Immunität prallt ab', !!g.buyItem(a, 'item-forcelevel', c).error);

  // Standard ist shopAllowNegative: man darf sich ins Minus kaufen.
  const poor = ids[3];
  check('Standard erlaubt den Kauf ins Minus', !!g.buyItem(poor, 'item-doublepoints').ok);
  setConfig({ shopAllowNegative: false });
  const poorer = ids[2];
  g.adminAdjust(poorer, -g.score(poorer) - 5, 'ins Minus');
  check('abgeschaltet greift die Punktegrenze', !!g.buyItem(poorer, 'item-doublepoints').error);
  setConfig({ shopAllowNegative: true });
}

section('Doppelpunkte zählen doppelt');
{
  const { g, ids } = party(3);
  const [a] = ids;
  g.adminAdjust(a, 200, 'setup');
  const item = catalog.all('shopItems').find((i) => i.id === 'item-doublepoints');
  const before = g.score(a);
  g.buyItem(a, 'item-doublepoints');
  playCard(g, a, 10);
  check('Stufe 3 bringt 20 statt 10', g.score(a) === before - item.price + 20, String(g.score(a)));
}

/* ══ Wetten ════════════════════════════════════════════════ */

section('Black Market ohne Escrow');
{
  const { g, ids } = party(3);
  const [a, b] = ids;
  g.adminAdjust(a, 50, 'setup');
  g.adminAdjust(b, 50, 'setup');
  const aPre = g.score(a);
  const bPre = g.score(b);

  check('Einsatz über dem Limit wird abgelehnt', !!g.createBet(a, { text: 'zu viel', stake: 999 }).error);
  g.createBet(a, { text: 'Wette', stake: 10 });
  const bet = g.state.bets.at(-1);
  check('eigene Wette nicht annehmbar', !!g.acceptBet(a, bet.id).error);
  g.acceptBet(b, bet.id);
  check('Einsatz bei A sofort weg', g.score(a) === aPre - 10, String(g.score(a)));
  check('Einsatz bei B sofort weg', g.score(b) === bPre - 10, String(g.score(b)));

  g.voteBet(a, bet.id, a);
  check('eine Stimme löst nicht auf', g.score(a) === aPre - 10);
  g.voteBet(b, bet.id, a);
  check('Gewinner holt den ganzen Pott', g.score(a) === aPre + 10, String(g.score(a)));
  check('Verlierer bleibt im Minus', g.score(b) === bPre - 10, String(g.score(b)));

  g.createBet(a, { text: 'wird storniert', stake: 7 });
  const bet2 = g.state.bets.at(-1);
  const a2 = g.score(a);
  const b2 = g.score(b);
  g.acceptBet(b, bet2.id);
  g.cancelBet(null, bet2.id, true);
  check('Storno gibt beiden den Einsatz zurück', g.score(a) === a2 && g.score(b) === b2);
}

/* ══ Rollen-Karten ═════════════════════════════════════════ */

section('Karten nur für das Geburtstagskind');
{
  const { g } = party(2);
  const guest = new Set();
  const bday = new Set();
  for (let i = 0; i < 3000; i += 1) {
    g.state.drawn = [];
    guest.add(g.takeCard('guest').category);
    g.state.drawn = [];
    bday.add(g.takeCard('birthday').category);
  }
  check('Gäste ziehen nie Geburtstagskarten', !guest.has('geburtstagskind'));
  check('Das Geburtstagskind zieht sie', bday.has('geburtstagskind'));
  check('Das Geburtstagskind zieht auch alles andere', bday.size > guest.size, `${bday.size} vs ${guest.size}`);
}

/* ══ Auswertung ════════════════════════════════════════════ */

section('Auswertung: Podium, Stufen, Preise, Strafen');
{
  for (const n of [13, 11, 8, 6, 5, 4, 3]) {
    const { g, ids } = party(n);
    ids.forEach((id, i) => g.adminAdjust(id, (n - i) * 5 + 3, 'setup'));
    const r = g.computeResult();

    const podiumOk = r.podium.length === Math.min(3, n)
      && r.podium.every((p, i) => i === 0 || r.podium[i - 1].score >= p.score);
    const prizesOk = r.podium.every((p, i) => p.prize && p.prize.place === i + 1);
    const punsOk = r.losers.every((p) => p.punishment && p.punishment.label === p.bucketLabel);

    // Die härteste Strafe muss ganz unten landen, nicht beim besten Verlierer
    const severities = r.losers.map((p) => p.punishment?.severity ?? 0);
    const monotone = severities.every((s, i) => i === 0 || s >= severities[i - 1]);
    const lastIsWorst = r.losers.length === 0 || severities.at(-1) === Math.max(...severities);

    check(
      `${String(n).padStart(2)} Spieler: Podium, Preise, Strafen, Härte steigt nach unten`,
      podiumOk && prizesOk && punsOk && monotone && lastIsWorst,
      `Stufen ${r.buckets}, Härte ${severities.join('')}`,
    );
  }
}

/* ══ Namensprüfung ═════════════════════════════════════════ */

section('Namenserkennung im Karten-Editor');
{
  const gaeste = [{ name: 'Robby', role: 'guest' }, { name: 'Buki', role: 'birthday' }];
  check('Gast wird erkannt', findNames('Trink Robby das Bier weg.', gaeste).length === 1);
  check('Genitiv wird erkannt', findNames('Robbys Bier gehört dir.', gaeste).length === 1);
  check('Groß- und Kleinschreibung egal', findNames('trink mit ROBBY.', gaeste).length === 1);
  check('Vorname aus der Liste', findNames('Erzähl Devin vom Universum.', []).length === 1);
  check('Geburtstagskind ist ausgenommen', findNames('Trink mit Buki einen Shot.', gaeste).length === 0);
  check('neutrale Formulierung ist sauber', findNames('Die Person links von dir mixt dir etwas.', gaeste).length === 0);
  check('„Max 5“ ist kein Name', findNames('Ein Shot pro Person. Max 5.', []).length === 0);
  check('leerer Text ist sauber', findNames('', gaeste).length === 0);
}

/* ══ Kartenpool ════════════════════════════════════════════ */

section('Kartenpool');
{
  const { g, ids } = party(2);
  const [a] = ids;
  const total = catalog.enabled('cards').filter((c) => !c.onlyRole).length;
  for (let i = 0; i < total + 5; i += 1) {
    g.draw(a);
    g.turn(a).status = 'reveal';
    g.turn(a).level = 1;
    g.taskDone(a);
    const cl = g.state.claims.at(-1);
    for (const oid of cl.observerIds) g.confirmClaim(oid, cl.id);
  }
  check('Pool mischt neu statt auszugehen', g.state.drawn.length <= total, String(g.state.drawn.length));
  check('Neumischen steht im Protokoll', g.state.events.some((e) => e.type === 'POOL_RESHUFFLED'));
}

/* ══ Special Cards ═════════════════════════════════════════ */

section('Special Cards');
{
  const { g, ids } = party(3);
  const [a, o] = ids;
  g.adminAdjust(a, 200, 'setup');
  g.buyItem(a, 'item-peek');
  g.buyItem(a, 'item-chooseobserver');

  // Zuerst einen Reroll verbrauchen, dann eine Special Card erzwingen
  g.draw(a);
  g.pickObserver(a, o);
  g.observerAck(a);
  g.pickLevel(a, 1);
  g.reroll(a);
  check('Reroll gezählt', g.turn(a).rerolls === 1);

  setConfig({ specialChance: 1 });
  g.draw(a);
  check('Special Card statt Karte', !!g.turn(a).pendingSpecial);
  check('Special Card kostet keinen Reroll', g.turn(a).rerolls === 1, String(g.turn(a).rerolls));
  check('Special Card landet auf der Hand', g.player(a).heldSpecials.length === 1);
  g.ackSpecial(a);
  check('Bestätigen räumt den Hinweis weg', !g.turn(a).pendingSpecial);

  setConfig({ specialChance: 0 });
  g.draw(a);
  check('gekaufter Spickzettel ist noch da', !!g.turn(a).peek);
  check('gekaufte Beobachter-Wahl ist noch da', g.turn(a).status === 'chooseObserver');
  check('Reroll-Zähler steht weiter auf 1', g.turn(a).rerolls === 1);

  // Joker streicht die laufende Aufgabe
  const { g: g2, ids: ids2 } = party(3);
  const [b] = ids2;
  g2.player(b).heldSpecials.push('sp-joker');
  g2.draw(b);
  check('Aufgabe läuft', g2.turn(b).status !== 'idle');
  g2.playSpecial(b, 'sp-joker');
  check('Joker streicht die Aufgabe', g2.turn(b).status === 'idle', g2.turn(b).status);
  check('Joker kostet keine Punkte', g2.score(b) === 0, String(g2.score(b)));
  check('Joker ist danach weg', !g2.player(b).heldSpecials.includes('sp-joker'));

  // Punkte-Raub
  const { g: g3, ids: ids3 } = party(3);
  const [c, victim] = ids3;
  g3.adminAdjust(victim, 40, 'setup');
  g3.player(c).heldSpecials.push('sp-steal');
  const vBefore = g3.score(victim);
  const cBefore = g3.score(c);
  g3.playSpecial(c, 'sp-steal', victim);
  check('Raub nimmt dem Opfer Punkte', g3.score(victim) === vBefore - 15, String(g3.score(victim)));
  check('Raub gibt sie dem Dieb', g3.score(c) === cBefore + 15, String(g3.score(c)));
}

/* ══ Wiederherstellung ═════════════════════════════════════ */

section('Zustand übersteht einen Neustart');
{
  const { g, ids } = party(3);
  const [a] = ids;
  playCard(g, a, 10);
  const snap = JSON.parse(JSON.stringify(g.state));
  const g2 = new Game();
  g2.state = snap;
  check('Punkte bleiben nach dem Laden gleich', g2.score(a) === g.score(a), `${g2.score(a)} vs ${g.score(a)}`);
  check('Spieler sind wieder da', g2.state.players.length === 3);
  check('Zug-Objekt wird nachgezogen', !!g2.turn('gibt-es-nicht'));
}

/* ══ Markt-Hinweis ═════════════════════════════════════════ */

section('Der Hinweis auf den Markt');
{
  const { g, ids } = party(3);
  const [a] = ids;
  const billigstes = Math.min(...catalog.enabled('shopItems').map((i) => i.price));

  check('Ohne Punkte kein Hinweis', g.snapshotFor(a).shopHint === false, String(g.snapshotFor(a).shopHint));

  g.adminAdjust(a, billigstes, 'setup');
  check('Sobald etwas erschwinglich ist, kommt er', g.snapshotFor(a).shopHint === true);

  // Nach dem ersten Kauf ist der Hinweis erledigt, auch wenn noch Geld da ist.
  g.adminAdjust(a, 500, 'setup');
  const item = catalog.enabled('shopItems').find((i) => !i.requiresTarget);
  g.buyItem(a, item.id);
  check('Nach dem ersten Kauf ist er weg', g.snapshotFor(a).shopHint === false, String(g.snapshotFor(a).shopHint));
  check('Der Kauf steht in der Bilanz', g.snapshotFor(a).me.stats.purchases === 1, String(g.snapshotFor(a).me.stats.purchases));

  // Abgeschalteter Shop schweigt.
  const { g: g2, ids: ids2 } = party(3);
  g2.adminAdjust(ids2[0], 500, 'setup');
  setConfig({ shopEnabled: false });
  check('Bei geschlossenem Shop kein Hinweis', g2.snapshotFor(ids2[0]).shopHint === false);
  setConfig({ shopEnabled: true });
}

/* ══ Host-Checkliste ═══════════════════════════════════════ */

section('Was der Host oben im Admin sieht');
{
  const text = (g) => g.hostChecks().map((c) => c.text).join(' | ');

  // Rollenkarten ohne passende Rolle: die liegen sonst still im Stapel.
  const { g, ids } = party(3);
  const roleCards = catalog.enabled('cards').filter((c) => c.onlyRole === 'birthday').length;
  check('Rollenkarten gibt es überhaupt', roleCards > 0, String(roleCards));
  check('Warnung ohne Geburtstagskind', /Geburtstagskind/.test(text(g)), text(g));
  g.adminSetRole(ids[0], 'birthday');
  check('Warnung verschwindet mit der Rolle', !/Geburtstagskind/.test(text(g)), text(g));

  // Eine pausierte Rolle zählt nicht, die Person spielt ja nicht mehr mit.
  g.adminSetActive(ids[0], false);
  check('Pausiertes Geburtstagskind warnt wieder', /Geburtstagskind/.test(text(g)), text(g));
  g.adminSetActive(ids[0], true);

  // Ohne zweite aktive Person kann niemand abnehmen.
  const solo = party(2);
  solo.g.adminSetRole(solo.ids[0], 'birthday');
  solo.g.adminSetActive(solo.ids[1], false);
  check('Warnung bei nur einer aktiven Person', /eine Person ist aktiv/.test(text(solo.g)), text(solo.g));

  // Abgeschaltete Bereiche sollen sichtbar sein, sind aber kein Fehler.
  setConfig({ shopEnabled: false });
  const off = g.hostChecks().find((c) => /Abgeschaltet/.test(c.text));
  check('Abgeschalteter Shop taucht auf', !!off, text(g));
  check('Abgeschaltet ist nur ein Hinweis', off?.level === 'note', off?.level);
  setConfig({ shopEnabled: true });

  // Ein Shop-Item mit unbekannter Wirkung kostet Punkte und tut nichts.
  const shop = catalog.all('shopItems');
  const backup = JSON.parse(JSON.stringify(shop));
  catalog.save('shopItems', [...backup, {
    id: 'item-kaputt', name: 'Kaputt', description: '', price: 5,
    requiresTarget: false, effect: 'gibtEsNicht', enabled: true,
  }]);
  check('Wirkungsloses Shop-Item wird gemeldet', /ohne Wirkung/.test(text(g)), text(g));
  catalog.save('shopItems', backup);
  check('Nach dem Aufräumen wieder still', !/ohne Wirkung/.test(text(g)), text(g));
  check('Shop-Katalog unverändert', catalog.all('shopItems').length === backup.length);

  // Eine vollständig aufgeräumte Runde meldet nichts.
  const clean = party(4);
  clean.g.adminSetRole(clean.ids[0], 'birthday');
  check('Saubere Runde meldet nichts', clean.g.hostChecks().length === 0, text(clean.g));

  // Jeder Eintrag ist anzeigbar: Stufe bekannt, Text vorhanden.
  const shapes = solo.g.hostChecks();
  check('Jede Zeile hat Stufe und Text', shapes.every((c) => ['warn', 'note'].includes(c.level) && c.text));
}

/* ══ Spickzettel ═══════════════════════════════════════════ */

section('Spickzettel');
{
  const { cheatSheet } = await import('../server/sheet.js');
  const html = cheatSheet({ url: 'http://10.0.0.5:3000', pin: '1234', config: getConfig(), catalog });
  check('Adresse steht drauf', html.includes('http://10.0.0.5:3000'));
  check('PIN steht drauf', html.includes('1234'));
  check('Preise stehen drauf', html.includes(catalog.enabled('prizes')[0].title));
  check('Strafen stehen drauf', html.includes(catalog.enabled('punishments')[0].label));
  check('Shop-Preise stehen drauf', html.includes(catalog.enabled('shopItems')[0].name));
  check('Kein undefined im Ausdruck', !html.includes('undefined'));
  check('Keine langen Striche', !/[\u2014\u2013\u2015]/.test(html));
  check('Sauber geschlossen', html.trimEnd().endsWith('</html>'));
}

/* ══ Listen gegen den Code ═════════════════════════════════ */

section('Die Listen stimmen noch mit dem Code überein');
{
  // Diese drei Listen werden von Hand gepflegt und vom Katalog-Prüfer genutzt.
  // Läuft eine davon dem Code davon, prüft lint-data.mjs stillschweigend
  // gegen eine Behauptung statt gegen die Wirklichkeit.
  const src = fs.readFileSync(path.join(HERE, '..', 'server', 'game.js'), 'utf8');

  const ausSwitch = [...src.matchAll(/case '(sp-[a-z]+)':/g)].map((m) => m[1]).sort();
  check('KNOWN_SPECIALS deckt jeden Fall im Code ab', ausSwitch.every((id) => KNOWN_SPECIALS.includes(id)), ausSwitch.join(','));
  check('KNOWN_SPECIALS erfindet nichts dazu', KNOWN_SPECIALS.every((id) => ausSwitch.includes(id)), KNOWN_SPECIALS.join(','));

  const ausEffekten = [...src.matchAll(/(?:takeEffect|hasEffect)\([^,]+, '([a-zA-Z0-9]+)'/g)].map((m) => m[1]);
  const fehlend = [...new Set(ausEffekten)].filter((e) => !KNOWN_EFFECTS.includes(e));
  check('KNOWN_EFFECTS kennt jede abgefragte Wirkung', fehlend.length === 0, fehlend.join(','));

  // Jede Stufenzahl braucht genau so viele Namen, wie sie Stufen hat.
  const stufig = Object.entries(BUCKET_NAMES).every(([n, list]) => list.length === Number(n));
  check('BUCKET_NAMES hat je Stufenzahl die passende Menge Namen', stufig);
  check('Der letzte Name ist überall derselbe',
    Object.values(BUCKET_NAMES).every((l) => l[l.length - 1] === 'Endboss der Schande'));

  // Die Strafen müssen alle Namen abdecken, sonst bekommt jemand nichts.
  const labels = new Set(catalog.enabled('punishments').map((p) => p.label));
  const alle = [...new Set(Object.values(BUCKET_NAMES).flat())];
  check('Jede Verlierer-Stufe hat eine Strafe', alle.every((n) => labels.has(n)),
    alle.filter((n) => !labels.has(n)).join(','));

  // Und die Auswertung muss sie auch wirklich finden.
  const { g } = party(11);
  g.endGame();
  const ohne = (g.state.result.losers || []).filter((l) => !l.punishment);
  check('Jeder Verlierer bekommt eine Strafe zugeordnet', ohne.length === 0, ohne.map((l) => l.bucketLabel).join(','));
  const ohnePreis = (g.state.result.podium || []).filter((p) => !p.prize);
  check('Jeder Podiumsplatz bekommt einen Preis', ohnePreis.length === 0, String(ohnePreis.length));
}

setConfig({ specialChance: SPECIAL_CHANCE });

/* ══ Ergebnis ══════════════════════════════════════════════ */

console.log(`\n${fail === 0 ? '✅ Alle Prüfungen bestanden.' : `❌ ${fail} Prüfung(en) fehlgeschlagen:\n   ${failed.join('\n   ')}`}\n`);
process.exit(fail === 0 ? 0 : 1);
