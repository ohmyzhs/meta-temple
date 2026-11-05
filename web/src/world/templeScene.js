/**
 * 렌더링 파이프라인 (docs/03 §2.1)
 *  - WebGLRenderer + ACES 톤매핑 + PCFSoft 그림자 + 블룸 후처리
 *  - 시간대(실시간 KST 포함 5종)·날씨(3종) 상태를 키프레임 보간으로 부드럽게 전환
 *  - 3인칭 궤도 / 1인칭 카메라, 클릭 피킹
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, terrainHeight, walkHeight, zoneAt, clamp, lerp, colliders } from './layout.js';
import { envUniforms } from './materials.js';
import { setAnisotropy } from './textures.js';
import { buildTerrain, waterUniforms, ridgeUniforms } from './terrain.js';
import { buildVegetation } from './vegetation.js';
import { Temple } from './temple.js';
import { Weather, Ripples } from './effects.js';
import { kstHour } from '../core/state.js';

/* ───── 시간대 키프레임 (KST 시각) ───── */
const KEYS = [
  { h: 0, elev: 38, az: 150, light: '#8ea4d6', li: 0.55, top: '#060a14', hor: '#1a2234', fog: '#121827', fd: 0.014, hemiS: '#3a4a6a', hemiG: '#12100c', hi: 0.6, exp: 1.12, night: 1, stars: 1, cloud: '#1a1f2c' },
  { h: 4.4, elev: 30, az: 120, light: '#8ea4d6', li: 0.5, top: '#080c18', hor: '#1e2638', fog: '#141a2a', fd: 0.016, hemiS: '#3a4a6a', hemiG: '#12100c', hi: 0.58, exp: 1.12, night: 1, stars: 0.9, cloud: '#1a1f2c' },
  { h: 5.0, elev: -6, az: 80, light: '#7c8fb8', li: 0.18, top: '#141e30', hor: '#55627a', fog: '#47526a', fd: 0.034, hemiS: '#4b5a7a', hemiG: '#1a1814', hi: 0.55, exp: 1.05, night: 0.75, stars: 0.35, cloud: '#56617a' },
  { h: 6.4, elev: 4, az: 82, light: '#ffb07a', li: 1.6, top: '#5b7aa6', hor: '#eab38e', fog: '#b9a596', fd: 0.02, hemiS: '#9fb2cc', hemiG: '#3a3026', hi: 0.6, exp: 1.0, night: 0.2, stars: 0, cloud: '#e8b9a0' },
  { h: 9, elev: 32, az: 120, light: '#fff1dc', li: 2.7, top: '#5d8fc2', hor: '#c8d7e2', fog: '#bccbd6', fd: 0.0095, hemiS: '#b9cde2', hemiG: '#4a4232', hi: 0.75, exp: 1.0, night: 0, stars: 0, cloud: '#f4f4f2' },
  { h: 13, elev: 56, az: 180, light: '#fff6e6', li: 3.0, top: '#5a8ec4', hor: '#cfdde6', fog: '#c6d4de', fd: 0.0078, hemiS: '#c4d6e8', hemiG: '#4e4634', hi: 0.8, exp: 0.98, night: 0, stars: 0, cloud: '#ffffff' },
  { h: 16.4, elev: 24, az: 240, light: '#ffe2b8', li: 2.6, top: '#5c84b4', hor: '#e2d2bc', fog: '#cfc5b6', fd: 0.0095, hemiS: '#c9c6c0', hemiG: '#4e4030', hi: 0.7, exp: 1.0, night: 0, stars: 0, cloud: '#f6e6d2' },
  { h: 18.0, elev: 3, az: 268, light: '#ff8a4c', li: 2.2, top: '#3a4675', hor: '#e08458', fog: '#a7765f', fd: 0.012, hemiS: '#8a7a8c', hemiG: '#3a2a20', hi: 0.55, exp: 1.06, night: 0.5, stars: 0, cloud: '#f0a070' },
  { h: 19.1, elev: -7, az: 285, light: '#6a6a9a', li: 0.4, top: '#161b36', hor: '#5e4256', fog: '#2e2a3a', fd: 0.014, hemiS: '#4a4c6a', hemiG: '#14100c', hi: 0.55, exp: 1.0, night: 0.9, stars: 0.4, cloud: '#4a3a4c' },
  { h: 22, elev: 40, az: 160, light: '#8ea4d6', li: 0.58, top: '#070b15', hor: '#1a2234', fog: '#121827', fd: 0.013, hemiS: '#3a4a6a', hemiG: '#12100c', hi: 0.62, exp: 1.12, night: 1, stars: 1, cloud: '#1a1f2c' },
  { h: 24, elev: 38, az: 150, light: '#8ea4d6', li: 0.55, top: '#060a14', hor: '#1a2234', fog: '#121827', fd: 0.014, hemiS: '#3a4a6a', hemiG: '#12100c', hi: 0.6, exp: 1.12, night: 1, stars: 1, cloud: '#1a1f2c' }
];
export const PRESET_HOURS = { dawn: 5.0, day: 13, sunset: 18.0, night: 22 };

