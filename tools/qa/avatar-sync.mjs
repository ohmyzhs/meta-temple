// 블렌더 아바타 — 다른 도반에게 보이는 동작, 1인칭 몸 숨김, GLB 실패 시 절차식 복귀를 검사한다.
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/avatar-sync.mjs' }
// (a) syncRemotePeers 에 옛·새 클라이언트가 보낼 수 있는 상태를 섞어 넣는다 (서버 없이): 같은 동작 클립이 고르고, 움직이는 도반은
//     실제 움직인 거리로 걷기 빠르기를 맞추며, 모르는 상태 이름은 서 있는 동작으로 — 예외 없이.
// (b) 1인칭: 내 몸은 내 화면에서만 숨고(root.visible=false), 눈 위치는 머리 뼈를 따라간다 (절하면 내려감).
// (c) monk.glb 를 404 로 막으면 경고 한 줄만 남기고 절차식 몸으로 그대로 돈다. ?rig=0 도 같다.
async (page) => {
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  const lines = [];
  const enter = async (url) => {
    await page.goto(url);
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
    await page.evaluate(async () => {
      document.querySelector('#intro-enter').click();
      await new Promise((r) => setTimeout(r, 1500));
      window.temple._loop = () => {};
    });
  };
  await page.setViewportSize({ width: 960, height: 720 });
  await enter(base + '/?q=low');
  lines.push(await page.evaluate(() => {
    const t = window.temple, A = t.avatars;
    let clock = 50;
    const step = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    const peers = (x) => [
      { id: 'p1', dharmaName: '큰절 도반', avatarStyle: 'monk', x: 1, y: 3.13, z: -24.7, ry: Math.PI, actionState: 'prostrate', actionSeq: 3 },
      { id: 'p2', dharmaName: '걷는 도반', avatarStyle: 'monk', x, y: 0.1, z: 3, ry: Math.PI / 2, actionState: 'idle', actionSeq: 0 },
      { id: 'p3', dharmaName: '좌선 도반', avatarStyle: 'monk', x: -1, y: 3.13, z: -24.7, ry: Math.PI, actionState: 'meditate', actionSeq: 0 },
      { id: 'p4', dharmaName: '새 동작 도반', avatarStyle: 'monk', x: 3, y: 0.1, z: 30, ry: 0, actionState: 'mala_future', actionSeq: 0 },
      { id: 'p5', dharmaName: '삿갓 도반', avatarStyle: 'ink_wanderer', x: 2, y: 0.1, z: 1, ry: 0, actionState: 'circumambulate', actionSeq: 0 },
      { id: 'p6', dharmaName: '정령 도반', avatarStyle: 'lantern_spirit', x: -2, y: 0.1, z: 1, ry: 0, actionState: 'tea', actionSeq: 0 }
    ];
    const out = [];
    let x = 4;
    A.syncRemotePeers(peers(x));
    // 0.2초마다 0.24m 씩 (1.2m/s) 움직이는 도반
    for (let k = 0; k < 10; k++) {
      x += 0.24;
      A.syncRemotePeers(peers(x));
      step(6);
    }
    for (const [id, r] of A.remote) out.push(`${r.av.name}: ${r.av.rig ? '블렌더 ' + r.av.rig.name : '절차식 ' + r.av.style + '/' + r.av.state} 빠르기 ${r.av.speed.toFixed(2)}`);
    const walker = A.remote.get('p2').av;
    const ok = A.remote.get('p1').av.rig?.name === 'prostrate' && walker.rig?.name?.startsWith('walk') && walker.speed > 0.6 && A.remote.get('p4').av.rig?.name === 'idle' && A.remote.get('p3').av.rig?.name === 'meditate' &&
      A.remote.get('p5').av.rig?.name === 'gassho' && !!A.remote.get('p6').av.rig;
    // 같은 큰절을 다시 (순번만 바뀜) → 처음부터 다시
    const p1 = A.remote.get('p1').av;
    step(40);
    const before = p1.rig.current.time;
    A.syncRemotePeers(peers(x).map((p) => (p.id === 'p1' ? { ...p, actionSeq: 4 } : p)));
    step(3);
    out.push(`큰절 다시: ${before.toFixed(2)}s → ${p1.rig.current.time.toFixed(2)}s (${p1.rig.current.time < before ? 'PASS' : 'FAIL'})`);
    return `(a) 섞인 도반 ${ok ? 'PASS' : 'FAIL'}\n  ` + out.join('\n  ');
  }));
  lines.push(await page.evaluate(async () => {
    const t = window.temple, W = t.world, pl = t.player;
    let clock = 80;
    const step = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    t.avatars.teleport(0, 20, Math.PI);
    W.setCameraMode?.('first');
    W.cam.mode = 'first';
    step(20);
    const THREE = await import('three');
    const e = pl.eyeWorld(new THREE.Vector3());
    const stand = { hidden: !pl.root.visible, eye: +(e.y - pl.root.position.y).toFixed(3), cam: +W.camera.position.distanceTo(e).toFixed(3) };
    t.gesture('prostrate');
    const { PROSTRATE } = await import('/src/core/avatarMotion.js');
    step(Math.round(PROSTRATE.forehead * 30)); // 이마가 바닥에 닿는 때
    const e2 = pl.eyeWorld(new THREE.Vector3());
    const low = +(e2.y - pl.root.position.y).toFixed(3);
    W.cam.mode = 'third';
    step(5);
    const ok = stand.hidden && stand.cam < 0.05 && low < 0.15 && pl.root.visible;
    return `(b) 1인칭 ${ok ? 'PASS' : 'FAIL'}: 서서 몸 숨김 ${stand.hidden}, 눈 높이 ${stand.eye}m, 카메라-눈 ${stand.cam}m | 큰절 ${PROSTRATE.forehead}초 눈 높이 ${low}m | 3인칭에서 다시 보임 ${pl.root.visible}`;
  }));
  // (d) 자동 108배: 실제 시간으로 30초 — 좌복에서 첫 절은 일어서기까지 9.1초, 그 뒤 8초에 한 번, 목탁 없음, 도복 소리
  lines.push(await page.evaluate(async () => {
    const t = window.temple;
    const loop = () => { t._frame(Math.min(t.clock.getDelta(), 0.1), t.clock.elapsedTime); window.__raf = requestAnimationFrame(loop); };
    t.clock.getDelta();
    loop();
    const A = t.avatars, c = t.temple.cushions[20];
    A.teleport(c.x, c.z + 0.7, Math.PI);
    A.sitAt(Object.assign(A.cushionSeat(c), { kind: 'cushion' }), 'sit');
    t.player.restState = 'sit';
    await new Promise((r) => setTimeout(r, 2000));
    const log = [];
    const T0 = performance.now();
    const S = t.sound;
    for (const k of ['playMoktak', 'playRobeRustle']) { const f = S[k].bind(S); S[k] = (...a) => (log.push(`${k === 'playMoktak' ? '목탁' : '사락'}@${((performance.now() - T0) / 1000).toFixed(1)}`), f(...a)); }
    t.modals.open('practice_108', { mode: 'prostrate' });
    const before = t.store.stats.bowCount || 0;
    const bows = [];
    const add = t.store.addStat.bind(t.store);
    t.store.addStat = (k, ...a) => (k === 'bowCount' && bows.push(((performance.now() - T0) / 1000).toFixed(1)), add(k, ...a));
    document.querySelector('[data-act="auto"]').click();
    await new Promise((r) => setTimeout(r, 30000));
    const label = document.querySelector('[data-act="auto"]')?.textContent || '';
    document.querySelector('[data-act="auto"]').click();
    const label2 = document.querySelector('[data-act="auto"]')?.textContent || '';
    cancelAnimationFrame(window.__raf);
    t.modals.close();
    const gaps = bows.slice(1).map((b, i) => (b - bows[i]).toFixed(1));
    const ok = bows.length >= 3 && gaps.slice(1).every((g) => Math.abs(g - 8) < 0.3) && gaps[0] >= 7.9 && !log.some((l) => l.startsWith('목탁')) && log.some((l) => l.startsWith('사락'));
    return `(d) 자동 108배 ${ok ? 'PASS' : 'FAIL'}: 절 ${bows.length}번 @${bows.join(', ')}s (간격 ${gaps.join(', ')}s) | 소리 ${log.join(' ')} | 단추 '${label.trim()}' → '${label2.trim()}'`;
  }));
  // (c) GLB 를 못 받을 때
  const warns = [];
  const onMsg = (m) => /avatar|rig|monk/i.test(m.text()) && warns.push(`${m.type()}: ${m.text().slice(0, 120)}`);
  page.on('console', onMsg);
  await page.route('**/monk.glb', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await enter(base + '/?q=low');
  const c1 = await page.evaluate(() => {
    const t = window.temple;
    let clock = 10;
    t.gesture('bow_half');
    for (let i = 0; i < 40; i++) t._frame(1 / 30, (clock += 1 / 30));
    return { rig: !!t.player.rig, body: t.player.body.children.length, state: t.player.state, seq: t.player.seq?.name };
  });
  await page.unroute('**/monk.glb');
  await enter(base + '/?q=low&rig=0');
  const c2 = await page.evaluate(() => ({ rig: !!window.temple.player.rig, body: window.temple.player.body.children.length }));
  page.off('console', onMsg);
  const ok = !c1.rig && c1.body > 0 && c1.seq === 'bow_half' && !c2.rig && c2.body > 0;
  lines.push(`(c) 절차식 복귀 ${ok ? 'PASS' : 'FAIL'}: 404 → 블렌더 ${c1.rig}, 절차식 부품 ${c1.body}개, 반배 ${c1.seq} | ?rig=0 → 블렌더 ${c2.rig}, 부품 ${c2.body}개\n  콘솔: ${warns.join(' / ') || '없음'}`);
  return lines.join('\n');
}
