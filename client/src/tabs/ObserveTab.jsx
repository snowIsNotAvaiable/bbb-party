import { useEffect, useState } from 'react';
import { avatarUrl, catUrl, CAT_FRAME } from '../lib/sprites.js';
import { Header, SCREEN_PAD } from './TaskTab.jsx';

/**
 * Beobachten: alle Aufgaben, die dieser Spieler abnehmen muss.
 * Immer eine Liste, nie ein Modal; die eigene Aufgabe darf nichts verdecken.
 */

const RUNNING_LABEL = {
  observer: 'hat gerade gezogen',
  chooseObserver: 'sucht sich einen Beobachter',
  level: 'wählt gerade die Stufe',
  reveal: 'macht gerade seine Aufgabe',
  waiting: 'wartet auf Abnahme',
};

export default function ObserveTab({ state, run }) {
  const [busy, setBusy] = useState(null);
  const [snooze, setSnooze] = useState(0);
  const list = state.observations || [];

  useEffect(() => {
    const id = setInterval(() => setSnooze((s) => (s + 1) % 2), 900);
    return () => clearInterval(id);
  }, []);

  const decide = async (id, confirmed) => {
    setBusy(id);
    await run(confirmed ? 'confirmClaim' : 'rejectClaim', { claimId: id });
    setBusy(null);
  };

  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header
        kicker="Deine Rolle"
        title="Beobachten"
        sub={
          list.length ? 'Erst dein Haken bringt die Punkte.' : 'Die App lost dich zu fremden Aufgaben dazu.'
        }
      />

      {list.map((o, i) => (
        <div
          key={o.id}
          className="bbb-card"
          style={{
            marginBottom: 13,
            padding: 17,
            animation: `bbbSlideUp .4s ${Math.min(i, 6) * 0.05}s both`,
          }}
        >
          <div style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 13 }}>
            <div
              style={{ width: 48, height: 48, flex: 'none', animation: 'bbbFloat 3.4s ease-in-out infinite' }}
            >
              <img className="bbb-pixel" src={avatarUrl(o.cfg)} alt="" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{o.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim-2)' }}>{o.meta}</div>
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--gold)',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(217,192,143,.12)',
                boxShadow: '0 0 0 1px var(--line-gold)',
              }}
            >
              +{o.points}
            </div>
          </div>

          <div
            className="bbb-prose"
            style={{
              fontSize: 15.5,
              lineHeight: 1.5,
              color: 'var(--text-soft)',
              marginBottom: 14,
              padding: '13px 15px',
              borderRadius: 14,
              background: 'rgba(15,16,26,.5)',
              boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          >
            {o.text}
          </div>

          {o.multi && (
            <div style={{ fontSize: 12, color: 'var(--line-accent-2)', marginBottom: 12 }}>
              Zwei Beobachter. Punkte gibt es erst, wenn ihr beide bestätigt.
            </div>
          )}

          <div style={{ display: 'flex', gap: 9 }}>
            <button
              className="bbb-btn"
              disabled={busy === o.id}
              onClick={() => decide(o.id, true)}
              style={{
                flex: 1.5,
                padding: 16,
                borderRadius: 14,
                border: '1px solid var(--mint)',
                background: 'rgba(143,201,180,.16)',
                color: '#dff0e9',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Hat es gemacht
            </button>
            <button
              className="bbb-btn"
              disabled={busy === o.id}
              onClick={() => decide(o.id, false)}
              style={{
                flex: 1,
                padding: 16,
                borderRadius: 14,
                border: '1px solid var(--text-faint)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 15,
              }}
            >
              Nein
            </button>
          </div>
        </div>
      ))}

      {!list.length && (
        <>
          <div className="bbb-card" style={{ padding: '30px 22px 26px', textAlign: 'center' }}>
            <div style={{ width: 118, height: 98, margin: '0 auto 12px' }}>
              <img
                className="bbb-pixel"
                src={catUrl(
                  state.me?.cfg?.fur ?? 0,
                  snooze ? CAT_FRAME.SLEEP : CAT_FRAME.SIT,
                  state.me?.cfg?.pattern ?? 0,
                )}
                alt=""
              />
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 5 }}>Gerade nichts abzunehmen</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim-2)', lineHeight: 1.5 }}>
              Sobald jemand dich zugelost bekommt, steht die Aufgabe hier.
            </div>
          </div>

          <Incoming state={state} />
          <Record stats={state.me?.stats} />
        </>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}

/* ── Bausteine ─────────────────────────────────────────────── */

/** Wer gerade an einer Karte sitzt: einer davon landet vielleicht bei dir. */
function Incoming({ state }) {
  const others = (state.running || []).filter((r) => r.playerId !== state.me?.id);
  if (!others.length) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <Label>Könnte gleich reinkommen</Label>
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
              {RUNNING_LABEL[r.status] || 'spielt'}
            </div>
          </div>
          {!!r.level && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>+{r.level}</div>}
        </div>
      ))}
    </div>
  );
}

/** Wie streng du bisher warst. */
function Record({ stats }) {
  if (!stats) return null;
  const total = stats.confirmedByMe + stats.rejectedByMe;
  return (
    <div style={{ marginTop: 22 }}>
      <Label>Als Beobachter</Label>
      <div className="bbb-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Tile label="Bestätigt" value={stats.confirmedByMe} color="var(--mint)" />
          <Tile label="Abgelehnt" value={stats.rejectedByMe} color="var(--rose)" />
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim-2)', marginTop: 12, lineHeight: 1.5 }}>
          {total === 0
            ? 'Noch keine Aufgabe abgenommen.'
            : stats.rejectedByMe === 0
              ? 'Bisher hast du alles durchgewinkt.'
              : `Du hast ${stats.rejectedByMe} von ${total} nicht anerkannt.`}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '11px 13px',
        borderRadius: 13,
        background: 'rgba(15,16,26,.5)',
        boxShadow: '0 0 0 1px var(--line)',
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: '.15em',
          textTransform: 'uppercase',
          color: 'var(--text-dim-2)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Label({ children }) {
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
