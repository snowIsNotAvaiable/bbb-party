import { useEffect, useRef, useState } from 'react';
import PixelIcon from '../components/PixelIcon.jsx';
import PartyBackground from '../components/PartyBackground.jsx';
import MainTab from '../tabs/MainTab.jsx';
import TaskTab from '../tabs/TaskTab.jsx';
import ObserveTab from '../tabs/ObserveTab.jsx';
import MarketTab from '../tabs/MarketTab.jsx';
import RankTab from '../tabs/RankTab.jsx';
import FeedTab from '../tabs/FeedTab.jsx';
import DiceOverlay from '../overlays/DiceOverlay.jsx';
import WildcardOverlay from '../overlays/WildcardOverlay.jsx';
import SpecialOverlay from '../overlays/SpecialOverlay.jsx';
import ResultOverlay from '../overlays/ResultOverlay.jsx';

/**
 * Der App-Rahmen: sechs Tabs auf einer Schiene, die beim Wechsel gleitet.
 * Alle Tabs bleiben montiert, damit Scrollposition und Planet erhalten bleiben.
 */

const TABS = [
  { key: 'home', icon: 'home', label: 'Start' },
  { key: 'task', icon: 'cards', label: 'Aufgabe' },
  { key: 'observe', icon: 'eye', label: 'Beobachten' },
  { key: 'market', icon: 'bag', label: 'Markt' },
  { key: 'rank', icon: 'crown', label: 'Rang' },
  { key: 'feed', icon: 'chat', label: 'Feed' },
];

export default function PlayerApp({ state, run }) {
  const [tab, setTab] = useState('home');
  const [resultSeen, setResultSeen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const lastWild = useRef(null);

  const wildcard = state.wildcardForMe;
  const special = state.turn?.pendingSpecial;
  const roll = state.turn?.lastRoll;
  const index = TABS.findIndex((t) => t.key === tab);

  // Ein neuer Sonderauftrag kommt immer als Takeover, egal was vorher lief.
  useEffect(() => {
    const key = wildcard?.expiresAt || null;
    if (key !== lastWild.current) {
      lastWild.current = key;
      setMinimized(false);
    }
  }, [wildcard?.expiresAt]);

  useEffect(() => {
    if (state.turn?.status === 'reveal' && state.turn.kind === 'wildcard') setTab('task');
  }, [state.turn?.status, state.turn?.kind]);

  // Offene Wetten sind dringend und zeigen eine Zahl. Der Punkt daneben ist nur
  // ein Hinweis für alle, die den Markt noch nie geöffnet haben, obwohl sie
  // sich längst etwas leisten könnten. Nach dem ersten Kauf ist er weg.
  const offeneWetten = (state.bets || []).filter((b) => b.status === 'running' && b.mine && !b.myVote).length;
  const badges = {
    task: wildcard ? '!' : '',
    observe: state.observations?.length ? String(state.observations.length) : '',
    market: offeneWetten ? String(offeneWetten) : state.shopHint ? '·' : '',
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
        background: 'var(--ground)',
        overflow: 'hidden',
      }}
    >
      {tab !== 'home' && <PartyBackground intensity={0.85} />}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div className="bbb-track" style={{ transform: `translateX(-${index * 16.6667}%)` }}>
          <div>
            <MainTab state={state} active={tab === 'home'} onTab={setTab} run={run} />
          </div>
          <div>
            <TaskTab
              state={state}
              run={run}
              wildcardPending={minimized ? wildcard : null}
              onOpenWildcard={() => setMinimized(false)}
            />
          </div>
          <div>
            <ObserveTab state={state} run={run} />
          </div>
          <div>
            <MarketTab state={state} run={run} />
          </div>
          <div>
            <RankTab state={state} />
          </div>
          <div>
            <FeedTab state={state} />
          </div>
        </div>
      </div>

      <nav
        style={{
          flex: 'none',
          display: 'flex',
          padding: '9px 4px max(14px, env(safe-area-inset-bottom))',
          background: 'rgba(16,17,26,.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--line-2)',
          zIndex: 40,
          position: 'relative',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: `calc(${index * 16.6667}% + 6%)`,
            width: '4.6%',
            height: 3,
            borderRadius: 2,
            background: 'linear-gradient(90deg,#c98fae,#d9c08f)',
            transition: 'left .42s cubic-bezier(.32,.72,.24,1)',
          }}
        />
        {TABS.map((t) => {
          const isActive = tab === t.key;
          const badge = badges[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                position: 'relative',
                border: 0,
                background: 'transparent',
                padding: '6px 0 2px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                color: isActive ? 'var(--text)' : '#5f6375',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  animation: isActive ? 'bbbTabPop .34s cubic-bezier(.3,1.4,.5,1) forwards' : 'none',
                  filter: isActive ? 'drop-shadow(0 3px 8px rgba(201,143,174,.55))' : 'none',
                }}
              >
                <PixelIcon
                  name={t.icon}
                  size={25}
                  color={isActive ? '#e9e9ed' : '#565a6b'}
                  accent={isActive ? '#c98fae' : '#3f424d'}
                />
              </span>
              <span style={{ fontSize: 9.5, letterSpacing: '.03em', fontWeight: isActive ? 600 : 400 }}>{t.label}</span>
              {badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 'calc(50% - 24px)',
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 9,
                    fontSize: 10.5,
                    fontWeight: 700,
                    lineHeight: '18px',
                    color: '#0f101a',
                    background: 'var(--rose)',
                    boxShadow: '0 0 12px rgba(201,143,174,.7)',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {roll && <DiceOverlay roll={roll} onClose={() => run('clearRoll')} />}
      {wildcard && !minimized && (
        <WildcardOverlay
          wildcard={wildcard}
          onAccept={() => run('wildcardAccept')}
          onDecline={() => run('wildcardDecline')}
          onLater={() => {
            setMinimized(true);
            setTab('task');
          }}
        />
      )}
      {special && <SpecialOverlay special={special} onClose={() => run('ackSpecial')} />}
      {state.phase === 'ended' && state.result && !resultSeen && (
        <ResultOverlay result={state.result} meId={state.me?.id} onClose={() => setResultSeen(true)} />
      )}
    </div>
  );
}
