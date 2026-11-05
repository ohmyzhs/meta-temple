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
