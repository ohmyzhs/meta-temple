// 차담 대사 장면 — node tools/qa/tea.mjs   (먼저 python3 .claude/devserver.py 8081, 다른 서버는 BASE=…)
// /api/monk 는 page.route 로 흉내 낸다 (키 없이). OUT=폴더 를 주면 장면마다 스크린숏을 남긴다.
// 확인: HUD 를 거두고 구도가 고정되는가 · 첫인사와 예상 응답 · AI 답(구절·AI 표시) · 1·2·3 키 · 직접 말하기 · 위기 109 · 오프라인 대화 나무 · 일어나면 HUD·카메라가 돌아오는가
import { mkdirSync } from 'node:fs';
import { launch, enter } from './lib.mjs';
import { DHARMA_CARDS, TEA_LINES, voiceKey, cardVoiceText } from '../../web/src/data/dharmaTexts.js';

const OUT = process.env.OUT;
if (OUT) mkdirSync(OUT, { recursive: true });
const SIZES = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[360, 780], [390, 844], [430, 932], [1280, 800], [844, 390]];
const AI = (msg) => ({
  ai: true,
  reply: `“${msg}” 하고 말씀하시니 찻잔을 내려놓고 듣게 됩니다. 밤이 길게 느껴지는 날에는 잠을 이기려 하지 말고, 내쉬는 숨을 조금만 길게 해 보시지요.`,
  suggestions: ['생각이 많아 잠이 안 와요', '숨을 길게 쉬어 볼게요', '차 한 잔 더 주시겠어요'],
  verseId: 'dhp_60',
  verse: '“잠 못 이루는 이에게 밤은 길고, 지친 이에게 길은 멀다.” — 『법구경』 제60게',
  crisis: false,
  left: 17
});

async function mock(page, mode) {
  await page.route('**/api/monk', async (route) => {
    if (mode === 'offline') return route.abort();
    if (route.request().method() === 'GET') return route.fulfill({ json: { ai: true, limit: 20 } });
    const body = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 500));
    return route.fulfill({ json: AI(body.message) });
  });
}

const toTea = async (p) => {
  await p.click('#place-btn');
  await p.click('#place-list [data-goto-zone="TEAHOUSE"]');
  await p.waitForFunction(() => window.temple.zone === 'TEAHOUSE', null, { timeout: 5000 });
  await p.waitForTimeout(800);
  await p.click('#dock-rituals [data-ritual="tea_chat"]');
  await p.waitForFunction(() => window.temple.modals.current === 'tea_chat' && document.body.classList.contains('tea-scene'), null, { timeout: 15000 });
};
const repliesShown = (p) => p.waitForSelector('.tea-replies:not([hidden]) .tea-reply', { timeout: 20000 });
const shot = async (p, name) => OUT && (await p.waitForTimeout(350), await p.screenshot({ path: `${OUT}/${name}.png` }));
const fails = [];
const check = (cond, msg) => (cond ? console.log(`  ✓ ${msg}`) : (fails.push(msg), console.log(`  ✗ ${msg}`)));

