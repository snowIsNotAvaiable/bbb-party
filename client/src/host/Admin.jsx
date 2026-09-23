import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection } from '../lib/net.js';
import { avatarUrl } from '../lib/sprites.js';
import { findNames } from '../lib/names.js';
import PixelLogo from '../components/PixelLogo.jsx';
import PixelIcon from '../components/PixelIcon.jsx';
import PartyBackground from '../components/PartyBackground.jsx';
import { Header, SCREEN_PAD } from '../tabs/TaskTab.jsx';
import { Empty, InfoBox, relativeTime } from '../tabs/FeedTab.jsx';

/**
 * Der Host-Screen. Gleiche Bauart wie die Spieler-App: fünf Abschnitte auf
 * einer gleitenden Schiene, Pixel-Navigation unten, Party-Hintergrund dahinter.
 * Davor die PIN-Sperre, damit nicht jeder Gast Punkte verteilt.
 */

const SECTIONS = [
  { key: 'players', icon: 'users', label: 'Spieler' },
  { key: 'approve', icon: 'check', label: 'Freigeben' },
  { key: 'cards', icon: 'cards', label: 'Karten' },
  { key: 'game', icon: 'gear', label: 'Spiel' },
  { key: 'log', icon: 'list', label: 'Protokoll' },
];

const PIN_KEY = 'bbb.hostPin';

export default function Admin() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) || '');
  const [armed, setArmed] = useState(() => !!sessionStorage.getItem(PIN_KEY));

  if (!armed)
    return (
      <PinLock
        onUnlock={(value) => {
          setPin(value);
          setArmed(true);
        }}
      />
    );
  return (
    <Console
      pin={pin}
      onLock={() => {
        sessionStorage.removeItem(PIN_KEY);
        setArmed(false);
        setPin('');
      }}
    />
  );
}

/* ── PIN-Sperre ─────────────────────────────────────────────── */

function PinLock({ onUnlock }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!value.trim()) return setError('Bitte die PIN eingeben.');
    setBusy(true);
    setError(null);
    // Der Server prüft die PIN beim Handshake; hier wird sie einmal vorab getestet.
    const ok = await testPin(value.trim());
    setBusy(false);
    if (!ok) return setError('Falsche PIN.');
    sessionStorage.setItem(PIN_KEY, value.trim());
    onUnlock(value.trim());
    return undefined;
  };

  return (
    <div style={{ position: 'relative', height: '100dvh', background: 'var(--ground)' }}>
      <PartyBackground intensity={1.1} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <PixelLogo size={0.85} />
        <div style={{ animation: 'bbbSlideUp .5s .1s both' }}>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em' }}>Nur für den Host</div>
        </div>

        <div style={{ width: '100%', maxWidth: 300, animation: 'bbbSlideUp .5s .16s both' }}>
          <input
            className="bbb-input"
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="••••"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && check()}
            style={{
              fontSize: 30,
              textAlign: 'center',
              letterSpacing: '.4em',
              padding: '18px 16px',
              borderRadius: 16,
            }}
          />
          {error && (
            <div role="alert" style={{ marginTop: 10, fontSize: 13.5, color: 'var(--rose)' }}>
              {error}
            </div>
          )}
          <button
            className="bbb-btn bbb-sheen"
            onClick={check}
            disabled={busy}
            style={{
              marginTop: 16,
              width: '100%',
              padding: 18,
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 16,
              border: '1px solid var(--accent)',
              background: 'linear-gradient(100deg,rgba(145,132,217,.30),rgba(201,143,174,.28))',
              animation: 'bbbGlowRing 2.6s infinite',
            }}
          >
            {busy ? 'Prüfe …' : 'Aufschließen'}
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text-dim-2)', maxWidth: 280, lineHeight: 1.5 }}>
          Die PIN steht in der Server-Konfiguration und im Terminal beim Start.
        </div>
      </div>
    </div>
  );
}

/** Kurzer Handshake nur zur PIN-Prüfung, damit die Sperre sofort meckert. */
function testPin(pin) {
  return new Promise((resolve) => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    const done = (ok) => {
      try {
        ws.close();
      } catch {
        /* egal */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 4000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'admin', pin }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'ack') {
        clearTimeout(timer);
        done(!msg.error);
      }
      if (msg.type === 'state') {
        clearTimeout(timer);
        done(true);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
  });
}

/* ── Konsole ────────────────────────────────────────────────── */

