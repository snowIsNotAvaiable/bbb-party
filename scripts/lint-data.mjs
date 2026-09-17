/**
 * Prüft die Inhalte unter server/data/ gegen das, was der Code daraus macht.
 *
 * Der Unterschied zu den beiden Testsuiten: die prüfen die Regeln, dieser hier
 * prüft die Karten. Ein Tippfehler in einer JSON-Datei bricht nichts, er wirkt
 * einfach nicht, und das merkt man am Abend entweder gar nicht oder zu spät.
 * Genau solche stummen Fehler sucht dieses Skript.
 *
 *   npm run lint:data
 *
 * Liest nur, schreibt nie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.BBB_DATA_DIR ? path.resolve(process.env.BBB_DATA_DIR) : path.join(ROOT, 'server', 'data');

const { BUCKET_NAMES, KNOWN_EFFECTS, KNOWN_SPECIALS } = await import('../server/game.js');
const { findNames } = await import('../client/src/lib/names.js');
const { DEFAULTS } = await import('../server/config.js');

const problems = [];
const notes = [];
const fail = (where, text) => problems.push({ where, text });
const hint = (where, text) => notes.push({ where, text });

function read(file) {
  const full = path.join(DATA, file);
  if (!fs.existsSync(full)) {
    fail(file, 'Datei fehlt.');
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(parsed)) {
      fail(file, 'Die Datei muss eine Liste enthalten.');
      return [];
    }
    return parsed;
  } catch (err) {
    fail(file, `Nicht lesbar: ${err.message}`);
    return [];
  }
}

const cards = read('cards.json');
const wildcards = read('wildcards.json');
const specials = read('specials.json');
const shopItems = read('shopItems.json');
const penalties = read('penalties.json');
const prizes = read('prizes.json');
const punishments = read('punishments.json');

/* ── allgemeine Regeln ────────────────────────────────────── */

function uniqueIds(list, file) {
  const seen = new Set();
  for (const e of list) {
    if (!e.id) fail(file, `Ein Eintrag hat keine id: ${JSON.stringify(e).slice(0, 60)}`);
    else if (seen.has(e.id)) fail(file, `Die id „${e.id}" kommt doppelt vor.`);
    else seen.add(e.id);
  }
}

/** Jeder Text, der auf einem Handy landet, wird hier mitgeprüft. */
function everyText(list, file, pick) {
  const out = [];
  for (const e of list) for (const [label, text] of pick(e)) out.push({ id: e.id, label, text, file });
  return out;
}

/* ── Aufgabenkarten ───────────────────────────────────────── */

uniqueIds(cards, 'cards.json');

const LEVELS = ['1', '5', '10'];
const CATEGORIES = new Set(['trinken', 'sozial', 'performance', 'körperlich', 'wissen', 'geburtstagskind']);

for (const c of cards) {
  const w = `cards.json/${c.id}`;
  if (!c.title) fail(w, 'Kein Titel.');
  if (!CATEGORIES.has(c.category)) fail(w, `Unbekannte Kategorie „${c.category}".`);
  if (c.onlyRole && !['guest', 'birthday', 'host'].includes(c.onlyRole)) {
    fail(w, `Unbekannte Rolle „${c.onlyRole}".`);
  }

  const texts = [];
  for (const lvl of LEVELS) {
    const entry = c.levels?.[lvl];
    if (!entry) {
      fail(w, `Stufe ${lvl} fehlt. Der Zug bricht ab, wenn jemand sie wählt.`);
      continue;
    }
    const t = String(entry.text || '').trim();
    if (!t) fail(w, `Stufe ${lvl} hat keinen Text.`);
    // Das Reveal-Layout ist laut Plan auf 5 bis 300 Zeichen ausgelegt.
    else if (t.length < 5) fail(w, `Stufe ${lvl} ist zu kurz (${t.length} Zeichen).`);
    else if (t.length > 300) fail(w, `Stufe ${lvl} ist zu lang (${t.length} Zeichen, erlaubt sind 300).`);
    texts.push(t);
  }
  if (new Set(texts).size !== texts.length && texts.length === 3) {
    fail(w, 'Zwei Stufen haben denselben Text. Dann ist die Stufenwahl eine Farce.');
  }
}

// Doppelte Aufgabentexte über alle Karten hinweg: dieselbe Aufgabe zweimal im
// Stapel fällt am Abend als Wiederholung auf.
const seenText = new Map();
for (const c of cards) {
  for (const lvl of LEVELS) {
    const t = String(c.levels?.[lvl]?.text || '').trim().toLowerCase();
    if (!t) continue;
    if (seenText.has(t)) hint('cards.json', `Gleicher Text in ${seenText.get(t)} und ${c.id} (Stufe ${lvl}).`);
    else seenText.set(t, `${c.id} (Stufe ${lvl})`);
  }
}

/* ── Namen in Aufgaben ────────────────────────────────────── */

