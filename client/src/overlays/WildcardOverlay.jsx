import { useEffect, useRef, useState } from 'react';
import { partyCatUrl } from '../lib/sprites.js';

/**
 * Der Sonderauftrag: der einzige erlaubte Vollbild-Takeover.
 * Blind annehmen (Variante B aus dem Plan), ablehnen oder wegklappen und
 * später im Aufgaben-Tab annehmen, solange die Zeit läuft.
 */

export default function WildcardOverlay({ wildcard, onAccept, onDecline, onLater }) {
  const [left, setLeft] = useState(() => remaining(wildcard.expiresAt));
  const [frame, setFrame] = useState(0);
  const buzzed = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setLeft(remaining(wildcard.expiresAt)), 500);
    const anim = setInterval(() => setFrame((f) => (f + 1) % 4), 130);
    return () => {
      clearInterval(id);
      clearInterval(anim);
    };
  }, [wildcard.expiresAt]);

  // Vibration ist der einzige Kanal, der ohne HTTPS funktioniert (Android).
  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    try {
      navigator.vibrate?.([120, 80, 120, 80, 240]);
    } catch {
      /* iOS kann das nicht, macht nichts */
    }
  }, []);

  const urgent = left < 60;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 85,
        background: 'radial-gradient(90% 60% at 50% 26%,#452a4c,#140e1c 72%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '26px 22px calc(26px + env(safe-area-inset-bottom))',
        textAlign: 'center',
        animation: 'bbbPop .35s both',
      }}
    >
      <div style={{ width: 128, height: 112, marginBottom: 6 }}>
        <img className="bbb-pixel" src={partyCatUrl(9, frame, 1)} alt="" />
      </div>

      <div style={{ fontSize: 11, letterSpacing: '.42em', textTransform: 'uppercase', color: 'var(--rose)' }}>
        Sonderauftrag
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: '-.04em',
          lineHeight: 1.04,
          margin: '10px 0 4px',
          animation: 'bbbGlow 2.4s ease-in-out infinite',
        }}
      >
        Du bist dran.
      </div>
      <div
        className="bbb-prose"
        style={{ fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.5, margin: '10px 0 4px', maxWidth: 290 }}
      >
        Eine harte Aufgabe für <b style={{ color: 'var(--gold)' }}>{wildcard.points} Punkte</b>. Sichtbar erst nach
        deinem Ja.
      </div>

      <div
        style={{
          margin: '16px 0 20px',
          padding: '9px 18px',
          borderRadius: 999,
          background: urgent ? 'rgba(201,143,174,.20)' : 'rgba(20,21,31,.7)',
          boxShadow: `0 0 0 1px ${urgent ? 'var(--rose)' : 'var(--line-3)'}`,
          fontSize: 15,
          fontWeight: 600,
          color: urgent ? 'var(--rose-light)' : 'var(--text-muted)',
          animation: urgent ? 'bbbGlowRing 1.6s infinite' : 'none',
        }}
      >
        ⏳ verfällt in {clock(left)}
      </div>

      <button
        className="bbb-btn bbb-sheen"
        onClick={onAccept}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: 19,
          borderRadius: 16,
          border: '1px solid var(--rose)',
          background: 'linear-gradient(100deg,rgba(201,143,174,.32),rgba(145,132,217,.26))',
          color: '#fff',
          fontSize: 19,
          fontWeight: 700,
          animation: 'bbbGlowRing 1.8s infinite',
        }}
      >
        Blind annehmen
      </button>

      <div style={{ display: 'flex', gap: 9, width: '100%', maxWidth: 320, marginTop: 11 }}>
        <button
          className="bbb-btn"
          onClick={onLater}
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 14,
            border: '1px solid var(--line-accent)',
            background: 'rgba(145,132,217,.10)',
            color: 'var(--accent-lighter)',
            fontSize: 14.5,
          }}
        >
          Später
        </button>
        <button
          className="bbb-btn"
          onClick={onDecline}
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 14,
            border: '1px solid #4a4a58',
            background: 'transparent',
            color: 'var(--text-dim)',
            fontSize: 14.5,
          }}
        >
          Ablehnen
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-dim-2)', marginTop: 14, maxWidth: 300, lineHeight: 1.45 }}>
        „Später" legt den Auftrag in den Aufgaben-Tab. Ablehnen kostet nichts, steht aber im Feed.
      </div>
    </div>
  );
}

const remaining = (iso) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));

const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
