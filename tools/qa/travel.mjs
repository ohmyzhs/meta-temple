// 장소 전환 검사 — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/travel.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080.
// 디졸브(가림막)는 없앴다 — 맵이 한 공간이라 어색하기만 했다 (사용자 2026-11-06 「제거해라」). 가림막은 예불 듣기에만 남는다.
// 기준:
//   (a) 가람 이동 4곳(app.travelTo): 가림막 없이(불투명도 0) 바로 옮기고, 0.6초 안에 카메라가 도착 구도
//       (방위 = 바라보는 쪽 뒤, 높이각 0.22 — 실내 규칙 뒤 값) ±0.05 rad
//   (b) 걸어서 법당 문턱·산문(마당 계단)을 넘어도 가림막이 내려오지 않고 카메라를 끊어 옮기지 않는다 (방위가 넘기 전과 0.05rad 안)
//   (b') 키를 누른 채 넘으면 2초 뒤에도 가던 쪽으로 계속 가 있다 (넘은 자리에서 1.5m 이상 더 — 걷기 1.1m/s × 2초 = 2.2m)
//   (c) 예불 듣기 들어가기·나오기가 그대로 된다 (가림막 뒤에서 좌복에 앉고, 나오면 HUD·카메라가 돌아옴)
async (page) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  const out = await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.temple, W = t.world;
    t._loop = () => {};
    const { ZONES } = await import('/src/data/templeData.js');
    const { YEBUL_TRACKS } = await import('/src/data/credits.js');
    const { zoneAt } = await import('/src/world/layout.js');
    const veilEl = document.querySelector('#listen-veil');
    let clock = 80;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frames = (k) => { for (let i = 0; i < k; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    let snaps = 0, veiled = false;
    const snap = W.snapCameraTo.bind(W);
    let atSnap = null;
    W.snapCameraTo = (...a) => { snaps++; atSnap = { target: a }; snap(...a); };
    const watchVeil = () => (veiled ||= veilEl.classList.contains('on') || +getComputedStyle(veilEl).opacity > 0.01);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const framing = () => {
      const o = W.camera.position.clone().sub(W.cam.focus);
      return { yaw: Math.atan2(o.x, o.z), pitch: Math.asin(o.y / o.length()), dist: o.length() };
    };
    const lines = [];
    // (a) 가람 이동
    for (const id of Object.keys(ZONES)) {
      atSnap = null;
      veiled = false;
      t.avatars.teleport(0, 30, Math.PI);
      frames(5);
      await t.travelTo(id);
      watchVeil();
      for (let i = 0; i < 18; i++) { frames(1); watchVeil(); } // 0.6초
      if (!atSnap) { lines.push(`FAIL 이동 → ${ZONES[id].short}: 카메라 옮김 없음`); continue; }
      const [yaw, pitch] = atSnap.target;
      const f = framing();
      const dy = Math.abs(wrap(f.yaw - yaw)), dp = Math.abs(f.pitch - pitch);
      const ok = !veiled && dy <= 0.05 && dp <= 0.05;
      lines.push(`${ok ? 'PASS' : 'FAIL'} 이동 → ${ZONES[id].short}: 가림막 ${veiled ? '내려옴 ✗' : '없음'} | 0.6초 뒤 방위 차 ${dy.toFixed(3)} 높이각 차 ${dp.toFixed(3)} rad (거리 ${f.dist.toFixed(2)})`);
    }
    // (b) 걸어서 문턱 넘기: 가림막·카메라 끊기 없이
    const walk = async (from, to, label) => {
      t.avatars.teleport(from[0], from[1], from[2]);
      W.cam.yaw = from[2] - Math.PI;
      W.cam.userTurnAt = performance.now() + 1e9; // 따라 돌기를 잠가 둔다 (방위가 넘기 전과 같은지 보려고)
      frames(30);
      const z0 = zoneAt(from[0], from[1]);
      const yaw0 = W.cam.yaw;
      snaps = 0;
      veiled = false;
      t.avatars.moveTo(to[0], to[1]);
      let crossed = false;
      for (let i = 0; i < 300 && t.avatars.moveTarget; i++) {
        frames(1);
        watchVeil();
        const p = t.player.root.position;
        crossed ||= zoneAt(p.x, p.z) !== z0;
        await sleep(4);
      }
      W.cam.userTurnAt = 0;
      const dy = Math.abs(wrap(W.cam.yaw - yaw0));
      const ok = crossed && !veiled && snaps === 0 && dy <= 0.05;
      lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}: 넘음 ${crossed ? 'O' : 'X'} · 가림막 ${veiled ? '내려옴 ✗' : '없음'} · 카메라 끊기 ${snaps}번 · 방위 차 ${dy.toFixed(3)}`);
    };
    await walk([0, -16, Math.PI], [0, -23], '걸어서 법당 문턱 (마당→법당)');
    await walk([0, -22.5, 0], [0, -16], '걸어서 법당 문턱 (법당→마당)');
    await walk([0, 8.5, Math.PI], [0, 1.5], '걸어서 산문 (숲길→마당 계단)');
    // (b') 키를 누른 채 문턱을 넘어도 가던 쪽으로 계속 간다 (카메라 기준 이동이라 방위가 뒤집히면 되돌아 걷는다)
    const zn = (p) => zoneAt(p.x, p.z);
    const held = async (from, key, label, zone) => {
      t.avatars.teleport(from[0], from[1], Math.PI);
      W.cam.yaw = 0; // 카메라는 남쪽: S 를 누르면 남쪽(카메라 쪽)으로 걷는다
      frames(30);
      t.keys = { [key]: true };
      let crossZ = null;
      for (let i = 0; i < 300 && crossZ === null; i++) {
        frames(1);
        const p = t.player.root.position;
        if (zn(p) === zone) crossZ = p.z;
      }
      frames(60); // 2초
      const p = t.player.root.position;
      t.keys = {};
      const pass = crossZ !== null && p.z - crossZ > 1.5 && zn(p) === zone;
      lines.push(`${pass ? 'PASS' : 'FAIL'} ${label}: 넘은 z ${crossZ?.toFixed(2) ?? '-'} → 2초 뒤 z ${p.z.toFixed(2)} 구역 ${zn(p)}`);
    };
    await held([0, -24], 'KeyS', 'S 누른 채 법당 → 마당', 'COURTYARD');
    await held([0, 2], 'KeyS', 'S 누른 채 마당 → 숲길', 'FOREST');
    // (c) 예불 듣기 들어가기·나오기 (가림막은 여기서만)
    W.snapCameraTo = snap;
    t.avatars.teleport(0, 1, Math.PI);
    frames(5);
    t.listen(YEBUL_TRACKS[0]);
    for (let i = 0; i < 60; i++) { frames(1); await sleep(16); }
    const inL = { listening: !!t._listening, cushion: t._listening?.cushion != null, shot: !!W.cam.shot, body: document.body.classList.contains('listening'), panel: !document.querySelector('#listen').classList.contains('hidden') };
    t.exitListening();
    for (let i = 0; i < 60; i++) { frames(1); await sleep(16); }
    const outL = { listening: !!t._listening, shot: !!W.cam.shot, body: document.body.classList.contains('listening'), panel: !document.querySelector('#listen').classList.contains('hidden'), mode: W.cam.mode };
    const okL = inL.listening && inL.cushion && inL.shot && inL.body && inL.panel && !outL.listening && !outL.shot && !outL.body && !outL.panel;
    lines.push(`${okL ? 'PASS' : 'FAIL'} 예불 듣기: 들어감 ${JSON.stringify(inL)} / 나옴 ${JSON.stringify(outL)}`);
    return lines;
  });
  const pass = out.every((l) => l.startsWith('PASS'));
  return `travel.mjs ${pass ? 'PASS' : 'FAIL'}\n` + out.join('\n');
}
