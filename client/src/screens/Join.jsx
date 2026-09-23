import { useState } from 'react';
import { randomCfg } from '../lib/sprites.js';
import PixelLogo from '../components/PixelLogo.jsx';
import PartyBackground from '../components/PartyBackground.jsx';
import { AXES, AvatarStage, AxisOptions, AxisTabs, useCatFrame } from '../components/AvatarPicker.jsx';

/**
 * Join auf genau einem Bildschirm: Vorschau, Namensfeld und Optionen stehen
 * gleichzeitig da. Nur der Optionenblock wechselt an Ort und Stelle durch die
 * Achsen, damit nichts gescrollt werden muss.
 */

export default function Join({ onJoin }) {
  const [axis, setAxis] = useState(0);
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState({ skin: 0, hair: 0, style: 0, acc: 0, outfit: 0, fur: 0, pattern: 0 });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const frame = useCatFrame();

  const current = AXES[axis];
  const isLast = axis === AXES.length - 1;

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return setError('Ohne Namen geht es nicht.');
    if (clean.length > 20) return setError('Höchstens 20 Zeichen.');
    setBusy(true);
    setError(null);
    const res = await onJoin(clean, cfg);
    setBusy(false);
    if (res?.error) setError(res.error);
    return undefined;
  };

  return (
    <div
      style={{
        position: 'relative',
        height: '100dvh',
        background: 'var(--ground)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PartyBackground intensity={1.15} />

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding:
            'max(20px, calc(env(safe-area-inset-top) + 6px)) 16px calc(16px + env(safe-area-inset-bottom))',
          gap: 12,
        }}
      >
        <div style={{ flex: 'none', textAlign: 'center' }}>
          <PixelLogo size={0.46} sparks={false} />
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
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            style={{ fontSize: 18, padding: '14px 16px', borderRadius: 14, textAlign: 'center' }}
          />
          {error && (
            <div
              role="alert"
              style={{ marginTop: 7, fontSize: 13, color: 'var(--rose)', textAlign: 'center' }}
            >
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{current.title}</div>
            <AxisTabs axis={axis} onGo={setAxis} />
          </div>

          {/* Der Schlüssel sorgt dafür, dass die neue Achse eingeblendet wird. */}
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
            {isLast ? 'Nochmal von vorn' : 'Weiter'}
          </button>
          <button
            className="bbb-btn bbb-sheen"
            onClick={submit}
            disabled={busy}
            style={{
              flex: 1.1,
              padding: 16,
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 15,
              background: 'linear-gradient(100deg,rgba(145,132,217,.30),rgba(201,143,174,.28))',
              border: '1px solid var(--accent)',
              animation: 'bbbGlowRing 2.6s infinite',
            }}
          >
            {busy ? '…' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
