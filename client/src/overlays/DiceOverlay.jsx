import { useEffect, useState } from 'react';

/**
 * Reroll-Overlay: der Würfel rollt 1400 ms, danach stehen Ergebnis und
 * Rechnung getrennt da, damit die Eskalation spürbar wird. Der Button
 * erscheint erst danach über `visibility`, damit das Layout nicht springt.
 */

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function DiceOverlay({ roll, onClose }) {
  const [rolling, setRolling] = useState(true);
  const [face, setFace] = useState(roll.dice);

  // Kein Zurücksetzen nötig: PlayerApp gibt der Einblendung pro Wurf einen
  // eigenen key, sie startet also ohnehin frisch.
  useEffect(() => {
    const shuffle = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 120);
    const done = setTimeout(() => {
      clearInterval(shuffle);
      setFace(roll.dice);
      setRolling(false);
    }, 1400);
    return () => {
      clearInterval(shuffle);
      clearTimeout(done);
    };
  }, [roll.dice, roll.factor]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'rgba(10,11,18,.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '.22em',
          textTransform: 'uppercase',
          color: 'var(--rose)',
        }}
      >
        Reroll
      </div>

      <div
        style={{
          width: 104,
          height: 104,
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 52,
          fontWeight: 600,
          background: 'linear-gradient(155deg,#2b2741,#1a1b27)',
          boxShadow: '0 0 0 1px #796cbf,0 18px 44px rgba(0,0,0,.6)',
          animation: rolling ? 'bbbDice .35s linear infinite' : 'none',
        }}
      >
        {FACES[face]}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: '-.02em',
          color: 'var(--rose)',
          minHeight: 32,
        }}
      >
        {rolling ? ' ' : `−${roll.total}`}
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: 'var(--text-dim)',
          textAlign: 'center',
          maxWidth: 250,
          lineHeight: 1.5,
        }}
      >
        {rolling
          ? 'Rollt …'
          : `Würfel ${roll.dice} × Faktor ${roll.factor}. Der nächste Reroll kostet ×${roll.nextFactor}.`}
      </div>

      <button
        className="bbb-btn"
        onClick={onClose}
        style={{
          marginTop: 6,
          padding: '13px 28px',
          borderRadius: 13,
          border: '1px solid var(--accent)',
          background: 'transparent',
          fontSize: 15,
          visibility: rolling ? 'hidden' : 'visible',
        }}
      >
        Neue Karte
      </button>
    </div>
  );
}
