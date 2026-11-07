/**
 * 청연산사 실시간 동석 서버
 *  - WebSocket /ws : 접속자끼리 위치·모습·동작만 주고받는다 (채팅 없음, 합장 인사만)
 *  - HTTP /api/*   : 다른 도반이 공개한 연등·기와·돌탑 (최근 일부), 차담 스님 AI(/api/monk, monk.js), 복구키로 맡긴 기록(/api/backup)
 * nginx(temple 컨테이너)가 /ws, /api 를 이 서버로 넘긴다.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createStore } from './store.js';
import { checkText } from './moderation.js';
import { parsePlace, placeStone, toRoadside, roadsideList, AREA_RADIUS, CAIRN_ID_RE, ROADSIDE, ROADSIDE_REACH } from './cairns.js';
import { ROADSIDE_GEO } from './roadsideGeo.js';
import { PRODUCTS, paymentsEnabled } from './products.js';
import { createMonk, MONK_BODY_MAX } from './monk.js';

import { relevantUpdate, row } from './relevance.js';
const PORT = Number(process.env.PORT) || 8080;
const SALT = process.env.ID_SALT || 'dev-salt';
const ROOM_CAP = 60; // 한 산사에 함께 있는 인원 (목표 50명 + 여유) — 넘치면 둘째 산사(방)를 연다
const TICK_MS = 200;
// 관심 영역(가까운 도반은 자주, 먼 도반은 드물게, 바뀐 사람만)은 relevance.js
const BOW_RANGE = 10; // 합장 인사가 닿는 거리(m)
const DAILY = { lanterns: 6, tiles: 6, stones: 12 };
const STYLES = new Set(['monk', 'ink_wanderer', 'lantern_spirit']);
// 동작 상태 (web/src/core/avatarMotion.js ACTION_STATES 와 같게) — 돌탑·기와·연등 몸짓은 2026-11 블렌더 아바타에서 더함
const ACTIONS = new Set(['idle', 'walk', 'bow_half', 'prostrate', 'meditate', 'incense', 'circumambulate', 'tea', 'sit', 'lookUp',
  'offer_stone', 'write_tile', 'hang_lantern']);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[a-z]_[0-9a-f-]{36}$/;
const KINDS = { '/api/lanterns': 'lanterns', '/api/tiles': 'tiles', '/api/stones': 'stones' };
const WISH_MAX = { lanterns: 80, tiles: 24, stones: 30 };
const REPORT_HIDE = 3; // 서로 다른 사람 셋이 신고하면 숨긴다
const POST_COOLDOWN_MS = Number(process.env.POST_COOLDOWN_MS) || 20000; // 같은 사람이 같은 종류를 연달아 올리는 간격
// 기록 지키기 (복구키, web/src/core/recovery.js): 화면이 잠근 덩어리(base64)만 받는다
const BACKUP_ID_RE = /^[0-9a-f]{64}$/;
const BACKUP_MAX = 128 * 1024; // base64 글자 수 — 연등·기와·돌 900개를 쌓은 무거운 기록도 gzip 후 약 46KB (실측). nginx 는 160k 까지 넘긴다
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const store = await createStore(process.env.DATABASE_URL);
const monk = createMonk();
console.log(`[live] store=${store.kind} port=${PORT} monk=${monk.enabled ? monk.cfg.model : 'off'}`);

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

/** 창(windowMs) 안에 max 번까지. 키(보통 IP)마다 따로 센다 — 메모리에만 (서버를 다시 띄우면 초기화) */
function limiter(windowMs, max) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }, 60000).unref();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    return arr.length <= max;
  };
}
const backupSave = limiter(10 * 60000, 12);
const backupSaveDay = limiter(86400000, 40);
const backupRestore = limiter(10 * 60000, 10); // 키가 6자(56^6)라 마구 맞혀 보기를 막는다 — 화면 쪽 PBKDF2 와 함께

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
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, store: store.kind, rooms: rooms.length, online: [...clients.values()].length, monk: monk.enabled });
  if (!rateOk(ip, req.method === 'GET' ? 60 : 20)) return send(res, 429, { error: '잠시 후 다시 해 주세요' });
  if (req.method === 'GET' && url.pathname === '/api/shared') return send(res, 200, await store.recent());
  if (req.method === 'GET' && url.pathname === '/api/monk') return send(res, 200, monk.status(''));
  // 한 돌탑에 남긴 글만 (?cairn=<탑 id> 또는 gate = 일주문 옆 돌탑)
  if (req.method === 'GET' && url.pathname === '/api/stones') {
    const c = url.searchParams.get('cairn') || 'gate';
    if (c !== 'gate' && !CAIRN_ID_RE.test(c)) return send(res, 400, { error: 'bad cairn' });
    return send(res, 200, await store.cairnStones(c === 'gate' ? null : c));
  }
  if (req.method === 'GET' && url.pathname === '/api/products') return send(res, 200, paymentsEnabled() ? { enabled: true, products: PRODUCTS } : { enabled: false, products: [] });

  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  let body;
  try {
    body = await readJson(req, url.pathname === '/api/monk' ? MONK_BODY_MAX : url.pathname === '/api/backup' ? BACKUP_MAX + 1024 : 4096);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  if (url.pathname === '/api/backup' || url.pathname === '/api/backup/restore') return backup(url.pathname, body, ip, res);
  const clientHash = hash(clean(body.clientId, 64) || ip);
  if (url.pathname === '/api/monk') {
    const r = await monk.ask(body, clientHash, hash(ip));
    return send(res, r.code, r.body);
  }
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
  // 돌탑 어디서나: 자리 필드는 선택 (없으면 옛 화면 → 일주문 옆 돌탑)
  let place = null;
  if (kind === 'stones') {
    const p = parsePlace(body);
    if (p.error) return send(res, 400, { error: p.error });
    if (p.place) {
      // 이미 있는 탑이면 그 자리, 아니면 1.5m 안의 탑에 합치고, 구역이 꽉 찼으면 새 탑은 거절
      const known = await store.cairnById(p.place.cairnId);
      if (known) place = { cairn_id: known.id, x: known.x, z: known.z };
      else {
        // 길가 규칙: 길 위(옛 화면)에 세우려던 새 탑은 가까운 길가로. 둘레 탑도 화면처럼 길가 자리(roadsideList)로 견주고, 합칠 때는 그 탑의 DB 자리를 그대로 쓴다
        const spot = toRoadside(p.place.x, p.place.z, ROADSIDE_GEO);
        const raw = await store.cairnsNear(spot.x, spot.z, AREA_RADIUS + ROADSIDE_REACH + ROADSIDE + 1.2);
        const shown = roadsideList(raw, ROADSIDE_GEO);
        const at = placeStone(shown.filter((c) => (c.x - spot.x) ** 2 + (c.z - spot.z) ** 2 <= AREA_RADIUS * AREA_RADIUS), spot.x, spot.z, p.place.cairnId);
        if (at.full) return send(res, 422, { error: '이 근처에는 돌탑이 이미 많습니다. 가까운 돌탑에 얹어 주세요', reason: 'cairn_area_full' });
        const base = at.isNew ? spot : raw[shown.findIndex((c) => c.id === at.id)];
        place = { cairn_id: at.id, x: base.x, z: base.z };
      }
    }
  }
  const key = `${clientHash}|${kind}`;
  if (Date.now() - (lastPost.get(key) || 0) < POST_COOLDOWN_MS) return send(res, 429, { error: '잠시 숨을 고른 뒤 다시 올려 주세요' });
  if ((await store.countToday(kind, clientHash)) >= DAILY[kind]) return send(res, 429, { error: '오늘은 충분히 올리셨습니다' });
  lastPost.set(key, Date.now());
  const item = { id: body.id, author, wish: v.text, client_hash: clientHash, ...place };
  if (kind === 'lanterns') {
    if (!COLOR_RE.test(String(body.color || ''))) return send(res, 400, { error: 'bad color' });
    item.color = body.color;
  }
  const saved = await store.add(kind, item);
  return send(res, saved ? 201 : 200, saved || { duplicate: true });
}

