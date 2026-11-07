// 화질 단계 자동 전환 (core/qualityTier.js + world/renderTier.js) — node tools/qa/quality-tier.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=그림 폴더)
// 412×915 모바일, 기기 배율 2.625 (갤럭시급: low 배율 상한 1.25, high 1.75)
//   A. ?q 없이: 첫 판정 low → 실사 질감이 다 받아지고 프레임이 넉넉하면 high, 배율이 0.25씩 1.75 까지 오르는지 (시각·frame ms 기록)
//      - 바꾸는 순간 셰이더를 다시 짓지 않는지 (renderer.info.programs 수), 앞뒤 프레임 밝기가 튀지 않는지 (검은 프레임·깜빡임)
//      - readPixels 로 GPU 까지 기다린 한 프레임 ms·그리기 호출·삼각형: low 단계 vs 올린 high 단계 (같은 자리)
//      - CPU 8배 느리게 → 배율을 내리고 1.25 에서도 느리면 low 로, 풀어도 2분은 다시 안 올리는지
//   B. ?q=low: 단계가 고정인지 (배율 자동 조절은 그대로)
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.';
const WAIT_UP = +(process.env.WAIT_UP || 90000);
const browser = await launch();
const log = (s) => console.log(s);
const open = async (q) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/${q ? `?q=${q}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  // 매 프레임: 시각·단계·배율·작은 캔버스 평균 밝기 (깜빡임 보기) — drawImage 32×70 이라 1ms 안
  await page.evaluate(() => {
    const t = window.temple, W = t.world, c = document.createElement('canvas');
    c.width = 32; c.height = 70;
    const g = c.getContext('2d', { willReadFrequently: true });
    const F = (window.__qt = { frames: [], t0: performance.now(), ready: {} });
    const render = W.render.bind(W);
    W.render = () => {
      render();
      g.drawImage(W.renderer.domElement, 0, 0, 32, 70);
      const d = g.getImageData(0, 0, 32, 70).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const now = performance.now() - F.t0;
      F.frames.push([Math.round(now), +(s / (d.length / 4)).toFixed(1), t.tier.tier, W.pixelRatio, W.renderer.info.programs.length]);
      if (F.frames.length > 12000) F.frames.splice(0, 2000);
      for (const k of ['precinctReady', 'outdoorReady']) if (W[k]?.done && F.ready[k] == null) F.ready[k] = Math.round(now);
    };
  });
  return { ctx, page, errors };
};
const state = (page) => page.evaluate(() => {
  const t = window.temple, F = window.__qt;
  return { t: Math.round(performance.now() - F.t0), tier: t.tier.tier, pr: t.world.pixelRatio, cap: t._adapt?.start, ms: t.frameMs && +t.frameMs.toFixed(1), ready: F.ready, programs: t.world.renderer.info.programs.length, noUpIn: Math.round(t.tier.noUpUntil - performance.now()), downs: t.tier.downs, forced: t.tier.forced };
});
// 바뀐 순간(단계·배율)마다 앞뒤 10프레임의 밝기 튐(이웃 중앙값과의 가장 큰 차), 셰이더 수, 앞뒤 3프레임 사이 가장 긴 틈(멈칫)
const changes = (page) => page.evaluate(() => {
  const fr = window.__qt.frames, out = [];
  for (let i = 1; i < fr.length; i++) {
    if (fr[i][2] === fr[i - 1][2] && fr[i][3] === fr[i - 1][3]) continue;
    const win = fr.slice(Math.max(0, i - 10), i + 10).map((f) => f[1]);
    const med = [...win].sort((a, b) => a - b)[win.length >> 1];
    const near = fr.slice(Math.max(1, i - 3), i + 4);
    const gap = Math.max(...near.map((f) => f[0] - fr[fr.indexOf(f) - 1][0]));
    out.push({ gap, t: fr[i][0], to: `${fr[i][2]} pr ${fr[i][3]}`, from: `${fr[i - 1][2]} pr ${fr[i - 1][3]}`, lumaJump: +Math.max(...win.map((l) => Math.abs(l - med))).toFixed(1), programs: `${fr[i - 1][4]}→${fr[Math.min(fr.length - 1, i + 5)][4]}` });
  }
  return out;
});
// 같은 자리에서 루프를 멈추고 한 프레임을 readPixels 로 끝까지 기다린 ms (40번 중앙값) + 그리기 호출·삼각형
const bench = (page) => page.evaluate(() => {
  const t = window.temple, R = t.world.renderer, gl = R.getContext(), px = new Uint8Array(4), ms = [];
  let clock = 500;
  R.info.autoReset = false;
  for (let i = 0; i < 40; i++) {
    R.info.reset();
    const a = performance.now();
    t._frame(1 / 60, (clock += 1 / 60));
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ms.push(performance.now() - a);
  }
  R.info.autoReset = true;
  ms.sort((p, q) => p - q);
  return { ms: +ms[20].toFixed(2), calls: R.info.render.calls, ktris: Math.round(R.info.render.triangles / 1000) };
});

try {
  // A
  {
    const { ctx, page, errors } = await open('');
    const s0 = await state(page);
    log(`A. 첫 판정 ${s0.tier} (forced ${s0.forced}), 배율 ${s0.pr}`);
    await page.evaluate(() => {
      const W = window.temple.world;
      W.timeMode = 'fixed';
      W.hour = W.hourTarget = 13;
      W.applyEnv(true);
    });
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < WAIT_UP) {
      await page.waitForTimeout(1000);
      s = await state(page);
      if (s.tier === 'high' && s.pr >= 1.75) break;
    }
    log(`   ${(s.t / 1000).toFixed(1)}초: 단계 ${s.tier} 배율 ${s.pr} (상한 ${s.cap}) frame ${s.ms}ms · 실사 질감 다 받음 precinct ${s.ready.precinctReady}ms outdoor ${s.ready.outdoorReady}ms`);
    for (const c of await changes(page)) log(`   ${(c.t / 1000).toFixed(1)}초 ${c.from} → ${c.to} · 앞뒤 밝기 튐 ${c.lumaJump} · 셰이더 ${c.programs} · 앞뒤 프레임 틈 최대 ${c.gap}ms`);
    await page.screenshot({ path: `${OUT}/tier-high.png` });
    const hi = await bench(page);
    // 같은 자리 low 로 견주기 (재고 나서 되돌린다)
    const lo = await page.evaluate(async () => {
      const { applyRenderTier } = await import('./src/world/renderTier.js');
      const W = window.temple.world, pr = W.pixelRatio;
      applyRenderTier(W, 'low');
      W.setPixelRatio(1.25);
      return pr;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/tier-low.png` });
    const lb = await bench(page);
    await page.evaluate(async (pr) => {
      const { applyRenderTier } = await import('./src/world/renderTier.js');
      const W = window.temple.world;
      applyRenderTier(W, 'high');
      W.setPixelRatio(pr);
    }, lo);
    log(`   한 프레임(readPixels 까지): low 단계·배율 1.25 → ${lb.ms}ms, ${lb.calls} calls, ${lb.ktris}k tri | high 단계·배율 ${lo} → ${hi.ms}ms, ${hi.calls} calls, ${hi.ktris}k tri`);

    // 느려지면 내리기
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
    const mark = (await state(page)).t;
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      await page.waitForTimeout(1000);
      s = await state(page);
      if (s.tier === 'low') break;
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    log(`   CPU×8: ${((s.t - mark) / 1000).toFixed(1)}초 뒤 단계 ${s.tier} 배율 ${s.pr} frame ${s.ms}ms · 다시 올리기까지 ${(s.noUpIn / 1000).toFixed(0)}초 (내린 횟수 ${s.downs})`);
    for (const c of (await changes(page)).filter((c) => c.t > mark)) log(`   ${(c.t / 1000).toFixed(1)}초 ${c.from} → ${c.to} · 앞뒤 밝기 튐 ${c.lumaJump} · 셰이더 ${c.programs} · 앞뒤 프레임 틈 최대 ${c.gap}ms`);
    await page.waitForTimeout(25000);
    s = await state(page);
    log(`   풀고 25초 뒤: 단계 ${s.tier} 배율 ${s.pr} frame ${s.ms}ms (2분 안에는 low 그대로여야)`);
    log(`   pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
    await ctx.close();
  }
  // B
  {
    const { ctx, page, errors } = await open('low');
    await page.waitForTimeout(30000);
    const s = await state(page);
    log(`B. ?q=low 30초 뒤: 단계 ${s.tier} (forced ${s.forced}) 배율 ${s.pr} frame ${s.ms}ms · 바뀐 순간: ${JSON.stringify((await changes(page)).map((c) => c.to))}`);
    log(`   pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
