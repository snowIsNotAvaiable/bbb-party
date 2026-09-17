import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * WebSocket-Anbindung mit Reconnect. Handys gehen in Standby und verlieren die
 * Verbindung; nach dem Wiederaufbau wird immer der volle Zustand
 * neu geladen, nie nur ein Delta.
 *
 * Drei Dinge gehen auf einem echten Handy sonst schief:
 * 1. Ein Handy aus dem Standby meldet den Abbruch nicht zuverlässig. Die
 *    Verbindung sieht offen aus, es kommt aber nichts mehr an. Beim Aufwachen
 *    wird deshalb angeklopft, und ohne Antwort wird neu verbunden.
 * 2. Nach einem Serverneustart wachen alle Gäste gleichzeitig auf. Die
 *    Wartezeit bekommt deshalb einen Zufallsanteil, damit sie sich verteilen.
 * 3. Bricht die Verbindung während eines Tippens weg, sollen die wartenden
 *    Anfragen sofort eine Antwort bekommen und nicht acht Sekunden hängen.
 */

const TOKEN_KEY = 'bbb.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Privater Modus: dann eben ohne Wiedererkennung */
  }
};

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Im Vite-Dev-Server läuft der Spielserver auf 3000, sonst auf demselben Host.
  const host = import.meta.env.DEV ? `${location.hostname}:3000` : location.host;
  return `${proto}//${host}/ws`;
}

class Connection {
  constructor({ role = 'player', pin = null, onState, onStatus, onTokenInvalid }) {
    this.role = role;
    this.pin = pin;
    this.onState = onState;
    this.onStatus = onStatus;
    this.onTokenInvalid = onTokenInvalid;
    this.pending = new Map();
    this.reqId = 1;
    this.attempts = 0;
    this.closed = false;
    this.probe = null;
    this.wake = () => this.checkAlive();
    this.open();
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.wake);
      window.addEventListener('online', this.wake);
      window.addEventListener('pageshow', this.wake);
      window.addEventListener('focus', this.wake);
    }
  }

  open() {
    if (this.closed) return;
    clearTimeout(this.timer);
    // Immer nur eine Verbindung: die alte wird abgeklemmt, bevor die neue
    // entsteht. Sonst meldet sich später ihr onclose und startet einen
    // zweiten Reconnect, der den ersten überholt.
    if (this.ws) this.detach(this.ws);
    this.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      return this.retry();
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.onStatus('online');
      this.hello();
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'state') this.onState(msg.state);
      if (msg.type === 'tokenInvalid') this.onTokenInvalid?.();
      if (msg.reqId && this.pending.has(msg.reqId)) {
        const resolve = this.pending.get(msg.reqId);
        this.pending.delete(msg.reqId);
        resolve(msg);
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.failPending('Verbindung unterbrochen. Gleich nochmal versuchen.');
      this.onStatus('offline');
      this.retry();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* onclose übernimmt */
      }
    };
  }

  hello() {
    this.raw({ type: 'hello', role: this.role, token: getToken(), pin: this.pin });
  }

  /** Handler abmelden und schließen, damit die alte Verbindung still stirbt. */
  detach(ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close();
      } catch {
        /* egal, die Handler sind schon weg */
      }
    }
  }

  /** Offene Anfragen sofort beantworten, statt sie in den Timeout laufen zu lassen. */
  failPending(error) {
    if (!this.pending.size) return;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const resolve of waiting) resolve({ error });
  }

  retry() {
    if (this.closed) return;
    this.attempts += 1;
    const base = Math.min(6000, 400 * this.attempts);
    // Zufallsanteil, damit nach einem Serverneustart nicht zwölf Handys im
    // selben Takt anklopfen.
    const wait = base + Math.random() * Math.min(1200, base);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), wait);
  }

  /**
   * Wird gerufen, wenn das Handy aufwacht oder wieder Netz hat. Eine tote
   * Verbindung wird sofort ersetzt, eine scheinbar offene erst geprüft.
   */
  checkAlive() {
    if (this.closed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      this.attempts = 0; // Der Gast schaut gerade hin, der soll nicht warten.
      this.open();
      return;
    }
    if (ws.readyState !== WebSocket.OPEN || this.probe) return;

    this.probe = setTimeout(() => {
      this.probe = null;
      if (this.ws !== ws) return;
      this.onStatus('offline');
      this.attempts = 0;
      this.open(); // detach() schließt die tote Verbindung mit
    }, 4000);

    this.send({ type: 'ping' }).then((res) => {
      if (res?.type !== 'pong') return;
      clearTimeout(this.probe);
      this.probe = null;
    });
  }

  raw(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /** Schickt eine Nachricht und wartet auf die Quittung des Servers. */
  send(msg) {
    return new Promise((resolve) => {
      const reqId = this.reqId++;
      if (!this.raw({ ...msg, reqId })) {
        resolve({ error: 'Keine Verbindung. Der Zustand liegt sicher auf dem Server.' });
        return;
      }
      this.pending.set(reqId, resolve);
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          resolve({ error: 'Keine Antwort vom Server. Nochmal versuchen.' });
        }
      }, 8000);
    });
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.probe);
    this.failPending('Verbindung geschlossen.');
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.wake);
      window.removeEventListener('online', this.wake);
      window.removeEventListener('pageshow', this.wake);
      window.removeEventListener('focus', this.wake);
    }
    if (this.ws) this.detach(this.ws);
  }
}

export function useConnection({ role = 'player', pin = null, enabled = true } = {}) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const conn = new Connection({
      role,
      pin,
      onState: setState,
      onStatus: setStatus,
      onTokenInvalid: () => {
        setToken(null);
        setTokenInvalid(true);
      },
    });
    ref.current = conn;
    return () => {
      conn.close();
      ref.current = null;
    };
  }, [role, pin, enabled]);

  const send = useCallback((msg) => ref.current?.send(msg) ?? Promise.resolve({ error: 'Keine Verbindung.' }), []);

  const action = useCallback((name, payload = {}) => send({ type: 'action', action: name, ...payload }), [send]);

  return { state, status, send, action, tokenInvalid, setTokenInvalid };
}
