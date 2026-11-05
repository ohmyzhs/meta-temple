/**
 * 실시간 동석 + 공유 서원 클라이언트 (server/server.js 짝).
 * 보내는 것: 위치·방향·모습·동작·법명, 공개를 고른 연등·기와·돌탑뿐. 번뇌 소각·차담은 보내지 않는다.
 * 서버가 없거나 끊겨도 산사는 혼자 그대로 돌아간다.
 */
const devPort = location.port === '8080' || location.port === '8093';
const httpBase = window.TEMPLE_CONFIG?.liveUrl || (devPort ? `http://${location.hostname}:8095` : location.origin);
const wsBase = httpBase.replace(/^http/, 'ws');

export const LIVE_API = `${httpBase}/api`;

export class LiveLink {
  /** @param hooks { onPeers(peers, count), onBow({sid, name}), onStatus(connected) } */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.ws = null;
    this.connected = false;
    this.retry = 0;
    this.last = null;
    this.lastSent = 0;
    this.me = { name: '', style: 'monk' };
    this.count = 0; // 나를 뺀 실제 접속자 수
    this._closed = false;
  }

  start(name, style) {
    this.me = { name, style };
    this._connect();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.connected) this._connect();
    });
  }

  _connect() {
    if (this._closed || (this.ws && this.ws.readyState <= 1)) return;
    let ws;
    try {
      ws = new WebSocket(`${wsBase}/ws`);
    } catch {
      return this._later();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this._send({ t: 'hello', ...this.me });
      if (this.last) this._send(this.last);
      this.hooks.onStatus?.(true);
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'peers') {
        this.count = Math.max(0, (m.count || 1) - 1);
        this.hooks.onPeers?.(
          m.peers.map(([sid, name, style, x, y, z, ry, a, n]) => ({ id: `p${sid}`, dharmaName: name, avatarStyle: style, x, y, z, ry, actionState: a, actionSeq: n })),
          this.count
        );
      } else if (m.t === 'bow') this.hooks.onBow?.({ id: `p${m.sid}`, name: m.name });
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.count = 0;
      if (was) {
        this.hooks.onPeers?.([], 0);
        this.hooks.onStatus?.(false);
      }
      this._later();
    };
    ws.onerror = () => ws.close();
  }

  _later() {
    if (this._closed) return;
    const wait = Math.min(30000, 1500 * 2 ** this.retry++) * (0.8 + Math.random() * 0.4);
    setTimeout(() => !document.hidden && this._connect(), wait);
  }

  _send(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  setIdentity(name, style) {
    this.me = { name, style };
    this._send({ t: 'hello', ...this.me });
  }

  /** 매 프레임 불러도 된다: 0.2초 간격, 바뀐 것이 있을 때만(2초마다 한 번은 살아 있음 표시) */
  update(state) {
    const now = performance.now();
    if (now - this.lastSent < 200) return;
    const s = {
      t: 's',
      x: +state.x.toFixed(2),
      y: +state.y.toFixed(2),
      z: +state.z.toFixed(2),
      ry: +state.ry.toFixed(2),
      a: state.a,
      n: state.n
    };
    const same = this.last && ['x', 'y', 'z', 'ry', 'a', 'n'].every((k) => this.last[k] === s[k]);
    if (same && now - this.lastSent < 2000) return;
    this.last = s;
    this.lastSent = now;
    this._send(s);
  }

  bow() {
    this._send({ t: 'bow' });
  }
}

/* ───── 공유 서원 ───── */
async function call(path, body, timeout = 5000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${LIVE_API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { error: data.error || `HTTP ${r.status}` };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(id);
  }
}

export const sharedApi = {
  recent: () => call('/shared'),
  publish: (kind, item, clientId) => call(`/${kind}`, { ...item, clientId }),
  empathize: (id, clientId) => call(`/lanterns/${encodeURIComponent(id)}/empathy`, { clientId }),
  report: (kind, id, clientId) => call('/report', { kind, id, clientId })
};
