// 순간이동 페이드(ui/travelFade.js)와 미니맵 — node tools/qa/travel-fade.mjs   (먼저 python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=찍은 그림 폴더)
// 412×915 모바일(배율 2), ?q=low, 낮 13시
//   (1) 장소 시트: 안내 한 줄·처음 온 사람의 물결 → sheet-fresh.png
//   (2) 가짜 도반 230명(법당에 몰린 60명 포함) → sheet-peers.png, 지도 점 갱신 시간
//   (3) 미니맵에서 후원 다실을 실제로 누른다: 누른 점 물결(tap-ripple.png), 어두워지는 중간·밝아지는 중간을 멈춰 찍기(map-out-mid.png, map-in-mid.png),
//       가장 어두울 때 옮기는지, 어두운 구간·전체 길이, 도착 알림이 다 밝아진 뒤인지,
//       페이드 중 또 부르기(travelTo)는 무시되는지, W 키를 눌러도 걷지 않는지, 화면을 눌러도 덮개가 받는지
//   (4) 범종: 숲길에서 「범종」 → 페이드 뒤 종을 치는지 (bell-in-mid.png)
//   (5) 기와불사: 숲길에서 「기와」 → 페이드 뒤 창이 열리는지 (tile-in-mid.png)
//   (6) CPU 4배 느리게, 아직 안 가 본 전망대 쉼터로: 옮긴 뒤 새 장면이 그려질 때까지 어두운 채인지
//   (7) 옛 가림막(ui/veil.js, 예전 가람 이동처럼 hold 600) 불투명도 곡선 — 보통 / 모션 줄이기
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.';
const browser = await launch();
const log = (s) => console.log(s);
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const W = window.temple.world;
    W.timeMode = 'fixed';
    W.hour = W.hourTarget = 13;
    W.applyEnv(true);
  });
  const openSheet = async () => {
    await page.click('#place-btn');
    await page.waitForTimeout(700);
  };
  const markerAt = (sel) => page.evaluate((sel) => {
    const g = document.querySelector(`${sel} circle:not(.mm-wave)`).getBoundingClientRect();
    return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  }, sel);

  // (1)
  await openSheet();
  const fresh = await page.evaluate(() => ({
    fresh: document.querySelector('.minimap-svg').classList.contains('fresh'),
    hint: document.querySelector('.mm-hint')?.textContent,
    waves: document.querySelectorAll('.minimap-svg.fresh .mm-wave').length
  }));
  log(`(1) 안내 「${fresh.hint}」 · 처음 온 사람 물결 ${fresh.fresh ? '켜짐' : '꺼짐'} (점 ${fresh.waves}개)`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/sheet-fresh.png` });

  // (2)
  const peers = await page.evaluate(() => {
    const t = window.temple, A = t.avatars, fakes = [];
    let k = 0;
    const add = (x, z) => fakes.push({ id: `p${9000 + k}`, dharmaName: `도반${k++}`, avatarStyle: 'monk', x, y: 0, z, ry: 0, actionState: 'idle', actionSeq: 0 });
    for (let i = 0; i < 60; i++) add(-3 + (i % 10) * 0.65, -24 + Math.floor(i / 10) * 0.7);
    for (let i = 0; i < 170; i++) { const a = i * 2.39996, r = 8 + (i % 17) * 2.4; add(Math.cos(a) * r, Math.sin(a) * r * 0.9); }
    A.updateRemotePeers(fakes, fakes.map((f) => f.id));
    for (const r of A.remote.values()) r.av.root.position.copy(r.target);
    const ms = [];
    for (let i = 0; i < 20; i++) { const a = performance.now(); t._syncMiniMap(); ms.push(performance.now() - a); }
    ms.sort((p, q) => p - q);
    const d = document.querySelector('.mm-peers path:last-child').getAttribute('d');
    return { n: A.remote.size, dots: (d.match(/M/g) || []).length, syncMs: +ms[10].toFixed(2), syncMax: +ms[19].toFixed(2) };
  });
  log(`(2) 도반 ${peers.n}명 → 지도 점 ${peers.dots}개, _syncMiniMap 중앙값 ${peers.syncMs}ms·최대 ${peers.syncMax}ms (0.2초마다, 시트가 열려 있을 때만)`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/sheet-peers.png` });
  await page.evaluate(() => {
    window.temple.avatars.updateRemotePeers([], []);
    window.temple._syncMiniMap();
  });

  // 기록: 옮긴 때(_place)·그때 덮개 불투명도·옮기기 직전 내 자리, 덮개 불투명도 곡선, 그리기, 종 치기·창 열기·알림 (window.__tf, t0 기준 ms)
  await page.evaluate(() => {
    const t = window.temple, now = () => performance.now() - window.__tf.t0;
    const ev = (name) => window.__tf?.ev.push([name, Math.round(now())]);
    const place = t._place.bind(t);
    t._place = (...a) => {
      const F = window.__tf, p = t.player.root.position;
      F.places++;
      F.cut = Math.round(now());
      F.cutOpacity = +getComputedStyle(document.querySelector('#travel-fade')).opacity;
      F.drift = +Math.hypot(p.x - F.start.x, p.z - F.start.z).toFixed(2);
      return place(...a);
    };
    const render = t.world.render.bind(t.world);
    t.world.render = () => (render(), window.__tf?.renders.push(now()));
    const bell = t._strikeBell.bind(t);
    t._strikeBell = (...a) => (ev('종 치기'), bell(...a));
    const open = t.modals.open.bind(t.modals);
    t.modals.open = (id, ...a) => (ev(`창 ${id}`), open(id, ...a));
    const toast = t.toast.bind(t);
    t.toast = (msg, ...a) => (ev(`알림 ${String(msg).slice(0, 14)}`), toast(msg, ...a));
  });
  const arm = (dur) => page.evaluate((dur) => {
    const p = window.temple.player.root.position;
    const F = (window.__tf = { t0: performance.now(), op: [], renders: [], ev: [], places: 0, cut: -1, start: { x: p.x, z: p.z }, end: -1 });
    let seen = false;
    const tick = () => {
      const el = document.querySelector('#travel-fade');
      const on = el && !el.hidden;
      const t = Math.round(performance.now() - F.t0);
      if (on) (seen = true), F.op.push([t, +(+getComputedStyle(el).opacity).toFixed(2)]);
      else if (seen && F.end < 0) F.end = t;
      if (t < dur) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, dur);
  const result = () => page.evaluate(() => {
    const F = window.__tf, op = F.op;
    const dark = op.filter((o) => o[1] >= 0.5), black = op.filter((o) => o[1] >= 0.99);
    const fadeInStart = op.find((o) => o[0] > F.cut && o[1] < 0.99)?.[0] ?? -1;
    const gaps = op.slice(1).map((o, i) => o[0] - op[i][0]);
    return {
      start: op[0]?.[0], cut: F.cut, cutOpacity: F.cutOpacity, end: F.end, places: F.places, drift: F.drift,
      dark: dark.length ? [dark[0][0], dark.at(-1)[0]] : null, black: black.length ? [black[0][0], black.at(-1)[0]] : null,
      rendersInDark: F.renders.filter((r) => r > F.cut && r < fadeInStart).length, maxGap: Math.max(0, ...gaps), ev: F.ev,
      curve: op.filter((_, i) => i % 6 === 0)
    };
  });
  // 어두워지는(out)·밝아지는(in) 애니메이션을 한가운데에서 멈춰 찍고 다시 돌린다
  const shotMid = async (phase, name) => {
    await page.waitForFunction((phase) => {
      const a = document.querySelector('#travel-fade')?.getAnimations().find((x) => x.playState === 'running');
      if (!a || (+a.effect.getKeyframes()[0].opacity === 0) !== (phase === 'out')) return false;
      a.pause();
      a.currentTime = a.effect.getTiming().duration / 2;
      return true;
    }, phase, { timeout: 10000, polling: 'raf' }).catch(async (e) => {
      log(`    ✗ ${name}: ${JSON.stringify(await page.evaluate(() => ({ fade: document.querySelector('#travel-fade')?.hidden, anims: document.querySelector('#travel-fade')?.getAnimations().map((a) => a.playState), fading: !!window.temple._fading, zone: window.temple.zone, modal: window.temple.modals.current, ev: window.__tf.ev, op: window.__tf.op.slice(0, 5) })))}`);
      throw e;
    });
    await page.waitForTimeout(250);
    const op = await page.evaluate(() => +getComputedStyle(document.querySelector('#travel-fade')).opacity);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => document.querySelector('#travel-fade').getAnimations().forEach((a) => a.playState === 'paused' && a.play()));
    return op.toFixed(2);
  };
  const fmt = (r) => `누른 뒤 ${r.start}ms 어두워지기 시작 → ${r.cut}ms 옮김(덮개 ${r.cutOpacity}) → ${r.end}ms 다 밝아짐 · 전체 ${((r.end - r.start) / 1000).toFixed(2)}초 · 불투명도 0.5 넘는 구간 ${r.dark?.join('~')}ms, 0.99 넘는 구간 ${r.black?.join('~')}ms`;

  // (3) 미니맵
  const tea = await markerAt('.mm-zone[data-id="TEAHOUSE"]');
  const mapBox = await page.evaluate(() => { const r = document.querySelector('#minimap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await arm(6000);
  await page.mouse.click(tea.x, tea.y);
  await page.screenshot({ path: `${OUT}/tap-ripple.png`, clip: mapBox });
  await page.waitForFunction(() => document.querySelector('#travel-fade') && !document.querySelector('#travel-fade').hidden, null, { timeout: 3000 });
  // 페이드 중: W 키 0.4초, 또 부르기, 화면 가운데를 누르면 무엇이 받는지
  await page.keyboard.down('KeyW');
  const during = await page.evaluate(() => {
    const t = window.temple;
    const again = t.travelTo('FOREST') === t._fading;
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight - 40)?.id || document.elementFromPoint(innerWidth / 2, innerHeight - 40)?.className;
    return { again, hit };
  });
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  const outOp = await shotMid('out', 'map-out-mid');
  const inOp = await shotMid('in', 'map-in-mid');
  await page.waitForFunction(() => window.__tf.end > 0, null, { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/map-end.png` });
  let r = await result();
  log(`(3) 미니맵 → 다실: ${fmt(r)}`);
  log(`    멈춰 찍기: 어두워지는 중간 ${outOp}, 밝아지는 중간 ${inOp} · 옮긴 뒤 어두운 채로 ${r.rendersInDark}번 그림 · 도착 ${await page.evaluate(() => window.temple.zone)}`);
  log(`    페이드 중 또 부르기 → 같은 페이드 ${during.again} · 옮김 ${r.places}번 · W 를 눌러도 옮기기 전 움직인 거리 ${r.drift}m · 화면 아래를 누르면 받는 것 ${during.hit}`);
  log(`    뒤따르는 일: ${JSON.stringify(r.ev)} (다 밝아진 때 ${r.end}ms)`);
  log(`    곡선 [ms, 불투명도]: ${JSON.stringify(r.curve)}`);

  // (4) 범종 · (5) 기와불사 — 숲길에서 부른다 (다른 구역이라 순간이동)
  for (const [id, name, label] of [['bell_strike', 'bell-in-mid', '범종'], ['wish_tile', 'tile-in-mid', '기와불사']]) {
    await page.evaluate(() => {
      const t = window.temple;
      t.modals.isOpen && t.modals.close();
      t._place(0, 34, Math.PI);
    });
    await page.waitForTimeout(1200);
    await arm(7000);
    await page.evaluate((id) => void window.temple.activate(id), id); // activate 가 돌려주는 페이드 Promise 를 기다리지 않게
    const mid = await shotMid('in', name);
    await page.waitForFunction(() => window.__tf.end > 0, null, { timeout: 10000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name.replace('in-mid', 'end')}.png` });
    r = await result();
    log(`(${id === 'bell_strike' ? 4 : 5}) ${label}: ${fmt(r)} · 밝아지는 중간 ${mid}`);
    log(`    뒤따르는 일: ${JSON.stringify(r.ev)} (다 밝아진 때 ${r.end}ms) · 도착 ${await page.evaluate(() => window.temple.zone)}`);
  }
  await page.evaluate(() => window.temple.modals.isOpen && window.temple.modals.close());

  // (6) CPU 4배 느리게
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1500);
  await arm(9000);
  await page.evaluate(() => void window.temple._goRest('lookout'));
  await page.waitForFunction(() => window.__tf.end > 0, null, { timeout: 15000 });
  r = await result();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  log(`(6) CPU×4 전망대: ${fmt(r)} · 옮긴 뒤 어두운 채로 ${r.rendersInDark}번 그림, 덮개가 떠 있는 동안 가장 긴 프레임 틈 ${r.maxGap}ms`);

  // (7) 옛 가림막
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.waitForTimeout(300);
    const v = await page.evaluate(async () => {
      const { veil } = await import('./src/ui/veil.js');
      const t = window.temple, el = document.querySelector('#listen-veil'), s = [], t0 = performance.now();
      let run = true;
      const tick = () => (s.push([Math.round(performance.now() - t0), +(+getComputedStyle(el).opacity).toFixed(2)]), run && requestAnimationFrame(tick));
      requestAnimationFrame(tick);
      let cut = 0;
      veil(() => ((cut = performance.now() - t0), t._place(0, 3, Math.PI)), { hold: 600 });
      await new Promise((r) => setTimeout(r, 2300));
      run = false;
      const dark = s.filter((x) => x[1] >= 0.5);
      const up = s.find((x) => x[0] > cut + 60 && x[1] < 1);
      return { cut: Math.round(cut), dark: dark.length ? [dark[0][0], dark.at(-1)[0]] : null, after330: up && s.find((x) => x[0] >= up[0] + 330)?.[1] };
    });
    log(`(7) 옛 가림막${reduced ? '(모션 줄이기)' : ''}: 불투명도 0.5 넘는 구간 ${v.dark?.join('~')}ms, 옮김 ${v.cut}ms, 걷히기 시작 0.33초 뒤 불투명도 ${v.after330}`);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
  await ctx.close();
} finally {
  await browser.close();
}