function Console({ pin, onLock }) {
  const { state, status, send } = useConnection({ role: 'admin', pin });
  const [section, setSection] = useState('players');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const run = useCallback(
    async (action, payload = {}) => {
      const res = await send({ type: 'admin', action, ...payload });
      setToast(res?.error || 'Erledigt.');
      return res || {};
    },
    [send],
  );

  const index = SECTIONS.findIndex((s) => s.key === section);

  if (!state) {
    return (
      <div style={{ position: 'relative', height: '100dvh', background: 'var(--ground)' }}>
        <PartyBackground intensity={0.9} />
        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            color: 'var(--text-dim)',
          }}
        >
          {status === 'connecting' ? 'Verbindung wird aufgebaut …' : 'Warte auf den Server …'}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
        background: 'var(--ground)',
        overflow: 'hidden',
      }}
    >
      <PartyBackground intensity={0.7} />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div className="bbb-track" style={{ width: '500%', transform: `translateX(-${index * 20}%)` }}>
          <div style={{ flex: '0 0 20%' }}>
            <Players state={state} run={run} />
          </div>
          <div style={{ flex: '0 0 20%' }}>
            <Approve state={state} run={run} />
          </div>
          <div style={{ flex: '0 0 20%' }}>
            <Cards state={state} run={run} />
          </div>
          <div style={{ flex: '0 0 20%' }}>
            <Game state={state} run={run} onLock={onLock} />
          </div>
          <div style={{ flex: '0 0 20%' }}>
            <Log state={state} run={run} />
          </div>
        </div>
      </div>

      <nav
        style={{
          flex: 'none',
          display: 'flex',
          padding: '9px 4px max(14px, env(safe-area-inset-bottom))',
          background: 'rgba(16,17,26,.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--line-2)',
          position: 'relative',
          zIndex: 40,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: `calc(${index * 20}% + 7%)`,
            width: '6%',
            height: 3,
            borderRadius: 2,
            background: 'linear-gradient(90deg,#c98fae,#d9c08f)',
            transition: 'left .42s cubic-bezier(.32,.72,.24,1)',
          }}
        />
        {SECTIONS.map((s) => {
          const active = section === s.key;
          const badge =
            s.key === 'approve'
              ? (state.claims?.length || 0) + (state.bets || []).filter((b) => b.disputed).length
              : 0;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1,
                position: 'relative',
                border: 0,
                background: 'transparent',
                padding: '6px 0 2px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                color: active ? 'var(--text)' : '#5f6375',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  animation: active ? 'bbbTabPop .34s cubic-bezier(.3,1.4,.5,1) forwards' : 'none',
                  filter: active ? 'drop-shadow(0 3px 8px rgba(201,143,174,.55))' : 'none',
                }}
              >
                <PixelIcon
                  name={s.icon}
                  size={25}
                  color={active ? '#e9e9ed' : '#565a6b'}
                  accent={active ? '#c98fae' : '#3f424d'}
                />
              </span>
              <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 400 }}>{s.label}</span>
              {badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 'calc(50% - 26px)',
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 9,
                    fontSize: 10.5,
                    fontWeight: 700,
                    lineHeight: '18px',
                    color: '#0f101a',
                    background: 'var(--rose)',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {toast && (
        <button
          onClick={() => setToast(null)}
          style={{
            position: 'fixed',
            left: 14,
            right: 14,
            bottom: 'calc(84px + env(safe-area-inset-bottom))',
            zIndex: 300,
            padding: '13px 15px',
            borderRadius: 14,
            border: '1px solid var(--line-accent)',
            background: 'rgba(28,26,44,.96)',
            backdropFilter: 'blur(10px)',
            color: 'var(--text-soft)',
            fontSize: 13.5,
            textAlign: 'left',
            cursor: 'pointer',
            animation: 'bbbPop .28s both',
          }}
        >
          {toast}
        </button>
      )}
    </div>
  );
}

/* ── Abschnitt: Spieler ─────────────────────────────────────── */

const ROLES = ['guest', 'birthday', 'host'];
const ROLE_LABEL = { guest: 'Gast', birthday: 'Geburtstagskind', host: 'Host' };
const STATUS_LABEL = {
  idle: 'wartet',
  chooseObserver: 'wählt Beobachter',
  observer: 'hat gezogen',
  level: 'wählt Stufe',
  reveal: 'macht die Aufgabe',
  waiting: 'wartet auf Abnahme',
};

