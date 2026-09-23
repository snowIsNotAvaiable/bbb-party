import { useEffect, useState } from 'react';
import { avatarUrl, catUrl, partyCatUrl, CAT_FRAME } from '../lib/sprites.js';

/**
 * Die Zustandsmaschine des eigenen Zugs:
 * idle → observer → level → reveal → waiting, dazu der Reroll-Abzweig.
 * Der Aufgabentext kommt erst nach der Stufenwahl über die Leitung.
 */

/** Die Punktwerte sind 1, 5 und 10; angezeigt wird die schlichte Stufennummer. */
export const LEVEL_NAME = { 1: 'Stufe 1', 5: 'Stufe 2', 10: 'Stufe 3', 25: 'Sonderauftrag' };

const HEADLINE = {
  idle: 'Bereit?',
  chooseObserver: 'Wer schaut zu?',
  observer: 'Karte gezogen',
  level: 'Wähl deine Stufe',
  reveal: "Los geht's",
  waiting: 'In Wartestellung',
};

const LEVELS = [
  {
    level: 1,
    label: 'Stufe 1',
    sub: 'In 30 Sekunden erledigt',
    points: '+1',
    color: 'var(--mint)',
    subColor: 'var(--text-dim-2)',
    border: 'var(--line-3)',
    background: 'linear-gradient(100deg,rgba(143,201,180,.10),rgba(28,29,41,.9))',
  },
  {
    level: 5,
    label: 'Stufe 2',
    sub: 'Kostet Überwindung',
    points: '+5',
    color: 'var(--rose)',
    subColor: '#a98394',
    border: 'var(--line-rose)',
    background: 'linear-gradient(100deg,rgba(201,143,174,.16),rgba(28,29,41,.9))',
  },
  {
    level: 10,
    label: 'Stufe 3',
    sub: 'Keine Rückfahrkarte',
    points: '+10',
    color: 'var(--accent-light)',
    subColor: '#a99cc9',
    border: 'var(--accent)',
    background: 'linear-gradient(100deg,rgba(145,132,217,.26),rgba(201,143,174,.16))',
  },
];

