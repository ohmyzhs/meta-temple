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

// 실사 세계 기능 플래그 — 기본 켬 (2026-11-06 사용자 결정). 롤백은 맨 끝 기본값 하나(false = 절차적 세계). 방문별로 ?world=real | ?world=classic
// 켜지면 build() 가 ./real/realWorld.js 를 동적으로 받는다 (계획: docs/superpowers/plans/2026-11-05-launch-stage3-real.md)
const REAL_WORLD = ((w) => (w === 'real' ? true : w === 'classic' ? false : true))(new URLSearchParams(location.search).get('world'));

/* ───── 시간대 키프레임 (KST 시각) ───── */
const KEYS = [
  { h: 0, elev: 38, az: 150, light: '#a9bde6', li: 1.35, top: '#101b2f', hor: '#2a3a5a', fog: '#1f2a42', fd: 0.01, hemiS: '#5d7099', hemiG: '#1c1a18', hi: 1.05, exp: 1.3, night: 1, stars: 1, cloud: '#2a3348' },
  { h: 4.4, elev: 30, az: 120, light: '#a9bde6', li: 1.25, top: '#121e34', hor: '#2c3c5c', fog: '#212c44', fd: 0.011, hemiS: '#5d7099', hemiG: '#1c1a18', hi: 1.0, exp: 1.3, night: 1, stars: 0.9, cloud: '#2a3348' },
  { h: 5.0, elev: -6, az: 80, light: '#7c8fb8', li: 0.18, top: '#141e30', hor: '#55627a', fog: '#47526a', fd: 0.034, hemiS: '#4b5a7a', hemiG: '#1a1814', hi: 0.55, exp: 1.05, night: 0.75, stars: 0.35, cloud: '#56617a' },
  { h: 6.4, elev: 4, az: 82, light: '#ffb07a', li: 1.6, top: '#5b7aa6', hor: '#eab38e', fog: '#b9a596', fd: 0.02, hemiS: '#9fb2cc', hemiG: '#3a3026', hi: 0.6, exp: 1.0, night: 0.2, stars: 0, cloud: '#e8b9a0' },
  { h: 9, elev: 32, az: 120, light: '#fff1dc', li: 3.0, top: '#3270c4', hor: '#a4c6e6', fog: '#b0c7dc', fd: 0.006, hemiS: '#b4cdea', hemiG: '#4a4232', hi: 0.8, exp: 1.08, night: 0, stars: 0, cloud: '#f8f8f6' },
  { h: 13, elev: 56, az: 180, light: '#fff6e6', li: 3.3, top: '#2c6cc8', hor: '#9ec4e8', fog: '#acc6de', fd: 0.005, hemiS: '#b8d2ee', hemiG: '#4e4634', hi: 0.85, exp: 1.08, night: 0, stars: 0, cloud: '#ffffff' },
  { h: 16.4, elev: 24, az: 240, light: '#ffe2b8', li: 2.9, top: '#3468b4', hor: '#b2c8e0', fog: '#b8c4ce', fd: 0.006, hemiS: '#c2cad6', hemiG: '#4e4030', hi: 0.75, exp: 1.06, night: 0, stars: 0, cloud: '#f8eadc' },
  { h: 18.0, elev: 3, az: 268, light: '#ff8a4c', li: 2.2, top: '#3a4675', hor: '#e08458', fog: '#a7765f', fd: 0.012, hemiS: '#8a7a8c', hemiG: '#3a2a20', hi: 0.55, exp: 1.06, night: 0.5, stars: 0, cloud: '#f0a070' },
  { h: 19.1, elev: -7, az: 285, light: '#6a6a9a', li: 0.4, top: '#161b36', hor: '#5e4256', fog: '#2e2a3a', fd: 0.014, hemiS: '#4a4c6a', hemiG: '#14100c', hi: 0.55, exp: 1.0, night: 0.9, stars: 0.4, cloud: '#4a3a4c' },
  { h: 22, elev: 40, az: 160, light: '#a9bde6', li: 1.35, top: '#101b2f', hor: '#2a3a5a', fog: '#1f2a42', fd: 0.01, hemiS: '#5d7099', hemiG: '#1c1a18', hi: 1.05, exp: 1.3, night: 1, stars: 1, cloud: '#2a3348' },
  { h: 24, elev: 38, az: 150, light: '#a9bde6', li: 1.35, top: '#101b2f', hor: '#2a3a5a', fog: '#1f2a42', fd: 0.01, hemiS: '#5d7099', hemiG: '#1c1a18', hi: 1.05, exp: 1.3, night: 1, stars: 1, cloud: '#2a3348' }
];
export const PRESET_HOURS = { dawn: 5.0, day: 13, sunset: 18.0, night: 22 };

