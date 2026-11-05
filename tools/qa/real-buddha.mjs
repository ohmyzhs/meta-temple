// 실사 세계 — 불상 사진 판·후불벽 사진 판 검사: 법당 안 낮·밤·폰, 판이 절차적 불상 자리에 맞는지 (계획: docs/superpowers/plans/2026-11-05-launch-stage3-real.md)
// Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/real-buddha.mjs' }   서버: python3 .claude/devserver.py 8083
async (page) => {
  const OUT = '.playwright-mcp/real';
  const res = {};
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:8083/?q=high&world=real');
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
    await page.evaluate(async () => {
      document.querySelector('#intro-enter').click();
      await new Promise((r) => setTimeout(r, 1200));
      window.temple.avatars.solo = true;
      window.temple.avatars.teleport(1.5, -20.8, Math.PI); // 법당 문턱
    });
    await page.waitForFunction(() => ['buddha', 'bodhiL', 'bodhiR', 'wallC', 'wallL', 'wallR'].every((k) => { const s = window.temple.world.real?.state.get(k); return s?.isObject3D || s === 'failed'; }), null, { timeout: 60000 });
    res[`${w}x${h}`] = await page.evaluate(() => Object.fromEntries(['buddha', 'bodhiL', 'bodhiR', 'wallC', 'wallL', 'wallR'].map((k) => {
      const s = window.temple.world.real.state.get(k);
      return [k, s?.isObject3D ? { w: +s.geometry.parameters.width.toFixed(2), h: +s.geometry.parameters.height.toFixed(2), pos: s.position.toArray().map((v) => +v.toFixed(2)) } : s];
    })));
    for (const hour of [13, 0]) {
      for (const s of [{ n: 'hall', pos: [1.2, 4.7, -21.0], look: [0, 4.2, -28.4] }, { n: 'side', pos: [-5.5, 4.6, -23.5], look: [1.0, 5.2, -29.2] }]) {
        await page.evaluate(async ([hour, s]) => {
          const t = window.temple, W = t.world, THREE = await import('three');
          W.timeMode = 'fixed'; W.hour = W.hourTarget = hour; W.setWeather('clear'); W.applyEnv(true);
          W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
          document.querySelector('#hud').style.opacity = 0;
          document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
          document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
        }, [hour, s]);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/buddha-${s.n}-${String(hour).padStart(2, '0')}h-${w}x${h}.png` });
      }
    }
  }
  return JSON.stringify(res, null, 1);
}
