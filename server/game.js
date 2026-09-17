import crypto from 'node:crypto';
import { getConfig } from './config.js';
import * as catalog from './catalog.js';
import { LEVEL_LABEL } from './catalog.js';
import { loadState, persist } from './store.js';

/**
 * Die komplette Spiellogik. Der Client ist reine Anzeige (docs/architecture.md):
 * jeder Zustand, jede Zufallsentscheidung und jede Punktzahl entsteht hier.
 *
 * Punktestand = Summe aller Event-Deltas. Wetteinsätze werden beim Annehmen
 * direkt abgezogen; der Pott liegt bis zur Auflösung nur in der Wette selbst.
 * Es wird nie ein Score direkt geschrieben.
 */

const now = () => new Date().toISOString();
const rnd = (n) => Math.floor(Math.random() * n);
const pickOne = (arr) => arr[rnd(arr.length)];

function emptyState() {
  return {
    version: 1,
    createdAt: now(),
    phase: 'running', // lobby | running | finale | ended
    players: [],
    turns: {},
    claims: [],
    events: [],
    bets: [],
    effects: [],
    drawn: [],
    wildcard: null,
    wildcardSeen: [],
    poolWarning: false,
    nextWildcardAt: null,
    result: null,
    counter: 1,
  };
}

export class Game {
  constructor() {
    this.state = loadState() || emptyState();
    this.listeners = new Set();
    for (const p of this.state.players) {
      if (!this.state.turns[p.id]) this.state.turns[p.id] = emptyTurn();
    }
    this.scheduleWildcard(true);
  }

