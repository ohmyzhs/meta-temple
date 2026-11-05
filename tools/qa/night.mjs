// 밤 화면 검사 (Task C1) — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/night.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080 (python3 .claude/devserver.py 8080).
// 스크린샷은 MCP 작업 폴더 기준 OUT 에 남는다.
// 기준 (1280×800, 맑음): 세 구도 × 0·2·22시
//   (a) 화면 평균 루마 ≥ 같은 구도 13시 평균의 18%
//   (b) 지붕선 국소 대비(지붕 윗선 바로 위 띠 vs 바로 아래 지붕 띠, 루마 차) ≥ 0.06     — 바깥 두 구도
//   (c) 하늘 영역에서 루마 0.6 이상 별 픽셀 ≥ 300 (달 둘레 6°·넓게 번진 블룸 제외)      — 바깥 두 구도
//   (d) 은하수 띠(대원 ±5°) 평균 루마 > 주변 하늘(띠에서 12~25°), 은하수만 끈 화면과의 차도 띠 > 주변 — 바깥 두 구도
async (page) => {
  const OUT = '.playwright-mcp/qa/night';
  const HOURS = [0, 2, 22];
  await page.setViewportSize({ width: 1280, height: 800 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.evaluate(async () => {
    document.querySelector('#intro-enter').click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.temple, W = t.world;
    t._loop = () => {}; // 실시간 루프를 멈추고 프레임을 직접 돌린다 (가려진 창의 rAF 는 2fps)
    const THREE = await import('three');
    const { mats } = await import('/src/world/materials.js');
    const m = mats();
    const roofMats = new Set([m.roofTop, m.roofUnder, m.roofEdge, m.ridge, m.ridgeWhite]);
    const Wd = 1280, Ht = 800;
    const cv = Object.assign(document.createElement('canvas'), { width: Wd, height: Ht });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let clock = 80;
    const frames = (n) => { for (let i = 0; i < n; i++) t._frame(1 / 30, (clock += 1 / 30)); };
    const grab = (render) => { render(); ctx.clearRect(0, 0, Wd, Ht); ctx.drawImage(W.renderer.domElement, 0, 0, Wd, Ht); return ctx.getImageData(0, 0, Wd, Ht).data; };
    const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const plain = () => W.renderer.render(W.scene, W.camera);
    // 하늘 마스크: 하늘 돔만 두 가지 단색으로 바꿔 그려 달라진 픽셀 = 하늘
    const skyMask = () => {
      const keep = W.sky.material;
      const key = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, depthWrite: false, fog: false });
      W.sky.material = key(0xff00ff); const a = grab(plain);
      W.sky.material = key(0x00ff00); const b = grab(plain);
      W.sky.material = keep;
      const mask = new Uint8Array(Wd * Ht);
      for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) > 120 ? 1 : 0;
      return mask;
    };
    // 보이는 지붕 마스크: 지붕 재질만 두 가지 단색으로 바꿔 그려 달라진 픽셀 = 앞이 가리지 않은 지붕
    const roofMask = () => {
      const swap = [];
      W.scene.traverse((o) => o.isMesh && !Array.isArray(o.material) && roofMats.has(o.material) && swap.push([o, o.material]));
      const key = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
      const ka = key(0xff00ff), kb = key(0x00ff00);
      swap.forEach(([o]) => (o.material = ka)); const a = grab(plain);
      swap.forEach(([o]) => (o.material = kb)); const b = grab(plain);
      swap.forEach(([o, mt]) => (o.material = mt));
      const mask = new Uint8Array(Wd * Ht);
      for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) > 120 ? 1 : 0;
      return mask;
    };
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
        let sum = 0;
        for (let p = 0; p < n; p++) sum += luma(img, p * 4);
        const out = { mean: +(sum / n).toFixed(4) };
        if (!outdoor) return out;
        const sky = skyMask(), roof = roofMask();
        const L = (x, y) => luma(img, (y * Wd + x) * 4);
        // (b) 지붕선 대비: 지붕 윗선 바로 위(지붕 아닌 것: 하늘·숲·산) 띠와 바로 아래 지붕 띠의 루마 차
        let cs = 0, cn = 0, ks = 0, kn = 0;
        for (let x = 0; x < Wd; x += 2) {
          for (let y = 12; y < Ht - 12; y++) {
            const p = y * Wd + x;
            if (!(roof[p] && !roof[p - Wd])) continue;
            let ls = 0, ns = 0, lr = 0, nr = 0, sk = 0;
            for (let k = 3; k <= 9; k++) {
              if (!roof[p - k * Wd]) { ls += L(x, y - k); ns++; sk += sky[p - k * Wd]; }
              if (roof[p + k * Wd]) { lr += L(x, y + k); nr++; }
            }
            if (ns < 4 || nr < 4) continue;
            const c = Math.abs(ls / ns - lr / nr);
            cs += c; cn++;
            if (sk === ns) { ks += c; kn++; }
          }
        }
        out.roofContrast = cn ? +(cs / cn).toFixed(4) : null;
        out.roofSkyContrast = kn ? +(ks / kn).toFixed(4) : null;
        out.roofEdgePx = [cn, kn];
        // 달 원반·달무리 영역 (반지름 6°)
        const cam = W.camera, cp = cam.position;
        const moonDir = W.skyMat.uniforms.uMoonDir.value.clone().normalize();
        const mp = cp.clone().addScaledVector(moonDir, 100).project(cam);
        const pxPerRad = Ht / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        const moonR = Math.tan(THREE.MathUtils.degToRad(6)) * pxPerRad;
        const moonOn = mp.z < 1 && Math.abs(mp.x) < 1.3 && Math.abs(mp.y) < 1.3;
        const mx = (mp.x * 0.5 + 0.5) * Wd, my = (-mp.y * 0.5 + 0.5) * Ht;
        // (c) 별, (d) 은하수
        let stars = 0, skyPx = 0;
        for (let y = 0; y < Ht; y++) {
          for (let x = 0; x < Wd; x++) {
            const p = y * Wd + x;
            if (!sky[p]) continue;
            if (moonOn && Math.hypot(x - mx, y - my) < moonR) continue;
            skyPx++;
            const l = L(x, y);
            // 별 = 밝기 0.6 이상이면서 4px 둘레보다 0.25 이상 밝은 점 (연등 블룸처럼 넓게 번진 빛은 빼고)
            if (l >= 0.6 && x > 4 && y > 4 && x < Wd - 5 && y < Ht - 5) {
              const ring = (L(x - 4, y) + L(x + 4, y) + L(x, y - 4) + L(x, y + 4)) / 4;
              if (l - ring >= 0.25) stars++;
            }
          }
        }
        // 은하수: 띠(대원 ±5°)와 주변(12~25°)의 평균 루마. 하늘은 지평선 쪽이 원래 밝으므로
        // 같은 화면을 은하수만 끄고 다시 그려 뺀 값(은하수가 더한 밝기)으로도 견준다.
        const pole = W.skyMat.uniforms.uMilkyPole?.value;
        let milky = null;
        if (pole) {
          const on = grab(plain);
          W.skyMat.uniforms.uMilky.value = 0;
          const off = grab(plain);
          W.skyMat.uniforms.uMilky.value = 1;
          const dir = new THREE.Vector3();
          const acc = { band: [0, 0, 0], ref: [0, 0, 0] }; // [raw 합, 더한 밝기 합, 개수]
          for (let y = 0; y < Ht; y += 2) {
            for (let x = 0; x < Wd; x += 2) {
              const p = y * Wd + x, i = p * 4;
              if (!sky[p] || (moonOn && Math.hypot(x - mx, y - my) < moonR)) continue;
              const l = L(x, y);
              if (l >= 0.6) continue; // 별 제외
              dir.set((x / Wd) * 2 - 1, -(y / Ht) * 2 + 1, 0.5).unproject(cam).sub(cp).normalize();
              const a = THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.abs(dir.dot(pole)))));
              const k = a < 5 ? acc.band : a > 12 && a < 25 ? acc.ref : null;
              if (!k) continue;
              k[0] += l; k[1] += luma(on, i) - luma(off, i); k[2]++;
            }
          }
          const f = (k, j) => (k[2] ? +(k[j] / k[2]).toFixed(4) : null);
          milky = { band: f(acc.band, 0), ref: f(acc.ref, 0), bandAdd: f(acc.band, 1), refAdd: f(acc.ref, 1), px: [acc.band[2], acc.ref[2]] };
        }
        Object.assign(out, { skyPx, stars, milky });
        frames(1); // 스크린샷용으로 실제 화면을 다시 그린다
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
  const run = async (h, s, tag) => {
    await page.evaluate(([h, s]) => { window.__qa.setHour(h); window.__qa.shot(s); }, [h, s]);
    const r = await page.evaluate((o) => window.__qa.measure(o), { outdoor: s.outdoor });
    await page.screenshot({ path: `${OUT}/${tag}-${s.name}-${String(h).padStart(2, '0')}h.png` });
    return r;
  };
  const tag = 'night';
  const day = {};
  for (const s of SHOTS) day[s.name] = await run(13, s, tag);
  const rows = [];
  let pass = true;
  for (const h of HOURS) {
    for (const s of SHOTS) {
      const r = await run(h, s, tag);
      const ratio = +(r.mean / day[s.name].mean).toFixed(3);
      const ok = {
        a: ratio >= 0.18,
        b: !s.outdoor || (r.roofContrast ?? 0) >= 0.06,
        c: !s.outdoor || r.stars >= 300,
        d: !s.outdoor || (!!r.milky?.px[0] && !!r.milky.px[1] && r.milky.band > r.milky.ref && r.milky.bandAdd > r.milky.refAdd)
      };
      const all = Object.values(ok).every(Boolean);
      pass &&= all;
      rows.push(`${String(h).padStart(2, '0')}h ${s.name.padEnd(9)} ${all ? 'PASS' : 'FAIL'} mean ${r.mean} (낮 ${day[s.name].mean}, ${(ratio * 100).toFixed(1)}%${ok.a ? '' : '✗'})` +
        (s.outdoor ? ` | 지붕선 ${r.roofContrast}${ok.b ? '' : '✗'} (하늘 앞 ${r.roofSkyContrast}, px ${r.roofEdgePx}) | 별 ${r.stars}${ok.c ? '' : '✗'} / 하늘 ${r.skyPx}px | 은하수 ${r.milky?.band} vs ${r.milky?.ref} (더한 밝기 ${r.milky?.bandAdd} vs ${r.milky?.refAdd}, px ${r.milky?.px})${ok.d ? '' : '✗'}` : ''));
    }
  }
  return `night.mjs ${pass ? 'PASS' : 'FAIL'}\n` + rows.join('\n');
}