// Das Popup im Admin prüft neue Karten. Die 86 mitgelieferten Karten sind da
// nie durchgelaufen, deshalb hier nachgeholt. Eine Aufgabe mit Namen trifft
// entweder die falsche Person oder eine, die gar nicht da ist.
const nameHits = [];
for (const t of everyText(cards, 'cards.json', (c) => LEVELS.map((l) => [`Stufe ${l}`, c.levels?.[l]?.text || '']))) {
  const hits = findNames(t.text, []);
  if (hits.length) nameHits.push({ ...t, hits: hits.map((h) => h.name) });
}
for (const t of everyText(wildcards, 'wildcards.json', (w) => [['Text', w.text || '']])) {
  const hits = findNames(t.text, []);
  if (hits.length) nameHits.push({ ...t, hits: hits.map((h) => h.name) });
}
for (const h of nameHits) {
  fail(`${h.file}/${h.id}`, `${h.label} enthält einen Vornamen: ${h.hits.join(', ')}`);
}

/* ── Sonderaufträge ───────────────────────────────────────── */

uniqueIds(wildcards, 'wildcards.json');
for (const w of wildcards) {
  const where = `wildcards.json/${w.id}`;
  const t = String(w.text || '').trim();
  if (!t) fail(where, 'Kein Text.');
  else if (t.length > 300) fail(where, `Text zu lang (${t.length} Zeichen).`);
  // Sonderaufträge haben als einzige noch eine Uhr. Sie läuft ab dem Reveal.
  if (w.timerSec != null) {
    const sek = Number(w.timerSec);
    if (!(sek > 0)) fail(where, `timerSec ist ${w.timerSec}. Entweder eine positive Zahl oder null.`);
    else if (sek > 30 * 60) hint(where, `Die Uhr läuft ${Math.round(sek / 60)} Minuten, das überlebt kaum eine Aufmerksamkeitsspanne.`);
    else if (sek < 30) hint(where, `Die Uhr läuft nur ${sek} Sekunden.`);
  }
}
if (!wildcards.filter((w) => w.enabled !== false).length && DEFAULTS.wildcardEnabled) {
  fail('wildcards.json', 'Kein einziger Sonderauftrag ist freigeschaltet, die Mechanik ist damit tot.');
}

/* ── Special Cards ────────────────────────────────────────── */

uniqueIds(specials, 'specials.json');
for (const sp of specials) {
  if (!KNOWN_SPECIALS.includes(sp.id)) {
    fail('specials.json', `„${sp.id}" hat keine Wirkung im Code. Die Karte wird gezogen und tut nichts.`);
  }
  if (!sp.name) fail(`specials.json/${sp.id}`, 'Kein Name.');
}
for (const id of KNOWN_SPECIALS) {
  if (!specials.some((sp) => sp.id === id)) hint('specials.json', `Der Code kennt „${id}", die Datei nicht.`);
}

/* ── Shop ─────────────────────────────────────────────────── */

uniqueIds(shopItems, 'shopItems.json');
for (const i of shopItems) {
  const w = `shopItems.json/${i.id}`;
  if (!i.name) fail(w, 'Kein Name.');
  if (!KNOWN_EFFECTS.includes(i.effect)) {
    fail(w, `Wirkung „${i.effect}" kennt die Engine nicht. Der Kauf kostet nur Punkte.`);
  }
  if (!(Number(i.price) > 0)) fail(w, `Preis ist ${i.price}. Ein Item muss etwas kosten.`);
  if (i.effect === 'redirect' && !i.requiresTarget) {
    fail(w, 'Umleiten braucht ein Ziel, sonst geht der Effekt ins Leere.');
  }
  if (i.requiresTarget && i.targetSelf) hint(w, 'requiresTarget und targetSelf widersprechen sich.');
}

/* ── Strafkarten ──────────────────────────────────────────── */

uniqueIds(penalties, 'penalties.json');
for (const p of penalties) {
  if (!String(p.text || '').trim()) fail(`penalties.json/${p.id}`, 'Kein Text.');
}
if (shopItems.some((i) => i.effect === 'penalty' && i.enabled !== false) && !penalties.filter((p) => p.enabled !== false).length) {
  fail('penalties.json', 'Es gibt ein Strafkarten-Item im Shop, aber keine einzige Strafkarte.');
}

/* ── Preise ───────────────────────────────────────────────── */

uniqueIds(prizes, 'prizes.json');
const places = prizes.filter((p) => p.enabled !== false).map((p) => Number(p.place));
for (let n = 1; n <= DEFAULTS.podiumSize; n += 1) {
  const hits = places.filter((x) => x === n).length;
  if (hits === 0) fail('prizes.json', `Für Platz ${n} gibt es keinen Preis, das Podium bleibt dort leer.`);
  if (hits > 1) fail('prizes.json', `Platz ${n} ist ${hits}-mal vergeben.`);
}
for (const p of prizes) {
  if (!p.title) fail(`prizes.json/${p.id}`, 'Kein Titel.');
  if (!String(p.text || '').trim()) fail(`prizes.json/${p.id}`, 'Keine Beschreibung.');
}

