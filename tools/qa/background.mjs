// 「화면 꺼져도 계속 듣기」 검사 — node tools/qa/background.mjs   (먼저 python3 .claude/devserver.py 8081, 다른 서버는 BASE=)
// 헤드리스에서는 탭을 정말 숨길 수 없으므로 document.hidden 을 바꿔 visibilitychange 를 보낸다 (앱 코드가 보는 신호 그대로).
// 크롬이 오디오 포커스를 빼앗는 것(전화·유튜브)은 안드로이드 '닻' <audio> 를 바깥에서 멈추는 것으로 흉내 낸다.
// 기준:
//   (a) 안드로이드: 입장하면 닻이 돈다 · 숨겨도 AudioContext 가 running, 예약이 계속된다(배경 녹음 다음 이음새가 앞으로 간다)
//   (b) 닻이 바깥에서 멈추면 양보(마스터 → 0) · 다시 틀면 이어짐(마스터가 올라옴)
//   (c) 잠금화면 멈춤(pauseAll) → 닻 멈춤·컨텍스트 잠듦 · 이어 듣기(resumeAll) → running
//   (d) 예불 연속 듣기: 숨긴 채로 곡이 끝나면 다음 예불이 이어서 재생된다
//   (e) 옵션을 끄면 닻이 멈추고, 숨기면 컨텍스트가 잠든다 · 다시 켜면 닻이 돈다
//   (f) 데스크톱: 닻을 쓰지 않는다 · 숨겨도 계속 (옵션 켬)
import { launch, BASE } from './lib.mjs';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const HIDE = (hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
};
const open = async (ua, touch) => {
  const ctx = await browser.newContext({ viewport: touch ? { width: 412, height: 915 } : { width: 1280, height: 800 }, userAgent: ua, hasTouch: touch, isMobile: touch, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
};
const S = (page) =>
  page.evaluate(() => {
    const s = window.temple.sound;
    return {
      state: s.ctx?.state,
      anchor: s._anchor ? (s._anchor.paused ? 'paused' : 'playing') : 'none',
      master: +(s.master?.gain.value ?? -1).toFixed(3),
      interrupted: s._interrupted,
      userPaused: s._userPaused,
      bg: s.background,
      bedNext: +((s._nbeds || []).find((b) => b.on)?.next ?? -1).toFixed(2), // 돌고 있는 자연의 소리 배경의 다음 이음새
      t: +(s.ctx?.currentTime ?? 0).toFixed(2)
    };
  });

try {
  // ── 안드로이드
  const { ctx, page, errors } = await open(ANDROID_UA, true);
  await page.waitForTimeout(4000); // 녹음이 붙도록
  let s = await S(page);
  check('(a) 입장하면 닻이 돈다 (옵션 기본 켬)', s.anchor === 'playing' && s.bg, JSON.stringify(s));
  const btn = await page.evaluate(() => document.querySelector('#bg-audio-btn').getAttribute('aria-checked'));
  check('(a) 소리 창 「음악 연속재생 모드」 스위치는 켜짐', btn === 'true', btn);
  await page.evaluate(HIDE, true);
  const before = await S(page);
  await page.waitForTimeout(6000);
  s = await S(page);
  check('(a) 숨겨도 AudioContext running · 시간이 흐른다', s.state === 'running' && s.t - before.t > 4, `${before.t} → ${s.t}`);
  check('(a) 숨긴 동안에도 예약이 돈다 (배경 녹음 이음새 예약이 현재 뒤로 앞서 있음)', s.bedNext === -1 || s.bedNext > s.t, `bedNext ${s.bedNext} t ${s.t}`);

  // (b) 크롬이 포커스를 가져감 → 닻 멈춤 (우리 동작 표시가 사라진 뒤)
  await page.waitForTimeout(800);
  await page.evaluate(() => window.temple.sound._anchor.pause());
  await page.waitForTimeout(800);
  s = await S(page);
  check('(b) 닻이 바깥에서 멈추면 양보 (마스터 0)', s.interrupted && s.master < 0.05, JSON.stringify(s));
  await page.evaluate(() => window.temple.sound._anchor.play());
  await page.waitForTimeout(1500);
  s = await S(page);
  check('(b) 다시 틀어지면 이어진다 (마스터 올라옴)', !s.interrupted && s.master > 0.3 && s.anchor === 'playing', JSON.stringify(s));

  // (c) 잠금화면 멈춤 · 이어 듣기
  await page.evaluate(() => window.temple.sound.pauseAll());
  await page.waitForTimeout(1200);
  s = await S(page);
  check('(c) 잠금화면 멈춤 → 닻 멈춤 · 컨텍스트 잠듦 · 양보로 오인하지 않음', s.userPaused && s.anchor === 'paused' && s.state === 'suspended' && !s.interrupted, JSON.stringify(s));
  await page.evaluate(() => window.temple.sound.resumeAll());
  await page.waitForTimeout(1500);
  s = await S(page);
  check('(c) 이어 듣기 → running · 닻 다시', !s.userPaused && s.state === 'running' && s.anchor === 'playing' && s.master > 0.3, JSON.stringify(s));

  // (d) 예불 연속 듣기: 숨긴 채 곡이 끝나면 다음 곡
  await page.evaluate(HIDE, false);
  const d0 = await page.evaluate(async () => {
    const t = window.temple;
    const { YEBUL_TRACKS } = await import('/src/data/credits.js');
    t.store.setSetting('listenLoop', true);
    t.travelTo('DAEUNGJEON');
    t.listen(YEBUL_TRACKS[0]);
    return YEBUL_TRACKS.map((x) => x.file);
  });
  await page.waitForTimeout(3000);
  await page.evaluate(HIDE, true);
  const first = await page.evaluate(() => ({ track: window.temple._listening?.track?.file, src: window.temple.sound.currentTrack?.url }));
  await page.evaluate(() => {
    const el = window.temple.sound.currentTrack.el;
    el.currentTime = Math.max(0, el.duration - 0.6);
  });
  await page.waitForFunction((f) => window.temple._listening?.track?.file !== f, first.track, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const next = await page.evaluate(() => {
    const t = window.temple, tr = t.sound.currentTrack;
    return { track: t._listening?.track?.file, src: tr?.url, playing: !!tr && !tr.el.paused, time: tr ? +tr.el.currentTime.toFixed(2) : null };
  });
  check('(d) 숨긴 채 예불이 끝나면 다음 예불이 이어 재생', next.track && next.track !== first.track && next.playing && next.time > 0, `${first.track} → ${next.track} ${JSON.stringify(next)} (곡들 ${d0.join(', ')})`);
  // 예불 중 전화 → 크롬이 같은 페이지의 미디어(예불·닻)를 함께 멈춤 → 양보, 끝나면 크롬이 다시 틀면 예불도 다시
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.temple.sound.currentTrack.el.pause();
    window.temple.sound._anchor.pause();
  });
  await page.waitForTimeout(600);
  s = await S(page);
  check('(d) 예불이 바깥에서 멈추면 양보', s.interrupted && s.master < 0.05, JSON.stringify(s));
  await page.evaluate(() => window.temple.sound._anchor.play());
  await page.waitForTimeout(1200);
  const resumed = await page.evaluate(() => ({ playing: !window.temple.sound.currentTrack?.el.paused, interrupted: window.temple.sound._interrupted }));
  check('(d) 양보가 끝나면 예불도 이어서', resumed.playing && !resumed.interrupted, JSON.stringify(resumed));
  // 내가 누른 멈춤은 양보가 아니다
  await page.evaluate(() => window.temple._listenToggle());
  await page.waitForTimeout(600);
  s = await S(page);
  check('(d) 듣기 화면의 멈춤 단추는 양보로 오인하지 않음 (자연음은 그대로)', !s.interrupted && s.master > 0.3, JSON.stringify(s));
  await page.evaluate(() => window.temple._listenToggle());
  await page.evaluate(HIDE, false);
  await page.evaluate(() => window.temple.exitListening());
  await page.waitForTimeout(2500);

  // (e) 옵션 끄기
  await page.evaluate(() => {
    document.querySelector('#menu-btn').click();
  });
  await page.click('#bg-audio-btn', { force: true }).catch(async () => page.evaluate(() => document.querySelector('#bg-audio-btn').click()));
  await page.waitForTimeout(500);
  s = await S(page);
  const off = await page.evaluate(() => ({ setting: window.temple.store.state.settings.bgAudio, text: document.querySelector('#bg-audio-btn').getAttribute('aria-checked') }));
  check('(e) 옵션을 끄면 저장·스위치 꺼짐·닻 멈춤', off.setting === false && off.text === 'false' && s.anchor === 'paused', `${JSON.stringify(off)} ${JSON.stringify(s)}`);
  await page.evaluate(HIDE, true);
  await page.waitForTimeout(800);
  s = await S(page);
  check('(e) 옵션을 끄면 숨길 때 컨텍스트가 잠든다', s.state === 'suspended', JSON.stringify(s));
  await page.evaluate(HIDE, false);
  await page.evaluate(() => document.querySelector('#bg-audio-btn').click());
  await page.waitForTimeout(800);
  s = await S(page);
  check('(e) 다시 켜면 닻이 돈다', s.anchor === 'playing' && s.state === 'running', JSON.stringify(s));
  check('(안드로이드) 페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();

  // ── 데스크톱
  {
    const { ctx, page, errors } = await open(undefined, false);
    await page.evaluate(HIDE, true);
    await page.waitForTimeout(1500);
    const s = await S(page);
    check('(f) 데스크톱: 닻 없음 · 숨겨도 계속', s.anchor === 'none' && s.state === 'running', JSON.stringify(s));
    check('(데스크톱) 페이지 오류 없음', !errors.length, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('진행 중 멈춤', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
}
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
