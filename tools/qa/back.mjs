// 안드로이드 뒤로가기 방어 검사 — node tools/qa/back.mjs   (먼저 python3 .claude/devserver.py 8081)
// 계획서 B3:
//  (a) 창(모달)을 열고 뒤로 → 창이 닫히고 사이트 안
//  (b) 시트 + 창이 겹쳐 있을 때 뒤로 두 번 → 창 먼저, 시트 다음
//  (c) 아무것도 없을 때 뒤로 한 번 → 「한 번 더 누르면 산문을 나섭니다」, 사이트 안
//  (d) 2초 안에 한 번 더 → 산문 앞 첫 화면(입장 전 화면), 사이트 안
//      → 다시 들어서면 방어가 다시 켜짐 → 첫 화면에서 뒤로 → 이전 페이지로 나감
//  (e) 창 하나를 연 채 0.2초 간격으로 세 번 연타 → 창만 닫히고 사이트 안
//  (f) 예불 듣기 중 뒤로 → 듣기에서 일어남   (g) 차담 창도 닫힘
//  (h) 링크로 바로 들어온 경우(앞 페이지 없음)   (i) 새로고침 뒤 다시 들어온 경우
// 더해서: 입장 뒤 모든 pushState 가 사용자 동작(navigator.userActivation.isActive) 안에서 일어났는지.
//   크롬은 뒤로가기 뒤 사용자 동작 없이 쌓은 항목을 '건너뛸 항목'으로 표시해 다음 뒤로가기가 사이트를 통째로 넘긴다.
//   page.goBack() 은 CDP 로 항목을 직접 골라 가서 그 건너뛰기를 재현하지 못하므로, 이 조건으로 대신 확인한다.
import { launch, enter, BASE } from './lib.mjs';

const PREV = 'data:text/html,<title>prev</title><p>prev';
const MSG = '한 번 더 누르면 산문을 나섭니다';
// 크롬 규칙을 흉내: pushState 직전에 '마지막 뒤로가기(popstate) 뒤의 진짜 사용자 동작'이 있었는지 기록
// (사용자 동작 = 마우스 누름 · 마우스 아닌 손가락 뗌 · Esc 아닌 키. 페이지 스크립트보다 먼저 붙는다)
const TRACK = () => {
  let n = 0, lastAct = -1, lastPop = -1;
  const act = (e) => {
    if (!e.isTrusted) return;
    if (e.type === 'keydown' ? e.key !== 'Escape' : (e.type === 'pointerdown') === (e.pointerType === 'mouse')) lastAct = ++n;
  };
  for (const t of ['pointerdown', 'pointerup', 'keydown']) addEventListener(t, act, true);
  addEventListener('popstate', () => (lastPop = ++n), true);
  const orig = history.pushState.bind(history);
  window.__pushes = [];
  history.pushState = (...a) => {
    window.__pushes.push({ ok: lastAct > lastPop, state: JSON.stringify(a[0]) });
    return orig(...a);
  };
};
const browser = await launch();
const { ctx, page, errors } = await enter(browser, [390, 844], {
  prev: PREV,
  init: TRACK
});

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const st = () =>
  page.evaluate(() => ({
    modal: window.temple?.modals.current || null,
    sheet: [...document.querySelectorAll('.sheet')].find((s) => !s.classList.contains('hidden'))?.id || null,
    toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' / '),
    state: JSON.stringify(history.state)
  }));
const inSite = () => page.url().startsWith(BASE);
const INTRO = () => {
  const i = document.querySelector('#intro');
  return !i.classList.contains('hidden') && !i.classList.contains('leaving') && document.querySelector('#hud').classList.contains('hidden') && !window.temple.entered;
};
const atIntro = (p = page) => p.waitForFunction(INTRO, null, { timeout: 3000 }).then(() => true, () => false);
const back = () => page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch((e) => console.log('   goBack:', e.message.split('\n')[0]));
const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
const settle = (ms = 900) => page.waitForTimeout(ms); // 닫은 직후의 조용한 구간(0.7초)·토스트 창(2초)이 겹치지 않게
const tapScene = () => page.mouse.click(195, 300); // 빈 곳 누르기 = 사용자 동작 (모자란 칸을 채운다)

