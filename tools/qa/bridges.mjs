// 다리 길목 — node tools/qa/bridges.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=그림 폴더)
// 사용자 2026-11-08 「산문 건너 개울 다리를 건널 때 난간 옆으로 빠져 물가로 내려간다 — 난간을 다리보다 길게, 다리 전체에」
// 석교(숲길)·작은 나무다리(서쪽 산책로)·징검다리(동쪽 산책로) 각각:
//   1. 한쪽 날개 밖에서 반대쪽 날개 밖까지 곧게 걸어 건너는가
//   2. 다리 가운데·다리 끝·날개 가운데·날개 끝에서 옆으로 3m 밀어도 길목 안에 남고 높이가 떨어지지 않는가 (예전: 다리 끝에서 옆 1~2m 가 0.4~1.2m 낮은 물가)
//   3. 위에서 비스듬히 본 그림 bridge-<id>.png (날개 난간)
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.';
const browser = await launch();
let fail = 0;
const check = (ok, line) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};
try {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 640 }, locale: 'ko-KR' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const lanes = await page.evaluate(async () => (await import('./src/world/layout.js')).bridgeLanes().map((l) => ({ ...l })));
  for (const l of lanes) {
    const r = await page.evaluate(async (l) => {
      const t = window.temple, { walkHeight, BRIDGE_WING } = await import('./src/world/layout.js');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const walk = async (fx, fz, tx, tz, ms) => {
        t._place(fx, fz, 0);
        await sleep(250);
        let done = false;
        t.avatars.moveTo(tx, tz, () => (done = true));
        const t0 = performance.now();
        while (!done && performance.now() - t0 < ms) await sleep(50);
        t.avatars.moveTarget = null;
        const p = t.player.root.position;
        return { x: p.x, z: p.z, y: p.y };
      };
      const out = {};
      // 1. 건너기
      const a = l.z0 - BRIDGE_WING - 1, b = l.z1 + BRIDGE_WING + 1;
      const end = await walk(l.x, a, l.x, b, 20000);
      out.cross = { ok: Math.abs(end.z - b) < 0.3, left: +Math.abs(end.z - b).toFixed(2) };
      // 2. 옆으로 밀기
      const half = (z) => {
        const tt = z < l.z0 ? (l.z0 - z) / BRIDGE_WING : z > l.z1 ? (z - l.z1) / BRIDGE_WING : 0;
        return l.inner + (l.outer - l.inner) * tt;
      };
      const zs = { 다리가운데: (l.z0 + l.z1) / 2, 다리끝안쪽: l.z1 - 0.4, 날개가운데: l.z1 + BRIDGE_WING / 2, 날개끝: l.z1 + BRIDGE_WING - 0.1, 반대끝안쪽: l.z0 + 0.4 };
      out.push = [];
      for (const [name, z] of Object.entries(zs)) {
        for (const sx of [-1, 1]) {
          const y0 = walkHeight(l.x, z);
          const p = await walk(l.x, z, l.x + sx * 3, z, 1800);
          const off = Math.abs(p.x - l.x);
          out.push.push({ name, sx, ok: off <= half(z) + 0.05 && p.y > y0 - 0.15, off: +off.toFixed(2), half: +half(z).toFixed(2), drop: +(y0 - p.y).toFixed(2) });
        }
      }
      return out;
    }, l);
    check(r.cross.ok, `${l.id}: 날개 밖에서 반대쪽 날개 밖까지 건넘 (남은 ${r.cross.left}m)`);
    for (const p of r.push) check(p.ok, `${l.id}: ${p.name} 에서 ${p.sx < 0 ? '서' : '동'}쪽으로 3m 밀기 → 길목 가운데서 ${p.off}m (허용 ${p.half}m), 높이 내려감 ${p.drop}m`);
    // 3. 그림: 다리 끝 너머 비스듬히 위에서
    await page.evaluate(async (l) => {
      const t = window.temple, W = t.world, { walkHeight, BRIDGE_WING } = await import('./src/world/layout.js');
      t._loop = () => {};
      W.timeMode = 'fixed'; W.hour = W.hourTarget = 13; W.applyEnv(true);
      t.avatars.teleport(l.x, l.z1 + BRIDGE_WING + 0.8, Math.PI);
      for (let i = 0; i < 3; i++) t._frame(1 / 30, 100 + i / 30);
      const cam = W.camera, fz = l.z1 + 1.0, fy = walkHeight(l.x, fz);
      cam.up.set(0, 1, 0);
      cam.position.set(l.x + 5.5, fy + 4.2, l.z1 + BRIDGE_WING + 5.5);
      cam.lookAt(l.x, fy, (l.z0 + l.z1) / 2 + 2);
      cam.updateMatrixWorld();
      W.composer.render();
    }, l);
    await page.locator('#scene canvas').first().screenshot({ path: `${OUT}/bridge-${l.id}.png` });
    await page.evaluate(() => { const t = window.temple; delete t._loop; t._loop(); }); // 본 루프 다시
  }
  console.log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
} finally {
  await browser.close();
}
console.log(fail ? `FAIL (${fail})` : 'bridges PASS');
