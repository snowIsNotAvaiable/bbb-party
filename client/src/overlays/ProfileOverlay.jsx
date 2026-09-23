import { useState } from 'react';
import { randomCfg } from '../lib/sprites.js';
import { AXES, AvatarStage, AxisOptions, AxisTabs, useCatFrame } from '../components/AvatarPicker.jsx';

/**
 * Aussehen nachträglich ändern. Gleiche Auswahl wie beim Join, nur als
 * Overlay über dem Planeten. Gespeichert wird erst beim Übernehmen.
 */

export default function ProfileOverlay({ me, onSave, onClose }) {
  const [axis, setAxis] = useState(0);
  const [name, setName] = useState(me.name);
  const [cfg, setCfg] = useState({ ...me.cfg });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const frame = useCatFrame();

  const current = AXES[axis];

  const save = async () => {
    const clean = name.trim();
    if (!clean) return setError('Ohne Namen geht es nicht.');
    if (clean.length > 20) return setError('Höchstens 20 Zeichen.');
    setBusy(true);
    setError(null);
    const res = await onSave({ name: clean, cfg });
    setBusy(false);
    if (res?.error) return setError(res.error);
    onClose();
    return undefined;
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 95,
        background: 'rgba(10,11,18,.94)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 12,
        padding:
          'max(24px, calc(env(safe-area-inset-top) + 8px)) 16px calc(16px + env(safe-area-inset-bottom))',
        animation: 'bbbPop .3s both',
      }}
    >
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="bbb-kicker">Dein Auftritt</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', marginTop: 2 }}>
            Aussehen ändern
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Schließen"
          style={{
            border: 0,
            background: 'var(--line)',
            color: 'var(--text-muted)',
            width: 38,
            height: 38,
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      <AvatarStage cfg={cfg} frame={frame} focus={current.focus} onShuffle={() => setCfg(randomCfg())} />

      <div style={{ flex: 'none' }}>
        <input
          className="bbb-input"
          value={name}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Dein Name"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          style={{ fontSize: 18, padding: '14px 16px', borderRadius: 14, textAlign: 'center' }}
        />
        {error && (
          <div role="alert" style={{ marginTop: 7, fontSize: 13, color: 'var(--rose)', textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{current.title}</div>
          <AxisTabs axis={axis} onGo={setAxis} />
        </div>
        <div key={current.key} style={{ animation: 'bbbSlideUp .3s both' }}>
          <AxisOptions
            axis={current}
            value={cfg[current.key]}
            onPick={(i) => setCfg((c) => ({ ...c, [current.key]: i }))}
          />
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
        <button
          className="bbb-btn"
          onClick={() => setAxis((a) => (a - 1 + AXES.length) % AXES.length)}
          aria-label="Vorherige Auswahl"
          style={{
            padding: '16px 18px',
            fontSize: 17,
            borderRadius: 15,
            border: '1px solid var(--line-3)',
            background: 'rgba(28,29,41,.9)',
            color: 'var(--text-muted)',
          }}
        >
          ‹
        </button>
        <button
          className="bbb-btn"
          onClick={() => setAxis((a) => (a + 1) % AXES.length)}
          style={{
            flex: 1,
            padding: 16,
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 15,
            border: '1px solid var(--line-accent)',
            background: 'rgba(145,132,217,.14)',
            color: 'var(--accent-lighter)',
          }}
        >
          Weiter
        </button>
        <button
          className="bbb-btn bbb-sheen"
          onClick={save}
          disabled={busy}
          style={{
            flex: 1.1,
            padding: 16,
            fontSize: 17,
            fontWeight: 700,
            borderRadius: 15,
            background: 'linear-gradient(100deg,rgba(145,132,217,.30),rgba(201,143,174,.28))',
            border: '1px solid var(--accent)',
          }}
        >
          {busy ? '…' : 'Übernehmen'}
        </button>
      </div>
    </div>
  );
}
