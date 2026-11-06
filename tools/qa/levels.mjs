// 녹음 크기 실측 — node tools/qa/levels.mjs   (먼저 python3 .claude/devserver.py 8097, BASE=)
// 같은 엔진으로 합성음과 녹음을 OfflineAudioContext 에 따로 그려 에너지를 견준다 → 녹음 배율 = √(합성 에너지 / 녹음 에너지)
//   발소리: 재질별 12번 평균 (낙엽·눈은 흙 합성, 마루·데크는 나무 합성과)
//   행동 효과음: 동작별 12번 평균
//   대숲·화로·바람 배경: 그 레이어만 켜고 10초 (합성 루프 vs 녹음 조각 하나)
// 결과는 soundEngine.js 의 STEP_LEVEL · FOLEY_LEVEL 과 data/natureSounds.js 의 level 에 넣는다
import { launch, BASE } from './lib.mjs';

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple, null, { timeout: 90000 });
  const out = await page.evaluate(async () => {
    const E0 = window.temple.sound;
    const Engine = E0.constructor;
    const { NATURE_SHOTS, NATURE_BEDS } = await import('./src/data/natureSounds.js');
    const ext = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') ? '.m4a' : '.mp3';
    const packed = {};
    const get = async (f) => (packed[f] ||= await (await fetch(`./assets/audio/nature/${f}${ext}`)).arrayBuffer());
    let lastPeak = 0;
    const energy = (buf) => {
      let e = 0;
      lastPeak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) {
        e += v * v;
        if (Math.abs(v) > lastPeak) lastPeak = Math.abs(v);
      }
      return e;
    };
    // fn(E) 를 오프라인 엔진에서 한 번 부르고 sec 초를 그린 에너지
    const render = async (sec, setup, fn, ambience = false) => {
      const off = new OfflineAudioContext(2, 48000 * sec, 48000);
      const E = new Engine();
      E._build(off, ambience);
      E._enabled = true;
      E._base = './assets/audio/';
      await setup?.(E, off);
      fn(E, off);
      return energy(await off.startRendering());
    };
    const sprite = async (E, off, name) => {
      const d = NATURE_SHOTS[name];
      const buf = await off.decodeAudioData((await get(d.sprite || d[0])).slice(0));
      E.rec[name] = d.sprite ? { buf, n: d.n, slot: d.slot, len: d.len, last: -1 } : [buf];
    };
    const avg = async (k, sec, setup, fn) => {
      let s = 0;
      for (let i = 0; i < k; i++) s += await render(sec, setup, fn);
      return s / k;
    };
    const res = { steps: {}, foley: {}, beds: {} };
    // 발소리
    const STEPS = { gravel: ['gravel', 'FOREST'], earth: ['earth', 'FOREST'], stone: ['stone', 'FOREST'], floor: ['wood', 'DAEUNGJEON'], deck: ['wood', 'FOREST'], leaves: ['earth', 'FOREST', 10], snow: ['earth', 'FOREST', 11, 'snow'] };
    for (const [kind, [surface, zone, month = 11, weather = 'clear']] of Object.entries(STEPS)) {
      const cfg = (E) => Object.assign(E, { zone, month, weather });
      const synthSurface = kind === 'leaves' || kind === 'snow' ? 'earth' : surface;
      const es = await avg(12, 0.6, (E) => cfg(E) && Object.assign(E, { weather: 'clear', month: 11 }), (E) => E.playFootstep(synthSurface));
      const er = await avg(12, 0.8, async (E, off) => { cfg(E); await sprite(E, off, `step-${kind}`); }, (E) => E.playFootstep(surface));
      res.steps[kind] = +Math.sqrt(es / er).toFixed(3);
    }
    // 행동 효과음 (합성 함수 · 녹음 이름 · 그릴 길이)
    const FOLEY = [['playBeadClick', 'beads', 0.4], ['playStoneDrop', 'pebble', 0.8], ['playChukbi', 'chukbi', 0.6], ['playPaperRustle', 'paper', 1.0], ['playBrushStroke', 'brush', 0.6], ['playRobeRustle', 'robe', 1.1], ['playFireWhoosh', 'paperfire', 11], ['playTeaPour', 'pour', 9]];
    for (const [fn, name, sec] of FOLEY) {
      const k = sec > 5 ? 3 : 12;
      let ps = 0, pr = 0;
      const es = await avg(k, Math.max(sec, 2.8), null, (E) => { E[fn](); });
      ps = lastPeak;
      const er = await avg(k, sec, (E, off) => sprite(E, off, name), (E) => E[fn]());
      pr = lastPeak;
      // 길이가 다른 소리(종이 불 10초 vs 합성 2.6초)는 같은 시간 동안의 평균 크기로 견준다. 봉우리 비(peak)도 함께
      res.foley[name] = { rms: +Math.sqrt((es / Math.max(sec, 2.8)) / (er / sec)).toFixed(3), peak: +(ps / pr).toFixed(3) };
    }
    // 낙숫물·소쩍새: 합성 vs 녹음 (같은 함수 경로)
    for (const [name, sec, synth, rec] of [
      ['drip', 0.5, (E) => E._drip(0.01), (E) => E._drip(0.01)],
      ['scops', 14, (E) => E._owl(0.1), (E) => E._farCall(E.rec.scops, 0.1, 0.9)]
    ]) {
      const es = await avg(6, sec, null, synth);
      const er = await avg(6, sec, (E, off) => sprite(E, off, name), rec);
      res.foley[name] = +Math.sqrt(es / er).toFixed(3);
    }
    // 배경 (합성 레이어가 있는 것): 그 레이어만 1, 합성 vs 녹음 조각 (level 1 로)
    const BEDS = { bamboo: 'bamboo-juknok-1', fire: 'fire-camp-1', wind: 'wind-pine-1' };
    for (const [bed, piece] of Object.entries(BEDS)) {
      const def = NATURE_BEDS[bed];
      const only = (E, src) => {
        for (const L of Object.values(E.L)) L.level?.gain.setValueAtTime(0, 0);
        const L = E.L[def.layer];
        L.level.gain.setValueAtTime(1, 0);
        L.synth.gain.setValueAtTime(src === 'synth' ? 1 : 0, 0);
        L.rec.gain.setValueAtTime(src === 'rec' ? 1 : 0, 0);
        if (L.panner) for (const k of ['positionX', 'positionY', 'positionZ']) L.panner[k].value = 0; // 듣는 자리 위 (거리 감쇠 없이)
        E._lp = { x: 0, y: 0, z: 0 };
        E.ctx.listener.positionX && (E.ctx.listener.positionX.value = 0, E.ctx.listener.positionY.value = 0, E.ctx.listener.positionZ.value = 0);
      };
      const es = await render(10, (E) => only(E, 'synth'), () => {}, true);
      const ps = lastPeak;
      const er = await render(10, async (E, off) => {
        only(E, 'rec');
        const b = E._natureBed(bed, { ...def, level: 1 });
        b.buffer = await off.decodeAudioData((await get(piece)).slice(0));
        E._bedChunk(b, 0, 5);
      }, () => {}, true);
      // 봉우리가 큰 녹음(모닥불 탁 소리)은 평균 크기로 맞추면 봉우리가 리미터를 누른다 → 평균·봉우리 중 작은 쪽
      res.beds[bed] = { rms: +Math.sqrt(es / er).toFixed(3), peak: +(ps / lastPeak).toFixed(3) };
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
