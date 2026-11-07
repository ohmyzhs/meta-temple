// 이름표·법명 길이 검사 — node tools/qa/nametag.mjs [shot.png]   (먼저 python3 .claude/devserver.py 8081)
//  · 옛 긴 법명(「은은한 향기 나는 조약돌」)으로 들어오면 「향기 머문 조약돌」로 줄고, 들어설 때 한 번 알린다
//  · 직접 짓기는 10자까지 (11자는 거름이 막는다)
//  · 머리 위 이름표: 14px·먹 상자, 나·실제 도반은 초록 점, 산사식구(참배객·스님)는 점 없음, 산사식구 법명도 10자 이하
//  · 이름표 글자 대비: 상자 뒤가 흰 하늘이어도 4.5:1 이상
import { launch, enter } from './lib.mjs';

const KEY = 'meta_temple_cheongyeon_state_v1';
const OLD = '은은한 향기 나는 조약돌';
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};

// 1) 옛 방문자: 긴 법명이 줄고 알림
{
  const init = `if (!sessionStorage.qaSeeded) { sessionStorage.qaSeeded = 1; localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ schemaVersion: 3, profileId: 'qa-old', profile: { dharmaName: ${JSON.stringify(OLD)}, avatarStyle: 'monk' } })); }`;
  const { ctx, page, errors } = await enter(browser, [360, 780], { init });
  await page.waitForTimeout(3200);
  const name = await page.evaluate(() => window.temple.store.profile.dharmaName);
  check('옛 긴 법명이 꾸밈말만 줄어 이어짐', name === '향기 머문 조약돌', name);
  const toasts = await page.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((t) => t.textContent));
  check('들어설 때 줄였다고 알림', toasts.some((t) => t.includes('10자 안으로 줄였습니다') && t.includes(name)), JSON.stringify(toasts));
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).profile.dharmaName, KEY);
  check('줄인 법명이 저장됨', saved === name);
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}