/**
 * Die stillen Fallen des Abends: Karten, die niemand ziehen kann, ein
 * abgeschalteter Shop, eine Abnahme, auf die seit einer halben Stunde niemand
 * reagiert. Der Server rechnet die Liste bei jeder Änderung neu; steht nichts
 * an, ist hier nichts zu sehen.
 */
function Checks({ checks }) {
  const list = checks || [];
  if (!list.length) return null;
  const warn = list.filter((c) => c.level === 'warn');
  const tone = warn.length ? 'var(--line-rose)' : 'var(--line-2)';

  return (
    <div
      className="bbb-card"
      style={{
        padding: 14,
        marginBottom: 16,
        boxShadow: `0 0 0 1px ${tone}`,
        animation: 'bbbSlideUp .4s both',
      }}
    >
      <Label style={{ marginBottom: 9 }}>
        {warn.length ? 'Kümmert sich nicht von allein' : 'Zur Kenntnis'}
      </Label>
      {list.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 10,
            padding: i === 0 ? '0 0 9px' : '9px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--line)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1.45 }}>
            {c.level === 'warn' ? '⚠️' : 'ℹ️'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-muted)' }}>{c.text}</div>
            {c.hint && (
              <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-dim-2)', marginTop: 2 }}>
                {c.hint}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Players({ state, run }) {
  const players = [...(state.players || [])].sort((a, b) => b.score - a.score);

  return (
    <Screen kicker="Wer mitspielt" title="Spieler">
      <Checks checks={state.checks} />
      {players.map((p, i) => (
        <div
          key={p.id}
          className="bbb-card"
          style={{
            padding: 16,
            marginBottom: 12,
            opacity: p.active ? 1 : 0.55,
            animation: `bbbSlideUp .4s ${Math.min(i, 8) * 0.03}s both`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 46, height: 46, flex: 'none' }}>
              <img className="bbb-pixel" src={avatarUrl(p.cfg)} alt="" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim-2)' }}>
                {ROLE_LABEL[p.role]} · {STATUS_LABEL[p.status] || p.status}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{ fontSize: 24, fontWeight: 700, color: p.score < 0 ? 'var(--rose)' : 'var(--gold)' }}
              >
                {p.score}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 13 }}>
            {[-5, -1, 1, 5].map((d) => (
              <Btn key={d} flex onClick={() => run('adjust', { targetId: p.id, delta: d, note: 'Host' })}>
                {d > 0 ? `+${d}` : d}
              </Btn>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
            <Btn flex onClick={() => run('setActive', { targetId: p.id, active: !p.active })}>
              {p.active ? 'Pausieren' : 'Zurückholen'}
            </Btn>
            <Btn
              flex
              onClick={() =>
                run('setRole', { targetId: p.id, role: ROLES[(ROLES.indexOf(p.role) + 1) % ROLES.length] })
              }
            >
              Rolle wechseln
            </Btn>
          </div>
        </div>
      ))}

      {!players.length && <Empty text="Noch niemand da. Der QR-Code hängt hoffentlich." />}
      <InfoBox
        title="Punkte korrigieren"
        lines={[
          'Jede Korrektur landet als Ereignis im Protokoll.',
          'Pausierte Spieler werden nicht mehr als Beobachter gezogen.',
        ]}
      />
    </Screen>
  );
}

/* ── Abschnitt: Freigeben ───────────────────────────────────── */

function Approve({ state, run }) {
  const claims = state.claims || [];
  const bets = (state.bets || []).filter((b) => b.status === 'running' || b.disputed);
  const effects = state.effects || [];

  return (
    <Screen kicker="Wenn es hakt" title="Freigeben" sub="Für Handys im Standby und Streitfälle.">
      <Label>Offene Abnahmen</Label>
      {claims.map((c) => (
        <div key={c.id} className="bbb-card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{c.player}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>+{c.points}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim-2)', marginTop: 2 }}>
            {c.title} · {c.levelLabel} · {relativeTime(c.createdAt)}
          </div>
          <div
            className="bbb-prose"
            style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-soft)', margin: '11px 0' }}
          >
            {c.text}
          </div>
          <div style={{ fontSize: 12, color: 'var(--line-accent-2)', marginBottom: 12 }}>
            Beobachter: {c.observers.join(', ') || 'niemand'} ({c.confirmed}/{c.total} bestätigt)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn flex tone="mint" onClick={() => run('settleClaim', { claimId: c.id, confirmed: true })}>
              Freigeben
            </Btn>
            <Btn flex onClick={() => run('settleClaim', { claimId: c.id, confirmed: false })}>
              Ablehnen
            </Btn>
          </div>
        </div>
      ))}
      {!claims.length && <Empty text="Keine offene Abnahme." />}

      <Label style={{ marginTop: 24 }}>Wetten</Label>
      {bets.map((b) => (
        <div key={b.id} className="bbb-card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim-2)' }}>
            {b.createdByName} ↔ {b.acceptedByName || 'offen'} · {b.stake} Punkte
            {b.disputed ? ' · Streitfall' : ''}
          </div>
          <div className="bbb-prose" style={{ fontSize: 16, lineHeight: 1.45, margin: '9px 0 13px' }}>
            „{b.text}"
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn flex onClick={() => run('resolveBet', { betId: b.id, winnerId: b.createdBy })}>
              {b.createdByName} gewinnt
            </Btn>
            {b.acceptedBy && (
              <Btn flex onClick={() => run('resolveBet', { betId: b.id, winnerId: b.acceptedBy })}>
                {b.acceptedByName} gewinnt
              </Btn>
            )}
          </div>
          <Btn wide style={{ marginTop: 7 }} onClick={() => run('cancelBet', { betId: b.id })}>
            Stornieren, Einsätze zurück
          </Btn>
        </div>
      ))}
      {!bets.length && <Empty text="Keine laufende Wette." />}

      {effects.length > 0 && (
        <>
          <Label style={{ marginTop: 24 }}>Aktive Effekte</Label>
          {effects.map((e) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '13px 15px',
                marginBottom: 9,
                borderRadius: 14,
                background: 'rgba(22,23,34,.75)',
                boxShadow: '0 0 0 1px var(--line)',
              }}
            >
              <div style={{ flex: 1, fontSize: 14 }}>
                <b>{e.player}</b>
                <span style={{ color: 'var(--text-dim-2)' }}>
                  {' '}
                  · {e.effect}
                  {e.source ? ` von ${e.source}` : ''}
                </span>
              </div>
              <Btn onClick={() => run('clearEffect', { effectId: e.id })}>Löschen</Btn>
            </div>
          ))}
        </>
      )}
    </Screen>
  );
}

