// 「자연의 소리 듣기」 검사 — node tools/qa/nature-listen.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 기준:
//   (a) 소리 창 「자연의 소리 듣기」 → 장면 목록 → 고르면 앉아 듣기 화면(.listen.nature), 엔진 preset 이 그 장면
//   (b) 잠자기 타이머는 재생 시간으로 줄어든다(AudioContext 시계) · 다음 단추는 다음 장면 · 일어나면 preset·타이머가 풀린다
//   (c) 타이머가 다 되면 소리가 멈추고(pauseAll) 듣기가 끝난다
//   (d) 장면마다 그 장면의 레이어가 들린다(목표 크기 > 0)·다른 것은 꺼진다
//   (e) 안드로이드·화면 꺼짐(숨김): 닻이 돌고, 잠자기 타이머가 AudioContext 시계로 줄고, 배경 조각이 이음새를 넘어 다음 조각으로 간다
import { launch, BASE } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(2500);
  // (a)
  await page.evaluate(() => document.querySelector('#nature-listen-btn').click());
  await page.waitForSelector('.yebul-item[data-id="rain"]', { timeout: 5000 });
  await page.click('[data-sleep="15"]');
  await page.click('.yebul-item[data-id="rain"]');
  await page.waitForTimeout(2500);
  let s = await page.evaluate(() => {
    const t = window.temple, e = t.sound;
    return { preset: e.preset?.id, nature: document.querySelector('#listen').classList.contains('nature'), hidden: document.querySelector('#listen').classList.contains('hidden'), left: e.sleepLeft, rain: e.L.rain.level.gain._target, birds: e.L.birds.level.gain._target, weather: t.world.weatherName };
  });
  check('(a) 장면 「산사의 비」로 듣기 시작', s.preset === 'rain' && s.nature && !s.hidden, JSON.stringify(s));
  check('(d) 비가 들리고 산새는 꺼짐 · 하늘도 비', s.rain > 0 && s.birds === 0 && s.weather === 'rain');
  const l1 = s.left;
  await page.waitForTimeout(3000);
  s = await page.evaluate(() => ({ left: window.temple.sound.sleepLeft, t: document.querySelector('#listen-time').textContent }));
  check('(b) 잠자기 타이머가 15분에서 줄어든다', l1 <= 900 && s.left < l1 - 2 && s.left > 880, `${l1?.toFixed(1)} → ${s.left?.toFixed(1)} · ${s.t}`);
  await page.evaluate(() => document.querySelector('#listen [data-l="next"]').click());
  await page.waitForTimeout(1500);
  s = await page.evaluate(() => window.temple.sound.preset?.id);
  check('(b) 다음 단추 → 다음 장면', s === 'pines', s);
  // (c) 타이머를 거의 끝으로
  await page.evaluate(() => (window.temple.sound._sleep.left = 1.2));
  await page.waitForTimeout(3500);
  s = await page.evaluate(() => ({ paused: window.temple.sound._userPaused, listening: !!window.temple._listening, preset: window.temple.sound.preset, state: window.temple.sound.ctx.state }));
  check('(c) 타이머 끝 → 멈춤·듣기 끝·장면 풀림', s.paused && !s.listening && s.preset === null, JSON.stringify(s));
  check('페이지 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // (e) 화면 꺼짐 — 안드로이드 크롬처럼
  const UA = 'Mozilla/5.0 (Linux; Android 15; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
  const c2 = await browser.newContext({ viewport: { width: 412, height: 915 }, userAgent: UA, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const p2 = await c2.newPage();
  const err2 = [];
  p2.on('pageerror', (e) => err2.push(String(e)));
  await p2.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await p2.click('#intro-enter');
  await p2.waitForTimeout(2000);
  await p2.evaluate(async () => {
    const { NATURE_PRESETS } = await import('./src/data/natureSounds.js');
    window.temple.store.setSetting('natureSleep', 30);
    window.temple.listen(NATURE_PRESETS.find((p) => p.id === 'valley'));
  });
  await p2.waitForTimeout(6000); // 장면 조각을 받고
  const H = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const st = () => p2.evaluate(() => {
    const e = window.temple.sound;
    const bed = (e._nbeds || []).find((b) => b.name === 'stream');
    return { state: e.ctx.state, anchor: e._anchor && !e._anchor.paused, left: e.sleepLeft, next: bed?.next ?? -1, t: e.ctx.currentTime, buf: bed?.buffer?.duration ?? 0 };
  });
  // 이음새가 곧 오게: 지금 조각의 끝을 8초 뒤로 당긴다 (다음 조각은 숨긴 동안 받아야 한다)
  await p2.evaluate(() => {
    const e = window.temple.sound;
    const bed = e._nbeds.find((b) => b.name === 'stream');
    bed.next = e.ctx.currentTime + 8;
    bed.nextBuf = null;
  });
  await p2.evaluate(H, true);
  const a = await st();
  await p2.waitForTimeout(15000);
  const b = await st();
  check('(e) 숨김: 닻이 돈다·컨텍스트 running', b.anchor && b.state === 'running', JSON.stringify(b));
  check('(e) 숨김: 잠자기 타이머가 재생 시간으로 줄어든다', a.left - b.left > 12 && a.left - b.left < 18, `${a.left?.toFixed(1)} → ${b.left?.toFixed(1)}`);
  check('(e) 숨김: 계곡 배경이 이음새를 넘어 다음 조각으로', b.next > a.next + 20, `next ${a.next.toFixed(1)} → ${b.next.toFixed(1)} (t ${b.t.toFixed(1)})`);
  check('(e) 페이지 오류 없음', err2.length === 0, err2.join(' | '));
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
