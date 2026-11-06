// 물 없는 곳 검사 — node tools/qa/no-water.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 사용자 2026-11-06 「물길 근처가 아니면 물소리가 절대로 나면 안 된다」
// 물길에서 가장 먼 산책로(계곡까지 68m)에 60초 서서: 물 레이어(계곡·샘물·개구리)의 실제 출력이 0 인지,
// 그동안 산 어디서나 나는 원샷(돌풍·밤새·범종)이 무엇이었는지 적는다. 그 원샷들의 녹음에 물이 없는지는 tools/audio/water_check.py
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (n, ok, x = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
try {
  const { page, errors } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(async () => {
    const t = window.temple, e = t.sound;
    window.temple.world.cam.mode = 'first';
    await new Promise((ok) => t._teleport(10.3, -50.6, 0, ok));
    await new Promise((ok) => setTimeout(ok, 5000));
    const WATER = ['stream', 'spring', 'frogs'];
    const an = Object.fromEntries(WATER.map((k) => { const a = e.ctx.createAnalyser(); a.fftSize = 2048; e.L[k].level.connect(a); return [k, a]; }));
    const peak = Object.fromEntries(WATER.map((k) => [k, 0]));
    const shots = {};
    const orig = { gust: e._playGust.bind(e), far: e._farCall.bind(e) };
    e._playGust = (...a) => { shots.gust = (shots.gust || 0) + 1; return orig.gust(...a); };
    e._farCall = (recs, ...a) => { const k = Object.keys(e.rec).find((n) => e.rec[n] === recs) || '?'; shots[k] = (shots[k] || 0) + 1; return orig.far(recs, ...a); };
    const buf = new Float32Array(2048);
    const t0 = performance.now();
    while (performance.now() - t0 < 60000) {
      for (const k of WATER) {
        an[k].getFloatTimeDomainData(buf);
        for (const v of buf) peak[k] = Math.max(peak[k], Math.abs(v));
      }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    const dStream = e._src?.stream?.d;
    return { zone: e.zone, weather: e._weather(), time: e._time(), month: e._month(), dStream: dStream && +dStream.toFixed(1), peak, shots, beds: e.playing().map((b) => `${b.bed}:${b.level}`).join(' ') };
  });
  console.log(`  자리 (${r.zone}) 계곡까지 ${r.dStream}m · ${r.month}월 ${r.time} · 날씨 ${r.weather}`);
  console.log(`  배경 ${r.beds || '(없음)'} · 원샷 ${JSON.stringify(r.shots)}`);
  for (const [k, v] of Object.entries(r.peak)) check(`${k} 출력 없음`, v === 0, v ? `봉우리 ${(20 * Math.log10(v)).toFixed(1)}dB` : '0');
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
