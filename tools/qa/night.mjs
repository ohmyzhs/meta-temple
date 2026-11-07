// 밤 화면 검사 (Task C1) — Playwright MCP 로 실행한다:
//   browser_run_code_unsafe { filename: '<repo>/tools/qa/night.mjs' }
// 열린 탭이 localhost 면 그 주소(포트)를 쓰고, 아니면 http://localhost:8080 (python3 .claude/devserver.py 8080).
// 스크린샷은 MCP 작업 폴더 기준 OUT 에 남는다.
// 기준 (1280×800, 맑음): 네 구도(산문·마당·법당 안·마당에서 올려다본 대웅전 지붕) × 0·2·22시
//   (a) 화면 평균 루마 ≥ 같은 구도 13시 평균의 18%
//   (b) 지붕선 국소 대비(지붕 윗선 바로 위 띠 vs 바로 아래 지붕 띠, 루마 차) ≥ 0.06
//       — 산문·마당은 지붕 위가 숲·산이라 그 대비로, 대웅전 지붕 구도는 위 띠가 모두 하늘인 지붕선만으로
//   (c) 보이는 별(둘레보다 밝은 꼭짓점, 루마 ≥ 0.3·둘레보다 0.12 이상)이 하늘 1000px 당 ≥ 0.15 (달 둘레 6°·블룸 제외) — 바깥 구도.
//       천정 구도는 1000px 당 ≥ 0.5, 또렷한 별(루마 0.6 이상 픽셀) ≥ 10
//       (옛 기준 '0.6 이상 별 픽셀 ≥ 300' 은 굵고 밝은 별로 맞춘 값 — 사용자 2026-11-07 「너무 밝다」로 사진처럼 대부분 희미하고 드물게 밝은 별로 바꿨다)
//   (d) 은하수 띠(은하 적도 ±5°) 평균 루마 > 주변 하늘(띠에서 12~25°), 은하수만 끈 화면과의 차도 띠 > 주변
//       — 띠가 2000px 이상 들어온 구도에서. 하늘이 실제 별지도로 시각에 따라 돌므로(2026-11-08) 천정 구도는 늘 띠를 품어야 한다
//   천정 구도(zenith)는 하늘만 보는 구도라 (a)(b) 를 재지 않는다
async (page) => {
  const OUT = '.playwright-mcp/qa/night';
  const HOURS = globalThis.NIGHT_HOURS || [0, 2, 22]; // mcp-run.mjs 로 돌릴 때 NIGHT_HOURS=22 처럼 줄일 수 있다
  await page.setViewportSize({ width: 1280, height: 800 });
  const base = /^http:\/\/(localhost|127\.0\.0\.1)/.test(page.url()) ? new URL(page.url()).origin : 'http://localhost:8080';
  await page.goto(base + '/?q=high');
  await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
  await page.click('#intro-enter'); // 누름은 바로 받고 산사 짓기(build)를 기다렸다 들어간다
  await page.waitForFunction(() => window.temple.entered && window.temple.avatars, null, { timeout: 120000 });
  await page.evaluate(async () => {
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
      const keep = W.sky.material, pts = W.nightSky?.points;
      const key = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, depthWrite: false, fog: false });
      if (pts) pts.visible = false; // 하늘 위에 더해 그리는 점 별이 두 단색을 다 하얗게 채워 밝은 별 자리가 하늘에서 빠지지 않게
      W.sky.material = key(0xff00ff); const a = grab(plain);
      W.sky.material = key(0x00ff00); const b = grab(plain);
      W.sky.material = keep;
      if (pts) pts.visible = true;
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
        t._walkZone = null; // 순간이동을 걸어서 문턱 넘은 것으로 보지 않게
        t.avatars.solo = true; // 지나가는 도반(NPC)이 카메라 앞을 가려 값이 흔들리지 않게
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
        let stars = 0, seen = 0, skyPx = 0;
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
            // 보이는 별 = 둘레 8칸보다 밝은 꼭짓점이면서 밝기 0.3 이상, 4px 둘레보다 0.12 이상 밝은 점 (한 별을 한 번만 센다)
            if (l >= 0.3 && x > 4 && y > 4 && x < Wd - 5 && y < Ht - 5) {
              let peak = true;
              for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && L(x + dx, y + dy) > l) { peak = false; break; }
              const ring = (L(x - 4, y) + L(x + 4, y) + L(x, y - 4) + L(x, y + 4)) / 4;
              if (peak && l - ring >= 0.12) seen++;
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
        Object.assign(out, { skyPx, stars, seen, milky });
        frames(1); // 스크린샷용으로 실제 화면을 다시 그린다
        return out;
      }
    };
  });

  const gx = await page.evaluate(async () => (await import('/src/world/layout.js')).L.gate.x);
  const SHOTS = [
    { name: 'gate', outdoor: true, player: [gx + 0.6, 40.5], pos: [gx + 0.6, 2.3, 38.5], look: [gx, 6.0, 26] },
    { name: 'courtyard', outdoor: true, player: [5.2, 4.4], pos: [5.0, 2.1, 2.6], look: [1, 6.5, -16] },
    { name: 'hall', outdoor: false, player: [1.5, -20.8], pos: [1.2, 4.7, -21.0], look: [0, 4.2, -28.4] },
    // 서쪽 마당에서 올려다본 대웅전 서쪽 지붕: 중층으로 커진 지붕(2026-11-07)이 뒷산보다 높아 하늘 앞에 선다 → (b) 를 하늘 앞 지붕선으로 잰다
    // (옛 구도 — 계단 앞 [1.5, 1.9, −13.6] — 은 커진 법당 정면이 화면을 다 덮어 하늘이 0px 이 됐다)
    { name: 'hallroof', outdoor: true, skyRoof: true, player: [-29, -9], pos: [-26, 1.9, -12], look: [0, 18, -30] },
    // 산문 앞 숲길에서 올려다본 천정 하늘 (밤 시각 0·2·22시 모두 백조자리~카시오페이아 은하수가 지나간다)
    { name: 'zenith', outdoor: true, skyOnly: true, player: [0, 47], pos: [0, 2.4, 46], look: [-14, 50, 30] }
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
      const dens = r.skyPx ? (r.seen / r.skyPx) * 1000 : 0, bandIn = (r.milky?.px[0] ?? 0) >= 2000;
      const ok = {
        a: s.skyOnly || ratio >= 0.18,
        b: s.skyOnly || !s.outdoor || ((s.skyRoof ? r.roofSkyContrast : r.roofContrast) ?? 0) >= 0.06,
        c: !s.outdoor || (s.skyOnly ? dens >= 0.5 && r.stars >= 10 : dens >= 0.15),
        d: !s.outdoor || (!bandIn && !s.skyOnly) || (bandIn && !!r.milky.px[1] && r.milky.band > r.milky.ref && r.milky.bandAdd > r.milky.refAdd)
      };
      const all = Object.values(ok).every(Boolean);
      pass &&= all;
      rows.push(`${String(h).padStart(2, '0')}h ${s.name.padEnd(9)} ${all ? 'PASS' : 'FAIL'} mean ${r.mean} (낮 ${day[s.name].mean}, ${(ratio * 100).toFixed(1)}%${ok.a ? '' : '✗'})` +
        (s.outdoor ? ` | 지붕선 ${r.roofContrast}${ok.b ? '' : '✗'} (하늘 앞 ${r.roofSkyContrast}, px ${r.roofEdgePx}) | 별 ${r.stars}${ok.c ? '' : '✗'} (보이는 별 ${r.seen}, 하늘 1000px 당 ${r.skyPx ? (r.seen / r.skyPx * 1000).toFixed(2) : '-'}) / 하늘 ${r.skyPx}px | 은하수 ${r.milky?.band} vs ${r.milky?.ref} (더한 밝기 ${r.milky?.bandAdd} vs ${r.milky?.refAdd}, px ${r.milky?.px})${ok.d ? '' : '✗'}` : ''));
    }
  }
  return `night.mjs ${pass ? 'PASS' : 'FAIL'}\n` + rows.join('\n');
}
