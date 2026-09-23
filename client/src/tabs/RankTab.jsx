import { avatarUrl } from '../lib/sprites.js';
import { Header, SCREEN_PAD } from './TaskTab.jsx';
import { Empty, InfoBox } from './FeedTab.jsx';

/** Live-Rangliste mit Podest oben. Die Punktzahl ist das, was zählt, ohne Sternchen. */

const ROLE = { birthday: 'Geburtstagskind', host: 'Host', guest: 'Gast' };
const MEDAL = ['#d9c08f', '#d2cefd', '#c98fae'];

export default function RankTab({ state }) {
  const ranked = state.ranking || [];
  const meId = state.me?.id;
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const order = [1, 0, 2].filter((i) => top[i]);

  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header kicker="Wer führt" title="Rangliste" />

      {top.length >= 2 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 22,
            padding: '10px 6px 0',
          }}
        >
          {order.map((idx) => {
            const p = top[idx];
            const heights = [104, 78, 62];
            return (
              <div
                key={p.id}
                style={{ flex: 1, textAlign: 'center', animation: `bbbSlideUp .5s ${idx * 0.08}s both` }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    margin: '0 auto 7px',
                    animation: `bbbFloat ${3 + idx * 0.4}s ease-in-out infinite`,
                  }}
                >
                  <img className="bbb-pixel" src={avatarUrl(p.cfg)} alt="" />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 1 }}>
                  {p.name}
                  {p.id === meId ? ' (du)' : ''}
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, color: MEDAL[idx], marginBottom: 7 }}>
                  {p.score}
                </div>
                <div
                  style={{
                    height: heights[idx],
                    borderRadius: '14px 14px 0 0',
                    background: `linear-gradient(180deg, ${MEDAL[idx]}55, ${MEDAL[idx]}12)`,
                    boxShadow: `inset 0 0 0 1px ${MEDAL[idx]}, 0 8px 24px rgba(0,0,0,.35)`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: 9,
                    fontSize: 24,
                    fontWeight: 800,
                    color: MEDAL[idx],
                  }}
                >
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(top.length < 2 ? ranked : rest).map((p, i) => {
        const rank = (top.length < 2 ? 0 : 3) + i + 1;
        const mine = p.id === meId;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '13px 15px',
              marginBottom: 9,
              borderRadius: 17,
              background: mine
                ? 'linear-gradient(100deg,rgba(145,132,217,.22),rgba(201,143,174,.14))'
                : 'rgba(22,23,34,.72)',
              boxShadow: mine ? '0 0 0 1px var(--line-accent-2)' : '0 0 0 1px var(--line)',
              animation: `bbbSlideUp .4s ${Math.min(i, 8) * 0.04}s both`,
              opacity: p.active ? 1 : 0.5,
            }}
          >
            <div style={{ width: 24, fontSize: 17, fontWeight: 700, color: 'var(--text-dim-2)' }}>{rank}</div>
            <div style={{ width: 44, height: 44, flex: 'none' }}>
              <img className="bbb-pixel" src={avatarUrl(p.cfg)} alt="" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
                {mine ? ' (du)' : ''}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim-2)' }}>{ROLE[p.role] || 'Gast'}</div>
            </div>
            <div
              style={{ fontSize: 23, fontWeight: 700, color: p.score < 0 ? 'var(--rose)' : 'var(--text)' }}
            >
              {p.score}
            </div>
          </div>
        );
      })}

      {ranked.length < 2 && <Empty text="Noch ist keiner da, gegen den du gewinnen könntest." />}

      <InfoBox
        title="So wird gewertet"
        lines={[
          'Punkte kommen erst nach der Abnahme aufs Konto.',
          'Wetteinsätze sind sofort weg, bis die Wette aufgelöst ist.',
          'Bei Gleichstand gewinnt, wer früher dort war.',
        ]}
      />
      <div style={{ height: 16 }} />
    </div>
  );
}
