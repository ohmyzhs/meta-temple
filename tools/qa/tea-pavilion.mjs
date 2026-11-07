// 미니맵 핀 · 연못 정자 앉기 · 죽비 새 자리 — node tools/qa/tea-pavilion.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=그림 폴더)
// 사용자 2026-11-08: 「안내 문구 말고 누를 수 있는 지점에 포인터 같은 모션」·「연못 정자에 유저도 올라가 앉게」·
//                   「죽비가 구석이라 걸어서 못 가고 뽑고 나면 갇힌다 — 스님이 바라보는 쪽 돌담 근처로, 걸어서 쉽게, 더 크게」
//   1. 장소 시트 지도: 핀이 오르내리는지 (0.95초 사이 두 장 → map-pins.png), 안내 문구가 없는지
//   2. 연못 정자: 디딤돌 앞에서 알약이 뜨는지, 앉으면 마루 높이에 가부좌인지(NPC 자리는 비킴), 일어서면 디딤돌 앞인지 (pavilion-sit.png)
//   3. 죽비: 다실 마당 여러 곳에서 「죽비」로 걸어가 창이 열리는지(순간이동 없이), 닫고 걸어 나올 수 있는지 (jukbi-*.png)
import { writeFileSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.';
const browser = await launch();
let fail = 0;
const check = (ok, line) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const W = window.temple.world;
    W.timeMode = 'fixed';
    W.hour = W.hourTarget = 14;
    W.applyEnv(true);
  });

  // 1. 지도 핀
  await page.click('#place-btn');
  await page.waitForTimeout(800);
  const box = await page.evaluate(() => { const r = document.querySelector('#minimap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const pinY = () => page.evaluate(() => [...document.querySelectorAll('.mm-pin')].slice(0, 4).map((g) => +g.getBoundingClientRect().y.toFixed(1)));
  const a = await pinY();
  const shotA = await page.screenshot({ clip: box });
  await page.waitForTimeout(950);
  const b = await pinY();
  const shotB = await page.screenshot({ clip: box });
  const info = await page.evaluate(() => ({ hint: !!document.querySelector('.mm-hint'), pins: document.querySelectorAll('.mm-pin').length, pings: document.querySelectorAll('.mm-ping').length, anim: getComputedStyle(document.querySelector('.mm-pin')).animationName }));
  check(!info.hint && info.pins >= 14 && info.anim === 'mm-bob' && a.some((y, i) => Math.abs(y - b[i]) > 0.5), `지도 핀 ${info.pins}개·물결 ${info.pings}개 (${info.anim}), 안내 문구 ${info.hint ? '있음' : '없음'}, 0.95초 사이 핀 높이 차 ${a.map((y, i) => Math.abs(y - b[i]).toFixed(1)).join('/')}px`);
  writeFileSync(`${OUT}/map-pins-a.png`, shotA);
  writeFileSync(`${OUT}/map-pins-b.png`, shotB);
  await page.screenshot({ path: `${OUT}/map-sheet.png` });
  await page.evaluate(() => document.querySelector('[data-sheet-close]')?.click());
  await page.waitForTimeout(400);

  // 2. 연못 정자
  const pav = await page.evaluate(async () => {
    const t = window.temple, s = t.temple.trail.spots.find((q) => q.id === 'pond_pavilion');
    t._place(s.stand.x, s.stand.z, 0);
    await new Promise((r) => setTimeout(r, 700));
    const n = t._findNearby();
    t._sitRest(s);
    await new Promise((r) => setTimeout(r, 1200));
    const p = t.player.root.position, seat = t.player.seat;
    const npc = t.avatars.visitors.find((v) => v.plan?.role === 'pavilion' || v.role === 'pavilion')?.av.root.position;
    return { prompt: n?.label, seat: seat?.spotId, y: +p.y.toFixed(2), floor: +s.y.toFixed(2), state: t.player.state, gapNpc: npc ? +Math.hypot(npc.x - p.x, npc.z - p.z).toFixed(2) : null };
  });
  check(pav.prompt === '연못 정자에 올라 앉기', `정자 디딤돌 앞 알약: 「${pav.prompt}」`);
  check(pav.seat === 'pond_pavilion' && Math.abs(pav.y - pav.floor) < 0.05, `정자에 앉음: 자리 ${pav.seat}, 높이 ${pav.y} (마루 ${pav.floor}), 자세 ${pav.state}, 명상 NPC 와 ${pav.gapNpc}m`);
  // 3인칭: 정자 남서쪽 물 건너에서
  await page.evaluate(() => {
    const W = window.temple.world;
    W.snapCameraTo(Math.PI * 0.75, 0.3, 7);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/pavilion-sit.png` });
  const up = await page.evaluate(async () => {
    const t = window.temple, s = t.temple.trail.spots.find((q) => q.id === 'pond_pavilion');
    t.avatars.standUp();
    await new Promise((r) => setTimeout(r, 300));
    const p = t.player.root.position;
    const { isWalkable } = await import('./src/world/layout.js');
    return { d: +Math.hypot(p.x - s.stand.x, p.z - s.stand.z).toFixed(2), walk: isWalkable(p.x, p.z) };
  });
  check(up.d < 0.05 && up.walk, `정자에서 일어섬: 디딤돌 앞 ${up.d}m, 걸을 수 있는 땅 ${up.walk}`);

  // 3. 죽비
  for (const [name, x, z] of [['연못 동쪽 잔디', 39, -3.5], ['다실 가는 길 끝', 21, -6], ['옛 대숲 잔디밭', 35, -16]]) {
    const r = await page.evaluate(async ([x, z]) => {
      const t = window.temple;
      if (t.modals.isOpen) t.modals.close();
      t._place(x, z, 0);
      await new Promise((r) => setTimeout(r, 400));
      let jumped = false;
      const place = t._place.bind(t);
      t._place = (...a) => ((jumped = true), place(...a));
      const t0 = performance.now();
      t.activate('dharma_card');
      while (t.modals.current !== 'dharma_card' && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
      t._place = place;
      const p = t.player.root.position, it = t._interactable('dharma_card');
      return { open: t.modals.current === 'dharma_card', jumped, sec: +((performance.now() - t0) / 1000).toFixed(1), left: +Math.hypot(p.x - it.approach.x, p.z - it.approach.z).toFixed(2) };
    }, [x, z]);
    check(r.open && !r.jumped && r.left < 0.3, `죽비 ← ${name} (${x}, ${z}): ${r.jumped ? '순간이동' : '걸어서'} ${r.sec}초, 설 자리까지 ${r.left}m, 창 ${r.open ? '열림' : '안 열림'}`);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/jukbi-open.png` });
  const out = await page.evaluate(async () => {
    const t = window.temple;
    t.modals.close();
    await new Promise((r) => setTimeout(r, 300));
    const it = t._interactable('dharma_card');
    // 뽑고 나서 걸어 나오기: 연못 북동 잔디까지 길찾기로
    const p = t.player.root.position, path = t._pf().find(p.x, p.z, 33, -6.4);
    if (!path) return { ok: false, why: '길 없음' };
    let done = false;
    t.avatars.moveTo(33, -6.4, () => (done = true), path.slice(1, -1));
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
    const q = t.player.root.position;
    return { ok: done && Math.hypot(q.x - 33, q.z + 6.4) < 0.5, sec: +((performance.now() - t0) / 1000).toFixed(1), at: [it.pos.x, it.pos.z].map((v) => +v.toFixed(2)) };
  });
  check(out.ok, `죽비(${out.at}) 뽑고 걸어 나오기 → 연못 북동: ${out.ok ? `${out.sec}초` : out.why || '실패'}`);
  // 차담 자리에서 스님이 바라보는 쪽 (서쪽): 죽비 걸이가 돌담 앞에 보이는지
  await page.evaluate(async () => {
    const t = window.temple, W = t.world, it = t._interactable('dharma_card');
    t._place(it.approach.x + 1.6, it.approach.z + 1.2, -Math.PI / 2);
    W.snapCameraTo(Math.PI / 2 - 0.35, 0.18, 4.2);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/jukbi-stand.png` });
  console.log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `FAIL (${fail})` : 'tea-pavilion PASS');
