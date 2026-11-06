// 108배·염주 창 검사 — node tools/qa/practice.mjs   (먼저 python3 .claude/devserver.py 8081)
//  · 108배 창에는 탭이 없고(염주는 따로), 머리에 접기 단추가 있다
//  · 자동 108배를 시작하면 3초 뒤 작은 막대로 접힌다 — 횟수 고리·멈춤·펼치기만, 단추 48px 이상, 조이스틱·하단 독과 겹치지 않음
//  · 접힌 동안에도 절은 이어지고, 막대에서 멈추고 이어 하고 펼칠 수 있다
//  · 염주는 법당의 「염주」로 따로 열린다. 한 알 사이는 최소 3초 — 광클릭(1초에 10번)은 한 알만, 3.1초 간격이면 다 센다
//  · 알은 고리와 반대로 돌아 빛이 늘 같은 쪽
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const rect = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width && cs.visibility !== 'hidden' && cs.display !== 'none' ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, sel);
const hit = (a, b) => a && b && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

for (const vp of [[390, 844], [1280, 800]]) {
  console.log(`— ${vp.join('x')}`);
  const { ctx, page, errors } = await enter(browser, vp);
  await page.click('#place-btn');
  await page.click('#place-list [data-goto-zone="DAEUNGJEON"]');
  await page.waitForFunction(() => window.temple.zone === 'DAEUNGJEON', null, { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.click('#dock-rituals [data-ritual="practice_108"]');
  await page.waitForFunction(() => window.temple.modals.current === 'practice_108', null, { timeout: 8000 });
  await page.waitForTimeout(600);
  check('108배 창에 탭 없음 (염주는 따로)', !(await page.$('#modal-body [data-tab="mala"]')));
  check('창 머리에 접기 단추', !!(await rect(page, '#modal-fold-btn')));

  // 자동 시작 → 3초 뒤 접힘
  await page.click('#modal-body [data-full] [data-act="auto"]');
  await page.waitForTimeout(1500);
  check('자동 시작 1.5초 뒤에는 아직 펼쳐 있음', !(await page.evaluate(() => document.querySelector('.modal-window').classList.contains('is-mini'))));
  await page.waitForTimeout(2200);
  const mini = await page.evaluate(() => document.querySelector('.modal-window').classList.contains('is-mini'));
  check('3초 뒤 작은 막대로 접힘', mini);
  const win = await rect(page, '.modal-window');
  const share = win ? (win.w * win.h) / (vp[0] * vp[1]) : 1;
  check(`접은 막대가 덮는 넓이 ${(share * 100).toFixed(1)}% (≤ 4%)`, share <= 0.04, win ? `${Math.round(win.w)}×${Math.round(win.h)}` : '');
  const btns = await page.evaluate(() => [...document.querySelectorAll('.practice-mini button')].map((b) => { const r = b.getBoundingClientRect(); return [b.dataset.act, Math.round(r.width), Math.round(r.height)]; }));
  check('막대 단추 48px 이상 (고리·멈춤·펼치기)', btns.length === 3 && btns.every(([, w, h]) => w >= 48 && h >= 48), JSON.stringify(btns));
  const joy = await rect(page, '#joystick'), dock = await rect(page, '#dock');
  check('막대가 조이스틱·하단 독과 겹치지 않음', !hit(win, joy) && !hit(win, dock));
  const b0 = await page.evaluate(() => window.temple.modals._today.bows);
  await page.waitForTimeout(9000);
  const b1 = await page.evaluate(() => window.temple.modals._today.bows);
  check('접힌 동안에도 절이 이어짐', b1 > b0, `${b0} → ${b1}`);
  await page.click('.practice-mini [data-act="auto"]');
  await page.waitForTimeout(200);
  check('막대에서 멈추기', (await page.evaluate(() => document.querySelector('.practice-mini').dataset.auto)) === 'false');
  await page.click('.practice-mini .pm-btn[data-act="unfold"]');
  await page.waitForTimeout(400);
  check('펼치기 → 창이 돌아옴', !(await page.evaluate(() => document.querySelector('.modal-window').classList.contains('is-mini'))) && !!(await rect(page, '#modal-body [data-full]')));
  await page.click('#modal-fold-btn');
  await page.waitForTimeout(300);
  check('창 머리 ﹀ 로 손수 접기', await page.evaluate(() => document.querySelector('.modal-window').classList.contains('is-mini')));
  await page.evaluate(() => window.temple.modals.close());
  await page.waitForTimeout(400);

  // 염주: 법당의 「염주」 (독에 자리가 있으면 독, 없으면 더보기)
  if (await rect(page, '#dock [data-ritual="mala"]')) await page.click('#dock [data-ritual="mala"]');
  else {
    await page.click('#more-btn');
    await page.click('#more-sheet [data-ritual="mala"]');
  }
  await page.waitForFunction(() => window.temple.modals.current === 'mala', null, { timeout: 8000 });
  await page.waitForTimeout(700);
  check('법당의 「염주」로 염주 창이 따로 열림', true);
  const count = () => page.evaluate(() => window.temple.modals._today.mala);
  const m0 = await count();
  const box = await rect(page, '.mala');
  for (let i = 0; i < 10; i++) {
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.waitForTimeout(90);
  }
  const m1 = await count();
  check('광클릭 1초에 10번 → 한 알', m1 - m0 === 1, `${m1 - m0}알`);
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await page.waitForTimeout(300);
  check('3초 안에 다시 → 세지 않음', (await count()) === m1);
  await page.waitForTimeout(2900);
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.waitForTimeout(3100);
  }
  const m2 = await count();
  check('3.1초 간격 두 번 → 두 알', m2 - m1 === 2, `${m2 - m1}알`);
  const rot = await page.evaluate(() => {
    const g = document.querySelector('[data-beads]').style.transform, b = document.querySelector('[data-bead]').style.transform;
    const n = (s) => Number((s.match(/-?[\d.]+/) || [0])[0]);
    return [n(g), n(b)];
  });
  check('알은 고리와 반대로 돎 (빛이 같은 쪽)', Math.abs(rot[0] + rot[1]) < 0.01 && rot[0] !== 0, JSON.stringify(rot));
  check('누르면 넘김 효과(is-tick)', await page.evaluate(() => document.querySelector('.mala').classList.contains('is-tick')));
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