/* 맑은 낮 색 보정(finalPass) — 1 에 더하는 양. tools/qa/day.mjs 로 재서 맞춘 값 */
const DAY_GRADE = { sat: 0.18, contrast: 0.06 };

/*
 * 카메라 팔 — 3인칭 RPG 방식 (Unreal SpringArm 의 굵은 광선 검사 + Unity Cinemachine Deoccluder 의 '거리 지키며 비키기').
 * 머리 높이 초점에서 원하는 카메라 자리로 굵은 팔(반지름 r)을 뻗어 막히는지 본다. 막히면
 *  1) 같은 거리를 지키며 좌우로 조금(yaws) 돌아 트인 방위를 찾는다 — 연등 기둥·나무줄기처럼 가는 것은 줌 없이 비킨다.
 *  2) 그래도 막히면 막힌 곳 앞으로 바로 당긴다(들어올 때는 그 프레임에 — 벽·기둥 속이 화면을 덮지 않게), 트이면 천천히(outRate) 다시 늘인다.
 * 가림체를 투명하게 비우지 않는다 (사용자 2026-11-06 「투명화 말고 가리지 않게 쫓아다니는 카메라」). tools/qa/camera.mjs·occlusion.mjs 로 확인.
 */
const ARM = {
  r: 0.3, // 팔 굵기 (카메라 근평면이 물체에 닿지 않을 만큼)
  ahead: 0.7, // 미리 보는 굵기: 카메라 쪽 끝(cap)에서만 더한다 — 닿기 전에 비키기 시작하고, 못 비키면 미리 부드럽게 당긴다
  cap: 3, // 굵게 보는 구간: 팔 끝에서 이만큼 (머리 쪽까지 굵게 보면 벽·나무 옆을 걷기만 해도 당겨진다)
  mid: 0.4, // 머리에서 midFrom 너머 팔 가운데를 조금 굵게: 팔 가운데로 들어오는 석등·석탑을 미리 본다
  midFrom: 2.5,
  margin: 0.25, // 막힌 면 앞 여유
  minDist: 1.0, // 아무리 당겨도 초점에서 이만큼은
  yaws: [0.1, 0.2, 0.32, 0.46, 0.6], // 비켜 볼 방위 (rad, 좌우 각각) — 최대 약 34°
  clear: 0.94, // 원하는 거리의 이 비율까지 트이면 '트임'
  avoidRate: 3.5, // 비키는 방위로 도는 빠르기 (1/s)
  avoidFast: 10, // 가는 팔이 이미 막혔을 때 비키는 빠르기 (줌으로 튀는 것보다 빨리 돌아 비킨다)
  inRate: 2.2, // 미리 보는 팔에 걸려 부드럽게 당기는 빠르기 (1/s) — 진짜 팔에 걸리면 그 프레임에 바로
  outRate: 1.8, // 당겼던 팔이 다시 늘어나는 빠르기 (1/s)
  followRate: 1.1, // 탑돌이·눌러서 걸어가기 동안 등 뒤로 따라 도는 빠르기 (1/s)
  followHold: 1500, // 손으로 화면을 돌린 뒤 이 시간(ms) 동안은 따라 돌지 않는다
  zoomRate: 8 // 막힌 것이 없을 때 거리 바뀜(손 확대·축소)을 따르는 빠르기 (1/s)
};
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// 실내 규칙: 카메라 높이는 천장·처마 밑에서 0.4m 아래까지만.
// 법당 우물천장 밑면 7.38m(마루 3.0 + 기둥 4.4 − 0.02), 처마 밑 최저 7.54m / 심검당 처마 밑 최저 4.77m (layout.js ROOF_COVERS, 위로 쏜 광선으로 잰 값)
// 다실 가는 길은 머리(약 2.45m)에서 처마 밑 4.37m 까지 1.92m 이므로 거리 5m 면 기울기 0.39rad 까지
const HALL_CAM = { dist: 5.2, pitch: 0.42, maxY: 7.38 - 0.4 };
const PASSAGE_CAM = { dist: 5.0, pitch: 0.39, maxY: 4.77 - 0.4 };

