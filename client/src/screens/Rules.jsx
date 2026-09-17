import { useEffect, useState } from 'react';
import { partyCatUrl } from '../lib/sprites.js';
import PartyBackground from '../components/PartyBackground.jsx';
import PixelLogo from '../components/PixelLogo.jsx';

/**
 * Die acht Regelkarten. Die Einblendung läuft über CSS scroll-driven
 * animations, ganz ohne JavaScript. Der Kopf scrollt mit weg statt zu kleben.
 */

const RULES = [
  {
    n: '1',
    title: 'Es gibt keine Reihenfolge',
    body: 'Alle spielen gleichzeitig. Wer fertig ist, zieht sofort die nächste Karte.',
    note: 'Niemand wartet auf niemanden.',
    tint: '#c98fae',
  },
  {
    n: '2',
    title: 'Erst festlegen, dann lesen',
    body: 'Du siehst nur Titel und Kategorie. Erst wenn du dich auf eine Stufe festgelegt hast, erscheint die Aufgabe.',
    note: 'Stufe 1 bringt 1 Punkt, Stufe 2 bringt 5, Stufe 3 bringt 10.',
    tint: '#9184d9',
  },
  {
    n: '3',
    title: 'Dein Beobachter wird gelost',
    body: 'Schon beim Ziehen bestimmt die App, wer dir zusieht. Das passiert, bevor irgendwer die Aufgabe kennt.',
    note: 'Kein Aussuchen, kein Selbst-Abhaken.',
    tint: '#8fc9b4',
  },
  {
    n: '4',
    title: 'Punkte gibt es erst nach der Abnahme',
    body: '„Erledigt" heißt zunächst nur: wartet auf Abnahme. Erst wenn dein Beobachter bestätigt, zählt es.',
    note: 'Lehnt er ab, gibt es null. Weiterziehen darfst du trotzdem.',
    tint: '#d9c08f',
  },
  {
    n: '5',
    title: 'Dreimal pro Karte darfst du kneifen',
    body: 'Gefällt dir die Karte nicht, wirfst du sie weg und ziehst eine neue. Das geht dreimal, danach musst du durch.',
    note: 'Jeder Versuch kostet Würfel mal Faktor, und der Faktor steigt: erst ×1, dann ×2, dann ×3.',
    tint: '#c98fae',
  },
  {
    n: '6',
    title: 'Der Sonderauftrag trifft dich unangekündigt',
    body: 'Alle 15 bis 25 Minuten zieht die App eine Person für eine Extraaufgabe: 25 Punkte, zwei Beobachter. Du sagst zu, bevor du sie siehst.',
    note: 'Fünf Minuten Bedenkzeit, kein Reroll. Ablehnen ist gratis, steht aber im Feed.',
    tint: '#9184d9',
  },
  {
    n: '7',
    title: 'Wetten und Einkaufen',
    body: 'Beim Annehmen einer Wette zahlen beide Seiten sofort ihren Einsatz, der Gewinner bekommt den ganzen Pott. Im Shop kaufst du Effekte gegen die anderen.',
    note: 'Alles öffentlich. Anonyme Sabotage gibt es hier nicht.',
    tint: '#8fc9b4',
  },
  {
    n: '8',
    title: 'Special Cards kommen aus dem Nichts',
    body: 'Jeder Zug hat eine kleine Chance, statt einer Aufgabe eine Special Card auszuspucken. Die landet in deiner Hand und wird gespielt, wann du willst.',
    note: 'Selten und rein zufällig. Und ja, sie sind unfair.',
    tint: '#d9c08f',
  },
];

export default function Rules({ onDone }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ height: '100dvh', position: 'relative', background: 'var(--ground)' }}>
      <PartyBackground intensity={0.8} />

      <div
        className="bbb-scroll"
        style={{
          position: 'relative',
          height: '100%',
          padding: 'max(38px, calc(env(safe-area-inset-top) + 14px)) 18px 150px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8, animation: 'bbbSlideUp .5s both' }}>
          <div className="bbb-kicker" style={{ letterSpacing: '.4em' }}>
            Bevor's losgeht
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.04em', marginTop: 6 }}>Die Regeln</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim-2)', marginTop: 8 }}>Acht Karten, dann geht es los.</div>
        </div>

        {RULES.map((r) => (
          <div
            key={r.n}
            className="bbb-rule"
            style={{
              marginTop: 16,
              padding: 19,
              borderRadius: 20,
              background: 'linear-gradient(155deg,rgba(37,34,58,.92),rgba(25,26,37,.92))',
              boxShadow: `0 0 0 1px ${r.tint}44, 0 12px 30px rgba(0,0,0,.4)`,
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#0f101a',
                  background: r.tint,
                  flex: 'none',
                  boxShadow: `0 0 20px ${r.tint}66`,
                }}
              >
                {r.n}
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>{r.title}</div>
            </div>
            <div className="bbb-prose" style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              {r.body}
            </div>
            <div style={{ marginTop: 11, fontSize: 12.5, color: r.tint }}>{r.note}</div>
          </div>
        ))}

        <div className="bbb-rule" style={{ textAlign: 'center', padding: '34px 0 10px' }}>
          <div style={{ width: 150, height: 130, margin: '0 auto 10px' }}>
            <img className="bbb-pixel" src={partyCatUrl(8, frame, 1)} alt="" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Alles klar?</div>
          <div style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>Dann kann's losgehen.</div>
          <div style={{ marginTop: 24 }}>
            <PixelLogo size={0.68} />
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '20px 18px calc(24px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(transparent,#0f101a 38%)',
          zIndex: 10,
        }}
      >
        <button
          className="bbb-btn bbb-sheen"
          onClick={onDone}
          style={{
            width: '100%',
            padding: 19,
            fontSize: 18,
            fontWeight: 700,
            borderRadius: 17,
            background: 'linear-gradient(100deg,rgba(145,132,217,.30),rgba(201,143,174,.28))',
            border: '1px solid var(--accent)',
          }}
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
