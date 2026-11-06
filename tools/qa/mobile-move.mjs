// 모바일 이동·합장 답례 검사 (390×844 터치 화면에서 실제 rAF 루프로).
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/mobile-move.mjs' } — 터치 화면(hasTouch)이어야 조이스틱이 보인다.
// (1) 조이스틱 크기·자리 (2) 앞으로 끝까지 0.6초 버티면 자동 걷기 → 손을 떼도 1.3m/s, 좌우로 밀면 방향, 톡 누르면 멈춤
// (3) 바닥을 0.3초 눌러 버티면 손가락 밑으로 걷고, 끌면 따라가고, 떼면 선다 (4) 도반이 먼저 합장하면 그쪽으로 돌아 반배,
// 앉아 있으면 답례 단추. 결과 PNG: OUT/mobile-*.png
async (page) => {
  const OUT = globalThis.AVATAR_QA_OUT || '/tmp/mobile-move';
  (await import('fs')).mkdirSync(OUT, { recursive: true });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/?q=low');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.evaluate(() => document.querySelector('#intro-enter').click());
  await page.waitForTimeout(2500);
  const lines = [];
  const st = () => page.evaluate(() => {
    const t = window.temple, p = t.player.root.position;
    return { x: p.x, z: p.z, speed: t.player.speed, auto: !!t.autoWalk, yaw: t.world.cam.yaw, heading: t.player.heading, clip: t.player.rig?.name, mt: !!t.avatars.moveTarget };
  });
  await page.evaluate(() => { const t = window.temple; t.avatars.teleport(0, 30, Math.PI); t.world.cam.yaw = 0; });
  await page.waitForTimeout(800);
  const jb = await page.locator('#joystick').boundingBox();
  lines.push(`(1) 조이스틱 ${Math.round(jb.width)}×${Math.round(jb.height)}px @ (${Math.round(jb.x)}, ${Math.round(jb.y)})`);
  await page.screenshot({ path: `${OUT}/mobile-hud.png` });
  const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2, r = jb.width / 2;
  // (2) 앞으로 끝까지 밀어 버티기
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(cx, cy - (r * 0.95 * i) / 5);
  await page.waitForTimeout(900);
  const held = await st();
  await page.mouse.up();
  const a0 = await st();
  await page.waitForTimeout(2000);
  const a1 = await st();
  const walked = Math.hypot(a1.x - a0.x, a1.z - a0.z);
  await page.screenshot({ path: `${OUT}/mobile-auto.png` });
  lines.push(`(2) 버틴 뒤 자동 걷기 ${held.auto} · 손 뗀 뒤 2초에 ${walked.toFixed(2)}m (빠르기 ${a1.speed.toFixed(2)}m/s, ${a1.clip})`);
  // 좌우로 방향
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(cx + (r * 0.8 * i) / 4, cy);
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const s1 = await st();
  lines.push(`    오른쪽으로 1초: 카메라 방위 ${a1.yaw.toFixed(2)} → ${s1.yaw.toFixed(2)} rad (자동 걷기 ${s1.auto})`);
  // 톡 눌러 멈춤
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const s2 = await st();
  lines.push(`    톡 누르면: 자동 걷기 ${s2.auto} · 빠르기 ${s2.speed.toFixed(2)}m/s`);
  const ok2 = held.auto && walked > 2.0 && Math.abs(a1.speed - 1.3) < 0.1 && s1.yaw < a1.yaw - 0.3 && !s2.auto && s2.speed < 0.3;
  lines.push(`    ${ok2 ? 'PASS' : 'FAIL'}`);
  // (3) 눌렀다 끌어 걷기
  await page.evaluate(() => { const t = window.temple; t.avatars.teleport(5, 3, Math.PI); t.world.cam.yaw = 0; t.world.cam.pitch = 0.5; });
  await page.waitForTimeout(800);
  const h0 = await st();
  await page.mouse.move(195, 360);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const h1 = await st();
  for (let i = 1; i <= 6; i++) await page.mouse.move(195 + i * 15, 360);
  await page.waitForTimeout(1200);
  const h2 = await st();
  await page.screenshot({ path: `${OUT}/mobile-holdwalk.png` });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const h3 = await st();
  const ok3 = h1.mt && Math.hypot(h2.x - h0.x, h2.z - h0.z) > 0.8 && Math.abs(h2.yaw - h0.yaw) < 0.05 && !h3.mt && h3.speed < 0.3;
  lines.push(`(3) ${ok3 ? 'PASS' : 'FAIL'} 눌러 버티면 걸어감 ${h1.mt} · 끌며 ${Math.hypot(h2.x - h0.x, h2.z - h0.z).toFixed(2)}m · 카메라 그대로 ${Math.abs(h2.yaw - h0.yaw).toFixed(3)} · 떼면 섬 ${!h3.mt} (${h3.speed.toFixed(2)}m/s)`);
  // (4) 도반이 먼저 합장 — 서 있으면 저절로 돌아서 반배
  const r4 = await page.evaluate(async () => {
    const t = window.temple, A = t.avatars, p = t.player.root.position;
    A.syncRemotePeers([{ id: 'p9', dharmaName: '동쪽 도반', avatarStyle: 'monk', x: p.x + 3, y: p.y, z: p.z, ry: 0, actionState: 'idle', actionSeq: 0 }]);
    t.player.heading = 0;
    t._lastBowAt = 0;
    t._onPeerBow({ id: 'p9', name: '동쪽 도반' });
    await new Promise((r) => setTimeout(r, 1300));
    const want = Math.atan2(3, 0);
    const toast = [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' / ');
    return { seq: t.player.seq?.name, err: Math.abs(Math.atan2(Math.sin(t.player.heading - want), Math.cos(t.player.heading - want))), toast };
  });
  await page.screenshot({ path: `${OUT}/mobile-reply-auto.png` });
  // 앉아 있으면 답례 단추
  const r5 = await page.evaluate(async () => {
    const t = window.temple, A = t.avatars;
    await new Promise((r) => setTimeout(r, 2500));
    const c = t.temple.cushions[14];
    A.teleport(c.x, c.z + 0.7, Math.PI);
    A.sitAt(Object.assign(A.cushionSeat(c), { kind: 'cushion' }), 'sit');
    const p = t.player.root.position;
    A.syncRemotePeers([{ id: 'p9', dharmaName: '동쪽 도반', avatarStyle: 'monk', x: p.x + 2, y: p.y, z: p.z, ry: 0, actionState: 'idle', actionSeq: 0 }]);
    t._lastBowAt = 0;
    t._onPeerBow({ id: 'p9', name: '동쪽 도반' });
    await new Promise((r) => setTimeout(r, 300));
    return { shown: !document.querySelector('#reply-btn').classList.contains('hidden'), text: document.querySelector('#reply-text').textContent };
  });
  await page.screenshot({ path: `${OUT}/mobile-reply-button.png` });
  const bb = await page.locator('#reply-btn').boundingBox();
  await page.locator('#reply-btn').click();
  const r6 = await page.evaluate(() => ({ hidden: document.querySelector('#reply-btn').classList.contains('hidden'), bowed: performance.now() - (window.temple._lastBowAt || 0) < 2000, sitting: window.temple.player.sitting }));
  const ok4 = r4.seq === 'bow_half' && r4.err < 0.25 && r5.shown && r6.hidden && r6.bowed && r6.sitting;
  lines.push(`(4) ${ok4 ? 'PASS' : 'FAIL'} 서 있을 때: ${r4.seq} · 도반 쪽과 ${r4.err.toFixed(2)}rad · '${r4.toast}'`);
  lines.push(`    앉아 있을 때: 단추 ${r5.shown} '${r5.text}' ${bb ? Math.round(bb.width) + '×' + Math.round(bb.height) + 'px' : ''} → 누르면 숨김 ${r6.hidden}, 답례 보냄 ${r6.bowed}, 앉은 채 ${r6.sitting}`);
  // 가로 화면
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  const jl = await page.locator('#joystick').boundingBox();
  lines.push(`가로 화면 조이스틱 ${Math.round(jl.width)}px @ (${Math.round(jl.x)}, ${Math.round(jl.y)})`);
  await page.screenshot({ path: `${OUT}/mobile-landscape.png` });
  return lines.join('\n');
}