  /* ── Infrastruktur ──────────────────────────────────────── */

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    persist(this.state);
    for (const fn of this.listeners) fn();
  }

  id(prefix) {
    return `${prefix}-${String(this.state.counter++).padStart(4, '0')}`;
  }

  /* ── Event-Log ──────────────────────────────────────────── */

  log(type, playerId, delta, payload = {}, feed = null) {
    const ev = {
      id: this.id('e'),
      ts: now(),
      playerId: playerId || null,
      type,
      delta: delta || 0,
      voided: false,
      ...payload,
    };
    if (feed) ev.feed = feed;
    this.state.events.push(ev);
    return ev;
  }

  /* ── abgeleitete Werte ──────────────────────────────────── */

  rawScore(pid) {
    let sum = 0;
    for (const e of this.state.events) {
      if (!e.voided && e.playerId === pid) sum += e.delta || 0;
    }
    return sum;
  }

  score(pid) {
    return this.rawScore(pid);
  }

  /** Kleine persönliche Bilanz, direkt aus dem Event-Log gezählt. */
  playerStats(pid) {
    const done = { 1: 0, 5: 0, 10: 0 };
    let wildcards = 0;
    let rejected = 0;
    let rerolls = 0;
    let purchases = 0;
    let bets = 0;
    for (const e of this.state.events) {
      if (e.voided || e.playerId !== pid) continue;
      if (e.type === 'TASK_CONFIRMED' && done[e.level] !== undefined) done[e.level] += 1;
      else if (e.type === 'WILDCARD_CONFIRMED') wildcards += 1;
      else if (e.type === 'TASK_REJECTED') rejected += 1;
      else if (e.type === 'REROLL') rerolls += 1;
      else if (e.type === 'SHOP_PURCHASE') purchases += 1;
      else if (e.type === 'BET_CREATED' || e.type === 'BET_ACCEPTED') bets += 1;
    }
    // Wie oft dieser Spieler selbst abgenommen hat
    let confirmedByMe = 0;
    let rejectedByMe = 0;
    for (const c of this.state.claims) {
      if (!c.observerIds.includes(pid)) continue;
      if (c.status === 'confirmed') confirmedByMe += 1;
      else if (c.status === 'rejected') rejectedByMe += 1;
    }
    return {
      done,
      wildcards,
      rejected,
      rerolls,
      purchases,
      bets,
      total: done[1] + done[5] + done[10] + wildcards,
      confirmedByMe,
      rejectedByMe,
    };
  }

  /** Rerolls über den ganzen Abend, rein informativ für die Bilanz. */
  rerollCount(pid) {
    let count = 0;
    for (const e of this.state.events) {
      if (e.voided || e.playerId !== pid) continue;
      if (e.type === 'REROLL') count += 1;
    }
    return count;
  }

  /** Rerolls für die Karte, die gerade läuft. Nur die begrenzen und kosten. */
  rerollsThisCard(pid) {
    return this.turn(pid).rerolls || 0;
  }

  rerollsLeft(pid) {
    return Math.max(0, getConfig().rerollLimitPerCard - this.rerollsThisCard(pid));
  }

  rerollFactor(pid) {
    const cfg = getConfig();
    if (this.hasEffect(pid, 'rerollDiscount')) return 1;
    const n = this.rerollsThisCard(pid) + 1;
    return cfg.rerollScaling === 'exponential' ? Math.pow(2, n - 1) : n;
  }

  /** Zeitstempel des letzten punktebringenden Events, für die Gleichstandsregel. */
  lastScoringTs(pid) {
    let ts = null;
    for (const e of this.state.events) {
      if (!e.voided && e.playerId === pid && (e.delta || 0) > 0) ts = e.ts;
    }
    return ts;
  }

  /**
   * Punkte und Stichzeit aller Spieler in einem einzigen Durchlauf durch das
   * Log. Vorher lief ranking() zweimal pro Spieler komplett durch, also bei
   * zehn Gästen zwanzigmal. Nach ein paar Stunden Party stehen mehrere tausend
   * Events im Log und das summierte sich bei jedem Broadcast spürbar.
   */
  scoreboard() {
    const out = {};
    for (const p of this.state.players) out[p.id] = { score: 0, lastScoringTs: null };
    for (const e of this.state.events) {
      if (e.voided || !e.playerId) continue;
      const row = out[e.playerId];
      if (!row) continue;
      const delta = e.delta || 0;
      row.score += delta;
      if (delta > 0) row.lastScoringTs = e.ts;
    }
    return out;
  }

  ranking() {
    const cfg = getConfig();
    const board = this.scoreboard();
    return this.state.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        cfg: p.cfg,
        active: p.active,
        score: board[p.id].score,
        lastScoringTs: board[p.id].lastScoringTs,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (cfg.tieBreak === 'earliest') {
          const ta = a.lastScoringTs || '9999';
          const tb = b.lastScoringTs || '9999';
          if (ta !== tb) return ta < tb ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'de');
      });
  }

  player(pid) {
    return this.state.players.find((p) => p.id === pid) || null;
  }

  playerByToken(token) {
    return this.state.players.find((p) => p.token === token) || null;
  }

  turn(pid) {
    if (!this.state.turns[pid]) this.state.turns[pid] = emptyTurn();
    return this.state.turns[pid];
  }

  name(pid) {
    const p = this.player(pid);
    return p ? p.name : 'Jemand';
  }

  /* ── Effekte ────────────────────────────────────────────── */

  activeEffects(pid) {
    const t = Date.now();
    return this.state.effects.filter(
      (e) => e.playerId === pid && (!e.expiresAt || Date.parse(e.expiresAt) > t),
    );
  }

  hasEffect(pid, name) {
    return this.activeEffects(pid).some((e) => e.effect === name);
  }

  foreignEffects(pid) {
    return this.activeEffects(pid).filter((e) => e.sourcePlayerId && e.sourcePlayerId !== pid);
  }

  /** Nimmt einen Effekt aus der Liste und protokolliert den Verbrauch. */
  takeEffect(pid, name) {
    const idx = this.state.effects.findIndex((e) => e.playerId === pid && e.effect === name);
    if (idx < 0) return null;
    const [eff] = this.state.effects.splice(idx, 1);
    this.log('EFFECT_EXPIRED', pid, 0, { effect: eff.effect, itemId: eff.itemId });
    return eff;
  }

  applyEffect(targetId, effect, sourcePlayerId, item = {}) {
    const eff = {
      id: this.id('eff'),
      playerId: targetId,
      effect,
      sourcePlayerId,
      itemId: item.id || null,
      itemName: item.name || null,
      appliedAt: now(),
      expiresAt: item.durationMin ? new Date(Date.now() + item.durationMin * 60000).toISOString() : null,
      consumesOn: item.consumesOn || 'MANUAL',
    };
    this.state.effects.push(eff);
    this.log('EFFECT_APPLIED', targetId, 0, {
      effect,
      sourcePlayerId,
      itemId: item.id || null,
    });
    return eff;
  }

  /* ── Beitritt ───────────────────────────────────────────── */

  join({ name, cfg, role }) {
    const clean = String(name || '').trim();
    if (clean.length < 1 || clean.length > 20) {
      return { error: 'Bitte einen Namen mit 1 bis 20 Zeichen eingeben.' };
    }
    const taken = this.state.players.some(
      (p) => p.name.toLowerCase() === clean.toLowerCase(),
    );
    if (taken) return { error: 'Den Namen gibt es hier schon. Nimm einen anderen.' };

    const player = {
      id: this.id('p'),
      token: crypto.randomBytes(16).toString('hex'),
      name: clean,
      cfg: normalizeCfg(cfg),
      role: role || 'guest',
      teamId: null,
      active: true,
      seenRules: false,
      heldSpecials: [],
      catBlessing: false,
      lastBlessingAt: null,
      joinedAt: now(),
    };
    this.state.players.push(player);
    this.state.turns[player.id] = emptyTurn();
    this.log('PLAYER_JOINED', player.id, 0, {}, {
      icon: '🎂',
      text: `${player.name} ist der Party beigetreten`,
      kind: 'neutral',
    });
    this.changed();
    return { player };
  }

  updateProfile(pid, { name, cfg }) {
    const p = this.player(pid);
    if (!p) return { error: 'Unbekannter Spieler.' };
    if (name != null) {
      const clean = String(name).trim();
      if (clean.length < 1 || clean.length > 20) return { error: 'Name: 1 bis 20 Zeichen.' };
      const taken = this.state.players.some(
        (o) => o.id !== pid && o.name.toLowerCase() === clean.toLowerCase(),
      );
      if (taken) return { error: 'Den Namen gibt es hier schon.' };
      p.name = clean;
    }
    if (cfg) p.cfg = normalizeCfg(cfg);
    this.changed();
    return { ok: true };
  }

  seenRules(pid) {
    const p = this.player(pid);
    if (p) {
      p.seenRules = true;
      this.changed();
    }
  }

  /* ── Kartenpool ─────────────────────────────────────────── */

  poolRemaining() {
    const pool = catalog.enabled('cards');
    return pool.filter((c) => !this.state.drawn.includes(c.id)).length;
  }

  takeCard(role = 'guest') {
    const cfg = getConfig();
    // Karten mit onlyRole gehören nur der jeweiligen Rolle, sonst zieht
    // irgendwer eine Aufgabe, die nur das Geburtstagskind erfüllen kann.
    const pool = catalog.enabled('cards').filter((c) => !c.onlyRole || c.onlyRole === role);
    if (!pool.length) return null;
    let free = pool.filter((c) => !this.state.drawn.includes(c.id));
    if (!free.length) {
      if (cfg.emptyPoolBehavior === 'stop') {
        this.state.poolWarning = true;
        return null;
      }
      // Pool neu mischen: alles freigeben, was nicht gerade in einem Zug steckt
      const inPlay = Object.values(this.state.turns)
        .map((t) => t.cardId)
        .filter(Boolean);
      this.state.drawn = this.state.drawn.filter((id) => inPlay.includes(id));
      free = pool.filter((c) => !this.state.drawn.includes(c.id));
      this.state.poolWarning = true;
      this.log('POOL_RESHUFFLED', null, 0, {}, {
        icon: '🔀',
        text: 'Der Kartenpool wurde neu gemischt',
        kind: 'neutral',
      });
    }
    if (!free.length) return null;
    const card = pickOne(free);
    this.state.drawn.push(card.id);
    return card;
  }

  observerCandidates(pid) {
    const cfg = getConfig();
    let cands = this.state.players.filter((p) => p.id !== pid && p.active);
    if (cfg.maxOpenObservationsPerPlayer > 0) {
      const open = (id) =>
        this.state.claims.filter((c) => c.status === 'open' && c.observerIds.includes(id)).length;
      const free = cands.filter((p) => open(p.id) < cfg.maxOpenObservationsPerPlayer);
      if (free.length) cands = free;
    }
    return cands;
  }

  assignObservers(pid, count) {
    const pool = this.observerCandidates(pid).slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(rnd(pool.length), 1)[0].id);
    }
    return picked;
  }

  /* ── Kernschleife ───────────────────────────────────────── */

  draw(pid) {
    const cfg = getConfig();
    const p = this.player(pid);
    if (!p || !p.active) return { error: 'Du bist nicht aktiv.' };
    if (this.state.phase === 'ended') return { error: 'Das Spiel ist vorbei.' };
    const t = this.turn(pid);
    // „waiting" blockiert nicht; nur ein laufender Zug tut das
    if (!['idle', 'waiting'].includes(t.status)) {
      return { error: 'Du hast schon eine Karte laufen.' };
    }

    // Special Card: 5 % Chance statt einer normalen Karte, ohne Beobachter
    if (cfg.specialsEnabled && Math.random() < cfg.specialChance) {
      const special = pickOne(catalog.enabled('specials'));
      if (special) {
        p.heldSpecials.push(special.id);
        t.pendingSpecial = special.id;
        this.log('SPECIAL_DRAWN', pid, 0, { specialId: special.id }, {
          icon: '🐈',
          text: `${p.name} hat eine Special Card gezogen: ${special.name}`,
          kind: 'gold',
        });
        this.changed();
        return { ok: true, special: special.id };
      }
    }

    const card = this.takeCard(p.role);
    if (!card) return { error: 'Der Kartenpool ist leer. Der Host muss nachlegen.' };

    // Ein Reroll darf gekaufte Effekte nicht verschlucken: was beim letzten
    // Anlauf schon eingelöst war, gilt auch für die neue Karte.
    const forced = this.takeEffect(pid, 'forceLevel10');
    const peek = this.takeEffect(pid, 'peek') || t.peekPending;
    const chooser = this.takeEffect(pid, 'chooseObserver') || t.chooserPending;
    const forcedLevel = forced ? 10 : t.forcedLevel || null;
    const forcedBy = forced ? forced.sourcePlayerId : t.forcedBy || null;

    Object.assign(t, emptyTurn(), {
      status: chooser ? 'chooseObserver' : 'observer',
      kind: 'normal',
      cardId: card.id,
      forcedLevel,
      forcedBy,
      peek: peek ? { category: card.category, length: card.levels['5']?.text?.length || 0 } : null,
      // Nach einem Reroll gehört die neue Karte noch zum selben Anlauf
      peekPending: !!peek,
      chooserPending: !!chooser,
      rerolls: t.rerolls || 0,
      drawnAt: now(),
    });

    this.log('CARD_DRAWN', pid, 0, { cardId: card.id });

    if (!chooser) {
      t.observerIds = this.assignObservers(pid, cfg.observerCount);
      this.log('OBSERVER_ASSIGNED', pid, 0, { cardId: card.id, observerIds: t.observerIds });
    }
    this.changed();
    return { ok: true };
  }

  /** „Beobachter-Wahl" aus dem Shop: der Spieler sucht sich die Person selbst aus. */
  pickObserver(pid, observerId) {
    const t = this.turn(pid);
    if (t.status !== 'chooseObserver') return { error: 'Gerade nicht möglich.' };
    const cand = this.observerCandidates(pid).find((p) => p.id === observerId);
    if (!cand) return { error: 'Diese Person kann nicht beobachten.' };
    t.observerIds = [cand.id];
    t.status = 'observer';
    this.log('OBSERVER_ASSIGNED', pid, 0, { cardId: t.cardId, observerIds: t.observerIds, chosen: true });
    this.changed();
    return { ok: true };
  }

  observerAck(pid) {
    const t = this.turn(pid);
    if (t.status !== 'observer') return { error: 'Gerade nicht möglich.' };
    t.status = 'level';
    this.changed();
    return { ok: true };
  }

  pickLevel(pid, level) {
    const t = this.turn(pid);
    if (t.status !== 'level') return { error: 'Gerade nicht möglich.' };
    const lv = Number(level);
    if (![1, 5, 10].includes(lv)) return { error: 'Unbekannte Stufe.' };
    if (t.forcedLevel && lv !== t.forcedLevel) {
      return { error: `Zwangsstufe aktiv: du musst Stufe ${t.forcedLevel} nehmen.` };
    }
    t.level = lv;
    t.status = 'reveal';
    t.revealedAt = now();
    this.log('LEVEL_LOCKED', pid, 0, { cardId: t.cardId, level: lv });
    this.changed();
    return { ok: true };
  }

  taskDone(pid) {
    const p = this.player(pid);
    const t = this.turn(pid);
    if (t.status !== 'reveal') return { error: 'Gerade nicht möglich.' };

    const isWild = t.kind === 'wildcard';
    const card = isWild ? catalog.byId('wildcards', t.cardId) : catalog.byId('cards', t.cardId);
    const text = isWild ? card?.text : card?.levels?.[String(t.level)]?.text;
    const title = isWild ? 'Sonderauftrag' : card?.title || 'Karte';

    const claim = {
      id: this.id('cl'),
      playerId: pid,
      cardId: t.cardId,
      kind: t.kind,
      level: t.level,
      points: t.level,
      title,
      category: isWild ? 'wildcard' : card?.category || '',
      levelLabel: LEVEL_LABEL[t.level] || `Stufe ${t.level}`,
      text: text || '',
      observerIds: t.observerIds.slice(),
      confirmedBy: [],
      status: 'open',
      createdAt: now(),
    };
    this.state.claims.push(claim);
    t.claimId = claim.id;
    t.status = 'waiting';
    // Die Karte ist durch: neuer Anlauf mit drei Rerolls, und die gekauften
    // Effekte dieses Anlaufs sind aufgebraucht. Sonst wirken sie nochmal,
    // wenn direkt aus „waiting“ heraus die nächste Karte gezogen wird.
    t.rerolls = 0;
    t.forcedLevel = null;
    t.forcedBy = null;
    t.peekPending = false;
    t.chooserPending = false;

    this.log('TASK_CLAIMED', pid, 0, {
      cardId: t.cardId,
      level: t.level,
      claimId: claim.id,
      observerIds: claim.observerIds,
    });

    // Ohne andere Spieler gibt es niemanden zum Abnehmen, dann zählt es direkt.
    if (!claim.observerIds.length) {
      this.settleClaim(claim, null, true, 'ohne Beobachter');
    }
    this.changed();
    return { ok: true };
  }

  reroll(pid) {
    const cfg = getConfig();
    const t = this.turn(pid);
    if (t.status !== 'reveal') return { error: 'Gerade nicht möglich.' };
    if (t.kind === 'wildcard') return { error: 'Sonderaufträge lassen sich nicht rerollen.' };
    if (this.hasEffect(pid, 'rerollBlock')) {
      return { error: 'Reroll-Sperre aktiv. Da musst du durch.' };
    }
    const used = this.rerollsThisCard(pid);
    if (used >= cfg.rerollLimitPerCard) {
      return { error: `Für diese Karte sind ${cfg.rerollLimitPerCard} Rerolls verbraucht. Da musst du durch.` };
    }

    const dice = 1 + rnd(6);
    const factor = this.rerollFactor(pid);
    const delta = -(dice * factor);
    this.takeEffect(pid, 'rerollDiscount');

    this.log('REROLL', pid, delta, { cardId: t.cardId, dice, factor }, {
      icon: '🎲',
      text: `${this.name(pid)} hat gererollt: ${dice} × ${factor}`,
      kind: 'bad',
    });

    // Reroll gibt eine neue Karte; die alte ist verbraucht. Der Zähler läuft
    // für diese Karte weiter, bis sie tatsächlich gemacht oder gestrichen wird.
    // Zwangsstufe, Spickzettel und Beobachter-Wahl gelten weiter: sonst wäre
    // ein Reroll für ein paar Punkte die Flucht aus einem teuren Shop-Effekt.
    Object.assign(t, emptyTurn(), {
      rerolls: used + 1,
      forcedLevel: t.forcedLevel,
      forcedBy: t.forcedBy,
      peekPending: !!t.peekPending,
      chooserPending: !!t.chooserPending,
      lastRoll: { dice, factor, total: -delta, left: cfg.rerollLimitPerCard - (used + 1) },
    });
    t.lastRoll.nextFactor = this.rerollFactor(pid);
    this.takeEffect(pid, 'rerollBlock');
    this.changed();
    return { ok: true, dice, factor, total: -delta };
  }

  clearRoll(pid) {
    const t = this.turn(pid);
    t.lastRoll = null;
    this.changed();
    return { ok: true };
  }

  ackSpecial(pid) {
    const t = this.turn(pid);
    t.pendingSpecial = null;
    this.changed();
    return { ok: true };
  }

  /* ── Beobachtung ────────────────────────────────────────── */

  settleClaim(claim, byId, confirmed, note = null) {
    const t = this.turn(claim.playerId);
    claim.status = confirmed ? 'confirmed' : 'rejected';
    claim.resolvedAt = now();
    claim.resolvedBy = byId;

    if (confirmed) {
      const doubled = this.takeEffect(claim.playerId, 'doublePoints');
      const delta = claim.points * (doubled ? 2 : 1);
      claim.awarded = delta;
      const type = claim.kind === 'wildcard' ? 'WILDCARD_CONFIRMED' : 'TASK_CONFIRMED';
      this.log(type, claim.playerId, delta, {
        cardId: claim.cardId,
        level: claim.level,
        claimId: claim.id,
        observerIds: claim.observerIds,
        confirmedBy: byId,
        doubled: !!doubled,
        note,
      }, {
        icon: claim.kind === 'wildcard' ? '📣' : '🎉',
        text:
          claim.kind === 'wildcard'
            ? `${this.name(claim.playerId)} hat den Sonderauftrag durchgezogen`
            : `${this.name(claim.playerId)} hat ${claim.levelLabel} gepackt: ${claim.title}`,
        kind: 'good',
      });
      this.burstFor(claim.playerId);
    } else {
      claim.awarded = 0;
      this.log('TASK_REJECTED', claim.playerId, 0, {
        cardId: claim.cardId,
        level: claim.level,
        claimId: claim.id,
        rejectedBy: byId,
        note,
      }, {
        icon: '🙅',
        text: `${this.name(byId) || 'Der Host'} hat ${this.name(claim.playerId)}s Aufgabe abgelehnt`,
        kind: 'bad',
      });
    }
    this.takeEffect(claim.playerId, 'rerollBlock');
    if (t.claimId === claim.id && t.status === 'waiting') {
      Object.assign(t, emptyTurn());
    }
  }

  confirmClaim(pid, claimId) {
    const claim = this.state.claims.find((c) => c.id === claimId);
    if (!claim || claim.status !== 'open') return { error: 'Diese Aufgabe ist schon erledigt.' };
    if (!claim.observerIds.includes(pid)) return { error: 'Du bist hier nicht der Beobachter.' };
    if (claim.confirmedBy.includes(pid)) return { ok: true };
    claim.confirmedBy.push(pid);
    if (claim.confirmedBy.length >= claim.observerIds.length) {
      this.settleClaim(claim, pid, true);
    } else {
      this.log('OBSERVER_PARTIAL', claim.playerId, 0, { claimId: claim.id, by: pid });
    }
    this.changed();
    return { ok: true };
  }

  rejectClaim(pid, claimId) {
    const claim = this.state.claims.find((c) => c.id === claimId);
    if (!claim || claim.status !== 'open') return { error: 'Diese Aufgabe ist schon erledigt.' };
    if (!claim.observerIds.includes(pid)) return { error: 'Du bist hier nicht der Beobachter.' };
    this.settleClaim(claim, pid, false);
    this.changed();
    return { ok: true };
  }

  /* ── Sonderauftrag, im Plan „Der Ruf" (Kap. 2.5) ────────── */

  scheduleWildcard(initial = false) {
    const cfg = getConfig();
    if (!cfg.wildcardEnabled) {
      this.state.nextWildcardAt = null;
      return;
    }
    if (initial && this.state.nextWildcardAt && Date.parse(this.state.nextWildcardAt) > Date.now()) return;
    const span = Math.max(1, cfg.wildcardIntervalMaxMin - cfg.wildcardIntervalMinMin);
    const mins = cfg.wildcardIntervalMinMin + Math.random() * span;
    this.state.nextWildcardAt = new Date(Date.now() + mins * 60000).toISOString();
  }

  offerWildcard(forcedPlayerId = null) {
    const cfg = getConfig();
    if (this.state.wildcard) return { error: 'Es läuft schon ein Sonderauftrag.' };
    const pool = catalog.enabled('wildcards');
    if (!pool.length) return { error: 'Kein Wildcard-Pool vorhanden.' };

    let candidates = this.state.players.filter((p) => p.active);
    if (!forcedPlayerId) {
      // Cooldown: erst wenn alle einmal dran waren, wird neu durchgemischt
      const fresh = candidates.filter((p) => !this.state.wildcardSeen.includes(p.id));
      if (fresh.length) candidates = fresh;
      else {
        this.state.wildcardSeen = [];
      }
    }
    const target = forcedPlayerId ? this.player(forcedPlayerId) : pickOne(candidates);
    if (!target) return { error: 'Keine aktiven Spieler.' };

    const card = pickOne(pool);
    this.state.wildcard = {
      id: this.id('w'),
      playerId: target.id,
      cardId: card.id,
      offeredAt: now(),
      expiresAt: new Date(Date.now() + cfg.wildcardTimeoutMin * 60000).toISOString(),
    };
    this.state.wildcardSeen.push(target.id);
    this.scheduleWildcard();
    this.log('WILDCARD_OFFERED', target.id, 0, { wildId: card.id }, {
      icon: '📣',
      text: `Sonderauftrag: ${target.name} wurde gezogen`,
      kind: 'gold',
    });
    this.changed();
    return { ok: true };
  }

  wildcardAccept(pid) {
    const cfg = getConfig();
    const w = this.state.wildcard;
    if (!w || w.playerId !== pid) return { error: 'Für dich läuft gerade kein Sonderauftrag.' };
    const card = catalog.byId('wildcards', w.cardId);
    const t = this.turn(pid);

    Object.assign(t, emptyTurn(), {
      status: 'reveal',
      kind: 'wildcard',
      cardId: w.cardId,
      level: card?.points || cfg.wildcardPoints,
      observerIds: this.assignObservers(pid, card?.observerCount || cfg.wildcardObserverCount),
      drawnAt: now(),
      revealedAt: now(),
    });
    this.state.wildcard = null;
    this.log('WILDCARD_ACCEPTED', pid, 0, { wildId: w.cardId, observerIds: t.observerIds }, {
      icon: '🔥',
      text: `${this.name(pid)} hat den Sonderauftrag blind angenommen`,
      kind: 'gold',
    });
    this.burstFor(pid);
    this.changed();
    return { ok: true };
  }

  wildcardDecline(pid, timedOut = false) {
    const w = this.state.wildcard;
    if (!w || (pid && w.playerId !== pid)) return { error: 'Für dich läuft gerade kein Sonderauftrag.' };
    this.state.wildcard = null;
    this.log('WILDCARD_DECLINED', w.playerId, 0, { wildId: w.cardId, timedOut }, {
      icon: '🙀',
      text: timedOut
        ? `${this.name(w.playerId)} hat den Sonderauftrag verfallen lassen`
        : `${this.name(w.playerId)} hat den Sonderauftrag abgelehnt`,
      kind: 'neutral',
    });
    this.changed();
    return { ok: true };
  }

  /* ── Special Cards ──────────────────────────────────────── */

  playSpecial(pid, specialId, targetId = null) {
    const p = this.player(pid);
    if (!p) return { error: 'Unbekannter Spieler.' };
    const idx = p.heldSpecials.indexOf(specialId);
    if (idx < 0) return { error: 'Diese Karte hast du nicht.' };
    const sp = catalog.byId('specials', specialId);
    if (!sp) return { error: 'Unbekannte Special Card.' };

    const target = targetId ? this.player(targetId) : null;
    if (sp.requiresTarget && (!target || !target.active || target.id === pid)) {
      return { error: 'Wähl eine andere aktive Person aus.' };
    }

    switch (specialId) {
      case 'sp-steal': {
        const amount = sp.amount || 15;
        this.log('SPECIAL_PLAYED', target.id, -amount, { specialId, sourcePlayerId: pid }, {
          icon: '🥷',
          text: `${p.name} hat ${target.name} ${amount} Punkte geklaut`,
          kind: 'bad',
        });
        this.log('SPECIAL_PLAYED', pid, amount, { specialId, targetId: target.id });
        break;
      }
      case 'sp-swap': {
        const a = this.rawScore(pid);
        const b = this.rawScore(target.id);
        this.log('SPECIAL_PLAYED', pid, b - a, { specialId, targetId: target.id }, {
          icon: '🔄',
          text: `${p.name} hat den Punktestand mit ${target.name} getauscht`,
          kind: 'gold',
        });
        this.log('SPECIAL_PLAYED', target.id, a - b, { specialId, sourcePlayerId: pid });
        break;
      }
      case 'sp-king': {
        this.applyEffect(target.id, 'forceLevel10', pid, {
          id: specialId,
          name: sp.name,
          consumesOn: 'NEXT_CARD_DRAWN',
        });
        this.log('SPECIAL_PLAYED', pid, 0, { specialId, targetId: target.id }, {
          icon: '👑',
          text: `${p.name} zwingt ${target.name} auf Stufe 10`,
          kind: 'bad',
        });
        break;
      }
      case 'sp-cat': {
        p.catBlessing = true;
        p.lastBlessingAt = now();
        this.log('SPECIAL_PLAYED', pid, 0, { specialId }, {
          icon: '🐈',
          text: `${p.name} hat den Katzen-Segen aktiviert`,
          kind: 'gold',
        });
        break;
      }
      case 'sp-joker': {
        const t = this.turn(pid);
        if (!['observer', 'chooseObserver', 'level', 'reveal'].includes(t.status)) {
          return { error: 'Du hast gerade keine Aufgabe zum Streichen.' };
        }
        Object.assign(t, emptyTurn());
        this.log('SPECIAL_PLAYED', pid, 0, { specialId }, {
          icon: '🎟️',
          text: `${p.name} hat eine Aufgabe mit dem Joker gestrichen`,
          kind: 'neutral',
        });
        break;
      }
      default:
        return { error: 'Diese Karte kann noch nichts.' };
    }

    p.heldSpecials.splice(idx, 1);
    this.changed();
    return { ok: true };
  }

  /* ── Black Market ───────────────────────────────────────── */

  createBet(pid, { text, stake, opponentId }) {
    const cfg = getConfig();
    if (!cfg.betsEnabled) return { error: 'Der Black Market ist zu.' };
    const clean = String(text || '').trim();
    if (clean.length < 3) return { error: 'Schreib kurz auf, worum es geht.' };
    if (clean.length > 300) return { error: 'Etwas kürzer, bitte.' };
    const amount = Math.round(Number(stake) || 0);
    if (amount < 1) return { error: 'Einsatz muss mindestens 1 Punkt sein.' };
    if (amount > cfg.betStakeCap) return { error: `Höchstens ${cfg.betStakeCap} Punkte pro Wette.` };
    if (opponentId && !this.player(opponentId)) return { error: 'Unbekannter Gegenspieler.' };
    if (opponentId === pid) return { error: 'Gegen dich selbst geht nicht.' };

    const bet = {
      id: this.id('bet'),
      createdBy: pid,
      opponentId: opponentId || null,
      acceptedBy: null,
      text: clean,
      stake: amount,
      status: 'open',
      createdAt: now(),
      expiresAt: new Date(Date.now() + cfg.betOfferExpiryMin * 60000).toISOString(),
      resolution: { winnerId: null, votes: {}, resolvedByHost: false, disputed: false },
    };
    this.state.bets.push(bet);
    this.log('BET_CREATED', pid, 0, { betId: bet.id, stake: amount }, {
      icon: '🖤',
      text: `${this.name(pid)} bietet eine Wette an: „${clean}"`,
      kind: 'neutral',
    });
    this.changed();
    return { ok: true };
  }

  acceptBet(pid, betId) {
    const bet = this.state.bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'open') return { error: 'Das Angebot gibt es nicht mehr.' };
    if (bet.createdBy === pid) return { error: 'Deine eigene Wette kannst du nicht annehmen.' };
    if (bet.opponentId && bet.opponentId !== pid) return { error: 'Diese Wette ist an jemand anderen gerichtet.' };

    bet.acceptedBy = pid;
    bet.status = 'running';
    bet.acceptedAt = now();
    // Beide zahlen sofort ein. Der Pott steckt danach in der Wette, nicht im Punktestand.
    this.log('BET_ACCEPTED', pid, -bet.stake, { betId: bet.id, stake: bet.stake, against: bet.createdBy }, {
      icon: '🤝',
      text: `${this.name(bet.createdBy)} und ${this.name(pid)} wetten um je ${bet.stake} Punkte`,
      kind: 'bad',
    });
    this.log('BET_ACCEPTED', bet.createdBy, -bet.stake, { betId: bet.id, stake: bet.stake, against: pid });
    this.changed();
    return { ok: true };
  }

  voteBet(pid, betId, winnerId) {
    const bet = this.state.bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'running') return { error: 'Diese Wette läuft nicht.' };
    if (![bet.createdBy, bet.acceptedBy].includes(pid)) return { error: 'Du bist nicht beteiligt.' };
    if (![bet.createdBy, bet.acceptedBy].includes(winnerId)) return { error: 'Unbekannter Gewinner.' };

    bet.resolution.votes[pid] = winnerId;
    const votes = Object.values(bet.resolution.votes);
    if (votes.length === 2) {
      if (votes[0] === votes[1]) {
        this.finishBet(bet, votes[0], false);
      } else {
        bet.resolution.disputed = true;
        this.log('BET_DISPUTED', pid, 0, { betId: bet.id }, {
          icon: '⚖️',
          text: `Streit um eine Wette zwischen ${this.name(bet.createdBy)} und ${this.name(bet.acceptedBy)}, der Host entscheidet`,
          kind: 'neutral',
        });
      }
    }
    this.changed();
    return { ok: true };
  }

  finishBet(bet, winnerId, byHost) {
    const loserId = winnerId === bet.createdBy ? bet.acceptedBy : bet.createdBy;
    bet.status = 'resolved';
    bet.resolvedAt = now();
    bet.resolution.winnerId = winnerId;
    bet.resolution.resolvedByHost = byHost;
    // Beide haben beim Annehmen gezahlt, der Gewinner holt sich den ganzen Pott.
    const pot = bet.stake * 2;
    this.log('BET_RESOLVED', winnerId, pot, { betId: bet.id, pot, resolvedByHost: byHost }, {
      icon: '💰',
      text: `${this.name(winnerId)} holt sich den Pott von ${pot} gegen ${this.name(loserId)}`,
      kind: 'good',
    });
  }

  cancelBet(pid, betId, byHost = false) {
    const bet = this.state.bets.find((b) => b.id === betId);
    if (!bet) return { error: 'Unbekannte Wette.' };
    if (!byHost && bet.createdBy !== pid) return { error: 'Nur der Ersteller kann stornieren.' };
    if (!byHost && bet.status !== 'open') return { error: 'Läuft schon, da geht nur noch auflösen.' };
    const wasRunning = bet.status === 'running';
    bet.status = 'cancelled';
    bet.resolvedAt = now();
    this.log('BET_CANCELLED', bet.createdBy, wasRunning ? bet.stake : 0, { betId: bet.id, byHost }, {
      icon: '🚪',
      text: wasRunning
        ? `Wette zwischen ${this.name(bet.createdBy)} und ${this.name(bet.acceptedBy)} storniert, Einsätze zurück`
        : `Wettangebot von ${this.name(bet.createdBy)} zurückgezogen`,
      kind: 'neutral',
    });
    if (wasRunning) this.log('BET_CANCELLED', bet.acceptedBy, bet.stake, { betId: bet.id, byHost });
    this.changed();
    return { ok: true };
  }

  /* ── Shop ───────────────────────────────────────────────── */

  buyItem(pid, itemId, targetId = null) {
    const cfg = getConfig();
    if (!cfg.shopEnabled) return { error: 'Der Shop ist zu.' };
    const item = catalog.byId('shopItems', itemId);
    if (!item || item.enabled === false) return { error: 'Dieses Item gibt es nicht.' };
    const buyer = this.player(pid);
    if (!buyer) return { error: 'Unbekannter Spieler.' };

    const target = item.requiresTarget ? this.player(targetId) : buyer;
    if (item.requiresTarget) {
      if (!target || !target.active) return { error: 'Wähl eine aktive Person aus.' };
      if (target.id === pid) return { error: 'Auf dich selbst geht das nicht.' };
      if (this.hasEffect(target.id, 'immunity')) return { error: `${target.name} ist gerade immun.` };
      if (this.foreignEffects(target.id).length >= cfg.maxForeignEffects) {
        return { error: `${target.name} steht schon unter einem fremden Effekt.` };
      }
    }
    if (!cfg.shopAllowNegative && this.score(pid) < item.price) {
      return { error: 'Dafür reichen deine Punkte nicht.' };
    }

    this.log('SHOP_PURCHASE', pid, -item.price, { itemId, targetId: target?.id || null }, {
      icon: '💸',
      text: item.requiresTarget
        ? `${buyer.name} hat „${item.name}" auf ${target.name} gekauft`
        : `${buyer.name} hat „${item.name}" gekauft`,
      kind: 'bad',
    });

    if (item.effect === 'penalty') {
      const pen = pickOne(catalog.enabled('penalties'));
      this.applyEffect(target.id, 'penalty', pid, item);
      const eff = this.state.effects[this.state.effects.length - 1];
      eff.meta = { text: pen ? pen.text : 'Strafkarte folgt.' };
      this.log('PENALTY_DRAWN', target.id, 0, { penaltyId: pen?.id || null, sourcePlayerId: pid }, {
        icon: '☠️',
        text: `${target.name} hat eine Strafkarte kassiert`,
        kind: 'bad',
      });
    } else if (item.effect === 'redirect') {
      const mine = this.foreignEffects(pid)[0];
      if (!mine) return { error: 'Auf dich wirkt gerade kein fremder Effekt.' };
      mine.playerId = target.id;
      mine.sourcePlayerId = pid;
      this.log('EFFECT_APPLIED', target.id, 0, { effect: mine.effect, sourcePlayerId: pid, redirected: true });
    } else {
      this.applyEffect(target.id, item.effect, pid, item);
    }

    this.changed();
    return { ok: true };
  }

  /* ── Auswertung ─────────────────────────────────────────── */

  computeResult() {
    const cfg = getConfig();
    const ranked = this.ranking();
    const podium = ranked.slice(0, cfg.podiumSize);
    const losers = ranked.slice(cfg.podiumSize);

    let buckets = cfg.loserBucketsOverride || 0;
    if (!buckets) {
      if (losers.length >= 8) buckets = 4;
      else if (losers.length >= 5) buckets = 3;
      else if (losers.length >= 3) buckets = 2;
      else buckets = 1;
    }
    const names = BUCKET_NAMES[buckets];

    const prizes = catalog.enabled('prizes');
    const punishments = catalog.enabled('punishments');
    const withPrize = podium.map((p, i) => ({
      ...p,
      prize: prizes.find((z) => z.place === i + 1) || null,
    }));

    const withBucket = losers.map((p, i) => {
      // 0 = bester Verlierer, 1 = letzter Platz. Die Stufennamen laufen von
      // mild nach hart, also zeigt derselbe Index in beide Richtungen richtig.
      const fromTop = losers.length > 1 ? i / (losers.length - 1) : 1;
      const idx = Math.min(buckets - 1, Math.floor(fromTop * buckets));
      return {
        ...p,
        bucket: idx,
        bucketLabel: names[idx],
        percentile: Math.round((1 - fromTop) * 100),
        punishment: punishments.find((z) => z.label === names[idx]) || null,
      };
    });

    return {
      endedAt: now(),
      podium: withPrize,
      losers: withBucket,
      buckets,
      bucketNames: names,
    };
  }

  endGame() {
    this.state.phase = 'ended';
    this.state.result = this.computeResult();
    this.log('GAME_ENDED', null, 0, {}, {
      icon: '🏁',
      text: 'Die Runde ist vorbei. Auswertung steht.',
      kind: 'gold',
    });
    this.changed();
    return { ok: true };
  }

  /* ── Admin ──────────────────────────────────────────────── */

  adminAdjust(targetId, delta, note) {
    if (!this.player(targetId)) return { error: 'Unbekannter Spieler.' };
    const amount = Math.round(Number(delta) || 0);
    if (!amount) return { error: 'Delta darf nicht 0 sein.' };
    this.log('ADMIN_ADJUST', targetId, amount, { note: note || null }, {
      icon: '🛠️',
      text: `Host-Korrektur für ${this.name(targetId)}: ${amount > 0 ? '+' : ''}${amount}`,
      kind: amount > 0 ? 'good' : 'bad',
    });
    this.changed();
    return { ok: true };
  }

  adminSettleClaim(claimId, confirmed) {
    const claim = this.state.claims.find((c) => c.id === claimId);
    if (!claim || claim.status !== 'open') return { error: 'Diese Aufgabe ist schon erledigt.' };
    this.settleClaim(claim, null, confirmed, 'vom Host entschieden');
    this.changed();
    return { ok: true };
  }

  adminResolveBet(betId, winnerId) {
    const bet = this.state.bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'running') return { error: 'Diese Wette läuft nicht.' };
    if (![bet.createdBy, bet.acceptedBy].includes(winnerId)) return { error: 'Unbekannter Gewinner.' };
    this.finishBet(bet, winnerId, true);
    this.changed();
    return { ok: true };
  }

  adminSetActive(targetId, active) {
    const p = this.player(targetId);
    if (!p) return { error: 'Unbekannter Spieler.' };
    p.active = !!active;
    this.changed();
    return { ok: true };
  }

  adminSetRole(targetId, role) {
    const p = this.player(targetId);
    if (!p) return { error: 'Unbekannter Spieler.' };
    if (!['guest', 'birthday', 'host'].includes(role)) return { error: 'Unbekannte Rolle.' };
    p.role = role;
    this.changed();
    return { ok: true };
  }

  /** Macht ein Event rückgängig, ohne die Historie zu verlieren. */
  adminVoidEvent(eventId, voided = true) {
    const ev = this.state.events.find((e) => e.id === eventId);
    if (!ev) return { error: 'Unbekanntes Event.' };
    ev.voided = !!voided;
    this.changed();
    return { ok: true };
  }

  adminClearEffect(effectId) {
    const idx = this.state.effects.findIndex((e) => e.id === effectId);
    if (idx < 0) return { error: 'Unbekannter Effekt.' };
    const [eff] = this.state.effects.splice(idx, 1);
    this.log('EFFECT_EXPIRED', eff.playerId, 0, { effect: eff.effect, byHost: true });
    this.changed();
    return { ok: true };
  }

  adminSetPhase(phase) {
    if (!['lobby', 'running', 'finale', 'ended'].includes(phase)) return { error: 'Unbekannte Phase.' };
    if (phase === 'ended') return this.endGame();
    this.state.phase = phase;
    this.state.result = null;
    this.changed();
    return { ok: true };
  }

  adminReshuffle() {
    const inPlay = Object.values(this.state.turns).map((t) => t.cardId).filter(Boolean);
    this.state.drawn = this.state.drawn.filter((id) => inPlay.includes(id));
    this.state.poolWarning = false;
    this.log('POOL_RESHUFFLED', null, 0, { byHost: true }, {
      icon: '🔀',
      text: 'Der Host hat den Kartenpool neu gemischt',
      kind: 'neutral',
    });
    this.changed();
    return { ok: true };
  }

  adminResetParty() {
    this.state = emptyState();
    this.scheduleWildcard(true);
    this.changed();
    return { ok: true };
  }

  /* ── Ticker: Timeouts und passive Effekte ───────────────── */

  tick() {
    const cfg = getConfig();
    let touched = false;
    const t = Date.now();

    if (this.state.wildcard && Date.parse(this.state.wildcard.expiresAt) <= t) {
      this.wildcardDecline(null, true);
      touched = true;
    }

    if (
      cfg.wildcardEnabled &&
      !this.state.wildcard &&
      this.state.phase === 'running' &&
      this.state.players.filter((p) => p.active).length >= 2
    ) {
      if (!this.state.nextWildcardAt) this.scheduleWildcard();
      else if (Date.parse(this.state.nextWildcardAt) <= t) {
        this.offerWildcard();
        touched = true;
      }
    }

    for (const bet of this.state.bets) {
      if (bet.status === 'open' && Date.parse(bet.expiresAt) <= t) {
        bet.status = 'cancelled';
        bet.resolvedAt = now();
        this.log('BET_CANCELLED', bet.createdBy, 0, { betId: bet.id, expired: true }, {
          icon: '🚪',
          text: `Wettangebot von ${this.name(bet.createdBy)} ist verfallen`,
          kind: 'neutral',
        });
        touched = true;
      }
    }

    const before = this.state.effects.length;
    this.state.effects = this.state.effects.filter((e) => {
      if (e.expiresAt && Date.parse(e.expiresAt) <= t) {
        this.log('EFFECT_EXPIRED', e.playerId, 0, { effect: e.effect });
        return false;
      }
      return true;
    });
    if (this.state.effects.length !== before) touched = true;

    for (const p of this.state.players) {
      if (!p.catBlessing || !p.active) continue;
      const last = p.lastBlessingAt ? Date.parse(p.lastBlessingAt) : t;
      const step = cfg.catBlessingIntervalMin * 60000;
      if (t - last >= step) {
        const ticks = Math.floor((t - last) / step);
        p.lastBlessingAt = new Date(last + ticks * step).toISOString();
        this.log('SPECIAL_TICK', p.id, ticks, { specialId: 'sp-cat' }, {
          icon: '🐈',
          text: `${p.name}s Katze hat ${ticks} Punkt${ticks > 1 ? 'e' : ''} gesammelt`,
          kind: 'good',
        });
        touched = true;
      }
    }

    if (touched) this.changed();
  }

  /* ── Feuerwerk-Signal für die Map ───────────────────────── */

  burstFor(pid) {
    this.state.lastBurst = { playerId: pid, at: Date.now(), n: (this.state.lastBurst?.n || 0) + 1 };
  }

  /* ── Snapshots ──────────────────────────────────────────── */

  feed(limit = 60) {
    return this.state.events
      .filter((e) => e.feed && !e.voided)
      .slice(-limit)
      .reverse()
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        icon: e.feed.icon,
        text: e.feed.text,
        kind: e.feed.kind,
        delta: e.delta,
      }));
  }

  publicSnapshot() {
    const cfg = getConfig();
    const ranked = this.ranking();
    return {
      phase: this.state.phase,
      partyTitle: cfg.partyTitle,
      partyAge: cfg.partyAge,
      players: ranked,
      ranking: ranked,
      feed: this.feed(),
      poolRemaining: this.poolRemaining(),
      poolTotal: catalog.enabled('cards').length,
      poolWarning: this.state.poolWarning,
      wildcard: this.state.wildcard
        ? { playerId: this.state.wildcard.playerId, name: this.name(this.state.wildcard.playerId), expiresAt: this.state.wildcard.expiresAt }
        : null,
      running: Object.entries(this.state.turns)
        .filter(([, t]) => ['observer', 'chooseObserver', 'level', 'reveal', 'waiting'].includes(t.status))
        .map(([pid, t]) => ({
          playerId: pid,
          name: this.name(pid),
          cfg: this.player(pid)?.cfg || null,
          status: t.status,
          level: t.level,
          title: t.kind === 'wildcard' ? 'Sonderauftrag' : catalog.byId('cards', t.cardId)?.title || '',
          levelLabel: t.level ? LEVEL_LABEL[t.level] : null,
        })),
      openClaims: this.state.claims.filter((c) => c.status === 'open').length,
      result: this.state.result,
      lastBurst: this.state.lastBurst || null,
      serverTime: Date.now(),
    };
  }

  /**
   * `shared` ist der öffentliche Teil, den alle Handys identisch bekommen.
   * broadcast() in server/index.js baut ihn einmal und reicht ihn durch,
   * statt ihn für jedes Gerät neu zu rechnen.
   */
  snapshotFor(pid, shared = null) {
    const cfg = getConfig();
    const p = this.player(pid);
    const base = shared || this.publicSnapshot();
    if (!p) return { ...base, me: null };

    const t = this.turn(pid);
    const stats = this.playerStats(pid);
    const isWild = t.kind === 'wildcard';
    const card = isWild ? catalog.byId('wildcards', t.cardId) : catalog.byId('cards', t.cardId);
    const levelKey = String(t.level);

    // Der Aufgabentext geht erst nach der Stufenwahl über die Leitung.
    const revealed = t.status === 'reveal' || t.status === 'waiting';
    const revealText = !revealed ? null : isWild ? card?.text : card?.levels?.[levelKey]?.text;
    const timerSec = !revealed ? null : isWild ? card?.timerSec ?? null : card?.levels?.[levelKey]?.timerSec ?? null;

    const ranked = base.ranking;
    const billigstes = Math.min(...catalog.enabled('shopItems').map((i) => i.price), Infinity);
    const myRank = ranked.findIndex((r) => r.id === pid) + 1;

    return {
      ...base,
      me: {
        id: p.id,
        name: p.name,
        cfg: p.cfg,
        role: p.role,
        seenRules: p.seenRules,
        score: this.score(pid),
        rank: myRank,
        rerollCount: this.rerollCount(pid),
        rerollsThisCard: this.rerollsThisCard(pid),
        rerollsLeft: this.rerollsLeft(pid),
        nextRerollFactor: this.rerollFactor(pid),
        heldSpecials: p.heldSpecials.map((id) => catalog.byId('specials', id)).filter(Boolean),
        catBlessing: p.catBlessing,
        stats,
      },
      turn: {
        status: t.status,
        kind: t.kind,
        level: t.level,
        forcedLevel: t.forcedLevel,
        forcedBy: t.forcedBy ? this.name(t.forcedBy) : null,
        peek: t.peek,
        title: isWild ? 'Sonderauftrag' : card?.title || '',
        category: isWild ? 'wildcard' : card?.category || '',
        observers: t.observerIds.map((id) => ({ id, name: this.name(id), cfg: this.player(id)?.cfg })),
        revealText,
        timerSec,
        revealedAt: t.revealedAt || null,
        pendingSpecial: t.pendingSpecial ? catalog.byId('specials', t.pendingSpecial) : null,
        lastRoll: t.lastRoll || null,
        observerChoices:
          t.status === 'chooseObserver'
            ? this.observerCandidates(pid).map((c) => ({ id: c.id, name: c.name, cfg: c.cfg }))
            : [],
      },
      observations: this.state.claims
        .filter((c) => c.status === 'open' && c.observerIds.includes(pid) && !c.confirmedBy.includes(pid))
        .map((c) => ({
          id: c.id,
          name: this.name(c.playerId),
          cfg: this.player(c.playerId)?.cfg,
          meta: `${c.title} · ${c.levelLabel}`,
          points: c.points,
          text: c.text,
          multi: c.observerIds.length > 1,
        })),
      myClaims: this.state.claims
        .filter((c) => c.playerId === pid && c.status === 'open')
        .map((c) => ({
          id: c.id,
          points: c.points,
          title: c.title,
          levelLabel: c.levelLabel,
          observers: c.observerIds.map((id) => this.name(id)),
          confirmed: c.confirmedBy.length,
          total: c.observerIds.length,
        })),
      effects: this.activeEffects(pid).map((e) => ({
        id: e.id,
        effect: e.effect,
        label: effectLabel(e, this.name(e.sourcePlayerId)),
        foreign: e.sourcePlayerId !== pid,
        expiresAt: e.expiresAt,
      })),
      wildcardForMe:
        this.state.wildcard && this.state.wildcard.playerId === pid
          ? { expiresAt: this.state.wildcard.expiresAt, points: cfg.wildcardPoints }
          : null,
      bets: this.state.bets
        .filter((b) => ['open', 'running'].includes(b.status))
        .map((b) => ({
          id: b.id,
          text: b.text,
          stake: b.stake,
          status: b.status,
          createdBy: b.createdBy,
          createdByName: this.name(b.createdBy),
          acceptedBy: b.acceptedBy,
          acceptedByName: b.acceptedBy ? this.name(b.acceptedBy) : null,
          opponentName: b.opponentId ? this.name(b.opponentId) : null,
          mine: b.createdBy === pid || b.acceptedBy === pid,
          myVote: b.resolution.votes[pid] || null,
          votes: Object.keys(b.resolution.votes).length,
          disputed: b.resolution.disputed,
          expiresAt: b.expiresAt,
        })),
      shopItems: catalog.enabled('shopItems'),
      // Am ersten Abend hat niemand den Markt benutzt: null Käufe, null Wetten
      // in fünf Stunden. Wer noch nie hier war und sich etwas leisten kann,
      // bekommt deshalb einen Punkt auf dem Tab, bis er einmal gekauft hat.
      shopHint: cfg.shopEnabled && !stats.purchases && ranked.find((r) => r.id === pid)?.score >= billigstes,
      config: {
        stakeCap: cfg.betStakeCap,
        betsEnabled: cfg.betsEnabled,
        shopEnabled: cfg.shopEnabled,
        wildcardPoints: cfg.wildcardPoints,
      },
    };
  }

  /**
   * Was am Abend still schiefgehen kann, ohne dass es jemand merkt. Der Host
   * sieht diese Liste oben im Admin. Alles hier ist abgeleitet, nichts wird
   * gespeichert; verschwindet der Grund, verschwindet die Zeile.
   */
  hostChecks() {
    const cfg = getConfig();
    const out = [];
    const warn = (text, hint) => out.push({ level: 'warn', text, hint });
    const note = (text, hint) => out.push({ level: 'note', text, hint });

    const active = this.state.players.filter((p) => p.active);

    // Rollenkarten ohne passende Rolle: die Karten liegen im Stapel und
    // werden nie gezogen, weil takeCard() nach Rolle filtert.
    const byRole = {};
    for (const c of catalog.enabled('cards')) {
      if (c.onlyRole) byRole[c.onlyRole] = (byRole[c.onlyRole] || 0) + 1;
    }
    for (const [role, count] of Object.entries(byRole)) {
      if (active.some((p) => p.role === role)) continue;
      warn(
        `${count} Karten sind für die Rolle „${ROLE_NAMES[role] || role}" reserviert, niemand hat sie.`,
        'Unter Spieler die Rolle vergeben, sonst werden diese Karten nie gezogen.',
      );
    }

    // Ohne zweite aktive Person gibt es niemanden zum Abnehmen.
    if (active.length === 1) {
      warn('Nur eine Person ist aktiv.', 'Zum Abnehmen braucht es mindestens zwei.');
    }

    // Leere Kataloge fallen sonst erst beim ersten Zug auf.
    const counts = {
      Karten: catalog.enabled('cards').length,
      Sonderaufträge: catalog.enabled('wildcards').length,
      Strafkarten: catalog.enabled('penalties').length,
      'Shop-Items': catalog.enabled('shopItems').length,
      Preise: catalog.enabled('prizes').length,
      Strafen: catalog.enabled('punishments').length,
    };
    for (const [label, n] of Object.entries(counts)) {
      if (!n) warn(`Keine ${label} freigeschaltet.`, 'Unter Karten wieder aktivieren oder nachlegen.');
    }

    // Shop-Items mit unbekannter Wirkung kosten Punkte und tun nichts.
    const unknown = catalog
      .enabled('shopItems')
      .filter((i) => !KNOWN_EFFECTS.includes(i.effect))
      .map((i) => i.name || i.id);
    if (unknown.length) {
      warn(`Shop-Item ohne Wirkung: ${unknown.join(', ')}.`, 'Die Wirkung kennt die Engine nicht, der Kauf kostet nur Punkte.');
    }

    // Kartenpool: wenn weniger frei sind als Leute spielen, mischt er gleich.
    const free = this.poolRemaining();
    if (free && active.length && free < active.length) {
      note(`Nur noch ${free} ungezogene Karten.`, 'Der Stapel mischt sich beim nächsten Zug automatisch neu.');
    }

    // Abnahmen, auf die seit einer Weile niemand reagiert.
    const stale = this.state.claims.filter(
      (c) => c.status === 'open' && Date.now() - new Date(c.createdAt).getTime() > 20 * 60000,
    );
    if (stale.length) {
      warn(`${stale.length} Abnahme${stale.length === 1 ? '' : 'n'} wartet seit über 20 Minuten.`, 'Unter Freigeben selbst entscheiden.');
    }

    const disputed = this.state.bets.filter((b) => b.resolution.disputed).length;
    if (disputed) {
      warn(`${disputed} Wette${disputed === 1 ? '' : 'n'} ist strittig.`, 'Unter Freigeben den Sieger festlegen.');
    }

    // Abgeschaltete Bereiche: das ist erlaubt, soll aber sichtbar sein.
    const off = [
      [!cfg.wildcardEnabled, 'Sonderaufträge'],
      [!cfg.shopEnabled, 'Shop'],
      [!cfg.betsEnabled, 'Black Market'],
      [!cfg.specialsEnabled, 'Special Cards'],
    ].filter(([bad]) => bad).map(([, label]) => label);
    if (off.length) note(`Abgeschaltet: ${off.join(', ')}.`, 'Unter Spiel wieder anschalten.');

    if (this.state.phase === 'ended') {
      note('Das Spiel ist beendet.', 'Niemand kann mehr ziehen. Phase wieder auf „Läuft" stellen, falls es weitergeht.');
    }

    return out;
  }

  adminSnapshot(shared = null) {
    return {
      ...(shared || this.publicSnapshot()),
      config: getConfig(),
      checks: this.hostChecks(),
      players: this.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        cfg: p.cfg,
        role: p.role,
        active: p.active,
        score: this.score(p.id),
        rerollCount: this.rerollCount(p.id),
        heldSpecials: p.heldSpecials,
        status: this.turn(p.id).status,
      })),
      claims: this.state.claims
        .filter((c) => c.status === 'open')
        .map((c) => ({
          id: c.id,
          player: this.name(c.playerId),
          title: c.title,
          levelLabel: c.levelLabel,
          points: c.points,
          text: c.text,
          observers: c.observerIds.map((id) => this.name(id)),
          confirmed: c.confirmedBy.length,
          total: c.observerIds.length,
          createdAt: c.createdAt,
        })),
      bets: this.state.bets.map((b) => ({
        id: b.id,
        text: b.text,
        stake: b.stake,
        status: b.status,
        createdByName: this.name(b.createdBy),
        acceptedByName: b.acceptedBy ? this.name(b.acceptedBy) : null,
        createdBy: b.createdBy,
        acceptedBy: b.acceptedBy,
        disputed: b.resolution.disputed,
        votes: b.resolution.votes,
        winnerId: b.resolution.winnerId,
      })),
      effects: this.state.effects.map((e) => ({
        id: e.id,
        player: this.name(e.playerId),
        effect: e.effect,
        source: e.sourcePlayerId ? this.name(e.sourcePlayerId) : null,
        expiresAt: e.expiresAt,
      })),
      events: this.state.events.slice(-150).reverse().map((e) => ({
        id: e.id,
        ts: e.ts,
        type: e.type,
        player: e.playerId ? this.name(e.playerId) : 'System',
        delta: e.delta,
        voided: e.voided,
      })),
      cards: catalog.all('cards'),
      wildcards: catalog.all('wildcards'),
      shopItems: catalog.all('shopItems'),
      penalties: catalog.all('penalties'),
      specials: catalog.all('specials'),
      prizes: catalog.all('prizes'),
      punishments: catalog.all('punishments'),
      nextWildcardAt: this.state.nextWildcardAt,
    };
  }
}

