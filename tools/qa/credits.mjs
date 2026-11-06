// 출처 모아보기 검사 — node tools/qa/credits.mjs   (먼저 python3 .claude/devserver.py 8081)
//  · 도움말·예불 목록에 출처 표기(공공누리·자연의소리)가 없을 것
//  · 메뉴의 「자료 출처」와 도움말 맨 아래 「자료 출처」로 연 화면에 지금의 모든 소리 출처(제목·링크)가 있을 것
import { launch, enter } from './lib.mjs';

const { CREDITS } = await import('../../web/src/data/credits.js').catch(() => ({ CREDITS: { sound: [] } }));
const browser = await launch();
const { ctx, page, errors } = await enter(browser, [390, 844]);
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const bodyText = () => page.evaluate(() => document.querySelector('#modal-body').innerText);
const links = () => page.evaluate(() => [...document.querySelectorAll('#modal-body a')].map((a) => a.href));
const BANNED = /공공누리|자연의소리/;

check('credits.js 에 소리 출처가 있음', CREDITS.sound.length > 0, `${CREDITS.sound.length}건`);

for (const view of ['help', 'yebul']) {
  await page.evaluate((v) => window.temple.modals.open(v), view);
  await page.waitForTimeout(200);
  const t = await bodyText();
  check(`${view}: 출처 표기 없음`, !BANNED.test(t), (t.match(BANNED) || [''])[0]);
}

const allThere = async (how) => {
  // 출처별 카드는 묶음 이름에 있는 말(「자연의소리」)을 원본 이름 앞에서 떼어 보여 준다 — 원본 이름 전체는 링크의 title 에
  const anchors = await page.evaluate(() => [...document.querySelectorAll('#modal-body a')].map((a) => ({ href: a.href, name: a.title || a.textContent })));
  const missing = CREDITS.sound.filter((c) => !anchors.some((a) => a.href === c.url && a.name === c.title)).map((c) => c.title);
  check(`${how}: 모든 소리 출처(${CREDITS.sound.length}) 제목·링크`, CREDITS.sound.length && !missing.length, missing.join(', '));
};

// 메뉴 → 자료 출처
await page.evaluate(() => window.temple.modals.close());
await page.click('#menu-btn');
await page.click('#credits-btn').catch(() => {});
await page.waitForTimeout(250);
check('메뉴 → 자료 출처 화면', (await page.evaluate(() => window.temple.modals.current)) === 'credits');
await allThere('메뉴에서');

// 도움말 맨 아래 → 자료 출처
await page.evaluate(() => window.temple.modals.open('help'));
await page.waitForTimeout(200);
const linkBtn = await page.$('#modal-body [data-act="credits"]');
check('도움말 맨 아래 「자료 출처」 링크', !!linkBtn && (await page.evaluate((el) => el === [...document.querySelectorAll('#modal-body button, #modal-body a')].at(-1), linkBtn)));
if (linkBtn) {
  await linkBtn.click();
  await page.waitForTimeout(250);
  check('도움말 → 자료 출처 화면', (await page.evaluate(() => window.temple.modals.current)) === 'credits');
  await allThere('도움말에서');
}
check('페이지 오류 없음', !errors.length, errors.join(' | '));
await ctx.close();
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