// 2) 직접 짓기 10자, 이름표
{
  const { ctx, page, errors } = await enter(browser, [390, 844], { scale: 2 });
  const r = await page.evaluate(async () => {
    const { nameFeedback } = await import(new URL('./ui/nameField.js', document.querySelector('script[type=module][src]').src).href);
    return [nameFeedback('가'.repeat(10))?.ok, nameFeedback('가'.repeat(11))?.message];
  });
  check('직접 짓기 10자는 됨, 11자는 막힘', r[0] === true && /10/.test(r[1] || ''), JSON.stringify(r));

  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const t = window.temple, A = t.avatars, P = t.player.root.position, cam = t.world.camera;
    const f = new (P.constructor)(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const s = new (P.constructor)(-f.z, 0, f.x);
    const at = (fw, side) => ({ x: P.x + f.x * fw + s.x * side, y: P.y, z: P.z + f.z * fw + s.z * side });
    A.syncRemotePeers([{ id: 'qa1', dharmaName: '혜원', avatarStyle: 'monk', ...at(1.2, -2.3), ry: 0, actionState: 'idle' }]);
    const vs = A.visitors.filter((v) => v.plan.role !== 'resident').slice(0, 2);
    const spots = [at(1.0, 2.3), at(6, -2.4)];
    const hold = () => { vs.forEach((v, i) => { v.av.root.position.set(spots[i].x, spots[i].y, spots[i].z); v.pause = 99; v.av.speed = 0; }); requestAnimationFrame(hold); };
    hold();
  });
  await page.waitForTimeout(1200);
  const labels = await page.evaluate(() => [...document.querySelectorAll('.name-label')].map((e) => {
    const cs = getComputedStyle(e), b = getComputedStyle(e, '::before');
    return { cls: e.className, text: e.textContent, size: cs.fontSize, bg: cs.backgroundColor, color: cs.color, op: Number(cs.opacity), dot: b.content !== 'none' && b.width !== 'auto' };
  }));
  const npcs = await page.evaluate(() => window.temple.avatars.visitors.map((v) => [v.av.labelEl.classList.contains('npc'), v.av.name]));
  check('산사식구 이름표 모두 npc', npcs.every(([n]) => n), `${npcs.length}명`);
  check('산사식구 법명 10자 이하', npcs.every(([, n]) => [...n].length <= 10), npcs.map(([, n]) => n).join(', '));
  const me = labels.find((l) => l.cls.includes('me')), peer = labels.find((l) => l.cls.includes('peer')), npc = labels.filter((l) => l.cls.includes('npc'));
  check('나·도반에 초록 점', me?.dot && peer?.dot, JSON.stringify([me?.dot, peer?.dot]));
  check('산사식구에는 점 없음', npc.length && npc.every((l) => !l.dot));
  const ops = [me, peer, ...npc].map((l) => l.op);
  check('가까운 이름표는 흐리지 않음 (opacity 1)', me?.op === 1 && peer?.op === 1 && npc.some((l) => l.op === 1), JSON.stringify(ops));
  check('이름표 14px·먹 상자', [me, peer, ...npc].every((l) => l.size === '14px' && /rgba\(20, 17, 14, 0\.72\)/.test(l.bg)));
  // 대비: 상자 뒤가 흰색(가장 나쁜 경우)일 때 상자에 비친 색 vs 글자 — 이름표 전체의 opacity(setLabel, 가까울 때 최대값)도 곱한다
  const rgb = (s) => s.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (fg, bg, op = 1) => { const a = (fg[3] ?? 1) * op; return fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a)); };
  const W = [255, 255, 255];
  const worst = Math.min(...[me, peer, ...npc].filter((l) => l.op > 0.9).map((l) => {
    // 상자·글자를 따로 겹친 뒤 이름표 전체 opacity 로 흰 하늘과 섞는다
    const boxFull = over(rgb(l.bg), W), textFull = over(rgb(l.color), boxFull);
    const box = boxFull.map((c, i) => c * l.op + W[i] * (1 - l.op)), text = textFull.map((c, i) => c * l.op + W[i] * (1 - l.op));
    const [L1, L2] = [lum(text), lum(box)].sort((a, b) => b - a);
    return (L1 + 0.05) / (L2 + 0.05);
  }));
  check(`이름표 글자 대비 ${worst.toFixed(1)}:1 (흰 배경 위, ≥ 4.5)`, worst >= 4.5);
  // 머리 바로 위: 카메라를 숙이고 당겨도 이름표 아래 끝과 머리(삿갓) 화면 위 끝 사이가 0~14px — 머리는 실제 스킨 정점으로 잰다
  const gaps = await page.evaluate(async () => {
    const THREE = await import('three');
    const t = window.temple, W = t.world, A = t.avatars, P = t.player.root.position;
    t._loop = () => {};
    let clock = 500;
    const step = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    A.syncRemotePeers([{ id: 'qa1', dharmaName: '혜원', avatarStyle: 'ink_wanderer', x: P.x + 1.2, y: P.y, z: P.z + 0.3, ry: 0, actionState: 'idle' },
      { id: 'qa2', dharmaName: '등불', avatarStyle: 'lantern_spirit', x: P.x - 1.2, y: P.y, z: P.z + 0.3, ry: 0, actionState: 'idle' }]);
    const peer = A.remote.get('qa1').av, spirit = A.remote.get('qa2').av;
    const v = new THREE.Vector3(), tmp = new THREE.Vector3();
    const topY = (av, names) => {
      let top = 1e9;
      av.rig.model.traverse((o) => {
        if (!o.isSkinnedMesh || !names.includes(o.name) || !o.visible) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          o.getVertexPosition(i, tmp);
          o.localToWorld(tmp);
          if (tmp.y - av.root.position.y < 0.75) continue;
          v.copy(tmp).project(W.camera);
          top = Math.min(top, (-v.y * 0.5 + 0.5) * innerHeight);
        }
      });
      return top;
    };
    const rows = [];
    for (const [pitch, dist] of [[-0.1, 2.2], [0.5, 2.2], [1.2, 2.2], [0.2, 6], [0.9, 6], [0.3, 12], [1.2, 12]]) {
      W.setShot?.(null);
      W.cam.mode = 'third';
      W.snapCameraTo(t.world.cam.yaw, pitch, dist);
      step(40);
      for (const [who, av, names] of [['나', t.player, ['monk_body']], ['삿갓 도반', peer, ['wanderer_body', 'wanderer_hat']], ['등불 정령', spirit, ['spirit_body']]]) {
        if (!av.rig || !av.label.visible) continue;
        const r = av.labelEl.getBoundingClientRect();
        rows.push({ who, pitch, dist, gap: +(topY(av, names) - r.bottom).toFixed(1) });
      }
    }
    return rows;
  });
  const bad = gaps.filter((g) => !(g.gap >= -1 && g.gap <= 14));
  check(`이름표가 머리(삿갓) 바로 위 — ${gaps.length}가지 각도·거리 틈 ${Math.min(...gaps.map((g) => g.gap))}~${Math.max(...gaps.map((g) => g.gap))}px`, gaps.length >= 15 && !bad.length, JSON.stringify(bad.length ? bad : gaps.map((g) => `${g.who}@${g.pitch}/${g.dist}:${g.gap}`)));
  if (process.argv[2]) {
    await page.evaluate(() => { const W = window.temple.world; W.timeMode = 'fixed'; W.hour = W.hourTarget = 13; W.setWeather?.('clear'); W.applyEnv?.(true); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: process.argv[2] });
  }
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
