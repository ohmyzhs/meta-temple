// 앉은 몸짓이 선 채로 남지 않는지 — node tools/qa/seated.mjs   (먼저 python3 .claude/devserver.py 8081)
// 버그: 차담·다선·가부좌 뒤 걸으면 차 마시는(앉은) 모습 그대로 돌아다니고 풀리지 않았다.
// 기준: 걷고 있는(앉지 않은) 내 아바타의 상태(state)와 쉬는 상태(restState)가 앉은 것(sit·meditate·tea)이 아닐 것.
//      이 상태는 실시간 동석으로 남에게도 그대로 보내지므로 겉모습만이 아니라 상태 값을 본다.
import { launch, enter } from './lib.mjs';

const SEATED = ['sit', 'meditate', 'tea'];
const browser = await launch();
let failed = 0;
const st = (p) => p.evaluate(() => { const pl = window.temple.player; return { state: pl.state, rest: pl.restState, sitting: pl.sitting }; });
const walk = async (p, ms) => {
  await p.evaluate(() => (window.temple.joy = { x: 0, z: 1 })); // 조이스틱을 민 것과 같다
  await p.waitForTimeout(ms);
  await p.evaluate(() => (window.temple.joy = { x: 0, z: 0 }));
};
const toTea = async (p) => {
  await p.click('#place-btn');
  await p.click('#place-list [data-goto-zone="TEAHOUSE"]');
  await p.waitForFunction(() => window.temple.zone === 'TEAHOUSE', null, { timeout: 5000 });
  await p.waitForTimeout(800);
  await p.click('#dock-rituals [data-ritual="tea_chat"]');
  await p.waitForFunction(() => window.temple.modals.current === 'tea_chat', null, { timeout: 10000 });
};
const gesture = (p, g) => p.evaluate((x) => window.temple.gesture(x), g);

const CASES = [
  ['차담에 앉자마자(차를 들기 전) 걸어 나감', async (p) => { await toTea(p); await p.waitForTimeout(300); await walk(p, 1200); await p.waitForTimeout(1800); await walk(p, 800); }],
  ['차담에서 차를 마시다 걸어 나감', async (p) => { await toTea(p); await p.waitForTimeout(3500); await walk(p, 1200); }],
  ['다선 → 걷기 → 합장', async (p) => { await gesture(p, 'tea'); await p.waitForTimeout(600); await walk(p, 1000); await gesture(p, 'bow_half'); await p.waitForTimeout(3200); await walk(p, 600); }],
  ['가부좌 → 걷기 → 큰절', async (p) => { await gesture(p, 'meditate'); await p.waitForTimeout(600); await walk(p, 1000); await gesture(p, 'prostrate'); await p.waitForTimeout(6500); await walk(p, 600); }]
];

for (const [name, run] of CASES) {
  const { ctx, page, errors } = await enter(browser, [390, 844]);
  await page.waitForTimeout(500);
  await run(page);
  const s = await st(page);
  const bad = !s.sitting && (SEATED.includes(s.state) || SEATED.includes(s.rest));
  if (bad || errors.length) failed++;
  console.log(`${bad || errors.length ? '✗' : '✓'} ${name} — state=${s.state} rest=${s.rest} sitting=${s.sitting}${errors.length ? ' 오류 ' + errors[0] : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
