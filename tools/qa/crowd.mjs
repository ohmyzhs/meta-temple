// 군중 시험: 가짜 도반 N명을 실제 수신 경로(avatars.syncRemotePeers, 서버 틱 5Hz)로 넣고 폰 비슷한 조건에서 잰다.
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/crowd.mjs' }   서버: python3 .claude/devserver.py 8098
// - 화면: 880×900 CSS, DPR 2.5, 터치 (폴드 펼침 비슷), q=high, CPU 4배 느리게 (Emulation.setCPUThrottlingRate) — GPU 는 이 컴퓨터 것
// - fps·평균 ms·p95: 실제 requestAnimationFrame 간격 6초. calls·ktri: 한 프레임(그림자·후처리 포함)
// - 장면: hall(대웅전 좌복에 앉고 절하고 걷는 사람), hallDoor(같은 사람들, 문 쪽을 봄), court(앞마당), behind(산문 밖 — 법당에서 안 보임)
// - 실사 판 교체(불상)가 끝난 뒤에 잰다 — 교체 중이면 절차적 불상 47만 삼각형이 섞인다
// - 다른 목록: 먼저 이 페이지에서 window.__crowdList = [['hall', 50], ...] , 다른 포트: window.__crowdPort
async (page) => {
  const port = (await page.evaluate(() => window.__crowdPort)) || 8098;
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 880, height: 900 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  await ctx.addInitScript(() => { let s = 7; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); window.TEMPLE_CONFIG = { liveUrl: 'http://localhost:1' }; });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:${port}/?q=high`);
  await p.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await p.evaluate(() => document.querySelector('#intro-enter').click());
  await p.waitForFunction(() => window.temple.world.outdoorReady?.done && window.temple.world.precinctReady?.done, null, { timeout: 90000 });
  await p.evaluate(() => window.temple.avatars.teleport(0, -18, Math.PI));
  await p.waitForFunction(() => [...(window.temple.world.real?.state?.values() || [])].every((v) => v?.isObject3D || v === 'failed') && (window.temple.world.real?.state?.size || 0) >= 7, null, { timeout: 60000 }).catch(() => {});
  // 봇: 법당 좌복 위(앉기·큰절·가부좌 번갈아) + 법당 안을 걷는 사람
  await p.evaluate(async () => {
    const { L } = await import('./src/world/layout.js');
    const t = window.temple;
    t._adaptQuality = () => {}; // 재는 동안 화면 배율을 고정 (자동 조절이 결과를 가리지 않게)
    const cushions = t.temple.cushions;
    const ACTS = ['sit', 'meditate', 'prostrate', 'bow_half', 'incense', 'idle'];
    window.__bots = (n, where) => {
      const bots = [];
      for (let i = 0; i < n; i++) {
        let x, z, a, walk = false;
        if (where === 'hall') {
          if (i < Math.min(n, cushions.length) * 0.8) { const c = cushions[i % cushions.length]; x = c.x; z = c.z; a = ACTS[i % ACTS.length]; }
          else { x = L.hall.x0 + 2 + (i * 3.7) % (L.hall.x1 - L.hall.x0 - 4); z = L.hall.z0 + 2 + (i * 1.9) % (L.hall.z1 - L.hall.z0 - 3); a = 'walk'; walk = true; }
        } else if (where === 'court') { x = -14 + (i % 10) * 3.1; z = -12 + Math.floor(i / 10) * 4.2; a = i % 3 ? 'walk' : 'bow_half'; walk = i % 3 !== 0; }
        else { x = -10 + (i % 10) * 2.2; z = 34 + Math.floor(i / 10) * 2.5; a = 'walk'; walk = true; } // 'behind': 산문 밖 숲길 (법당에서 등 뒤 멀리)
        bots.push({ id: 'b' + i, x, z, y: 0, a, walk, n: 0, ph: i * 0.7 });
      }
      return bots;
    };
    window.__crowd = null;
    window.__runCrowd = (n, where) => {
      clearInterval(window.__crowdTimer);
      const { walkHeight } = window.__lay;
      const bots = window.__bots(n, where);
      let tick = 0;
      const send = () => {
        tick++;
        const peers = bots.map((b, i) => {
          let x = b.x, z = b.z;
          if (b.walk) { x += Math.sin(tick * 0.08 + b.ph) * 2.2; z += Math.cos(tick * 0.06 + b.ph) * 1.6; }
          const a = b.walk ? 'walk' : (tick % 40 === i % 40 ? ['bow_half', 'prostrate', 'meditate', 'sit'][(tick / 40 + i) % 4 | 0] : b.a);
          const n2 = b.walk ? 0 : Math.floor((tick + i) / 40);
          return { id: b.id, dharmaName: '도반' + i, avatarStyle: ['monk', 'ink_wanderer', 'lantern_spirit'][i % 3], x, y: walkHeight(x, z), z, ry: (tick * 0.05 + i) % 6.28, actionState: a, actionSeq: n2 };
        });
        t.avatars.syncRemotePeers(peers);
      };
      send();
      window.__crowdTimer = setInterval(send, 200);
    };
    window.__lay = await import('./src/world/layout.js');
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter((m) => /^(ScriptDuration|LayoutDuration|RecalcStyleDuration)$/.test(m.name)).map((m) => [m.name, m.value]));
  const out = { errors };
  const views = { hall: [0, -21.5, 0.32, 0], hallDoor: [0, -27, 0.25, Math.PI], court: [0, 4, 0.25, 0], behind: [0, -24, 0.3, 0] };
  const list = (await page.evaluate(() => window.__crowdList)) || [['hall', 0], ['hall', 25], ['hall', 50], ['hallDoor', 50], ['court', 50], ['behind', 50]];
  for (const [scen, n] of list) {
    await p.evaluate(([scen, n]) => { window.__runCrowd(n, scen === 'hallDoor' ? 'hall' : scen); }, [scen, n]);
    const v = views[scen];
    await p.evaluate((v) => { const t = window.temple; t.avatars.teleport(v[0], v[1], Math.PI); t.world.cam.yaw = v[3]; t.world.cam.pitch = v[2]; t.world.cam.targetDist = t.world.cam.dist = 6; }, v);
    await p.waitForTimeout(3500); // 아바타 모형을 받고 자리 잡을 때까지
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.evaluate(() => { window.__fr = []; let last = performance.now(); const loop = (t) => { window.__fr.push(t - last); last = t; if (window.__frOn) requestAnimationFrame(loop); }; window.__frOn = true; requestAnimationFrame(loop); });
    const m0 = await metric();
    await p.waitForTimeout(6000);
    const m1 = await metric();
    await p.evaluate(() => (window.__frOn = false));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fr = (await p.evaluate(() => window.__fr)).slice(2);
    const sorted = [...fr].sort((a, b) => a - b);
    const st = await p.evaluate(() => { const R = window.temple.world.renderer; R.info.autoReset = false; R.info.reset(); window.temple.world.render(); const r = { calls: R.info.render.calls, ktri: Math.round(R.info.render.triangles / 1000) }; R.info.autoReset = true; r.remote = window.temple.avatars.remote.size; r.pr = window.temple.world.pixelRatio; return r; });
    out[`${scen}-${n}`] = { fps: +(fr.length / 6).toFixed(1), avgMs: +(fr.reduce((a, b) => a + b, 0) / fr.length).toFixed(1), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), script: Math.round((m1.ScriptDuration - m0.ScriptDuration) / 6 * 1000) + 'ms/s', style: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) / 6 * 1000) + 'ms/s', ...st };
    await p.screenshot({ path: `.playwright-mcp/crowd/${scen}_${n}.png` });
  }
  await ctx.close();
  return JSON.stringify(out, null, 1);
}
