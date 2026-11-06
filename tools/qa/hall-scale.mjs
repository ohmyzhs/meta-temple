// 대웅전 키우기 검사 — 키우기 전·후 같은 방법으로 잰다.
// Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/hall-scale.mjs' }   서버: python3 .claude/devserver.py 8083
// 출력: 법당 실내 부피·용마루 높이·석탑 꼭대기, 산책로 표본 높이 해시(전·후가 같아야 함), 기단+처마 영역 안에 놓인 인스턴스(나무·바위 등) 수,
//       화면: 산문→법당, 마당 북동쪽, 법당 안(낮·자정) — .playwright-mcp/hall/<tag>-*.png
async (page) => {
  const TAG = globalThis.HALL_TAG || 'shot';
  const OUT = '.playwright-mcp/hall';
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:8083/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  const res = await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1500));
    const THREE = await import('three');
    const { L, terrainHeight, walkHeight } = await import('/src/world/layout.js');
    const { PATHS } = await import('/src/world/trail.js');
    const t = window.temple, W = t.world;
    t.avatars.solo = true;
    const h = L.hall;
    // 용마루: buildHanok 그룹 중 기둥 자리가 법당 기둥 줄과 같은 것
    let ridge = null;
    W.scene.traverse((o) => {
      if (o.userData.roofTop != null && o.userData.columns?.some(([x, z]) => x === h.xs[0] && z === h.zs[0])) ridge = +(o.position.y + o.userData.roofTop).toFixed(2);
    });
    let pagodaTop = null;
    W.scene.traverse((o) => { if (o.userData.realSlot === 'pagoda') { const b = new THREE.Box3().setFromObject(o); pagodaTop = +b.max.y.toFixed(2); } });
    const realP = W.real?.state.get('pagoda');
    if (realP?.isObject3D) pagodaTop = +new THREE.Box3().setFromObject(realP).max.y.toFixed(2);
    // 산책로 표본 높이
    const trail = [];
    for (const p of PATHS) for (const q of p.pts) trail.push([+terrainHeight(q.x, q.z).toFixed(4), +walkHeight(q.x, q.z).toFixed(4)]);
    // 기단 + 처마(4.5m) 안의 인스턴스 (법당 자체 인스턴스 = 기둥·초석·공포·좌복 제외)
    const s = L.stylobate, pad = 4.5, inside = {};
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    W.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      let hallOwned = false;
      for (let p = o; p; p = p.parent) if (p.userData.columns || p === t.world.temple?.cushionMesh) hallOwned = true;
      if (hallOwned || o === W.temple?.cushionMesh) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld);
        if (v.x > s.x0 - pad && v.x < s.x1 + pad && v.z > s.z0 - pad && v.z < s.z1 && v.y < h.floorY + h.colH + 2) {
          const k = (o.name || o.material?.name || o.geometry?.type || 'inst') + '@' + o.uuid.slice(0, 4);
          inside[k] = (inside[k] || 0) + 1;
        }
      }
    });
    return {
      hall: { w: h.x1 - h.x0, d: h.z1 - h.z0, colH: h.colH, volume: +((h.x1 - h.x0) * (h.z1 - h.z0) * h.colH).toFixed(1), floorArea: (h.x1 - h.x0) * (h.z1 - h.z0) },
      ridge, pagodaTop, ridgeOverPagoda: ridge && pagodaTop ? +((ridge - L.courtyard.y) / (pagodaTop - L.courtyard.y)).toFixed(2) : null,
      trailN: trail.length, trailHash: (() => { let x = 2166136261; for (const c of JSON.stringify(trail)) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x.toString(16); })(),
      trailSample: trail.filter((_, i) => i % 150 === 0), inside
    };
  });
  const shots = [
    { n: 'gate', pl: [0, 22], pos: [0.6, 2.4, 24], look: [0, 9, -25], hour: 13 },
    { n: 'court-ne', pl: [-8, 2], pos: [-9, 2.2, 3], look: [10, 7, -25], hour: 13 },
    { n: 'hall-day', pl: [1.5, -21.0], pos: [1.2, 4.8, -21.2], look: [0, 6.0, -34], hour: 13 },
    { n: 'hall-night', pl: [1.5, -21.0], pos: [1.2, 4.8, -21.2], look: [0, 6.0, -34], hour: 0 }
  ];
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
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${TAG}-${s.n}.png` });
  }
  return JSON.stringify(res);
}
