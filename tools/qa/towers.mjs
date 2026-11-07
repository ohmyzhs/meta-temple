// 연등탑 배치 검사 — node tools/qa/towers.mjs   (먼저 python3 .claude/devserver.py 8093 → BASE=http://localhost:8093)
// 탑 자리는 길 데이터에서 런타임에 고른다 (lanternTowers.js). 길이 옮겨져도 지켜야 할 것:
//   탑 ≥ 15개 · 산책로·갈림길 걷는 띠(중심선에서 TRAIL_HALF+0.3m) 밖 · 탑끼리 7m 이상 · 들어서는 자리 4.5m 비움 · 일주문 연등·점광원 있음
import { launch, BASE } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter'); // 누름은 바로 받고 산사 짓기를 기다렸다 들어간다
  await page.waitForFunction(() => window.temple.entered && window.temple.world.towers, null, { timeout: 120000 });
  const r = await page.evaluate(async () => {
    const { PATHS, TRAIL_HALF } = await import('/src/world/trail.js');
    const { L } = await import('/src/world/layout.js');
    const T = window.temple.world.towers;
    const s = T.sites;
    let minGap = Infinity, inBand = [];
    s.forEach((a, i) => {
      s.forEach((b, j) => j > i && (minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z))));
      const d = Math.min(...PATHS.map((P) => P.nearest(a.x, a.z)?.d ?? 99));
      if (d < TRAIL_HALF + 0.3) inBand.push([+a.x.toFixed(1), +a.z.toFixed(1), +d.toFixed(2)]);
    });
    const spawn = Math.min(...s.map((a) => Math.hypot(a.x - L.spawn.x, a.z - L.spawn.z)));
    return { n: s.length, minGap: +minGap.toFixed(2), inBand, spawn: +spawn.toFixed(2), lights: T.lights.length };
  });
  check('탑 ≥ 15개', r.n >= 15, `${r.n}개`);
  check('걷는 띠 밖', r.inBand.length === 0, JSON.stringify(r.inBand));
  check('탑끼리 7m 이상', r.minGap >= 7, `최소 ${r.minGap}m`);
  check('들어서는 자리 4.5m 비움', r.spawn >= 4.5, `${r.spawn}m`);
  check('점광원 1~2개', r.lights >= 1 && r.lights <= 2, `${r.lights}개`);
  check('페이지 오류 없음', errors.length === 0, errors.slice(0, 2).join(' / '));
} finally {
  await browser.close();
}
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
