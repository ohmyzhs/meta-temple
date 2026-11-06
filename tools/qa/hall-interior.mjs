// 대웅전 실내 검사 — 저사양(q=low, 폰)과 자동 판정(데스크톱) 둘 다.
// Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/hall-interior.mjs' }   서버: python3 .claude/devserver.py 8083
// 출력: 실사 교체 상태(사진 불상·후불벽), 그리기 호출·삼각형·텍스처 수, 삼존·닫집 경계 상자,
//       화면: .playwright-mcp/hall/int-<mode>-<shot>.png
async (page) => {
  const TAG = globalThis.HALL_TAG || 'int';
  const OUT = '.playwright-mcp/hall';
  const modes = [
    { n: 'low', q: '?q=low', vp: { width: 390, height: 844 } },
    { n: 'auto', q: '', vp: { width: 1280, height: 800 } }
  ];
  const shots = [
    { n: 'front', pl: [0, -22.0], pos: [0, 4.9, -21.5], look: [0, 8.2, -38], hour: 13 },
    { n: 'mid', pl: [3, -29.0], pos: [4.5, 4.6, -27.5], look: [-1.5, 6.0, -38], hour: 13 },
    { n: 'altar', pl: [0, -31.5], pos: [2.5, 4.4, -30.5], look: [0, 4.2, -36], hour: 13 },
    { n: 'night', pl: [0, -22.0], pos: [0, 4.9, -21.5], look: [0, 8.2, -38], hour: 0 },
    { n: 'side', pl: [-11, -24.0], pos: [-11.5, 5.2, -22.5], look: [6, 7.5, -34], hour: 13 }
  ];
  const out = {};
  for (const md of modes) {
    await page.setViewportSize(md.vp);
    await page.goto('http://localhost:8083/' + md.q);
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
    await page.evaluate(() => {
      document.querySelector('#intro-enter').click();
      window.temple.avatars.solo = true;
      window.temple.avatars.teleport(0, -24, Math.PI);
    });
    await page.waitForTimeout(6000); // 실사 교체(0.5초 간격 거리 검사 + 받기)
    const info = await page.evaluate(async () => {
      const THREE = await import('three');
      const W = window.temple.world;
      const st = {};
      if (W.real) for (const [k, v] of W.real.state) st[k] = v?.isObject3D ? 'swapped' : v;
      const box = (pred) => {
        let b = null;
        W.scene.traverse((o) => { if (pred(o)) b = new THREE.Box3().setFromObject(o); });
        return b && [b.min.toArray().map((x) => +x.toFixed(2)), b.max.toArray().map((x) => +x.toFixed(2))];
      };
      const r = W.renderer.info;
      return {
        quality: W.quality, real: W.real ? st : null, materialsUpgraded: !!W.real?.materialsUpgraded,
        buddhaProc: box((o) => o.userData.realSlot === 'buddha'),
        bodhiLProc: box((o) => o.userData.realSlot === 'bodhiL'),
        cards: W.real ? Object.fromEntries([...W.real.state].filter(([, v]) => v?.isObject3D).map(([k, v]) => { const b = new THREE.Box3().setFromObject(v); return [k, [b.min.toArray().map((x) => +x.toFixed(2)), b.max.toArray().map((x) => +x.toFixed(2))]]; })) : null,
        render: { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length }
      };
    });
    out[md.n] = info;
    for (const s of shots) {
      await page.evaluate(async (s) => {
        const t = window.temple, W = t.world, THREE = await import('three');
        W.timeMode = 'fixed'; W.hour = W.hourTarget = s.hour; W.setWeather('clear'); W.applyEnv(true);
        t.avatars.teleport(s.pl[0], s.pl[1], Math.PI);
        W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
        document.querySelector('#hud').style.opacity = 0;
        document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
        document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
      }, s);
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${OUT}/${TAG}-${md.n}-${s.n}.png` });
    }
    // 한 프레임 전체(그림자·후처리 포함) 그리기 호출·삼각형 — 대웅전 가운데에서 불단 쪽 (mid 화면 그대로)
    out[md.n].frame = await page.evaluate(async () => {
      const t = window.temple, W = t.world, THREE = await import('three');
      W.hour = W.hourTarget = 13; W.applyEnv(true);
      W.setShot({ pos: new THREE.Vector3(4.5, 4.6, -27.5), look: new THREE.Vector3(-1.5, 6.0, -38), dur: 1e9 }, true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const info = W.renderer.info;
      info.autoReset = false; info.reset();
      await new Promise((r) => requestAnimationFrame(r));
      const f = { calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries };
      info.autoReset = true;
      // 길찾기: 앞문 → 좌복 뒷줄 · 헌향 자리 · 사경 서안 · 신중단 · 영단 앞
      const pf = t._pf?.();
      const go = (x, z) => { const p = pf?.find(0, -19.6, x, z); return p ? p.length : null; };
      f.paths = { cushionBack: go(0, -30.8), incense: go(0, -33.1), sutra: go(12.85, -32.57), sinjung: go(-11.2, -37.1), yeong: go(11.2, -37.1), sideAisle: go(-13.2, -28) };
      return f;
    });
  }
  return JSON.stringify(out);
}