/* ── Abschnitt: Karten ──────────────────────────────────────── */

/** Kategorien kommen aus dem Katalog selbst, damit die Liste nie veraltet. */
const FALLBACK_CATEGORIES = ['sozial', 'trinken', 'performance', 'körperlich', 'wissen'];

function Cards({ state, run }) {
  // Ohne useMemo wäre `cards` bei fehlendem Katalog jedes Mal ein neues leeres
  // Array, und die Ableitungen darunter würden bei jedem Rendern neu laufen.
  const cards = useMemo(() => state.cards || [], [state.cards]);
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState('');
  const [importError, setImportError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyCardForm);
  const [addError, setAddError] = useState(null);
  const [added, setAdded] = useState(null);
  const [nameModal, setNameModal] = useState(false);

  // Läuft beim Tippen mit, damit die Warnung nicht erst beim Absenden kommt.
  const nameHits = useMemo(
    () => findNames([form.l1, form.l5, form.l10].join(' \n '), state.players || []),
    [form.l1, form.l5, form.l10, state.players],
  );

  const categories = useMemo(() => {
    const found = cards.map((c) => c.category).filter((c) => c && c !== 'geburtstagskind');
    return [...new Set([...FALLBACK_CATEGORIES, ...found])];
  }, [cards]);

  const shown = cards.filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()));
  const active = cards.filter((c) => c.enabled !== false).length;

  const toggle = (card) => {
    const next = cards.map((c) => (c.id === card.id ? { ...c, enabled: c.enabled === false } : c));
    run('saveCatalog', { kind: 'cards', list: next });
  };

  const addCard = () => {
    const texts = [form.l1, form.l5, form.l10].map((t) => t.trim());
    if (texts.some((t) => !t)) return setAddError('Alle drei Stufen brauchen einen Text.');

    // Namen blockieren nicht, sie halten einmal an. Das Popup entscheidet.
    if (nameHits.length) {
      setNameModal(true);
      setAddError(null);
      setAdded(null);
      return undefined;
    }
    return saveCard(texts);
  };

  const saveCard = (texts) => {
    const title = form.title.trim() || shortTitle(texts[0]);

    // Freie Nummer suchen, damit nichts eine bestehende Karte überschreibt
    let n = cards.length + 1;
    while (cards.some((c) => c.id === `card-${String(n).padStart(3, '0')}`)) n += 1;

    const card = {
      id: `card-${String(n).padStart(3, '0')}`,
      title,
      category: form.category,
      tags: [],
      enabled: true,
      levels: {
        1: { text: texts[0], timerSec: null },
        5: { text: texts[1], timerSec: null },
        10: { text: texts[2], timerSec: null },
      },
      requires: { props: [], minPlayers: 1, targetsOtherPlayer: false },
      authoredBy: 'Host',
      createdAt: new Date().toISOString(),
    };
    run('saveCatalog', { kind: 'cards', list: [...cards, card] });
    setForm({ ...emptyCardForm, category: form.category });
    setAddError(null);
    setNameModal(false);
    setAdded(title);
    return undefined;
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cards.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Screen kicker="Der Katalog" title="Karten">
      <div style={{ display: 'flex', gap: 9, marginBottom: 16 }}>
        <Stat label="Im Pool" value={state.poolRemaining} />
        <Stat label="Aktiv" value={active} />
        <Stat label="Gesamt" value={cards.length} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Btn flex onClick={() => run('reshuffle')}>
          Pool neu mischen
        </Btn>
        <Btn flex onClick={exportJson}>
          Export
        </Btn>
        <Btn flex onClick={() => setImporting((v) => !v)}>
          Import
        </Btn>
      </div>

      <Btn
        wide
        tone={adding ? 'default' : 'mint'}
        onClick={() => {
          setAdding((v) => !v);
          setAddError(null);
          setAdded(null);
        }}
        style={{ marginBottom: 16, padding: 15, fontSize: 15 }}
      >
        {adding ? 'Schließen' : '+  Neue Karte schreiben'}
      </Btn>

      {adding && (
        <div className="bbb-card" style={{ padding: 16, marginBottom: 16 }}>
          <Label>Kategorie</Label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
            {categories.map((c) => (
              <Btn
                key={c}
                active={form.category === c}
                onClick={() => setForm((f) => ({ ...f, category: c }))}
                style={{ padding: '9px 13px', fontSize: 13 }}
              >
                {c}
              </Btn>
            ))}
          </div>

          {LEVEL_FIELDS.map(({ key, label, points, hint }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--gold)' }}>
                  {points} {points === 1 ? 'Punkt' : 'Punkte'}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim-2)', marginLeft: 'auto' }}>{hint}</span>
              </div>
              <textarea
                className="bbb-input"
                rows={2}
                value={form[key]}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [key]: e.target.value }));
                  setAddError(null);
                  setAdded(null);
                }}
                placeholder="Aufgabentext"
                style={{ fontSize: 14.5, lineHeight: 1.45, resize: 'vertical' }}
              />
            </div>
          ))}

          <Label style={{ marginTop: 4 }}>Titel (kann leer bleiben)</Label>
          <input
            className="bbb-input"
            value={form.title}
            maxLength={40}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={form.l1.trim() ? shortTitle(form.l1.trim()) : 'wird sonst aus Stufe 1 gebaut'}
            style={{ fontSize: 15 }}
          />

          {addError && (
            <div role="alert" style={{ marginTop: 11, fontSize: 13.5, color: 'var(--rose)' }}>
              {addError}
            </div>
          )}
          {added && (
            <div style={{ marginTop: 11, fontSize: 13.5, color: 'var(--mint)' }}>
              „{added}“ liegt im Pool. Weiter geht es direkt oben.
            </div>
          )}

          {!!nameHits.length && (
            <div style={{ marginTop: 11, fontSize: 12.5, color: 'var(--rose)', lineHeight: 1.45 }}>
              Name erkannt: {nameHits.map((h) => h.name).join(', ')}
            </div>
          )}

          <Btn wide tone="mint" onClick={addCard} style={{ marginTop: 14, padding: 15, fontSize: 15 }}>
            In den Pool legen
          </Btn>
        </div>
      )}

      {importing && (
        <div className="bbb-card" style={{ padding: 16, marginBottom: 16 }}>
          <Label>cards.json einfügen</Label>
          <textarea
            className="bbb-input"
            rows={7}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='[ { "id": "card-011", … } ]'
            style={{ marginTop: 8, fontSize: 13, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
          />
          {importError && (
            <div role="alert" style={{ marginTop: 9, fontSize: 13, color: 'var(--rose)' }}>
              {importError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn
              flex
              tone="mint"
              onClick={() => {
                try {
                  const list = JSON.parse(draft);
                  if (!Array.isArray(list)) throw new Error('Es muss eine Liste sein.');
                  run('saveCatalog', { kind: 'cards', list });
                  setImporting(false);
                  setDraft('');
                  setImportError(null);
                } catch (err) {
                  setImportError(err.message);
                }
              }}
            >
              Übernehmen
            </Btn>
            <Btn flex onClick={() => setImporting(false)}>
              Abbrechen
            </Btn>
          </div>
        </div>
      )}

      <input
        className="bbb-input"
        placeholder="Karte suchen"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 14 }}
      />

      {shown.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '13px 15px',
            marginBottom: 9,
            borderRadius: 14,
            background: 'rgba(22,23,34,.75)',
            boxShadow: '0 0 0 1px var(--line)',
            opacity: c.enabled === false ? 0.45 : 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim-2)' }}>{c.category}</div>
          </div>
          <Btn onClick={() => toggle(c)}>{c.enabled === false ? 'An' : 'Aus'}</Btn>
        </div>
      ))}

      {!shown.length && <Empty text="Keine Karte gefunden." />}
      <InfoBox
        title="Katalog tauschen"
        lines={[
          'Import überschreibt cards.json komplett.',
          'Ausgeschaltete Karten werden nicht mehr gezogen.',
          'Der Pool merkt sich, was schon dran war.',
        ]}
      />

      {nameModal && (
        <NameModal
          hits={nameHits}
          onBack={() => setNameModal(false)}
          onAnyway={() => saveCard([form.l1, form.l5, form.l10].map((t) => t.trim()))}
        />
      )}
    </Screen>
  );
}

