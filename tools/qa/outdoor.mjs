// 바깥 실사(?world=real) 전후 비교 — 같은 자리·같은 시각에서 성능을 재고 스크린샷을 찍는다.
//   node tools/qa/outdoor.mjs perf  BASE OUTDIR [query]     → OUTDIR/perf.json
//   node tools/qa/outdoor.mjs shots BASE OUTDIR [query] [WxH] → OUTDIR/*.png
// BASE 예: http://localhost:8191 (변경 전 트리) · http://localhost:8190 (이 브랜치). query 예: world=real
// 같은 화면이 나오게 Math.random 을 고정 씨앗으로 바꾸고, _frame 에 같은 t 를 넘긴다. 도반(실시간 서버)은 끈다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib.mjs';

const [mode, BASE, OUT, query = '', size = '1280x800'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const SEED = () => {
  let s = 1234567;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  window.TEMPLE_CONFIG = { liveUrl: 'http://127.0.0.1:59999' }; // 실시간 서버 없음
};

async function open(browser, w, h, q) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|127\.0\.0\.1:59999|WebSocket/.test(m.text()) && errors.push(m.text()));
  const t0 = Date.now();
  await page.goto(`${BASE}/?q=${q}${query ? '&' + query : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
  const bootMs = Date.now() - t0;
  await page.click('#intro-enter');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('hidden'), null, { timeout: 10000 });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '#toast-stack{visibility:hidden!important} #hud{opacity:0!important;transition:none!important} .name-label{visibility:hidden!important}';
    document.head.appendChild(st);
    const t = window.temple;
    window.__view = (o = {}) => {
      const W = t.world;
      if (o.time) {
        W.setTimeOfDay(o.time);
        W.hour = W.hourTarget;
      }
      if (o.pos) t.avatars.teleport(o.pos[0], o.pos[1], o.ry ?? Math.PI);
      if (o.yaw != null) W.cam.yaw = o.yaw;
      if (o.pitch != null) W.cam.pitch = o.pitch;
      if (o.dist != null) W.cam.targetDist = W.cam.dist = o.dist;
      W.applyEnv(true);
      for (let i = 0; i < (o.frames || 50); i++) t._frame(1 / 30, 80 + i / 30);
    };
  });
  // 바깥 실사 에셋이 다 도착할 때까지 (플래그가 꺼져 있으면 바로)
  await page.waitForFunction(() => !window.temple.world.outdoorReady || window.temple.world.outdoorReady.done, null, { timeout: 120000 }).catch(() => errors.push('outdoor assets timeout'));
  return { ctx, page, errors, bootMs };
}

const trailViews = () =>
  import('./src/world/trail.js').then(({ trail }) => {
    const at = (s, back = 0, pitch = 0.2, dist = 7) => {
      const p = trail.at(s), q = trail.at(s + 1);
      const h = Math.atan2(q.x - p.x, q.z - p.z);
      return { pos: [p.x, p.z], ry: h, yaw: h - Math.PI + back, pitch, dist };
    };
    return {
      t01_deck_entry: at(14),
      t02_deck_deep: at(45, 0.3),
      t03_deck_bend: at(70, -0.3),
      t04_bridge: at(90, 0, 0.25),
      t05_west_forest: at(125),
      t06_west_climb: at(158, 0.2),
      t07_ridge: at(212, 0.6, 0.3, 8),
      t08_bamboo_east: at(272),
      t09_stream_north: at(318),
      t10_stones: at(330, 0, 0.3),
      t11_se_forest: at(372),
      t12_se_south: at(400, 0.3),
      g01_gate: { pos: [0, 38], ry: Math.PI, yaw: 0, pitch: 0.12, dist: 8 },
      g02_court_w: { pos: [0, -2], ry: -Math.PI / 2, yaw: Math.PI / 2, pitch: 0.12, dist: 8 },
      g03_court_s: { pos: [0, -12], ry: 0, yaw: -Math.PI, pitch: 0.12, dist: 8 }
    };
  });

const PERF_SPOTS = {
  spawn: { pos: [0, 36], ry: Math.PI, yaw: 0 },
  court: { pos: [0, 2], ry: Math.PI, yaw: 0 },
  deck: { s: 45 },
  westForest: { s: 125 },
  lookout: { pos: [3, -49.5], ry: 0, yaw: Math.PI },
  bambooEast: { s: 272 },
  stones: { s: 330 }
};

async function perf(browser) {
  const out = {};
  for (const [w, h, q] of [[390, 844, 'high'], [390, 844, 'low'], [1280, 800, 'high']]) {
    const { ctx, page, errors, bootMs } = await open(browser, w, h, q);
    const key = `${w}x${h}@${q}`;
    const net = await page.evaluate(() => {
      const r = performance.getEntriesByType('resource'), n = performance.getEntriesByType('navigation')[0];
      const sum = r.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0) + (n?.transferSize || 0);
      const outdoor = r.filter((e) => e.name.includes('/assets/world/outdoor/')).reduce((a, e) => a + (e.encodedBodySize || 0), 0);
      return { firstEntryMB: +(sum / 1e6).toFixed(2), outdoorMB: +(outdoor / 1e6).toFixed(2), requests: r.length };
    });
    const renderer = await page.evaluate(() => {
      const gl = window.temple.world.renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    out[key] = { renderer, bootMs, ...net, errors, spots: {} };
    for (const [name, v] of Object.entries(PERF_SPOTS)) {
      out[key].spots[name] = await page.evaluate(async (v) => {
        const t = window.temple, W = t.world, R = W.renderer;
        if (v.s != null) {
          const { trail } = await import('./src/world/trail.js');
          const p = trail.at(v.s), q2 = trail.at(v.s + 1), hd = Math.atan2(q2.x - p.x, q2.z - p.z);
          v = { pos: [p.x, p.z], ry: hd, yaw: hd - Math.PI };
        }
        window.__view({ time: 'day', ...v, pitch: 0.25, dist: 7.5, frames: 30 });
        await new Promise((r) => setTimeout(r, 800));
        const gl = R.getContext(), px = new Uint8Array(4);
        for (let i = 0; i < 10; i++) t._frame(1 / 60, 90 + i / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const ms = [];
        for (let k = 0; k < 5; k++) {
          const t1 = performance.now();
          for (let i = 0; i < 12; i++) t._frame(1 / 60, 100 + (k * 12 + i) / 60);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          ms.push((performance.now() - t1) / 12);
        }
        ms.sort((a, b) => a - b);
        R.info.autoReset = false;
        R.info.reset();
        W.render();
        const calls = R.info.render.calls, tris = R.info.render.triangles;
        R.info.autoReset = true;
        const ts = [];
        await new Promise((res) => {
          const f = (now) => (ts.push(now), ts.length < 90 ? requestAnimationFrame(f) : res());
          requestAnimationFrame(f);
        });
        const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b);
        return { msPerFrame: +ms[2].toFixed(2), calls, ktris: Math.round(tris / 1000), fps: +(1000 / d[d.length >> 1]).toFixed(0) };
      }, v);
    }
    await ctx.close();
  }
  writeFileSync(`${OUT}/perf.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

async function shots(browser) {
  const [w, h] = size.split('x').map(Number);
  const { ctx, page, errors } = await open(browser, w, h, 'high');
  // 앱 자체 루프를 멈춘다: 화면은 __view 가 같은 t 로 _frame 을 불러서만 바뀐다 (전후 픽셀 비교가 되게)
  await page.evaluate(async () => {
    window.temple._loop = () => {};
    await new Promise((r) => setTimeout(r, 300));
  });
  const views = await page.evaluate(trailViews);
  const times = (process.env.TIMES || 'day').split(',');
  for (const time of process.env.TRAIL === '0' ? [] : times) {
    for (const [n, v] of Object.entries(views)) {
      if (time !== 'day' && !/t02|t07|t10|g01/.test(n)) continue; // 해질녘·밤은 몇 장만 (시각 이름은 PRESET_HOURS: dawn·day·sunset·night)
      await page.evaluate((v) => window.__view({ ...v, frames: 60 }), { ...v, time });
      if (time !== 'day') {
        // 해질녘·밤 원경 그림은 그 시각이 되어야 받는다 (outdoor.js) — 도착할 틈
        await page.waitForTimeout(500);
        await page.evaluate((v) => window.__view({ ...v, frames: 10 }), { ...v, time });
      }
      await page.screenshot({ path: `${OUT}/${n}_${time}.png` });
    }
  }
  // 쉼터 1인칭 (예불 듣기 화면) — 낮
  const ids = await page.evaluate(() => window.temple.temple.trail.spots.map((s) => s.id));
  for (const [k, id] of ids.entries()) {
    if (process.env.REST === '0') break;
    for (const time of times) {
      if (time !== 'day' && !/lookout|mat_ridge|bench_bamboo|spring/.test(id)) continue;
      await page.evaluate(async ([id, time]) => {
        const t = window.temple, s = t.temple.trail.spots.find((q) => q.id === id);
        if (t._listening) {
          t.exitListening();
          await new Promise((r) => setTimeout(r, 1200));
        }
        window.__view({ time, frames: 2 });
        t.avatars.teleport(s.stand.x, s.stand.z, s.ry);
        t._sitRest(s);
        for (let i = 0; i < 300 && !t.player.sitting; i++) t._frame(1 / 30, 200 + i / 30);
        const { YEBUL_TRACKS } = await import('./src/data/credits.js');
        t.listen(YEBUL_TRACKS[1]);
        await new Promise((r) => setTimeout(r, 2600));
        t._listening && (t._listening.t = 0);
        // 시각을 다시 맞추고, 비동기로 받는 쉼터 경치가 들어올 틈을 주며 프레임을 돌린다
        const W = t.world;
        W.setTimeOfDay(time);
        W.hour = W.hourTarget;
        W.applyEnv(true);
        for (let k = 0; k < 6; k++) {
          for (let i = 0; i < 15; i++) t._frame(1 / 30, 400 + (k * 15 + i) / 30);
          await new Promise((r) => setTimeout(r, 120));
        }
      }, [id, time]);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/r${String(k).padStart(2, '0')}_${id}_${time}.png` });
    }
  }
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 1));
  console.log('shots', OUT, 'errors', errors.length, errors.slice(0, 5));
  await ctx.close();
}

const browser = await launch();
try {
  await (mode === 'perf' ? perf(browser) : shots(browser));
} finally {
  await browser.close();
}