try {
await page.waitForTimeout(600);
check('입장 뒤 방어 항목이 쌓임', JSON.parse((await st()).state || 'null') !== null, (await st()).state);

// (a)
await page.click('#menu-btn', { timeout: 5000 });
await page.click('#help-btn', { timeout: 5000 });
await page.waitForTimeout(200);
check('(a) 준비: 도움말 창 열림', (await st()).modal === 'help');
await back();
await page.waitForTimeout(200);
let s = await st();
check('(a) 뒤로 → 창 닫힘, 사이트 안', !s.modal && inSite(), JSON.stringify(s));

// (b)
await settle();
await page.click('#menu-btn', { timeout: 5000 });
await page.evaluate(() => window.temple.modals.open('profile'));
await page.waitForTimeout(200);
s = await st();
check('(b) 준비: 메뉴 시트 + 기록 창', s.modal === 'profile' && s.sheet === 'menu-sheet', JSON.stringify(s));
await back();
await page.waitForTimeout(150);
s = await st();
check('(b) 뒤로 1 → 창 먼저 닫힘, 시트는 그대로', !s.modal && s.sheet === 'menu-sheet' && inSite(), JSON.stringify(s));
await back();
await page.waitForTimeout(150);
s = await st();
check('(b) 뒤로 2 → 시트 닫힘, 사이트 안', !s.modal && !s.sheet && inSite(), JSON.stringify(s));

// (c)
await settle();
await clearToasts();
await back();
await page.waitForTimeout(250);
s = await st();
check(`(c) 아무것도 없을 때 뒤로 → 「${MSG}」, 사이트 안`, s.toast.includes(MSG) && inSite(), JSON.stringify(s));

// (e) — (d) 는 사이트를 떠나므로 마지막에
await settle(2300); // (c) 의 2초 창이 지나도록
await clearToasts();
await page.click('#menu-btn', { timeout: 5000 });
await page.click('#help-btn', { timeout: 5000 });
await page.waitForTimeout(200);
check('(e) 준비: 창 하나 열림', (await st()).modal === 'help');
for (let i = 0; i < 3; i++) {
  await back();
  await page.waitForTimeout(200);
}
await page.waitForTimeout(300);
s = await st();
check('(e) 0.2초 간격 세 번 → 창만 닫히고 사이트 안', !s.modal && inSite(), `${page.url().slice(0, 40)} ${JSON.stringify(s)}`);
check('(e) 연타 중 나가기 안내가 뜨지 않음', !s.toast.includes(MSG), s.toast);

// (f) 예불 듣기 중 뒤로 → 듣기에서 일어나 법당으로 (닫는 순서의 맨 앞)
await settle();
await page.click('#place-btn', { timeout: 5000 });
await page.click('#place-list [data-goto-zone="DAEUNGJEON"]', { timeout: 5000 });
await page.waitForTimeout(400);
await page.click('#dock-rituals [data-ritual="yebul"]', { timeout: 5000 });
await page.click('.yebul-item', { timeout: 5000 });
await page.waitForFunction(() => document.body.classList.contains('listening'), null, { timeout: 4000 }).catch(() => {});
check('(f) 준비: 예불 듣기 화면', await page.evaluate(() => document.body.classList.contains('listening')));
await back();
await page.waitForFunction(() => !document.body.classList.contains('listening'), null, { timeout: 4000 }).catch(() => {});
s = await st();
check('(f) 뒤로 → 예불 듣기에서 일어남, 사이트 안', (await page.evaluate(() => !document.body.classList.contains('listening') && !window.temple._listening)) && inSite(), JSON.stringify(s));

// (g) 차담(옆 창)도 닫힌다
await settle();
await page.click('#place-btn', { timeout: 5000 });
await page.click('#place-list [data-goto-zone="TEAHOUSE"]', { timeout: 5000 });
await page.waitForTimeout(400);
await page.click('#dock-rituals [data-ritual="tea_chat"]', { timeout: 5000 });
await page.waitForFunction(() => window.temple.modals.current === 'tea_chat', null, { timeout: 10000 }).catch(() => {}); // 찻자리까지 걸어간 뒤 열린다
check('(g) 준비: 차담 창', (await st()).modal === 'tea_chat');
await back();
await page.waitForTimeout(200);
s = await st();
check('(g) 뒤로 → 차담 닫힘, 사이트 안', !s.modal && inSite(), JSON.stringify(s));

// (d)
await settle(2300);
await tapScene();
await page.waitForTimeout(300);
await clearToasts();
await back();
await page.waitForTimeout(250);
s = await st();
check('(d) 준비: 첫 뒤로 → 안내', s.toast.includes(MSG) && inSite(), JSON.stringify(s));
await page.waitForTimeout(700);
await back();
check('(d) 2초 안에 한 번 더 → 산문 앞 첫 화면, 사이트 안', (await atIntro()) && inSite(), page.url().slice(0, 50));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
const sp = await page.evaluate(() => window.temple.avatars.playerPos.toArray().map((v) => +v.toFixed(1)));
check('(d) 몸은 일주문 앞에 다시 섬', Math.hypot(sp[0], sp[2] - 36) < 1, JSON.stringify(sp));

// 다시 들어서면 방어가 다시 켜진다
await page.waitForTimeout(500);
await page.click('#intro-enter', { timeout: 5000 });
await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden') && window.temple.entered, null, { timeout: 4000 }).catch(() => {});
await settle(1600); // 「다시 산문에 들어섰습니다」 안내까지
await clearToasts();
await back();
await page.waitForTimeout(250);
s = await st();
check('(d) 다시 들어서서 뒤로 → 다시 안내, 사이트 안', s.toast.includes(MSG) && inSite() && (await page.evaluate(() => window.temple.entered)), JSON.stringify(s));
await page.waitForTimeout(700);
await back();
check('(d) 한 번 더 → 다시 첫 화면', (await atIntro()) && inSite());

await page.waitForTimeout(700);
const pushes = await page.evaluate(() => window.__pushes); // 떠나기 전에
const bad = pushes.filter((p) => !p.ok);
check(`pushState ${pushes.length}번 모두 '뒤로가기 뒤 새 사용자 동작' 안에서`, pushes.length > 0 && !bad.length, bad.map((p) => p.state).join(', '));
await back();
await page.waitForURL((u) => !String(u).startsWith(BASE), { timeout: 4000 }).catch(() => {});
check('(d) 첫 화면에서 뒤로 → 이전 페이지로 나감', page.url().startsWith('data:'), page.url().slice(0, 50));

} catch (e) {
  check(`진행 중 멈춤 (사이트를 벗어났을 수 있음: ${page.url().slice(0, 30)})`, false, e.message.split('\n')[0]);
}
check('페이지 오류 없음', !errors.length, errors.join(' | '));
await ctx.close();