/* ── Abschnitt: Spiel ───────────────────────────────────────── */

const PHASES = [
  ['lobby', 'Lobby'],
  ['running', 'Läuft'],
  ['finale', 'Finale'],
  ['ended', 'Beendet'],
];

const NUMBERS = [
  ['rerollLimitPerCard', 'Rerolls pro Karte'],
  ['betStakeCap', 'Max. Wetteinsatz'],
  ['observerCount', 'Beobachter pro Karte'],
  ['wildcardIntervalMinMin', 'Auftrag frühestens (Min)'],
  ['wildcardIntervalMaxMin', 'Auftrag spätestens (Min)'],
  ['wildcardTimeoutMin', 'Auftrag verfällt nach (Min)'],
  ['wildcardPoints', 'Punkte pro Auftrag'],
];

const SWITCHES = [
  ['wildcardEnabled', 'Sonderaufträge'],
  ['betsEnabled', 'Black Market'],
  ['shopEnabled', 'Shop'],
  ['specialsEnabled', 'Special Cards'],
];

function Game({ state, run, onLock }) {
  const cfg = state.config || {};
  const [confirm, setConfirm] = useState(null);
  const next = state.nextWildcardAt ? new Date(state.nextWildcardAt) : null;

  const patch = (key, value) => run('setConfig', { patch: { [key]: value } });

  return (
    <Screen kicker="Steuerung" title="Spiel">
      <Label>Phase</Label>
      <div style={{ display: 'flex', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
        {PHASES.map(([key, label]) => (
          <Btn key={key} active={state.phase === key} onClick={() => run('setPhase', { phase: key })}>
            {label}
          </Btn>
        ))}
      </div>

      <Label>Sonderauftrag</Label>
      <div className="bbb-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 13, lineHeight: 1.5 }}>
          {state.wildcard
            ? `Offen bei ${state.wildcard.name}.`
            : next
              ? `Nächster gegen ${next.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.`
              : 'Gerade keiner geplant.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn flex onClick={() => run('wildcardNow')}>
            Jetzt auslösen
          </Btn>
          {state.wildcard && (
            <Btn flex onClick={() => run('wildcardCancel')}>
              Abbrechen
            </Btn>
          )}
        </div>
      </div>

      <Label>Schalter</Label>
      <div className="bbb-card" style={{ padding: '6px 16px', marginBottom: 20 }}>
        {SWITCHES.map(([key, label], i) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '13px 0',
              borderBottom: i === SWITCHES.length - 1 ? 'none' : '1px solid var(--line)',
            }}
          >
            <div style={{ flex: 1, fontSize: 15 }}>{label}</div>
            <Btn active={!!cfg[key]} onClick={() => patch(key, !cfg[key])}>
              {cfg[key] ? 'An' : 'Aus'}
            </Btn>
          </div>
        ))}
      </div>

      <Label>Reroll</Label>
      <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
        <Btn active={cfg.rerollScaling === 'linear'} onClick={() => patch('rerollScaling', 'linear')}>
          Linear ×n
        </Btn>
        <Btn
          active={cfg.rerollScaling === 'exponential'}
          onClick={() => patch('rerollScaling', 'exponential')}
        >
          Exponentiell
        </Btn>
      </div>
      <Label>Zahlen</Label>
      <div className="bbb-card" style={{ padding: '6px 16px', marginBottom: 20 }}>
        {NUMBERS.map(([key, label], i) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 0',
              borderBottom: i === NUMBERS.length - 1 ? 'none' : '1px solid var(--line)',
            }}
          >
            <div style={{ flex: 1, fontSize: 15 }}>{label}</div>
            <input
              className="bbb-input"
              type="number"
              value={cfg[key] ?? 0}
              onChange={(e) => patch(key, Number(e.target.value))}
              style={{ width: 84, textAlign: 'center', padding: '9px 8px', fontSize: 15 }}
            />
          </div>
        ))}
      </div>

      <Label>Mitnehmen</Label>
      <div className="bbb-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 13, lineHeight: 1.5 }}>
          Die Sicherung ist eine Datei mit dem kompletten Verlauf. Vor allem vor dem Zurücksetzen einmal
          ziehen. Der Rückblick rechnet Endstand, Titel und den ganzen Abend aus dem Protokoll; er
          funktioniert auch schon mittendrin.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn flex onClick={() => window.open('/api/export/state', '_blank')}>
            Spielstand sichern
          </Btn>
          <Btn flex onClick={() => window.open('/spickzettel', '_blank')}>
            Spickzettel drucken
          </Btn>
          <Btn wide onClick={() => window.open('/rueckblick', '_blank')}>
            Rückblick auf den Abend
          </Btn>
        </div>
      </div>

      <Label>Gefährlich</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <Btn wide tone="rose" onClick={() => setConfirm('end')}>
          Spiel beenden und auswerten
        </Btn>
        <Btn wide tone="rose" onClick={() => setConfirm('reset')}>
          Party komplett zurücksetzen
        </Btn>
        <Btn wide onClick={onLock}>
          Admin abschließen
        </Btn>
      </div>

      {confirm && (
        <div
          className="bbb-card"
          style={{ padding: 18, boxShadow: '0 0 0 1px var(--rose)', animation: 'bbbPop .28s both' }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {confirm === 'end' ? 'Wirklich beenden?' : 'Wirklich alles löschen?'}
          </div>
          <div
            className="bbb-prose"
            style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.5 }}
          >
            {confirm === 'end'
              ? 'Die Auswertung wird eingefroren und allen angezeigt.'
              : 'Spieler, Punkte und der ganze Verlauf sind danach weg.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn
              flex
              tone="rose"
              onClick={() => {
                run(confirm === 'end' ? 'endGame' : 'resetParty');
                setConfirm(null);
              }}
            >
              Ja, durchziehen
            </Btn>
            <Btn flex onClick={() => setConfirm(null)}>
              Abbrechen
            </Btn>
          </div>
        </div>
      )}
    </Screen>
  );
}

