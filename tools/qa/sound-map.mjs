// 자리별 소리 지도 — node tools/qa/sound-map.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 순환 산책로(고리)를 2m 간격으로, 쉼터·마당 벤치를 그 자리에서: 엔진의 레이어 목표 크기 × 거리 감쇠(HRTF 패너 inverse) = 들리는 크기(dB).
// 「물이 안 보이는 곳에서 물소리」·「걷는 동안 켜졌다 꺼졌다」를 찾는다: 이웃한 점 사이에 6dB 넘게 뛰면 표시
import { launch, BASE } from './lib.mjs';

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?q=low${process.env.DATE ? '&date=' + process.env.DATE : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter');
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(async () => {
    const { loop, REST_SPOTS } = await import('./src/world/trail.js');
    const { zoneAt, walkHeight } = await import('./src/world/layout.js');
    const e = window.temple.sound;
    const pts = [];
    let acc = 0;
    for (let i = 0; i < loop.pts.length; i++) {
      if (i) acc += Math.hypot(loop.pts[i].x - loop.pts[i - 1].x, loop.pts[i].z - loop.pts[i - 1].z);
      if (!pts.length || acc - pts[pts.length - 1].s >= 2) pts.push({ ...loop.pts[i], s: acc, tag: '' });
    }
    for (const r of REST_SPOTS) pts.push({ x: r.x, z: r.z, s: -1, tag: `쉼터:${r.id}` });
    // 서쪽 마당(벤치·그늘 쉼터) 가로질러 걷기: x 를 따라 1m 간격으로 두 줄
    const { L } = await import('./src/world/layout.js');
    for (const z of [-10, -25]) for (let x = L.westCourt.x0 + 0.5; x <= L.courtyard.x1 - 0.5; x += 1) pts.push({ x, z, s: -2, tag: `마당 z${z}` });
    const att = (p, pos) => {
      const d = Math.max(p.refDistance, Math.hypot(pos.x - e._lp.x, pos.y - e._lp.y, pos.z - e._lp.z));
      return p.refDistance / (p.refDistance + p.rolloffFactor * (d - p.refDistance));
    };
    const db = (v) => (v > 1e-5 ? +(20 * Math.log10(v)).toFixed(1) : null);
    const out = [];
    for (const q of pts) {
      const y = walkHeight(q.x, q.z) + 1.6;
      e.updateListener({ x: q.x, y, z: q.z }, { x: 0, y: 0, z: -1 });
      e.setZone(zoneAt(q.x, q.z));
      e._placeSources(0);
      e._mix(0);
      const L = e.L;
      const sp = L.stream.panner;
      const spos = { x: sp.positionX.value, y: sp.positionY.value, z: sp.positionZ.value };
      out.push({
        s: Math.round(q.s), x: +q.x.toFixed(1), z: +q.z.toFixed(1), tag: q.tag, zone: zoneAt(q.x, q.z),
        streamD: +e._streamDist.toFixed(1),
        stream: db(L.stream.level.gain._target * att(sp, spos) * e.natureZone.gain._target),
        pond: db(L.spring.level.gain._target * att(L.spring.panner, e.emit.pond) * e.natureZone.gain._target),
        bamboo: db(L.bamboo.level.gain._target * att(L.bamboo.panner, { x: L.bamboo.panner.positionX.value, y: L.bamboo.panner.positionY.value, z: L.bamboo.panner.positionZ.value })),
        brazier: db(L.brazier.level.gain._target * att(L.brazier.panner, e.emit.brazier)),
        chant: db(L.chant.level.gain._target * att(L.chant.panner, e.emit.chant))
      });
    }
    return out;
  });
  let prev = null;
  const jump = (a, b) => (a == null) !== (b == null) || (a != null && Math.abs(a - b) > 6);
  for (const r of rows) {
    const flag = prev && r.s !== -1 && prev.s === r.s - 2 + (r.s < 0 ? 2 : 0) && ['stream', 'pond', 'bamboo'].filter((k) => jump(prev[k], r[k])).join(',');
    console.log(`${String(r.s).padStart(4)} ${r.tag.padEnd(14)} (${String(r.x).padStart(6)},${String(r.z).padStart(6)}) ${r.zone.padEnd(10)} 계곡까지 ${String(r.streamD).padStart(5)}m  계곡 ${String(r.stream ?? '–').padStart(6)}dB  연못 ${String(r.pond ?? '–').padStart(6)}  대숲 ${String(r.bamboo ?? '–').padStart(6)}  화로 ${String(r.brazier ?? '–').padStart(6)}  독송 ${String(r.chant ?? '–').padStart(6)}${flag ? '   ← 뜀: ' + flag : ''}`);
    prev = r;
  }
} finally {
  await browser.close();
}
