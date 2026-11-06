// 소리 여유(헤드룸) 검사 — node tools/qa/headroom.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 자리·장면마다 20초 동안 마스터 리미터가 얼마나 누르는지(reduction dB)와 마스터 봉우리를 잰다.
// 기준: 평균 누름 < 1dB, 최대 누름 < 3dB — 넘으면 봉우리가 큰 녹음(모닥불 등)이 전체 소리를 출렁이게 한다
import { launch, enter, BASE } from './lib.mjs';

const SPOTS = [
  ['화로 곁 (마당)', { x: -10.5, z: -6 }],
  ['다리 쉼터 (계곡 2.5m)', { x: -41.4, z: 14.9 }],
  ['다실 마당', { x: 24, z: -11 }],
  ['법당 안', { x: 0, z: -25 }],
  ['장면: 화롯가', 'fire'],
  ['장면: 산사의 비', 'rain'],
  ['장면: 계곡 물가', 'valley'],
  ['장면: 솔바람·대숲', 'pines'],
  ['효과음: 번뇌 소각·차·죽비·발소리', 'foley']
];
const SEC = +(process.env.SEC || 20);
const browser = await launch();
let failed = 0;
try {
  const { page, errors } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const e = window.temple.sound;
    const a = (e._qaAn = e.ctx.createAnalyser());
    a.fftSize = 2048;
    e.master.connect(a);
  });
  for (const [name, at] of SPOTS) {
    await page.evaluate(async (at) => {
      const t = window.temple;
      if (t._listening) {
        t.exitListening();
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (at === 'foley') {
        t._teleport(-10.5, -6, 0);
        const e = t.sound;
        let i = 0;
        clearInterval(window._qaFoley);
        window._qaFoley = setInterval(() => {
          const k = i++ % 5;
          if (k === 0) {
            e.playFireWhoosh(); // 소각 순간: 종이 불 + 화로 불이 세진다
            e.flareBrazier(3);
          }
          else if (k === 1) e.playTeaPour();
          else if (k === 2) e.playChukbi();
          else e.playFootstep(['gravel', 'stone', 'wood', 'earth'][i % 4]);
        }, 1500);
      } else if (typeof at === 'string') {
        const { NATURE_PRESETS } = await import('./src/data/natureSounds.js');
        t.listen(NATURE_PRESETS.find((p) => p.id === at));
      } else t._teleport(at.x, at.z, 0);
    }, at);
    await page.waitForTimeout(6000); // 조각을 받고 크기가 자리 잡게
    const r = await page.evaluate(async (sec) => {
      const e = window.temple.sound;
      const buf = new Float32Array(e._qaAn.fftSize);
      let maxRed = 0, sumRed = 0, n = 0, peak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < sec * 1000) {
        const red = -e._lim.reduction;
        maxRed = Math.max(maxRed, red);
        sumRed += red;
        n++;
        e._qaAn.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => setTimeout(r, 40));
      }
      return { avg: +(sumRed / n).toFixed(2), max: +maxRed.toFixed(2), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), zone: e.zone, preset: e.preset?.id ?? null };
    }, SEC);
    const ok = r.avg < 1 && r.max < 3;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(20)} 리미터 누름 평균 ${r.avg}dB 최대 ${r.max}dB · 마스터 봉우리 ${r.peakDb}dBFS (${r.zone}${r.preset ? ' · ' + r.preset : ''})`);
  }
  console.log(errors.length ? `페이지 오류 ${errors.length}` : '페이지 오류 없음');
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