/* ── Abschnitt: Protokoll ───────────────────────────────────── */

function Log({ state, run }) {
  const events = state.events || [];

  return (
    <Screen
      kicker="Jede Änderung"
      title="Protokoll"
      sub="Zurücknehmen streicht das Ereignis aus der Rechnung."
    >
      {events.map((e) => (
        <div
          key={e.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '12px 14px',
            marginBottom: 8,
            borderRadius: 13,
            background: 'rgba(22,23,34,.72)',
            boxShadow: '0 0 0 1px var(--line)',
            opacity: e.voided ? 0.45 : 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{ fontSize: 14, fontWeight: 500, textDecoration: e.voided ? 'line-through' : 'none' }}
            >
              {e.player} · {e.type}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeTime(e.ts)}</div>
          </div>
          {!!e.delta && (
            <div
              style={{ fontSize: 15, fontWeight: 700, color: e.delta > 0 ? 'var(--mint)' : 'var(--rose)' }}
            >
              {e.delta > 0 ? `+${e.delta}` : e.delta}
            </div>
          )}
          {!!e.delta && (
            <Btn onClick={() => run('voidEvent', { eventId: e.id, voided: !e.voided })}>
              {e.voided ? 'Zurück' : 'Streichen'}
            </Btn>
          )}
        </div>
      ))}
      {!events.length && <Empty text="Noch nichts passiert." />}
    </Screen>
  );
}

