import { Header, SCREEN_PAD } from './TaskTab.jsx';

/** Chronologischer Live-Feed. Jedes Event mit Farbe nach Art. */

const BG = {
  good: 'rgba(143,201,180,.16)',
  bad: 'rgba(201,143,174,.16)',
  gold: 'rgba(217,192,143,.18)',
  neutral: 'rgba(60,63,82,.5)',
};

const FG = {
  good: 'var(--mint)',
  bad: 'var(--rose)',
  gold: 'var(--gold)',
  neutral: 'var(--text-dim-2)',
};

export function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - Date.parse(ts));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min === 1) return 'vor 1 Min';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  return h === 1 ? 'vor 1 Std' : `vor ${h} Std`;
}

export default function FeedTab({ state }) {
  const feed = state.feed || [];
  const gains = feed.filter((f) => f.delta > 0).reduce((a, f) => a + f.delta, 0);
  const losses = feed.filter((f) => f.delta < 0).reduce((a, f) => a + f.delta, 0);

  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header kicker="Alles was passiert" title="Feed" />

      <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
        <Pill label="Ereignisse" value={feed.length} />
        <Pill label="Verteilt" value={`+${gains}`} color="var(--mint)" />
        <Pill label="Verloren" value={losses || 0} color="var(--rose)" />
      </div>

      {feed.map((f, i) => (
        <div
          key={f.id}
          style={{
            display: 'flex',
            gap: 13,
            padding: '13px 14px',
            marginBottom: 9,
            borderRadius: 15,
            background: 'rgba(22,23,34,.72)',
            boxShadow: '0 0 0 1px var(--line)',
            animation: `bbbSlideUp .4s ${Math.min(i, 8) * 0.03}s both`,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              flex: 'none',
              background: BG[f.kind] || BG.neutral,
            }}
          >
            {f.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bbb-prose" style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--text-soft)' }}>
              {f.text}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{relativeTime(f.ts)}</div>
          </div>
          {!!f.delta && (
            <div
              style={{ fontSize: 16, fontWeight: 700, color: FG[f.kind] || FG.neutral, alignSelf: 'center' }}
            >
              {f.delta > 0 ? `+${f.delta}` : f.delta}
            </div>
          )}
        </div>
      ))}

      {!feed.length && <Empty text="Noch ist nichts passiert. Zieh die erste Karte." />}
      {feed.length > 0 && (
        <InfoBox
          title="Im Feed steht alles"
          tone="accent"
          lines={[
            'Käufe, Wetten und abgelehnte Sonderaufträge inklusive.',
            'Anonyme Sabotage gibt es hier nicht.',
          ]}
        />
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}

export function Pill({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: 14,
        background: 'rgba(20,21,31,.7)',
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
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  );
}

/** Hinweiskasten, der als Liste umbricht statt als Textblock. */
export function InfoBox({ title, lines, tone = 'gold' }) {
  const c =
    tone === 'gold'
      ? { bg: 'rgba(217,192,143,.08)', line: '#4a422c', head: 'var(--gold)', text: '#d3c19a' }
      : { bg: 'rgba(145,132,217,.08)', line: '#3b3560', head: 'var(--accent-light)', text: '#b7b0d8' };
  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 15,
        background: c.bg,
        boxShadow: `0 0 0 1px ${c.line}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: c.head,
          marginBottom: 9,
        }}
      >
        {title}
      </div>
      {lines.map((l) => (
        <div
          key={l}
          style={{ display: 'flex', gap: 9, fontSize: 13, color: c.text, lineHeight: 1.5, marginBottom: 4 }}
        >
          <span style={{ color: c.head }}>·</span>
          <span className="bbb-prose">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ text, children }) {
  return (
    <div
      style={{
        padding: '34px 22px',
        textAlign: 'center',
        borderRadius: 20,
        background: 'rgba(22,23,34,.7)',
        boxShadow: '0 0 0 1px var(--line)',
        fontSize: 15,
        color: 'var(--text-dim-2)',
        lineHeight: 1.5,
      }}
    >
      {children}
      {text}
    </div>
  );
}