/* 밤하늘 세기 — tools/qa/night.mjs 로 재서 맞춘 값 */
const NIGHT_SKY = { MW_CORE: 0.006, MW_WIDE: 0.03, MW_GAIN: 0.07, STAR_FAINT: 0.7, STAR_MID: 3.0, STAR_BRIGHT: 5.0, MOON_DISK: 3.0 };
// 은하수 대원의 극 — 띠는 북북동(방위 15°) 지평선에서 가파르게 솟아 서북서 하늘 79° 를 지나 남남서로 진다
// (산문·마당에서 북쪽을 보면 오른쪽 하늘에 비스듬히 선 띠)
const MILKY_POLE = new THREE.Vector3(0.966, 0.2, 0.259).normalize();
/**
 * 밤 노출 하한 (밤 정도 e.night 에 비례). 해 진 뒤 달빛이 오르기 전(19~20시)이 가장 어둡다:
 * 숲길 산문 구도 평균 루마가 낮(13시)의 18.3%(키값만) → 20.6%(하한 1.3)로, 밤 내내 20% 아래로 내려가지 않는다.
 */
export const NIGHT_EXPOSURE_FLOOR = 1.3;

const _ca = new THREE.Color(), _cb = new THREE.Color();
const _UP = new THREE.Vector3(0, 1, 0);
const _armA = new THREE.Vector3(), _armB = new THREE.Vector3(), _armC = new THREE.Vector3(), _armD = new THREE.Vector3();
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
    defines: Object.fromEntries(Object.entries(NIGHT_SKY).map(([k, v]) => [k, v.toFixed(4)])),
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uStars: { value: 0 },
      uMilkyPole: { value: MILKY_POLE },
      uMilky: { value: 1 },
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
      uniform vec3 uSunDir, uMoonDir, uMilkyPole;
      uniform float uSunVis, uStars, uCloudAmt, uTime, uMilky;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1, 0), 1.0)), c = hash(vec3(i + vec2(0, 1), 1.0)), d = hash(vec3(i + vec2(1, 1), 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
      float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s / 0.875; }
      // 별 한 겹: 방향을 N 격자로 나눠 칸마다 문턱을 넘으면 칸 안 임의 위치에 둥근 별 하나
      float stars(vec3 d, float N, float thr) {
        vec3 q = d * N, g = floor(q);
        float s = hash(g);
        if (s < thr) return 0.0;
        vec3 c = g + 0.5 + (vec3(hash(g + 3.1), hash(g + 7.7), hash(g + 1.3)) - 0.5) * 0.5;
        float b = (s - thr) / (1.0 - thr);
        return smoothstep(0.6, 0.0, length(q - c)) * (0.3 + 0.7 * b * b);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, uBottom, smoothstep(0.02, -0.12, h));
        // 태양 광륜
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6) * uSunVis;
        col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunVis * step(0.0, uSunDir.y + 0.02);
        // 밤하늘: 은하수 띠 + 세 겹의 별 + 달·달무리
        if (uStars > 0.01 && h > -0.05) {
          float hz = smoothstep(-0.02, 0.2, h) * uStars; // 지평선 쪽은 옅은 남빛에 묻힌다
          float lat = dot(d, uMilkyPole); // 띠 중심선에서 벗어난 정도 (sin 위도)
          float nb = fbm3(d * 5.0), nf = fbm3(d * 14.0 + 7.0);
          float core = exp(-lat * lat / MW_CORE), wide = exp(-lat * lat / MW_WIDE);
          float mw = (core * (0.45 + 1.1 * nb) + wide * 0.3) * (0.7 + 0.6 * nf);
          // 가운데를 가르는 검은 먼지 띠
          float rift = exp(-pow((lat - 0.012 + 0.05 * (nb - 0.5)) / 0.032, 2.0)) * smoothstep(0.4, 0.65, n3(d * 7.0 + 3.0));
          mw *= 1.0 - 0.7 * rift;
          col += vec3(0.6, 0.66, 0.84) * mw * MW_GAIN * uMilky * hz;
          float tw = 0.75 + 0.25 * sin(uTime * (1.3 + nf * 3.0) + nf * 60.0);
          float dens = core * 0.025; // 띠 안은 별이 더 촘촘하다
          float st = stars(d, 600.0, 0.972 - dens) * STAR_FAINT + stars(d, 320.0, 0.982 - dens * 0.4) * STAR_MID + stars(d, 150.0, 0.995) * STAR_BRIGHT;
          col += vec3(0.92, 0.95, 1.0) * st * tw * hz;
        }
        // 달 원반(바다 무늬) + 달빛 번짐 + 22° 달무리
        float md = dot(d, normalize(uMoonDir));
        float disk = smoothstep(0.99962, 0.99972, md);
        if (disk > 0.0) disk *= 0.82 + 0.18 * n3(d * 900.0);
        float glow = pow(max(md, 0.0), 900.0) * 0.6 + pow(max(md, 0.0), 40.0) * 0.12;
        float ring = exp(-pow((acos(clamp(md, -1.0, 1.0)) - 0.384) / 0.018, 2.0)) * 0.035;
        col += vec3(0.88, 0.91, 1.0) * (disk * MOON_DISK + glow + ring) * uStars * step(-0.02, uMoonDir.y);
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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uFocus: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uFocus, uSat, uContrast; varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // NaN 한 점은 그 점만 검게 (비교는 NaN 이면 모두 거짓 — 아래 clamp 는 NaN 을 정하지 않는다)
      if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r <= 4.0 && c.g <= 4.0 && c.b <= 4.0)) c.rgb = vec3(0.0);
      // 맑은 낮 색 보정: 채도·대비 (밤에는 1)
      float y = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = clamp(mix(vec3(y), c.rgb, uSat), 0.0, 1.0);
      c.rgb = clamp((c.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
      vec2 q = vUv - 0.5;
      float v = 1.0 - dot(q, q) * (uVignette + uFocus * 1.4) * 2.2;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (rnd(vUv * 731.0) - 0.5) * 0.018;
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.95), 0.6);
      gl_FragColor = c;
    }`
};

/**
 * 블룸 입력 거르기. 폰 GPU 에서 반사광 한 점이 half float(65504)를 넘거나(Inf) NaN 이 되면, 블룸의 작은 해상도 흐림이
 * 그 한 점을 화면에 정렬된 검은 네모로 번지게 한다 (사용자 2026-11-06: 탑돌이 중 번쩍이는 검은 직사각형, 시간 바꾼 뒤 검은 땅).
 * 흐림에 들어가기 전에 그런 점은 빼고, 아주 밝은 점은 BLOOM_MAX 로 누른다. tools/qa/bloom-nan.mjs 가 Inf·NaN 을 일부러 넣어 확인한다.
 */
const BLOOM_MAX = 32;
function sanitizeBloom(bloom) {
  const m = bloom.materialHighPassFilter;
  const at = 'vec4 texel = texture2D( tDiffuse, vUv );';
  if (!m.fragmentShader.includes(at)) return console.warn('[post] 블룸 셰이더가 바뀌어 입력 거르기를 못 붙였습니다');
  m.fragmentShader = m.fragmentShader.replace(
    at,
    `${at}
    if (!(texel.r >= 0.0 && texel.g >= 0.0 && texel.b >= 0.0 && texel.r < 60000.0 && texel.g < 60000.0 && texel.b < 60000.0)) texel = vec4(0.0);
    texel.rgb = min(texel.rgb, vec3(${BLOOM_MAX.toFixed(1)}));`
  );
  m.needsUpdate = true;
}

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
    if (REAL_WORLD) this.real = (await import('./real/realWorld.js')).prepareReal(this); // 정적 병합 전에 교체 자리를 빼 둔다
    this._buildCrownGrid(this.veg.crowns);
    this.occluders = this._collectOccluders(); // 정적 병합 전에: 합친 뒤에는 지붕·벽과 나머지가 한 메쉬가 된다
    if (REAL_WORLD) this.outdoor = (await import('./real/outdoor.js')).prepareOutdoor(this); // 바깥 실사: 소품 재질을 병합 전에 바꿔 둔다
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

  /**
   * 카메라 가림체: 지붕·담·벽·천장(architecture.js·temple.js 가 userData.occluder 로 표시).
   * 광선 검사용 양면 대리 메쉬(장면에 넣지 않음) — 카메라 팔이 이것을 뚫고 나가지 않는다.
   */
  _collectOccluders() {
    this.scene.updateMatrixWorld(true);
    const proxyMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const out = [];
    this.scene.traverse((o) => {
      const kind = o.userData.occluder;
      if (!kind || !o.isMesh || o.isInstancedMesh) return;
      const p = new THREE.Mesh(o.geometry, proxyMat);
      p.matrixAutoUpdate = false;
      p.matrix.copy(o.matrixWorld);
      p.matrixWorld.copy(o.matrixWorld);
      p.userData.kind = kind;
      out.push(p);
    });
    this.occRay = new THREE.Raycaster();
    return out;
  }

  /**
   * 초점 focus 에서 dir(단위 벡터) 쪽으로 len 만큼 뻗은 굵은 카메라 팔(반지름 ARM.r)이 어디까지 트였나 (m).
   *  · 지붕·담·벽·천장: 대리 메쉬에 광선 다섯 줄 (가운데 + 굵기만큼 위·아래·좌·우)
   *  · 기둥·석등·탑 기단·연등 기둥·나무줄기 (layout 충돌체): 높이 h 인 세로 기둥 — 반지름은 팔 굵기만큼 키운다
   *  · 나무 수관 (crownGrid): 수관 아래~위 원기둥
   * 초점이 이미 안에 든 것(앉은 의자·나무 밑)은 뺀다 — 그것까지 막힘으로 보면 팔이 늘 0 이 된다.
   */
  _armFree(focus, dir, len, extra = 0, from = 0) {
    let free = len;
    const r = ARM.r, rv = r + extra; // rv: 굵기 (extra 는 from 부터 끝까지만 — 카메라 쪽 끝을 굵게 볼 때)
    if (this.occluders) {
      const side = _armA.crossVectors(dir, _UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize().multiplyScalar(rv);
      const up = _armB.crossVectors(side, dir).normalize().multiplyScalar(rv);
      const ray = this.occRay;
      for (let i = 0; i < 5; i++) {
        const o = _armC.copy(focus).addScaledVector(dir, from);
        if (i === 1) o.add(side);
        else if (i === 2) o.sub(side);
        else if (i === 3) o.add(up);
        else if (i === 4) o.sub(up);
        ray.set(o, dir);
        ray.near = 0;
        ray.far = free - from;
        if (ray.far <= 0) break;
        const h = ray.intersectObjects(this.occluders, false)[0];
        if (h) free = from + h.distance;
      }
    }
    const fx = focus.x, fy = focus.y, fz = focus.z, dx = dir.x, dy = dir.y, dz = dir.z;
    // 선분 t∈(0, free) 가 높이 [yLo, yHi] 사이에 있는 t 구간과 XZ 구간 [t0, t1] 이 겹치는 첫 t
    const enterY = (t0, t1, yLo, yHi) => {
      let s0 = -Infinity, s1 = Infinity;
      if (Math.abs(dy) > 1e-6) {
        const a = (yLo - fy) / dy, b = (yHi - fy) / dy;
        s0 = Math.min(a, b);
        s1 = Math.max(a, b);
      } else if (fy < yLo || fy > yHi) return Infinity;
      const t = Math.max(t0, s0, from);
      return t <= Math.min(t1, s1) ? t : Infinity;
    };
    // XZ 원: 처음부터 안이면 Infinity (뺀다)
    const circle = (cx, cz, R) => {
      const ox = fx - cx, oz = fz - cz, a = dx * dx + dz * dz;
      const c0 = ox * ox + oz * oz - R * R;
      if (c0 <= 0 || a < 1e-9) return null;
      const b = ox * dx + oz * dz, disc = b * b - a * c0;
      if (disc < 0) return null;
      const q = Math.sqrt(disc);
      return [(-b - q) / a, (-b + q) / a];
    };
    const box = (x0, z0, x1, z1) => {
      if (fx > x0 && fx < x1 && fz > z0 && fz < z1) return null;
      let t0 = -Infinity, t1 = Infinity;
      for (const [o, d, lo, hi] of [[fx, dx, x0, x1], [fz, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) return null;
          continue;
        }
        const a = (lo - o) / d, b = (hi - o) / d;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
      }
      return t0 <= t1 ? [t0, t1] : null;
    };
    const ex = fx + dx * free, ez = fz + dz * free; // 거리로 먼저 거를 선분 끝
    const near = (x, z, R) => {
      const vx = ex - fx, vz = ez - fz, l2 = vx * vx + vz * vz;
      const u = l2 > 1e-9 ? clamp(((x - fx) * vx + (z - fz) * vz) / l2, 0, 1) : 0;
      return Math.hypot(fx + vx * u - x, fz + vz * u - z) < R;
    };
    for (const c of colliders) {
      const isC = c.type === 'c';
      const cx = isC ? c.x : (c.x0 + c.x1) / 2, cz = isC ? c.z : (c.z0 + c.z1) / 2;
      const R = isC ? c.r + rv : Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 + rv;
      if (!near(cx, cz, R)) continue;
      // 초점이 충돌체 자체 안이면(앉은 의자) 뺀다. 굵기 띠 안에만 들었으면(석탑 기단에 붙어 걸음) 그 충돌체만 굵기를 줄여 본다 —
      // 통째로 빼면 한 걸음 떨어지는 순간 팔이 갑자기 막혀 튄다
      const edge = isC ? Math.hypot(fx - c.x, fz - c.z) - c.r : Math.hypot(Math.max(c.x0 - fx, 0, fx - c.x1), Math.max(c.z0 - fz, 0, fz - c.z1));
      if (edge <= 0) continue;
      const pad = Math.min(rv, edge - 0.02);
      const span = isC ? circle(cx, cz, c.r + pad) : box(c.x0 - pad, c.z0 - pad, c.x1 + pad, c.z1 + pad);
      if (!span) continue;
      const base = terrainHeight(cx, cz);
      const t = enterY(span[0], span[1], base - 1, base + c.h + pad);
      if (t < free) free = t;
    }
    if (this.crownGrid) {
      const g0x = Math.floor(Math.min(fx, ex) / 6) - 1, g1x = Math.floor(Math.max(fx, ex) / 6) + 1;
      const g0z = Math.floor(Math.min(fz, ez) / 6) - 1, g1z = Math.floor(Math.max(fz, ez) / 6) + 1;
      for (let gx = g0x; gx <= g1x; gx++)
        for (let gz = g0z; gz <= g1z; gz++) {
          const list = this.crownGrid.get(`${gx},${gz}`);
          if (!list) continue;
          for (const [x, z, cr, y0, y1] of list) {
            const span = circle(x, z, cr + extra);
            if (!span) continue;
            const base = terrainHeight(x, z);
            const t = enterY(span[0], span[1], base + y0 - 0.6, base + y1);
            if (t < free) free = t;
          }
        }
    }
    return Math.max(0, free);
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
    sanitizeBloom(this.bloom);
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
    sky.uCloudAmt.value = 0.35 + overcast * 0.65;
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
    this.renderer.toneMappingExposure = Math.max(e.exp, NIGHT_EXPOSURE_FLOOR * e.night);
    envUniforms.uNight.value = e.night;
    const clearDay = (1 - e.night) * (1 - overcast);
    this.finalPass.uniforms.uSat.value = 1 + DAY_GRADE.sat * clearDay;
    this.finalPass.uniforms.uContrast.value = 1 + DAY_GRADE.contrast * clearDay;
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
      u.uFade.value = 0.12 + li * 0.18 + overcast * 0.3;
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
    this.cam.userTurnAt = performance.now(); // 손으로 돌린 동안은 등 뒤 따라 돌기를 멈춘다
    // 1인칭은 끌어서 돈 만큼을 main.js 가 몸·시선에 함께 나눠 준다
    if (this.cam.mode === 'first') this.cam.turn = (this.cam.turn || 0) - dx * 0.0055;
    else this.cam.yaw -= dx * 0.0055;
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

  /**
   * 예불 듣기: 정해 둔 자리에서 천천히 흐르는 카메라. shot = { pos, to?, look, lookTo?, dur } (to 가 없으면 고정).
   * null 이면 평소 카메라로 돌아간다. snap 이면 그 자리로 바로 끊어 옮긴다 (가림막 뒤에서).
   */
  setShot(shot, snap = false) {
    const c = this.cam;
    c.shot = shot;
    if (!shot) return;
    shot.t = 0;
    c.look ||= shot.look.clone();
    if (snap) {
      this.camera.position.copy(shot.pos);
      c.look.copy(shot.look);
    }
  }

  /** 가림막 뒤에서 카메라를 정한 구도로 바로 놓는다 — 다음 프레임에 초점·거리·위치를 보간 없이 */
  snapCameraTo(yaw, pitch, dist) {
    Object.assign(this.cam, { yaw, pitch, targetDist: dist, dist, snap: true });
  }

  _updateCamera(dt, player) {
    const c = this.cam;
    const p = player.position;
    player.visible = true;
    if (c.shot) {
      const s = c.shot;
      s.t += dt;
      const u = 0.5 - 0.5 * Math.cos(Math.min(s.t / s.dur, 1) * Math.PI);
      const pos = s.to ? s.pos.clone().lerp(s.to, u) : s.pos;
      const look = s.lookTo ? s.look.clone().lerp(s.lookTo, u) : s.look;
      const k = 1 - Math.exp(-dt * 4);
      this.camera.position.lerp(pos, k);
      c.look.lerp(look, k);
      this.camera.lookAt(c.look);
      return;
    }
    c.dist += (c.targetDist - c.dist) * (1 - Math.exp(-dt * 6));
    const inHall = zoneAt(p.x, p.z) === 'DAEUNGJEON';
    if (c.mode === 'first') {
      const av = player.userData.avatar;
      const target = av ? av.eyeWorld(new THREE.Vector3()) : new THREE.Vector3(p.x, p.y + (player.userData.eyeHeight ?? 1.5), p.z);
      this.camera.position.lerp(target, 1 - Math.exp(-dt * 12));
      // 내 몸(연꽃 정령·삿갓·머리)이 눈앞을 가리므로 1인칭에서는 내 화면에서만 숨긴다 — 다른 도반에게는 그대로 보인다
      player.visible = this.camera.position.distanceTo(target) > 0.9;
      // 3인칭과 같은 규약: yaw 0 = 북쪽(-z)을 봄, pitch 양수 = 아래를 봄
      const look = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
      this.camera.lookAt(this.camera.position.clone().add(look));
      c.arm = null;
      return;
    }
    const focusY = (player.userData.focusHeight ?? 1.25);
    const focus = new THREE.Vector3(p.x, p.y + focusY, p.z);
    if (c.snap) c.focus.copy(focus);
    else c.focus.lerp(focus, 1 - Math.exp(-dt * 8));
    // 탑돌이·눌러서 걸어가기: 등 뒤로 천천히 따라 돈다 (손으로 돌린 직후·키로 걷는 동안은 main.js 가 follow 를 비운다)
    if (c.follow != null && performance.now() - (c.userTurnAt || 0) > ARM.followHold) {
      c.yaw += wrapA(c.follow - Math.PI - c.yaw) * (1 - Math.exp(-dt * ARM.followRate));
    }
    // 실내 규칙: 법당 안, 다실 가는 담 사이 길에서는 낮고 가깝게
    const lk = L.teaLink;
    const inPassage = !inHall && p.x > lk.x0 - 0.5 && p.x < lk.x1 + 1.5 && p.z > lk.z0 && p.z < lk.z1;
    const room = inHall ? HALL_CAM : inPassage ? PASSAGE_CAM : null;
    let dist = c.dist;
    let pitch = c.pitch;
    if (room) {
      dist = Math.min(dist, room.dist);
      pitch = Math.min(pitch, room.pitch);
    }
    // 카메라 팔: 막히면 같은 거리로 비키고(방위), 그래도 막히면 그 앞으로 당긴다
    const armT0 = performance.now();
    const arm = (c.arm ||= { avoid: 0, len: dist });
    if (c.snap) Object.assign(arm, { avoid: 0, len: dist });
    const dirAt = (off, out = new THREE.Vector3()) => out.set(Math.sin(c.yaw + off) * Math.cos(pitch), Math.sin(pitch), Math.cos(c.yaw + off) * Math.cos(pitch));
    const capFrom = Math.max(0, dist - ARM.cap);
    // 판단: 가는 팔 전체 + 카메라 쪽 끝을 굵게 — 둘 중 먼저 막히는 곳
    const midFrom = Math.min(ARM.midFrom, dist * 0.4);
    const freeAt = (off) => {
      const d = dirAt(off, _armD);
      return Math.min(this._armFree(c.focus, d, dist), this._armFree(c.focus, d, dist, ARM.mid, midFrom), this._armFree(c.focus, d, dist, ARM.ahead, capFrom));
    };
    const need = dist * ARM.clear;
    let goal = arm.avoid;
    if (Math.abs(arm.avoid) > 1e-3 && freeAt(0) >= need && freeAt(arm.avoid / 2) >= need) goal = 0; // 원래 방위로 돌아가는 길이 트였으면
    else if (freeAt(arm.avoid) < need) {
      // 지금 방위에서 가장 가까운 트인 방위 (없으면 그대로 두고 당긴다)
      let best = null;
      for (const d of ARM.yaws)
        for (const sgn of [1, -1]) {
          const off = sgn * d;
          if (best !== null && Math.abs(off - arm.avoid) >= Math.abs(best - arm.avoid)) continue;
          if (freeAt(off) >= need) best = off;
        }
      if (best !== null) goal = best;
    } else if (Math.abs(arm.avoid) <= 1e-3) goal = 0;
    const thinBlocked = this._armFree(c.focus, dirAt(arm.avoid, _armD), dist) < dist - 1e-3;
    arm.avoid += (goal - arm.avoid) * (c.snap ? 1 : 1 - Math.exp(-dt * (thinBlocked ? ARM.avoidFast : ARM.avoidRate)));
    const dir = dirAt(arm.avoid);
    // 길이: 미리 보는 팔(soft)은 부드럽게 따라가고, 진짜 팔(hard)에 걸리면 그 프레임에 바로 — 둘 중 짧은 쪽
    const fit = (free) => (free >= dist - 1e-3 ? dist : Math.max(ARM.minDist, free - ARM.margin));
    const hard = fit(this._armFree(c.focus, dir, dist));
    // 카메라 쪽 끝 cap 만 굵게: 당긴 자리에서 다시 보며(최대 세 번) 카메라 둘레가 트인 길이를 찾는다
    let softFree = Math.min(hard >= dist ? dist : hard + ARM.margin, this._armFree(c.focus, dir, dist, ARM.mid, midFrom));
    for (let k = 0; k < 3; k++) {
      const f = this._armFree(c.focus, dir, softFree, ARM.ahead, Math.max(0, softFree - ARM.cap));
      if (f >= softFree - 1e-3) break;
      softFree = Math.max(ARM.minDist + ARM.margin, f);
    }
    const soft = fit(softFree);
    arm.sincePull = (arm.sincePull ?? 99) + dt;
    if (softFree < dist - 1e-3) arm.sincePull = 0; // 무언가에 걸려 있다 — 풀린 뒤 한동안은 천천히 늘어난다
    if (c.snap || arm.soft == null) arm.soft = soft;
    else {
      const rate = soft < arm.soft ? ARM.inRate : arm.sincePull < 1.5 ? ARM.outRate : ARM.zoomRate;
      arm.soft += (soft - arm.soft) * (1 - Math.exp(-dt * rate));
    }
    if (hard < arm.soft) arm.soft = hard; // 진짜 팔이 막혔으면 거기서부터 다시 늘어난다
    arm.len = Math.min(arm.soft, hard);
    this.armMs = (this.armMs ?? 0) * 0.9 + (performance.now() - armT0) * 0.1;
    const pos = c.focus.clone().addScaledVector(dir, arm.len);
    if (inHall) {
      // 법당 벽 안쪽, 앞은 처마 밖(z −15)까지
      pos.x = clamp(pos.x, L.hall.x0 + 0.5, L.hall.x1 - 0.5);
      pos.z = clamp(pos.z, L.hall.z0 + 0.5, -15);
    }
    if (room) pos.y = Math.min(pos.y, room.maxY);
    const ground = terrainHeight(pos.x, pos.z) + 0.5;
    if (pos.y < ground) pos.y = ground;
    this.camera.position.copy(pos);
    this.camera.lookAt(c.focus);
    c.snap = false;
  }

  /* ───── 프레임 ───── */
  update(dt, t, player, nightLanternOn) {
    this.real?.update(dt, player);
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

    this.outdoor?.update(dt, player);
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
