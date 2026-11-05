/**
 * 청연산사 실시간 동석 서버
 *  - WebSocket /ws : 접속자끼리 위치·모습·동작만 주고받는다 (채팅 없음, 합장 인사만)
 *  - HTTP /api/*   : 다른 도반이 공개한 연등·기와·돌탑 (최근 일부)
 * nginx(temple 컨테이너)가 /ws, /api 를 이 서버로 넘긴다.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createStore } from './store.js';
import { checkText } from './moderation.js';
import { PRODUCTS, paymentsEnabled } from './products.js';

const PORT = Number(process.env.PORT) || 8080;
const SALT = process.env.ID_SALT || 'dev-salt';
const ROOM_CAP = 40; // 한 산사에 함께 보이는 인원 — 넘치면 둘째 산사(방)를 연다
const TICK_MS = 200;
const BOW_RANGE = 10; // 합장 인사가 닿는 거리(m)
const DAILY = { lanterns: 6, tiles: 6, stones: 12 };
const STYLES = new Set(['monk', 'ink_wanderer', 'lantern_spirit']);
const ACTIONS = new Set(['idle', 'walk', 'bow_half', 'prostrate', 'meditate', 'incense', 'circumambulate', 'tea', 'sit', 'lookUp']);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[a-z]_[0-9a-f-]{36}$/;
const KINDS = { '/api/lanterns': 'lanterns', '/api/tiles': 'tiles', '/api/stones': 'stones' };
const WISH_MAX = { lanterns: 80, tiles: 24, stones: 30 };
const REPORT_HIDE = 3; // 서로 다른 사람 셋이 신고하면 숨긴다
const POST_COOLDOWN_MS = Number(process.env.POST_COOLDOWN_MS) || 20000; // 같은 사람이 같은 종류를 연달아 올리는 간격

const store = await createStore(process.env.DATABASE_URL);
console.log(`[live] store=${store.kind} port=${PORT}`);

const safeName = (v, fallback) => {
  const r = checkText(v, { kind: 'name' });
  return r.ok ? r.text : fallback;
};
const hash = (v) => crypto.createHash('sha256').update(`${SALT}:${v}`).digest('hex').slice(0, 32);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

/* ───── HTTP API ───── */
const ipHits = new Map(); // ip → [시각...] 분당 요청 제한
function rateOk(ip, perMin = 30) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  ipHits.set(ip, arr);
  return arr.length <= perMin;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipHits) if (!v.some((t) => now - t < 60000)) ipHits.delete(k);
}, 60000).unref();

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

// ponytail: 메모리에만 둔다 — 서버를 다시 띄우면 초기화된다. 여러 대로 늘리면 저장소로 옮길 것
const lastPost = new Map(); // `${clientHash}|${kind}` → 시각
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastPost) if (now - t > POST_COOLDOWN_MS) lastPost.delete(k);
}, 60000).unref();

async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  const ip = ipOf(req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type' });
    return res.end();
  }
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, store: store.kind, rooms: rooms.length, online: [...clients.values()].length });
  if (!rateOk(ip, req.method === 'GET' ? 60 : 20)) return send(res, 429, { error: '잠시 후 다시 해 주세요' });
  if (req.method === 'GET' && url.pathname === '/api/shared') return send(res, 200, await store.recent());
  if (req.method === 'GET' && url.pathname === '/api/products') return send(res, 200, paymentsEnabled() ? { enabled: true, products: PRODUCTS } : { enabled: false, products: [] });

  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  const clientHash = hash(clean(body.clientId, 64) || ip);
  const author = safeName(body.author, '이름 없는 도반');

  if (url.pathname === '/api/report') {
    const kind = { lanterns: 'lanterns', tiles: 'tiles', stones: 'stones' }[body.kind];
    if (!kind || !ID_RE.test(String(body.id || ''))) return send(res, 400, { error: 'bad report' });
    const r = await store.report(kind, body.id, clientHash, REPORT_HIDE);
    return r ? send(res, 200, r) : send(res, 404, { error: 'not found' });
  }

  const m = url.pathname.match(/^\/api\/lanterns\/([^/]+)\/empathy$/);
  if (m) {
    const r = await store.empathize(m[1], clientHash);
    return r ? send(res, 200, r) : send(res, 404, { error: 'not found' });
  }
  const kind = KINDS[url.pathname];
  if (!kind) return send(res, 404, { error: 'not found' });
  if (!ID_RE.test(String(body.id || ''))) return send(res, 400, { error: 'bad id' });
  const v = checkText(body.wish, { kind: 'wish', max: WISH_MAX[kind] });
  if (!v.ok) return send(res, 422, { error: v.message, reason: v.reason });
  const key = `${clientHash}|${kind}`;
  if (Date.now() - (lastPost.get(key) || 0) < POST_COOLDOWN_MS) return send(res, 429, { error: '잠시 숨을 고른 뒤 다시 올려 주세요' });
  if ((await store.countToday(kind, clientHash)) >= DAILY[kind]) return send(res, 429, { error: '오늘은 충분히 올리셨습니다' });
  lastPost.set(key, Date.now());
  const item = { id: body.id, author, wish: v.text, client_hash: clientHash };
  if (kind === 'lanterns') {
    if (!COLOR_RE.test(String(body.color || ''))) return send(res, 400, { error: 'bad color' });
    item.color = body.color;
  }
  const saved = await store.add(kind, item);
  return send(res, saved ? 201 : 200, saved || { duplicate: true });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    api(req, res).catch((e) => {
      console.error('[api]', e);
      send(res, 500, { error: 'server error' });
    });
  } else send(res, 404, { error: 'not found' });
});

