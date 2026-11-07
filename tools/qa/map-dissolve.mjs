// 미니맵: 누를 수 있다는 표시·도반 점·순간이동 디졸브 — node tools/qa/map-dissolve.mjs   (먼저 python3 .claude/devserver.py 8095, BASE=http://localhost:8095, OUT=찍은 그림 폴더)
// 412×915 모바일(배율 2)에서
//   (1) 장소 시트: 안내 한 줄·처음 온 사람의 물결 → sheet-fresh.png
//   (2) 가짜 도반 230명(법당에 몰린 60명 포함)을 넣고 지도 점 → sheet-peers.png, 점 갱신 시간
//   (3) 지도에서 후원 다실을 실제로 눌러 옮긴다: 누른 점의 물결(tap-ripple.png), 덮개 그림이 비지 않았는지, 옮긴 뒤 몇 번 그려지고 나서 걷히기 시작하는지, 불투명도 곡선,
//       걷히는 중간을 멈춰 찍기(dissolve-mid.png)와 멈추지 않고 찍기(dissolve-live.png), 시작·끝(dissolve-0.png, dissolve-1.png)
//   (4) 밤(23시)에 한 번 더 중간 프레임 → dissolve-night-mid.png
//   (5) CPU 4배 느리게, 아직 안 가 본 전망대 쉼터로: 옮긴 직후 멈칫하는 동안 덮개가 떠난 자리 그림을 그대로 들고 있는지
//   (6) 옛 가림막(ui/veil.js)과 견주는 값: 가림막 빛깔 밝기 vs 화면 밝기 (낮·밤)
//   (7) 옛 가림막 불투명도 곡선 (보통 / 모션 줄이기) — 예전 가람 이동처럼 hold 600
import { launch, BASE } from './lib.mjs';

