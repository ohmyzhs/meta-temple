// 카메라 가림 검사 (Task C4) — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/occlusion.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080. 스크린샷은 MCP 작업 폴더 기준 OUT.
//
// 가림체(QA 쪽에서 앱과 따로 고른다): 지붕 재질(roofTop·roofUnder·roofEdge·ridge·ridgeWhite), 담·벽(stoneDark·plaster·담 회벽),
// 창호·마루처럼 여러 재질을 쓴 woodDark 상자. 합쳐진 메쉬는 4m 칸으로 잘라 광선 검사를 빠르게 한다.
// 경로: 숲길 → 일주문 통과 → 다리 → 마당 → 석탑 옆 → 대웅전 계단·문턱 → 법당 안 → 다시 마당 → 다실 가는 담 사이 길 → 다실.
// 걷기: 앱의 moveTo(누르면 걸어가기). 앱은 카메라 방위를 스스로 돌리지 않으므로, 구간을 시작할 때마다 사용자가 화면을 돌려 놓듯
// 방위를 정한다. 같은 경로를 세 가지 시점으로 걷는다 — 뒤(기본 높이·거리 0.22/9), 뒤 높이(드론 0.75/10), 옆(진행 방향 왼쪽 90°, 0.35/8).
// 0.1초마다 표본.
// 기준: 막힘(effective) ≤ 5%, 카메라가 지붕·벽 안 = 0.
//   raw       = 카메라→머리 선분이 가림체에 닿음
//   effective = raw 이면서, 닿은 재질이 앱이 디더로 비추는 재질이 아니거나(material.userData.seeThrough) 그 순간 비춤 양(W.see.amt) < 0.5
//   inside    = 카메라에서 위·아래 광선이 모두 뒷면에 먼저 닿음(지붕 판 속) 또는 동·서/남·북 광선이 모두 뒷면(벽 상자 속), 1.5m 안,
//               또는 법당 다락(아래로 천장 윗면, 위로 지붕)
async (page) => {
  const OUT = '.playwright-mcp/qa/occlusion';
  await page.setViewportSize({ width: 1280, height: 800 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  const setup = await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.temple, W = t.world;
    t._loop = () => {};
    const THREE = await import('three');
    const { mats } = await import('/src/world/materials.js');
    const { L, streamZ } = await import('/src/world/layout.js');
    const { ceilingTexture } = await import('/src/world/textures.js');
    const ceilTex = ceilingTexture();
    const m = mats();
    const roofSet = new Set([m.roofTop, m.roofUnder, m.roofEdge, m.ridge, m.ridgeWhite]);
    const wallSet = new Set([m.stoneDark, m.plaster]);
    const kindOf = (o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((x) => x.map === ceilTex)) return 'ceiling';
      if (ms.some((x) => roofSet.has(x))) return 'roof';
      if (ms.some((x) => wallSet.has(x) || (x.color?.getHex() === 0xd9ccb0 && x.map))) return 'wall';
      if (Array.isArray(o.material) && ms.includes(m.woodDark)) return 'wall';
      return null;
    };
    // 가림체를 4m 칸으로 나눈 양면 대리 메쉬
    const side = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    W.scene.updateMatrixWorld(true);
    const cells = new Map();
    W.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      const kind = kindOf(o);
      if (!kind) return;
      const g = o.geometry, pos = g.attributes.position, idx = g.index;
      const mat = Array.isArray(o.material) ? o.material : [o.material];
      const n = idx ? idx.count : pos.count;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
        // 여러 재질 메쉬는 면 무리(group)로 재질을 고른다
        let mi = 0;
        if (g.groups.length) for (const gr of g.groups) if (i >= gr.start && i < gr.start + gr.count) mi = gr.materialIndex;
        const key = `${kind}|${Math.floor((a.x + b.x + c.x) / 12)},${Math.floor((a.z + b.z + c.z) / 12)}|${mat[mi]?.uuid}`;
        if (!cells.has(key)) cells.set(key, { kind, mat: mat[mi], v: [] });
        cells.get(key).v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    });
    const occ = [];
    for (const { kind, mat, v } of cells.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, side);
      mesh.userData = { kind, mat };
      mesh.updateMatrixWorld(true);
      occ.push(mesh);
    }
    const ray = new THREE.Raycaster();
    const hitsBetween = (from, to) => {
      const d = to.clone().sub(from), len = d.length();
      ray.set(from, d.normalize());
      ray.near = 0.02;
      ray.far = Math.max(0.03, len - 0.05);
      return ray.intersectObjects(occ, false);
    };
    const n3 = new THREE.Vector3();
    const back = (from, dir) => {
      ray.set(from, dir);
      ray.near = 0;
      ray.far = 1.5;
      const h = ray.intersectObjects(occ, false)[0];
      if (!h) return null;
      n3.copy(h.face.normal); // 대리 메쉬는 월드 좌표 그대로
      return n3.dot(dir) > 0;
    };
    const AX = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
    const first = (from, dir, far) => {
      ray.set(from, dir); ray.near = 0; ray.far = far;
      return ray.intersectObjects(occ, false)[0];
    };
    const inside = (p) => {
      const r = AX.map((d) => back(p, d));
      if ((r[0] && r[1]) || (r[2] && r[3]) || (r[4] && r[5])) return true;
      // 다락: 아래로 처음 닿는 게 천장 윗면이고 위로 처음 닿는 게 지붕이면 지붕과 천장 사이
      const dn = first(p, AX[1], 20), up = first(p, AX[0], 20);
      return dn?.object.userData.kind === 'ceiling' && dn.face.normal.dot(AX[1]) > 0 && up?.object.userData.kind === 'roof';
    };
    const head = () => {
      const pl = t.player.root, av = pl.userData.avatar;
      return av?.eyeWorld ? av.eyeWorld(new THREE.Vector3()) : pl.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    };
    let clock = 80;
    const frames = (k) => { for (let i = 0; i < k; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    const sample = () => {
      const cam = W.camera.position.clone(), h = head();
      const hits = hitsBetween(cam, h);
      const amt = W.see?.amt ?? 0;
      const raw = hits.length > 0;
      const eff = raw && hits.some((x) => !(x.object.userData.mat?.userData?.seeThrough && amt >= 0.5));
      return { raw, eff, inside: inside(cam), kind: hits[0]?.object.userData.kind, cam: cam.toArray().map((v) => +v.toFixed(2)), p: t.player.root.position.toArray().map((v) => +v.toFixed(2)) };
    };
    window.__occ = {
      // 양성 대조: 검사기가 실제로 잡는지
      controls() {
        const out = {};
        // 대웅전 처마 판 속: 정면 벽(z -20.4)과 처마 끝 사이에서 아래·위로 쏘아 판 두께 가운데
        const x = 0, z = -18.6;
        ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)); ray.near = 0; ray.far = 40;
        const top = ray.intersectObjects(occ.filter((o) => o.userData.kind === 'roof'), false)[0];
        ray.set(new THREE.Vector3(x, 4.2, z), new THREE.Vector3(0, 1, 0)); ray.far = 20;
        const bot = ray.intersectObjects(occ.filter((o) => o.userData.kind === 'roof'), false)[0];
        const mid = top && bot ? new THREE.Vector3(x, (top.point.y + bot.point.y) / 2, z) : null;
        out.roofSlab = { top: top?.point.y.toFixed(3), under: bot?.point.y.toFixed(3), inside: mid ? inside(mid) : null, insideAbove: top ? inside(new THREE.Vector3(x, top.point.y + 0.6, z)) : null, insideBelow: bot ? inside(new THREE.Vector3(x, bot.point.y - 0.6, z)) : null };
        // 마당 동쪽 담 뒤: 머리(마당 안) ↔ 카메라(담 바깥, 담보다 낮게)
        const hd = new THREE.Vector3(L.courtyard.x1 - 1.2, L.courtyard.y + 1.5, -13), cm = new THREE.Vector3(L.courtyard.x1 + 2.5, L.courtyard.y + 1.4, -13);
        const hb = hitsBetween(cm, hd);
        out.behindWall = { blocked: hb.length > 0, kind: hb[0]?.object.userData.kind, insideWall: inside(new THREE.Vector3(L.courtyard.x1 + 0.5, L.courtyard.y + 0.5, -13)) };
        out.attic = { inside: inside(new THREE.Vector3(0, L.hall.floorY + 5.4, -25.4)), belowCeiling: inside(new THREE.Vector3(0, L.hall.floorY + 3.5, -25.4)) };
        out.proxies = occ.length;
        return out;
      },
      // 한 구간 걷기: 0.1초(3프레임)마다 표본
      leg(to, maxSec, pol) {
        const p = t.player.root.position;
        const dx = to[0] - p.x, dz = to[1] - p.z;
        const yaw = Math.atan2(-dx, -dz) + pol.yawOff;
        // 시점은 구간 내내 붙잡아 둔다 (문턱 디졸브가 도착 구도로 바꿔도 사용자가 다시 돌려 놓은 것처럼)
        const hold = () => Object.assign(W.cam, { yaw, pitch: pol.pitch, targetDist: pol.dist });
        hold();
        t.avatars.moveTo(to[0], to[1]);
        const out = [];
        let sec = 0;
        while (sec < maxSec) {
          hold();
          frames(3);
          sec += 0.1;
          out.push(sample());
          if (!t.avatars.moveTarget) break;
        }
        const arrived = Math.hypot(p.x - to[0], p.z - to[1]) < 0.6;
        frames(6); // 멈춘 뒤 카메라가 따라붙는 동안
        for (let i = 0; i < 2; i++) { frames(3); out.push(sample()); }
        return { samples: out, arrived, at: [+p.x.toFixed(2), +p.z.toFixed(2)] };
      },
      start(x, z) {
        t.avatars.teleport(x, z, Math.PI);
        t._walkZone = null;
        W.cam.yaw = 0;
        frames(30);
      },
      // 고정 구도 스크린샷: 플레이어를 놓고 방위·높이·거리를 정해 카메라가 자리 잡게
      pose(x, z, ry, yaw, pitch, dist) {
        t.avatars.teleport(x, z, ry);
        t._walkZone = null;
        Object.assign(W.cam, { yaw, pitch });
        W.cam.dist = W.cam.targetDist = dist;
        W.setShot(null);
        document.querySelector('#hud').style.cssText += ';opacity:0;transition:none';
        document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
        frames(45);
        return sample();
      },
      timeRay(nr) {
        const cam = W.camera.position.clone(), h = head();
        const t0 = performance.now();
        for (let i = 0; i < nr; i++) hitsBetween(cam, h);
        return (performance.now() - t0) / nr;
      },
      L: { gx: L.gate.x, bx: L.bridge.x, bz: streamZ(L.bridge.x) }
    };
    window.__qa = { setHour(h) { W.timeMode = 'fixed'; W.hour = W.hourTarget = h; W.applyEnv(true); } };
    window.__qa.setHour(13);
    return { proxies: occ.length, L: window.__occ.L };
  });

  const controls = await page.evaluate(() => window.__occ.controls());
  const { gx, bx } = setup.L;
  const ROUTE = [
    ['일주문 통과', [gx, 23.5]],
    ['다리', [bx, 10.5]],
    ['마당 계단 앞', [0, 7.4]],
    ['마당', [0, 2.6]],
    ['석탑 서쪽', [-2.6, -0.5]],
    ['석탑 옆', [-2.6, -9]],
    ['석등 옆', [-1.3, -14.6]],
    ['대웅전 계단', [0, -17.2]],
    ['문턱', [0, -20.2]],
    ['법당 안', [0, -24.4]],
    ['법당 나가기', [0, -19.0]],
    ['계단 아래', [0, -14.8]],
    ['마당 동쪽', [12, -6]],
    ['담 사이 길', [17.6, -6.2]],
    ['다실 마당', [21.6, -6.6]],
    ['다실 앞', [22.6, -11]]
  ];
  const POLICIES = [
    { name: '뒤', yawOff: 0, pitch: 0.22, dist: 9 },
    { name: '드론', yawOff: 0, pitch: 0.75, dist: 10 },
    { name: '옆', yawOff: Math.PI / 2, pitch: 0.35, dist: 8 }
  ];
  const legs = [];
  const all = [];
  for (const pol of POLICIES) {
    await page.evaluate(([x, z]) => window.__occ.start(x, z), [gx + 0.3, 35.5]);
    const ps = [];
    for (const [name, to] of ROUTE) {
      const r = await page.evaluate(([to, pol]) => window.__occ.leg(to, 25, pol), [to, pol]);
      const s = r.samples;
      if (!r.arrived || s.some((v) => v.eff || v.inside)) legs.push(`  [${pol.name}] ${name.padEnd(8)} → ${to} 도착 ${r.arrived ? 'O' : 'X ' + r.at} | 표본 ${s.length} raw ${s.filter((v) => v.raw).length} eff ${s.filter((v) => v.eff).length} inside ${s.filter((v) => v.inside).length}`);
      s.forEach((v) => all.push({ ...v, leg: `${pol.name}:${name}` }));
      ps.push(...s);
    }
    const c = (k) => ps.filter((v) => v[k]).length;
    legs.push(`[${pol.name} ${pol.pitch}/${pol.dist}] 표본 ${ps.length} raw ${c('raw')} (${((c('raw') / ps.length) * 100).toFixed(1)}%) eff ${c('eff')} (${((c('eff') / ps.length) * 100).toFixed(1)}%) inside ${c('inside')}`);
  }
  const ms = await page.evaluate(() => window.__occ.timeRay(200));
  const appMs = await page.evaluate(() => window.temple.world.occlusionMs ?? null);
  const pct = (k) => ((all.filter((v) => v[k]).length / all.length) * 100).toFixed(1);
  const worst = all.filter((v) => v.eff || v.inside).slice(0, 16).map((v) => `${v.leg} p=${v.p} cam=${v.cam} ${v.inside ? 'INSIDE' : 'blocked'}(${v.kind})`);
  // 고정 구도: 일주문 지나며 · 법당 들어서며 · 법당 나서며 · 담 사이 길 (진행 방향 뒷모습, 드론 높이 0.75/10)
  await page.waitForTimeout(2200); // 걷다가 내려온 문턱 가림막이 다 걷히도록 (0.6 + 1.4초)
  const poses = {};
  // [이름, x, z, 몸 방향 ry, 카메라 방위 yaw] — 북쪽으로 걸으면 ry π·yaw 0, 남쪽(법당을 나섬) ry 0·yaw π, 동쪽(다실) ry −π/2·yaw π/2
  for (const [name, x, z, ry, yaw] of [['gate', gx, 25.0, Math.PI, 0], ['hall-entry', 0, -20.8, Math.PI, 0], ['hall-exit', 0, -19.4, 0, Math.PI], ['passage', 18.4, -6.2, -Math.PI / 2, Math.PI / 2]]) {
    poses[name] = await page.evaluate(([x, z, ry, yaw]) => window.__occ.pose(x, z, ry, yaw, 0.75, 10), [x, z, ry, yaw]);
    await page.screenshot({ path: `${OUT}/occ-${name}.png` });
  }
  const effPct = +pct('eff'), insideN = all.filter((v) => v.inside).length;
  const pass = effPct <= 5 && insideN === 0;
  return [
    `occlusion.mjs ${pass ? 'PASS' : 'FAIL'} — 표본 ${all.length} | raw ${pct('raw')}% | effective ${effPct}% (기준 ≤5) | inside ${insideN} (기준 0)`,
    `양성 대조: ${JSON.stringify(controls)}`,
    `광선 1개(QA 대리 ${setup.proxies}개): ${ms.toFixed(3)}ms · 앱 프레임당 가림 처리: ${appMs == null ? '없음' : appMs.toFixed(3) + 'ms'}`,
    ...legs,
    '막힘·속 표본(앞 16개):',
    ...worst,
    `고정 구도: ${JSON.stringify(poses)}`
  ].join('\n');
}
