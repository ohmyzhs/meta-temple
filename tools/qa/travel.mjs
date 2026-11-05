// 장소 전환 디졸브 검사 (Task C3) — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/travel.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080.
// 기준:
//   (a) 가람 이동 4곳(app.travelTo): 카메라를 옮기는 순간 가림막(#listen-veil) 불투명도 ≥ 0.99,
//       그 뒤 0.6초 안에 카메라가 도착 구도(방위 = 바라보는 쪽 뒤, 높이각 0.22 — 실내 규칙 뒤 값) ±0.05 rad
//   (b) 걸어서 법당 문턱·산문(마당 계단)을 넘으면 가림막이 한 번 내려오고, 같은 기준으로 진행 방향 뒤 구도
//   (b') 키를 누른 채 넘으면 카메라 방위를 그대로 두어, 2초 뒤에도 가던 쪽으로 계속 가 있다
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
    const { YEBUL_TRACKS } = await import('/src/data/soundCredits.js');
    const veilEl = document.querySelector('#listen-veil');
    let clock = 80;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frames = (k) => { for (let i = 0; i < k; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    // 카메라를 옮기는 순간의 가림막 불투명도를 잡는다
    let atSnap = null;
    const snap = W.snapCameraTo.bind(W);
    W.snapCameraTo = (...a) => { atSnap = { opacity: +getComputedStyle(veilEl).opacity, target: a }; snap(...a); };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const framing = () => {
      const o = W.camera.position.clone().sub(W.cam.focus);
      return { yaw: Math.atan2(o.x, o.z), pitch: Math.asin(o.y / o.length()), dist: o.length() };
    };
    const judge = (label) => {
      if (!atSnap) return `${label}: 카메라 옮김 없음 ✗`;
      const [yaw, pitch] = atSnap.target;
      frames(18); // 0.6초
      const f = framing();
      const dy = Math.abs(wrap(f.yaw - yaw)), dp = Math.abs(f.pitch - pitch);
      const ok = atSnap.opacity >= 0.99 && dy <= 0.05 && dp <= 0.05;
      return `${ok ? 'PASS' : 'FAIL'} ${label}: 가림막 ${atSnap.opacity.toFixed(3)} | 0.6초 뒤 방위 차 ${dy.toFixed(3)} 높이각 차 ${dp.toFixed(3)} rad (거리 ${f.dist.toFixed(2)})`;
    };
    const lines = [];
    // (a) 가람 이동
    for (const id of Object.keys(ZONES)) {
      atSnap = null;
      t.avatars.teleport(0, 30, Math.PI);
      t._walkZone = 'FOREST';
      frames(5);
      await t.travelTo(id);
      lines.push(judge(`이동 → ${ZONES[id].short}`));
      await sleep(1500); // 가림막이 걷히도록
    }
    // (b) 걸어서 문턱 넘기: 시간이 흘러야 가림막 타이머가 돈다
    const walk = async (from, to, label) => {
      t.avatars.teleport(from[0], from[1], from[2]);
      W.cam.yaw = from[2] - Math.PI;
      frames(30);
      await sleep(2100); // 앞 디졸브 쿨다운
      t._walkZone = null;
      frames(2);
      atSnap = null;
      let veiled = false;
      t.avatars.moveTo(to[0], to[1]);
      for (let i = 0; i < 240 && !atSnap; i++) {
        frames(1);
        veiled ||= veilEl.classList.contains('on');
        await sleep(16);
      }
      lines.push(`${veiled ? '' : '가림막 안 내려옴 ✗ '}` + judge(label));
      await sleep(1500);
    };
    await walk([0, -16, Math.PI], [0, -23], '걸어서 법당 문턱 (마당→법당)');
    await walk([0, -22.5, 0], [0, -16], '걸어서 법당 문턱 (법당→마당)');
    await walk([0, 8.5, Math.PI], [0, 1.5], '걸어서 산문 (숲길→마당 계단)');
    // (b') 키를 누른 채 문턱을 넘어도 가던 쪽으로 계속 간다 (카메라 기준 이동이라 방위가 뒤집히면 되돌아 걷는다)
    const held = async (from, key, label, zone, ok) => {
      t.avatars.teleport(from[0], from[1], Math.PI);
      W.cam.yaw = 0; // 카메라는 남쪽: S 를 누르면 남쪽(카메라 쪽)으로 걷는다
      frames(30);
      await sleep(2100);
      t._walkZone = null;
      frames(2);
      atSnap = null;
      t.keys = { [key]: true };
      for (let i = 0; i < 300 && !atSnap; i++) { frames(1); await sleep(16); }
      frames(60); // 디졸브 뒤 2초
      const p = t.player.root.position;
      t.keys = {};
      const pass = !!atSnap && ok(p);
      lines.push(`${pass ? 'PASS' : 'FAIL'} ${label}: 디졸브 ${atSnap ? 'O' : 'X'} | 2초 뒤 z ${p.z.toFixed(2)} 구역 ${zone(p)}`);
      await sleep(1500);
    };
    const { zoneAt } = await import('/src/world/layout.js');
    const zn = (p) => zoneAt(p.x, p.z);
    await held([0, -24], 'KeyS', 'S 누른 채 법당 → 마당', zn, (p) => p.z > -17 && zn(p) === 'COURTYARD');
    await held([0, 2], 'KeyS', 'S 누른 채 마당 → 숲길', zn, (p) => p.z > 9 && zn(p) === 'FOREST');
    // (c) 예불 듣기 들어가기·나오기
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
