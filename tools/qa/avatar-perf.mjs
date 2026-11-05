// 블렌더 아바타 성능·로딩 — 묶음 G(지도 기준선)와 같은 방법으로 GLB 있을 때(기본)와 없을 때(?rig=0)를 비교한다.
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/avatar-perf.mjs' }
// - ms/frame: 루프를 멈추고 t._frame() 40회, 매번 1px readPixels 로 GPU 완료까지 기다린 시간의 중앙값 (주사율 상한 없음)
// - calls·tris: 한 프레임 전체 (그림자·후처리 포함), 참배객 13명이 보이는 그대로
// - 받기: 개발 서버 그대로와, 느린 망(지연 150ms·1.6Mbps, 크롬 'Fast 3G' 수준)에서 monk.glb 가 다 받아지기까지
async (page) => {
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  const VIEWS = [{ w: 390, h: 844, q: 'high' }, { w: 390, h: 844, q: 'low' }, { w: 1280, h: 800, q: 'high' }];
  const SPOTS = { spawn: [0, 36, Math.PI], court: [0, 2, Math.PI] };
  const rows = [];
  const open = async (url) => {
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
    return Date.now() - t0;
  };
  for (const v of VIEWS) {
    await page.setViewportSize({ width: v.w, height: v.h });
    for (const rig of [true, false]) {
      const boot = await open(`${base}/?q=${v.q}${rig ? '' : '&rig=0'}`);
      const r = await page.evaluate(async ([SPOTS]) => {
        document.querySelector('#intro-enter').click();
        await new Promise((r) => setTimeout(r, 1500));
        const t = window.temple, W = t.world, R = W.renderer, gl = R.getContext();
        W.timeMode = 'fixed';
        W.hour = W.hourTarget = 13;
        W.applyEnv(true);
        const out = { rigs: [t.player, ...t.avatars.visitors.map((x) => x.av)].filter((a) => a.rig).length };
        const loop = t._loop;
        t._loop = () => {};
        let clock = 200;
        for (const [name, [x, z, ry]] of Object.entries(SPOTS)) {
          t.avatars.teleport(x, z, ry);
          t._walkZone = null;
          for (let i = 0; i < 30; i++) t._frame(1 / 60, (clock += 1 / 60));
          await new Promise((r) => setTimeout(r, 300));
          const px = new Uint8Array(4), ms = [];
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
          out[name] = { ms: +ms[20].toFixed(2), calls: R.info.render.calls, ktris: Math.round(R.info.render.triangles / 1000) };
        }
        // 실제 rAF 3초 (주사율 상한)
        t._loop = loop;
        requestAnimationFrame(() => t._loop());
        const n0 = performance.now();
        let n = 0;
        await new Promise((res) => { const f = () => { n++; performance.now() - n0 < 3000 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
        out.fps = +(n / ((performance.now() - n0) / 1000)).toFixed(1);
        return out;
      }, [SPOTS]);
      rows.push({ view: `${v.w}x${v.h} ${v.q}`, rig, boot, ...r });
    }
  }
  // 받기 시간
  const glb = async (throttle) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.setViewportSize({ width: 390, height: 844 });
    const got = [];
    const onDone = (req) => {
      if (!/monk\.glb|meshopt_decoder/.test(req.url())) return;
      const tm = req.timing();
      got.push({ n: req.url().split('/').pop(), startMs: Math.round(tm.startTime - t0), ms: Math.round(tm.responseEnd) });
    };
    page.on('requestfinished', onDone);
    const t0 = Date.now();
    await page.goto(`${base}/?q=low`);
    await page.waitForFunction(async () => { const R = await import('/src/world/avatarRig.js'); return !!R.rigLib(); }, null, { timeout: 180000, polling: 100 });
    const ready = Date.now() - t0;
    const intro = await page.waitForFunction(() => !document.querySelector('#intro-enter').disabled, null, { timeout: 180000 }).then(() => Date.now() - t0);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.detach();
    page.off('requestfinished', onDone);
    return { throttle, rigReadyMs: ready, introReadyMs: intro, files: got };
  };
  const load = [await glb(false), await glb(true)];
  return JSON.stringify({ rows, load }, null, 1);
}
