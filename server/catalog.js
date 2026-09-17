import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

/**
 * Karten, Wildcards, Specials, Shop-Items und Strafkarten liegen ausschließlich
 * als JSON auf Platte (docs/content.md). Der Karten-Editor im Admin schreibt hier zurück,
 * ein Deploy ist dafür nie nötig.
 */

const FILES = {
  cards: 'cards.json',
  wildcards: 'wildcards.json',
  specials: 'specials.json',
  shopItems: 'shopItems.json',
  penalties: 'penalties.json',
  prizes: 'prizes.json',
  punishments: 'punishments.json',
};

const cache = {};

function load(kind) {
  const file = path.join(DATA_DIR, FILES[kind]);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`[katalog] ${FILES[kind]} nicht lesbar: ${err.message}`);
    return [];
  }
}

for (const kind of Object.keys(FILES)) cache[kind] = load(kind);

export function all(kind) {
  return cache[kind];
}

export function enabled(kind) {
  return cache[kind].filter((e) => e.enabled !== false);
}

export function byId(kind, id) {
  return cache[kind].find((e) => e.id === id) || null;
}

export function save(kind, list) {
  cache[kind] = list;
  const file = path.join(DATA_DIR, FILES[kind]);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file);
  return list;
}

export function reload(kind) {
  cache[kind] = load(kind);
  return cache[kind];
}

export const LEVELS = [1, 5, 10];
export const LEVEL_LABEL = { 1: 'Stufe 1', 5: 'Stufe 2', 10: 'Stufe 3', 25: 'Sonderauftrag' };
