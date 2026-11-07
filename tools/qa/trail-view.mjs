// 산책로에서 경내가 내려다보이는가 — node tools/qa/trail-view.mjs OUTDIR [low|high]   (먼저 python3 .claude/devserver.py 8092, BASE=)
// 사용자 2026-11-07 「대웅전을 확장하면서 언덕 위로 지붕이 너무 높게 올라와서, 사찰의 전체 전경이 보이지 않고 시야가 다 가리게 되어 버렸다」
// 1) 수치: 대웅전 뒤(z < −36) 산책로 3m 마다 눈높이(걷는 면 +1.6m)에서
//    · 마당·서쪽 마당·다실 마당 위 2m 칸(사람 키 1m)이 가리지 않고 보이는 비율 (지붕 옆으로 비껴 보이는 정도)
//    · 탑 꼭대기가 보이는가, 눈이 대웅전 용마루보다 높은가 (지붕을 내려다보는가)
//    가림 높이 = 지형과, 위에서 쏜 광선으로 1m 격자(x −62..62, z −84..−12)에 한 번 잰 지붕·나무 높이 중 큰 값 (나무는 기둥처럼 꽉 찬 것으로 본다).
// 2) 스크린숏: 북쪽 산책로 다섯 자리에서 경내 쪽을 본 3인칭 화면 + 능선 돗자리에 앉은 모습 + 데크 벤치 + 연못.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const [OUT = 'trail-view', Q = 'high'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await ctx.addInitScript(() => {
    let s = 1234567;
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    window.TEMPLE_CONFIG = { liveUrl: 'http://127.0.0.1:59999' };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=${Q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector('#intro-enter').click()); // 고화질 부팅 중엔 메인 스레드가 바빠 실제 클릭이 30초를 넘기기도 한다
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 120000 });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#toast-stack{visibility:hidden!important} #hud{opacity:0!important;transition:none!important} .name-label{visibility:hidden!important}';
    document.head.appendChild(st);
    const t = window.temple;
    t._loop = () => {};
    window.__view = (o = {}) => {
      const W = t.world;
      W.setTimeOfDay(o.time || 'day');
      W.hour = W.hourTarget;
      if (o.pos) t.avatars.teleport(o.pos[0], o.pos[1], o.ry ?? Math.PI);
      if (o.yaw != null) W.cam.yaw = o.yaw;
      if (o.pitch != null) W.cam.pitch = o.pitch;
      if (o.dist != null) W.cam.targetDist = W.cam.dist = o.dist;
      W.applyEnv(true);
      for (let i = 0; i < (o.frames || 60); i++) t._frame(1 / 30, 80 + i / 30);
      if (o.cam) {
        // 아바타와 떨어진 자유 카메라 (연못처럼 담·나무 사이라 3인칭 팔이 들어가지 못하는 곳)
        W.camera.position.set(...o.cam.pos);
        W.camera.lookAt(...o.cam.look);
        W.render();
      }
    };
  });
  await page.waitForFunction(() => !window.temple.world.outdoorReady || window.temple.world.outdoorReady.done, null, { timeout: 120000 }).catch(() => errors.push('outdoor assets timeout'));

  // 1) 수치
  const m = await page.evaluate(async () => {
    const THREE = await import('three');
    const { trail } = await import('./src/world/trail.js');
    const { terrainHeight, walkHeight, L, COURTS } = await import('./src/world/layout.js');
    const W = window.temple.world;
    const meshes = [];
    W.scene.traverse((o) => o.isMesh && !o.isSprite && o.name !== 'ground' && o.visible && meshes.push(o));
    const rc = new THREE.Raycaster();
    const X0 = -62, Z0 = -84, N = 1, NX = 125, NZ = 73; // x −62..62, z −84..−12
    const hf = new Float32Array(NX * NZ).fill(-99);
    let roofTop = 0;
    const st = L.stylobate;
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
      const x = X0 + i * N, z = Z0 + k * N;
      rc.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
      const h = rc.intersectObjects(meshes, false)[0];
      if (h) {
        hf[i * NZ + k] = h.point.y;
        if (x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1) roofTop = Math.max(roofTop, h.point.y);
      }
    }
    rc.set(new THREE.Vector3(L.pagoda.x, 60, L.pagoda.z), new THREE.Vector3(0, -1, 0));
    const pagodaTop = { x: L.pagoda.x, z: L.pagoda.z, y: (rc.intersectObjects(meshes, false)[0]?.point.y ?? 8) - 0.2 };
    const occ = (x, z) => {
      let y = terrainHeight(x, z);
      const i = Math.round((x - X0) / N), k = Math.round((z - Z0) / N);
      if (i >= 0 && i < NX && k >= 0 && k < NZ) y = Math.max(y, hf[i * NZ + k]);
      return y;
    };
    const targets = [];
    // 다실 마당은 바뀌기 전 사각형으로 고정한다 (2026-11-07 연못 정원을 들이며 넓어져 칸 수가 달라지지 않게 — 전후를 같은 칸으로 잰다)
    for (const r of [...COURTS, { x0: 17.6, x1: 33, z0: -19, z1: -1 }]) {
      for (let x = r.x0 + 1; x < r.x1; x += 2) for (let z = r.z0 + 1; z < r.z1; z += 2) targets.push({ x, z, y: terrainHeight(x, z) + 1.0 });
    }
    const seen = (e, q) => {
      const d = Math.hypot(q.x - e.x, q.z - e.z), n = Math.ceil(d / 0.4);
      for (let j = 2; j < n - 1; j++) {
        const u = j / n, x = e.x + (q.x - e.x) * u, z = e.z + (q.z - e.z) * u, y = e.y + (q.y - e.y) * u;
        if (y < occ(x, z)) return false;
      }
      return true;
    };
    const rows = [];
    for (let s = 0; s < trail.length; s += 3) {
      const p = trail.at(s);
      if (p.z > -36) continue;
      const e = { x: p.x, z: p.z, y: walkHeight(p.x, p.z) + 1.6 };
      const v = targets.filter((q) => seen(e, q)).length / targets.length;
      rows.push({ s: Math.round(s), x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +e.y.toFixed(1), seen: +(v * 100).toFixed(0), pagoda: seen(e, pagodaTop), above: e.y > roofTop });
    }
    const avg = rows.reduce((a, r) => a + r.seen, 0) / (rows.length || 1);
    // 대웅전 기단 뒤에서 산책로까지 가장 가까운 수평 거리 · 그 자리 높이 차
    let near = { d: 99 };
    for (let s = 0; s < trail.length; s += 1) {
      const p = trail.at(s), st = L.stylobate;
      const dx = Math.max(st.x0 - p.x, 0, p.x - st.x1), dz = Math.max(st.z0 - p.z, 0, p.z - st.z1), d = Math.hypot(dx, dz);
      if (d < near.d) near = { d: +d.toFixed(1), s: Math.round(s), x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +walkHeight(p.x, p.z).toFixed(1) };
    }
    return { roofTop: +roofTop.toFixed(2), pagodaY: +pagodaTop.y.toFixed(1), pagodaSeen: rows.filter((r) => r.pagoda).length, aboveRoof: rows.filter((r) => r.above).length, targets: targets.length, avg: +avg.toFixed(1), min: Math.min(...rows.map((r) => r.seen)), max: Math.max(...rows.map((r) => r.seen)), maxY: Math.max(...rows.map((r) => r.y)), near, length: +trail.length.toFixed(1), rows };
  });
  console.log(`지붕 꼭대기 ${m.roofTop}m · 산책로 ${m.length}m · 기단에서 가장 가까운 산책로 ${m.near.d}m (s ${m.near.s}, 높이 ${m.near.y}m)`);
  console.log(`대웅전 뒤 산책로 ${m.rows.length}자리: 경내 칸 ${m.targets}개 중 보이는 비율 평균 ${m.avg}% · 최소 ${m.min}% · 최대 ${m.max}% · 눈높이 최고 ${m.maxY}m`);
  console.log(`  탑 꼭대기(${m.pagodaY}m) 보이는 자리 ${m.pagodaSeen}/${m.rows.length} · 눈이 용마루보다 높은 자리 ${m.aboveRoof}/${m.rows.length}`);
  for (const r of m.rows) console.log(`  s ${String(r.s).padStart(3)} (${String(r.x).padStart(6)},${String(r.z).padStart(6)}) 눈 ${String(r.y).padStart(5)}m  보임 ${String(r.seen).padStart(3)}%${r.pagoda ? '  탑' : ''}${r.above ? '  지붕 위' : ''}`);

  // 2) 스크린숏
  const views = await page.evaluate(async () => {
    const { trail, REST_SPOTS } = await import('./src/world/trail.js');
    const near = (ax, az) => {
      let best = null;
      for (let s = 0; s < trail.length; s += 0.5) {
        const p = trail.at(s), d = Math.hypot(p.x - ax, p.z - az);
        if (!best || d < best.d) best = { d, p };
      }
      const p = best.p, h = Math.atan2(0 - p.x, -6 - p.z); // 경내(탑) 쪽을 본다
      return { pos: [p.x, p.z], ry: h, yaw: h - Math.PI, pitch: 0.22, dist: 7 };
    };
    const deck = REST_SPOTS.find((s) => s.id === 'deck_bench');
    return {
      v1_nw: near(-46, -42),
      v2_nnw: near(-24, -56),
      v3_n: near(-4, -62),
      v4_nne: near(16, -60),
      v5_ne: near(38, -46),
      v6_deck: (() => {
        const p = trail.at(deck.s - 3), q = trail.at(deck.s - 2), h = Math.atan2(q.x - p.x, q.z - p.z);
        return { pos: [p.x, p.z], ry: h, yaw: h - Math.PI + 0.35, pitch: 0.55, dist: 4.5 };
      })()
    };
  });
  for (const [n, v] of Object.entries(views)) {
    await page.evaluate((v) => window.__view(v), v);
    await page.screenshot({ path: `${OUT}/${n}_${Q}.png` });
  }
  // 중턱 정자(옛 능선 돗자리)에 앉은 모습 (옆에서)
  await page.evaluate(async () => {
    const t = window.temple, s = t.temple.trail.spots.find((q) => q.id === 'pavilion_ridge') || t.temple.trail.spots.find((q) => q.id === 'mat_ridge');
    window.__view({ frames: 2 });
    t.avatars.teleport(s.stand.x, s.stand.z, s.ry);
    t._sitRest(s);
    for (let i = 0; i < 300 && !t.player.sitting; i++) t._frame(1 / 30, 200 + i / 30);
    window.__view({ yaw: s.ry + 0.6, pitch: 0.18, dist: 6, frames: 30 });
  });
  await page.screenshot({ path: `${OUT}/v7_mat_${Q}.png` });
  // 앉은 눈으로 바라보는 쪽 (1인칭)
  await page.evaluate(async () => {
    const t = window.temple, W = t.world, s = t.temple.trail.spots.find((q) => q.id === 'pavilion_ridge') || t.temple.trail.spots.find((q) => q.id === 'mat_ridge');
    W.cam.mode = 'first';
    window.__view({ yaw: s.ry + Math.PI, pitch: 0.14, frames: 30 }); // 1인칭: yaw 0 = 북쪽을 봄, pitch 양수 = 아래
  });
  await page.screenshot({ path: `${OUT}/v7b_seatview_${Q}.png` });
  await page.evaluate(() => (window.temple.world.cam.mode = 'third'));
  const sat = await page.evaluate(() => {
    const t = window.temple, p = t.player.root.position;
    return { sitting: t.player.sitting, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
  });
  console.log('중턱 정자(옛 능선 돗자리) 앉기', JSON.stringify(sat));
  // 연못·정자
  await page.evaluate(async () => {
    const { L } = await import('./src/world/layout.js');
    const t = window.temple;
    t.onStandUp?.();
    const p = L.pond, tx = L.pondPavilion?.x ?? p.x + p.rx; // 연못 남서 하늘에서 연못 전체·정자 쪽
    window.__view({ pos: [p.x - p.rx * 0.6, p.z + p.rz + 1.2], frames: 60, cam: { pos: [p.x - p.rx - 3, 8.5, p.z + p.rz + 6], look: [(p.x + tx) / 2, 0.9, p.z] } });
  });
  await page.screenshot({ path: `${OUT}/v8_pond_${Q}.png` });
  // 잉어: 연못 북쪽 물가에서 동쪽 트인 물을 내려다본다
  await page.evaluate(async () => {
    const { L } = await import('./src/world/layout.js');
    const p = L.pond, x = p.x + p.rx * 0.3, z = p.z;
    window.__view({ pos: [p.x - p.rx * 0.6, p.z + p.rz + 1.2], frames: 60, cam: { pos: [x - 1, 4.2, z + 3.2], look: [x, 0.8, z - 0.5] } });
  });
  await page.screenshot({ path: `${OUT}/v9_koi_${Q}.png` });
  // 옹달샘·실개울
  await page.evaluate(async () => {
    const { L } = await import('./src/world/layout.js');
    const s = L.pondSpring || { x: L.pond.x - L.pond.rx, z: L.pond.z };
    window.__view({ pos: [s.x - 2, s.z + 2], frames: 60, cam: { pos: [s.x - 1.5, 3.4, s.z + 3.2], look: [s.x + 1.2, 1.0, s.z - 1.0] } });
  });
  await page.screenshot({ path: `${OUT}/v10_spring_${Q}.png` });
  writeFileSync(`${OUT}/metrics_${Q}.json`, JSON.stringify(m, null, 1));
  console.log('shots', OUT, 'errors', errors.length, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
