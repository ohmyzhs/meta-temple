// 맑은 낮 검사 (Task C2) — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/day.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080. 스크린샷은 MCP 작업 폴더 기준 OUT.
// 기준 (1280×800, 맑음, 13시 · 9시·16.4시는 참고로 함께 출력): night.mjs 와 같은 세 구도
//   (a) 하늘 영역 평균 채도(HSV S) ≥ 0.35                                  — 바깥 두 구도
//   (b) 먼 산 대비: 산(지형·원경 능선) 윤곽 바로 위 하늘 띠와 바로 아래 산 띠의 루마 차 ≥ BASE — 바깥 두 구도
//       BASE = 바꾸기 전(bc97ddb) 13시 값: 산문 0.0974, 마당 0.0531
//   (c) 과포화(루마 > 0.98) 픽셀 ≤ 3%                                      — 세 구도
async (page) => {
  const OUT = '.playwright-mcp/qa/day';
  const BASE = { gate: 0.0974, courtyard: 0.0531 };
  const HOURS = [13, 9, 16.4];
  await page.setViewportSize({ width: 1280, height: 800 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.temple, W = t.world;
    t._loop = () => {};
    const THREE = await import('three');
    const Wd = 1280, Ht = 800;
    const cv = Object.assign(document.createElement('canvas'), { width: Wd, height: Ht });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let clock = 80;
    const frames = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    const grab = (render) => { render(); ctx.clearRect(0, 0, Wd, Ht); ctx.drawImage(W.renderer.domElement, 0, 0, Wd, Ht); return ctx.getImageData(0, 0, Wd, Ht).data; };
    const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const plain = () => W.renderer.render(W.scene, W.camera);
    // 두 가지 단색으로 바꿔 그려 달라진 픽셀 = 그 물체가 보이는 곳
    const keyMask = (objs, depthWrite) => {
      const key = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, depthWrite, fog: false });
      const keep = objs.map((o) => o.material);
      objs.forEach((o) => (o.material = key(0xff00ff))); const a = grab(plain);
      objs.forEach((o) => (o.material = key(0x00ff00))); const b = grab(plain);
      objs.forEach((o, i) => (o.material = keep[i]));
      const mask = new Uint8Array(Wd * Ht);
      for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) > 120 ? 1 : 0;
      return mask;
    };
    const hills = [...W.terrain.ground, ...W.terrain.ridges]; // 산자락 지형 + 원경 능선
    window.__qa = {
      setHour(h) {
        W.timeMode = 'fixed';
        W.hour = W.hourTarget = h;
        W.setWeather('clear');
        W.weather.rainU.uAmount.value = 0;
        W.weather.snowU.uAmount.value = 0;
        W.wet = W.snow = 0;
        W.applyEnv(true);
      },
      shot(s) {
        t.avatars.teleport(s.player[0], s.player[1], Math.PI);
        W.setShot({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), dur: 1e9 }, true);
        document.querySelector('#hud').style.opacity = 0;
        document.querySelector('.toast-stack')?.style.setProperty('opacity', '0');
        document.querySelectorAll('.name-label').forEach((e) => (e.style.visibility = 'hidden'));
        frames(24);
      },
      measure({ outdoor }) {
        const img = grab(() => frames(1));
        const n = Wd * Ht;
        let sum = 0, clip = 0;
        for (let p = 0; p < n; p++) { const l = luma(img, p * 4); sum += l; if (l > 0.98) clip++; }
        const out = { mean: +(sum / n).toFixed(4), clip: +((clip / n) * 100).toFixed(2) };
        if (outdoor) {
          const sky = keyMask([W.sky], false), ridge = keyMask(hills, true);
          const L = (x, y) => luma(img, (y * Wd + x) * 4);
          let ss = 0, sn = 0;
          for (let p = 0, i = 0; p < n; p++, i += 4) {
            if (!sky[p]) continue;
            const mx = Math.max(img[i], img[i + 1], img[i + 2]), mn = Math.min(img[i], img[i + 1], img[i + 2]);
            ss += mx ? (mx - mn) / mx : 0; sn++;
          }
          out.skySat = sn ? +(ss / sn).toFixed(4) : null;
          out.skyPx = sn;
          // 먼 산 능선: 산 픽셀인데 바로 위가 하늘
          let cs = 0, cn = 0;
          for (let x = 0; x < Wd; x += 2) {
            for (let y = 12; y < Ht - 12; y++) {
              const p = y * Wd + x;
              if (!(ridge[p] && sky[p - Wd])) continue;
              let ls = 0, ns = 0, lr = 0, nr = 0;
              for (let k = 3; k <= 9; k++) {
                if (sky[p - k * Wd]) { ls += L(x, y - k); ns++; }
                if (ridge[p + k * Wd]) { lr += L(x, y + k); nr++; }
              }
              if (ns >= 4 && nr >= 4) { cs += Math.abs(ls / ns - lr / nr); cn++; }
            }
          }
          out.ridge = cn ? +(cs / cn).toFixed(4) : null;
          out.ridgePx = cn;
        }
        frames(1);
        return out;
      }
    };
  });

  const gx = await page.evaluate(async () => (await import('/src/world/layout.js')).L.gate.x);
  const SHOTS = [
    { name: 'gate', outdoor: true, player: [gx + 0.6, 40.5], pos: [gx + 0.6, 2.3, 38.5], look: [gx, 6.0, 26] },
    { name: 'courtyard', outdoor: true, player: [5.2, 4.4], pos: [5.0, 2.1, 2.6], look: [1, 6.5, -16] },
    { name: 'hall', outdoor: false, player: [1.5, -20.8], pos: [1.2, 4.7, -21.0], look: [0, 4.2, -28.4] }
  ];
  const rows = [];
  let pass = true;
  for (const h of HOURS) {
    for (const s of SHOTS) {
      await page.evaluate(([h, s]) => { window.__qa.setHour(h); window.__qa.shot(s); }, [h, s]);
      const r = await page.evaluate((o) => window.__qa.measure(o), { outdoor: s.outdoor });
      await page.screenshot({ path: `${OUT}/day-${s.name}-${String(h).replace('.', '_').padStart(2, '0')}h.png` });
      const ok = {
        a: !s.outdoor || (r.skySat ?? 0) >= 0.35,
        b: !s.outdoor || (r.ridge ?? 0) >= BASE[s.name],
        c: r.clip <= 3
      };
      const all = Object.values(ok).every(Boolean);
      if (h === 13) pass &&= all;
      rows.push(`${String(h).padStart(4)}h ${s.name.padEnd(9)} ${h === 13 ? (all ? 'PASS' : 'FAIL') : '(참고)'} mean ${r.mean} | 과포화 ${r.clip}%${ok.c ? '' : '✗'}` +
        (s.outdoor ? ` | 하늘 채도 ${r.skySat}${ok.a ? '' : '✗'} (${r.skyPx}px) | 먼 산 대비 ${r.ridge}${ok.b ? '' : '✗'} (기준 ${BASE[s.name]}, ${r.ridgePx}px)` : ''));
    }
  }
  return `day.mjs ${pass ? 'PASS' : 'FAIL'}\n` + rows.join('\n');
}
