// 에셋 스파이크 — 실측 석탑(국가유산청 스캔) + 법당 한 조각(구운 낮·밤 빛) + CC0 HDRI 하늘.
// 기존 세계(web/src/world/*, main.js)와 독립. 수치 근거는 tools/blender/*.py, tools/spike/*.py 머리 주석.
//   ?view=hall|court  ?time=day|night  ?q=phone|desktop  ?hud=0 (스크린샷용)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ASSETS = './assets/spike/';
const BASIS = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/';
const q = new URLSearchParams(location.search);
const phone = q.get('q') ? q.get('q') === 'phone' : Math.min(innerWidth, innerHeight) < 600;
const SIZE = 1024; // 폰 기준 텍스처 (pack.sh 의 size)
if (q.get('hud') === '0') document.body.classList.add('hud-off');

// 시점·시간별 노출 (렌더 화면 평균 밝기를 재서 정함 — tools/spike/measure.mjs)
const EXPOSURE = { court: { day: 0.8, night: 0.6 }, hall: { day: 34, night: 9.5 } }; // 법당은 화면 평균 루마 0.32(낮)·0.20(밤)이 되는 값을 재서 넣음, 마당 밤은 눈으로
// 마당 낮은 해를 등지고(빛 받는 면), 밤은 은하수 쪽을 본다. 법당 조각은 마당 시점에서 숨긴다(실내만 만든 조각이라).
const VIEWS = {
  hall: { day: { pos: [8.6, 1.45, -6.8], look: [2.0, 1.0, 0.6] }, night: { pos: [11.4, 1.4, -1.0], look: [5.4, 1.1, -7.8] }, fov: 62 },
  court: { day: { pos: [-7.4, 0.2, 29.6], look: [2.2, 3.6, 16] }, night: { pos: [-5.5, 0.3, 4.5], look: [2.2, 5.0, 16] }, fov: 52 }
};
const PAGODA_AT = [2.2, -1.45, 16]; // 법당 정면 계단 앞 마당 (three 좌표)

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const ktx2 = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(renderer);
const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const json = (f) => fetch(ASSETS + f).then((r) => r.json());
const tex = (f) => new Promise((ok, no) => new THREE.TextureLoader().load(ASSETS + f, ok, undefined, no));

const t0 = performance.now();
const [hallG, groundG, pagodaG, lmDay, lmNight, meta, lm, dayBg, nightBg, dayEnv, nightEnv] = await Promise.all([
  gltf.loadAsync(`${ASSETS}hall_${SIZE}.glb`),
  gltf.loadAsync(`${ASSETS}ground_${SIZE}.glb`),
  gltf.loadAsync(`${ASSETS}pagoda_${SIZE}.glb`),
  ktx2.loadAsync(ASSETS + 'lm_day.ktx2'),
  ktx2.loadAsync(ASSETS + 'lm_night.ktx2'),
  json('hall.json'),
  json('lightmaps.json'),
  tex('sky/day_bg_2048.jpg'),
  tex(`sky/night_bg_${phone ? 2048 : 4096}.jpg`),
  new RGBELoader().loadAsync(ASSETS + 'sky/day_env.hdr'),
  new RGBELoader().loadAsync(ASSETS + 'sky/night_env.hdr')
]);
const loadMs = performance.now() - t0;

for (const t of [dayBg, nightBg]) {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
}
const pmrem = new THREE.PMREMGenerator(renderer);
const ENV = {
  day: pmrem.fromEquirectangular(dayEnv).texture,
  night: pmrem.fromEquirectangular(nightEnv).texture
};
const LM = { day: lmDay, night: lmNight };
for (const t of Object.values(LM)) { t.channel = 1; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }

// ── 법당: 구운 빛만 받는다 (실시간 직접광을 셰이더에서 끔 — 해·달은 라이트맵에 이미 들어 있음)
const hallMats = new Set();
hallG.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.matrixAutoUpdate = false;
  const m = o.material;
  hallMats.add(m);
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_begin>', '#undef RE_Direct\n#include <lights_fragment_begin>');
  };
  m.customProgramCacheKey = () => 'baked-only';
});
scene.add(hallG.scene);

groundG.scene.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
scene.add(groundG.scene);

const pagoda = pagodaG.scene;
pagoda.position.set(...PAGODA_AT);
pagoda.rotation.y = THREE.MathUtils.degToRad(-18.4); // 스캔 좌표계 회전(rcInfo transformToModel) 을 되돌려 기단을 법당과 나란히
pagoda.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
scene.add(pagoda);

// ── 해·달 (HDR 단위 그대로: 세기 = 조도)
const sun = new THREE.DirectionalLight(new THREE.Color(...meta.sunColor), meta.sunIrradiance);
const moon = new THREE.DirectionalLight(new THREE.Color(...meta.moonColor), meta.moonIrradiance);
for (const [L, dir] of [[sun, meta.sunDirThree], [moon, meta.moonDirThree]]) {
  L.position.set(...PAGODA_AT).addScaledVector(new THREE.Vector3(...dir), 60);
  L.target.position.set(...PAGODA_AT);
  L.castShadow = true;
  L.shadow.mapSize.setScalar(phone ? 1024 : 2048);
  Object.assign(L.shadow.camera, { left: -11, right: 11, top: 13, bottom: -3, near: 20, far: 100 });
  L.shadow.bias = -0.0004;
  L.shadow.normalBias = 0.03;
  scene.add(L, L.target);
}

