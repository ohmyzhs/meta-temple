// 어스름·밤 가시성 검사 — node tools/qa/dusk.mjs   (먼저 python3 .claude/devserver.py 8093 → BASE=http://localhost:8093)
// 사용자 2026-11-07: 18~23시·05~08시가 너무 어둡다 (대웅전 안·산책로·산문 밖이 거의 안 보임), 한밤은 달빛 덕에 낫다. 비 오는데 은하수가 보인다.
// 구도마다 화면 평균 루마를 재고 같은 구도 13시와 견준다 (night.mjs (a) 와 같은 방식). 스크린샷: OUT/TAG-<q>-<구도>-<시>.png
// 기준 (1280×800): 05~08·18~23시 맑음에서
//   바깥 구도(산문 밖·숲길·마당) 평균 루마 ≥ 13시의 MIN(기본 30% — 한밤 산문 34% 를 사용자가 '낫다'고 한 데서), 법당 안 ≥ HALL_MIN(기본 40%)
//   산책로(숲 속 작은 나무다리) ≥ TRAIL_MIN(기본 18% — 고치기 전 한밤 값. 고치기 전 19~20시는 7~10%)
//   날씨(rain·snow 다 내린 뒤, rainramp = 비를 켜고 1초 뒤): 산문 구도에서 별·은하수·달이 더한 밝기 < 0.002
// 환경 변수: TAG(before|after), Q=low,high, HOURS=13,5,7,18,20,22,0,rain22,snow22,rainramp22, SHOTS=gate,forest,..., NOSHOT=1(스크린샷 안 찍음), OUT
import { mkdirSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const TAG = process.env.TAG || 'now';
const OUT = process.env.OUT || '.playwright-mcp/qa/dusk';
const QS = (process.env.Q || 'low,high').split(',');
const HOURS = (process.env.HOURS || '13,5,7,18,20,22,0,rain22,snow22,rainramp22').split(',');
const ONLY = process.env.SHOTS?.split(',');
const MIN = +(process.env.MIN || 0.3), HALL_MIN = +(process.env.HALL_MIN || 0.4), TRAIL_MIN = +(process.env.TRAIL_MIN || 0.18);
const twilight = (h) => (h >= 5 && h <= 8) || (h >= 18 && h <= 23);
mkdirSync(OUT, { recursive: true });

const browser = await launch();
let pass = true;
const lines = [];
try {
  for (const q of QS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
    await page.click('#intro-enter'); // 누름은 바로 받고 산사 짓기(build)를 기다렸다 들어간다
    await page.waitForFunction(() => window.temple.entered && window.temple.avatars, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    let shots = await page.evaluate(async () => {
      const t = window.temple, W = t.world;
      t._loop = () => {}; // 실시간 루프를 멈추고 프레임을 직접 돌린다 (가려진 창의 rAF 는 2fps)
      const THREE = await import('three');
      const { L, pathX, walkHeight } = await import('/src/world/layout.js');
      const { trail } = await import('/src/world/trail.js');
      const Wd = 1280, Ht = 800;
      const cv = Object.assign(document.createElement('canvas'), { width: Wd, height: Ht });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      let clock = 80;
      const frames = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
      const grab = (render) => { render(); ctx.clearRect(0, 0, Wd, Ht); ctx.drawImage(W.renderer.domElement, 0, 0, Wd, Ht); return ctx.getImageData(0, 0, Wd, Ht).data; };
      const meanLuma = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; };
      const plain = () => W.renderer.render(W.scene, W.camera);
      window.__dq = {
        // w: clear | rain | snow (다 내린 상태) | rainramp (맑음에서 비를 켜고 1초)
        setHour(h, w) {
          W.timeMode = 'fixed';
          W.hour = W.hourTarget = h;
          W.setWeather(w === 'rainramp' ? 'clear' : w);
          W.weather.rainU.uAmount.value = w === 'rain' ? 1 : 0;
          W.weather.snowU.uAmount.value = w === 'snow' ? 1 : 0;
          W.wet = w === 'rain' ? 1 : 0;
          W.snow = w === 'snow' ? 1 : 0;
          W.applyEnv(true);
          if (w === 'rainramp') { W.setWeather('rain'); frames(30); }
        },
        shot(s) {
          t.avatars.teleport(s.player[0], s.player[1], Math.PI);
          t._walkZone = null;
          t.avatars.solo = true;
          W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
          document.querySelector('#hud').style.opacity = 0;
          document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
          document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
          frames(24);
        },
        measure(sky) {
          const out = { mean: +meanLuma(grab(() => frames(1))).toFixed(4) };
          if (sky) {
            // 별·은하수·달이 하늘에 더한 밝기: 같은 화면을 그것만 끄고 다시 그려 뺀다
            const u = W.skyMat.uniforms, keep = [u.uStars.value, u.uMoon?.value ?? 0];
            const on = meanLuma(grab(plain));
            u.uStars.value = 0;
            if (u.uMoon) u.uMoon.value = 0;
            const off = meanLuma(grab(plain));
            u.uStars.value = keep[0];
            if (u.uMoon) u.uMoon.value = keep[1];
            out.starAdd = +(on - off).toFixed(4);
          }
          frames(1); // 스크린샷용으로 실제 화면을 다시 그린다
          return out;
        }
      };
      // 산책로 구도는 길 데이터에서 그때그때 고른다 (맵 세션이 길을 옮겨도 따라간다): 순환로 22% 지점(지금은 서쪽 작은 나무다리), 5m 뒤 2m 높이에서 앞길을 본다
      const s0 = trail.length * 0.22, a = trail.at(s0 - 5), b = trail.at(s0), c = trail.at(s0 + 7);
      const gx = L.gate.x;
      return [
        { name: 'gate', sky: true, player: [gx + 0.6, 40.5], pos: [gx + 0.6, 2.3, 38.5], look: [gx, 6.0, 26] }, // 산문 밖에서 일주문
        { name: 'forest', player: [pathX(16), 16], pos: [pathX(19), walkHeight(pathX(19), 19) + 2.2, 19], look: [pathX(8), 2.6, 7] }, // 일주문 안 숲길 → 마당 계단
        { name: 'courtyard', player: [5.2, 4.4], pos: [5.0, 2.1, 2.6], look: [1, 6.5, -16] },
        { name: 'hall', player: [1.5, -20.8], pos: [1.2, 4.7, -21.0], look: [0, 4.2, -28.4] }, // 법당 안 (night.mjs 와 같은 구도)
        { name: 'trail', player: [b.x, b.z], pos: [a.x, walkHeight(a.x, a.z) + 2.0, a.z], look: [c.x, walkHeight(c.x, c.z) + 1.0, c.z] }
      ];
    });
    if (ONLY) shots = shots.filter((s) => ONLY.includes(s.name));
    const base = {};
    for (const hs of HOURS) {
      const w = hs.match(/^[a-z]+/)?.[0] || 'clear';
      const h = +hs.replace(/^[a-z]+/, '');
      const row = [];
      for (const s of shots) {
        if (w !== 'clear' && !s.sky) continue; // 날씨 검사는 하늘이 보이는 산문 구도만
        await page.evaluate(([h, w, s]) => { window.__dq.setHour(h, w); window.__dq.shot(s); }, [h, w, s]);
        const r = await page.evaluate((sky) => window.__dq.measure(sky), !!s.sky);
        if (!process.env.NOSHOT) await page.screenshot({ path: `${OUT}/${TAG}-${q}-${s.name}-${hs.padStart(2, '0')}.png` });
        if (hs === '13') base[s.name] = r.mean;
        const ratio = base[s.name] ? r.mean / base[s.name] : null;
        let ok = true;
        if (w === 'clear' && hs !== '13' && ratio != null && twilight(h)) ok = ratio >= (s.name === 'hall' ? HALL_MIN : s.name === 'trail' ? TRAIL_MIN : MIN);
        if (w !== 'clear') ok = Math.abs(r.starAdd) < 0.002;
        if (!ok) pass = false;
        row.push(`${s.name} ${r.mean}${ratio != null && hs !== '13' ? ` (${(ratio * 100).toFixed(0)}%)` : ''}${r.starAdd != null ? ` 별+${r.starAdd}` : ''}${ok ? '' : '✗'}`);
      }
      lines.push(`${q.padEnd(4)} ${hs.padStart(10)}h  ${row.join(' | ')}`);
    }
    if (errors.length) lines.push(`${q} 페이지 오류: ${errors.slice(0, 3).join(' / ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`dusk.mjs ${pass ? 'PASS' : 'FAIL'} (05~08·18~23시 바깥 ≥ 13시의 ${MIN * 100}%, 산책로 ≥ ${TRAIL_MIN * 100}%, 법당 안 ≥ ${HALL_MIN * 100}%, 비·눈 별 ≈ 0)\n` + lines.join('\n'));
process.exit(pass ? 0 : 1);
