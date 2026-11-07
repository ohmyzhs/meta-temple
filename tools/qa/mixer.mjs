// 나만의 소리(자연의 소리 「조절」)·내 소리·휴식(돗자리) 검사 — node tools/qa/mixer.mjs   (먼저 python3 .claude/devserver.py 8081, BASE=)
//  · 여섯 뷰포트: 조절 창의 단추·막대 48 이상·겹침 없음, 「담기」가 화면 안. SHOTS=<폴더> 면 조절 창·내 소리 탭·휴식 스크린숏
//  · 조절 창을 처음 열어도 소리가 바뀌지 않는다 (장면 → 나만의 소리로 구울 때 레이어 크기 ±1%)
//  · 막대·더하기·빼기가 엔진에 곧바로 · 철이 아닌 소리도 난다 · 담기(이름에 띄어쓰기 — 멈추거나 일어나지 않음) → 내 소리 탭 → 다시 듣기 → 두 번 눌러 지우기
//  · 「이 자리 소리」: 지금 자리에서 들리는 크기와 ±1dB (방향·법당 먹먹함은 따라가지 않음)
//  · 테마 ASMR 은 조절 없이 크기만 · 장면 ↔ 테마 ASMR 을 앉은 채로 바꾸기
//  · 휴식: 선 자리에 돗자리(땅을 따라 기울임)를 펴고 앉고, 「예불 듣기」·「자연의 소리 듣기」가 뜬다 · 물 위는 안 됨 · 법당은 좌복
//  · 모든 소리를 막대 끝(MIX_MAX)으로 올려도 리미터 누름 평균 < 1dB · 최대 < 3dB (headroom.mjs 기준)
import { launch, enter, VIEWPORTS } from './lib.mjs';

const SHOTS = process.env.SHOTS;
const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
const scene = (p, id) => p.evaluate(async (i) => { const { NATURE_PRESETS } = await import('./src/data/natureSounds.js'); window.temple.listen(NATURE_PRESETS.find((x) => x.id === i)); }, id);
const waitListening = (p, on = true) => p.waitForFunction((v) => document.body.classList.contains('listening') === v, on, { timeout: 6000 }).catch(() => {});
const wake = async (p, vp) => {
  await p.mouse.move(vp[0] / 2, vp[1] / 3);
  await p.mouse.move(vp[0] / 2 + 3, vp[1] / 3 + 3);
  await p.waitForTimeout(350);
};
const targets = (p) => p.evaluate(() => { const e = window.temple.sound, o = {}; for (const [k, l] of Object.entries(e.L)) if (l.level) o[k] = l.level.gain._target ?? l.level.gain.value; return o; });
const sizes = (p) => p.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const els = [...document.querySelectorAll('#modal-body button, #modal-body input, #modal-close-btn, .mx-foot button, .mx-foot input')].filter(vis);
  // 스크롤 영역 밖으로 밀려 잘린 것은 보이는 만큼만 (겹침은 보이는 부분끼리, 크기는 원래 크기로)
  const B = document.querySelector('#modal-body').getBoundingClientRect();
  const list = els.map((el) => {
    const r = el.getBoundingClientRect();
    const inBody = !!el.closest('#modal-body');
    const y0 = inBody ? Math.max(r.top, B.top) : r.top, y1 = inBody ? Math.min(r.bottom, B.bottom) : r.bottom;
    return { n: el.dataset.k || el.dataset.addk || el.dataset.del || el.dataset.vol || el.textContent.trim().slice(0, 8) || el.id || el.type, x: r.x, y: y0, w: r.width, h: y1 - y0, fw: r.width, fh: r.height };
  }).filter((b) => b.h > 0);
  const foot = document.querySelector('[data-foot] button')?.getBoundingClientRect();
  return { list, foot: foot && { top: foot.top, bottom: foot.bottom }, vh: innerHeight };
});
const judge = (list) => {
  const small = list.filter((b) => b.fw < 47.5 || b.fh < 47.5).map((b) => `${b.n} ${Math.round(b.fw)}×${Math.round(b.fh)}`);
  const ov = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j];
    if (Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.5 && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0.5) ov.push(`${a.n}∩${c.n}`);
  }
  return { small, ov };
};

