// 「자연의 소리 듣기」 검사 — node tools/qa/nature-listen.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 기준:
//   (a) 소리 창 「자연의 소리 듣기」 → 장면 목록 → 고르면 앉아 듣기 화면(.listen.nature), 엔진 preset 이 그 장면
//   (b) 잠자기 타이머는 재생 시간으로 줄어든다(AudioContext 시계) · 다음 단추는 다음 장면 · 일어나면 preset·타이머가 풀린다
//   (c) 타이머가 다 되면 소리가 멈추고(pauseAll) 듣기가 끝난다
//   (d) 장면마다 그 장면의 레이어가 들린다(목표 크기 > 0)·다른 것은 꺼진다
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
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
