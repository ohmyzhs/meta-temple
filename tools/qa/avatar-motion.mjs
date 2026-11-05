// 블렌더 아바타 동작 확인 — 행동마다 연속 프레임을 찍는다 (GIF 는 ffmpeg 로 묶는다).
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/avatar-motion.mjs' }
//   또는 헤드리스 크롬에서 이 파일을 eval 해 page 를 넘긴다. 결과 PNG: OUT/<행동>_<번호>.png
// 시각을 멈추고 t._frame(1/30) 으로 한 프레임씩 넘기므로 매번 같은 그림이 나온다.
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8085.
async (page) => {
  const OUT = globalThis.AVATAR_QA_OUT || '/tmp/avatar-motion';
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  const fs = await import('fs');
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1500));
    const t = window.temple, W = t.world;
    t._loop = () => {};
    W.timeMode = 'fixed';
    W.hour = W.hourTarget = 13;
    W.setWeather('clear');
    W.applyEnv(true);
    document.querySelector('#hud').style.opacity = 0;
    document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
    const style = document.createElement('style');
    style.textContent = '.name-label{visibility:hidden!important}';
    document.head.appendChild(style);
    t.avatars.solo = true; // 참배객은 숨긴다 (나만)
    window.__qa = { clock: 100 };
  });
  // 한 장면: setup 한 뒤 n 프레임을 넘기며 every 프레임마다 찍는다. cam: 몸 기준 카메라 (오른쪽 x, 위 y, 앞 z)
  const scene = async (name, setup, n, every, cam) => {
    await page.evaluate(setup);
    // 걸어서 문턱을 넘는 디졸브가 내려오지 않게 지금 구역으로 맞추고, 내려와 있던 가림막이 걷히기를 기다린다
    await page.evaluate(async () => {
      const t = window.temple, p = t.player.root.position;
      const { zoneAt } = await import('/src/world/layout.js');
      t._walkZone = zoneAt(p.x, p.z);
      t.zone = null;
      t._onZoneChange?.(true);
    });
    await page.waitForTimeout(400);
    await page.waitForFunction(() => +getComputedStyle(document.querySelector('#listen-veil')).opacity < 0.01, null, { timeout: 8000 }).catch(() => {});
    const shots = [];
    for (let f = 0; f <= n; f++) {
      const box = await page.evaluate(([cam, step]) => {
        const t = window.temple, W = t.world;
        const pl = t.player, p = pl.root.position, h = pl.root.rotation.y;
        const fwd = [Math.sin(h), Math.cos(h)], right = [-Math.cos(h), Math.sin(h)];
        const pos = W.camera.position.clone().set(p.x + right[0] * cam[0] + fwd[0] * cam[2], p.y + cam[1], p.z + right[1] * cam[0] + fwd[1] * cam[2]);
        const look = pos.clone().set(p.x, p.y + cam[3], p.z);
        W.setShot({ pos, look, dur: 1e9 }, true);
        if (step) t._frame(1 / 30, (window.__qa.clock += 1 / 30));
        else t._frame(0.0001, window.__qa.clock);
        const v = look.clone().project(W.camera);
        return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, motion: pl.rig?.name, state: pl.state };
      }, [cam, f > 0]);
      if (f % every === 0) {
        const file = `${OUT}/${name}_${String(f / every).padStart(3, '0')}.png`;
        const s = 440;
        await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - s / 2), y: Math.max(0, box.y - s * 0.55), width: s, height: s } });
        shots.push(box.motion);
      }
    }
    return `${name}: ${shots.length}장 (${[...new Set(shots)].join('→')})`;
  };
  const lines = [];
  const SIDE = [2.4, 0.9, 0.4, 0.55], FRONT34 = [1.1, 0.95, 1.9, 0.62], FRONT = [0.0, 0.95, 1.9, 0.62];
  // 얼굴·차림 가까이 (낮, 경내 차수)
  lines.push(await scene('portrait', () => { const t = window.temple; t.avatars.teleport(5, 3, Math.PI); t.player.setState('idle'); for (let i = 0; i < 20; i++) t._frame(1 / 30, (window.__qa.clock += 1 / 30)); }, 0, 1, [0.5, 0.95, 1.5, 0.75]));
  // 서기 (숲길: 팔을 내림)
  lines.push(await scene('idle', () => { const t = window.temple; t.avatars.teleport(0, 30, Math.PI); t.player.setState('idle'); }, 60, 6, FRONT34));
  // 서기 (경내: 차수)
  lines.push(await scene('idle_chasu', () => { const t = window.temple; t.avatars.teleport(5, 3, Math.PI); t.player.setState('idle'); for (let i = 0; i < 20; i++) t._frame(1 / 30, (window.__qa.clock += 1 / 30)); }, 30, 6, FRONT34));
  // 걷기 (숲길, 게임 속도 2.4m/s 와 참배객 속도 1.1m/s)
  // 숲길에서 게임 속도(2.4m/s)로 가면 달리기 클립이 섞인다
  lines.push(await scene('run', () => { const t = window.temple; t.avatars.teleport(0, 33, Math.PI); t.avatars.moveTo(0.3, 20); }, 44, 2, SIDE));
  lines.push(await scene('walk', () => {
    const t = window.temple, A = t.avatars;
    A.teleport(0, 33, Math.PI);
    A.moveTarget = null;
    const orig = A.update.bind(A);
    A.update = (dt, tt, input, night) => orig(dt, tt, { x: 0, z: -1.1 / 2.4, run: false }, night); // 조이스틱 반쯤 = 1.1m/s (참배객 걸음)
    window.__qa.restore = () => (A.update = orig);
  }, 44, 2, SIDE));
  await page.evaluate(() => window.__qa.restore?.());
  // 차수 걷기 (마당)
  lines.push(await scene('walk_chasu', () => {
    const t = window.temple, A = t.avatars;
    A.teleport(6, 4, Math.PI);
    const orig = A.update.bind(A);
    A.update = (dt, tt, input, night) => orig(dt, tt, { x: 0, z: -1.1 / 2.4, run: false }, night);
    window.__qa.restore = () => (A.update = orig);
  }, 44, 2, SIDE));
  await page.evaluate(() => window.__qa.restore?.());
  // 합장 반배
  lines.push(await scene('bow_half', () => { const t = window.temple; t.avatars.teleport(5, 3, Math.PI); t.gesture('bow_half'); }, 78, 3, SIDE));
  // 탑돌이 (합장하고 시계 방향)
  lines.push(await scene('circumambulate', () => { const t = window.temple; t.avatars.teleport(0, 0.2, Math.PI); t.activate('circumambulate'); for (let i = 0; i < 60; i++) t._frame(1 / 30, (window.__qa.clock += 1 / 30)); }, 30, 3, FRONT34));
  // 큰절 (법당 좌복 위)
  lines.push(await scene('prostrate', () => {
    const t = window.temple, A = t.avatars;
    const c = t.temple.cushions[14];
    A.teleport(c.x, c.z + 0.7, Math.PI);
    A.sitAt(Object.assign(A.cushionSeat(c), { kind: 'cushion' }), 'sit');
    t.player.restState = 'sit';
    for (let i = 0; i < 30; i++) t._frame(1 / 30, (window.__qa.clock += 1 / 30));
    t._doProstration(false);
  }, 126, 3, [2.2, 0.9, 0.2, 0.4]));
  // 앉기 (반가부좌)
  lines.push(await scene('sit', () => { for (let i = 0; i < 30; i++) window.temple._frame(1 / 30, (window.__qa.clock += 1 / 30)); }, 30, 6, [0.8, 0.8, 1.6, 0.4]));
  return lines.join('\n');
}