// 달 원반 + 달무리 (밤하늘 HDRI 에는 달이 없다 — 스펙: 밝은 달과 달무리). 크기는 보이게 키운 설계값.
function glowTex() {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.2, 'rgba(225,235,255,.35)');
  r.addColorStop(1, 'rgba(160,180,230,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const moonSky = new THREE.Group();
const MOON_D = 1500;
const disc = new THREE.Mesh(new THREE.CircleGeometry(MOON_D * Math.tan(THREE.MathUtils.degToRad(0.8)), 48),
  new THREE.MeshBasicMaterial({ color: 0xf4f1e8, toneMapped: false, fog: false }));
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }));
halo.scale.setScalar(MOON_D * Math.tan(THREE.MathUtils.degToRad(9)) * 2);
moonSky.add(halo, disc);
scene.add(moonSky);

// ── 상태
const state = { view: VIEWS[q.get('view')] ? q.get('view') : 'hall', time: q.get('time') === 'night' ? 'night' : 'day' };
function apply() {
  const night = state.time === 'night';
  scene.background = night ? nightBg : dayBg;
  scene.environment = ENV[state.time];
  scene.backgroundRotation.y = scene.environmentRotation.y = meta.skyYaw; // tools/blender/hall_bay.py --sun-az 와 같은 회전
  hallG.scene.visible = state.view === 'hall';
  sun.visible = !night;
  moon.visible = night;
  moonSky.visible = night;
  renderer.toneMappingExposure = EXPOSURE[state.view][state.time];
  for (const m of hallMats) {
    // r170: scene.environment 로 받으면 재질별 envMapIntensity 가 무시된다 → 법당 재질에는 직접 지정해 IBL 을 거의 끈다
    m.envMap = ENV[state.time];
    m.envMapRotation.y = meta.skyYaw;
    m.envMapIntensity = 0.04;
    m.lightMap = LM[state.time];
    m.lightMapIntensity = lm[state.time].intensity;
    if (m.name === 'hanji') { // 종이 너머 바깥빛 (낮: 햇빛 받은 마당·하늘, 밤: 달빛) — 설계값
      m.emissiveMap = m.map;
      m.emissive.set(night ? 0x9fb2d8 : 0xfff6e8);
      m.emissiveIntensity = night ? 0.004 : 0.06;
    }
    if (m.name === 'flame') m.emissiveIntensity = night ? 40 : 6;
    m.needsUpdate = true;
  }
  const v = VIEWS[state.view], p = v[state.time];
  camera.fov = innerWidth < innerHeight ? Math.min(80, v.fov * 1.3) : v.fov;
  camera.position.set(...p.pos);
  controls.target.set(...p.look);
  camera.updateProjectionMatrix();
  controls.update();
  const md = new THREE.Vector3(...meta.moonDirThree);
  disc.position.copy(md).multiplyScalar(MOON_D).add(camera.position);
  disc.lookAt(camera.position);
  halo.position.copy(disc.position);
  for (const b of document.querySelectorAll('#ui button')) {
    b.setAttribute('aria-pressed', String(b.dataset.view === state.view || b.dataset.time === state.time));
  }
}
document.getElementById('ui').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) state.view = b.dataset.view;
  if (b.dataset.time) state.time = b.dataset.time;
  apply();
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  apply();
});
apply();

// ── 받은 용량 (Resource Timing)
function bytes() {
  const out = {};
  for (const e of performance.getEntriesByType('resource')) {
    if (!e.name.includes('/assets/spike/')) continue;
    out[e.name.split('/assets/spike/')[1]] = e.encodedBodySize || e.transferSize;
  }
  return out;
}
const info = document.getElementById('info');
let frames = 0, last = performance.now(), fps = 0;
function loop() {
  requestAnimationFrame(loop);
  controls.update();
  if (state.time === 'night') {
    disc.position.copy(new THREE.Vector3(...meta.moonDirThree)).multiplyScalar(MOON_D).add(camera.position);
    disc.lookAt(camera.position);
    halo.position.copy(disc.position);
  }
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - last > 1000) {
    fps = (frames * 1000) / (now - last);
    frames = 0;
    last = now;
    const total = Object.values(bytes()).reduce((a, b) => a + b, 0);
    info.textContent = `받은 용량 ${(total / 1048576).toFixed(2)}MB · ${fps.toFixed(0)}fps · 삼각형 ${renderer.info.render.triangles.toLocaleString()} · 그리기 ${renderer.info.render.calls}`;
  }
}
loop();
document.body.classList.add('ready');

const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
window.__spike = {
  set(o = {}) { Object.assign(state, o); apply(); },
  stats() {
    return { loadMs: Math.round(loadMs), bytes: bytes(), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      dpr: renderer.getPixelRatio(), size: [innerWidth, innerHeight], phone };
  },
  // fps 5초 (주사율 상한) + 루프 밖 동기 렌더 시간 중앙값 (render + 1px readPixels)
  measure(sec = 5) {
    return new Promise((res) => {
      let n = 0;
      const a = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - a < sec * 1000) return requestAnimationFrame(tick);
        const f = +(n / ((performance.now() - a) / 1000)).toFixed(1);
        const px = new Uint8Array(4), ms = [];
        for (let i = 0; i < 40; i++) {
          const b = performance.now();
          renderer.render(scene, camera);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          ms.push(performance.now() - b);
        }
        ms.sort((x, y) => x - y);
        res({ fps: f, syncMs: +ms[20].toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
          textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
      };
      requestAnimationFrame(tick);
    });
  },
  // 화면 평균 루마(sRGB, 0~1) — 노출을 재서 정할 때
  luma() {
    renderer.render(scene, camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, p = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p);
    let s = 0;
    for (let i = 0; i < p.length; i += 4) s += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    return +(s / (w * h) / 255).toFixed(3);
  },
  renderer, scene, camera, state
};
