// 산책로 걷기·쉼터·평탄 부지 검사 — node tools/qa/trail-walk.mjs   (먼저 python3 .claude/devserver.py 8092, BASE=)
// (1) 자동 산책으로 고리 한 바퀴: 막힘(5초 넘게 1m 도 못 감) 없이 끝까지, 걸린 시간(1.1m/s 가정 대비)
// (2) 쉼터마다 앉기: 앉음 상태·앉은 높이가 자리 높이와 0.05m 안, 일어선 자리가 걸을 수 있는 땅
// (3) 평탄 부지: 한가운데가 걸을 수 있고 평평(사방 2m 높이 차 0.05m 안), 울타리 입구에서 한가운데까지 걸을 수 있는 땅으로 이어짐,
//     부지 안에 나무·바위·충돌체 없음
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (n, ok, x = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
try {
  const { page, errors } = await enter(browser, [1280, 800]);
  await page.evaluate(() => (window.temple._loop = () => {}));
  // (1) 자동 산책 한 바퀴
  const walk = await page.evaluate(async () => {
    const t = window.temple;
    const { loop } = await import('./src/world/trail.js');
    const a = loop.at(6), b = loop.at(7); // 시작 J1 은 고리 끝과 같은 자리라 6m 들어가서 시작한다
    t.avatars.teleport(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z));
    for (let i = 0; i < 5; i++) t._frame(1 / 30, i / 30);
    t._toggleStroll();
    const dt = 1 / 15;
    let clock = 10, best = 6, lastGain = 10, stalls = [], lapped = false, maxSink = 0;
    const { walkHeight } = await import('./src/world/layout.js');
    for (let k = 0; k < 15 * 900 && !lapped; k++) {
      t._frame(dt, (clock += dt));
      const p = t.player.root.position, n = loop.nearest(p.x, p.z);
      maxSink = Math.max(maxSink, Math.abs(p.y - walkHeight(p.x, p.z)));
      if (n && n.s > best + 1 && n.s < best + 20) { best = n.s; lastGain = clock; } // 고리 끝(=시작 J1)으로 건너뛰지 않게
      if (clock - lastGain > 5) { stalls.push({ s: Math.round(best), x: +p.x.toFixed(1), z: +p.z.toFixed(1) }); lastGain = clock; }
      if (best > loop.length - 6) lapped = true; // 끝(J1)에 닿으면 자동 산책이 다음 바퀴로 넘어간다
      if (!t._stroll && !lapped) { stalls.push({ s: Math.round(best), stopped: true }); break; }
    }
    return { length: +loop.length.toFixed(1), best: Math.round(best), lapped, sec: Math.round(clock - 10), stalls, maxSink: +maxSink.toFixed(3) };
  });
  check(`자동 산책 한 바퀴 (${walk.length}m, 걸린 시간 ${walk.sec}초 = ${(walk.sec / 60).toFixed(1)}분)`, walk.lapped && !walk.stalls.length, `간 데까지 ${walk.best}m · 막힘 ${JSON.stringify(walk.stalls)}`);
  check('걷는 동안 발이 땅에서 뜨거나 묻히지 않음 (걷는 높이와 차 0.05m 안)', walk.maxSink < 0.05, `최대 ${walk.maxSink}m`);

  // (2) 쉼터마다 앉기
  const rests = await page.evaluate(async () => {
    const t = window.temple;
    const { isWalkable } = await import('./src/world/layout.js');
    const out = [];
    let clock = 2000;
    for (const s of t.temple.trail.spots) {
      if (t.player.sitting) t.avatars.standUp();
      for (let i = 0; i < 20; i++) t._frame(1 / 30, (clock += 1 / 30));
      t.avatars.teleport(s.stand.x, s.stand.z, s.ry);
      t._sitRest(s);
      for (let i = 0; i < 300 && !t.player.sitting; i++) t._frame(1 / 30, (clock += 1 / 30));
      for (let i = 0; i < 20; i++) t._frame(1 / 30, (clock += 1 / 30));
      const p = t.player.root.position, seat = t.player.seat;
      const r = { id: s.id, sitting: t.player.sitting, dy: seat ? +(p.y - seat.y).toFixed(3) : null };
      t.avatars.standUp();
      for (let i = 0; i < 60; i++) t._frame(1 / 30, (clock += 1 / 30));
      const q = t.player.root.position;
      r.standOk = isWalkable(q.x, q.z);
      out.push(r);
    }
    return out;
  });
  for (const r of rests) check(`쉼터 ${r.id} 앉기·일어서기`, r.sitting && Math.abs(r.dy) < 0.05 && r.standOk, JSON.stringify(r));

  // (3) 평탄 부지
  const sites = await page.evaluate(async () => {
    const { L, isWalkable, terrainHeight, collidersNear } = await import('./src/world/layout.js');
    const { PATHS } = await import('./src/world/trail.js');
    const sp = window.temple.world.veg?.spots;
    return L.sites.map((st) => {
      const hs = [];
      for (let x = st.x - st.w / 2; x <= st.x + st.w / 2 + 1e-6; x += 1) for (let z = st.z - st.d / 2; z <= st.z + st.d / 2 + 1e-6; z += 1) hs.push(terrainHeight(x, z));
      let gate = null;
      for (const P of PATHS) for (const q of P.pts) if (!gate || Math.hypot(q.x - st.x, q.z - st.z) < Math.hypot(gate.x - st.x, gate.z - st.z)) gate = q;
      let open = true;
      for (let u = 0; u <= 1; u += 0.02) if (!isWalkable(gate.x + (st.x - gate.x) * u, gate.z + (st.z - gate.z) * u)) open = false;
      let cols = 0;
      for (let x = st.x - st.w / 2; x <= st.x + st.w / 2; x += 1) for (let z = st.z - st.d / 2; z <= st.z + st.d / 2; z += 1) {
        cols += collidersNear(x, z).filter((c) => (c.type === 'c' ? Math.hypot(c.x - x, c.z - z) < c.r : x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1)).length;
      }
      const trees = sp ? Object.values(sp).flat().filter(([x, z]) => Math.abs(x - st.x) <= st.w / 2 && Math.abs(z - st.z) <= st.d / 2).length : null;
      return { id: st.id, walk: isWalkable(st.x, st.z), flat: +(Math.max(...hs) - Math.min(...hs)).toFixed(3), y: +terrainHeight(st.x, st.z).toFixed(2), open, cols, trees };
    });
  });
  for (const s of sites) check(`평탄 부지 ${s.id}`, s.walk && s.flat < 0.05 && s.open && !s.cols && !s.trees, JSON.stringify(s));
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
