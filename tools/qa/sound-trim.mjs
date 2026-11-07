// 메뉴 > 소리 「들리는 소리 하나씩」 · 비 오는 날 휴식 캐노피 검사 — node tools/qa/sound-trim.mjs   (먼저 python3 .claude/devserver.py 8081, BASE=)
//  · 소리 창: 지금 들리는 소리마다 막대(48 이상) · 막대 → 엔진 크기 · 저장(다시 들어와도 그대로) · 「모두 그대로」 · 장면을 듣는 동안은 쓰지 않음
//  · 화로 곁에서 화롯불을 끝(1.3배)으로 올려도 리미터 누름 평균 > -1dB · 최대 > -3dB (headroom.mjs 기준)
//  · 캐노피: 돗자리에 앉아 있는데 비가 오면 친다 · 날씨가 바뀌면 치고 걷는다 · 일어서면 걷는다 · 기둥은 땅에 · 비 오는 장면을 들어도
//  SHOTS=<폴더> 면 소리 창(다섯 뷰포트)·캐노피 스크린숏
import { launch, enter } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const openSound = async (p) => {
  await p.click('#menu-btn');
  await p.waitForTimeout(250);
  await p.click('#sound-tool');
  await p.waitForTimeout(450);
};
const targets = (p) => p.evaluate(() => Object.fromEntries(Object.entries(window.temple.sound.L).filter(([, l]) => l.level).map(([k, l]) => [k, l.level.gain._target ?? 0])));

// ── 소리 창: 다섯 뷰포트 배치
for (const vp of [[360, 780], [390, 844], [430, 932], [844, 390], [1280, 800]]) {
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(3500);
  await openSound(page);
  await page.evaluate(() => (document.querySelector('#pop-sound').scrollTop = document.querySelector('#sound-trim').offsetTop - 60));
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#sound-trim .trim-row')].map((r) => r.querySelector('.trim-name').firstChild.textContent);
    const small = [...document.querySelectorAll('#sound-trim input, #sound-trim button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 47.5 || r.height < 47.5); }).map((el) => el.dataset.trim || el.textContent);
    return { rows, small, heard: window.temple.sound.heard() };
  });
  check(`${vp.join('x')} 소리 창: 들리는 소리 ${s.rows.length}가지 · 막대 48 이상`, s.rows.length > 0 && !s.small.length, `${s.rows.join(',')} ${s.small.join(',')}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trim-${vp.join('x')}.png` });
  check(`${vp.join('x')} 페이지 오류 없음`, !errors.length, errors.join(' | '));
  await ctx.close();
}

// ── 동작
{
  const { ctx, page, errors } = await enter(browser, [390, 844]);
  await page.waitForTimeout(4000);
  await openSound(page);
  const k = await page.evaluate(() => document.querySelector('#sound-trim [data-trim]')?.dataset.trim);
  const before = await targets(page);
  await page.evaluate((key) => { const i = document.querySelector(`#sound-trim [data-trim="${key}"]`); i.value = '0.4'; i.dispatchEvent(new Event('input', { bubbles: true })); }, k);
  await page.waitForTimeout(300);
  let s = await page.evaluate((key) => ({ saved: window.temple.store.state.settings.soundTrim?.[key], eng: window.temple.sound.trim[key], pct: document.querySelector(`[data-trim="${key}"]`).getAttribute('aria-valuetext'), ring: document.querySelector(`[data-trim="${key}"]`).closest('.trim-row').classList.contains('changed') }), k);
  const after = await targets(page);
  const ratio = after[k] / before[k];
  check(`막대 → 엔진·저장 (${k} 0.32배)`, s.saved === 0.32 && s.eng === 0.32 && s.pct === '32%' && s.ring && Math.abs(ratio - 0.32) < 0.02, `${JSON.stringify(s)} 크기 ${before[k]?.toFixed(4)}→${after[k]?.toFixed(4)}`);
  // 다시 들어와도 그대로
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(3500);
  s = await page.evaluate((key) => ({ eng: window.temple.sound.trim[key] }), k);
  check('다시 들어와도 조정 그대로', s.eng === 0.32, JSON.stringify(s));
  // 장면을 듣는 동안은 쓰지 않는다
  s = await page.evaluate(async () => {
    const t = window.temple, e = t.sound, { NATURE_PRESETS } = await import('./src/data/natureSounds.js');
    e.setTrim({ stream: 0.2, birds: 0.2 });
    t.listen(NATURE_PRESETS.find((p) => p.id === 'valley'));
    await new Promise((r) => setTimeout(r, 2500));
    const a = e.L.stream.level.gain._target;
    e.setTrim({});
    await new Promise((r) => setTimeout(r, 300));
    const b = e.L.stream.level.gain._target;
    t.exitListening();
    await new Promise((r) => setTimeout(r, 1500));
    e.setTrim(t.store.state.settings.soundTrim);
    return { a, b };
  });
  check('장면(계곡 물가)을 듣는 동안은 미세 조정을 쓰지 않음', Math.abs(s.a - s.b) < 1e-6, JSON.stringify(s));
  // 모두 그대로
  await openSound(page);
  await page.click('[data-trim-reset]');
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ saved: window.temple.store.state.settings.soundTrim, eng: window.temple.sound.trim }));
  check('「모두 그대로」', !Object.keys(s.saved || {}).length && !Object.keys(s.eng).length, JSON.stringify(s));
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
  await ctx.close();
}