// pushState 기록만 따로: 들어가서 창 열고 닫고, 빈 곳 누르기를 몇 번 섞어 본다
{
  const { ctx, page } = await enter(browser, [390, 844], {
    init: TRACK
  });
  const goBack = () => page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 3 && page.url().startsWith(BASE); i++) {
    await page.click('#menu-btn', { timeout: 5000 });
    await goBack();
    await page.waitForTimeout(900);
    await page.mouse.click(195, 300);
    await page.waitForTimeout(200);
  }
  const pushes = (await page.evaluate(() => window.__pushes).catch(() => null)) || [];
  const bad = pushes.filter((p) => !p.ok);
  check(`pushState ${pushes.length}번 모두 사용자 동작 안에서 (뒤로가기 뒤 채우기 포함)`, pushes.length > 4 && !bad.length, bad.length ? bad.map((p) => p.state).join(', ') : '');
  await ctx.close();
}
// (h) 링크로 바로 들어옴 (앞 페이지 없음): 안내 → 한 번 더 누르면 맨 아래(원래 항목)로 — 그다음 뒤로가기는 브라우저가 탭을 닫는다
{
  const { ctx, page } = await enter(browser, [390, 844], { fresh: true });
  const goBack = () => page.goBack({ waitUntil: 'commit', timeout: 5000 });
  await page.waitForTimeout(600);
  const len = await page.evaluate(() => history.length);
  await goBack();
  await page.waitForTimeout(250);
  await page.waitForTimeout(500);
  await goBack();
  check('(h) 앞 페이지 없이 들어와 두 번 → 첫 화면, 사이트 안', (await atIntro(page)) && page.url().startsWith(BASE), `history.length ${len}`);
  await page.waitForTimeout(700);
  await goBack();
  await page.waitForTimeout(500);
  const at = await page.evaluate(() => ({ state: history.state, intro: !document.querySelector('#intro').classList.contains('hidden') }));
  check('(h) 첫 화면에서 뒤로 → 원래 항목에 섬(새로고침 없음, 첫 화면 그대로)', at.state === null && at.intro && page.url().startsWith(BASE), JSON.stringify(at));
  const more = await goBack().catch(() => 'err');
  check('(h) 그다음 뒤로가기는 갈 곳 없음 (안드로이드는 탭을 닫음)', more === null, String(more));
  await ctx.close();
}

// (i) 새로고침(당겨서 새로고침) 뒤 다시 들어와도: 안내 → 한 번 더 누르면 옛 칸을 모두 건너 이전 페이지로
{
  const { ctx, page } = await enter(browser, [390, 844], { prev: PREV });
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(1600);
  const st0 = await page.evaluate(() => JSON.stringify(history.state));
  const goBack = () => page.goBack({ waitUntil: 'commit', timeout: 5000 }).catch(() => {});
  // 새로고침 뒤에도 쓴 칸을 다시 채운다 (창을 닫느라 한 칸 쓰고 → 빈 곳 누르기)
  await page.click('#menu-btn', { timeout: 5000 });
  await page.click('#help-btn', { timeout: 5000 });
  await page.waitForTimeout(200);
  await goBack();
  await page.waitForTimeout(900);
  const used = await page.evaluate(() => JSON.stringify(history.state));
  await page.mouse.click(195, 300);
  await page.waitForTimeout(200);
  const refilled = await page.evaluate(() => JSON.stringify(history.state));
  check('(i) 새로고침 뒤에도 쓴 칸을 다시 채움', used !== st0 && refilled === st0, `${st0} → ${used} → ${refilled}`);
  await page.waitForTimeout(800);
  await goBack();
  await page.waitForTimeout(250);
  const t = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' / '));
  await page.waitForTimeout(500);
  await goBack();
  const intro = await atIntro(page);
  await page.waitForTimeout(700);
  await goBack();
  await page.waitForURL((u) => !String(u).startsWith(BASE), { timeout: 4000 }).catch(() => {});
  check('(i) 새로고침 뒤 다시 들어와: 안내 → 첫 화면 → 이전 페이지로', t.includes(MSG) && intro && page.url().startsWith('data:'), `들어온 칸 ${st0} · ${page.url().slice(0, 40)}`);
  await ctx.close();
}

await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
