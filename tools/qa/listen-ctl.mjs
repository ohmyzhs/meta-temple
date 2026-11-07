// 듣기 재생기 하나로 (예불 듣기 · 자연의 소리 듣기) 검사 — node tools/qa/listen-ctl.mjs   (먼저 python3 .claude/devserver.py 8081, BASE=)
//  · 여섯 뷰포트: 두 모드 모두 같은 단추(접기·목록·일어나기·듣기 방식·이전·재생·다음·타이머·소리), 48×48 이상·겹침 없음·화면 안
//    소리 판을 연 상태도 같은 검사. SHOTS=<폴더> 면 뷰포트마다 스크린숏
//  · 목록 다시 열기: 앉은 채(명상 자세) 창이 뜨고 재생기는 비켜 선다 · Esc 는 창만 닫는다 · 다른 예불로 바꾸면 창이 닫히고 계속 듣는다
//  · 소리 판 슬라이더 = 소리 창(#vol-*) 같은 값·엔진·저장
//  · 듣기 방식 한 곡 → 연속 → 반복 (저장) · 예불 잠자기 타이머 끝 → 일어남
//  · 화면 꺼짐(숨김): 예불 반복은 같은 곡을 처음부터, 자연의 소리 연속은 다음 장면, 한 곡은 일어남
import { launch, enter, VIEWPORTS } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const WANT = ['fold', 'list', 'exit', 'mode', 'prev', 'play', 'next', 'sleep', 'vol'];
const layout = (p) => p.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const els = [...document.querySelectorAll('#listen .listen-ctl button, #listen-vol input')].filter(vis);
  return els.map((el) => { const r = el.getBoundingClientRect(); return { n: el.dataset.l || 'vol-' + el.dataset.vol, x: r.x, y: r.y, w: r.width, h: r.height }; });
});
const judge = (list, vw, vh) => {
  const small = list.filter((b) => b.w < 47.99 || b.h < 47.99).map((b) => `${b.n} ${Math.round(b.w)}×${Math.round(b.h)}`);
  const out = list.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > vw + 0.5 || b.y + b.h > vh + 0.5).map((b) => b.n);
  const ov = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j];
    if (Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.5 && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0.5) ov.push(`${a.n}∩${c.n}`);
  }
  return { small, out, ov };
};
const listenTo = (p, kind, id) => p.evaluate(async ([k, i]) => {
  const list = k === 'nature' ? (await import('./src/data/natureSounds.js')).NATURE_PRESETS : (await import('./src/data/credits.js')).YEBUL_TRACKS;
  window.temple.listen(i ? list.find((x) => x.id === i) : list[0]);
}, [kind, id]);
const waitListening = (p, on = true) => p.waitForFunction((v) => document.body.classList.contains('listening') === v, on, { timeout: 6000 }).catch(() => {});
const wake = async (p, vp) => {
  await p.mouse.move(vp[0] / 2, vp[1] / 3);
  await p.mouse.move(vp[0] / 2 + 3, vp[1] / 3 + 3);
  await p.waitForTimeout(400);
};
const H = (hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
};

// ── 배치: 여섯 뷰포트 × 두 모드
for (const vp of VIEWPORTS) {
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(500);
  for (const kind of ['yebul', 'nature']) {
    await listenTo(page, kind);
    await waitListening(page);
    await page.waitForTimeout(1600); // 가림막이 걷히도록
    await wake(page, vp);
    let l = await layout(page);
    const names = l.map((b) => b.n);
    const miss = WANT.filter((n) => !names.includes(n));
    let j = judge(l, ...vp);
    check(`${vp.join('x')} ${kind}: 단추 아홉 개 다 있음`, !miss.length, miss.join(','));
    check(`${vp.join('x')} ${kind}: 48 이상·겹침 없음·화면 안`, !j.small.length && !j.ov.length && !j.out.length, [...j.small, ...j.ov, ...j.out.map((n) => n + ' 밖')].join(', '));
    const ctl = await page.evaluate(() => { const r = document.querySelector('#listen .listen-ctl').getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top) }; });
    console.log(`   재생기 ${ctl.w}×${ctl.h} (위 ${ctl.top})`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${kind}-${vp.join('x')}.png` });
    await page.click('#listen [data-l="vol"]');
    await page.waitForTimeout(250);
    if (kind === 'nature') {
      // 자연의 소리는 소리 단추가 「조절」 — 나만의 소리 창 (tools/qa/mixer.mjs 가 자세히 본다)
      check(`${vp.join('x')} nature: 「조절」 → 나만의 소리 창`, await page.evaluate(() => window.temple.modals.current === 'mixer'));
      await page.evaluate(() => window.temple.modals.close());
    } else {
      l = await layout(page);
      j = judge(l, ...vp);
      check(`${vp.join('x')} ${kind}: 소리 판 열림 — 슬라이더 둘·48 이상·겹침 없음·화면 안`, l.filter((b) => b.n.startsWith('vol-')).length === 2 && !j.small.length && !j.ov.length && !j.out.length, [...j.small, ...j.ov, ...j.out].join(', '));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/vol-${vp.join('x')}.png` });
      await page.click('#listen [data-l="vol"]');
    }
    await page.evaluate(() => window.temple.exitListening());
    await waitListening(page, false);
    await page.waitForTimeout(500);
  }
  check(`${vp.join('x')} 페이지 오류 없음`, !errors.length, errors.join(' | '));
  await ctx.close();
}

