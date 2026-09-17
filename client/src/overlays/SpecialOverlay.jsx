import { useEffect, useRef } from 'react';

/**
 * Special Card: eine von zwanzig Karten. Goldkante, Goldglühen und
 * 70 Pixel-Konfetti auf einem eigenen Canvas darüber.
 */

const COLORS = ['#c98fae', '#9184d9', '#d9c08f', '#8fc9b4', '#e4e7f5'];

export default function SpecialOverlay({ special, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let parts = null;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== w) {
        canvas.width = w;
        canvas.height = h;
        parts = Array.from({ length: 70 }, () => ({
          x: Math.random() * w,
          y: -Math.random() * h,
          v: 0.6 + Math.random() * 1.6,
          s: 3 + Math.random() * 3,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));
      }
      const x = canvas.getContext('2d');
      x.clearRect(0, 0, w, h);
      for (const p of parts || []) {
        p.y += slow ? p.v * 0.3 : p.v;
        if (p.y > h) p.y = -8;
        x.fillStyle = p.c;
        x.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: 'rgba(8,7,14,.93)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 26,
        textAlign: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          fontSize: 10,
          letterSpacing: '.4em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
        }}
      >
        1 von 20 Karten
      </div>

      <div
        style={{
          position: 'relative',
          width: 250,
          maxWidth: '100%',
          padding: '26px 20px',
          marginTop: 14,
          borderRadius: 22,
          background: 'linear-gradient(150deg,#3a2f52,#241d33 60%,#3d2f3a)',
          boxShadow: 'var(--sh-gold)',
          animation: 'bbbSpinIn .6s both',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 10,
          }}
        >
          Special Card
        </div>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{special.icon}</div>
        <div style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.15 }}>{special.name}</div>
        <div
          className="bbb-prose"
          style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.55, marginTop: 10 }}
        >
          {special.description}
        </div>
      </div>

      <button
        className="bbb-btn"
        onClick={onClose}
        style={{
          position: 'relative',
          marginTop: 22,
          padding: '15px 34px',
          borderRadius: 14,
          border: '1px solid var(--gold)',
          background: 'rgba(217,192,143,.10)',
          color: '#f3e9d3',
          fontSize: 16,
        }}
      >
        In meine Hand
      </button>
      <div style={{ position: 'relative', marginTop: 10, fontSize: 11.5, color: 'var(--text-dim-2)' }}>
        Du spielst sie später im Tab „Aufgabe" aus.
      </div>
    </div>
  );
}
