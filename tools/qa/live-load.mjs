// 실시간 동석 부하 시험: 로컬 서버(메모리 저장소)를 띄우고 진짜 WebSocket 봇 N명이 걷고 동작을 바꾸며 0.2초마다 상태를 보낸다.
// 잰다: 봇 한 명이 받는 양(KB/s·메시지/s), 서버 CPU(%). 옛 형식(v1, 전체 목록)과 새 형식(v2, 관심 영역)을 같은 조건으로.
//   node tools/qa/live-load.mjs [N=50] [hall|spread] [v=2] [초=12]
//   hall: 모두 대웅전 안(서로 40m 안) — 최악 / spread: 10명씩 다섯 무리가 60m 넘게 떨어짐 — 흔한 경우
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from '../../server/node_modules/ws/wrapper.mjs'; // 서버와 같은 ws (server/ 에서 npm install)

const [N = 50, where = 'hall', v = 2, secs = 12] = process.argv.slice(2).map((a, i) => (i === 1 ? a : Number(a)));
const PORT = 8197;
const env = { ...process.env, PORT: String(PORT) };
delete env.DATABASE_URL;
const srv = spawn(process.execPath, [fileURLToPath(new URL('../../server/server.js', import.meta.url))], { env, stdio: ['ignore', 'ignore', 'inherit'] });
process.on('exit', () => srv.kill()); // 시험이 어디서 멈추든 서버는 내린다
const cpu = () => {
  const [m, s] = execSync(`ps -o cputime= -p ${srv.pid}`).toString().trim().split(':').slice(-2).map(Number);
  return m * 60 + s;
};
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const CLUSTERS = [[0, -26], [0, 2], [-45, 20], [45, 20], [0, 50]];
const bots = [];
for (let i = 0; i < N; i++) {
  const c = where === 'hall' ? CLUSTERS[0] : CLUSTERS[i % CLUSTERS.length];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const b = { ws, i, cx: c[0] + ((i * 3.7) % 16) - 8, cz: c[1] + ((i * 1.9) % 10) - 5, bytes: 0, msgs: 0, a: 'walk', n: 0 };
  ws.on('message', (d) => {
    b.bytes += d.length;
    b.msgs++;
  });
  bots.push(b);
}
await Promise.all(bots.map((b) => new Promise((r) => b.ws.on('open', r))));
bots.forEach((b) => b.ws.send(JSON.stringify(v === 2 ? { t: 'hello', v: 2, name: `봇${b.i}`, style: 'monk' } : { t: 'hello', name: `봇${b.i}`, style: 'monk' })));
let tick = 0;
const timer = setInterval(() => {
  tick++;
  for (const b of bots) {
    if (tick % 30 === b.i % 30) [b.a, b.n] = [['walk', 'bow_half', 'prostrate', 'sit'][(tick / 30 + b.i) % 4 | 0], b.n + 1];
    const walk = b.a === 'walk';
    const x = b.cx + (walk ? Math.sin(tick * 0.08 + b.i) * 2 : 0), z = b.cz + (walk ? Math.cos(tick * 0.06 + b.i) * 1.5 : 0);
    b.ws.send(JSON.stringify({ t: 's', x: +x.toFixed(2), y: 0, z: +z.toFixed(2), ry: +((tick * 0.05 + b.i) % 6.28).toFixed(2), a: b.a, n: b.n }));
  }
}, 200);
await new Promise((r) => setTimeout(r, 2000)); // 들어오고 자리 잡을 때까지는 빼고 잰다
bots.forEach((b) => (b.bytes = b.msgs = 0));
const c0 = cpu(), t0 = Date.now();
await new Promise((r) => setTimeout(r, secs * 1000));
const wall = (Date.now() - t0) / 1000, used = cpu() - c0;
clearInterval(timer);
const kb = bots.map((b) => b.bytes / 1024 / wall).sort((a, b) => a - b);
const res = {
  bots: N,
  where,
  protocol: `v${v}`,
  downKBs: { median: +kb[kb.length >> 1].toFixed(1), max: +kb[kb.length - 1].toFixed(1) },
  msgsPerSec: +(bots.reduce((s, b) => s + b.msgs, 0) / N / wall).toFixed(1),
  serverCpuPct: +((used / wall) * 100).toFixed(1)
};
console.log(JSON.stringify(res));
bots.forEach((b) => b.ws.close());
const gone = new Promise((r) => srv.once('exit', r));
srv.kill();
await gone; // 다음 시험이 같은 포트를 바로 쓸 수 있게 서버가 내려갈 때까지
process.exit(0);
