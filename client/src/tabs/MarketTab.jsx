import { useState } from 'react';
import { Header, SCREEN_PAD } from './TaskTab.jsx';
import { Empty, InfoBox } from './FeedTab.jsx';

/**
 * Markt: Black Market (Wetten) und Shop (Effekt-Items).
 * Beides läuft über den Server, jeder Kauf landet im Feed.
 */

export default function MarketTab({ state, run }) {
  const [section, setSection] = useState('black');

  return (
    <div className="bbb-scroll" style={{ flex: 1, padding: SCREEN_PAD, minHeight: 0, position: 'relative' }}>
      <Header kicker="Punkte einsetzen" title="Markt" />

      <div
        style={{
          display: 'flex',
          gap: 5,
          padding: 5,
          borderRadius: 15,
          background: 'rgba(20,21,31,.8)',
          boxShadow: '0 0 0 1px var(--line-2)',
          marginBottom: 18,
          position: 'relative',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 5,
            bottom: 5,
            left: section === 'black' ? 5 : 'calc(50% + 2.5px)',
            width: 'calc(50% - 7.5px)',
            borderRadius: 11,
            background: 'linear-gradient(100deg,rgba(145,132,217,.32),rgba(201,143,174,.24))',
            boxShadow: '0 0 0 1px var(--line-accent)',
            transition: 'left .3s cubic-bezier(.32,.72,.24,1)',
          }}
        />
        {[
          ['black', 'Black Market'],
          ['shop', 'Shop'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 0,
              borderRadius: 11,
              fontSize: 15,
              fontWeight: section === key ? 600 : 400,
              cursor: 'pointer',
              color: section === key ? 'var(--text)' : 'var(--text-dim-2)',
              background: 'transparent',
              position: 'relative',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'black' ? <BlackMarket state={state} run={run} /> : <Shop state={state} run={run} />}
      <div style={{ height: 16 }} />
    </div>
  );
}

/* ── Black Market ───────────────────────────────────────────── */

function BlackMarket({ state, run }) {
  const [form, setForm] = useState(null);
  const [resolving, setResolving] = useState(null);
  const bets = state.bets || [];
  const cap = state.config?.stakeCap ?? 25;
  const others = (state.ranking || []).filter((p) => p.id !== state.me?.id && p.active);

  if (!state.config?.betsEnabled) return <Empty text="Der Black Market ist gerade zu." />;

  return (
    <>
      {form ? (
        <BetForm
          form={form}
          setForm={setForm}
          cap={cap}
          others={others}
          onSubmit={async () => {
            const res = await run('createBet', {
              text: form.text,
              stake: form.stake,
              opponentId: form.opponentId || null,
            });
            if (!res.error) setForm(null);
          }}
        />
      ) : (
        <button
          className="bbb-btn"
          onClick={() => setForm({ text: '', stake: Math.min(10, cap), opponentId: '' })}
          style={{
            width: '100%',
            padding: 17,
            marginBottom: 14,
            borderRadius: 16,
            border: '1px dashed var(--rose)',
            background: 'rgba(201,143,174,.09)',
            color: 'var(--rose-light)',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          + Neue Wette anlegen
        </button>
      )}

      {bets.map((b, i) => {
        const isOpen = b.status === 'open';
        const canAccept = isOpen && b.createdBy !== state.me?.id;
        const canCancel = isOpen && b.createdBy === state.me?.id;
        const canResolve = b.status === 'running' && b.mine && !b.myVote;

        return (
          <div
            key={b.id}
            className="bbb-card"
            style={{
              marginBottom: 12,
              padding: 16,
              animation: `bbbSlideUp .4s ${Math.min(i, 6) * 0.04}s both`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {b.acceptedByName
                  ? `${b.createdByName} ↔ ${b.acceptedByName}`
                  : b.opponentName
                    ? `${b.createdByName} gegen ${b.opponentName}`
                    : `${b.createdByName} gegen alle`}
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  padding: '4px 9px',
                  borderRadius: 7,
                  color: isOpen ? 'var(--accent-lighter)' : 'var(--gold)',
                  background: isOpen ? 'rgba(145,132,217,.20)' : 'rgba(217,192,143,.16)',
                }}
              >
                {isOpen ? 'offen' : 'läuft'}
              </div>
            </div>

            <div
              className="bbb-prose"
              style={{ fontSize: 17, lineHeight: 1.42, marginBottom: 14, fontWeight: 500 }}
            >
              „{b.text}"
            </div>

            {b.disputed && <Note tone="rose">Uneinigkeit. Der Host entscheidet.</Note>}
            {b.myVote && !b.disputed && <Note>Deine Stimme steht. Fehlt die Gegenseite.</Note>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{b.stake} Punkte</div>
              <div style={{ flex: 1 }} />
              {canAccept && <Action onClick={() => run('acceptBet', { betId: b.id })}>Annehmen</Action>}
              {canCancel && <Action onClick={() => run('cancelBet', { betId: b.id })}>Zurückziehen</Action>}
              {canResolve && (
                <Action onClick={() => setResolving(resolving === b.id ? null : b.id)}>Auflösen</Action>
              )}
            </div>

            {resolving === b.id && (
              <div style={{ marginTop: 12, display: 'flex', gap: 9 }}>
                {[
                  { id: b.createdBy, name: b.createdByName },
                  { id: b.acceptedBy, name: b.acceptedByName },
                ].map((side) => (
                  <button
                    key={side.id}
                    className="bbb-btn"
                    onClick={async () => {
                      setResolving(null);
                      await run('voteBet', { betId: b.id, winnerId: side.id });
                    }}
                    style={{
                      flex: 1,
                      padding: 13,
                      borderRadius: 12,
                      border: '1px solid var(--line-3)',
                      background: 'rgba(28,29,41,.9)',
                      fontSize: 14.5,
                    }}
                  >
                    {side.id === state.me?.id ? 'Ich' : side.name} gewinnt
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!bets.length && !form && <Empty text="Noch keine Wetten. Trau dich." />}

      <InfoBox
        title="So läuft eine Wette"
        lines={[
          'Beim Annehmen zahlen beide sofort ihren Einsatz.',
          'Wer gewinnt, bekommt den ganzen Pott.',
          'Offene Angebote verfallen nach 15 Minuten.',
        ]}
      />
    </>
  );
}

function BetForm({ form, setForm, cap, others, onSubmit }) {
  return (
    <div
      className="bbb-card"
      style={{
        marginBottom: 14,
        padding: 17,
        boxShadow: '0 0 0 1px var(--rose)',
        animation: 'bbbPop .3s both',
      }}
    >
      <div className="bbb-label" style={{ marginBottom: 8 }}>
        Worauf wettest du?
      </div>
      <textarea
        className="bbb-input"
        rows={3}
        maxLength={300}
        autoFocus
        placeholder="Frank schafft die nächste Stufe 10 nicht."
        value={form.text}
        onChange={(e) => setForm({ ...form, text: e.target.value })}
        style={{ fontSize: 16, resize: 'none', lineHeight: 1.45 }}
      />

      <div className="bbb-label" style={{ margin: '16px 0 8px' }}>
        Einsatz: <span style={{ color: 'var(--gold)', fontSize: 15 }}>{form.stake} Punkte</span>
      </div>
      <input
        type="range"
        min={1}
        max={cap}
        value={form.stake}
        onChange={(e) => setForm({ ...form, stake: Number(e.target.value) })}
        style={{ width: '100%', accentColor: '#c98fae', height: 28 }}
      />

      <div className="bbb-label" style={{ margin: '14px 0 8px' }}>
        Gegen wen?
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        <Chip active={!form.opponentId} onClick={() => setForm({ ...form, opponentId: '' })}>
          alle
        </Chip>
        {others.map((p) => (
          <Chip
            key={p.id}
            active={form.opponentId === p.id}
            onClick={() => setForm({ ...form, opponentId: p.id })}
          >
            {p.name}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
        <button
          className="bbb-btn bbb-primary"
          onClick={onSubmit}
          style={{ flex: 1, padding: 15, borderRadius: 14, fontSize: 16, fontWeight: 600 }}
        >
          Einstellen
        </button>
        <button
          className="bbb-btn"
          onClick={() => setForm(null)}
          style={{ padding: '15px 20px', borderRadius: 14, fontSize: 15, color: 'var(--text-muted)' }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/* ── Shop ───────────────────────────────────────────────────── */

function Shop({ state, run }) {
  const [target, setTarget] = useState(null);
  const items = state.shopItems || [];
  const others = (state.ranking || []).filter((p) => p.id !== state.me?.id && p.active);

  if (!state.config?.shopEnabled) return <Empty text="Der Shop ist gerade zu." />;

  if (!items.length) {
    return (
      <>
        <Empty text="Die Items schreibt ihr noch. Sobald sie in shopItems.json stehen, tauchen sie hier auf.">
          <div style={{ fontSize: 34, marginBottom: 10 }}>🛒</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Der Shop ist noch leer
          </div>
        </Empty>
        <InfoBox
          title="Was hier später steht"
          lines={[
            'Effekte, die du gegen andere einsetzen kannst.',
            'Bezahlt wird sofort, jeder Kauf steht im Feed.',
            'Pro Person wirkt nur ein fremder Effekt.',
          ]}
        />
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {items.map((item, i) => (
          <button
            key={item.id}
            className="bbb-btn"
            onClick={() => (item.requiresTarget ? setTarget(item) : run('buyItem', { itemId: item.id }))}
            style={{
              textAlign: 'left',
              padding: 15,
              borderRadius: 18,
              border: '1px solid var(--line-2)',
              background: 'linear-gradient(155deg,rgba(37,34,58,.9),rgba(25,26,37,.9))',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              minHeight: 148,
              animation: `bbbSlideUp .4s ${Math.min(i, 8) * 0.03}s both`,
            }}
          >
            <div style={{ fontSize: 26 }}>{item.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{item.name}</div>
            <div
              className="bbb-prose"
              style={{ fontSize: 12, color: 'var(--text-dim-2)', lineHeight: 1.4, flex: 1 }}
            >
              {item.description}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--gold)',
                borderTop: '1px solid var(--line)',
                paddingTop: 8,
              }}
            >
              {item.price} P
            </div>
          </button>
        ))}
      </div>

      <InfoBox
        title="Kleingedrucktes"
        lines={[
          'Punkte sind sofort weg.',
          'Jeder Kauf steht im Feed.',
          'Pro Person wirkt nur ein fremder Effekt.',
        ]}
      />

      {target && (
        <div
          onClick={() => setTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(10,11,18,.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bbb-card"
            style={{
              width: '100%',
              padding: 20,
              boxShadow: 'var(--sh-overlay)',
              animation: 'bbbPop .3s both',
              marginBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 5 }}>
              {target.icon} {target.name}
            </div>
            <div className="bbb-prose" style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>
              {target.description} Kostet {target.price} Punkte.
            </div>
            <div className="bbb-label" style={{ marginBottom: 10 }}>
              Auf wen?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {others.map((p) => (
                <Chip
                  key={p.id}
                  onClick={async () => {
                    setTarget(null);
                    await run('buyItem', { itemId: target.id, targetId: p.id });
                  }}
                >
                  {p.name}
                </Chip>
              ))}
            </div>
            <button
              className="bbb-btn"
              onClick={() => setTarget(null)}
              style={{
                marginTop: 18,
                width: '100%',
                padding: 14,
                borderRadius: 13,
                color: 'var(--text-muted)',
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Kleinteile ─────────────────────────────────────────────── */

function Note({ children, tone }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        color: tone === 'rose' ? 'var(--rose)' : 'var(--text-dim-2)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Action({ children, onClick }) {
  return (
    <button
      className="bbb-btn"
      onClick={onClick}
      style={{
        padding: '12px 18px',
        borderRadius: 13,
        border: '1px solid var(--accent)',
        background: 'rgba(145,132,217,.14)',
        color: 'var(--accent-lighter)',
        fontSize: 14.5,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button
      className="bbb-btn"
      onClick={onClick}
      style={{
        padding: '11px 15px',
        borderRadius: 12,
        fontSize: 14.5,
        border: `1px solid ${active ? 'var(--rose)' : 'var(--line-3)'}`,
        background: active ? 'rgba(201,143,174,.18)' : 'rgba(28,29,41,.9)',
      }}
    >
      {children}
    </button>
  );
}