const browser = await launch();
for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  console.log(`— ${tag}`);
  const { ctx, page, touch, errors } = await enter(browser, [w, h], { init: () => localStorage.clear() });
  page.on('pageerror', (e) => console.log(`    pageerror: ${String(e.stack || e).split('\n').slice(0, 4).join(' | ')}`));
  const voiceReqs = [];
  page.on('request', (r) => r.url().includes('/assets/audio/monk/') && voiceReqs.push(r.url()));
  await page.evaluate(() => (window.speechSynthesis.speak = () => { throw new Error('브라우저 음성 합성을 쓰면 안 된다'); }));
  await mock(page, 'ai');
  await toTea(page);
  await page.waitForTimeout(1000); // HUD 는 0.8초에 걸쳐 사라진다
  const hud = await page.evaluate(() => getComputedStyle(document.querySelector('#hud')).opacity);
  check(hud === '0', `HUD 거둠 (opacity ${hud})`);
  check(await page.evaluate(() => !!window.temple.world.cam.shot), '카메라 구도 고정');
  // 첫인사: 눌러서 끝까지 → 예상 응답 셋 + 직접 말하기
  await page.waitForTimeout(900);
  await page.click('.tea-say');
  await repliesShown(page);
  check((await page.locator('.tea-reply').count()) === 4, '예상 응답 3 + 직접 말하기');
  check(voiceReqs.some((u) => /\/assets\/audio\/monk\/[0-9a-f]{8}\.mp3$/.test(u)) && (await page.evaluate(() => !!window.temple.sound._voiceStop)), `첫인사를 녹음한 목소리로 (${voiceReqs.length}개 받음)`);
  check(/AI/.test(await page.textContent('.tea-ai')), `AI 표시 「${await page.textContent('.tea-ai')}」`);
  const box = await page.locator('.tea-box').boundingBox();
  const all = await page.locator('.m-view.tea').boundingBox();
  check(all.y + all.height <= h + 1 && all.y >= 0, `대사 상자·응답이 화면 안 (위 ${Math.round(all.y)} · 높이 ${Math.round(all.height)} / ${h}, 상자 ${Math.round(box.height)})`);
  await shot(page, `${tag}-1-greet`);

  // 죽비 층: 대사 상자를 거두고 가운데 큰 카드 — 화면 안에 다 들어오고(스크롤 없이), Esc 는 층만 닫는다
  await page.click('[data-act="card"]');
  await page.waitForSelector('.tea-jukbi:not([hidden]) .jukbi-card.is-flipped', { timeout: 5000 });
  await page.waitForTimeout(1100); // 뒤집히는 0.95초
  const jk = await page.evaluate(() => {
    const panel = document.querySelector('.tea-jukbi-panel').getBoundingClientRect();
    const card = document.querySelector('.tea-jukbi .jukbi-card').getBoundingClientRect();
    const p = document.querySelector('.tea-jukbi-panel');
    return { panel: [panel.left, panel.top, panel.right, panel.bottom].map(Math.round), card: [card.left, card.top, card.right, card.bottom].map(Math.round), scroll: p.scrollHeight - p.clientHeight, box: getComputedStyle(document.querySelector('.tea-box')).visibility };
  });
  const cx = (jk.card[0] + jk.card[2]) / 2;
  check(jk.panel[0] >= 0 && jk.panel[1] >= 0 && jk.panel[2] <= w && jk.panel[3] <= h && jk.scroll <= 1, `죽비 층이 화면 안, 스크롤 없음 (패널 ${jk.panel.join(',')} · 넘침 ${jk.scroll}px)`);
  check(jk.box === 'hidden' && (h < 520 || Math.abs(cx - w / 2) <= 2), `대사 상자 거둠 · 카드 가운데 (카드 중심 ${Math.round(cx)} / ${w / 2})`);
  await shot(page, `${tag}-7-jukbi`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.tea-jukbi[hidden]', { state: 'attached', timeout: 3000 });
  check((await page.evaluate(() => window.temple.modals.current)) === 'tea_chat' && !(await page.isHidden('.tea-replies')), 'Esc 는 죽비 층만 닫고 차담은 그대로');

  // 고르기: 휴대폰은 누르고, 데스크톱은 1 키
  const before = await page.evaluate(() => window.temple.player.state);
  if (touch) await page.locator('.tea-reply').first().click();
  else await page.keyboard.press('1');
  await page.waitForSelector('.m-view.tea.is-thinking', { timeout: 3000 });
  await shot(page, `${tag}-2-thinking`);
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check(!(await page.isHidden('.tea-verse')), '경전 구절 보임');
  check((await page.textContent('.tea-you')).includes('잠을 잘 못 자요'), '내가 건넨 말 보임');
  if (!touch) check((await page.evaluate(() => window.temple.player.state)) === before || before === 'tea', `1 키가 몸짓으로 새지 않음 (${await page.evaluate(() => window.temple.player.state)})`);
  await shot(page, `${tag}-3-ai-reply`);

  // 직접 말하기 → 위기 신호는 서버에 묻지 않고 109
  await page.click('.tea-reply.is-own');
  await page.waitForSelector('.tea-compose:not([hidden]) input', { timeout: 3000 });
  check(await page.evaluate(() => document.activeElement?.id === 'tea-input'), '입력칸에 초점');
  await page.fill('#tea-input', '요즘은 그냥 죽고 싶다는 생각이 들어요');
  await shot(page, `${tag}-4-compose`);
  await page.press('#tea-input', 'Enter');
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check(!(await page.isHidden('.tea-help')) && (await page.textContent('.tea-help')).includes('109'), '위기: 109 안내');
  await shot(page, `${tag}-5-crisis`);

  // 일어나기 → HUD·카메라 돌아옴
  await page.click('[data-act="leave"]');
  await page.waitForFunction(() => !document.body.classList.contains('tea-scene'), null, { timeout: 5000 });
  await page.waitForTimeout(1600);
  check(await page.evaluate(() => !window.temple.world.cam.shot && getComputedStyle(document.querySelector('#hud')).opacity === '1'), '일어나면 HUD·카메라 원래대로');
  await shot(page, `${tag}-6-left`);
  check(!errors.length, `페이지 오류 없음 ${errors[0] || ''}`);
  await ctx.close();
}

