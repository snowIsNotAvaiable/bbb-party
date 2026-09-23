import { useEffect, useMemo, useRef, useState } from 'react';
import { avatarUrl } from '../lib/sprites.js';
import { createGlobe } from '../lib/globe.js';
import PixelLogo from '../components/PixelLogo.jsx';
import ProfileOverlay from '../overlays/ProfileOverlay.jsx';

/**
 * Der Party-Planet. Die Kugel lässt sich mit dem Finger drehen, ein Tipp auf
 * eine Figur öffnet das Mini-Profil. Darüber liegen Logo, Statuszahlen und
 * der Live-Ticker.
 */

const ROLE = { birthday: 'Geburtstagskind', host: 'Host', guest: 'Gast' };

export default function MainTab({ state, active, onTab, run }) {
  const canvasRef = useRef(null);
  const globeRef = useRef(null);
  const [tapped, setTapped] = useState(null);
  const [editing, setEditing] = useState(false);

  const people = useMemo(
    () =>
      (state.ranking || []).map((p) => ({
        id: p.id,
        name: p.name,
        cfg: p.cfg,
        score: p.score,
        role: p.role,
      })),
    [state.ranking],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const globe = createGlobe(canvas, {
      onTap: (person) => {
        setTapped(person);
        if (person) globe.follow(person.id);
        else globe.stopFollow();
      },
      // Sobald jemand selbst am Planeten dreht, endet das Verfolgen
      onFollowEnd: () => setTapped(null),
    });
    globeRef.current = globe;
    globe.setState({ slow: matchMedia('(prefers-reduced-motion: reduce)').matches });
    return () => {
      globe.destroy();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    globeRef.current?.setState({ people, meId: state.me?.id, leaderId: people[0]?.id });
  }, [people, state.me?.id]);

  useEffect(() => {
    if (active) globeRef.current?.resume();
    else globeRef.current?.pause();
  }, [active]);

  const burst = state.lastBurst?.n || 0;
  useEffect(() => {
    if (burst) globeRef.current?.celebrate(3);
  }, [burst]);

  const ticker = useMemo(() => buildTicker(state), [state]);

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: 'pixelated',
          touchAction: 'none',
          cursor: 'grab',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 'max(24px, calc(env(safe-area-inset-top) + 6px))',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <PixelLogo size={1.05} />
        <div
          style={{
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '.03em',
            marginTop: 14,
            animation: 'bbbGlow 4.5s ease-in-out infinite',
          }}
        >
          {state.partyTitle || "Buki's Birthday Bash"}
        </div>
      </div>

      {tapped && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 46,
            padding: 15,
            borderRadius: 20,
            background: 'rgba(23,24,35,.95)',
            backdropFilter: 'blur(12px)',
            boxShadow: 'var(--sh-overlay)',
            display: 'flex',
            gap: 13,
            alignItems: 'center',
            animation: 'bbbPop .28s both',
          }}
        >
          <div
            style={{ width: 56, height: 56, flex: 'none', animation: 'bbbFloat 3.2s ease-in-out infinite' }}
          >
            <img className="bbb-pixel" src={avatarUrl(tapped.cfg)} alt="" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{tapped.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {ROLE[tapped.role] || 'Gast'} · {tapped.score} Punkte
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
              Kamera folgt. Zieh am Planeten, um sie zu lösen.
            </div>
          </div>
          {tapped.id === state.me?.id && (
            <button
              className="bbb-btn"
              onClick={() => setEditing(true)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--line-accent)',
                background: 'rgba(145,132,217,.16)',
                color: 'var(--accent-lighter)',
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              Ändern
            </button>
          )}
          <button
            onClick={() => {
              setTapped(null);
              globeRef.current?.stopFollow();
            }}
            aria-label="Schließen"
            style={{
              border: 0,
              background: 'var(--line)',
              color: 'var(--text-muted)',
              width: 34,
              height: 34,
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {editing && state.me && (
        <ProfileOverlay
          me={state.me}
          onSave={(patch) => run('updateProfile', patch)}
          onClose={() => setEditing(false)}
        />
      )}

      <button
        onClick={() => onTab?.('feed')}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 34,
          overflow: 'hidden',
          background: 'rgba(15,16,26,.84)',
          backdropFilter: 'blur(6px)',
          borderTop: '1px solid var(--line)',
          borderLeft: 0,
          borderRight: 0,
          borderBottom: 0,
          display: 'flex',
          alignItems: 'center',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <div
          className="bbb-marquee"
          style={{
            display: 'flex',
            whiteSpace: 'nowrap',
            animation: 'bbbMarquee 26s linear infinite',
            fontSize: 12,
            letterSpacing: '.05em',
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ paddingLeft: 22, paddingRight: 44 }}>{ticker}</span>
          <span style={{ paddingLeft: 22, paddingRight: 44 }}>{ticker}</span>
        </div>
      </button>
    </div>
  );
}

function buildTicker(state) {
  const parts = [];
  const ranked = state.ranking || [];
  if (ranked[0]) parts.push(`👑 ${ranked[0].name} führt mit ${ranked[0].score}`);
  const last = ranked[ranked.length - 1];
  if (last && ranked.length > 1) parts.push(`🎲 ${last.name} steht bei ${last.score}`);
  const openBets = (state.bets || []).filter((b) => b.status === 'open').length;
  if (openBets) parts.push(`🖤 ${openBets} offene Wetten`);
  if (state.openClaims) parts.push(`👁 ${state.openClaims} warten auf Abnahme`);
  parts.push(`🎴 ${state.poolRemaining} Karten übrig`);
  if (state.wildcard) parts.push(`📣 Sonderauftrag bei ${state.wildcard.name}`);
  parts.push('🌍 Zieh am Planeten, er dreht sich mit');
  return `${parts.join(' · ')} ·`;
}
