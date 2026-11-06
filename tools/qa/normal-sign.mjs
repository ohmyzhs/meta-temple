// 실사 노멀맵 방향 검사 (outdoor.js xyNormal): KTX2(flipY 없음) + OpenGL 노멀이 바른 쪽으로 풀리는가
// 가로 능선 하나를 그린 시험 노멀(0행 = 그림 위, 위 절반은 그림-위로 기욺)을 판에 붙이고 위에서 비춘다 → 판 윗부분만 밝아야 한다.
// 실행: BASE=http://localhost:8098 node tools/qa/normal-sign.mjs   (devserver 가 web/ 을 서빙)
import { launch, BASE } from './lib.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.goto(`${BASE}/?q=low&world=classic`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.temple && !document.querySelector('#intro-enter').disabled, null, { timeout: 90000 });
const r = await page.evaluate(async () => {
  const THREE = await import('three');
  const { xyNormals } = await import('./src/world/real/outdoor.js');
  const R = window.temple.world.renderer;
  const N = 64, data = new Uint8Array(N * N * 4);
  for (let row = 0; row < N; row++) for (let c = 0; c < N; c++) {
    const i = (row * N + c) * 4;
    data[i] = data[i + 1] = data[i + 2] = 128; // X = 0 (RGB)
    data[i + 3] = row < N / 2 ? 230 : 25; // Y (A): 그림 위 절반 +Y, 아래 절반 −Y
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), xyNormals(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, normalMap: tex }))));
  const L = new THREE.DirectionalLight(0xffffff, 3);
  L.position.set(0, 1, 0.25);
  scene.add(L);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  cam.position.set(0, 0, 3.2);
  const rt = new THREE.WebGLRenderTarget(64, 64);
  R.setRenderTarget(rt);
  R.render(scene, cam);
  const px = new Uint8Array(64 * 64 * 4);
  R.readRenderTargetPixels(rt, 0, 0, 64, 64, px);
  R.setRenderTarget(null);
  const row = (y) => [...Array(16)].reduce((s, _, k) => s + px[(y * 64 + 24 + k) * 4], 0) / 16;
  return { lower: row(20), upper: row(44) }; // 렌더 0행 = 판 아래 = v 작은 쪽 = 그림 위 절반
});
await browser.close();
const ok = r.upper > 100 && r.lower < 40;
console.log(`판 아랫부분(그림 위, 빛 반대로 기욺) ${r.lower.toFixed(0)} · 윗부분(빛 쪽) ${r.upper.toFixed(0)}`);
console.log(ok ? 'PASS' : 'FAIL — xyNormal 의 초록 방향이 뒤집혔다');
process.exit(ok ? 0 : 1);