// ── 배치: 여섯 뷰포트
for (const vp of VIEWPORTS) {
  const { ctx, page, errors } = await enter(browser, vp);
  await page.waitForTimeout(500);
  await scene(page, 'valley');
  await waitListening(page);
  await page.waitForTimeout(1600);
  await wake(page, vp);
  await page.click('#listen [data-l="vol"]');
  await page.waitForTimeout(700);
  let s = await sizes(page);
  let j = judge(s.list);
  check(`${vp.join('x')} 조절 창: 48 이상·겹침 없음`, !j.small.length && !j.ov.length, [...j.small, ...j.ov].join(', '));
  check(`${vp.join('x')} 조절 창: 「담기」 단추가 화면 안`, !!s.foot && s.foot.top >= 0 && s.foot.bottom <= s.vh + 0.5, JSON.stringify(s.foot));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mixer-${vp.join('x')}.png` });
  // 담아 두고 내 소리 탭
  await page.evaluate(() => window.temple._mixSave('계곡 내 소리', true));
  await page.evaluate(() => window.temple.modals.close());
  await page.waitForTimeout(300);
  await wake(page, vp);
  await page.click('#listen [data-l="list"]');
  await page.waitForTimeout(600);
  s = await sizes(page);
  j = judge(s.list);
  check(`${vp.join('x')} 내 소리 탭: 48 이상·겹침 없음`, !j.small.length && !j.ov.length, [...j.small, ...j.ov].join(', '));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mine-${vp.join('x')}.png` });
  await page.evaluate(() => { window.temple.exitListening(); window.temple.store.setSetting('myMixes', []); });
  await waitListening(page, false);
  check(`${vp.join('x')} 페이지 오류 없음`, !errors.length, errors.join(' | '));
  await ctx.close();
}