const OUT = process.env.OUT || '.';
const browser = await launch();
const lines = [];
const log = (s) => (console.log(s), lines.push(s));
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
  const setHour = (h) => page.evaluate((h) => {
    const W = window.temple.world;
    W.timeMode = 'fixed';
    W.hour = W.hourTarget = h;
    W.applyEnv(true);
  }, h);
  await setHour(13);
  const openSheet = async () => {
    await page.click('#place-btn');
    await page.waitForTimeout(700);
  };

  // (1)
  await openSheet();
  const fresh = await page.evaluate(() => ({
    fresh: document.querySelector('.minimap-svg').classList.contains('fresh'),
    hint: document.querySelector('.mm-hint')?.textContent,
    waves: document.querySelectorAll('.minimap-svg.fresh .mm-wave').length,
    waveAnim: getComputedStyle(document.querySelector('.mm-wave')).animationName
  }));
  log(`(1) 안내: 「${fresh.hint}」 · 처음 온 사람 물결 ${fresh.fresh ? '켜짐' : '꺼짐'} (점 ${fresh.waves}개, ${fresh.waveAnim})`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/sheet-fresh.png` });

  // (2)
  const peers = await page.evaluate(() => {
    const t = window.temple, A = t.avatars;
    const fakes = [];
    let k = 0;
    const add = (x, z) => fakes.push({ id: `p${9000 + k}`, dharmaName: `도반${k++}`, avatarStyle: 'monk', x, y: 0, z, ry: 0, actionState: 'idle', actionSeq: 0 });
    for (let i = 0; i < 60; i++) add(-3 + (i % 10) * 0.65, -24 + Math.floor(i / 10) * 0.7); // 법당 안에 몰림
    for (let i = 0; i < 170; i++) { const a = i * 2.39996, r = 8 + (i % 17) * 2.4; add(Math.cos(a) * r, Math.sin(a) * r * 0.9); } // 여기저기
    const a0 = performance.now();
    A.updateRemotePeers(fakes, fakes.map((f) => f.id));
    const inject = performance.now() - a0;
    for (const r of A.remote.values()) r.av.root.position.copy(r.target);
    const ms = [];
    for (let i = 0; i < 20; i++) { const a = performance.now(); t._syncMiniMap(); ms.push(performance.now() - a); }
    ms.sort((p, q) => p - q);
    const d = document.querySelector('.mm-peers path:last-child').getAttribute('d');
    return { n: A.remote.size, dots: (d.match(/M/g) || []).length, syncMs: +ms[10].toFixed(2), syncMax: +ms[19].toFixed(2), inject: Math.round(inject) };
  });
  log(`(2) 도반 ${peers.n}명 → 지도 점 ${peers.dots}개 (0.5m 안은 하나로), _syncMiniMap 중앙값 ${peers.syncMs}ms·최대 ${peers.syncMax}ms (0.2초마다, 시트가 열려 있을 때만)`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/sheet-peers.png` });
  await page.evaluate(() => window.temple.avatars.updateRemotePeers([], [])); // 디졸브 그림은 도반 없이

  // (3) 후원 다실 점을 실제로 누른다
  const box = await page.evaluate(() => {
    const g = document.querySelector('.mm-zone[data-id="TEAHOUSE"] circle:not(.mm-wave)').getBoundingClientRect();
    return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  });
  // 그리기·옮기기에 시각을 남기고, 덮개 불투명도를 rAF 마다 적는다 (window.__dz, t0 기준 ms)
  const arm = (dur) => page.evaluate((dur) => {
    const t = window.temple;
    const R = (window.__dz = { t0: performance.now(), renders: [], teleport: -1, anim: -1, op: [], snapLuma: null });
    if (!t.__dzHooked) {
      t.__dzHooked = true;
      const render = t.world.render.bind(t.world);
      t.world.render = () => (render(), window.__dz.renders.push(performance.now() - window.__dz.t0));
      const tp = t._teleport.bind(t);
      t._teleport = (...a) => ((window.__dz.teleport = performance.now() - window.__dz.t0), tp(...a));
    }
    const tick = () => {
      const el = document.querySelector('#map-dissolve');
      if (el && !el.hidden && el.width) {
        if (el.getAnimations().some((a) => a.playState === 'running') && R.anim < 0) R.anim = performance.now() - R.t0;
        R.op.push([Math.round(performance.now() - R.t0), +(+getComputedStyle(el).opacity).toFixed(2)]);
        if (R.snapLuma == null) {
          const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 4 * 97) (s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]), n++;
          R.snapLuma = +(s / n).toFixed(1);
        }
      }
      if (performance.now() - R.t0 < dur) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, dur);
  const result = () => page.evaluate(() => {
    const R = window.__dz;
    const gaps = R.op.slice(1).map((s, i) => s[0] - R.op[i][0]);
    return { teleport: Math.round(R.teleport), anim: Math.round(R.anim), after: R.renders.filter((x) => x > R.teleport && x < R.anim).length, maxGap: Math.max(0, ...gaps), hold: Math.min(...R.op.filter((o) => o[0] < R.anim).map((o) => o[1])), snapLuma: R.snapLuma, op: R.op.filter((_, i) => i % 4 === 0) };
  });
  await arm(6000);
  const mapBox = await page.evaluate(() => { const r = document.querySelector('#minimap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await page.mouse.click(box.x, box.y);
  const tap = await page.evaluate(() => document.querySelector('.mm-tap').getAnimations().map((a) => a.playState).join(',') || '없음');
  await page.screenshot({ path: `${OUT}/tap-ripple.png`, clip: mapBox });
  log(`(3) 누른 점 물결: ${tap} → tap-ripple.png (시트는 ${await page.evaluate(() => (document.querySelector('#place-sheet').classList.contains('hidden') ? '닫힘' : '아직 열림'))})`);
  await page.waitForFunction(() => document.querySelector('#map-dissolve') && !document.querySelector('#map-dissolve').hidden, null, { timeout: 3000 });
  await page.screenshot({ path: `${OUT}/dissolve-0.png` });
  await page.waitForFunction(() => window.__dz.anim > 0, null, { timeout: 5000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/dissolve-live.png` });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/dissolve-1.png` });
  const R = { ...(await result()), ...(await page.evaluate(() => ({ zone: window.temple.zone, used: window.temple.store.state.settings.mapUsed }))) };
  log(`(3) 누른 뒤 ${R.teleport}ms 에 옮김 → 새 장면 ${R.after}번 그린 뒤 ${R.anim}ms 에 걷히기 시작 (그 전 덮개 불투명도 최저 ${R.hold}) · 덮개 그림 평균 밝기 ${R.snapLuma} (0 이면 빈 그림) · 도착 ${R.zone} · mapUsed=${R.used}`);
  log(`    불투명도 [ms, opacity]: ${JSON.stringify(R.op)}`);

  // 중간을 멈춰 찍기: 다실 → 숲길로 다시 (시트를 열어 숲길 점)
  const midShot = async (name, zone) => {
    await openSheet();
    const b = await page.evaluate((zone) => {
      const g = document.querySelector(`.mm-zone[data-id="${zone}"] circle:not(.mm-wave)`).getBoundingClientRect();
      return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
    }, zone);
    await page.mouse.click(b.x, b.y);
    await page.waitForFunction(() => document.querySelector('#map-dissolve')?.getAnimations().some((a) => a.playState === 'running'), null, { timeout: 5000 });
    const op = await page.evaluate(() => {
      const an = document.querySelector('#map-dissolve').getAnimations().find((a) => a.playState === 'running');
      an.pause();
      an.currentTime = an.effect.getTiming().duration / 2;
      return +getComputedStyle(document.querySelector('#map-dissolve')).opacity;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => document.querySelector('#map-dissolve').getAnimations()[0].play());
    await page.waitForTimeout(1600);
    return op;
  };
  log(`(3) 중간 멈춤(다실→숲길): 덮개 불투명도 ${(await midShot('dissolve-mid', 'FOREST')).toFixed(2)} → dissolve-mid.png`);

  // (4) 밤
  await setHour(23);
  await page.waitForTimeout(500);
  log(`(4) 밤 23시 중간 멈춤(숲길→법당): 덮개 불투명도 ${(await midShot('dissolve-night-mid', 'DAEUNGJEON')).toFixed(2)} → dissolve-night-mid.png`);
  await setHour(13);

  // (5) CPU 4배 느리게
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1500);
  await openSheet();
  const b5 = await page.evaluate(() => {
    const g = document.querySelector('.mm-rest[data-id="lookout"] circle:not(.mm-wave)').getBoundingClientRect(); // 아직 안 가 본 곳 (처음 그리는 곳이 가장 오래 멈춘다)
    return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  });
  await arm(8000);
  await page.mouse.click(b5.x, b5.y);
  await page.waitForTimeout(6000);
  const R5 = await result();
  log(`(5) CPU×4: 옮김 ${R5.teleport}ms → 새 장면 ${R5.after}번 그린 뒤 ${R5.anim}ms 에 걷히기 시작 (그 전 덮개 불투명도 최저 ${R5.hold}), 덮개가 떠 있는 동안 가장 긴 프레임 틈 ${R5.maxGap}ms`);
  log(`    불투명도 [ms, opacity]: ${JSON.stringify(R5.op)}`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // (6) 옛 가림막 빛깔 대비
  const luma = await page.evaluate(() => {
    const t = window.temple, W = t.world, out = {};
    const read = () => {
      W.render();
      const c = document.createElement('canvas');
      c.width = 103; c.height = 229;
      const g = c.getContext('2d');
      g.drawImage(W.renderer.domElement, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return +(s / (d.length / 4)).toFixed(1);
    };
    for (const h of [13, 23]) {
      W.hour = W.hourTarget = h;
      W.applyEnv(true);
      for (let i = 0; i < 4; i++) t._frame(1 / 60, 300 + i / 60);
      out[h] = read();
    }
    return out;
  });
  log(`(6) 화면 평균 밝기 낮 ${luma[13]} · 밤 ${luma[23]} vs 옛 가림막 #07060a 6.5`);
  // (7) 옛 가림막 곡선: 지금 남아 있는 ui/veil.js 를 예전 가람 이동(hold 600)처럼 불러 본다 — 보통 / 모션 줄이기
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
      veil(() => ((cut = performance.now() - t0), t._teleport(0, 3, Math.PI)), { hold: 600 });
      await new Promise((r) => setTimeout(r, 2300));
      run = false;
      const dark = s.filter((x) => x[1] >= 0.5);
      const up = s.find((x) => x[0] > cut + 60 && x[1] < 1);
      const at = (ms) => s.find((x) => up && x[0] >= up[0] + ms)?.[1];
      return { cut: Math.round(cut), dark: dark.length ? [dark[0][0], dark.at(-1)[0]] : null, after330: at(330) };
    });
    log(`(7) 옛 가림막${reduced ? '(모션 줄이기)' : ''}: 불투명도 0.5 넘는 구간 ${v.dark?.join('~')}ms, 옮김 ${v.cut}ms, 걷히기 시작 0.33초 뒤 불투명도 ${v.after330}`);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  log(`pageerror: ${errors.length ? errors.join(' | ') : '없음'}`);
  await ctx.close();
} finally {
  await browser.close();
}
