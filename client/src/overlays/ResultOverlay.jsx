import { avatarUrl } from '../lib/sprites.js';

/**
 * Auswertung: Podium für die Top 3 mit ihren Preisen, darunter die Verlierer,
 * gruppiert nach Perzentil-Stufe, jede Stufe mit ihrer Strafe. Die Aufteilung
 * wählt der Server nach Gruppengröße.
 */

const PODIUM = [
  { height: 96, color: 'var(--gold)', tint: 'rgba(217,192,143,.16)' },
  { height: 74, color: 'var(--accent-lighter)', tint: 'rgba(145,132,217,.16)' },
  { height: 58, color: 'var(--rose)', tint: 'rgba(201,143,174,.16)' },
];

const BUCKET_TINT = [
  'rgba(143,201,180,.10)',
  'rgba(145,132,217,.10)',
  'rgba(201,143,174,.10)',
  'rgba(201,143,174,.18)',
];
const BUCKET_LINE = ['var(--mint)', 'var(--accent-lighter)', 'var(--rose)', 'var(--rose)'];

export default function ResultOverlay({ result, meId, onClose }) {
  const podium = result.podium || [];
  const losers = result.losers || [];
  const order = [1, 0, 2].filter((i) => podium[i]);

  // Verlierer nach Stufe bündeln, damit jede Strafe genau einmal dasteht
  const groups = [];
  for (const p of losers) {
    const last = groups[groups.length - 1];
    if (last && last.bucket === p.bucket) last.players.push(p);
    else groups.push({ bucket: p.bucket, label: p.bucketLabel, punishment: p.punishment, players: [p] });
  }

  return (
    <div
      className="bbb-scroll"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 95,
        background: 'radial-gradient(90% 60% at 50% 12%,#2b2741,#100f18 70%)',
        padding:
          'max(46px, calc(env(safe-area-inset-top) + 14px)) 20px calc(28px + env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--rose)' }}>
        Zeit ist um
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: '-.04em',
          marginTop: 6,
          animation: 'bbbGlow 3.5s ease-in-out infinite',
        }}
      >
        Das Ergebnis
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 10,
          margin: '30px 0 8px',
        }}
      >
        {order.map((idx) => {
          const p = podium[idx];
          const style = PODIUM[idx];
          return (
            <div key={p.id} style={{ flex: 1, maxWidth: 108 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  margin: '0 auto 8px',
                  animation: 'bbbFloat 3.4s ease-in-out infinite',
                }}
              >
                <img className="bbb-pixel" src={avatarUrl(p.cfg)} alt="" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                {p.name}
                {p.id === meId ? ' (du)' : ''}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: style.color, marginBottom: 6 }}>
                {p.score}
              </div>
              <div
                style={{
                  height: style.height,
                  borderRadius: '12px 12px 0 0',
                  background: style.tint,
                  boxShadow: `0 0 0 1px ${style.color}`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: 10,
                  fontSize: 22,
                  fontWeight: 700,
                  color: style.color,
                }}
              >
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      {podium.some((p) => p.prize) && (
        <>
          <Label>Die Preise</Label>
          {podium.map(
            (p, i) =>
              p.prize && (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '13px 15px',
                    marginBottom: 8,
                    borderRadius: 15,
                    textAlign: 'left',
                    background: PODIUM[i].tint,
                    boxShadow: `0 0 0 1px ${PODIUM[i].color}`,
                  }}
                >
                  <div style={{ fontSize: 22, flex: 'none', lineHeight: 1.1 }}>{p.prize.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: PODIUM[i].color }}>
                      {p.prize.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim-2)', margin: '1px 0 6px' }}>
                      Platz {i + 1}: {p.name}
                    </div>
                    <div
                      className="bbb-prose"
                      style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-soft)' }}
                    >
                      {p.prize.text}
                    </div>
                  </div>
                </div>
              ),
          )}
        </>
      )}

      {groups.length > 0 && (
        <>
          <Label>Und der Rest</Label>
          {groups.map((g) => (
            <div
              key={g.bucket}
              style={{
                marginBottom: 12,
                borderRadius: 16,
                textAlign: 'left',
                overflow: 'hidden',
                background: BUCKET_TINT[g.bucket] || 'var(--surface)',
                boxShadow: `0 0 0 1px ${BUCKET_LINE[g.bucket] || 'var(--line)'}`,
              }}
            >
              <div style={{ padding: '13px 15px 11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {g.punishment && <span style={{ fontSize: 18 }}>{g.punishment.icon}</span>}
                  <span style={{ fontSize: 15.5, fontWeight: 600, color: BUCKET_LINE[g.bucket] }}>
                    {g.label}
                  </span>
                  {g.punishment && <Pips level={g.punishment.severity} color={BUCKET_LINE[g.bucket]} />}
                </div>
                {g.punishment && (
                  <>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 9 }}>{g.punishment.title}</div>
                    <div
                      className="bbb-prose"
                      style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-soft)', marginTop: 3 }}
                    >
                      {g.punishment.text}
                    </div>
                  </>
                )}
              </div>

              <div style={{ padding: '0 9px 9px' }}>
                {g.players.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '9px 10px',
                      marginTop: 5,
                      borderRadius: 12,
                      background: 'rgba(15,16,26,.45)',
                      boxShadow: p.id === meId ? '0 0 0 1px var(--line-accent-2)' : 'none',
                    }}
                  >
                    <div style={{ width: 20, fontSize: 13, fontWeight: 600, color: 'var(--text-dim-2)' }}>
                      {losers.indexOf(p) + podium.length + 1}
                    </div>
                    <div style={{ width: 30, height: 30, flex: 'none' }}>
                      <img className="bbb-pixel" src={avatarUrl(p.cfg)} alt="" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500 }}>
                      {p.name}
                      {p.id === meId ? ' (du)' : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: p.score < 0 ? 'var(--rose)' : 'var(--text)',
                      }}
                    >
                      {p.score}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ fontSize: 44, margin: '22px 0 6px', animation: 'bbbFloat 3s ease-in-out infinite' }}>
        🎀
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        Danke fürs Mitspielen. Die Strafen holt sich der Host persönlich.
      </div>

      <button
        className="bbb-btn"
        onClick={onClose}
        style={{
          width: '100%',
          padding: 15,
          borderRadius: 14,
          border: '1px solid var(--accent)',
          background: 'transparent',
          fontSize: 15,
        }}
      >
        Tabelle in Ruhe ansehen
      </button>
    </div>
  );
}

/** Wie schlimm die Strafe ist, auf einen Blick. */
function Pips({ level, color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto' }}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          style={{
            width: 6,
            height: 6,
            borderRadius: 2,
            background: n <= level ? color : 'transparent',
            boxShadow: n <= level ? 'none' : `inset 0 0 0 1px ${color}`,
            opacity: n <= level ? 1 : 0.4,
          }}
        />
      ))}
    </span>
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
        margin: '26px 0 10px',
        textAlign: 'left',
      }}
    >
      {children}
    </div>
  );
}