export default function TaskTab({ state, run, wildcardPending, onOpenWildcard }) {
  const turn = state.turn || {};
  const me = state.me;
  const effects = state.effects || [];
  const [busy, setBusy] = useState(false);
  const [catFrame, setCatFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCatFrame((f) => (f + 1) % 4), 260);
    return () => clearInterval(id);
  }, []);

  const go = async (action, payload) => {
    if (busy) return;
    setBusy(true);
    await run(action, payload);
    setBusy(false);
  };

  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header kicker="Meine Aufgabe" title={HEADLINE[turn.status] || 'Bereit?'} />

      {wildcardPending && (
        <button
          className="bbb-btn bbb-sheen"
          onClick={onOpenWildcard}
          style={{
            width: '100%',
            marginBottom: 14,
            padding: '15px 17px',
            borderRadius: 17,
            border: '1px solid var(--rose)',
            background: 'linear-gradient(100deg,rgba(201,143,174,.22),rgba(145,132,217,.16))',
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            textAlign: 'left',
            animation: 'bbbGlowRing 2s infinite',
          }}
        >
          <span style={{ width: 42, height: 38, flex: 'none' }}>
            <img className="bbb-pixel" src={partyCatUrl(9, catFrame, 1)} alt="" />
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Sonderauftrag wartet</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--rose-light)' }}>
              {wildcardPending.points} Punkte · tippen zum Öffnen
            </span>
          </span>
          <span style={{ fontSize: 20 }}>›</span>
        </button>
      )}

      {effects.map((eff) => (
        <div
          key={eff.id}
          className="bbb-prose"
          style={{
            marginBottom: 11,
            padding: '13px 15px',
            borderRadius: 15,
            background: eff.foreign ? 'rgba(201,143,174,.12)' : 'rgba(143,201,180,.10)',
            boxShadow: `0 0 0 1px ${eff.foreign ? 'var(--line-rose)' : '#3f6357'}`,
            fontSize: 13.5,
            lineHeight: 1.45,
            color: eff.foreign ? '#f0dde4' : '#d3ece2',
          }}
        >
          ⚡ {eff.label}
        </div>
      ))}

      {turn.status === 'idle' && (
        <div
          className="bbb-card"
          style={{
            padding: '26px 20px 22px',
            textAlign: 'center',
            background: 'linear-gradient(160deg,rgba(43,39,65,.92),rgba(25,26,37,.92))',
            boxShadow: '0 0 0 1px #4a4173, 0 18px 44px rgba(0,0,0,.45)',
          }}
        >
          <div style={{ width: 132, height: 110, margin: '0 auto 10px' }}>
            <img
              className="bbb-pixel"
              src={partyCatUrl(me?.cfg?.fur ?? 0, catFrame, me?.cfg?.pattern ?? 0)}
              alt=""
            />
          </div>
          <div style={{ fontSize: 17, color: 'var(--text-muted)', marginBottom: 20 }}>
            Deine Katze wartet auf die nächste Karte.
          </div>
          <button
            className="bbb-btn bbb-sheen"
            disabled={busy}
            onClick={() => go('draw')}
            style={{
              width: '100%',
              padding: 22,
              fontSize: 21,
              fontWeight: 700,
              borderRadius: 18,
              border: '1px solid var(--accent)',
              background: 'linear-gradient(100deg,rgba(145,132,217,.30),rgba(201,143,174,.28))',
              animation: 'bbbGlowRing 2.4s infinite',
            }}
          >
            Karte ziehen
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <MiniStat label="Punkte" value={me?.score ?? 0} color="var(--gold)" />
            <MiniStat label="Rang" value={me?.rank ? `#${me.rank}` : '?'} />
            <MiniStat label="Rerolls" value={me?.rerollsLeft ?? 3} color="var(--rose)" />
          </div>
        </div>
      )}

      {turn.status === 'chooseObserver' && (
        <div className="bbb-card" style={{ padding: 20, animation: 'bbbPop .35s both' }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
            Beobachter-Wahl aus dem Shop. Diesmal suchst du dir die Person selbst aus.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {(turn.observerChoices || []).map((c) => (
              <button
                key={c.id}
                className="bbb-btn"
                disabled={busy}
                onClick={() => go('pickObserver', { observerId: c.id })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: 13,
                  borderRadius: 15,
                  border: '1px solid var(--line-3)',
                  background: 'rgba(28,29,41,.9)',
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 38, height: 38, flex: 'none' }}>
                  <img className="bbb-pixel" src={avatarUrl(c.cfg)} alt="" />
                </span>
                <span style={{ fontSize: 16.5, fontWeight: 500 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {turn.status === 'observer' && (
        <div
          className="bbb-card"
          style={{
            padding: '30px 20px 22px',
            textAlign: 'center',
            background: 'linear-gradient(160deg,rgba(43,39,65,.94),rgba(25,26,37,.94))',
            boxShadow: '0 0 0 1px var(--line-accent), 0 18px 44px rgba(0,0,0,.45)',
            animation: 'bbbPop .4s both',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            {turn.observers?.length > 1 ? 'Deine Beobachter' : 'Dein Beobachter'}
          </div>
          <div
            style={{
              width: 90,
              height: 90,
              margin: '16px auto 10px',
              animation: 'bbbFloat 2.6s ease-in-out infinite',
            }}
          >
            <img className="bbb-pixel" src={avatarUrl(turn.observers?.[0]?.cfg)} alt="" />
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--accent-lighter)' }}
          >
            {turn.observers?.map((o) => o.name).join(' & ') || 'niemand'}
          </div>
          <div
            className="bbb-prose"
            style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}
          >
            {turn.observers?.length
              ? 'Zufällig gezogen, bevor jemand die Aufgabe kennt.'
              : 'Noch ist niemand sonst da. Diese Aufgabe zählt ohne Abnahme.'}
          </div>
          <button
            className="bbb-btn"
            disabled={busy}
            onClick={() => go('observerAck')}
            style={{
              marginTop: 20,
              width: '100%',
              padding: 18,
              fontSize: 17,
              fontWeight: 600,
              borderRadius: 15,
              border: '1px solid var(--accent)',
              background: 'rgba(145,132,217,.12)',
            }}
          >
            Alles klar
          </button>
        </div>
      )}

      {turn.status === 'level' && (
        <div className="bbb-card" style={{ padding: 18, animation: 'bbbSpinIn .45s both' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                color: 'var(--text-dim-2)',
              }}
            >
              {turn.category}
            </div>
            <div style={{ fontSize: 12, color: 'var(--rose)' }}>
              👁 {turn.observers?.map((o) => o.name).join(', ') || 'niemand'}
            </div>
          </div>
          <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 6 }}>
            {turn.title}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.45 }}>
            {turn.forcedLevel
              ? `Zwangsstufe von ${turn.forcedBy}. Hier geht nur Stufe ${turn.forcedLevel}.`
              : 'Text kommt erst nach deiner Wahl. Katze im Sack.'}
          </div>

          {turn.peek && (
            <div
              style={{
                marginBottom: 16,
                padding: '11px 13px',
                borderRadius: 13,
                background: 'rgba(217,192,143,.10)',
                boxShadow: '0 0 0 1px #4a422c',
                fontSize: 12.5,
                color: '#d8c79c',
              }}
            >
              🔍 Peek: {turn.peek.category}, rund {turn.peek.length} Zeichen
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {LEVELS.map((lv) => {
              const blocked = turn.forcedLevel && turn.forcedLevel !== lv.level;
              return (
                <button
                  key={lv.level}
                  className="bbb-btn"
                  disabled={busy || blocked}
                  onClick={() => go('pickLevel', { level: lv.level })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '19px 20px',
                    borderRadius: 16,
                    border: `1px solid ${lv.border}`,
                    background: lv.background,
                    textAlign: 'left',
                    opacity: blocked ? 0.3 : 1,
                  }}
                >
                  <span>
                    <span style={{ fontSize: 19, fontWeight: 600 }}>{lv.label}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: lv.subColor, marginTop: 2 }}>
                      {lv.sub}
                    </span>
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 700, color: lv.color }}>{lv.points}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {turn.status === 'reveal' && <Reveal turn={turn} me={me} busy={busy} go={go} />}

      {turn.status === 'waiting' && (
        <div
          className="bbb-card"
          style={{ padding: '26px 20px 22px', textAlign: 'center', animation: 'bbbPop .3s both' }}
        >
          <div
            style={{
              width: 110,
              height: 92,
              margin: '0 auto 12px',
              animation: 'bbbBob 2.6s ease-in-out infinite',
            }}
          >
            <img
              className="bbb-pixel"
              src={catUrl(me?.cfg?.fur ?? 0, CAT_FRAME.SIT, me?.cfg?.pattern ?? 0)}
              alt=""
            />
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Wartet auf Abnahme von</div>
          <div
            style={{ fontSize: 25, fontWeight: 700, color: 'var(--accent-lighter)', margin: '5px 0 12px' }}
          >
            {turn.observers?.map((o) => o.name).join(' & ')}
          </div>
          <div
            style={{
              display: 'inline-block',
              padding: '9px 18px',
              borderRadius: 999,
              background: 'rgba(217,192,143,.14)',
              boxShadow: '0 0 0 1px var(--line-gold)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--gold)',
            }}
          >
            {LEVEL_NAME[turn.level] || `Stufe ${turn.level}`} · +{turn.level} wartet
          </div>
          <button
            className="bbb-btn bbb-sheen"
            disabled={busy}
            onClick={() => go('draw')}
            style={{
              marginTop: 20,
              width: '100%',
              padding: 19,
              fontSize: 18,
              fontWeight: 600,
              borderRadius: 16,
              border: '1px solid var(--accent)',
              background: 'linear-gradient(100deg,rgba(145,132,217,.26),rgba(201,143,174,.24))',
            }}
          >
            Nächste Karte ziehen
          </button>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim-2)', marginTop: 12 }}>
            Warten musst du nicht.
          </div>
        </div>
      )}

      <PendingClaims state={state} />

      {me?.heldSpecials?.length > 0 && <SpecialHand state={state} go={go} busy={busy} />}

      <Running state={state} />
      <Balance me={me} />

      <div style={{ height: 20 }} />
    </div>
  );
}

/* ── Bausteine ─────────────────────────────────────────────── */

export const SCREEN_PAD = 'max(34px, calc(env(safe-area-inset-top) + 10px)) 16px 20px';

export function Header({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 16, animation: 'bbbSlideUp .4s both' }}>
      <div className="bbb-kicker">{kicker}</div>
      <div style={{ fontSize: 33, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.08, marginTop: 3 }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 13.5, color: 'var(--text-dim-2)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '9px 6px',
        borderRadius: 12,
        background: 'rgba(15,16,26,.5)',
        boxShadow: '0 0 0 1px var(--line)',
      }}
    >
      <div
        style={{
          fontSize: 8.5,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--text-dim-2)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Reveal({ turn, me, busy, go }) {
  // Nur Sonderaufträge haben eine Uhr. Ohne Uhr läuft gar kein Intervall, und
  // der gespeicherte Wert wird beim Anzeigen ignoriert statt zurückgesetzt.
  const hatUhr = !!(turn.timerSec && turn.revealedAt);
  const [ticks, setTicks] = useState(null);
  const left = hatUhr ? ticks : null;

  useEffect(() => {
    if (!hatUhr) return undefined;
    const end = Date.parse(turn.revealedAt) + turn.timerSec * 1000;
    const tick = () => setTicks(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [hatUhr, turn.timerSec, turn.revealedAt]);

  const isWild = turn.kind === 'wildcard';

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 22,
        background: isWild
          ? 'linear-gradient(155deg,#452a4c,#1a1b27)'
          : 'linear-gradient(155deg,#332c55,#1a1b27)',
        boxShadow: 'var(--sh-panel)',
        animation: 'bbbSpinIn .55s both',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--rose)' }}
        >
          {isWild ? 'Sonderauftrag' : `${LEVEL_NAME[turn.level] || `Stufe ${turn.level}`} · +${turn.level}`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          👁 {turn.observers?.map((o) => o.name).join(' & ') || 'niemand'}
        </div>
      </div>

      <div
        className="bbb-prose"
        style={{ fontSize: 22, lineHeight: 1.42, fontWeight: 500, margin: '16px 0 6px' }}
      >
        {turn.revealText}
      </div>

      <div
        style={{
          fontSize: 13,
          fontWeight: left != null && left <= 10 ? 700 : 400,
          color: left != null && left <= 10 ? 'var(--rose)' : 'var(--line-accent-2)',
          marginBottom: 20,
        }}
      >
        {turn.timerSec
          ? left > 0
            ? `⏱ noch ${formatClock(left)}`
            : '⏱ Zeit ist um. Zeig, was du hast.'
          : 'Kein Timer, lass dir Zeit.'}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="bbb-btn"
          disabled={busy}
          onClick={() => go('taskDone')}
          style={{
            flex: 1.4,
            padding: 18,
            fontSize: 17,
            fontWeight: 600,
            borderRadius: 15,
            border: '1px solid var(--mint)',
            background: 'rgba(143,201,180,.16)',
            color: '#dff0e9',
          }}
        >
          Erledigt ✓
        </button>
        {!isWild && (
          <button
            className="bbb-btn"
            disabled={busy}
            onClick={() => go('reroll')}
            style={{
              flex: 1,
              padding: 18,
              fontSize: 15.5,
              borderRadius: 15,
              border: '1px solid var(--line-rose)',
              background: 'transparent',
              color: 'var(--rose-light)',
            }}
          >
            Reroll ×{me?.nextRerollFactor ?? 1}
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-dim-2)', marginTop: 2 }}>
              noch {me?.rerollsLeft ?? 3} für diese Karte
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function SpecialHand({ state, go, busy }) {
  const [open, setOpen] = useState(null);
  const others = (state.ranking || []).filter((p) => p.id !== state.me?.id && p.active);

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'var(--text-dim-2)',
          marginBottom: 10,
        }}
      >
        Deine Special Cards
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.me.heldSpecials.map((sp, i) => (
          <div
            key={`${sp.id}-${i}`}
            style={{
              padding: 15,
              borderRadius: 17,
              background: 'linear-gradient(150deg,#3a2f52,#241d33 60%,#3d2f3a)',
              boxShadow: '0 0 0 1px var(--gold), 0 0 30px rgba(217,192,143,.16)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ fontSize: 26 }}>{sp.icon}</span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{sp.name}</span>
              <button
                className="bbb-btn"
                disabled={busy}
                onClick={() =>
                  sp.requiresTarget
                    ? setOpen(open === sp.id ? null : sp.id)
                    : go('playSpecial', { specialId: sp.id })
                }
                style={{
                  padding: '10px 15px',
                  borderRadius: 12,
                  border: '1px solid var(--gold)',
                  background: 'rgba(217,192,143,.12)',
                  color: '#f3e9d3',
                  fontSize: 13.5,
                }}
              >
                {sp.requiresTarget ? 'Ziel' : 'Spielen'}
              </button>
            </div>
            <div
              className="bbb-prose"
              style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 9, lineHeight: 1.5 }}
            >
              {sp.description}
            </div>
            {open === sp.id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                {others.map((p) => (
                  <button
                    key={p.id}
                    className="bbb-btn"
                    disabled={busy}
                    onClick={() => {
                      setOpen(null);
                      go('playSpecial', { specialId: sp.id, targetId: p.id });
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 11,
                      border: '1px solid var(--line-3)',
                      background: 'rgba(28,29,41,.9)',
                      fontSize: 14,
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wer gerade an einer Karte sitzt. Füllt den Screen mit echtem Leben. */
function Running({ state }) {
  const others = (state.running || []).filter((r) => r.playerId !== state.me?.id);
  if (!others.length) return null;
  const label = {
    observer: 'hat gezogen',
    chooseObserver: 'sucht sich einen Beobachter',
    level: 'wählt die Stufe',
    reveal: 'ist gerade dran',
    waiting: 'wartet auf Abnahme',
  };
  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>Läuft gerade</SectionLabel>
      {others.map((r, i) => (
        <div
          key={r.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 14px',
            marginBottom: 8,
            borderRadius: 15,
            background: 'rgba(22,23,34,.72)',
            boxShadow: '0 0 0 1px var(--line)',
            animation: `bbbSlideUp .4s ${Math.min(i, 6) * 0.04}s both`,
          }}
        >
          <div style={{ width: 34, height: 34, flex: 'none' }}>
            <img className="bbb-pixel" src={avatarUrl(r.cfg)} alt="" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim-2)' }}>
              {label[r.status] || 'spielt'}
              {r.title ? ` · ${r.title}` : ''}
            </div>
          </div>
          {!!r.level && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>+{r.level}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim-2)' }}>{r.levelLabel}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Eigene Aufgaben, die noch auf einen Haken warten. */
function PendingClaims({ state }) {
  const claims = state.myClaims || [];
  if (!claims.length) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>Wartet auf Abnahme</SectionLabel>
      {claims.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 15px',
            marginBottom: 8,
            borderRadius: 15,
            background: 'rgba(22,23,34,.75)',
            boxShadow: '0 0 0 1px var(--line-2)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim-2)', marginTop: 2 }}>
              {c.levelLabel ? `${c.levelLabel} · ` : ''}
              {c.observers.join(' & ')}
              {c.total > 1 ? ` · ${c.confirmed}/${c.total} bestätigt` : ''}
            </div>
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--gold)',
              padding: '5px 11px',
              borderRadius: 999,
              background: 'rgba(217,192,143,.12)',
              boxShadow: '0 0 0 1px var(--line-gold)',
            }}
          >
            +{c.points}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Was du bisher geschafft hast, nach Stufen aufgeschlüsselt. */
function Balance({ me }) {
  const st = me?.stats;
  if (!st) return null;
  const rows = [
    { label: 'Stufe 1', value: st.done[1], color: 'var(--mint)' },
    { label: 'Stufe 2', value: st.done[5], color: 'var(--rose)' },
    { label: 'Stufe 3', value: st.done[10], color: 'var(--accent-light)' },
    { label: 'Aufträge', value: st.wildcards, color: 'var(--gold)' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>Deine Bilanz</SectionLabel>
      <div className="bbb-card" style={{ padding: '16px 16px 12px' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
            <div style={{ width: 74, fontSize: 13.5, color: 'var(--text-muted)' }}>{r.label}</div>
            {/* Der Balken zeigt den Anteil an der stärksten Stufe */}
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: 'rgba(15,16,26,.6)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(r.value / max) * 100}%`,
                  height: '100%',
                  background: r.color,
                  opacity: r.value ? 0.85 : 0,
                  transition: 'width .4s ease',
                }}
              />
            </div>
            <div
              style={{
                width: 22,
                textAlign: 'right',
                fontSize: 15,
                fontWeight: 700,
                color: r.value ? r.color : 'var(--text-faint)',
              }}
            >
              {r.value}
            </div>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            gap: 16,
            paddingTop: 10,
            borderTop: '1px solid var(--line)',
            fontSize: 12.5,
            color: 'var(--text-dim-2)',
          }}
        >
          <span>{st.total} geschafft</span>
          <span>{st.rerolls} Rerolls</span>
          {st.rejected > 0 && <span style={{ color: 'var(--rose)' }}>{st.rejected} abgelehnt</span>}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        color: 'var(--text-dim-2)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s} s`;
}