// ── 화로 곁 헤드룸: 화롯불 끝(1.3배)
{
  const { ctx, page } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const t = window.temple, e = t.sound, { TRIM_TOP } = await import('./src/ui/soundTrim.js');
    t.avatars.teleport(-10.5, -6, 0);
    t._onZoneChange(true);
    e.setTrim({ brazier: 1.3 });
    await new Promise((res) => setTimeout(res, 12000));
    const red = [];
    for (let i = 0; i < 150; i++) {
      red.push(e._lim.reduction);
      await new Promise((res) => setTimeout(res, 100));
    }
    return { top: TRIM_TOP, avg: +(red.reduce((a, b) => a + b, 0) / red.length).toFixed(2), max: +Math.min(...red).toFixed(2), brazier: +e.L.brazier.level.gain._target.toFixed(3) };
  });
  check(`화로 곁 화롯불 1.3배 — 리미터 누름 평균 ${r.avg}dB · 최대 ${r.max}dB (기준 > -1 · > -3)`, r.avg > -1 && r.max > -3 && r.brazier > 0, JSON.stringify(r));
  await ctx.close();
}

// ── 캐노피
for (const vp of [[390, 844], [1280, 800]]) {
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(1500);
  const st = () => page.evaluate(() => ({ shown: window.temple.shelter.shown, vis: window.temple.shelter.group.visible, seat: window.temple.player.seat?.kind, toast: [...document.querySelectorAll('#toast-stack *')].map((e) => e.textContent).join(' ') }));
  const weather = (w) => page.evaluate((x) => document.querySelector(`[data-weather="${x}"]`).click(), w);
  // 산책로 290m 자리로 옮겨 돗자리를 편다 (걸어서 비킨 자리는 기울어 펴지 못할 수 있다)
  const restAt = () => page.evaluate(async () => {
    const t = window.temple, { trail } = await import('./src/world/trail.js');
    const a = trail.at(290), b = trail.at(290.5);
    t.avatars.teleport(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z));
    t._onZoneChange(true);
    await new Promise((r) => setTimeout(r, 500));
    t.gesture('rest');
  });
  // 맑은 날 돗자리 → 캐노피 없음
  await weather('clear');
  await restAt();
  await page.waitForTimeout(800);
  let s = await st();
  check(`${vp.join('x')} 맑은 날 돗자리: 캐노피 없음`, s.seat === 'rest' && !s.vis, JSON.stringify(s));
  await weather('rain');
  await page.waitForTimeout(600);
  s = await st();
  check(`${vp.join('x')} 앉은 채 날씨가 비로 → 캐노피를 침`, s.vis && /캐노피/.test(s.toast), JSON.stringify(s));
  // 기둥은 땅에 박히고 천은 앉은 머리 위
  const g = await page.evaluate(async () => {
    const t = window.temple, Lm = await import('./src/world/layout.js'), G = t.shelter.group;
    G.updateMatrixWorld(true);
    const V = G.position.constructor;
    const poles = G.children.filter((m) => m.geometry?.type === 'CylinderGeometry').map((m) => { const w = m.localToWorld(new V(0, 0, 0)); return +(w.y - Lm.walkHeight(w.x, w.z)).toFixed(3); });
    const tarp = G.children[0];
    const P = tarp.geometry.attributes.position;
    let low = Infinity;
    for (let i = 0; i < P.count; i++) {
      const w = tarp.localToWorld(new V().fromBufferAttribute(P, i));
      low = Math.min(low, w.y - Lm.walkHeight(w.x, w.z));
    }
    return { poles, low: +low.toFixed(2) };
  });
  check(`${vp.join('x')} 기둥 넷이 땅에 (±1cm) · 천은 땅에서 0.85m 넘게`, g.poles.length === 4 && g.poles.every((d) => Math.abs(d) < 0.01) && g.low > 0.85, JSON.stringify(g));
  if (SHOTS) {
    await page.evaluate(() => { const t = window.temple, c = t.world.cam; c.mode = 'third'; c.yaw = t.player.heading + Math.PI * 0.75; c.pitch = 0.18; c.targetDist = 3.4; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/canopy-${vp.join('x')}.png` });
  }
  await weather('clear');
  await page.waitForTimeout(600);
  s = await st();
  check(`${vp.join('x')} 비가 그치면 걷음`, !s.vis && s.seat === 'rest', JSON.stringify(s));
  await weather('rain');
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  s = await st();
  check(`${vp.join('x')} 일어서면 걷음`, !s.vis && s.seat !== 'rest', JSON.stringify(s));
  // 비 오는 날 돗자리를 펴면 바로
  await restAt();
  await page.waitForTimeout(600);
  s = await st();
  check(`${vp.join('x')} 비 오는 날 돗자리를 펴면 바로 캐노피`, s.vis && s.seat === 'rest', JSON.stringify(s));
  // 맑은 날 돗자리에서 「산사의 비」를 들으면 (장면이 비) — 안에서 본 모습
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await weather('clear');
  await page.waitForTimeout(400);
  await restAt();
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const t = window.temple, { NATURE_PRESETS } = await import('./src/data/natureSounds.js');
    t.listen(NATURE_PRESETS.find((p) => p.id === 'rain'));
  });
  await page.waitForTimeout(2600);
  s = await st();
  check(`${vp.join('x')} 돗자리에서 「산사의 비」 장면 → 캐노피`, s.vis, JSON.stringify(s));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/canopy-inside-${vp.join('x')}.png` });
  await page.evaluate(() => window.temple.exitListening());
  await page.waitForTimeout(1800);
  s = await st();
  check(`${vp.join('x')} 일어나면(장면 끝, 맑음으로) 걷음`, !s.vis, JSON.stringify(s));
  check(`${vp.join('x')} 페이지 오류 없음`, !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