/* ───── 실시간 동석 ───── */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const clients = new Map(); // ws → peer
const rooms = []; // [{ id, peers:Set<peer> }]
let nextSid = 1;

function joinRoom(peer) {
  let room = rooms.find((r) => r.peers.size < ROOM_CAP);
  if (!room) {
    room = { id: rooms.length + 1, peers: new Set() };
    rooms.push(room);
  }
  room.peers.add(peer);
  peer.room = room;
}

function leave(peer) {
  peer.room?.peers.delete(peer);
  clients.delete(peer.ws);
}

wss.on('connection', (ws, req) => {
  const peer = { ws, sid: nextSid++, name: '도반', style: 'monk', x: 0, y: 0, z: 36, ry: Math.PI, a: 'idle', n: 0, alive: true, msgs: 0, ready: false, dirty: true };
  clients.set(ws, peer);
  joinRoom(peer);
  ws.send(JSON.stringify({ t: 'welcome', sid: peer.sid, room: peer.room.id }));
  ws.on('pong', () => (peer.alive = true));
  ws.on('message', (data) => {
    if (++peer.msgs > 40) return ws.close(1008, 'rate'); // 초당 40 넘으면 끊는다 (정상은 5)
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.t === 'hello') {
      peer.name = safeName(m.name, '도반');
      peer.style = STYLES.has(m.style) ? m.style : 'monk';
      peer.ready = true;
      peer.dirty = true;
    } else if (m.t === 's') {
      const num = (v, lim) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
      peer.x = num(m.x, 400);
      peer.y = num(m.y, 100);
      peer.z = num(m.z, 400);
      peer.ry = num(m.ry, 10);
      peer.a = ACTIONS.has(m.a) ? m.a : 'idle';
      peer.n = Number.isInteger(m.n) ? m.n : 0;
      if (m.style && STYLES.has(m.style)) peer.style = m.style;
      if (m.name) peer.name = safeName(m.name, peer.name);
      peer.ready = true;
      peer.dirty = true;
    } else if (m.t === 'bow' && peer.ready) {
      const now = Date.now();
      if (now - (peer.lastBow || 0) < 1500) return;
      peer.lastBow = now;
      const msg = JSON.stringify({ t: 'bow', sid: peer.sid, name: peer.name });
      for (const o of peer.room.peers) {
        if (o !== peer && o.ready && Math.hypot(o.x - peer.x, o.z - peer.z) < BOW_RANGE) o.ws.send(msg);
      }
    }
  });
  ws.on('close', () => leave(peer));
  ws.on('error', () => leave(peer));
});

// 0.2초마다 방마다 한 번: 바뀐 것이 있을 때만, 1초에 한 번은 무조건 (새로 온 사람용)
let tick = 0;
setInterval(() => {
  tick++;
  for (const room of rooms) {
    const ready = [...room.peers].filter((p) => p.ready);
    const changed = ready.some((p) => p.dirty);
    if (!changed && tick % 5) continue;
    const all = ready.map((p) => [p.sid, p.name, p.style, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.a, p.n]);
    for (const p of room.peers) {
      if (p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({ t: 'peers', count: ready.length, peers: all.filter((x) => x[0] !== p.sid) }));
    }
    ready.forEach((p) => (p.dirty = false));
  }
  for (const p of clients.values()) p.msgs = Math.max(0, p.msgs - 8);
}, TICK_MS);

// 끊긴 연결 정리
setInterval(() => {
  for (const p of clients.values()) {
    if (!p.alive) {
      p.ws.terminate();
      leave(p);
      continue;
    }
    p.alive = false;
    p.ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`[live] listening on ${PORT}`));
