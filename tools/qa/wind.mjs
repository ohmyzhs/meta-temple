// 바람 검사 — node tools/qa/wind.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 사용자 2026-11-06 「바람소리가 너무 크다. 모든 바람은 간헐적으로만」:
//   (a) 돌풍이 없을 때 바람 레이어는 조용하다 (늘 깔리는 바람 없음)
//   (b) 돌풍이 지나갈 때 가장 센 0.1초도 나머지 소리 전체(돌풍 없을 때의 마스터)보다 크지 않다
// 자리: 산문(들어온 자리), 마당. 지금 날짜·시각(밤이면 풀벌레뿐이라 돌풍이 가장 도드라진다)
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};
try {
  const { page, errors } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(9000); // 페이드인 + 산문 배경·돌풍 녹음 받기
  await page.evaluate(() => {
    const e = window.temple.sound;
    const mk = (node) => {
      const a = e.ctx.createAnalyser();
      a.fftSize = 4096; // 48kHz 에서 85ms
      node.connect(a);
      return a;
    };
    e._qaW = mk(e.L.wind.level);
    e._qaM = mk(e.master);
    window.temple.world.cam.mode = 'first';
  });
  for (const [where, pos] of [['산문', null], ['마당', [0, 0]]]) {
    const r = await page.evaluate(async (pos) => {
      const t = window.temple, e = t.sound;
      if (pos) t._teleport(pos[0], pos[1], 0);
      const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const rms = (a, buf) => {
        a.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        return Math.sqrt(s / buf.length);
      };
      const wb = new Float32Array(4096), mb = new Float32Array(4096);
      // 바람 레이어 → 마스터 배율 (자연음 버스 · 바깥 비율 · 마스터)
      const k = () => e.bus.nature.gain.value * e.natureZone.gain.value * e.master.gain.value;
      const db = (x) => +(20 * Math.log10(x || 1e-9)).toFixed(1);
      e._gustRecNext = 1e9; // 저절로 오는 돌풍은 막고
      await wait(9000); // 지나가던 돌풍이 끝나게
      let sw = 0, sm = 0, n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 10000) {
        sw += rms(e._qaW, wb) ** 2;
        sm += rms(e._qaM, mb) ** 2;
        n++;
        await wait(85);
      }
      const quietWind = Math.sqrt(sw / n) * k(), rest = Math.sqrt(sm / n);
      // 돌풍 4번 (세기는 0.55~1 무작위 → 가장 센 것)
      let peak = 0;
      for (let i = 0; i < 4; i++) {
        e._playGust(e.ctx.currentTime + 0.1);
        const t1 = performance.now();
        while (performance.now() - t1 < 8500) {
          peak = Math.max(peak, rms(e._qaW, wb) * k());
          await wait(85);
        }
      }
      e._gustRecNext = 0;
      return { zone: e.zone, gusts: (e.rec.gust || []).length, quietWindDb: db(quietWind), restDb: db(rest), gustPeakDb: db(peak), over: +(db(peak) - db(rest)).toFixed(1), layer: +e.L.wind.level.gain._target.toFixed(3) };
    }, pos);
    console.log(`  ${where} (${r.zone}) 바람 레이어 ${r.layer} · 돌풍 녹음 ${r.gusts}개 · 돌풍 없을 때 바람 ${r.quietWindDb}dB · 나머지 ${r.restDb}dB · 돌풍 봉우리 ${r.gustPeakDb}dB (나머지보다 ${r.over > 0 ? '+' : ''}${r.over}dB)`);
    check(`${where}: 돌풍 없을 때 바람 없음`, r.gusts > 0 && r.quietWindDb < -70, `${r.quietWindDb}dB`);
    check(`${where}: 돌풍이 나머지 소리보다 크지 않음`, r.over <= 0, `${r.over}dB`);
  }
  check('페이지 오류 없음', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
