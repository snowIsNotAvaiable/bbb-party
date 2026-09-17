import { useEffect, useState } from 'react';
import {
  avatarUrl,
  catUrl,
  SKIN,
  HAIR,
  OUTFIT,
  FUR,
  STYLES,
  ACCS,
  PATTERNS,
  CAT_FRAME,
} from '../lib/sprites.js';

/**
 * Die Bausteine des Avatar-Editors. Join und das nachträgliche Bearbeiten
 * auf dem Planeten teilen sich dieselben Teile, damit die Auswahl an beiden
 * Stellen identisch aussieht und sich gleich anfühlt.
 */

export const AXES = [
  { key: 'skin', title: 'Hautton', focus: 'avatar', colors: SKIN },
  { key: 'hair', title: 'Haarfarbe', focus: 'avatar', colors: HAIR },
  { key: 'style', title: 'Frisur', focus: 'avatar', chips: STYLES },
  { key: 'acc', title: 'Accessoire', focus: 'avatar', chips: ACCS },
  { key: 'outfit', title: 'Outfit', focus: 'avatar', colors: OUTFIT },
  { key: 'fur', title: 'Fell der Katze', focus: 'cat', colors: FUR.map((f) => f[0]) },
  { key: 'pattern', title: 'Muster der Katze', focus: 'cat', chips: PATTERNS },
];

/** Zwei Frames pro Sekunde reichen für den Laufzyklus in der Vorschau. */
export function useCatFrame(ms = 240) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), ms);
    return () => clearInterval(id);
  }, [ms]);
  return frame;
}

export function AvatarStage({ cfg, frame, focus, onShuffle, minHeight = 104, maxHeight = 320 }) {
  const catFocus = focus === 'cat';
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight,
        maxHeight,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 12,
        padding: '12px 12px 22px',
        borderRadius: 22,
        background: 'linear-gradient(160deg,rgba(47,41,74,.92),rgba(27,28,40,.92))',
        boxShadow: '0 0 0 1px #4a4173, 0 14px 34px rgba(0,0,0,.5)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(70% 42% at 50% 100%,rgba(201,143,174,.38),transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Was gerade bearbeitet wird, steht größer da. Die Größe hängt an der
          Bühne, damit die Vorschau auf jedem Handy den Platz ausfüllt. */}
      <div
        style={{
          position: 'relative',
          flex: catFocus ? 0.8 : 1.15,
          aspectRatio: '1',
          maxHeight: '80%',
          opacity: catFocus ? 0.68 : 1,
          transition: 'flex .3s ease, opacity .3s ease',
          animation: 'bbbFloat 3.4s ease-in-out infinite',
        }}
      >
        <img className="bbb-pixel" src={avatarUrl(cfg)} alt="Dein Avatar" />
      </div>

      <div
        style={{
          position: 'relative',
          flex: catFocus ? 1.3 : 0.9,
          aspectRatio: '12 / 10',
          maxHeight: '70%',
          opacity: catFocus ? 1 : 0.75,
          transition: 'flex .3s ease, opacity .3s ease',
          animation: 'bbbBob 2.4s ease-in-out infinite',
        }}
      >
        <img
          className="bbb-pixel"
          src={catUrl(cfg.fur, frame % 2 ? CAT_FRAME.WALK_B : CAT_FRAME.WALK_A, cfg.pattern)}
          alt=""
        />
      </div>

      {onShuffle && (
        <button
          className="bbb-btn"
          onClick={onShuffle}
          aria-label="Alles würfeln"
          style={{
            position: 'absolute',
            right: 9,
            top: 9,
            padding: '7px 11px',
            borderRadius: 999,
            fontSize: 14,
            border: '1px solid var(--line-accent)',
            background: 'rgba(145,132,217,.18)',
            color: 'var(--accent-lighter)',
          }}
        >
          🎲
        </button>
      )}
    </div>
  );
}

export function AxisTabs({ axis, onGo }) {
  return (
    <div style={{ display: 'flex', marginRight: -8 }}>
      {AXES.map((a, i) => (
        <button
          key={a.key}
          onClick={() => onGo(i)}
          aria-label={a.title}
          aria-current={i === axis ? 'step' : undefined}
          style={{
            // Der Punkt ist klein, die Trefferfläche darf es nicht sein:
            // rundherum durchsichtige Polsterung auf mindestens 32 Pixel.
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: i === axis ? 34 : 22,
            height: 34,
            border: 0,
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span
            style={{
              display: 'block',
              width: i === axis ? 20 : 7,
              height: 7,
              background: i === axis ? 'linear-gradient(90deg,#c98fae,#d9c08f)' : 'var(--line-3)',
              transition: 'width .3s cubic-bezier(.32,.72,.24,1), background .3s ease',
            }}
          />
        </button>
      ))}
    </div>
  );
}

export function AxisOptions({ axis, value, onPick }) {
  const isText = !!axis.chips;
  const list = axis.colors || axis.chips;
  return (
    <div
      style={{
        display: 'grid',
        // Farben in Viererreihen, Wörter in Dreierreihen: nie eine halbe Zeile
        gridTemplateColumns: `repeat(${isText ? 3 : 4}, 1fr)`,
        gap: 8,
      }}
    >
      {list.map((entry, idx) => {
        const active = value === idx;
        return (
          <button
            key={idx}
            type="button"
            className="bbb-pick"
            data-kind={isText ? 'text' : 'color'}
            title={isText ? entry : `${axis.title} ${idx + 1}`}
            aria-pressed={active}
            onClick={() => onPick(idx)}
            style={{
              height: isText ? 46 : 50,
              padding: isText ? '0 6px' : 0,
              fontSize: 14.5,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--text)' : 'var(--text-muted)',
              background: isText
                ? active
                  ? 'linear-gradient(160deg,rgba(160,146,236,.42),rgba(201,143,174,.30))'
                  : 'linear-gradient(160deg,#242534,#1a1b26)'
                : entry,
            }}
          >
            {isText ? entry : ''}
          </button>
        );
      })}
    </div>
  );
}