const _ca = new THREE.Color(), _cb = new THREE.Color();
function sampleKeys(hour) {
  hour = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 1 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);
  const out = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number') out[k] = lerp(a[k], b[k], t);
    else out[k] = _ca.set(a[k]).lerp(_cb.set(b[k]), t).getHexString();
  }
  // 고도가 음↔양을 넘나들 때 방위각 보간이 튀지 않게
  return out;
}

/* ───── 하늘 돔 셰이더 ───── */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uStars: { value: 0 },
      uCloud: { value: new THREE.Color() },
      uCloudAmt: { value: 0.5 },
      uTime: envUniforms.uTime
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uCloud;
      uniform vec3 uSunDir, uMoonDir;
      uniform float uSunVis, uStars, uCloudAmt, uTime;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1, 0), 1.0)), c = hash(vec3(i + vec2(0, 1), 1.0)), d = hash(vec3(i + vec2(1, 1), 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uBottom, smoothstep(0.02, -0.12, h));
        // 태양 광륜
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6) * uSunVis;
        col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunVis * step(0.0, uSunDir.y + 0.02);
        // 별
        if (uStars > 0.01 && h > 0.0) {
          vec3 g = floor(d * 380.0);
          float s = hash(g);
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
          col += vec3(0.9, 0.93, 1.0) * step(0.9965, s) * tw * uStars * smoothstep(0.0, 0.25, h) * 1.4;
        }
        // 달
        float md = max(dot(d, normalize(uMoonDir)), 0.0);
        col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.99955, 0.9997, md) * 2.4 + pow(md, 300.0) * 0.35) * uStars;
        // 구름 (낮게 깔린 층운)
        if (h > -0.02) {
          vec2 cp = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, 0.0);
          float c = fbm(cp * 1.4);
          float m = smoothstep(0.55 - uCloudAmt * 0.25, 0.85, c) * smoothstep(-0.02, 0.18, h) * (1.0 - smoothstep(0.55, 0.95, h));
          vec3 cc = uCloud + uSunColor * pow(sd, 4.0) * 0.35 * uSunVis;
          col = mix(col, cc, m * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/* ───── 최종 패스: 비네팅 + 미세 그레인 + 따뜻한 색감 ───── */
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uFocus: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uFocus; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * (uVignette + uFocus * 1.4) * 2.2;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (rnd(vUv * 731.0) - 0.5) * 0.018;
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.95), 0.6);
      gl_FragColor = c;
    }`
};

/**
 * 정적 메쉬를 재질별로 하나로 합친다 (드로우콜 수백 → 수십).
 * 움직이는 소품(exclude 하위), 인스턴스, 다중 재질, 셰이더/투명 장식은 건드리지 않는다.
 */
function batchStatic(scene, exclude) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();
  const excluded = (o) => {
    for (let p = o; p; p = p.parent) if (exclude.has(p)) return true;
    return false;
  };
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.noBatch) return;
    if (o.material.isShaderMaterial || (o.material.transparent && !o.material.alphaTest)) return;
    if (excluded(o)) return;
    const g = o.geometry;
    const sig = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${sig}|${o.castShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, items: [] });
    buckets.get(key).items.push(o);
  });
  let before = 0, after = 0;
  for (const b of buckets.values()) {
    before += b.items.length;
    if (b.items.length < 2) {
      after += b.items.length;
      continue;
    }
    const geos = b.items.map((o) => {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos);
    if (!merged) {
      after += b.items.length;
      continue;
    }
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    b.items.forEach((o) => o.removeFromParent());
    geos.forEach((g) => g.dispose());
    after += 1;
  }
  return { before, after };
}

/**
 * 세로 시야각. 가로 화면은 55°, 세로로 좁아질수록 넓혀 좌우 시야(약 58°)를 지킨다.
 * 폰 세로(9:19.5)는 72°에서 멈춘다 — 더 넓히면 가장자리가 늘어나 보인다.
 */
function fovFor(aspect) {
  const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / aspect));
  return clamp(v, 55, 72);
}

export class TempleScene {
  constructor(container, { quality = 'high', onProgress } = {}) {
    this.container = container;
    this.quality = quality;
    this.onProgress = onProgress || (() => {});
    const low = quality === 'low';

    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 저사양: 그림자 맵을 3프레임에 한 번만 다시 그린다
    if (low) this.renderer.shadowMap.autoUpdate = false;
    this._shadowTick = 0;
    container.appendChild(this.renderer.domElement);
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc6d4de, 0.008);
    this.camera = new THREE.PerspectiveCamera(fovFor(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.08, 900);
    this.camera.position.set(0, 4, 44);

    this._initSky();
    this._initLights();
    this.weather = new Weather(this.scene, quality);
    this.weather.setPixelRatio(this.pixelRatio);
    this.ripples = new Ripples(this.scene);

    // 카메라 상태
    this.cam = { mode: 'third', yaw: Math.PI, pitch: 0.32, dist: 7.5, targetDist: 7.5, focus: new THREE.Vector3(), seated: false, intro: 0 };
    this.cam.yaw = 0; // 남쪽(+z)에서 북쪽을 바라봄
    // 시간·날씨
    this.timeMode = 'realtime';
    this.hour = kstHour();
    this.hourTarget = this.hour;
    this.weatherName = 'clear';
    this.env = sampleKeys(this.hour);
    this.wet = 0;
    this.snow = 0;
    this._envTimer = 0;
    this.picking = new THREE.Raycaster();
    this.picking.layers.set(1);
    this.pointer = new THREE.Vector2();

    this._initPost();
    window.addEventListener('resize', () => this.resize());
  }

  /** 무거운 월드 생성 — 단계별로 진행률을 보고하며 프레임을 양보한다 */
  async build() {
    const step = async (p, label, fn) => {
      this.onProgress(p, label);
      await new Promise((r) => setTimeout(r, 0));
      return fn();
    };
    this.terrain = await step(0.15, '산자락을 다지는 중…', () => buildTerrain(this.scene, this.quality));
    this.veg = await step(0.45, '숲길에 나무를 심는 중…', () => buildVegetation(this.scene, this.quality));
    this.temple = await step(0.7, '전각을 세우는 중…', () => new Temple(this.scene, this.quality));
    this._buildCrownGrid(this.veg.crowns);
    this.batchStats = batchStatic(this.scene, this.temple.dynamicRoots());
    await step(0.85, '등불을 켜는 중…', () => {
      this._placeLights();
      this.terrain.ground.forEach((g) => g.layers.enable(1));
      this._enablePickLayer();
      this.applyEnv(true);
      this.renderer.compile(this.scene, this.camera);
    });
    await this.loadCustomGLBModels();
    this.onProgress(1, '산문이 열렸습니다');
  }

  /**
   * docs/03 로드맵 Step 1 훅: 국가유산청 실측 .glb 로 절차적 메쉬를 교체한다.
   * window.TEMPLE_CONFIG.models = [{ url, position:[x,y,z], rotationY, scale, replace: 'hall'|'pagoda'|... }]
   */
  async loadCustomGLBModels() {
    const list = window.TEMPLE_CONFIG?.models;
    if (!Array.isArray(list) || !list.length) return [];
    const loader = new GLTFLoader();
    const out = [];
    for (const m of list) {
      try {
        const gltf = await loader.loadAsync(m.url);
        const obj = gltf.scene;
        if (m.position) obj.position.fromArray(m.position);
        if (m.rotationY) obj.rotation.y = m.rotationY;
        if (m.scale) obj.scale.setScalar(m.scale);
        obj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = o.receiveShadow = true;
          }
        });
        this.scene.add(obj);
        out.push(obj);
      } catch (e) {
        console.warn('[glb] load failed', m.url, e);
      }
    }
    return out;
  }

  _buildCrownGrid(crowns) {
    this.crownGrid = new Map();
    for (const c of crowns) {
      const k = `${Math.floor(c[0] / 6)},${Math.floor(c[1] / 6)}`;
      if (!this.crownGrid.has(k)) this.crownGrid.set(k, []);
      this.crownGrid.get(k).push(c);
    }
  }

  /** 카메라 위치 q 가 나무 수관·기둥·담 같은 장애물 안인가 */
  _blocked(q, skipColliders) {
    const gx = Math.floor(q.x / 6), gz = Math.floor(q.z / 6);
    const base = terrainHeight(q.x, q.z);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.crownGrid.get(`${gx + i},${gz + j}`);
        if (!list) continue;
        for (const [x, z, r, y0, y1] of list) {
          const h = q.y - base;
          if (h > y0 - 0.6 && h < y1 && Math.hypot(q.x - x, q.z - z) < r) return true;
        }
      }
    }
    if (skipColliders) return false;
    for (const c of colliders) {
      if (q.y - base > 6.5) continue;
      if (c.type === 'c') {
        if (Math.hypot(q.x - c.x, q.z - c.z) < c.r + 0.25) return true;
      } else if (q.x > c.x0 - 0.25 && q.x < c.x1 + 0.25 && q.z > c.z0 - 0.25 && q.z < c.z1 + 0.25) return true;
    }
    return false;
  }

  _enablePickLayer() {
    // 식생(noPick)·입자·하늘·원경(ShaderMaterial)을 뺀 나머지를 피킹 대상으로
    this.scene.traverse((o) => {
      if (!o.isMesh || o.userData.noPick || o.material?.isShaderMaterial || o === this.sky) return;
      o.layers.enable(1);
    });
  }

  _initSky() {
    this.skyMat = skyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.scale.setScalar(800);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // 환경맵 생성용 장면
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.envSky.scale.setScalar(100);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = null;
  }

  _initLights() {
    const low = this.quality === 'low';
    this.hemi = new THREE.HemisphereLight(0xc4d6e8, 0x4e4634, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff6e6, 3);
    this.sun.castShadow = true;
    const sm = low ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const ext = 26;
    Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 140 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // 점광원 풀 — 개수 고정 (재질 재컴파일 방지). 밤낮은 세기만 바꾼다.
    this.points = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(0xffb066, 0, 10, 1.8);
      this.scene.add(p);
      this.points.push(p);
    }
  }

  _placeLights() {
    const a = this.temple.lightAnchors;
    const set = (i, pos, color, dist) => {
      this.points[i].position.copy(pos);
      this.points[i].color.set(color);
      this.points[i].distance = dist;
    };
    set(0, a.candleL, '#ffb35a', 7);
    set(1, a.candleR, '#ffb35a', 7);
    set(2, a.buddha, '#ffcf8a', 14);
    set(3, a.brazier, '#ff8a3a', 9);
    set(4, a.lanternGlow, '#ffb27a', 26);
    set(5, a.stoneLantern, '#ffb466', 9);
    set(6, a.teahouse, '#ffc27a', 9);
    set(7, new THREE.Vector3(0, -10, 0), '#ffcf8a', 6); // 손연등
  }

  _initPost() {
    const low = this.quality === 'low';
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bs = new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(low ? 0.35 : 0.5);
    this.bloom = new UnrealBloomPass(bs, 0.55, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = fovFor(w / h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  setPixelRatio(pr) {
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.weather.setPixelRatio(pr);
    this.temple?.emitters.forEach((e) => (e.userData.uniforms.uPx.value = pr));
    this.resize();
  }

  /* ───── 시간·날씨 ───── */
  setTimeOfDay(mode) {
    this.timeMode = mode;
    this.hourTarget = mode === 'realtime' ? kstHour() : PRESET_HOURS[mode];
    // 짧은 쪽으로 돈다
    let d = this.hourTarget - this.hour;
    if (d > 12) this.hour += 24;
    if (d < -12) this.hour -= 24;
    this._envTimer = 99;
  }

  setWeather(w) {
    this.weatherName = w;
    this.weather.set(w);
  }

  get phase() {
    const h = ((this.hour % 24) + 24) % 24;
    if (h >= 4.5 && h < 6.2) return 'dawn';
    if (h >= 6.2 && h < 17.2) return 'day';
    if (h >= 17.2 && h < 19.4) return 'sunset';
    return 'night';
  }

  applyEnv(force = false) {
    const e = sampleKeys(this.hour);
    this.env = e;
    const sky = this.skyMat.uniforms;
    const rain = this.weather.rainU.uAmount.value, snow = this.weather.snowU.uAmount.value;
    const overcast = Math.max(rain, snow * 0.8);
    const grey = new THREE.Color('#8e959c');
    const top = new THREE.Color('#' + e.top).lerp(grey.clone().multiplyScalar(0.3 + (1 - e.night) * 0.7), overcast * 0.75);
    const hor = new THREE.Color('#' + e.hor).lerp(grey.clone().multiplyScalar(0.35 + (1 - e.night) * 0.75), overcast * 0.7);
    const fog = new THREE.Color('#' + e.fog).lerp(hor, overcast * 0.6);
    sky.uTop.value.copy(top);
    sky.uHorizon.value.copy(hor);
    sky.uBottom.value.copy(fog);
    sky.uCloud.value.set('#' + e.cloud).lerp(grey, overcast * 0.6);
    sky.uCloudAmt.value = 0.45 + overcast * 0.55;
    sky.uStars.value = e.stars * (1 - overcast);
    sky.uSunVis.value = 1 - overcast * 0.9;
    // 태양/달 방향 (+x 동쪽, -z 북쪽, +z 남쪽)
    const el = THREE.MathUtils.degToRad(e.elev), az = THREE.MathUtils.degToRad(e.az);
    // az: 90=동(+x), 180=남(+z), 270=서(-x)
    const dir = new THREE.Vector3().set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    sky.uSunDir.value.copy(e.night > 0.85 ? new THREE.Vector3(0, -1, 0) : dir);
    sky.uMoonDir.value.copy(e.night > 0.5 ? dir : new THREE.Vector3(0.3, 0.6, -0.7).normalize());
    sky.uSunColor.value.set('#' + e.light);
    this.lightDir = dir;
    this.sun.color.set('#' + e.light);
    this.sun.intensity = Math.max(0.02, e.li * (1 - overcast * 0.65) * (e.elev < 0 ? 0.25 : 1));
    this.hemi.color.set('#' + e.hemiS);
    this.hemi.groundColor.set('#' + e.hemiG);
    this.hemi.intensity = e.hi * (1 + overcast * 0.25);
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = e.fd * (1 + overcast * 0.9) * (this.weatherName === 'snow' ? 1.25 : 1);
    this.renderer.toneMappingExposure = e.exp;
    envUniforms.uNight.value = e.night;
    envUniforms.uWind.value = 0.5 + rain * 0.6 + (this.weatherName === 'snow' ? 0.2 : 0);
    // 물·원경
    waterUniforms.uSkyTop.value.copy(top);
    waterUniforms.uSkyHorizon.value.copy(hor);
    waterUniforms.uSunDir.value.copy(dir);
    waterUniforms.uSunColor.value.set('#' + e.light);
    waterUniforms.uDeep.value.set('#1e3a36').lerp(new THREE.Color('#05080a'), e.night * 0.8);
    waterUniforms.uRain.value = rain;
    ridgeUniforms.forEach(({ u, base, li }) => {
      u.uHorizon.value.copy(fog.clone().lerp(hor, 0.5));
      u.uColor.value.copy(base).lerp(new THREE.Color('#0a0e14'), e.night * 0.85).lerp(hor, overcast * 0.35);
      u.uFade.value = 0.18 + li * 0.24 + overcast * 0.25;
    });
    this._regenEnv(force);
  }

  _regenEnv(force) {
    const now = performance.now();
    if (!force && now - (this._lastEnv || 0) < 1500) return;
    this._lastEnv = now;
    const prev = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.35 + (1 - this.env.night) * 0.45;
    prev?.dispose();
  }

  /* ───── 카메라 ───── */
  toggleCameraMode(mode) {
    this.cam.mode = mode || (this.cam.mode === 'third' ? 'first' : 'third');
    return this.cam.mode;
  }

  orbit(dx, dy) {
    this.cam.yaw -= dx * 0.0055;
    this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, this.cam.mode === 'first' ? -1.1 : -0.15, this.cam.mode === 'first' ? 1.0 : 1.25);
  }

  zoom(delta) {
    this.cam.targetDist = clamp(this.cam.targetDist * (1 + delta), 2.2, 12);
  }

  /** 화면 좌표 → 클릭된 대상 */
  pick(clientX, clientY) {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.picking.setFromCamera(this.pointer, this.camera);
    const hits = this.picking.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.object === this.temple.lanterns.mesh && h.instanceId != null) {
        return { kind: 'lantern', id: this.temple.lanterns.idAt(h.instanceId), point: h.point };
      }
      if (h.object === this.temple.cushionMesh && h.instanceId != null) {
        return { kind: 'cushion', index: h.instanceId, point: h.point };
      }
      if (h.object.isSprite || h.object.isPoints || h.object.isLine) continue;
      return { kind: 'point', point: h.point, object: h.object };
    }
    return null;
  }

  hoverLantern(clientX, clientY) {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.picking.setFromCamera(this.pointer, this.camera);
    const hits = this.picking.intersectObject(this.temple.lanterns.mesh, false);
    this.temple.lanterns.hover = hits[0]?.instanceId ?? -1;
    return this.temple.lanterns.hover >= 0;
  }

  _updateCamera(dt, player) {
    const c = this.cam;
    const p = player.position;
    c.dist += (c.targetDist - c.dist) * (1 - Math.exp(-dt * 6));
    const inHall = zoneAt(p.x, p.z) === 'DAEUNGJEON';
    if (c.mode === 'first') {
      const eye = player.userData.eyeHeight ?? 1.5;
      const target = new THREE.Vector3(p.x, p.y + eye, p.z);
      this.camera.position.lerp(target, 1 - Math.exp(-dt * 10));
      // 3인칭과 같은 규약: yaw 0 = 북쪽(-z)을 봄, pitch 양수 = 아래를 봄
      const look = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
      this.camera.lookAt(this.camera.position.clone().add(look));
      return;
    }
    const focusY = (player.userData.focusHeight ?? 1.25);
    const focus = new THREE.Vector3(p.x, p.y + focusY, p.z);
    c.focus.lerp(focus, 1 - Math.exp(-dt * 8));
    let dist = c.dist;
    let pitch = c.pitch;
    if (inHall) {
      dist = Math.min(dist, 5.2);
      pitch = Math.min(pitch, 0.42);
    }
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(c.yaw) * Math.cos(pitch)).multiplyScalar(dist);
    const want = c.focus.clone().add(off);
    if (inHall) {
      want.x = clamp(want.x, L.hall.x0 + 0.5, L.hall.x1 - 0.5);
      want.z = clamp(want.z, L.hall.z0 + 0.5, -15);
      want.y = Math.min(want.y, L.hall.floorY + 4.0);
    }
    if (!inHall && this.crownGrid) {
      // 초점에서 카메라 쪽으로 걸어가며 처음 막히는 곳 앞에서 멈춘다
      const dir = want.clone().sub(c.focus);
      const len = dir.length();
      dir.divideScalar(len);
      const skip = this._blocked(c.focus, false);
      const q = new THREE.Vector3();
      for (let s = 0.8; s < len; s += 0.35) {
        q.copy(c.focus).addScaledVector(dir, s);
        if (this._blocked(q, skip)) {
          want.copy(c.focus).addScaledVector(dir, Math.max(1.2, s - 0.45));
          break;
        }
      }
    }
    const ground = terrainHeight(want.x, want.z) + 0.5;
    if (want.y < ground) want.y = ground;
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 9));
    this.camera.lookAt(c.focus);
  }

  /* ───── 프레임 ───── */
  update(dt, t, player, nightLanternOn) {
    envUniforms.uTime.value = t;
    this.finalPass.uniforms.uTime.value = t % 10;
    // 시간 보간
    if (this.timeMode === 'realtime') this.hourTarget = kstHour();
    const dh = this.hourTarget - this.hour;
    this.hour += dh * (1 - Math.exp(-dt * 0.9));
    if (Math.abs(dh) < 0.002) this.hour = this.hourTarget;
    const wv = this.weather.update(dt, this.camera.position, (this.env.night > 0.5 && this.weatherName === 'clear' ? 1 : 0));
    this.wet += ((this.weatherName === 'rain' ? 1 : 0) - this.wet) * (1 - Math.exp(-dt * 0.25));
    this.snow += ((this.weatherName === 'snow' ? 1 : 0) - this.snow) * (1 - Math.exp(-dt * 0.15));
    envUniforms.uWet.value = this.wet;
    envUniforms.uSnow.value = this.snow;
    this._envTimer += dt;
    const moving = Math.abs(dh) > 0.002 || Math.abs(wv.rain - (this._lastRain ?? 0)) > 0.01 || Math.abs(wv.snow - (this._lastSnow ?? 0)) > 0.01;
    if (moving || this._envTimer > 20) {
      this._envTimer = 0;
      this._lastRain = wv.rain;
      this._lastSnow = wv.snow;
      this.applyEnv();
    }

    // 그림자 카메라가 플레이어를 따라다닌다 (텍셀 단위 스냅)
    const p = player.position;
    const ld = this.lightDir || new THREE.Vector3(0, 1, 0);
    const snap = 52 / this.sun.shadow.mapSize.x;
    const cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(cx, p.y, cz);
    this.sun.position.set(cx + ld.x * 60, p.y + Math.max(ld.y, 0.15) * 60, cz + ld.z * 60);
    if (!this.renderer.shadowMap.autoUpdate && this._shadowTick++ % 3 === 0) this.renderer.shadowMap.needsUpdate = true;

    // 점광원: 밤엔 세게, 낮엔 거의 끔
    const night = this.env.night;
    const flick = (k) => 0.85 + Math.sin(t * 13 + k) * 0.06 + Math.sin(t * 7.3 + k * 2) * 0.06 + Math.random() * 0.04;
    const inHall = zoneAt(p.x, p.z) === 'DAEUNGJEON';
    this.points[0].intensity = (inHall ? 2.4 : 0.6) * flick(1) * (0.6 + night * 0.6);
    this.points[1].intensity = (inHall ? 2.4 : 0.6) * flick(2) * (0.6 + night * 0.6);
    this.points[2].intensity = (inHall ? 6 : 2) * (0.7 + night * 0.4);
    this.points[3].intensity = (this.temple.brazierLight || 1) * (1.4 + night * 3) * flick(3);
    this.points[4].intensity = night * 26;
    this.points[5].intensity = night * 3.2 * flick(5);
    this.points[6].intensity = 0.4 + night * 3.2;
    const hand = this.points[7];
    if (nightLanternOn && night > 0.4) {
      hand.position.set(p.x, p.y + 0.9, p.z);
      hand.intensity = night * 2.4 * flick(7);
    } else hand.intensity = 0;

    this.temple.update(dt, t, night);
    this.ripples.update(dt);
    this.sky.position.copy(this.camera.position);
    this._updateCamera(dt, player);
  }

  render() {
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }

  setFocusVignette(on) {
    this.finalPass.uniforms.uFocus.value = on ? 1 : 0;
  }
}

export { walkHeight };
