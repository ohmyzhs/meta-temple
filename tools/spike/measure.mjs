// 에셋 스파이크 측정 — spike.html 의 네 화면(법당·마당 × 낮·밤)을 두 뷰포트에서 스크린샷 + 성능.
// Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/spike/measure.mjs' }
// 서버: python3 .claude/devserver.py 8083. 지금 화면 기준선은 tools/spike/baseline.mjs.
// 성능: fps(rAF 5초, 디스플레이 주사율이 상한) + syncMs(한 프레임 그리기 + 1px readPixels 중앙값) + 그리기 호출·삼각형.
//       390×844 는 CPU 4배 감속(CDP)도 한 번 더 잰다 — GPU 는 감속되지 않으므로 폰 성능의 대용이 아니다.
async (page) => {
  const OUT = '.playwright-mcp/spike'; // MCP 작업 폴더 기준 (gitignore). compare.py 가 읽는다
  const runs = [
    { w: 1280, h: 800, q: 'desktop', throttle: 1, dpr: 1 },
    { w: 390, h: 844, q: 'phone', throttle: 1, dpr: 1 },
    { w: 390, h: 844, q: 'phone', throttle: 4, dpr: 1 },
    { w: 390, h: 844, q: 'phone', throttle: 1, dpr: 2 } // 실제 폰처럼 픽셀 4배 (spike.js 는 DPR 2 까지)
  ];
  const res = [];
  const browser = page.context().browser();
  for (const r of runs) {
    const ctx = await browser.newContext({ viewport: { width: r.w, height: r.h }, deviceScaleFactor: r.dpr });
    page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(`http://localhost:8083/spike.html?hud=0&q=${r.q}`);
    await page.waitForFunction(() => window.__spike, null, { timeout: 120000 });
    const stats = await page.evaluate(() => window.__spike.stats());
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: r.throttle });
    for (const view of ['hall', 'court']) for (const time of ['day', 'night']) {
      await page.evaluate(([view, time]) => window.__spike.set({ view, time }), [view, time]);
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => window.__spike.measure(5));
      if (r.throttle === 1 && r.dpr === 1) await page.screenshot({ path: `${OUT}/spike-${view}-${time}-${r.w}x${r.h}.png` });
      res.push({ view: `${r.w}x${r.h}`, dpr: r.dpr, cpuThrottle: r.throttle, shot: view, time, ...m });
    }
    res.push({ view: `${r.w}x${r.h}`, dpr: r.dpr, cpuThrottle: r.throttle, ...stats });
    await ctx.close();
  }
  return JSON.stringify(res, null, 1);
}