// ── 동작
const vp = [390, 844];
const { ctx, page, errors } = await enter(browser, vp);
await page.waitForTimeout(800);
await scene(page, 'valley');
await waitListening(page);
await page.waitForTimeout(2500);
const before = await targets(page);
await wake(page, vp);
await page.click('#listen [data-l="vol"]');
await page.waitForTimeout(400);
const after = await targets(page);
const drift = Object.keys(before).filter((k) => Math.max(before[k], after[k]) > 0.002 && Math.abs(after[k] - before[k]) / Math.max(before[k], after[k]) > 0.01).map((k) => `${k} ${before[k].toFixed(4)}→${after[k].toFixed(4)}`);
check('조절 창을 열어도 소리 그대로 (장면 → 나만의 소리, ±1%)', !drift.length && (await page.evaluate(() => !!window.temple.sound.preset?.free)), drift.join(', '));
let s = await page.evaluate(() => [...document.querySelectorAll('.mx-row .mx-name')].map((e) => e.textContent).join(','));
check('조절 창: 장면의 소리 셋 (계곡 물·바람·산새)', s === '계곡 물,바람,산새', s);
// 막대: 계곡 물을 x=0.5 → 0.5 배
await page.evaluate(() => { const i = document.querySelector('[data-k="stream"]'); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(200);
s = await page.evaluate(() => ({ k: window.temple._listening.draft.mix.stream, t: window.temple.sound.L.stream.level.gain._target, dirty: window.temple._listening.dirty }));
check('막대 → 엔진 (계곡 물 0.5배)', s.k === 0.5 && s.dirty && Math.abs(s.t / after.stream - 0.5 / 1.6) < 0.02, JSON.stringify(s));
// 철이 아닌 매미(7·8월) 더하기 — 계곡 물가는 6월
await page.click('[data-addk="cicadas"]');
await page.waitForTimeout(9000);
s = await page.evaluate(() => { const e = window.temple.sound; return { t: e.L.cicadas.level.gain._target, bed: !!e._nbeds.find((b) => b.def.layer === 'cicadas' && b.on) }; });
check('철이 아닌 매미도 더하면 난다', s.t > 0.05 && s.bed, JSON.stringify(s));
await page.click('[data-del="birds"]');
await page.waitForTimeout(200);
s = await page.evaluate(() => window.temple.sound.L.birds.level.gain._target);
check('산새 빼기 → 0', s === 0, String(s));
// 담기: 이름에 띄어쓰기 (스페이스가 멈춤으로 새지 않게)
await page.click('[data-saveas]');
await page.waitForTimeout(200);
await page.fill('[data-form] input', '');
await page.type('[data-form] input', '내 계곡 소리');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
s = await page.evaluate(() => { const t = window.temple, m = t.store.state.settings.myMixes || []; return { n: m.length, title: m[0]?.title, mix: m[0]?.mix, listening: !!t._listening, paused: t._listenPaused(), name: document.querySelector('#listen-name').textContent, msg: document.querySelector('[data-msg]')?.textContent }; });
check('담기: 이름 띄어쓰기 · 멈추거나 일어나지 않음 · 재생기 이름도 바뀜', s.n === 1 && s.title === '내 계곡 소리' && s.listening && !s.paused && s.name === '내 계곡 소리' && s.mix.stream === 0.5 && !('birds' in s.mix) && s.mix.cicadas > 0, JSON.stringify(s));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/mixer-saved-390.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
s = await page.evaluate(() => ({ modal: window.temple.modals.isOpen, listening: !!window.temple._listening, away: document.querySelector('#listen').classList.contains('l-away'), st: window.temple.player.state }));
check('Esc → 조절 창만 닫히고 앉은 채 계속', !s.modal && s.listening && !s.away && s.st === 'meditate', JSON.stringify(s));
// 다른 장면 → 내 소리 탭에서 다시 듣기
await page.evaluate(() => window.temple._listenStep(1));
await page.waitForTimeout(1500);
await wake(page, vp);
await page.click('#listen [data-l="list"]');
await page.waitForTimeout(500);
await page.click('[data-tab="mine"]');
const myId = await page.evaluate(() => window.temple.store.state.settings.myMixes[0].id);
await page.click(`[data-pane="mine"] .yebul-item[data-id="${myId}"]`);
await page.waitForTimeout(1500);
s = await page.evaluate(() => { const e = window.temple.sound; return { free: !!e.preset?.free, stream: e.preset?.mix.stream, birds: e.L.birds.level.gain._target, title: window.temple._listening.track.title }; });
check('내 소리 탭에서 다시 듣기 → 담은 그대로', s.free && s.stream === 0.5 && s.birds === 0 && s.title === '내 계곡 소리', JSON.stringify(s));
// 지우기: 두 번
await wake(page, vp);
await page.click('#listen [data-l="list"]');
await page.waitForTimeout(500);
await page.click(`[data-delmine="${myId}"]`);
s = await page.evaluate(() => (window.temple.store.state.settings.myMixes || []).length);
check('지우기 한 번 → 아직 남음', s === 1, String(s));
await page.click(`[data-delmine="${myId}"]`);
s = await page.evaluate(() => (window.temple.store.state.settings.myMixes || []).length);
check('지우기 두 번 → 지워짐', s === 0, String(s));
await page.evaluate(() => window.temple.modals.close());
await page.evaluate(() => window.temple.exitListening());
await waitListening(page, false);
await page.waitForTimeout(1500);
// 「이 자리 소리」: 계곡 쉼터 곁 — 지금 자리 크기와 ±1dB
const here = await page.evaluate(async () => {
  const t = window.temple, s = t.temple.trail.spots.find((q) => q.id === 'bench_stream');
  t.avatars.teleport(s.stand.x, s.stand.z, s.ry);
  t._onZoneChange(true);
  await new Promise((r) => setTimeout(r, 4000));
  const e = t.sound;
  const place = {};
  for (const [k, l] of Object.entries(e.L)) if (l.level) place[k] = (l.level.gain._target ?? 0) * (l.panner?._bus === 'temple' ? 1 : e.natureZone.gain._target);
  t.modals.open('nature');
  document.querySelector('[data-tab="mine"]').click();
  document.querySelector('[data-here]').click();
  await new Promise((r) => setTimeout(r, 3500));
  const now = {};
  for (const [k, l] of Object.entries(e.L)) if (l.level) now[k] = (l.level.gain._target ?? 0) * (l.panner?._bus === 'temple' ? 1 : e.natureZone.gain._target);
  return { place, now, track: t._listening?.track.title, free: !!e.preset?.free };
});
const db = (a, b) => 20 * Math.log10(b / a);
const off = Object.keys(here.place).filter((k) => here.place[k] > 0.01 && (here.now[k] < 1e-6 || Math.abs(db(here.place[k], here.now[k])) > 1)).map((k) => `${k} ${here.place[k].toFixed(3)}→${here.now[k].toFixed(3)}`);
const heard = Object.keys(here.place).filter((k) => here.place[k] > 0.01).join(',');
check('「이 자리 소리」: 자리에서 들리던 크기 ±1dB', here.free && here.track === '이 자리 소리' && !off.length, `들리던 것 ${heard} ${off.join(', ')}`);
await page.evaluate(() => window.temple.exitListening());
await waitListening(page, false);
await page.waitForTimeout(1200);
// 테마 ASMR: 조절 없이 크기만 · 장면으로 바꾸기
await page.evaluate(async () => window.temple.listen((await import('./src/data/asmr.js')).ASMR_TRACKS[0]));
await waitListening(page);
await page.waitForTimeout(1600);
await wake(page, vp);
await page.click('#listen [data-l="vol"]');
await page.waitForTimeout(300);
s = await page.evaluate(() => ({ modal: window.temple.modals.current, pop: !document.querySelector('#listen-vol').hidden, label: document.querySelector('#listen [data-l="vol"] span').textContent }));
check('테마 ASMR: 소리 단추는 크기 판 (조절 창 아님)', !s.modal && s.pop && s.label === '소리', JSON.stringify(s));
await page.click('#listen [data-l="vol"]');
await page.click('#listen [data-l="list"]');
await page.waitForTimeout(500);
s = await page.evaluate(() => document.querySelector('[data-tab="asmr"]')?.getAttribute('aria-selected'));
check('테마 ASMR: 목록은 「테마 ASMR」 탭으로', s === 'true', s);
await page.click('[data-tab="scenes"]');
await page.click('[data-pane="scenes"] .yebul-item[data-id="rain"]');
await page.waitForTimeout(1500);
s = await page.evaluate(() => { const t = window.temple; return { kind: t._listening?.kind, preset: t.sound.preset?.id, track: !!t.sound.currentTrack, nature: document.querySelector('#listen').classList.contains('nature'), st: t.player.state }; });
check('테마 ASMR → 장면 「산사의 비」를 앉은 채로', s.kind === 'nature' && s.preset === 'rain' && s.nature && s.st === 'meditate', JSON.stringify(s));
await page.evaluate(() => window.temple.exitListening());
await waitListening(page, false);
await page.waitForTimeout(1200);
// 휴식: 산책로에서 돗자리
s = await page.evaluate(async () => {
  const t = window.temple, { trail } = await import('./src/world/trail.js');
  const a = trail.at(60), b = trail.at(60.5);
  t.avatars.teleport(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z));
  t._onZoneChange(true);
  await new Promise((r) => setTimeout(r, 600));
  t.gesture('rest');
  await new Promise((r) => setTimeout(r, 900));
  const flat = t.temple.trail.dynamic[1];
  return { seat: t.player.seat?.kind, sitting: t.player.sitting, mat: flat.visible, tilt: [+flat.rotation.x.toFixed(3), +flat.rotation.z.toFixed(3)], prompt: !document.querySelector('#prompt').classList.contains('hidden') && document.querySelector('#prompt').textContent.trim(), alt: !document.querySelector('#prompt-alt').classList.contains('hidden') && document.querySelector('#prompt-alt').textContent.trim() };
});
check('휴식: 산책로에 돗자리 펴고 앉음 · 듣기 알약 둘', s.seat === 'rest' && s.sitting && s.mat && /예불/.test(s.prompt) && /자연/.test(s.alt), JSON.stringify(s));
if (SHOTS) {
  await page.evaluate(() => { const c = window.temple.world.cam; c.mode = 'third'; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/rest-mat-390.png` });
}
await page.click('#prompt-alt');
await page.waitForTimeout(500);
s = await page.evaluate(() => window.temple.modals.current);
check('휴식 중 「자연의 소리 듣기」 → 창', s === 'nature', s);
await page.evaluate(() => window.temple.modals.close());
await page.keyboard.down('KeyW');
await page.waitForTimeout(500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(400);
s = await page.evaluate(() => ({ sitting: window.temple.player.sitting, mat: window.temple.temple.trail.dynamic[1].visible }));
check('걸으면 일어나고 돗자리는 걷힘', !s.sitting && !s.mat, JSON.stringify(s));
// 기운 산책로: 돗자리 네 귀퉁이가 땅 위 1.5cm 언저리 (기울기 부호가 틀리면 한쪽은 묻히고 한쪽은 뜬다)
s = await page.evaluate(async () => {
  const t = window.temple, Lm = await import('./src/world/layout.js'), { trail } = await import('./src/world/trail.js');
  const slope = (x, z, ry) => {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const P = [[0.5, 0.75], [-0.5, 0.75], [0.5, -0.75], [-0.5, -0.75]].map(([a, b]) => [x + c * a + sn * b, z - sn * a + c * b]);
    if (!P.every(([px, pz]) => Lm.isWalkable(px, pz))) return -1;
    const h = P.map(([px, pz]) => Lm.walkHeight(px, pz));
    return Math.max(Math.abs(((h[0] + h[1]) - (h[2] + h[3])) / 2 / 1.5), Math.abs(((h[0] + h[2]) - (h[1] + h[3])) / 2 / 1.0)) * 57.3;
  };
  let best = null;
  for (let d = 0; d < 430; d += 1) {
    const a = trail.at(d), b = trail.at(d + 0.5), ry = Math.atan2(b.x - a.x, b.z - a.z);
    const g = slope(a.x, a.z, ry);
    if (g > 8 && g < 15.5 && (!best || g > best.g)) best = { x: a.x, z: a.z, ry, g, d };
  }
  t.avatars.teleport(best.x, best.z, best.ry);
  t._onZoneChange(true);
  await new Promise((r) => setTimeout(r, 600));
  t.gesture('rest');
  await new Promise((r) => setTimeout(r, 900));
  const flat = t.temple.trail.dynamic[1];
  flat.updateMatrixWorld(true);
  const pos = flat.geometry.attributes.position, V = flat.position.constructor, err = [];
  for (let i = 0; i < pos.count; i++) {
    const v = flat.localToWorld(new V().fromBufferAttribute(pos, i));
    err.push(+(v.y - Lm.walkHeight(v.x, v.z)).toFixed(3));
  }
  return { at: +best.d.toFixed(0), slope: +best.g.toFixed(1), seat: t.player.seat?.kind, err };
});
check(`휴식: 기운 산책로(${s.slope}°)에서 돗자리가 땅을 따라 덮임 (꼭짓점 모두 땅 위 +0.015m ±0.01)`, s.seat === 'rest' && s.err.every((e) => Math.abs(e - 0.015) < 0.01), `${s.at}m · ${s.err.length}점 · ${Math.min(...s.err)}~${Math.max(...s.err)}`);
if (SHOTS) {
  await page.evaluate(() => {
    const t = window.temple, c = t.world.cam;
    c.mode = 'third';
    c.yaw = t.player.heading + Math.PI / 2;
    c.pitch = 0.12;
    c.targetDist = 2.6;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/rest-slope-390.png` });
}
await page.keyboard.down('KeyW');
await page.waitForTimeout(400);
await page.keyboard.up('KeyW');
await page.waitForTimeout(400);
// 「이 자리 소리」를 장면을 듣는 중에 골라도 장면 전의 하늘(시간대)로 잰다 — 한낮에 봄밤을 듣다가
s = await page.evaluate(async () => {
  const t = window.temple, e = t.sound, s0 = t.temple.trail.spots.find((q) => q.id === 'bench_stream');
  t.avatars.teleport(s0.stand.x, s0.stand.z, s0.ry);
  t._onZoneChange(true);
  t.world.setTimeOfDay('day');
  e.setTimeOfDay('day');
  await new Promise((r) => setTimeout(r, 3000));
  const before = e.here();
  const { NATURE_PRESETS } = await import('./src/data/natureSounds.js');
  t.listen(NATURE_PRESETS.find((p) => p.id === 'springnight'));
  await new Promise((r) => setTimeout(r, 3000));
  const during = { engineTime: e.time, ...t._hereTrack() };
  t.exitListening();
  await new Promise((r) => setTimeout(r, 1500));
  return { before, during };
});
// 시간대가 정하는 소리만 견준다 (물·대숲 같은 자리 소리는 선 자리(3인칭 카메라)와 앉은 자리(1인칭)의 거리 차이가 난다)
const dd = ['birds', 'crickets', 'cicadas', 'frogs', 'wind', 'rain'].filter((k) => Math.abs(20 * Math.log10((s.during.mix[k] || 1e-4) / (s.before.mix[k] || 1e-4))) > 1);
check('「이 자리 소리」를 장면(봄밤) 듣는 중에 골라도 장면 전 한낮 그대로', s.during.engineTime === 'night' && s.during.time === 'day' && !dd.length, `엔진 ${s.during.engineTime} → 잰 시간대 ${s.during.time} · 다른 소리 ${dd.join(',') || '없음'}`);
// 물 위는 안 됨 · 법당은 좌복
s = await page.evaluate(async () => {
  const t = window.temple, { streamZ } = await import('./src/world/layout.js');
  t.player.root.position.set(0, 0, streamZ(0));
  t.gesture('rest');
  const water = { sitting: t.player.sitting };
  t.avatars.teleport(0, -25, Math.PI);
  t._onZoneChange(true);
  await new Promise((r) => setTimeout(r, 400));
  t.gesture('rest');
  await new Promise((r) => setTimeout(r, 2500));
  return { water, hall: t.player.seat?.kind };
});
check('물 위에서는 펴지 않음 · 법당에서는 좌복', !s.water.sitting && s.hall === 'cushion', JSON.stringify(s));
check('페이지 오류 없음', !errors.length, errors.join(' | '));
await ctx.close();

// ── 헤드룸: 모든 소리를 막대 끝으로
{
  const { ctx, page } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const { MIX_SOUNDS, MIX_MAX } = await import('./src/data/natureSounds.js');
    const t = window.temple, e = t.sound;
    const mix = Object.fromEntries(MIX_SOUNDS.map((x) => [x.k, x.max ?? MIX_MAX]));
    t.listen({ id: 'qa-max', title: 'QA 최대', note: '', time: 'day', month: 6, weather: 'clear', free: true, mine: true, mix });
    await new Promise((res) => setTimeout(res, 14000)); // 조각을 받고 자리를 잡게
    const red = [];
    for (let i = 0; i < 100; i++) {
      red.push(e._lim.reduction);
      await new Promise((res) => setTimeout(res, 100));
    }
    const avg = red.reduce((a, b) => a + b, 0) / red.length;
    return { avg: +avg.toFixed(2), max: +Math.min(...red).toFixed(2), beds: e._nbeds.filter((b) => b.on).map((b) => b.name).join(',') };
  });
  check(`헤드룸: 모든 소리를 끝(MIX_MAX)으로 — 누름 평균 ${r.avg}dB · 최대 ${r.max}dB (기준 > -1 · > -3)`, r.avg > -1 && r.max > -3, `켜진 배경 ${r.beds}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
