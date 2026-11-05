// 실사 세계 R2 검사 — 마당 석탑이 스캔으로 바뀌는지, 탑돌이가 기단에 걸리지 않는지 (계획: docs/superpowers/plans/2026-11-05-launch-stage3-real.md)
// Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/real-pagoda.mjs' }   서버: python3 .claude/devserver.py 8083
// 출력: 교체까지 걸린 시간, 받은 용량, 시간대별 스크린샷(.playwright-mcp/real/), 탑돌이 표본 중 기단(+몸 반경)에 들어간 수
async (page) => {
  const OUT = '.playwright-mcp/real';
  const res = {};
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:8083/?q=high&world=real');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.temple;
    t.avatars.solo = true;
    t.avatars.teleport(5.2, 4.4, Math.PI); // 마당 앞 — 석탑까지 약 10m
    window.__t0 = performance.now();
  });
  await page.waitForFunction(() => window.temple.world.real?.state.get('pagoda')?.isObject3D || window.temple.world.real?.state.get('pagoda') === 'failed', null, { timeout: 60000 });
  res.swap = await page.evaluate(() => {
    const W = window.temple.world, s = W.real.state.get('pagoda');
    const e = performance.getEntriesByType('resource').find((x) => x.name.includes('assets/world/pagoda'));
    return { ok: s?.isObject3D === true, ms: Math.round(performance.now() - window.__t0), bytes: e?.encodedBodySize ?? null };
  });
  const SHOTS = [
    { name: 'courtyard', pos: [5.0, 2.1, 2.6], look: [1, 6.5, -16] },
    { name: 'close', pos: [7.5, 2.0, 4.5], look: [0, 4.0, -5] }
  ];
  for (const hour of [13, 6.4, 18.0, 0]) {
    for (const s of SHOTS) {
      await page.evaluate(async ([hour, s]) => {
        const t = window.temple, W = t.world, THREE = await import('three');
        W.timeMode = 'fixed';
        W.hour = W.hourTarget = hour;
        W.setWeather('clear');
        W.weather.rainU.uAmount.value = 0;
        W.weather.snowU.uAmount.value = 0;
        W.wet = W.snow = 0;
        W.applyEnv(true);
        W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
        document.querySelector('#hud').style.opacity = 0;
        document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
        document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
      }, [hour, s]);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/pagoda-${s.name}-${String(hour).replace('.', '_')}h.png` });
    }
  }
  // 탑돌이: 내 아바타를 한 바퀴 돌리며 위치를 표본 — 기단 반폭(+몸 0.32m) 사각형 안에 들어간 표본 수
  res.tapdori = await page.evaluate(async () => {
    const t = window.temple, W = t.world;
    W.setShot(null);
    const { SLOTS } = await import('/src/world/real/realWorld.js');
    const { L } = await import('/src/world/layout.js');
    const s = SLOTS.pagoda, h = s.half * s.scale + 0.32;
    t.avatars.teleport(L.pagoda.x + 4.6, L.pagoda.z, Math.PI);
    t.avatars.triggerAction('circumambulate');
    let n = 0, inside = 0, minR = 99;
    const p = t.avatars.player.root.position;
    await new Promise((done) => {
      const t0 = performance.now();
      const tick = () => {
        const dx = p.x - L.pagoda.x, dz = p.z - L.pagoda.z;
        n++;
        minR = Math.min(minR, Math.hypot(dx, dz));
        if (Math.abs(dx) < h && Math.abs(dz) < h) inside++;
        if (performance.now() - t0 < 32000) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { samples: n, insideBase: inside, minRadius: +minR.toFixed(2), baseHalfPlusBody: +h.toFixed(2), loops: t.avatars.circling?.loops ?? null };
  });
  return JSON.stringify(res, null, 1);
}
