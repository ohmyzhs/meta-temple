// 걸을 수 있는 땅 전수조사 — node tools/qa/walk-survey.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=그림 폴더)
// 지도 전체(지형 격자 x −60..60, z −76..60)를 0.5m 칸으로 나눠 칸마다:
//   걸을 수 있음(isWalkable·충돌 없음) / 진짜 막힘: 충돌체(건물·담·나무·바위), 물(연못+물가 돌 0.35m·계곡·옹달샘), 울타리, 가파름(기울기 45% 이상)
//   그 밖은 「보이는 막힘 없이 못 가는 땅」. 걸을 수 있는 땅에서 이어진 것만 센다 (사람이 걸어가다 부딪히는 보이지 않는 벽).
//   돗자리: 걸을 수 있는 칸 가운데 돗자리 기울기(16°) 안인데 네 귀퉁이 규칙으로 못 펴는 칸도 센다.
// 결과: 산책로 고리 안(경내 쪽) / 밖으로 나눈 넓이(m²)와 덩어리 목록, 위에서 본 그림 OUT/{NAME}-all.png · {NAME}-tea.png
//   빨강 = 보이는 막힘 없이 못 가는 평지(16° 안), 분홍 = 그런데 비탈(16°~45%), 초록 = 그 가운데 대숲 자리, 파랑 테두리 = 걸을 수 있는 땅
import { writeFileSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.', NAME = process.env.NAME || 'survey';
const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?q=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(async () => {
    const t = window.temple;
    const Lm = await import('./src/world/layout.js');
    const Tm = await import('./src/world/trail.js');
    const { L, isWalkable, resolveCollisions, terrainHeight, streamZ } = Lm;
    const { fenceBarrier, crossingAt, loop } = Tm;
    const X0 = -60, Z0 = -76, ST = 0.5, NX = 240, NZ = 272;
    const MAT = Math.tan((16 * Math.PI) / 180);
    const cls = new Uint8Array(NX * NZ); // 0 걷기 1 충돌 2 물 3 울타리 4 가파름 5 막힘(평지) 6 막힘(비탈)
    const grove = new Uint8Array(NX * NZ), matBad = new Uint8Array(NX * NZ);
    const p = L.pond, sp = L.pondSpring;
    const inR = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const slope = (x, z) => {
      const e = 0.4;
      return Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = X0 + (i + 0.5) * ST, z = Z0 + (j + 0.5) * ST, k = j * NX + i;
      const q = resolveCollisions(x, z, 0.32), hit = Math.hypot(q.x - x, q.z - z) > 1e-3;
      const walk = isWalkable(x, z);
      const g = slope(x, z);
      if (walk && !hit) {
        cls[k] = 0;
        if (g < MAT) {
          // 돗자리 1.0×1.5m 네 귀퉁이 (남북으로 편 경우)
          const ok = [[-0.5, -0.75], [0.5, -0.75], [-0.5, 0.75], [0.5, 0.75]].every(([a, b]) => isWalkable(x + a, z + b));
          if (!ok) matBad[k] = 1;
        }
        continue;
      }
      if (hit) cls[k] = 1;
      else if (Math.hypot((x - p.x) / (p.rx + 0.35), (z - p.z) / (p.rz + 0.35)) < 1 || Math.hypot(x - sp.x, z - sp.z) < sp.r + 0.3 || (Math.abs(z - streamZ(x)) < 2.6 && !crossingAt(x, z))) cls[k] = 2;
      else if (fenceBarrier(x, z)) cls[k] = 3;
      else if (g >= 0.45) cls[k] = 4;
      else cls[k] = g < MAT ? 5 : 6;
      if (cls[k] >= 5 && (inR(x, z, L.bamboo) || inR(x, z, L.bambooEast))) grove[k] = 1;
    }
    // 걸을 수 있는 땅에서 막힌 땅(5·6)으로 이어지는 칸만 (8방향)
    const seen = new Uint8Array(NX * NZ), queue = [];
    for (let k = 0; k < cls.length; k++) if (cls[k] === 0) { seen[k] = 1; queue.push(k); }
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h], i = k % NX, j = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const n = b * NX + a;
        if (seen[n] || cls[n] < 5) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    // 산책로 고리 안?
    const ring = loop.pts;
    const inside = (x, z) => {
      let c = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const A = ring[a], B = ring[b];
        if (A.z > z !== B.z > z && x < ((B.x - A.x) * (z - A.z)) / (B.z - A.z) + A.x) c = !c;
      }
      return c;
    };
    const blocked = new Uint8Array(NX * NZ), inLoop = new Uint8Array(NX * NZ);
    const tot = { in: { flat: 0, slope: 0, grove: 0, walk: 0, matBad: 0 }, out: { flat: 0, slope: 0, grove: 0, walk: 0, matBad: 0 } };
    for (let k = 0; k < cls.length; k++) {
      const i = k % NX, j = (k / NX) | 0, x = X0 + (i + 0.5) * ST, z = Z0 + (j + 0.5) * ST;
      const side = inside(x, z) ? 'in' : 'out';
      inLoop[k] = side === 'in' ? 1 : 0;
      if (cls[k] === 0) { tot[side].walk += 0.25; if (matBad[k]) tot[side].matBad += 0.25; }
      if (cls[k] >= 5 && seen[k]) {
        blocked[k] = 1;
        tot[side][grove[k] ? 'grove' : cls[k] === 5 ? 'flat' : 'slope'] += 0.25;
      }
    }
    // 덩어리 (고리 안만, 대숲 자리는 따로)
    const comp = new Int32Array(NX * NZ).fill(-1), regions = [];
    for (let k = 0; k < cls.length; k++) {
      if (!blocked[k] || !inLoop[k] || comp[k] >= 0) continue;
      const r = { n: 0, flat: 0, grove: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, sx: 0, sz: 0 }, st = [k];
      comp[k] = regions.length;
      while (st.length) {
        const c = st.pop(), i = c % NX, j = (c / NX) | 0, x = X0 + (i + 0.5) * ST, z = Z0 + (j + 0.5) * ST;
        r.n++; r.flat += cls[c] === 5; r.grove += grove[c]; r.sx += x; r.sz += z;
        r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.z0 = Math.min(r.z0, z); r.z1 = Math.max(r.z1, z);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj, n = b * NX + a;
          if (a < 0 || b < 0 || a >= NX || b >= NZ || !blocked[n] || !inLoop[n] || comp[n] >= 0) continue;
          comp[n] = regions.length;
          st.push(n);
        }
      }
      regions.push({ m2: r.n / 4, flatPct: Math.round((100 * r.flat) / r.n), grovePct: Math.round((100 * r.grove) / r.n), at: [+(r.sx / r.n).toFixed(1), +(r.sz / r.n).toFixed(1)], box: [r.x0 - 0.25, r.x1 + 0.25, r.z0 - 0.25, r.z1 + 0.25].map((v) => +v.toFixed(1)) });
    }
    regions.sort((a, b) => b.m2 - a.m2);
    window.__survey = { cls, blocked, grove, X0, Z0, ST, NX, NZ };
    return { tot, regions: regions.filter((r) => r.m2 >= 2) };
  });
  const r2 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  console.log(`고리 안(경내 쪽): 걸을 수 있음 ${r2(res.tot.in).walk}m² · 막힘 없이 못 가는 평지 ${r2(res.tot.in).flat}m² · 비탈 ${r2(res.tot.in).slope}m² · 대숲 자리 ${r2(res.tot.in).grove}m² · 걸을 수 있는데 돗자리 못 펴는 평지 ${r2(res.tot.in).matBad}m²`);
  console.log(`고리 밖(숲):     걸을 수 있음 ${r2(res.tot.out).walk}m² · 막힘 없이 못 가는 평지 ${r2(res.tot.out).flat}m² · 비탈 ${r2(res.tot.out).slope}m² · 대숲 자리 ${r2(res.tot.out).grove}m²`);
  console.log('고리 안 덩어리 (2m² 이상, 넓은 순): 넓이 · 평지% · 대숲% · 가운데 · [x0 x1 z0 z1]');
  for (const r of res.regions) console.log(`  ${String(r.m2).padStart(6)}m²  평지 ${String(r.flatPct).padStart(3)}%  대숲 ${String(r.grovePct).padStart(3)}%  (${r.at.join(', ')})  [${r.box.join(' ')}]`);

  // 그림: 위에서 본 장면 + 칸 색
  for (const [tag, box] of [['all', [-60, 60, -76, 60]], ['tea', [8, 52, -30, 16]]]) {
    const url = await page.evaluate(async ([X0b, X1b, Z0b, Z1b]) => {
      const t = window.temple, W = t.world, S = window.__survey;
      const { walkHeight } = await import('./src/world/layout.js');
      t._loop = () => {};
      W.timeMode = 'fixed'; W.hour = W.hourTarget = 13; W.applyEnv(true);
      for (let i = 0; i < 3; i++) t._frame(1 / 30, 100 + i / 30);
      const cam = W.camera, cx = (X0b + X1b) / 2, cz = (Z0b + Z1b) / 2, half = Math.max(X1b - X0b, Z1b - Z0b) / 2;
      const fog = W.scene.fog.density; W.scene.fog.density = 0;
      const far = cam.far; cam.far = 2000;
      cam.up.set(0, 0, -1);
      cam.position.set(cx, half / Math.tan((cam.fov * Math.PI) / 360) + 3, cz);
      cam.lookAt(cx, 1, cz);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      W.composer.render();
      const src = W.renderer.domElement, c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      W.scene.fog.density = fog; cam.far = far; cam.updateProjectionMatrix();
      const v = cam.position.clone();
      const proj = (x, z) => { v.set(x, walkHeight(x, z), z).project(cam); return [((v.x + 1) / 2) * c.width, ((1 - v.y) / 2) * c.height]; };
      for (let j = 0; j < S.NZ; j++) for (let i = 0; i < S.NX; i++) {
        const k = j * S.NX + i, x = S.X0 + i * S.ST, z = S.Z0 + j * S.ST;
        if (x < X0b || x > X1b || z < Z0b || z > Z1b) continue;
        let col = null;
        if (S.blocked[k]) col = S.grove[k] ? 'rgba(40,220,90,0.55)' : S.cls[k] === 5 ? 'rgba(255,20,40,0.6)' : 'rgba(255,120,200,0.5)';
        else if (S.cls[k] === 0) col = 'rgba(60,140,255,0.16)';
        if (!col) continue;
        const [a, b] = proj(x, z), [d, e] = proj(x + S.ST, z + S.ST);
        g.fillStyle = col;
        g.fillRect(a, b, d - a + 0.5, e - b + 0.5);
      }
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.fillStyle = '#fff'; g.font = `${Math.round(c.width / 75)}px sans-serif`;
      const stp = X1b - X0b > 60 ? 10 : 5;
      for (let x = Math.ceil(X0b / stp) * stp; x <= X1b; x += stp) { const [a, b] = proj(x, Z0b), [d, e] = proj(x, Z1b); g.beginPath(); g.moveTo(a, b); g.lineTo(d, e); g.stroke(); g.fillText(String(x), a + 2, 16); }
      for (let z = Math.ceil(Z0b / stp) * stp; z <= Z1b; z += stp) { const [a, b] = proj(X0b, z), [d, e] = proj(X1b, z); g.beginPath(); g.moveTo(a, b); g.lineTo(d, e); g.stroke(); g.fillText(String(z), 4, b - 2); }
      return c.toDataURL('image/png');
    }, box);
    writeFileSync(`${OUT}/${NAME}-${tag}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await ctx.close();
} finally {
  await browser.close();
}