/* ── Bausteine ──────────────────────────────────────────────── */

function Screen({ kicker, title, sub, children }) {
  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header kicker={kicker} title={title} sub={sub} />
      {children}
      <div style={{ height: 20 }} />
    </div>
  );
}

/**
 * Popup, wenn im Aufgabentext ein Name steht. Bewusst kein harter Block: das
 * Geburtstagskind darf vorkommen, und manchmal will man den Namen wirklich.
 * Erscheint erst beim Absenden, nie beim Tippen.
 */
function NameModal({ hits, onBack, onAnyway }) {
  const guests = hits.filter((h) => h.source === 'gast').map((h) => h.name);
  const listed = hits.filter((h) => h.source === 'liste').map((h) => h.name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aufgaben neutral formulieren"
      onClick={onBack}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(8,9,15,.78)',
        backdropFilter: 'blur(8px)',
        animation: 'bbbPop .22s both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bbb-card"
        style={{
          width: '100%',
          maxWidth: 380,
          padding: 22,
          boxShadow: '0 0 0 1px var(--rose), 0 24px 60px rgba(0,0,0,.55)',
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 10 }}>✋</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2 }}>
          Aufgaben müssen neutral formuliert sein
        </div>

        <div
          className="bbb-prose"
          style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-soft)', margin: '12px 0 0' }}
        >
          {guests.length > 0 && (
            <>
              <b style={{ color: 'var(--rose-light)' }}>{guests.join(', ')}</b>
              {guests.length === 1 ? ' steht' : ' stehen'} auf der Gästeliste.{' '}
            </>
          )}
          {listed.length > 0 && (
            <>
              <b style={{ color: 'var(--rose-light)' }}>{listed.join(', ')}</b>
              {listed.length === 1 ? ' klingt' : ' klingen'} nach einem Vornamen.{' '}
            </>
          )}
          Eine Karte mit Namen ist tot, sobald die Person absagt, schon schläft oder gar nicht gemeint war.
          Schreib die Rolle statt der Person.
        </div>

        <div
          style={{
            margin: '15px 0 4px',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(15,16,26,.55)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <div style={{ color: 'var(--text-dim-2)', textDecoration: 'line-through' }}>
            Trink mit {guests[0] || listed[0] || 'Robby'} einen Shot.
          </div>
          <div style={{ color: 'var(--mint)' }}>Trink mit der Person links von dir einen Shot.</div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-dim-2)', marginBottom: 16 }}>
          Ausgenommen ist das Geburtstagskind. Auf Buki darf eine Karte zeigen.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn flex tone="mint" onClick={onBack}>
            Umformulieren
          </Btn>
          <Btn flex tone="rose" onClick={onAnyway}>
            Trotzdem anlegen
          </Btn>
        </div>
      </div>
    </div>
  );
}

