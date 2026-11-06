import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  const env = { ...process.env, PORT: String(PORT), POST_COOLDOWN_MS: '1500' };
  delete env.DATABASE_URL; // 메모리 저장소
  proc = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => proc?.kill());

const post = (path, body, ip = '10.0.0.1') =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const sid = () => 's_' + randomUUID();

test('post_sexual_stone_rejected', async () => {
  const r = await post('/api/stones', { id: sid(), wish: '쉐엑스', clientId: 'c-sex' });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).reason, 'sexual');
});

test('post_normal_then_quick_repeat_429', async () => {
  const a = await post('/api/stones', { id: sid(), wish: '건강기원', clientId: 'c-fast' }, '10.0.0.2');
  assert.equal(a.status, 201);
  const b = await post('/api/stones', { id: sid(), wish: '아자아자', clientId: 'c-fast' }, '10.0.0.2');
  assert.equal(b.status, 429);
  await new Promise((r) => setTimeout(r, 1600));
  const c = await post('/api/stones', { id: sid(), wish: '아자아자', clientId: 'c-fast' }, '10.0.0.2');
  assert.equal(c.status, 201);
});

test('bad_author_replaced', async () => {
  const id = sid();
  const r = await post('/api/stones', { id, wish: '평안', author: '씨발', clientId: 'c-auth' }, '10.0.0.3');
  assert.equal(r.status, 201);
  const shared = await (await fetch(`${BASE}/api/shared`)).json();
  assert.equal(shared.stones.find((s) => s.id === id).author, '이름 없는 도반');
});

test('report_three_hides', async () => {
  const id = sid();
  assert.equal((await post('/api/stones', { id, wish: '마음 편히', clientId: 'c-rep' }, '10.0.0.4')).status, 201);
  const rep = (cid) => post('/api/report', { kind: 'stones', id, clientId: cid }, '10.0.0.5').then((r) => r.json());
  assert.deepEqual(await rep('r1'), { hidden: false, reports: 1 });
  assert.deepEqual(await rep('r1'), { hidden: false, reports: 1 }); // 같은 사람은 한 번만
  assert.deepEqual(await rep('r2'), { hidden: false, reports: 2 });
  assert.deepEqual(await rep('r3'), { hidden: true, reports: 3 });
  const shared = await (await fetch(`${BASE}/api/shared`)).json();
  assert.equal(shared.stones.some((s) => s.id === id), false);
});

test('ws_bad_name_replaced', async () => {
  const open = () => new Promise((res) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); w.on('open', () => res(w)); });
  const a = await open(), b = await open();
  a.send(JSON.stringify({ t: 'hello', name: '씨발', style: 'monk' }));
  a.send(JSON.stringify({ t: 's', x: 1, y: 0, z: 30, ry: 0, a: 'idle', n: 0 }));
  b.send(JSON.stringify({ t: 'hello', name: '청풍', style: 'monk' }));
  const seen = await new Promise((res) => b.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'peers' && m.peers.length) res(m.peers[0]); }));
  assert.equal(seen[1], '도반');
  a.close();
  b.close();
});

test('ws_v2_gets_pv_with_roster_v1_gets_peers', async () => {
  const open = () => new Promise((res) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); w.on('open', () => res(w)); });
  const v1 = await open(), v2 = await open(), mover = await open();
  const got = { v1: null, v2: null };
  v1.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'peers' && m.peers.length) got.v1 ||= m; });
  v2.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'pv' && m.ids?.length) got.v2 ||= m; });
  v1.send(JSON.stringify({ t: 'hello', name: '옛날', style: 'monk' }));
  v2.send(JSON.stringify({ t: 'hello', v: 2, name: '새것', style: 'monk' }));
  mover.send(JSON.stringify({ t: 'hello', v: 2, name: '걷는이', style: 'monk' }));
  mover.send(JSON.stringify({ t: 's', x: 2, y: 0, z: 34, ry: 0, a: 'walk', n: 0 }));
  for (let i = 0; i < 30 && !(got.v1 && got.v2); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(got.v1, 'v1 still gets full peers');
  assert.ok(got.v2, 'v2 gets pv with roster');
  assert.ok(got.v2.peers.some((r) => r[1] === '걷는이'));
  [v1, v2, mover].forEach((w) => w.close());
});

