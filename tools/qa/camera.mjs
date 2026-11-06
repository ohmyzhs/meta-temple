// 3인칭 카메라 팔 검사 — 사용자 2026-11-06 「탑돌이 때 검은 직사각형이 번쩍이며 시야를 가린다, 투명화 말고 가리지 않게 쫓아다니는 카메라」
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/camera.mjs' }  (열린 탭이 localhost 면 그 주소, 아니면 :8080)
// 앱 바깥에서 따로 잰다: 카메라 → 머리 선분이 장면의 실제 메쉬(건물·연등 기둥·석탑·석등·나무·지형)에 닿는지 — 앱의 팔 검사(대리 메쉬·충돌체)와 다른 길.
// 내 몸·다른 도반·글자·입자·하늘·연등 줄(선)·연등(작은 장식)은 뺀다.
// 경로: (1) 탑돌이 한 바퀴 (앱의 circumambulate — 카메라가 등 뒤로 따라 돈다) (2) 숲길 → 일주문 → 마당 → 대웅전 안 (눌러서 걸어가기)
//       (3) 탑돌이를 사용자가 고정한 방위(남쪽)로 — 따라 돌기 없이 팔만으로 비키는지
// 잰 것:
//   blocked  = 머리가 0.3m 넘게 가려진 표본
//   near     = 카메라 1.5m 안의 물체가 화면을 덮은 비율 (그 거리 안만 64×64 로 그려 센다) — 「한쪽에 검은 직사각형이 번쩍」(어두운 연등 기둥이 카메라 바로 옆을 지남)
//   jump     = 0.1초 동안 카메라가 움직인 거리 (당길 때 튀는 정도)
// 기준: blocked ≤ 2%, near > 8% 인 표본 ≤ 1% (세 경로 모두)
//   jump 은 참고 — 가는 팔이 막히면 그 프레임에 당기는 것(SpringArm 방식)이라 0 이 될 수 없다. 2026-11-06 옛 판(디더) 3.5m, 새 판 따라 돌기 3.2m.
//   방위를 손으로 계속 쥔 탑돌이(tapdoriFixed)는 석탑이 사이에 들어오는 순간 1m 까지 당긴다 (손을 떼면 1.5초 뒤 등 뒤로 따라 돈다)
async (page) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  const out = await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1500));
    const t = window.temple, W = t.world;
    t._loop = () => {};
    const THREE = await import('three');
    const { L } = await import('/src/world/layout.js');
    W.timeMode = 'fixed';
    W.hour = W.hourTarget = 13;
    W.applyEnv(true);
    let clock = 80;
    const frames = (k) => { for (let i = 0; i < k; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    // 실사 석탑 등 늦게 오는 것을 기다린다
    t.avatars.teleport(0, 1.5, Math.PI);
    for (let i = 0; i < 40; i++) { frames(3); await new Promise((r) => setTimeout(r, 100)); }
    const mine = new Set();
    t.player.root.traverse((o) => mine.add(o));
    const skip = (o) => {
      if (mine.has(o) || !o.visible) return true;
      for (let p = o; p; p = p.parent) if (!p.visible || p.userData.avatar || p.userData.noPick) return true;
      if (o.isSprite || o.isPoints || o.isLine || o.isLineSegments) return true;
      if (o === t.temple.lanterns?.mesh) return true;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      return !!m && (m.transparent && m.opacity < 0.9);
    };
    const blockers = [];
    W.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !skip(o)) blockers.push(o); });
    // 나무(noPick)는 위에서 빠졌으므로 줄기·수관 메쉬를 따로 넣는다
    W.scene.traverse((o) => { if ((o.isInstancedMesh || o.isMesh) && o.userData.noPick && o.castShadow && !mine.has(o) && o.geometry?.boundingSphere?.radius !== undefined) blockers.push(o); });
    const ray = new THREE.Raycaster();
    // 카메라 1.5m 안에 있는 것만 64×64 로 검게 그려 화면을 얼마나 덮는지 센다 (광선 수천 개 대신 그리기 한 번)
    const rt = new THREE.WebGLRenderTarget(64, 64);
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const px = new Uint8Array(64 * 64 * 4);
    const nearCover = () => {
      const cam = W.camera, R = W.renderer, sc = W.scene;
      const keep = { near: cam.near, far: cam.far, bg: sc.background, fog: sc.fog, ov: sc.overrideMaterial, clr: R.getClearColor(new THREE.Color()), ca: R.getClearAlpha() };
      const hidden = [];
      sc.traverse((o) => {
        if (o.visible && (o === t.player.root || o.isPoints || o.isSprite || o.isLine || o.isLineSegments || o.userData.avatar)) { o.visible = false; hidden.push(o); }
      });
      cam.near = 0.05; cam.far = 1.5; cam.updateProjectionMatrix();
      sc.background = null; sc.fog = null; sc.overrideMaterial = black;
      R.setRenderTarget(rt); R.setClearColor(0xffffff, 1); R.clear(); R.render(sc, cam);
      R.readRenderTargetPixels(rt, 0, 0, 64, 64, px);
      R.setRenderTarget(null);
      cam.near = keep.near; cam.far = keep.far; cam.updateProjectionMatrix();
      sc.background = keep.bg; sc.fog = keep.fog; sc.overrideMaterial = keep.ov; R.setClearColor(keep.clr, keep.ca);
      hidden.forEach((o) => (o.visible = true));
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 128) n++;
      return n / (64 * 64);
    };
    const head = () => {
      const av = t.player.root.userData.avatar;
      return av?.eyeWorld ? av.eyeWorld(new THREE.Vector3()) : t.player.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    };
    const label = (o) => o.name || o.userData.occluder || o.material?.name || o.geometry?.type || o.type;
    let prev = null;
    const sample = (tag) => {
      const cam = W.camera.position.clone(), h = head();
      const d = h.clone().sub(cam), len = d.length();
      ray.set(cam, d.normalize());
      ray.near = 0.02;
      ray.far = Math.max(0.05, len - 0.3);
      const hit = ray.intersectObjects(blockers, false)[0];
      const jump = prev ? cam.distanceTo(prev) : 0;
      const near = nearCover(); // 카메라 바로 앞을 덮는 것
      prev = cam;
      const pp = t.player.root.position;
      return { tag, near, blocked: !!hit, by: hit ? label(hit.object) : null, at: hit ? +hit.distance.toFixed(2) : null, jump, arm: W.cam.arm ? +W.cam.arm.len.toFixed(2) : null, avoid: W.cam.arm ? +W.cam.arm.avoid.toFixed(3) : 0, p: [+pp.x.toFixed(1), +pp.z.toFixed(1)], c: cam.toArray().map((v) => +v.toFixed(1)), yaw: +W.cam.yaw.toFixed(2) };
    };
    const runFor = (sec, tag, each) => {
      const s = [];
      for (let k = 0; k < sec * 10; k++) {
        each?.();
        frames(3);
        s.push(sample(tag));
      }
      return s;
    };
    const res = {};
    // (1) 탑돌이 — 따라 돌기
    Object.assign(W.cam, { yaw: 0, pitch: 0.22, targetDist: 9, dist: 9 });
    t.avatars.teleport(L.pagoda.x, L.pagoda.z + L.pagoda.radius + 0.2, Math.PI / 2);
    frames(20); prev = null;
    t.activate('circumambulate');
    frames(10);
    res.tapdori = runFor(27, 'tapdori');
    // (3) 탑돌이 — 사용자가 방위를 남쪽으로 쥐고 있을 때 (따라 돌기 없음: 손으로 돌린 직후처럼)
    prev = null;
    res.tapdoriFixed = runFor(26, 'tapdori-fixed', () => { W.cam.yaw = 0; W.cam.userTurnAt = performance.now(); });
    t.avatars.teleport(0, 1.5, Math.PI);
    frames(10);
    // (2) 걸어가기
    const walk = (to, tag, sec = 40) => {
      t.avatars.moveTo(to[0], to[1]);
      const s = [];
      for (let k = 0; k < sec * 10 && t.avatars.moveTarget; k++) { frames(3); s.push(sample(tag)); }
      return s;
    };
    t.avatars.teleport(L.gate.x, 34, Math.PI);
    Object.assign(W.cam, { yaw: 0, pitch: 0.22 });
    frames(20); prev = null;
    res.walk = [...walk([L.gate.x, 23.5], 'gate'), ...walk([0, 8], 'bridge'), ...walk([0, -4], 'courtyard'), ...walk([3, -12], 'lanterns'), ...walk([0, -23], 'hall')];
    const sum = (arr) => {
      const n = arr.length, b = arr.filter((x) => x.blocked);
      const jumps = arr.map((x) => x.jump).sort((a, b) => b - a);
      const by = {};
      b.forEach((x) => (by[x.by] = (by[x.by] || 0) + 1));
      const nearBad = arr.filter((x) => x.near > 0.08);
      return { n, blockedPct: +((b.length / n) * 100).toFixed(1), nearBadPct: +((nearBad.length / n) * 100).toFixed(1), nearMax: +Math.max(...arr.map((x) => x.near)).toFixed(2), nearEx: nearBad.slice(0, 3).map((x) => ({ near: x.near, p: x.p, c: x.c, yaw: x.yaw })), by, maxJump: +jumps[0].toFixed(2), jumps2: +(jumps[1] ?? 0).toFixed(2), minArm: Math.min(...arr.map((x) => x.arm ?? 99)), maxAvoid: Math.max(...arr.map((x) => Math.abs(x.avoid))), examples: b.slice(0, 4), bigJumps: arr.map((x, i) => ({ ...x, i, before: arr[i - 1]?.arm })).filter((x) => x.jump > 1).slice(0, 6) };
    };
    return { blockers: blockers.length, armMs: +(W.armMs ?? 0).toFixed(3), tapdori: sum(res.tapdori), tapdoriFixed: sum(res.tapdoriFixed), walk: sum(res.walk) };
  });
  const ok = (s) => s.blockedPct <= 2 && s.nearBadPct <= 1;
  const pass = ok(out.tapdori) && ok(out.tapdoriFixed) && ok(out.walk);
  return `camera.mjs ${pass ? 'PASS' : 'FAIL'}\n${JSON.stringify(out, null, 1)}`;
}