const emptyCardForm = { title: '', category: 'sozial', l1: '', l5: '', l10: '' };

const LEVEL_FIELDS = [
  { key: 'l1', label: 'Stufe 1', points: 1, hint: 'traut sich jeder' },
  { key: 'l5', label: 'Stufe 2', points: 5, hint: 'muss man überlegen' },
  { key: 'l10', label: 'Stufe 3', points: 10, hint: 'tut weh' },
];

/** Aus dem ersten Satz einen kurzen Kartennamen bauen. */
function shortTitle(text) {
  const words = text
    .replace(/[.,!?;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 3).join(' ').slice(0, 40) || 'Neue Karte';
}

function Label({ children, style }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--text-dim-2)',
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: 14,
        background: 'rgba(20,21,31,.72)',
        boxShadow: '0 0 0 1px var(--line-2)',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '.15em',
          textTransform: 'uppercase',
          color: 'var(--text-dim-2)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const TONES = {
  default: { border: 'var(--line-3)', bg: 'rgba(28,29,41,.9)', fg: 'var(--text-muted)' },
  active: { border: 'var(--accent)', bg: 'rgba(145,132,217,.24)', fg: 'var(--text)' },
  mint: { border: 'var(--mint)', bg: 'rgba(143,201,180,.16)', fg: '#dff0e9' },
  rose: { border: 'var(--line-rose)', bg: 'rgba(201,143,174,.14)', fg: 'var(--rose-light)' },
};

function Btn({ children, onClick, flex, wide, active, tone = 'default', style }) {
  const t = active ? TONES.active : TONES[tone];
  return (
    <button
      className="bbb-btn"
      onClick={onClick}
      style={{
        flex: flex ? 1 : 'none',
        width: wide ? '100%' : undefined,
        padding: '12px 15px',
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: t.fg,
        fontSize: 14,
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