/**
 * 기록 지키기. 화면이 보내는 id 는 복구키에서 유도한 값(키 자체가 아님) — 그것도 소금 해시해서 행 이름으로 쓴다.
 *  POST /api/backup         { id, data, create? } → { updatedAt }   (같은 키로 다시 맡기면 덮어쓴다.
 *                           create: 화면이 새로 만든 키 — 6자라 드물게 겹칠 수 있으니 이미 있으면 409, 화면은 새 키로 다시)
 *  POST /api/backup/restore { id }       → { data, updatedAt } | 404   (id 를 주소에 남기지 않으려고 POST)
 */
async function backup(path, body, ip, res) {
  const id = String(body.id || '');
  if (!BACKUP_ID_RE.test(id)) return send(res, 400, { error: 'bad id' });
  const row = hash(`backup:${id}`); // ID_SALT 를 바꾸면 맡긴 기록을 모두 못 찾는다 — 바꾸지 말 것
  if (path === '/api/backup/restore') {
    if (!backupRestore(ip)) return send(res, 429, { error: '되찾기를 여러 번 시도했습니다. 10분 뒤에 다시 해 주세요' });
    const r = await store.getBackup(row);
    return r ? send(res, 200, r) : send(res, 404, { error: '이 복구키로 맡긴 기록이 없습니다' });
  }
  const data = String(body.data || '');
  if (data.length > BACKUP_MAX) return send(res, 413, { error: '기록이 너무 커서 맡길 수 없습니다' });
  if (data.length < 40 || !B64_RE.test(data)) return send(res, 400, { error: 'bad data' });
  if (!backupSave(ip) || !backupSaveDay(ip)) return send(res, 429, { error: '잠시 뒤에 다시 맡겨 주세요' });
  const r = await store.putBackup(row, data, { create: body.create === true });
  return r ? send(res, 200, r) : send(res, 409, { error: 'taken' });
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
  const peer = { ws, sid: nextSid++, name: '도반', style: 'monk', x: 0, y: 0, z: 36, ry: Math.PI, a: 'idle', n: 0, alive: true, msgs: 0, ready: false, dirty: true, v: 1, ver: 0, sent: new Map(), rosterKey: '' };
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
      peer.v = m.v === 2 ? 2 : 1;
      peer.ready = true;
      peer.dirty = true;
      peer.ver++;
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
      peer.ver++;
    } else if (m.t === 'bow' && peer.ready) {
      const now = Date.now();
      if (now - (peer.lastBow || 0) < 1500) return;
      peer.lastBow = now;
      const msg = JSON.stringify({ t: 'bow', sid: peer.sid, name: peer.name });
      for (const o of peer.room.peers) {
        if (o !== peer && o.ready && Math.hypot(o.x - peer.x, o.z - peer.z) < BOW_RANGE) o.ws.send(msg);
      }
    } else if (m.t === 'bell' && peer.ready) {
      const now = Date.now();
      if (now - (peer.lastBell || 0) < 1500) return;
      peer.lastBell = now;
      const msg = JSON.stringify({ t: 'bell', sid: peer.sid, name: peer.name });
      // 방이나 거리에 관계없이 접속 중인 다른 도반에게 한 번씩 전달한다.
      for (const o of clients.values()) {
        if (o !== peer && o.ready && o.ws.readyState === 1) o.ws.send(msg);
      }
    }
  });
  ws.on('close', () => leave(peer));
  ws.on('error', () => leave(peer));
});

// 0.2초마다 방마다 한 번. 옛 클라이언트(v1)에는 예전처럼 전체 목록 — 바뀐 것이 있을 때, 1초에 한 번은 무조건
let tick = 0;
setInterval(() => {
  tick++;
  const slow = tick % 5 === 0;
  for (const room of rooms) {
    const ready = [...room.peers].filter((p) => p.ready);
    const changed = ready.some((p) => p.dirty);
    const roster = ready.map((p) => p.sid);
    let all = null;
    for (const p of room.peers) {
      if (p.ws.readyState !== 1) continue;
      if (p.v >= 2) {
        const m = relevantUpdate(p, ready, slow, roster);
        if (m) p.ws.send(JSON.stringify(m));
      } else if (changed || slow) {
        all ||= ready.map(row);
        p.ws.send(JSON.stringify({ t: 'peers', count: ready.length, peers: all.filter((x) => x[0] !== p.sid) }));
      }
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
