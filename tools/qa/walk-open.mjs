// 넓힌 걷는 땅 확인 — node tools/qa/walk-open.mjs   (python3 .claude/devserver.py 8095, BASE=http://localhost:8095)
// 사용자 2026-11-08 「연못 근처 땅·산책로와 이어지는 곳이 경계도 없는데 안 가진다 · 평지인데 돗자리를 못 편다」 (전수조사: walk-survey.mjs)
//   A. 돗자리: 연못 둘레·옛 대숲 잔디밭·다실 마당 북쪽·산책로 고리 안 남쪽 숲에서 「휴식」으로 펴지는가
//   B. 걸어서: 길찾기(_pf)로 새로 연 땅까지 갔다가 돌아오는가
//   C. 진짜 막힘은 그대로: 연못 물·다실 갈래길 울타리·다실 뒤 대숲·마당 앞 석축(아래에서 못 기어오름)·법당 기단 앞면
import { launch, BASE } from './lib.mjs';

const browser = await launch();
let fail = 0;
const check = (ok, line) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};
try {
  const page = await (await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, locale: 'ko-KR' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2000);

  // A. 돗자리
  const MATS = [
    ['연못 북동 물가', 33, -6.4, 0],
    ['연못 북서 (다실 가는 길 끝)', 21.6, -7.2, Math.PI / 2],
    ['연못 동쪽 (정자 옆 잔디)', 40.5, -3.5, -Math.PI / 2],
    ['연못 남동', 36, 5.0, Math.PI],
    ['옛 대숲 잔디밭', 35, -16, Math.PI],
    ['옛 대숲 잔디밭 북쪽', 36, -17.5, Math.PI / 2],
    ['고리 안 남쪽 숲 (숲길 서쪽)', -24, 30, 0],
    ['고리 안 남쪽 숲 (숲길 동쪽)', 22, 33, 0]
  ];
  for (const [name, x, z, ry] of MATS) {
    const r = await page.evaluate(async ([x, z, ry]) => {
      const t = window.temple;
      t.avatars.standUp();
      t._place(x, z, ry);
      await new Promise((r) => setTimeout(r, 300));
      t._restHere();
      await new Promise((r) => setTimeout(r, 900));
      const seat = t.player.seat;
      const out = { mat: seat?.spotId === 'mat_here', zone: t.zone };
      t.avatars.standUp();
      return out;
    }, [x, z, ry]);
    check(r.mat, `돗자리 · ${name} (${x}, ${z}) ${r.zone}`);
  }

  // B. 걸어서 갔다 오기 (길찾기 + moveTo, 걷는 속도 그대로)
  const WALKS = [
    ['연못 동쪽 잔디 → 다실 갈래길 (울타리 끝을 돌아)', [40.5, -3.5], [38, -9.7], null],
    ['다실 마당 → 옛 대숲 잔디밭 → 다실 마당 북쪽 너머', [32, -12], [34, -21], null],
    ['일주문 숲길 → 숲길 서쪽 숲 한가운데', [0, 30], [-22, 31], null],
    ['연못 동쪽 잔디 → 정자 동쪽을 돌아 연못 남동', [40.5, -3.5], [36, 5], null]
  ];
  for (const [name, a, b, toTrail] of WALKS) {
    const r = await page.evaluate(async ([a, b, toTrail]) => {
      const t = window.temple, T = await import('./src/world/trail.js');
      let [bx, bz] = b;
      if (toTrail) { const n = T.trail.nearest(bx, bz); bx = n.x; bz = n.z; }
      const go = async (fx, fz, tx, tz) => {
        t._place(fx, fz, 0);
        await new Promise((r) => setTimeout(r, 200));
        const path = t._pf().find(fx, fz, tx, tz);
        if (!path) return { ok: false, why: '길 없음' };
        let done = false;
        t.avatars.moveTo(tx, tz, () => (done = true), path.slice(1, -1));
        const t0 = performance.now();
        while (!done && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 100));
        const p = t.player.root.position;
        return { ok: done && Math.hypot(p.x - tx, p.z - tz) < 0.5, left: +Math.hypot(p.x - tx, p.z - tz).toFixed(2), sec: +((performance.now() - t0) / 1000).toFixed(1) };
      };
      const there = await go(a[0], a[1], bx, bz);
      const back = there.ok ? await go(bx, bz, a[0], a[1]) : { ok: false };
      return { there, back, to: [+bx.toFixed(1), +bz.toFixed(1)] };
    }, [a, b, toTrail]);
    check(r.there.ok && r.back.ok, `걷기 · ${name} → (${r.to}) 가는 데 ${r.there.sec}초 (남은 ${r.there.left}m) · 돌아오기 ${r.back.ok ? `${r.back.sec}초` : '실패'}`);
  }

  // C. 진짜 막힘
  const walls = await page.evaluate(async () => {
    const t = window.temple, { isWalkable } = await import('./src/world/layout.js');
    const push = async (fx, fz, tx, tz, sec = 4) => {
      t._place(fx, fz, 0);
      await new Promise((r) => setTimeout(r, 200));
      t.avatars.moveTo(tx, tz);
      await new Promise((r) => setTimeout(r, sec * 1000));
      t.avatars.moveTarget = null;
      const p = t.player.root.position;
      return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2) };
    };
    return {
      pond: isWalkable(28.6, -0.4) || isWalkable(24, 2),
      fence: isWalkable(38, -7.8) || isWalkable(36, -11.6),
      grove: isWalkable(25, -21) || isWalkable(28, -22),
      embank: await push(6, 6.4, 6, 2.5),
      stylobate: await push(-8, -16, -8, -21)
    };
  });
  check(!walls.pond, '막힘 · 연못 물');
  check(!walls.fence, '막힘 · 다실 갈래길 울타리');
  check(!walls.grove, '막힘 · 다실 뒤 대숲');
  check(walls.embank.z > 4.6, `막힘 · 마당 앞 석축 아래에서 북쪽으로 밀기 → 멈춘 자리 z ${walls.embank.z} (석축 z 4.6~5.2, 높이 ${walls.embank.y})`);
  check(walls.stylobate.z > -18.6, `막힘 · 법당 기단 앞면으로 밀기 → 멈춘 자리 z ${walls.stylobate.z} (기단 z −18.6, 높이 ${walls.stylobate.y})`);
  console.log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
} finally {
  await browser.close();
}
console.log(fail ? `FAIL (${fail})` : 'walk-open PASS');
