// 밤 조명·밤하늘 성능 — node tools/qa/night-perf.mjs   (먼저 python3 .claude/devserver.py 8093 → BASE=http://localhost:8093)
// avatar-perf.mjs 와 같은 방법: 루프를 멈추고 t._frame() 40회, 매번 1px readPixels 로 GPU 완료까지 기다린 시간의 중앙값 (주사율 상한 없음).
// 22시 맑음, 자리 셋(산문 앞·산책로 연등탑 옆·마당)에서 켬/끔을 견준다:
//   all          지금 그대로 (연등탑 점광원 2 + 법당 채움 반구광 + 별지도·점 별)
//   -towerLights 연등탑 점광원 2 를 끈다 (점광원 10 → 8: 모든 재질의 빛 반복이 줄어든다 — 재컴파일 한 번 뒤 잰다)
//   -sky         별지도·점 별을 끈다
// 헤드리스 GPU 수치라 실기기 절대값이 아니라 상대 비교용.
import { launch, BASE } from './lib.mjs';

const VIEWS = [{ w: 390, h: 844, q: 'low', mobile: true }, { w: 1280, h: 800, q: 'high' }];
const browser = await launch();
const rows = [];
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: !!v.mobile, isMobile: !!v.mobile, locale: 'ko-KR' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?q=${v.q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 120000 });
    await page.click('#intro-enter');
    await page.waitForFunction(() => window.temple.entered && window.temple.avatars, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    // 밤하늘 받기를 기다린다
    await page.evaluate(() => { const W = window.temple.world; W.timeMode = 'fixed'; W.hour = W.hourTarget = 22; W.setWeather('clear'); W.applyEnv(true); });
    await page.waitForFunction(() => window.temple.world.nightSky.points, null, { timeout: 30000 }).catch(() => {});
    const res = await page.evaluate(async () => {
      const t = window.temple, W = t.world;
      t._loop = () => {};
      t.avatars.solo = true;
      const gl = W.renderer.getContext(), px = new Uint8Array(4);
      let clock = 300;
      const frame = () => { t._frame(1 / 30, (clock += 1 / 30)); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      const ms = () => {
        for (let i = 0; i < 8; i++) frame(); // 재컴파일·데움
        const a = [];
        for (let i = 0; i < 40; i++) { const t0 = performance.now(); frame(); a.push(performance.now() - t0); }
        a.sort((x, y) => x - y);
        return +a[20].toFixed(2);
      };
      const site = W.towers.sites.find((s) => Math.hypot(s.x, s.z - 36) > 20) || W.towers.sites[0];
      const SPOTS = { spawn: [0, 36], tower: [site.x + 2, site.z + 2], court: [0, 2] };
      const set = (k, on) => {
        if (k === 'towerLights') W.towers.lights.forEach((l) => (l.visible = on));
        if (k === 'sky') { if (W.nightSky.points) W.nightSky.points.visible = on; W.skyMat.uniforms.uMilky.value = on ? 1 : 0; }
      };
      const out = {};
      for (const [name, [x, z]] of Object.entries(SPOTS)) {
        t.avatars.teleport(x, z, Math.PI);
        W.snapCameraTo(0, 0.32, 7.5);
        const r = { all: ms() };
        for (const k of ['towerLights', 'sky']) { set(k, false); r['-' + k] = ms(); set(k, true); }
        const info = W.renderer.info;
        r.calls = info.render.calls;
        out[name] = r;
      }
      return { out, points: W.scene.children.filter((o) => o.isPointLight && o.visible).length };
    });
    rows.push(`${v.q} ${v.w}×${v.h} (점광원 ${res.points}) ` + Object.entries(res.out).map(([k, r]) => `${k}: ${r.all}ms (빛 끔 ${r['-towerLights']}, 하늘 끔 ${r['-sky']})`).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('night-perf.mjs (중앙 ms/frame, 22시)\n' + rows.join('\n'));