/* ── Strafen für die Verlierer-Stufen ─────────────────────── */

uniqueIds(punishments, 'punishments.json');
const labels = new Set(punishments.filter((p) => p.enabled !== false).map((p) => p.label));

// computeResult() sucht die Strafe über den exakten Namen der Stufe. Passt er
// nicht, bekommt der Verlierer am Ende des Abends schlicht nichts angezeigt.
const alleStufen = new Set(Object.values(BUCKET_NAMES).flat());
for (const name of alleStufen) {
  if (!labels.has(name)) fail('punishments.json', `Für die Stufe „${name}" gibt es keine Strafe.`);
}
for (const p of punishments) {
  const w = `punishments.json/${p.id}`;
  if (!alleStufen.has(p.label)) {
    fail(w, `label „${p.label}" ist keine Verlierer-Stufe. Diese Strafe wird nie gezeigt.`);
  }
  if (!p.title) fail(w, 'Kein Titel.');
  if (!String(p.text || '').trim()) fail(w, 'Keine Beschreibung.');
  if (!(Number(p.severity) >= 1)) hint(w, 'Kein Härtegrad gesetzt, die Punkte-Anzeige bleibt leer.');
}

/* ── Sprache und Zeichen ──────────────────────────────────── */

const ALL_TEXTS = [
  ...everyText(cards, 'cards.json', (c) => [
    ['Titel', c.title || ''],
    ...LEVELS.map((l) => [`Stufe ${l}`, c.levels?.[l]?.text || '']),
  ]),
  ...everyText(wildcards, 'wildcards.json', (w) => [['Text', w.text || '']]),
  ...everyText(specials, 'specials.json', (sp) => [['Name', sp.name || ''], ['Text', sp.text || sp.description || '']]),
  ...everyText(shopItems, 'shopItems.json', (i) => [['Name', i.name || ''], ['Beschreibung', i.description || '']]),
  ...everyText(penalties, 'penalties.json', (p) => [['Text', p.text || '']]),
  ...everyText(prizes, 'prizes.json', (p) => [['Titel', p.title || ''], ['Text', p.text || '']]),
  ...everyText(punishments, 'punishments.json', (p) => [['Titel', p.title || ''], ['Text', p.text || '']]),
];

for (const t of ALL_TEXTS) {
  // Als Escape geschrieben, damit in dieser Datei selbst kein langer Strich steht.
  if (/[\u2014\u2013\u2015]/.test(t.text)) fail(`${t.file}/${t.id}`, `${t.label} enthält einen langen Strich.`);
  if (/\s{2,}/.test(t.text)) hint(`${t.file}/${t.id}`, `${t.label} hat doppelte Leerzeichen.`);
  if (t.text !== t.text.trim()) hint(`${t.file}/${t.id}`, `${t.label} hat Leerzeichen am Rand.`);
  // Gerade Anführungszeichen mitten im Satz sind im Deutschen fast immer ein
  // vergessenes typografisches Paar.
  if (/[^=]"/.test(t.text) && !/[„"]/.test(t.text)) hint(`${t.file}/${t.id}`, `${t.label} nutzt gerade Anführungszeichen.`);
}

/* ── Ausgabe ──────────────────────────────────────────────── */

const counts = [
  ['Karten', cards.length, cards.filter((c) => c.enabled !== false).length],
  ['Sonderaufträge', wildcards.length, wildcards.filter((c) => c.enabled !== false).length],
  ['Special Cards', specials.length, specials.filter((c) => c.enabled !== false).length],
  ['Shop-Items', shopItems.length, shopItems.filter((c) => c.enabled !== false).length],
  ['Strafkarten', penalties.length, penalties.filter((c) => c.enabled !== false).length],
  ['Preise', prizes.length, prizes.filter((c) => c.enabled !== false).length],
  ['Strafen', punishments.length, punishments.filter((c) => c.enabled !== false).length],
];

console.log(`\nInhalte in ${path.relative(ROOT, DATA) || DATA}\n`);
for (const [label, total, on] of counts) {
  console.log(`  ${label.padEnd(16)} ${String(total).padStart(3)}${on !== total ? `   (${on} freigeschaltet)` : ''}`);
}
console.log(`  ${'Aufgabentexte'.padEnd(16)} ${String(cards.length * 3).padStart(3)}`);

if (notes.length) {
  console.log('\nKleinigkeiten:');
  for (const n of notes) console.log(`  · ${n.where}: ${n.text}`);
}

if (problems.length) {
  console.log(`\n❌ ${problems.length} Problem(e):`);
  for (const p of problems) console.log(`  ! ${p.where}: ${p.text}`);
  console.log('');
  process.exit(1);
}

console.log('\n✅ Die Inhalte passen zu dem, was der Code daraus macht.\n');