// 오프라인: 서버에 닿지 않으면 대화 나무로, 「미리 적어 둔 말」 표시
{
  console.log('— offline 390x844');
  const { ctx, page, errors } = await enter(browser, [390, 844], { init: () => localStorage.clear() });
  page.on('pageerror', (e) => console.log(`    pageerror: ${String(e.stack || e).split('\n').slice(0, 4).join(' | ')}`));
  await mock(page, 'offline');
  await toTea(page);
  await page.waitForTimeout(900);
  await page.click('.tea-say');
  await repliesShown(page);
  await page.locator('.tea-reply').nth(1).click();
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check((await page.textContent('.tea-ai')).includes('미리 적어 둔'), `오프라인 표시 「${await page.textContent('.tea-ai')}」`);
  check((await page.locator('.tea-reply').count()) === 4, '오프라인에도 예상 응답 3');
  await shot(page, 'offline-390x844');
  // 걸으면 일어난다
  await page.evaluate(() => (window.temple.joy = { x: 0, z: 1 }));
  await page.waitForTimeout(700);
  await page.evaluate(() => (window.temple.joy = { x: 0, z: 0 }));
  check(await page.evaluate(() => window.temple.modals.current !== 'tea_chat'), '걸으면 차담이 닫힘');
  check(!errors.length, `페이지 오류 없음 ${errors[0] || ''}`);
  await ctx.close();
}
// 오늘 몫을 다 썼을 때(429) 「찻물이 식었습니다」 한 번, 거친 말은 서버에 보내지 않고 스님이 달랜다
{
  console.log('— quota·blocked 390x844');
  const { ctx, page, errors } = await enter(browser, [390, 844], { init: () => localStorage.clear() });
  page.on('pageerror', (e) => console.log(`    pageerror: ${String(e.stack || e).split('\n').slice(0, 4).join(' | ')}`));
  let posts = 0;
  await page.route('**/api/monk', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ai: true, limit: 20 } });
    posts++;
    return route.fulfill({ status: 429, json: { ai: false, reason: 'quota', left: 0 } });
  });
  await toTea(page);
  await page.waitForTimeout(900);
  await page.click('.tea-say');
  await repliesShown(page);
  await page.locator('.tea-reply').first().click();
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check((await page.textContent('.tea-line')).startsWith('찻물이 식었습니다'), '한도 끝: 찻물이 식었습니다');
  check((await page.locator('.tea-reply').count()) === 4, '한도 뒤에도 대화 나무 예상 응답');
  await shot(page, 'quota-390x844');
  const before = posts;
  await page.click('.tea-reply.is-own');
  await page.fill('#tea-input', '시발 다 짜증나');
  await page.press('#tea-input', 'Enter');
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check(posts === before && (await page.textContent('.tea-line')).includes('순한 말로'), '거친 말은 보내지 않고 달램');
  // 뒤로가기(안드로이드)로 차담을 닫으면 장면도 걷힌다
  await page.goBack();
  await page.waitForFunction(() => !document.body.classList.contains('tea-scene') && window.temple.modals.current !== 'tea_chat', null, { timeout: 5000 });
  check(true, '뒤로가기로 차담 닫힘');
  check(!errors.length, `페이지 오류 없음 ${errors[0] || ''}`);
  await ctx.close();
}
// 기억: AI 가 준 메모는 이 브라우저에만 두고, 다시 앉으면 다음 요청에 실어 보낸다. 「잊게 하기」로 지운다
{
  console.log('— memory 390x844');
  const { ctx, page, errors } = await enter(browser, [390, 844], { init: () => localStorage.clear() });
  page.on('pageerror', (e) => console.log(`    pageerror: ${String(e.stack || e).split('\n').slice(0, 4).join(' | ')}`));
  const sent = [];
  await page.route('**/api/monk', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ai: true, limit: 20 } });
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill({ json: { ...AI(body.message), memory: sent.length === 1 ? '요즘 잠을 잘 못 이룸. 숨을 길게 내쉬기를 권함' : '' } });
  });
  const settings = () => page.evaluate(() => window.temple.store.state.settings.teaMemory || '');
  await toTea(page);
  await page.waitForTimeout(900);
  await page.click('.tea-say');
  await repliesShown(page);
  await page.locator('.tea-reply').first().click();
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check(sent[0].memory === '', '첫 차담: 보낸 메모 없음');
  check((await settings()).startsWith('요즘 잠을'), '받은 메모를 이 브라우저에 둠');
  check((await page.textContent('.tea-ai')).includes('기억합니다'), `표시 「${await page.textContent('.tea-ai')}」`);
  await shot(page, 'memory-390x844');
  // 일어났다가 다시 앉기 → 메모를 실어 보낸다, 빈 메모가 오면 지난 메모 그대로
  await page.click('[data-act="leave"]');
  await page.waitForFunction(() => !document.body.classList.contains('tea-scene'), null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.click('#dock-rituals [data-ritual="tea_chat"]');
  await page.waitForFunction(() => window.temple.modals.current === 'tea_chat' && document.body.classList.contains('tea-scene'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.click('.tea-say');
  await repliesShown(page);
  await page.locator('.tea-reply').nth(1).click();
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  check(sent[1]?.memory?.startsWith('요즘 잠을'), '다시 앉으면 메모를 실어 보냄');
  check((await settings()).startsWith('요즘 잠을'), '빈 메모가 오면 지난 메모 그대로');
  await page.click('.tea-forget');
  check((await settings()) === '' && !(await page.textContent('.tea-ai')).includes('기억'), '잊게 하기로 지움');
  check(!errors.length, `페이지 오류 없음 ${errors[0] || ''}`);
  await ctx.close();
}
// 목소리: 고정 대사만. 죽비는 건네는 말 다음에 구절, 일어나면 끝인사, 「오늘의 죽비」·보관함 「듣기」
{
  console.log('— voice·jukbi 390x844');
  const { ctx, page, errors } = await enter(browser, [390, 844], { init: () => localStorage.clear() });
  page.on('pageerror', (e) => console.log(`    pageerror: ${String(e.stack || e).split('\n').slice(0, 4).join(' | ')}`));
  await mock(page, 'ai');
  // 실제로 튼 소리를 적어 둔다 (원래 재생은 그대로)
  await page.evaluate(() => {
    const s = window.temple.sound;
    const play = s.playVoice.bind(s);
    window.__voices = [];
    s.playVoice = (url, onEnd) => (window.__voices.push(url.split('/').pop().slice(0, 8)), play(url, onEnd));
  });
  const voices = () => page.evaluate(() => window.__voices.slice());
  const cardKeys = new Set(DHARMA_CARDS.map((c) => voiceKey(cardVoiceText(c))));
  await toTea(page);
  await page.waitForTimeout(900);
  await page.click('.tea-say');
  await repliesShown(page);
  check((await voices()).includes(voiceKey(TEA_LINES.hello)), '첫인사 목소리');
  // AI 답은 소리 내지 않는다
  await page.locator('.tea-reply').first().click();
  await page.waitForSelector('.m-view.tea:not(.is-thinking)', { timeout: 10000 });
  await page.click('.tea-say');
  await repliesShown(page);
  const afterAi = await voices();
  check(afterAi.length === 1, `AI 답은 글로만 (튼 소리 ${afterAi.length}개)`);
  // 죽비 층: 뒤집히면 구절을 읽는다. 뒤로가기는 층만 닫는다
  await page.click('[data-act="card"]');
  await page.waitForFunction((k) => window.__voices.some((v) => k.includes(v)), [...cardKeys], { timeout: 5000 });
  check(cardKeys.has((await voices()).at(-1)), '죽비 층: 뒤집히면 구절을 읽음');
  await page.waitForTimeout(1100);
  await page.click('.tea-jukbi [data-act="keep"]');
  await shot(page, 'voice-jukbi-390x844');
  await page.goBack();
  await page.waitForSelector('.tea-jukbi[hidden]', { state: 'attached', timeout: 3000 });
  check((await page.evaluate(() => window.temple.modals.current)) === 'tea_chat', '뒤로가기는 죽비 층만 닫음');
  // 일어나면 끝인사
  await page.click('[data-act="leave"]');
  await page.waitForTimeout(300);
  check((await voices()).at(-1) === voiceKey(TEA_LINES.bye), '일어나면 끝인사');
  await page.waitForFunction(() => !document.body.classList.contains('tea-scene'), null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  // 「오늘의 죽비」 창: 뽑으면 읽는다
  await page.evaluate(() => window.temple.modals.open('dharma_card'));
  await page.click('.jukbi-card');
  await page.waitForTimeout(400);
  check(cardKeys.has((await voices()).at(-1)), '오늘의 죽비: 뽑으면 읽음');
  await page.evaluate(() => window.temple.modals.close());
  // 보관함: 간직한 죽비 「듣기」 — 차담 목소리를 꺼 두어도 직접 누르면 들린다
  await page.evaluate(() => window.temple.store.setSetting('teaVoice', false));
  await page.evaluate(() => window.temple.modals.open('profile'));
  await page.waitForSelector('.pf-listen', { timeout: 3000 });
  const n0 = (await voices()).length;
  await page.click('.pf-listen');
  await page.waitForTimeout(300);
  const v2 = await voices();
  check(v2.length === n0 + 1 && cardKeys.has(v2.at(-1)), '보관함 듣기 단추 (목소리 꺼도 직접 누르면)');
  await page.locator('.pf-cards').scrollIntoViewIfNeeded();
  await shot(page, 'voice-kept-390x844');
  check(!errors.length, `페이지 오류 없음 ${errors[0] || ''}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `FAIL (${fails.length})` : 'PASS');
process.exit(fails.length ? 1 : 0);
