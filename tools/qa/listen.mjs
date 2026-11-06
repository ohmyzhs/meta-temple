// 예불 듣기 재생기 접기 검사 — node tools/qa/listen.mjs   (먼저 python3 .claude/devserver.py 8081)
//  · 재생기에 접기 단추가 있고, 접으면 재생기는 사라지고 작은 알약(재생/멈춤 · 펴기)만 남는다
//  · 접은 동안 화면을 누르거나 끌어도(둘러보기) 재생기가 다시 뜨지 않는다
//  · 펴기를 누르면 돌아오고, 재생기 단추를 누른 뒤에도 3.5초 가만히 있으면 저절로 숨는다 (누른 단추에 포커스가 남아 안 숨던 버그)
//  · 접은 상태는 기억되어 다음 듣기도 접힌 채 시작한다
//  · 보이는 단추는 모두 48×48 이상, 서로 겹치지 않음
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const shown = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.3 && r.width > 0; }, sel);
const bar = (p) => shown(p, '#listen .listen-ctl');
const buttons = (p) => p.evaluate(() => [...document.querySelectorAll('#listen button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).visibility !== 'hidden'; }).map((b) => { const r = b.getBoundingClientRect(); return { n: b.dataset.l + (b.closest('.l-mini') ? '(mini)' : ''), x: r.x, y: r.y, w: r.width, h: r.height }; }));
const sizeAndOverlap = (list) => {
  const small = list.filter((b) => b.w < 47.99 || b.h < 47.99).map((b) => `${b.n} ${Math.round(b.w)}×${Math.round(b.h)}`);
  const ov = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j];
    if (Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.5 && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0.5) ov.push(`${a.n}∩${c.n}`);
  }
  return { small, ov };
};
const startListening = (p) => p.evaluate(async () => window.temple.listen((await import('./src/data/credits.js')).YEBUL_TRACKS[0]));

for (const vp of [[390, 844], [1280, 800]]) {
  console.log(`— ${vp.join('x')}`);
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(400);
  await startListening(page);
  await page.waitForFunction(() => document.body.classList.contains('listening'), null, { timeout: 5000 });
  await page.mouse.move(vp[0] / 2, vp[1] / 2);
  await page.waitForTimeout(500);
  check('재생기가 보임', await bar(page));
  let s = sizeAndOverlap(await buttons(page));
  check('펼친 재생기: 단추 48 이상·겹침 없음', !s.small.length && !s.ov.length, [...s.small, ...s.ov].join(', '));
  const fold = await page.$('#listen [data-l="fold"]');
  check('접기 단추 있음', !!fold);
  if (fold) {
    await fold.click();
    await page.waitForTimeout(900);
    check('접으면 재생기 사라짐', !(await bar(page)));
    check('접으면 작은 알약(재생·펴기) 보임', (await shown(page, '#listen .l-mini')) && (await shown(page, '#listen .l-mini [data-l="unfold"]')));
    s = sizeAndOverlap(await buttons(page));
    check('접은 상태: 단추 48 이상·겹침 없음', !s.small.length && !s.ov.length, [...s.small, ...s.ov].join(', '));
    // 둘러보기: 화면을 누르고 끌어도 다시 뜨지 않는다
    await page.mouse.move(vp[0] / 2, vp[1] / 3);
    await page.mouse.down();
    await page.mouse.move(vp[0] / 2 + 80, vp[1] / 3, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    check('접은 동안 끌어 둘러봐도 재생기가 뜨지 않음', !(await bar(page)));
    // 알약의 재생 단추로 멈춤
    await page.click('#listen .l-mini [data-l="play"]');
    await page.waitForTimeout(300);
    check('알약에서 멈춤', await page.evaluate(() => document.querySelector('#listen').classList.contains('paused')));
    await page.click('#listen .l-mini [data-l="play"]');
    await page.click('#listen [data-l="unfold"]');
    await page.waitForTimeout(900);
    check('펴기 → 재생기 돌아옴', await bar(page));
    // 재생기 단추를 누른 뒤 가만히 → 저절로 숨음
    await page.click('#listen [data-l="mode"]');
    await page.mouse.move(vp[0] / 2, vp[1] / 3);
    await page.waitForTimeout(4600);
    check('단추를 누른 뒤에도 3.5초 가만히 있으면 숨음', await page.evaluate(() => document.querySelector('#listen').classList.contains('l-idle')));
    // 다시 접고 나갔다 들어오면 접힌 채 시작
    await page.mouse.move(vp[0] / 2, vp[1] / 2 + 10);
    await page.waitForTimeout(300);
    await page.click('#listen [data-l="fold"]');
    await page.evaluate(() => window.temple.exitListening());
    await page.waitForFunction(() => !document.body.classList.contains('listening'), null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await startListening(page);
    await page.waitForFunction(() => document.body.classList.contains('listening'), null, { timeout: 5000 });
    await page.mouse.move(vp[0] / 2, vp[1] / 2);
    await page.waitForTimeout(900);
    check('다음 듣기도 접힌 채 시작', !(await bar(page)) && (await shown(page, '#listen .l-mini')));
  }
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
