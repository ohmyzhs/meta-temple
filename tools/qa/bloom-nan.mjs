// 블룸 NaN·Inf 번짐 검사 — node tools/qa/bloom-nan.mjs   (먼저 python3 .claude/devserver.py 8081, 다른 서버는 BASE=)
// 사용자 2026-11-06 (갤럭시 폴드): 탑돌이 중 화면 한쪽에 검은 직사각형이 번쩍, 시간대를 바꾼 뒤 마당·박석이 계단 모양으로 검게.
// 폰 GPU 에서 반사광 한 점이 half float(65504)를 넘거나(Inf) NaN 이 되면 블룸의 작은 해상도 흐림이 그 점을 화면에 정렬된
// 검은 네모로 번지게 한다. 데스크톱 GPU 에서는 그런 값이 잘 안 나오므로 박석 재질의 발광색에 일부러 Inf(1e6)·NaN 을 넣어 본다.
// 기준 (법당 안에서 마당을 내다보는 구도, 화면 64×64 표본):
//   보통 화면의 검은 점 비율 = 기준선, Inf 를 넣어도 기준선 + 3% 안, NaN 을 넣어도 기준선 + 15% 안 (박석 자체만 검고 번지지 않음)
import { launch, BASE } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => window.temple.entered && window.temple.avatars, null, { timeout: 120000 }); // 누름은 바로 받고 산사 짓기를 기다렸다 들어간다
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const t = window.temple;
    t.world.setTimeOfDay('day');
    t.travelTo('DAEUNGJEON');
  });
  await page.waitForTimeout(6000);
  const measure = (kind) =>
    page.evaluate(async (kind) => {
      const t = window.temple, W = t.world;
      t._loop = () => {};
      t.avatars.teleport(1.5, -21.5, 0);
      W.cam.yaw = Math.PI + 0.35;
      const v = kind === 'nan' ? NaN : kind === 'inf' ? 1e6 : 0;
      W.scene.traverse((o) => {
        if (o.isInstancedMesh && o.count > 100 && o.material?.normalMap && o.material.emissive) o.material.emissive.setRGB(v, v, v);
      });
      let clock = 200;
      for (let i = 0; i < 40; i++) t._frame(1 / 30, (clock += 1 / 30));
      const gl = W.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
      let black = 0, n = 0;
      t._frame(1 / 30, (clock += 1 / 30)); // 같은 작업 안에서 바로 읽는다 (preserveDrawingBuffer 없이도)
      for (let gy = 4; gy < 60; gy++)
        for (let gx = 0; gx < 64; gx++) {
          gl.readPixels(Math.floor(((gx + 0.5) / 64) * w), Math.floor(((gy + 0.5) / 64) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          n++;
          if (px[0] + px[1] + px[2] < 24) black++;
        }
      return black / n;
    }, kind);
  const base = await measure('none');
  const inf = await measure('inf');
  const nan = await measure('nan');
  await measure('none');
  check('보통 화면 검은 점 (기준선)', base < 0.15, `${(base * 100).toFixed(1)}%`);
  check('Inf 를 넣어도 검은 네모로 번지지 않음', inf <= base + 0.03, `${(inf * 100).toFixed(1)}%`);
  check('NaN 을 넣어도 박석만 검고 번지지 않음', nan <= base + 0.15, `${(nan * 100).toFixed(1)}%`);
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
