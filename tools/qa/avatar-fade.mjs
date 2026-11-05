// 크로스페이드 길이 재기 — core/avatarMotion.js FADE 의 근거.
//   Playwright MCP: browser_run_code_unsafe { filename: '<repo>/tools/qa/avatar-fade.mjs' }
// 방법: 화면 밖에서 블렌더 몸 하나를 120Hz 로 돌려, A 를 틀다가(한 번짜리는 끝까지, 고리는 1초) B 로 섞는다.
// 섞는 동안 뼈 회전 속도(°/s) 최댓값이 기준을 넘지 않는 가장 짧은 길이를 고른다 (짧으면 '확 꺾이고', 길면 '흐물거린다').
// 기준 = 회전은 max(A 최대, B 최대, 반배 최대), 골반 이동은 max(A, B, 큰절에서 꿇어앉을 때 최대)
//   — 서기↔앉기처럼 두 클립이 다 거의 멈춰 있으면, 이 아바타가 반배·큰절에서 실제로 움직이는 빠르기를 넘지 않게.
async (page) => {
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8085';
  await page.goto(base + '/?q=low');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  const res = await page.evaluate(async () => {
    const THREE = await import('three');
    const R = await import('/src/world/avatarRig.js');
    await R.loadRig();
    const HZ = 120, dt = 1 / HZ;
    const CAND = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8];
    const PAIRS = [
      ['idle', 'walk', 1.1], ['walk', 'idle', 1.1], ['idle_chasu', 'walk_chasu', 1.1], ['walk_chasu', 'idle_chasu', 1.1],
      ['walk', 'walk_chasu', 1.1], ['walk_chasu', 'walk_gassho', 1.1],
      ['idle', 'sit', 0], ['sit', 'idle', 0], ['sit', 'prostrate', 0], ['prostrate', 'sit', 0],
      ['idle_chasu', 'bow_half', 0], ['bow_half', 'idle_chasu', 0], ['idle_chasu', 'prostrate', 0], ['prostrate', 'idle_chasu', 0],
      ['idle', 'bow_half', 0], ['bow_half', 'idle', 0], ['walk_gassho', 'idle_chasu', 1.1], ['idle_chasu', 'sit', 0], ['sit', 'idle_chasu', 0],
      ['sit', 'stand_up', 0], ['stand_up', 'prostrate', 0], ['stand_up', 'idle_chasu', 0], ['idle_chasu', 'sit_down', 0], ['sit_down', 'sit', 0], ['prostrate', 'sit_down', 0]
    ];
    // 회전 속도 최댓값 (°/s, 모든 뼈) 과 골반 이동 속도 (m/s)
    const run = (a, b, fade, speed) => {
      const body = new R.RigBody();
      const bones = Object.values(body.bones);
      const prev = bones.map((x) => x.quaternion.clone());
      const hips = body.bones.hips, hp = new THREE.Vector3();
      const peak = { a: 0, x: 0, b: 0, hipA: 0, hipX: 0, hipB: 0 };
      const step = (key, sp) => {
        body.update(dt, sp);
        let m = 0;
        bones.forEach((bn, i) => {
          m = Math.max(m, (2 * Math.acos(Math.min(1, Math.abs(bn.quaternion.dot(prev[i])))) * 180) / Math.PI / dt);
          prev[i].copy(bn.quaternion);
        });
        const hv = hips.position.distanceTo(hp) / dt;
        hp.copy(hips.position);
        peak[key] = Math.max(peak[key], m);
        const hk = { a: 'hipA', x: 'hipX', b: 'hipB' }[key];
        peak[hk] = Math.max(peak[hk], hv);
      };
      body.play(a);
      for (let i = 0; i < 12; i++) body.update(dt, a.startsWith('walk') ? speed : 0);
      bones.forEach((bn, i) => prev[i].copy(bn.quaternion));
      hp.copy(hips.position);
      const aLen = R.rigLib().meta.clips[a].loop ? 1 : R.rigLib().meta.clips[a].duration;
      for (let i = 0; i < Math.round(aLen * HZ); i++) step('a', a.startsWith('walk') ? speed : 0);
      // B 로: 크로스페이드 길이를 직접 정해 섞는다
      const pa = body.current, nb = body.actions.get(b);
      nb.reset().setEffectiveWeight(1).play();
      nb.crossFadeFrom(pa, fade, false);
      body.name = b;
      body.current = nb;
      for (let i = 0; i < Math.round((fade + 0.1) * HZ); i++) step('x', b.startsWith('walk') ? speed : 0);
      for (let i = 0; i < HZ; i++) step('b', b.startsWith('walk') ? speed : 0);
      body.dispose();
      return peak;
    };
    const out = [];
    const calm = run('bow_half', 'bow_half', 0.1, 0).a; // 반배 자체의 최대 회전 속도
    const calmHip = run('prostrate', 'prostrate', 0.1, 0).hipA; // 큰절(꿇어앉기·일어서기)의 골반 최대 이동 속도
    for (const [a, b, sp] of PAIRS) {
      const rows = CAND.map((f) => ({ f, ...run(a, b, f, sp) }));
      const ref = Math.max(rows[0].a, rows[0].b, calm);
      const hipRef = Math.max(rows[0].hipA, rows[0].hipB, calmHip);
      const ok = rows.find((r) => r.x <= ref && r.hipX <= hipRef);
      const best = ok || rows.reduce((m, r) => (r.x < m.x ? r : m));
      out.push({ pair: `${a}→${b}`, pick: best.f, within: !!ok, ref: Math.round(ref), hipRef: +hipRef.toFixed(2), at: Object.fromEntries(rows.map((r) => [r.f, `${Math.round(r.x)}/${r.hipX.toFixed(2)}`])) });
    }
    return out;
  });
  return res.map((r) => `${r.pair}: ${r.pick}s ${r.within ? '' : '(기준 못 맞춤, 가장 낮은 값)'} | 기준 ${r.ref}°/s·${r.hipRef}m/s | 섞는 동안 °/s/m/s ${JSON.stringify(r.at)}`).join('\n');
}