function emptyTurn() {
  return {
    status: 'idle',
    kind: 'normal',
    cardId: null,
    level: null,
    observerIds: [],
    claimId: null,
    forcedLevel: null,
    forcedBy: null,
    peek: null,
    // Gekaufte Effekte, die ein Reroll sonst verschlucken würde
    peekPending: false,
    chooserPending: false,
    pendingSpecial: null,
    // Rerolls für die Karte, die gerade in Arbeit ist (Plan: drei pro Karte)
    rerolls: 0,
    lastRoll: null,
    drawnAt: null,
    revealedAt: null,
  };
}

/**
 * Die Namen der Verlierer-Stufen. Ein Eintrag in punishments.json findet seine
 * Strafe über genau diese Zeichenketten; ein Tippfehler dort bleibt sonst
 * stumm, und der Verlierer bekommt am Ende des Abends nichts angezeigt.
 * scripts/lint-data.mjs prüft die Datei dagegen.
 */
export const BUCKET_NAMES = {
  4: ['Knapp vorbei', 'Mitläufer', 'Solide enttäuschend', 'Endboss der Schande'],
  3: ['Knapp vorbei', 'Mitläufer', 'Endboss der Schande'],
  2: ['Knapp vorbei', 'Endboss der Schande'],
  1: ['Endboss der Schande'],
};

