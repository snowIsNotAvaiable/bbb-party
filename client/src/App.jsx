import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, setToken } from './lib/net.js';
import Join from './screens/Join.jsx';
import Rules from './screens/Rules.jsx';
import PlayerApp from './screens/PlayerApp.jsx';
import Admin from './host/Admin.jsx';

export default function App() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/admin') return <Admin />;
  return <Player />;
}

function Player() {
  const { state, status, send, action, tokenInvalid, setTokenInvalid } = useConnection({ role: 'player' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // Der Server meldet einmal, dass der gespeicherte Token zu niemandem mehr
  // gehört. Nur diesen Übergang anzeigen, nicht jeden Rendervorgang danach.
  const warTokenUngueltig = useRef(false);
  useEffect(() => {
    if (tokenInvalid && !warTokenUngueltig.current) {
      warTokenUngueltig.current = true;
      setToast('Dein Platz wurde zurückgesetzt. Trag dich einfach neu ein.');
      setTokenInvalid(false);
    } else if (!tokenInvalid) {
      warTokenUngueltig.current = false;
    }
  }, [tokenInvalid, setTokenInvalid]);

  /** Jede Aktion geht zum Server; Fehler landen als Toast, nie als Sackgasse. */
  const run = useCallback(
    async (name, payload = {}) => {
      const res = await action(name, payload);
      if (res?.error) setToast(res.error);
      return res || {};
    },
    [action],
  );

  const onJoin = useCallback(
    async (name, cfg) => {
      const res = await send({ type: 'join', name, cfg });
      if (res?.error) {
        setToast(res.error);
        return res;
      }
      if (res?.token) setToken(res.token);
      return res;
    },
    [send],
  );

  return (
    <>
      {status !== 'online' && (
        <div className="bbb-offline">
          {status === 'connecting' ? 'Verbindung wird aufgebaut …' : 'Verbindung wird wiederhergestellt …'}
        </div>
      )}

      {!state ? (
        <Splash />
      ) : !state.me ? (
        <Join onJoin={onJoin} />
      ) : !state.me.seenRules ? (
        <Rules onDone={() => run('seenRules')} />
      ) : (
        <PlayerApp state={state} run={run} />
      )}

      {toast && <Toast text={toast} onClose={() => setToast(null)} />}
    </>
  );
}

function Splash() {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: 'radial-gradient(120% 80% at 50% -10%,#221f36 0%,#14151f 45%,#0d0e16 100%)',
      }}
    >
      <div className="bbb-kicker">Willkommen bei</div>
      <div
        style={{
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: '-.03em',
          animation: 'bbbGlow 4s ease-in-out infinite',
        }}
      >
        BBB
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim-2)' }}>
        Einen Moment, die Katze sucht die Verbindung …
      </div>
    </div>
  );
}

function Toast({ text, onClose }) {
  return (
    <button
      onClick={onClose}
      className="bbb-prose"
      style={{
        position: 'fixed',
        left: 14,
        right: 14,
        bottom: 'calc(86px + env(safe-area-inset-bottom))',
        zIndex: 300,
        padding: '13px 15px',
        borderRadius: 14,
        border: '1px solid var(--line-rose)',
        background: 'rgba(40,26,34,.96)',
        backdropFilter: 'blur(10px)',
        color: 'var(--rose-light)',
        fontSize: 13.5,
        lineHeight: 1.45,
        textAlign: 'left',
        cursor: 'pointer',
        animation: 'bbbPop .28s both',
        boxShadow: '0 14px 34px rgba(0,0,0,.5)',
      }}
    >
      {text}
    </button>
  );
}
