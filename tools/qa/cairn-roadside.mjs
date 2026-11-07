// 길가 돌탑 — node tools/qa/cairn-roadside.mjs OUTDIR [high|low]   (먼저 python3 .claude/devserver.py 8098, BASE=http://localhost:8098)
// 사용자 2026-11-08 「돌쌓기를 길바닥 아무 데나 할 수 있는 거 수정 필요 → 근처 길가로 옮겨서 쌓을 것」
// 1) 길 폭 실측: 순환로·숲길 중심선에서 바깥으로 흙빛(지면 정점 색)이 끝나는 거리, 울타리 기둥 거리 + 위에서 내려다본 사진
// 2) 실서버 옛 돌탑 12개(2026-11-08 /api/shared): 길 위에 그리던 자리(전) → 길가로 옮겨 그린 자리(후) 사진
// 3) 길 위에서 쌓기: 순환로·숲길 한가운데 서서 알약 → 길가 자리 표시 → 걸어감 → 창 열림 → 돌 얹음 (장면마다 사진)
// 4) 덮는 범위: 순환로·숲길 2m 마다 한가운데서 길가 자리를 찾을 수 있는가, 걸어갈 거리
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const [OUT = 'cairn-roadside', Q = 'high'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

// 실서버 돌탑 (2026-11-08 https://temple.lotiony.com/api/shared 의 cairns, 공개 자료)
const LIVE = [
  ['c_1ba6ac3c-1567-4016-8879-aff6a20256c2', 0, 35.1, 12], ['c_3d7b7576-1290-40e7-a299-5b2ed60abcd1', -4.91, 8.6, 2],
  ['c_7549d439-b449-404b-b0e4-5be1b8abb53e', 0, 33.1, 4], ['c_27bb3cb9-8cbd-424a-918e-0da247738991', -3.29, 34.62, 1],
  ['c_9db0aa3f-da5c-4218-8599-c1212fdd1c6c', 4.64, 6.59, 1], ['c_d537c005-9415-45b2-8a31-ee128a968ac2', 0.57, 30.79, 4],
  ['c_ac91b525-2929-4eb5-91db-e731f5bea8a1', 1.64, 34.58, 1], ['c_728399bd-76af-44cf-8044-3821d18128dd', 0.93, 26.08, 1],
  ['c_3985f695-e468-458c-9b5f-f79d74978e7a', 2.86, 28.62, 1], ['c_96bbcb09-f907-4679-b534-5bf1d0d92afd', 5.87, -50.05, 2],
  ['c_39a16d94-fac2-4e28-ac35-27f5498b8696', 25.3, 55.55, 1], ['c_a8314b48-80ae-44b0-98a6-ae704db83902', 0.77, 44.66, 1]
].map(([id, x, z, n]) => ({ id, x, z, n }));

const browser = await launch();
const report = { q: Q };
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await ctx.addInitScript(() => {
    let s = 1234567;
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    window.TEMPLE_CONFIG = { liveUrl: 'http://127.0.0.1:59999' };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=${Q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector('#intro-enter').click());
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 120000 });
  await page.waitForFunction(() => !window.temple.world.outdoorReady || window.temple.world.outdoorReady.done, null, { timeout: 120000 }).catch(() => errors.push('outdoor assets timeout'));
  await page.evaluate((live) => {
    const st = document.createElement('style');
    st.textContent = '#toast-stack{visibility:hidden!important} .name-label{visibility:hidden!important}';
    document.head.appendChild(st);
    const t = window.temple;
    t._loop = () => {};
    t.store.mergeShared({ cairns: live });
    t.temple.cairns.setCairns(t.store.cairnList());
    const W = t.world;
    W.setTimeOfDay('day');
    W.hour = W.hourTarget;
    W.applyEnv(true);
    window.__frames = (n = 30, dt = 1 / 30) => {
      for (let i = 0; i < n; i++) t._frame(dt, (window.__t = (window.__t || 80) + dt));
    };
    window.__cam = (pos, look) => {
      W.camera.position.set(...pos);
      W.camera.lookAt(...look);
      W.render();
    };
  }, LIVE);
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

  // 1) 길 폭 실측
  report.width = await page.evaluate(async () => {
    const { trail, nearestTrail, fenceRuns, FENCE_OFF } = await import('./src/world/trail.js');
    const { pathX } = await import('./src/world/layout.js');
    const W = window.temple.world;
    let ground = null;
    W.scene.traverse((o) => o.isMesh && o.geometry?.attributes?.color && o.geometry.attributes.aTrod && (ground = o));
    const pos = ground.geometry.attributes.position, trod = ground.geometry.attributes.aTrod;
    // 다져진 길(aTrod — terrain.js 가 흙빛과 같은 띠로 넣는다) 이 0.5 를 넘는 정점까지의 거리
    const bins = { loop: [], forest: [] };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (trod.getX(i) < 0.5) continue;
      const fp = Math.abs(x - pathX(z));
      const n = nearestTrail(x, z);
      if (z > 12 && z < 44 && fp < 4) {
        if (!n || n.d > 6) bins.forest.push(fp);
      } else {
        if (n && (z < 5 || z > 50 || Math.abs(x - pathX(z)) > 8)) bins.loop.push(n.d);
      }
    }
    const q = (a, p) => a.sort((x, y) => x - y)[Math.floor(a.length * p)];
    const posts = fenceRuns().flatMap((r) => r.pts).map((p) => trail.nearest(p.x, p.z)?.d).filter((d) => d != null);
    return { trodLoopP95: +q(bins.loop, 0.95).toFixed(2), trodLoopMax: +q(bins.loop, 0.999).toFixed(2), trodForestP95: +q(bins.forest, 0.95).toFixed(2), trodForestMax: +q(bins.forest, 0.999).toFixed(2), fenceOff: FENCE_OFF, fencePostMedian: +q(posts, 0.5).toFixed(2) };
  });
  // 위에서 내려다본 순환로 (울타리 있는 서쪽 굽이길) — 빨강 1.5m(걷는 띠)·주황 2.45m(울타리 띠)·초록 2.8m(길가 돌탑) 선
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { trail } = await import('./src/world/trail.js');
    const { walkHeight } = await import('./src/world/layout.js');
    const W = window.temple.world, g = new THREE.Group();
    g.name = 'qa-lines';
    const s0 = trail.nearest(-51, -3).s;
    for (const [off, col] of [[1.5, 0xff3030], [2.45, 0xff9a20], [2.8, 0x30ff60]]) {
      for (const side of [-1, 1]) {
        const pts = [];
        for (let s = s0 - 9; s <= s0 + 9; s += 0.5) {
          const a = trail.at(s - 0.3), b = trail.at(s + 0.3), c = trail.at(s), l = Math.hypot(b.x - a.x, b.z - a.z);
          const x = c.x + (-(b.z - a.z) / l) * off * side, z = c.z + ((b.x - a.x) / l) * off * side;
          pts.push(new THREE.Vector3(x, walkHeight(x, z) + 0.08, z));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, depthTest: false })));
      }
    }
    W.scene.add(g);
    const c = trail.at(s0);
    window.temple.avatars.teleport(c.x + 30, c.z, 0);
    window.__frames(20);
    window.__cam([c.x + 0.01, c.h + 13, c.z + 0.01], [c.x, c.h, c.z]);
  });
  await shot('0-width-topdown');
  await page.evaluate(() => {
    const W = window.temple.world;
    W.scene.remove(W.scene.getObjectByName('qa-lines'));
  });

  // 2) 실서버 옛 돌탑: 전(길 위 자리 그대로) / 후(길가로 옮겨 그림) — 스폰 앞 숲길·일주문
  const views = { spawn: [[3.5, 3.2, 41], [0, 0.6, 30]], gate: [[5.5, 3.4, 21.5], [0, 1, 29]] };
  for (const [name, [pos, look]] of Object.entries(views)) {
    for (const when of ['before', 'after']) {
      await page.evaluate(({ when, pos, look }) => {
        const t = window.temple, cf = t.temple.cairns;
        t.avatars.teleport(pos[0] - 1.2, pos[2] + 1, Math.PI);
        if (when === 'before') {
          cf.all = t.store.cairnList(); // 옛 그리기: 받은 자리 그대로
          cf._refresh(pos[0], pos[2]);
        } else cf.setCairns(t.store.cairnList());
        window.__frames(10);
        cf._refresh(pos[0], pos[2]);
        window.__cam(pos, look);
      }, { when, pos, look });
      await shot(`1-${name}-${when}`);
    }
  }
  report.moved = await page.evaluate(async () => {
    const { nearestPath } = await import('./src/core/cairns.js');
    const { ROADSIDE_GEO } = await import('./src/core/roadsideGeo.js');
    const t = window.temple, raw = new Map(t.store.cairnList().map((c) => [c.id, c]));
    return t.temple.cairns.all.map((c) => ({ id: c.id.slice(2, 8), n: c.n, from: [raw.get(c.id).x, raw.get(c.id).z], to: [c.x, c.z], dFrom: +nearestPath(ROADSIDE_GEO, raw.get(c.id).x, raw.get(c.id).z).d.toFixed(2), dTo: +nearestPath(ROADSIDE_GEO, c.x, c.z).d.toFixed(2) }));
  });

  // 3) 길 위에서 쌓기 → 길가로 걸어가 쌓기
  const scenes = { loop: [-43.1, -12.1], wall: [46.9, 6.8], forest: [0.5, 38.5], hill: [-46, -45] }; // 서쪽 나무 울타리 · 계곡 북쪽 돌담 · 일주문 숲길 · 뒷산 돌계단
  report.stack = {};
  for (const [name, [x0, z0]] of Object.entries(scenes)) {
    const r = await page.evaluate(async ({ x0, z0 }) => {
      const { nearestTrail, trail, PATHS } = await import('./src/world/trail.js');
      const { pathX, isOnPath } = await import('./src/world/layout.js');
      const t = window.temple, pl = t.player;
      // 길 한가운데, 길을 따라 보는 방향
      let x = x0, z = z0, h;
      const n = nearestTrail(x, z);
      if (n && n.d < 3) {
        const a = n.path.at(n.s - 1), b = n.path.at(n.s + 1);
        x = n.x;
        z = n.z;
        h = Math.atan2(b.x - a.x, b.z - a.z);
      } else {
        x = pathX(z);
        h = Math.PI;
      }
      t.modals.close?.();
      t.avatars.moveTarget = null;
      for (let i = 0; i < 300 && pl.busy; i++) window.__frames(1); // 앞 장면에서 돌을 얹은 몸짓이 끝날 때까지
      t.avatars.teleport(x, z, h);
      pl.heading = h;
      window.__frames(10);
      await new Promise((r) => setTimeout(r, 700));
      window.__frames(10);
      const nb = t.nearby, here = t._cairnHere();
      return { start: [+x.toFixed(2), +z.toFixed(2)], onPath: isOnPath(x, z), prompt: nb ? { id: nb.id, label: nb.label, at: nb.at, stand: nb.stand } : null, pick: here && { at: here.at, moved: here.moved, cairn: here.cairn?.id }, busy: !!pl.busy, sitting: !!pl.sitting, moving: !!t.avatars.moveTarget, still: performance.now() - t._still.t, zone: (await import('./src/world/layout.js')).zoneAt(x, z) };
    }, { x0, z0 });
    report.stack[name] = r;
    const camAt = async () =>
      page.evaluate(() => {
        const t = window.temple, p = t.player.root.position, a = t.nearby?.at || t._stoneSpot || p;
        const mx = (p.x + a.x) / 2, mz = (p.z + a.z) / 2;
        const dx = a.x - p.x, dz = a.z - p.z, l = Math.hypot(dx, dz) || 1;
        // 걷는 쪽 옆 뒤에서 비스듬히
        window.__cam([mx - (dz / l) * 5.5 - (dx / l) * 2.5, p.y + 4.2, mz + (dx / l) * 5.5 - (dz / l) * 2.5], [mx, p.y + 0.3, mz]);
      });
    await camAt();
    await shot(`2-${name}-a-prompt`);
    if (!r.prompt?.stand) continue;
    const done = await page.evaluate(async () => {
      const t = window.temple;
      t._activateNearby();
      for (let i = 0; i < 30 * 20 && !t.modals.isOpen; i++) {
        window.__frames(1);
        if (i === 25) window.__mid = [t.player.root.position.x, t.player.root.position.z];
      }
      return { open: t.modals.isOpen, current: t.modals.current, pos: [+t.player.root.position.x.toFixed(2), +t.player.root.position.z.toFixed(2)], spot: t._stoneSpot };
    });
    report.stack[name].arrive = done;
    await camAt();
    await shot(`2-${name}-b-arrived`);
    const after = await page.evaluate(async () => {
      const { nearestPath, roadsideOk } = await import('./src/core/cairns.js');
      const { ROADSIDE_GEO } = await import('./src/core/roadsideGeo.js');
      const { isOnPath } = await import('./src/world/layout.js');
      const t = window.temple;
      for (let k = 0; k < 7; k++) {
        t.modals.cb.onAddStone(`길가 시험 ${k}`, false);
        window.__frames(45);
      }
      t.modals.close();
      window.__frames(10);
      const c = t.temple.cairns.pin;
      return { cairn: { x: c.x, z: c.z, n: c.n }, d: +nearestPath(ROADSIDE_GEO, c.x, c.z).d.toFixed(2), roadsideOk: roadsideOk(c.x, c.z, ROADSIDE_GEO), onPath: isOnPath(c.x, c.z) };
    });
    report.stack[name].built = after;
    await page.evaluate(() => {
      const t = window.temple, p = t.player.root.position, c = t.temple.cairns.pin;
      const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1;
      // 길 쪽 옆에서: 캐릭터·울타리·돌탑이 함께 보이게
      window.__cam([p.x - (dx / l) * 1.2 - (dz / l) * 3.6, p.y + 2.2, p.z - (dz / l) * 1.2 + (dx / l) * 3.6], [(p.x + c.x) / 2, p.y + 0.1, (p.z + c.z) / 2]);
    });
    await shot(`2-${name}-c-built`);
  }

  // 4) 덮는 범위
  report.coverage = await page.evaluate(async () => {
    const { trail, forestPathX } = await import('./src/world/trail.js');
    const { pickCairnSpot } = await import('./src/world/cairnSpot.js');
    const t = window.temple, list = t._cairnsWithGate(), ok = (x, z) => t._standable(x, z);
    const run = (pts) => {
      let found = 0, moved = 0, walk = 0, none = [];
      for (const [x, z, h] of pts) {
        const fx = x + Math.sin(h) * 0.9, fz = z + Math.cos(h) * 0.9;
        const s = pickCairnSpot(fx, fz, list, ok);
        if (!s) {
          none.push([+x.toFixed(1), +z.toFixed(1)]);
          continue;
        }
        found++;
        if (s.stand) {
          moved++;
          walk += Math.hypot(s.stand.x - x, s.stand.z - z);
        }
      }
      return { samples: pts.length, found, moved, meanWalk: +(walk / Math.max(moved, 1)).toFixed(2), noneSample: none.filter((_, i) => i % 4 === 0).slice(0, 12) };
    };
    const loopPts = [];
    for (let s = 2; s < trail.length - 2; s += 2) {
      const a = trail.at(s - 0.5), b = trail.at(s + 0.5), c = trail.at(s);
      loopPts.push([c.x, c.z, Math.atan2(b.x - a.x, b.z - a.z)]);
    }
    const forestPts = [];
    for (let z = 10; z < 46; z += 2) forestPts.push([forestPathX(z), z, Math.PI]);
    const t0 = performance.now();
    const res = { loop: run(loopPts), forest: run(forestPts) };
    res.msPerPick = +((performance.now() - t0) / (loopPts.length + forestPts.length)).toFixed(2);
    return res;
  });
} finally {
  report.errors = errors;
  await browser.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
