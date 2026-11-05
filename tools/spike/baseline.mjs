// 에셋 스파이크 비교용 — 지금 화면(web/index.html) 스크린샷·fps 기준선.
// Playwright MCP 로 실행: browser_run_code_unsafe { filename: '<repo>/tools/spike/baseline.mjs' }
// 서버: python3 .claude/devserver.py 8083. 결과 PNG 는 OUT, 수치는 반환값.
// 구도는 묶음 C 의 tools/qa/night.mjs 와 같은 마당·법당 안 구도를 쓴다.
async (page) => {
  const OUT = '.playwright-mcp/spike'; // MCP 작업 폴더 기준 (gitignore). compare.py 가 읽는다
  const SHOTS = [
    { name: 'courtyard', player: [5.2, 4.4], pos: [5.0, 2.1, 2.6], look: [1, 6.5, -16] },
    { name: 'hall', player: [1.5, -20.8], pos: [1.2, 4.7, -21.0], look: [0, 4.2, -28.4] }
  ];
  const VIEWS = [[1280, 800, 1], [390, 844, 1], [390, 844, 4]]; // 마지막: CPU 4배 감속(CDP) — measure.mjs 와 같은 조건
  const cdp = await page.context().newCDPSession(page);
  const results = [];
  for (const [w, h, thr] of VIEWS) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:8083/?q=high');
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
    const gpu = await page.evaluate(async () => {
      document.querySelector('#intro-enter').click();
      await new Promise((r) => setTimeout(r, 1500));
      const gl = window.temple.world.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
    for (const hour of [13, 0]) {
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
          t.avatars.teleport(s.player[0], s.player[1], Math.PI);
          t._walkZone = null;
          t.avatars.solo = true;
          W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
          document.querySelector('#hud').style.opacity = 0;
          document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
          document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
        }, [hour, s]);
        await page.waitForTimeout(2500); // 실제 루프가 돌며 셰이더·그림자가 자리잡게
        // fps: 실제 rAF 루프 5초 (디스플레이 주사율이 상한). info: 프레임당 평균 (후처리 패스까지 합산).
        // syncMs: 루프를 멈추고 한 프레임 그리기 + 1px readPixels 로 GPU 완료까지 기다린 시간의 중앙값 (주사율 상한 없는 비교용).
        const perf = await page.evaluate(() => new Promise((res) => {
          const t = window.temple, W = t.world, R = W.renderer, info = R.info, gl = R.getContext();
          info.autoReset = false; info.reset();
          let n = 0; const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 5000) return requestAnimationFrame(tick);
            const fps = +(n / ((performance.now() - t0) / 1000)).toFixed(1);
            const per = { calls: Math.round(info.render.calls / n), tris: Math.round(info.render.triangles / n), textures: info.memory.textures, geometries: info.memory.geometries };
            info.autoReset = true;
            const loop = t._loop; t._loop = () => {};
            setTimeout(() => {
              const px = new Uint8Array(4), ms = [];
              let clock = 200;
              for (let i = 0; i < 40; i++) {
                const a = performance.now();
                t._frame(1 / 60, (clock += 1 / 60));
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                ms.push(performance.now() - a);
              }
              ms.sort((x, y) => x - y);
              t._loop = loop; requestAnimationFrame((ts) => t._loop(ts));
              res({ fps, syncMs: +ms[20].toFixed(2), ...per });
            }, 50);
          };
          requestAnimationFrame(tick);
        }));
        const file = `${OUT}/current-${s.name}-${String(hour).padStart(2, '0')}h-${w}x${h}.png`;
        if (thr === 1) await page.screenshot({ path: file });
        results.push({ view: `${w}x${h}`, cpuThrottle: thr, hour, shot: s.name, ...perf });
      }
    }
    results.push({ view: `${w}x${h}`, cpuThrottle: thr, gpu });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return JSON.stringify(results, null, 1);
}