// ── 동작: 폰 하나 · 데스크톱 하나
for (const vp of [[390, 844], [1280, 800]]) {
  console.log(`— ${vp.join('x')} 동작`);
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(500);
  await listenTo(page, 'yebul', 'baekyang');
  await waitListening(page);
  await page.waitForTimeout(1600);
  await wake(page, vp);
  // 목록 다시 열기
  await page.click('#listen [data-l="list"]');
  await page.waitForTimeout(500);
  let s = await page.evaluate(() => ({ modal: window.temple.modals.current, away: document.querySelector('#listen').classList.contains('l-away'), cur: document.querySelector('.yebul-item[aria-current="true"]')?.dataset.id, listening: !!window.temple._listening, st: window.temple.player.state, hint: [...document.querySelectorAll('#modal-body .m-hint')].some((e) => e.offsetParent) }));
  check('목록 다시 열기: 창이 뜨고 재생기는 비켜 섬 · 지금 곡 표시 · 앉은 채', s.modal === 'yebul' && s.away && s.cur === 'baekyang' && s.listening && s.st === 'meditate' && !s.hint, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-${vp.join('x')}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  s = await page.evaluate(() => ({ modal: window.temple.modals.isOpen, away: document.querySelector('#listen').classList.contains('l-away'), listening: !!window.temple._listening, st: window.temple.player.state, vig: window.temple.player.restState }));
  check('Esc → 창만 닫히고 계속 듣기 (명상 자세 그대로)', !s.modal && !s.away && s.listening && s.st === 'meditate', JSON.stringify(s));
  await wake(page, vp);
  await page.click('#listen [data-l="list"]');
  await page.waitForTimeout(400);
  await page.click('.yebul-item[data-id="muwi"]');
  await page.waitForTimeout(1500);
  s = await page.evaluate(() => ({ modal: window.temple.modals.isOpen, track: window.temple._listening?.track.id, src: window.temple.sound.currentTrack?.url, name: document.querySelector('#listen-name').textContent }));
  check('목록에서 다른 예불 → 창 닫히고 그 예불을 앉은 채 듣기', !s.modal && s.track === 'muwi' && /muwi/.test(s.src) && s.name === '무위사 사시예불', JSON.stringify(s));
  // 소리 판
  await wake(page, vp);
  await page.click('#listen [data-l="vol"]');
  await page.evaluate(() => { const i = document.querySelector('#listen-vol [data-vol="nature"]'); i.value = '0.3'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  s = await page.evaluate(() => ({ saved: window.temple.store.state.settings.volumes.nature, sheet: document.querySelector('#vol-nature').value, eng: window.temple.sound.volumes.nature, stored: JSON.parse(Object.entries(localStorage).find(([k, v]) => v.includes('"volumes"'))?.[1] || '{}')?.settings?.volumes?.nature }));
  check('소리 판 자연음 0.3 → 소리 창·엔진·저장 같은 값', s.saved === 0.3 && s.sheet === '0.3' && s.eng === 0.3 && s.stored === 0.3, JSON.stringify(s));
  await page.evaluate(() => { const i = document.querySelector('#vol-temple'); i.value = '0.4'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  s = await page.evaluate(() => document.querySelector('#listen-vol [data-vol="temple"]').value);
  check('소리 창 사찰음 0.4 → 재생기 슬라이더도 0.4', s === '0.4', s);
  await page.mouse.click(vp[0] / 2, vp[1] / 4);
  await page.waitForTimeout(200);
  check('소리 판 밖을 누르면 닫힘', await page.evaluate(() => document.querySelector('#listen-vol').hidden));
  // 듣기 방식
  await wake(page, vp);
  const modes = [];
  for (let i = 0; i < 3; i++) {
    await page.click('#listen [data-l="mode"]');
    modes.push(await page.evaluate(() => [window.temple._listening.mode, window.temple.store.state.settings.yebulMode, document.querySelector('#listen [data-l="mode"] span').textContent].join('/')));
  }
  check('듣기 방식 단추: 세 가지가 돌고 저장된다', new Set(modes.map((m) => m.split('/')[0])).size === 3 && modes.every((m) => { const [a, b] = m.split('/'); return a === b; }), modes.join(' → '));
  // 예불 반복 — 화면 꺼진 채 끝까지
  await page.evaluate(() => { const t = window.temple; t._listening.mode = 'repeat'; });
  await page.evaluate(H, true);
  await page.evaluate(() => { const el = window.temple.sound.currentTrack.el; el.currentTime = el.duration - 1.2; });
  await page.waitForTimeout(3500);
  s = await page.evaluate(() => ({ track: window.temple._listening?.track.id, t: window.temple.sound.currentTrack?.el.currentTime, playing: !!window.temple.sound.currentTrack && !window.temple.sound.currentTrack.el.paused }));
  check('화면 꺼짐 + 반복: 같은 예불을 처음부터', s.track === 'muwi' && s.playing && s.t < 5, JSON.stringify(s));
  await page.evaluate(H, false);
  // 예불 잠자기 타이머
  await wake(page, vp);
  await page.click('#listen [data-l="sleep"]');
  s = await page.evaluate(() => ({ left: window.temple.sound.sleepLeft, saved: window.temple.store.state.settings.yebulSleep, label: document.querySelector('#listen [data-l="sleep"] span').textContent }));
  check('예불에도 잠자기 타이머 — 15분, 짧은 표기', s.left > 890 && s.left <= 900 && s.saved === 15 && s.label === '15분', JSON.stringify(s));
  await page.evaluate(() => (window.temple.sound._sleep.left = 1.2));
  await page.waitForTimeout(3500);
  s = await page.evaluate(() => ({ listening: !!window.temple._listening, paused: window.temple.sound._userPaused, track: !!window.temple.sound.currentTrack }));
  check('예불 타이머 끝 → 소리 멈추고 일어남', !s.listening && s.paused && !s.track, JSON.stringify(s));
  await page.evaluate(() => { window.temple.sound.resumeAll(); window.temple.store.setSetting('yebulSleep', 0); });
  await page.waitForTimeout(1500);
  // 자연의 소리: 연속 — 화면 꺼진 채 장면 한 편이 끝나면 다음 장면
  await page.evaluate(() => window.temple.store.setSetting('natureMode', 'all'));
  await listenTo(page, 'nature', 'valley');
  await waitListening(page);
  await page.waitForTimeout(1600);
  s = await page.evaluate(() => ({ mode: window.temple._listening.mode, scene: window.temple.sound.sceneLeft, seek: document.querySelector('#listen-seek').disabled, time: document.querySelector('#listen-time').textContent }));
  check('자연의 소리: 장면 한 편 10분 · 위치 막대는 보기만', s.mode === 'all' && s.scene > 590 && s.scene <= 600 && s.seek && /\/ 10:00$/.test(s.time), JSON.stringify(s));
  await page.evaluate(H, true);
  await page.evaluate(() => (window.temple.sound._scene.left = 1));
  await page.waitForTimeout(3000);
  s = await page.evaluate(() => ({ preset: window.temple.sound.preset?.id, track: window.temple._listening?.track.id, scene: window.temple.sound.sceneLeft }));
  check('화면 꺼짐 + 연속: 다음 장면으로', s.preset === 'rain' && s.track === 'rain' && s.scene > 590, JSON.stringify(s));
  // 반복: 같은 장면, 시계만 처음으로
  await page.evaluate(() => { window.temple._listening.mode = 'repeat'; window.temple.sound._scene.left = 1; });
  await page.waitForTimeout(3000);
  s = await page.evaluate(() => ({ preset: window.temple.sound.preset?.id, scene: window.temple.sound.sceneLeft }));
  check('화면 꺼짐 + 반복: 같은 장면 그대로', s.preset === 'rain' && s.scene > 590, JSON.stringify(s));
  // 한 곡: 일어남
  await page.evaluate(() => { window.temple._listening.mode = 'one'; window.temple.sound._scene.left = 1; });
  await page.waitForTimeout(3500);
  s = await page.evaluate(() => ({ listening: !!window.temple._listening, preset: window.temple.sound.preset, scene: window.temple.sound.sceneLeft }));
  check('화면 꺼짐 + 한 곡: 장면 한 편 뒤 일어남', !s.listening && s.preset === null && s.scene === null, JSON.stringify(s));
  await page.evaluate(H, false);
  // 자연의 소리 목록 다시 열기 → 다른 장면
  await page.evaluate(() => window.temple.store.setSetting('natureMode', 'repeat'));
  await listenTo(page, 'nature', 'valley');
  await waitListening(page);
  await page.waitForTimeout(1600);
  await wake(page, vp);
  await page.click('#listen [data-l="list"]');
  await page.waitForTimeout(400);
  s = await page.evaluate(() => ({ modal: window.temple.modals.current, chips: !!document.querySelector('.nature-sleep')?.offsetParent }));
  check('자연의 소리: 목록 다시 열림 (타이머 칩은 재생기에 있으니 숨김)', s.modal === 'nature' && !s.chips, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/list-nature-${vp.join('x')}.png` });
  await page.click('.yebul-item[data-id="dawn"]');
  await page.waitForTimeout(1500);
  s = await page.evaluate(() => ({ modal: window.temple.modals.isOpen, preset: window.temple.sound.preset?.id, listening: !!window.temple._listening, st: window.temple.player.state }));
  check('자연의 소리: 목록에서 다른 장면 → 앉은 채 바뀜', !s.modal && s.preset === 'dawn' && s.listening && s.st === 'meditate', JSON.stringify(s));
  await page.evaluate(() => window.temple.exitListening());
  await waitListening(page, false);
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
