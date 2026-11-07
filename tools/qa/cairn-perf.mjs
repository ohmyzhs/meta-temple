// 돌탑 그리기 비용 — node tools/qa/cairn-perf.mjs [low|high]   (python3 .claude/devserver.py 8098, BASE=http://localhost:8098)
// 폰 비슷하게: 390×844, 터치, CPU 4배 느리게. 실서버 옛 돌탑 12개 + 길가 돌탑을 꽉 채운(탑 36·층 12) 경우에서
// 그리기 호출·삼각형(renderer.info), 한 프레임(_frame, 그리기 포함) 중앙값, 길가 옮기기(roadsideList) 300개 시간.
// 바뀌기 전 코드에도 그대로 돌릴 수 있게 새 함수가 없으면 건너뛴다.
import { launch, BASE } from './lib.mjs';

const Q = process.argv[2] || 'low';
const LIVE = [[0, 35.1, 12], [-4.91, 8.6, 2], [0, 33.1, 4], [-3.29, 34.62, 1], [4.64, 6.59, 1], [0.57, 30.79, 4], [1.64, 34.58, 1], [0.93, 26.08, 1], [2.86, 28.62, 1], [5.87, -50.05, 2], [25.3, 55.55, 1], [0.77, 44.66, 1]];
const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  await ctx.addInitScript(() => {
    let s = 1234567;
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    window.TEMPLE_CONFIG = { liveUrl: 'http://127.0.0.1:59999' };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=${Q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector('#intro-enter').click());
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 120000 });
  await page.waitForFunction(() => !window.temple.world.outdoorReady || window.temple.world.outdoorReady.done, null, { timeout: 120000 });
  await page.waitForFunction(() => !window.temple.world.precinctReady || window.temple.world.precinctReady.done, null, { timeout: 120000 }).catch(() => {});
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const res = await page.evaluate(async (live) => {
    const t = window.temple, W = t.world;
    t._loop = () => {};
    W.setTimeOfDay('day');
    W.hour = W.hourTarget;
    W.applyEnv(true);
    const list = live.map(([x, z, n], i) => ({ id: `c_${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`, x, z, n }));
    const measure = (label, cairns) => {
      t.temple.cairns.setCairns(cairns);
      t.avatars.teleport(0.5, 39, Math.PI);
      let tt = 100;
      for (let i = 0; i < 30; i++) t._frame(1 / 30, (tt += 1 / 30));
      const ms = [];
      for (let i = 0; i < 90; i++) {
        const a = performance.now();
        t._frame(1 / 30, (tt += 1 / 30));
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      const I = W.renderer.info; // 후처리까지 한 프레임 전체를 센다
      I.autoReset = false;
      I.reset();
      t._frame(1 / 30, (tt += 1 / 30));
      const calls = I.render.calls, triangles = I.render.triangles;
      I.autoReset = true;
      const m = t.temple.cairns.mesh;
      return { label, frameMedianMs: +ms[45].toFixed(1), frameP90Ms: +ms[81].toFixed(1), calls, triangles, cairnInstances: m.count, cairnTrisPerStone: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 };
    };
    const out = [measure('live12', list)];
    // 꽉 찬 경우: 스폰 둘레 길가에 탑 36개 × 12층 (보이는 상한)
    const full = [];
    for (let i = 0; i < 36; i++) full.push({ id: `c_${String(100 + i).padStart(8, '0')}-0000-0000-0000-000000000000`, x: (i % 2 ? 3.4 : -4.2) + (i % 4) * 0.3, z: 20 + i * 0.75, n: 12 });
    out.push(measure('full36x12', full));
    let rl = null;
    const C = await import('./src/core/cairns.js');
    if (C.roadsideList) {
      const { ROADSIDE_GEO } = await import('./src/core/roadsideGeo.js');
      const { trail } = await import('./src/world/trail.js');
      const many = [];
      for (let i = 0; i < 300; i++) {
        const p = trail.at((i * 1.57) % trail.length);
        many.push({ id: `c_${String(1000 + i).padStart(8, '0')}-0000-0000-0000-000000000000`, x: p.x + ((i % 5) - 2) * 0.4, z: p.z + ((i % 3) - 1) * 0.4, n: 1 }); // 모두 길 위 (가장 나쁜 경우)
      }
      const a = performance.now();
      const moved = C.roadsideList(many, ROADSIDE_GEO);
      rl = { cairns: 300, allOnPath: true, ms: +(performance.now() - a).toFixed(0), moved: moved.filter((c, i) => c.x !== many[i].x || c.z !== many[i].z).length };
    }
    return { q: new URLSearchParams(location.search).get('q'), runs: out, roadsideList300: rl };
  }, LIVE);
  console.log(JSON.stringify({ ...res, cpuThrottle: 4, errors }, null, 1));
} finally {
  await browser.close();
}