/** Special Cards, deren Wirkung in playSpecial() tatsächlich steht. */
export const KNOWN_SPECIALS = ['sp-steal', 'sp-swap', 'sp-king', 'sp-cat', 'sp-joker'];

/** Wirkungen, die buyItem() und der Zug tatsächlich auswerten. */
export const KNOWN_EFFECTS = [
  'forceLevel10',
  'rerollBlock',
  'chooseObserver',
  'rerollDiscount',
  'doublePoints',
  'peek',
  'immunity',
  'penalty',
  'redirect',
];

const ROLE_NAMES = { guest: 'Gast', birthday: 'Geburtstagskind', host: 'Host' };

/** Grenzen spiegeln die Optionen im Avatar-Editor (client/src/lib/sprites.js). */
const CFG_LIMITS = { skin: 7, hair: 7, style: 5, acc: 5, outfit: 7, fur: 11, pattern: 4 };

function normalizeCfg(cfg = {}) {
  const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const out = {};
  for (const [key, max] of Object.entries(CFG_LIMITS)) out[key] = clamp(cfg[key], max);
  return out;
}

function effectLabel(e, sourceName) {
  const map = {
    forceLevel10: 'Zwangsstufe aktiv: deine nächste Karte geht auf Stufe 10',
    rerollBlock: 'Reroll-Sperre aktiv: diese Aufgabe musst du durchziehen',
    chooseObserver: 'Beobachter-Wahl bereit: du suchst dir die nächste Person selbst aus',
    rerollDiscount: 'Reroll-Rabatt bereit: der nächste Reroll kostet nur ×1',
    doublePoints: 'Doppelpunkte bereit: deine nächste Aufgabe zählt doppelt',
    peek: 'Peek bereit: du siehst Kategorie und Länge der nächsten Karte',
    immunity: 'Immunität aktiv: fremde Shop-Effekte prallen ab',
    penalty: e.meta?.text ? `Strafkarte: ${e.meta.text}` : 'Strafkarte kassiert',
  };
  const base = map[e.effect] || e.effect;
  return e.sourcePlayerId && e.sourcePlayerId !== e.playerId ? `${base} (von ${sourceName})` : base;
}
