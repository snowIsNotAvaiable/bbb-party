import { Component } from 'react';

/**
 * Auffangnetz für Fehler beim Rendern. Ohne das zeigt React bei einem Fehler
 * eine weiße Seite, und ein Gast mit einem weißen Handy im dunklen Wohnzimmer
 * hält das für kaputt und legt es weg.
 *
 * Neu laden ist hier immer die richtige Antwort: der Spielstand liegt komplett
 * auf dem Server, das Handy hält nichts, was verloren gehen könnte.
 */
export default class Crash extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    // Landet in der Konsole des Handys. Beim Host hilft das nicht, aber wenn
    // jemand sein Handy hinhält, steht wenigstens etwas Brauchbares da.
    console.error('[bbb] Anzeige abgestürzt:', err, info?.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '32px 26px',
          textAlign: 'center',
          background: 'radial-gradient(120% 80% at 50% -10%,#221f36 0%,#14151f 45%,#0d0e16 100%)',
          color: '#e9e9ed',
          font: '400 15px/1.55 Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 34 }} aria-hidden="true">
          🙀
        </div>
        <div style={{ fontSize: 21, fontWeight: 600 }}>Die Anzeige hat sich verschluckt</div>
        <div style={{ fontSize: 14.5, color: '#9a9aa8', maxWidth: 320, lineHeight: 1.5 }}>
          Deine Punkte und deine laufende Aufgabe liegen auf dem Server, nicht auf deinem Handy.
          Neu laden kostet dich also nichts.
        </div>
        <button
          onClick={() => location.reload()}
          style={{
            marginTop: 6,
            padding: '14px 26px',
            borderRadius: 13,
            border: '1px solid #c98fae',
            background: 'rgba(201,143,174,.16)',
            color: '#f0d8e4',
            fontSize: 15.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Neu laden
        </button>
        <div style={{ fontSize: 11, color: '#5f6375', marginTop: 10, maxWidth: 320, wordBreak: 'break-word' }}>
          {String(this.state.err?.message || this.state.err)}
        </div>
      </div>
    );
  }
}
