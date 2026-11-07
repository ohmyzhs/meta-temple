// 화로 타닥 소리 검사 — node tools/qa/brazier.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 화로(마당 서쪽)에서 거리를 바꿔 서서 14초씩: 화로 레이어 크기와 전체(마스터) 크기를 재어 화로가 차지하는 비중(dB)을 본다.
// 기준(사용자 2026-11-06 「화로 가까이 가면 타닥타닥 불타는 소리가 들리게」): 3~5m 에서 화로가 전체의 -6dB 위(분명히 들림), 15m 넘으면 -20dB 아래(사라짐)
import { launch, enter } from './lib.mjs';

const browser = await launch();
let failed = 0;
try {
  const { page, errors } = await enter(browser, [1280, 800]);
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const e = window.temple.sound;
    const mk = (node) => {
      const a = e.ctx.createAnalyser();
      a.fftSize = 4096;
      node.connect(a);
      return a;
    };
    e._qaB = mk(e.L.brazier.level);
    e._qaM = mk(e.master);
    window.temple.world.cam.mode = 'first'; // 듣는 자리 = 내 자리 (3인칭 카메라는 몇 m 뒤에 있다)
  });
  const res = [];
  for (const dx of [2, 4, 6, 10, 15, 20]) {
    const r = await page.evaluate(async (dx) => {
      const t = window.temple, e = t.sound;
      t._place(-12 + dx, -7, -Math.PI / 2);
      await new Promise((ok) => setTimeout(ok, 4000)); // 자리 잡고 녹음이 붙게
      const bb = new Float32Array(4096), mb = new Float32Array(4096);
      let sb = 0, sm = 0, n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 14000) {
        e._qaB.getFloatTimeDomainData(bb);
        e._qaM.getFloatTimeDomainData(mb);
        for (let i = 0; i < bb.length; i++) {
          sb += bb[i] * bb[i];
          sm += mb[i] * mb[i];
        }
        n += bb.length;
        await new Promise((ok) => setTimeout(ok, 90));
      }
      // 화로 레이어는 패너 앞이라 버스·마스터 배율을 곱해 마스터 기준으로 맞춘다
      const k = e.bus.temple.gain.value * e.master.gain.value;
      const b = Math.sqrt(sb / n) * k, m = Math.sqrt(sm / n);
      return { d: +e._src.brazier.d.toFixed(1), brazierDb: +(20 * Math.log10(b || 1e-9)).toFixed(1), totalDb: +(20 * Math.log10(m || 1e-9)).toFixed(1), share: +(20 * Math.log10((b || 1e-9) / (m || 1e-9))).toFixed(1), rec: !!e.rec.fire || (e._nbeds || []).some((x) => x.name === 'fire' && x.on) };
    }, dx);
    res.push(r);
    console.log(`  화로까지 ${String(r.d).padStart(5)}m  화로 ${r.brazierDb}dB · 전체 ${r.totalDb}dB · 화로 비중 ${r.share}dB${r.rec ? ' (녹음)' : ' (합성)'}`);
  }
  const near = res.filter((r) => r.d >= 2.5 && r.d <= 5.5);
  const far = res.filter((r) => r.d >= 15);
  const okNear = near.length && near.every((r) => r.share > -6);
  const okFar = far.every((r) => r.share < -20);
  if (!okNear) failed++;
  if (!okFar) failed++;
  console.log(`${okNear ? '✓' : '✗'} 3~5m 에서 화로가 분명히 들린다 (비중 > -6dB)`);
  console.log(`${okFar ? '✓' : '✗'} 15m 넘으면 사라진다 (비중 < -20dB)`);
  // 번뇌 소각: flareBrazier(3) — 타닥 레이어 목표 크기가 곧바로 커졌다가 3초 뒤 처음으로
  const fl = await page.evaluate(async () => {
    const t = window.temple, e = t.sound;
    t._place(-8, -7, -Math.PI / 2);
    await new Promise((ok) => setTimeout(ok, 2500));
    const g = () => e.L.brazier.level.gain._target;
    const before = g();
    e.flareBrazier(3);
    await new Promise((ok) => setTimeout(ok, 300));
    const peak = g();
    await new Promise((ok) => setTimeout(ok, 3500));
    return { before, peak, after: g() };
  });
  const okFlare = fl.peak > fl.before * 1.6 && Math.abs(fl.after - fl.before) < fl.before * 0.15;
  if (!okFlare) failed++;
  console.log(`${okFlare ? '✓' : '✗'} flareBrazier(3): 화로 크기 ×${(fl.peak / fl.before).toFixed(2)} → 3.5초 뒤 ×${(fl.after / fl.before).toFixed(2)}`);
  console.log(errors.length ? `페이지 오류 ${errors.length}` : '페이지 오류 없음');
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