test('old_client_compat', async () => {
  const w = await new Promise((res) => { const s = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); s.on('open', () => res(s)); });
  w.send(JSON.stringify({ t: 'hello', style: 'monk' })); // 이름 없는 옛 형식
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(w.readyState, WebSocket.OPEN);
  w.close();
  const r = await post('/api/lanterns', { id: 'l_' + randomUUID(), wish: '등불처럼', color: '#f2c46d', clientId: 'c-old' }, '10.0.0.6');
  assert.equal(r.status, 201);
});

test('products_disabled_by_default', async () => {
  const r = await fetch(`${BASE}/api/products`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enabled: false, products: [] });
});

/* ───── 돌탑 어디서나 (요구 8): stones 의 선택 필드 cairnId, x, z ───── */
const cid = () => 'c_' + randomUUID();
const shared = () => fetch(`${BASE}/api/shared`).then((r) => r.json());

test('stone_cairn_fields', async () => {
  const c = cid(), id = sid();
  const r = await post('/api/stones', { id, wish: '계곡 물소리', clientId: 'c-cairn1', cairnId: c, x: -12.34, z: 20.1 }, '10.1.0.1');
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json().then(({ cairnId, x, z }) => ({ cairnId, x, z })), { cairnId: c, x: -12.34, z: 20.1 });
  const s = await shared();
  assert.deepEqual(s.cairns.find((k) => k.id === c), { id: c, x: -12.34, z: 20.1, n: 1 });
  assert.equal(s.stones.find((k) => k.id === id).cairnId, c);
});

test('stone_joins_nearby_cairn', async () => {
  const first = cid();
  assert.equal((await post('/api/stones', { id: sid(), wish: '하나', clientId: 'c-join1', cairnId: first, x: 30, z: -40 }, '10.1.0.2')).status, 201);
  // 다른 사람이 1m 옆에 새 탑을 세우려 해도 → 있던 탑에 한 층 더
  const r = await post('/api/stones', { id: sid(), wish: '둘', clientId: 'c-join2', cairnId: cid(), x: 30.8, z: -40.6 }, '10.1.0.3');
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.deepEqual([b.cairnId, b.x, b.z], [first, 30, -40]);
  // 아는 탑 id 로 엉뚱한 자리를 보내도 탑 자리는 그대로
  const r3 = await post('/api/stones', { id: sid(), wish: '셋', clientId: 'c-join3', cairnId: first, x: 99, z: 99 }, '10.1.0.4');
  assert.deepEqual(await r3.json().then((j) => [j.x, j.z]), [30, -40]);
  assert.equal((await shared()).cairns.find((k) => k.id === first).n, 3);
});

test('stone_area_cap', async () => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = await post('/api/stones', { id: sid(), wish: `탑 ${i}`, clientId: `c-area${i}`, cairnId: cid(), x: 60 + 3 * Math.cos(a), z: 60 + 3 * Math.sin(a) }, `10.1.1.${i}`);
    assert.equal(r.status, 201);
  }
  const r = await post('/api/stones', { id: sid(), wish: '일곱째', clientId: 'c-area7', cairnId: cid(), x: 60, z: 60 }, '10.1.1.9');
  assert.equal(r.status, 422);
  assert.equal((await r.json()).reason, 'cairn_area_full');
});

test('stone_bad_cairn_400', async () => {
  for (const bad of [{ cairnId: 'gate', x: 1, z: 1 }, { cairnId: cid(), x: 'a', z: 1 }, { cairnId: cid(), x: 1 }, { cairnId: cid(), x: 1e7, z: 0 }]) {
    const r = await post('/api/stones', { id: sid(), wish: '평안', clientId: 'c-bad' + JSON.stringify(bad), ...bad }, '10.1.2.1');
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test('old_stone_still_gate', async () => {
  const before = (await shared()).gateStones;
  const r = await post('/api/stones', { id: sid(), wish: '옛 화면의 돌', clientId: 'c-oldstone' }, '10.1.3.1');
  assert.equal(r.status, 201);
  assert.equal((await r.json()).cairnId, undefined);
  assert.equal((await shared()).gateStones, before + 1);
});
