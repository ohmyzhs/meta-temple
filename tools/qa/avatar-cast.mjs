// 블렌더 아바타 — 모습 3종(동자승·삿갓 행자·연꽃 등불 정령) × 행동마다 한 장씩, 그리고 상주 스님(목 염주).
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/avatar-cast.mjs' }
// 결과 PNG: OUT/<모습>_<행동>.png. 각 장면은 시계를 멈추고 t._frame(1/30) 으로 정해진 초만큼 넘긴 뒤 찍는다.
async (page) => {
  const OUT = globalThis.AVATAR_QA_OUT || '/tmp/avatar-cast';
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  (await import('fs')).mkdirSync(OUT, { recursive: true });
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
    const st = document.createElement('style');
    st.textContent = '.name-label{visibility:hidden!important}';
    document.head.appendChild(st);
    t.avatars.solo = true;
    window.__qa = { clock: 100, step: (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (window.__qa.clock += 1 / 30)); } };
  });
  // 장면: [이름, 준비(문자열 함수), 넘길 초, 카메라 [오른쪽, 위, 앞, 볼 높이]]
  const CUSHION = 'const c = t.temple.cushions[14]; A.teleport(c.x, c.z + 0.7, Math.PI); A.sitAt(Object.assign(A.cushionSeat(c), { kind: "cushion" }), ';
  const SCENES = [
    ['idle', 'A.teleport(0, 30, Math.PI); pl.setState("idle")', 1.0, [1.1, 0.95, 1.9, 0.62]],
    ['idle_chasu', 'A.teleport(5, 3, Math.PI); pl.setState("idle")', 1.0, [1.1, 0.95, 1.9, 0.62]],
    ['walk', 'A.teleport(0, 33, Math.PI); A.moveTo(0.3, 20)', 1.2, [2.2, 0.9, 0.5, 0.55]],
    ['circumambulate', 'A.teleport(0, 0.2, Math.PI); t.activate("circumambulate")', 3.0, [1.1, 0.95, 1.9, 0.62]],
    ['look_up', 'A.teleport(-6, -6, Math.PI); pl.setState("lookUp")', 1.0, [1.1, 0.95, 1.9, 0.62]],
    ['bow_half', 'A.teleport(5, 3, Math.PI); t.gesture("bow_half")', 1.3, [2.0, 0.9, 0.6, 0.55]],
    ['incense', 'A.teleport(5, 3, Math.PI); pl.restState = null; A.triggerAction("incense")', 1.5, [1.4, 0.95, 1.6, 0.62]],
    ['offer_stone', 'A.teleport(5, 3, Math.PI); pl.play("offer_stone")', 1.55, [1.4, 0.8, 1.4, 0.4]],
    ['write_tile', 'A.teleport(5, 3, Math.PI); pl.play("write_tile")', 1.1, [1.0, 0.95, 1.5, 0.62]],
    ['hang_lantern', 'A.teleport(5, 3, Math.PI); pl.play("hang_lantern")', 0.9, [1.3, 0.95, 1.7, 0.7]],
    ['prostrate', CUSHION + '"sit"); window.__qa.step(60); t._doProstration(false)', 1.5 + 3.6, [2.2, 0.9, 0.2, 0.4]],
    ['sit', CUSHION + '"sit")', 2.5, [0.8, 0.8, 1.6, 0.4]],
    ['meditate', CUSHION + '"meditate")', 2.6, [0.8, 0.8, 1.6, 0.45]],
    ['tea', 'const s = { x: 5, y: 0.13, z: 3, ry: Math.PI }; A.sitAt({ ...s, standAt: { x: 5, z: 4 } }, "sit"); window.__qa.step(60); pl.setState("tea")', 4.7, [0.8, 0.8, 1.6, 0.45]],
    ['sutra', 'const s = t.temple.sutraSeat; A.sitAt({ ...s, standAt: { x: s.x, z: s.z + 1 } }, "sutra")', 2.2, [1.5, 1.1, 0.4, 0.35]]
  ];
  const lines = [];
  for (const style of ['monk', 'ink_wanderer', 'lantern_spirit']) {
    await page.evaluate((style) => {
      const t = window.temple;
      t.store.setAvatarStyle(style);
      t._rebuildPlayer();
    }, style);
    for (const [name, setup, sec, cam] of SCENES) {
      await page.evaluate(([setup]) => {
        const t = window.temple, A = t.avatars, pl = t.player;
        A.standUp();
        A.moveTarget = null;
        A.circling = null;
        pl.seq = null;
        pl.restState = null;
        pl.setState('idle');
        window.__qa.step(20);
        new Function('t', 'A', 'pl', setup)(t, A, pl);
      }, [setup]);
      await page.evaluate(async () => {
        const t = window.temple, p = t.player.root.position;
        const { zoneAt } = await import('/src/world/layout.js');
        t._walkZone = zoneAt(p.x, p.z);
        t.zone = null;
        t._onZoneChange?.(true);
      });
      await page.waitForTimeout(400);
      await page.waitForFunction(() => +getComputedStyle(document.querySelector('#listen-veil')).opacity < 0.01, null, { timeout: 8000 }).catch(() => {});
      const box = await page.evaluate(([sec, cam]) => {
        const t = window.temple, W = t.world, pl = t.player;
        const n = Math.round(sec * 30);
        for (let i = 0; i <= n; i++) {
          const p = pl.root.position, h = pl.root.rotation.y;
          const pos = W.camera.position.clone().set(p.x - Math.cos(h) * cam[0] + Math.sin(h) * cam[2], p.y + cam[1], p.z + Math.sin(h) * cam[0] + Math.cos(h) * cam[2]);
          const look = pos.clone().set(p.x, p.y + cam[3], p.z);
          W.setShot({ pos, look, dur: 1e9 }, true);
          t._frame(1 / 30, (window.__qa.clock += 1 / 30));
        }
        const p = pl.root.position;
        const v = pos0(p.x, p.y + cam[3], p.z);
        function pos0(x, y, z) { return W.camera.position.clone().set(x, y, z).project(W.camera); }
        return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, clip: pl.rig?.name || pl.state, rig: !!pl.rig };
      }, [sec, cam]);
      const s = 420;
      await page.screenshot({ path: `${OUT}/${style}_${name}.png`, clip: { x: Math.max(0, Math.min(960 - s, box.x - s / 2)), y: Math.max(0, Math.min(720 - s, box.y - s * 0.55)), width: s, height: s } });
      lines.push(`${style} ${name}: ${box.rig ? '블렌더' : '절차식'} ${box.clip}`);
    }
  }
  // 연꽃 등불 정령 밤 (등불처럼 밝아진다)
  await page.evaluate(() => {
    const t = window.temple, W = t.world, A = t.avatars;
    W.hour = W.hourTarget = 0;
    W.applyEnv(true);
    A.standUp();
    A.teleport(0, 30, Math.PI);
    t.player.setState('idle');
    window.__qa.step(30);
    const p = t.player.root.position, h = t.player.root.rotation.y;
    W.setShot({ pos: W.camera.position.clone().set(p.x - Math.cos(h) * 1.1 + Math.sin(h) * 1.9, p.y + 0.95, p.z + Math.sin(h) * 1.1 + Math.cos(h) * 1.9), look: W.camera.position.clone().set(p.x, p.y + 0.62, p.z), dur: 1e9 }, true);
    window.__qa.step(10);
  });
  await page.screenshot({ path: `${OUT}/lantern_spirit_night.png`, clip: { x: 270, y: 120, width: 420, height: 420 } });
  await page.evaluate(() => { const W = window.temple.world; W.hour = W.hourTarget = 13; W.applyEnv(true); });
  // 상주 스님 (법당 좌선, 목 염주) — 참배객을 보이게 하고 가까이서
  lines.push(await page.evaluate(async () => {
    const t = window.temple, W = t.world, A = t.avatars;
    A.solo = false;
    const monk = A.visitors.find((v) => v.plan.role === 'resident').av;
    const p = monk.root.position;
    const THREE = await import('three');
    W.setShot({ pos: new THREE.Vector3(p.x + 1.4, p.y + 0.9, p.z + 0.6), look: new THREE.Vector3(p.x, p.y + 0.45, p.z), dur: 1e9 }, true);
    A.teleport(p.x + 3, p.z + 3, 0);
    window.__qa.step(40);
    return `resident: ${monk.rig ? '블렌더 ' + monk.rig.name : '절차식'} (variant ${monk.variant})`;
  }));
  await page.screenshot({ path: `${OUT}/resident_meditate.png`, clip: { x: 270, y: 150, width: 420, height: 420 } });
  return lines.join('\n');
}
