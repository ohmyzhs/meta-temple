// 바깥 실사 세계 (?world=real) — 걸을 때는 지형·나무·산책로 소품에 사진 질감을 입힌 자연스러운 세계,
// 쉼터에 앉으면 그 자리 쪽 경치를 생성 이미지(gpt-image, docs/art 아트 바이블)로 크게 띄운다.
// templeScene.build() 가 플래그가 켜졌을 때만 동적으로 부른다 — 꺼지면 이 파일도 에셋도 받지 않는다.
// 절차적 세계는 그대로 만들어진 뒤, 여기서 재질·지오메트리만 바꿔 낀다 (위치·개수·충돌은 그대로).
// 에셋: web/assets/world/outdoor/*.ktx2 (tools/outdoor/build.py), 출처: web/assets/world/outdoor/credits.json
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { L, pathX, streamZ, STREAM_HALF, fbm, noise2, smooth, terrainHeight } from '../layout.js';
import { nearestTrail, PATHS, REST_SPOTS } from '../trail.js';
import { weatherable, windSway, mats as sharedMats } from '../materials.js';

const ASSETS = './assets/world/outdoor/';
const BASIS = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/';

/** 정적 병합 전에 부른다 (산책로 소품 재질·UV 를 바꿔 두어야 병합된 뒤에도 남는다) */
export function prepareOutdoor(world) {
  const o = new Outdoor(world);
  world.outdoorReady = o.ready;
  o.prepareProps();
  o.load().then(
    () => (o.ready.done = true),
    (e) => {
      console.warn('[outdoor] 실사 질감 실패, 절차적 그대로:', e);
      o.ready.done = true;
      o.ready.error = String(e);
    }
  );
  return o;
}

/* ───── 공용 셰이더 조각 ───── */

// ETC1S normal-mode 노멀맵: X 는 RGB, Y 는 A — z 를 복원한다
const XY_NORMAL = 'vec3 xyNormal(vec4 t) { vec2 xy = vec2(t.r, t.a) * 2.0 - 1.0; return vec3(xy, sqrt(max(0.04, 1.0 - dot(xy, xy)))); }';
export function xyNormals(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.() || '';
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${XY_NORMAL}`)
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps
          // 접선 공간 줄을 콕 집어서: 같은 식이 위쪽 물체 공간 분기에 먼저 나와, 그냥 replace 하면 그쪽만 바뀌고 X 가 xyz 로 읽혔다
          .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = xyNormal( texture2D( normalMap, vNormalMapUv ) );')
          // UV 가 한 점으로 모인 삼각형(상자 투영의 모서리)에서는 접선이 0 이 되어 NaN → 블룸이 화면 전체로 번진다: 원래 노멀 그대로
          .replace('normal = normalize( tbn * mapN );', '{ vec3 pn = tbn * mapN; if (dot(pn, pn) > 1e-8) normal = normalize(pn); }')
      );
    if (!s.fragmentShader.includes('mapN = xyNormal(')) console.warn('[xyNormals] three 노멀맵 셰이더 조각이 바뀌어 XY 노멀을 못 풀었다');
  };
  mat.customProgramCacheKey = () => `${prevKey}-xyn`;
  return mat;
}

/** 시각별 그림 섞는 비율 [낮, 해질녘(새벽 겸), 밤] */
export function timeWeights(hour, night) {
  const h = ((hour % 24) + 24) % 24;
  const dusk = Math.max(smooth(15.9, 17.4, h) * (1 - smooth(18.7, 19.7, h)), smooth(4.3, 5.1, h) * (1 - smooth(6.3, 7.4, h)));
  const n = Math.min(Math.max(night, 0), 1) * (1 - dusk);
  return [Math.max(0, 1 - dusk - n), dusk, n];
}

const rot2 = (a) => `mat2(${Math.cos(a).toFixed(4)}, ${Math.sin(a).toFixed(4)}, ${(-Math.sin(a)).toFixed(4)}, ${Math.cos(a).toFixed(4)})`;

/* ───── 지면: 사진 질감 6층을 마스크로 섞는다 ───── */
// 층: 0 숲 바닥(이끼·진흙·낙엽) 1 낙엽 2 흙길 3 마사토 4 잔디 5 냇돌 — tools/outdoor/build.py GROUND 순서
const GROUND_LAYERS = [
  { scale: 3.2, rot: 0.0, ns: 0.9 },
  { scale: 2.6, rot: 1.1, ns: 0.8 },
  { scale: 2.4, rot: 2.3, ns: 1.0 },
  { scale: 1.5, rot: 0.6, ns: 0.6 },
  { scale: 2.2, rot: 1.7, ns: 0.7 },
  { scale: 2.0, rot: 2.9, ns: 1.1 },
  { scale: 110, rot: 0.4, ns: 0.8 } // 6 숲 지붕 (먼 산자락: 거리에 따라 숲 바닥·낙엽·냇돌 대신)
];
const CANOPY = { near: 30, far: 75 }; // 이 거리(m)부터 숲 바닥이 위에서 본 숲 지붕으로 바뀐다 (가까이는 3D 나무가 있다)

/** 지면 한 점의 섞음 비율 — terrain.js groundColor 와 같은 마스크를 색 대신 층 비율로 */
function groundSplat(x, z, slope, w) {
  w.fill(0);
  w[0] = 1;
  const mix = (k, i) => {
    if (k <= 0) return;
    for (let j = 0; j < 6; j++) w[j] *= 1 - k;
    w[i] += k;
  };
  const n2 = noise2(x * 0.5, z * 0.5);
  mix(smooth(-0.05, 0.35, fbm(x * 0.13 + 4, z * 0.13 - 2, 2)) * 0.7, 1);
  mix(smooth(0.55, 0.85, slope) * 0.85, 5);
  const dp = Math.abs(x - pathX(z));
  if (z > 5 && z < 50) mix((1 - smooth(1.3, 2.4, dp + n2 * 0.4)) * smooth(52, 46, z), 2);
  const tr = nearestTrail(x, z);
  if (tr) mix((1 - smooth(1.1, 2.1, tr.d + n2 * 0.35)) * 0.92, 2);
  mix((1 - smooth(1.4, STREAM_HALF + 0.6, Math.abs(z - streamZ(x)))) * 0.9, 5);
  const c = L.courtyard;
  if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.05) mix(1, 3);
  const t = L.teahouseTerrace;
  if (x > t.x0 - 1 && z < t.z1 + 1 && z > t.z0 - 1 && x < t.x1 + 1) mix(0.75 - n2 * 0.2, 4);
  const lk = L.teaLink;
  if (x > lk.x0 - 0.3 && x < lk.x1 + 0.6 && z > lk.z0 && z < lk.z1) mix(0.7, 3);
  const p = L.pond;
  mix(1 - smooth(0.85, 1.05, Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz)), 5);
  return w;
}

function splatGeometry(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const a = new Float32Array(pos.count * 4), b = new Float32Array(pos.count * 2), w = new Float32Array(6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    groundSplat(x, z, (1 - nor.getY(i)) * 2.2, w);
    a.set([w[1], w[2], w[3], w[4]], i * 4);
    // 큰 얼룩 밝기 (타일 반복이 덜 보이게): 0.78..1.18
    b[i * 2] = w[5];
    b[i * 2 + 1] = 0.98 + 0.4 * fbm(x * 0.021 + 7, z * 0.021 - 3, 3);
  }
  geo.setAttribute('aSplatA', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aSplatB', new THREE.BufferAttribute(b, 2));
}

function groundMaterial(col, nor, low) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uGroundCol = { value: col };
    s.uniforms.uGroundNor = { value: nor };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplatA; attribute vec2 aSplatB; varying vec4 vSplatA; varying vec2 vSplatB; varying vec3 vSplatW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplatA = aSplatA; vSplatB = aSplatB; vSplatW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const layer = (i, w) => {
      const g = GROUND_LAYERS[i];
      return `if (${w} > 0.004) { vec2 uv = ${rot2(g.rot)} * gp / ${g.scale.toFixed(2)};
        gc += ${w} * texture(uGroundCol, vec3(uv, ${i}.0)).rgb;
        ${low ? '' : `nxy += ${w} * ${g.ns.toFixed(2)} * (${rot2(-g.rot)} * xyNormal(texture(uGroundNor, vec3(uv, ${i}.0))).xy);`} }`;
    };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray uGroundCol; uniform sampler2DArray uGroundNor;\nvarying vec4 vSplatA; varying vec2 vSplatB; varying vec3 vSplatW;\n${XY_NORMAL}`)
      .replace(
        '#include <map_fragment>',
        `vec2 gp = vSplatW.xz; vec3 gc = vec3(0.0); vec2 nxy = vec2(0.0);
        float w0 = clamp(1.0 - dot(vSplatA, vec4(1.0)) - vSplatB.x, 0.0, 1.0);
        float kc = smoothstep(${CANOPY.near.toFixed(1)}, ${CANOPY.far.toFixed(1)}, distance(vSplatW, cameraPosition));
        float w6 = kc * (w0 + vSplatA.x + vSplatB.x);
        w0 *= 1.0 - kc; float w1 = vSplatA.x * (1.0 - kc); float w5 = vSplatB.x * (1.0 - kc);
        ${layer(0, 'w0')} ${layer(1, 'w1')} ${layer(2, 'vSplatA.y')} ${layer(3, 'vSplatA.z')} ${layer(4, 'vSplatA.w')} ${layer(5, 'w5')} ${layer(6, 'w6')}
        diffuseColor.rgb *= gc * vSplatB.y;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        low
          ? ''
          : `{ vec3 nw = (vec4(normal, 0.0) * viewMatrix).xyz; // 뷰 → 월드
             nw = normalize(nw + vec3(nxy.x, 0.0, nxy.y));
             normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`
      );
  };
  mat.customProgramCacheKey = () => `ground-splat-${low}`;
  return weatherable(mat, { snow: 1, wet: 1, trod: true }); // 다져진 길(terrain.js aTrod)은 눈이 덜 쌓인다
}

/* ───── 원경 산세: 생성 사진 띠 3겹 (낮·해질녘·밤을 시간에 맞춰 섞는다) ───── */
const RIDGE_LAYERS = [
  { key: 'near', R: 175, top: 50, order: -1 },
  { key: 'mid', R: 240, top: 74, order: -2 },
  { key: 'far', R: 320, top: 104, order: -3 }
];

function ridgeMesh(layer, uniforms) {
  const n = 256, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    const north = 0.82 + 0.3 * smooth(0.2, -0.9, cz); // 북쪽(주산)이 조금 더 높게 — 옛 띠와 같은 방향
    pos.push(cx * layer.R, -30, cz * layer.R, cx * layer.R, layer.top * north, cz * layer.R);
    uv.push(i / n, 1, i / n, 0);
    if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: PHOTO_FRAG
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(8, 0, -10); // 옛 띠와 같은 중심
  m.renderOrder = layer.order;
  m.frustumCulled = false;
  m.userData.noPick = true;
  return m;
}

// 사진 그림 공용: 시각 셋을 섞고, 흐린 날·안개만큼 지평선 색으로 덮는다. 톤매핑 없이 sRGB 그대로 (사진 색 그대로)
const PHOTO_FRAG = `
  uniform sampler2D tDay, tDusk, tNight; uniform vec3 uW; uniform vec3 uHaze; uniform float uHazeK; uniform float uGain; uniform float uAlpha;
  uniform vec4 uEdge; // x: 좌우 가장자리 흐림 폭 (u), y: 지평선 v (0 이면 끔 — 그 아래 사진은 흐려 없앤다), z: 위쪽 흐림 폭 (v), w: 아래 안개
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDay, vUv) * uW.x + texture2D(tDusk, vUv) * uW.y + texture2D(tNight, vUv) * uW.z;
    float a = c.a * uAlpha;
    // smoothstep(e0, e1) 은 e0 >= e1 이면 정의되지 않는다 (ANGLE/Metal 에서 0) — 폭이 0 이면 흐림 없음
    float ex = uEdge.x > 0.0 ? clamp(min(vUv.x, 1.0 - vUv.x) / uEdge.x, 0.0, 1.0) : 1.0;
    float et = uEdge.z > 0.0 ? clamp(vUv.y / uEdge.z, 0.0, 1.0) : 1.0;
    a *= ex * ex * (3.0 - 2.0 * ex) * et * et * (3.0 - 2.0 * et);
    // 쉼터 경치: 사진의 지평선 아래(앞쪽 숲)는 3D 세계가 맡는다 — 지평선 위 산·하늘만
    if (uEdge.y > 0.0) a *= 1.0 - smoothstep(uEdge.y - 0.015, uEdge.y + 0.05, vUv.y);
    if (a < 0.004) discard;
    vec3 col = mix(c.rgb * uGain, uHaze, clamp(uHazeK + uEdge.w * smoothstep(0.55, 1.0, vUv.y), 0.0, 1.0));
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const photoUniforms = () => ({
  tDay: { value: null },
  tDusk: { value: null },
  tNight: { value: null },
  uW: { value: new THREE.Vector3(1, 0, 0) },
  uHaze: { value: new THREE.Color() },
  uHazeK: { value: 0 },
  uGain: { value: 1 },
  uAlpha: { value: 1 },
  uEdge: { value: new THREE.Vector4(0, 0, 0, 0) }
});

/* ───── 쉼터 경치 (앉아 있는 동안만): 110° 사진 한 장을 그 쉼터 눈높이 둘레 원통에 ───── */
// hz: 사진에서 눈높이 지평선의 위치 (위에서 잰 비율) — 생성 사진마다 다르다 (재서 맞춘 값은 tools/qa/outdoor.mjs 화면으로 확인)
const VISTAS = {
  valley: { hz: 0.6 },
  range: { hz: 0.55 },
  hills: { hz: 0.62 },
  stream: { hz: 0.72 }
};
const SPOT_VISTA = {
  lookout: 'valley',
  mat_ridge: 'valley',
  bench_bamboo: 'range',
  spring: 'hills',
  stump_a: 'hills',
  stump_b: 'hills',
  stump_c: 'hills',
  deck_bench: 'hills',
  bridge: 'stream',
  mat_stream: 'stream',
  bench_stream: 'stream'
};
const VISTA_R = 150, VISTA_FOV = THREE.MathUtils.degToRad(110);

/**
 * 그 쉼터에서 바라보는 쪽 앞산(지형 + 나무 높이)의 스카이라인 높이각 — 둘레 ±30° 의 70 백분위.
 * 사진의 지평선을 여기 맞춰 올려야 사진 속 먼 산이 앞산 위로 보인다 (지평선에 두면 3D 언덕·나무에 다 가린다).
 */
function skyline(spot, dir, eyeY) {
  // 탁 트인 쉼터(전망 바위·능선 돗자리·대숲 벤치: view ≥ 20m)는 앞산 숲 지붕까지(11m) 넘겨 먼 산줄기를 또렷이,
  // 숲속 쉼터는 6m 만 — 더 올리면 사진 속 산자락이 나무 사이 하늘을 막는다
  const treeH = (spot.view ?? 0) >= 20 ? 11 : 6;
  const el = [];
  for (let k = -6; k <= 6; k++) {
    const a = dir + (k / 6) * 0.52;
    let m = -0.2;
    for (let r = 6; r <= VISTA_R; r += 3) {
      const x = spot.x + Math.sin(a) * r, z = spot.z + Math.cos(a) * r;
      m = Math.max(m, Math.atan2(terrainHeight(x, z) + (r > 9 ? treeH : 0) - eyeY, r));
    }
    el.push(m);
  }
  el.sort((a, b) => a - b);
  return el[Math.floor(el.length * 0.7)];
}

function vistaMesh(spot, v, uniforms, eyeY) {
  const f = 0.5 / Math.tan(VISTA_FOV / 2); // 사진 가로 1 = 110° 일 때 초점거리 (가로 단위)
  const aspect = 2 / 3; // 세로/가로
  const dir = spot.vista ? Math.atan2(spot.vista[0] - spot.x, spot.vista[1] - spot.z) : spot.ry;
  const lift = VISTA_R * Math.tan(Math.min(0.2, Math.max(0, skyline(spot, dir, eyeY) - 0.03))); // 앞산보다 1.7° 아래까지 겹치게, 11.5° 까지만
  const yTop = (VISTA_R * (v.hz * aspect)) / f + lift, yBot = (-VISTA_R * ((1 - v.hz) * aspect)) / f + lift;
  const n = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = -VISTA_FOV / 2 + (VISTA_FOV * i) / n, a = dir + t;
    const u = 0.5 + Math.tan(t) * f; // 직선 원근 사진 → 원통 각도
    const x = Math.sin(a) * VISTA_R, z = Math.cos(a) * VISTA_R;
    pos.push(x, yBot, z, x, yTop, z);
    uv.push(u, 1, u, 0);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: PHOTO_FRAG
    })
  );
  m.renderOrder = 0;
  m.frustumCulled = false;
  m.userData.noPick = true;
  return m;
}

/* ───── 나무: 잎 카드 지오메트리 (아틀라스 2×2: 0 전나무 1 소나무 2 단풍 3 대나무) ───── */
function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** 카드 묶음 → BufferGeometry. card: { c:[x,y,z], U:[..](길이 반), V:[..](폭 반), cell, diag, n:[..] 노멀 기준점, ao } */
function cardsGeometry(cards) {
  const P = [], N = [], UV = [], C = [];
  const pad = 0.004;
  for (const k of cards) {
    const u0 = (k.cell % 2) * 0.5 + pad, u1 = u0 + 0.5 - 2 * pad, v0 = Math.floor(k.cell / 2) * 0.5 + pad, v1 = v0 + 0.5 - 2 * pad; // v0 = 그림 위쪽
    const [cx, cy, cz] = k.c, [ux, uy, uz] = k.U, [vx, vy, vz] = k.V;
    // 네 꼭짓점: 정사각 카드는 (−U−V)(+U−V)(+U+V)(−U+V), 대각 카드(전나무 가지)는 밑동−U, 끝+U, 옆 ±V
    const q = k.diag
      ? [[-1, 0, u0, v1], [0, -1, u1, v1], [1, 0, u1, v0], [0, 1, u0, v0]]
      : [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, 1, u0, v0]];
    const vs = q.map(([a, b, tu, tv]) => [cx + ux * a + vx * b, cy + uy * a + vy * b, cz + uz * a + vz * b, tu, tv]);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z, tu, tv] = vs[i];
      P.push(x, y, z);
      const nx = x - k.n[0], ny = y - k.n[1] + 0.6, nz = z - k.n[2], l = Math.hypot(nx, ny, nz) || 1; // 수관 가운데에서 바깥(조금 위)으로
      N.push(nx / l, ny / l, nz / l);
      UV.push(tu, tv);
      const ao = k.ao * (0.75 + 0.25 * Math.min(1, Math.hypot(x - k.n[0], z - k.n[2]) / 2));
      C.push(ao, ao, ao);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

/** 전나무: 층마다 둘레로 뻗은 가지 카드 (vegetation.js firGeometry 의 층 높이·반경 그대로) */
function firCards() {
  const r = rand(41), cards = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6, R = 2.3 * (1 - t * 0.82), h = 3.0 * (1 - t * 0.35), y0 = 2.4 + i * 1.55;
    for (const [layer, k] of [[0, 9 - i], [1, 7 - i]]) {
      for (let j = 0; j < k; j++) {
        const a = ((j + layer * 0.5) / k) * Math.PI * 2 + i * 0.7 + r() * 0.3;
        const ca = Math.cos(a), sa = Math.sin(a);
        const by = y0 + h * (0.62 - layer * 0.12), tipR = R * (layer ? 0.85 : 1.05), ty = y0 + h * (0.08 + layer * 0.1);
        const B = [ca * 0.12, by, sa * 0.12], T = [ca * tipR, ty, sa * tipR];
        const half = Math.hypot(T[0] - B[0], T[1] - B[1], T[2] - B[2]) / 2;
        cards.push({
          c: [(B[0] + T[0]) / 2, (B[1] + T[1]) / 2, (B[2] + T[2]) / 2],
          U: [(T[0] - B[0]) / 2, (T[1] - B[1]) / 2, (T[2] - B[2]) / 2],
          V: [-sa * half * 0.95, (r() - 0.5) * 0.3 * half, ca * half * 0.95],
          cell: 0,
          diag: true,
          n: [0, by - 0.6, 0],
          ao: 0.62 + t * 0.45 + layer * 0.08
        });
      }
    }
  }
  // 꼭대기: 위로 선 가지 둘
  const top = 2.4 + 5 * 1.55 + 3.0 * (1 - (5 / 6) * 0.35);
  for (const a of [0, Math.PI / 2]) {
    cards.push({ c: [0, top - 0.9, 0], U: [0, 0.95, 0], V: [Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95], cell: 0, diag: true, n: [0, top - 2, 0], ao: 1.1 });
  }
  return cardsGeometry(cards);
}

/** 소나무: 솔잎 덩어리마다 위를 보는 큰 판 + 둘레로 기운 판 (pineCrownGeometry 와 같은 씨앗으로 같은 자리) */
function pineCards() {
  const r = rand(17), cards = [];
  for (let i = 0; i < 6; i++) {
    const sx = 1.9 + r() * 0.8, sy = 0.55 + r() * 0.2, sz = 1.6 + r() * 0.6;
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 1 + r() * 1.6;
    const cx = Math.cos(a) * d + (i === 0 ? 0 : 0.6), cy = 6.6 + i * 0.55 - (i > 3 ? 1.6 : 0) + r() * 0.5, cz = Math.sin(a) * d;
    const rr = (sx + sz) / 2;
    cards.push({ c: [cx, cy + sy * 0.3, cz], U: [rr * 1.05, 0.08, 0], V: [0, -0.08, rr * 1.05], cell: 1, n: [cx, cy - 1, cz], ao: 1.05 });
    for (let k = 0; k < 4; k++) {
      const b = (k / 4) * Math.PI * 2 + i, cb = Math.cos(b), sb = Math.sin(b);
      const ox = cx + cb * rr * 0.55, oz = cz + sb * rr * 0.55;
      cards.push({ c: [ox, cy, oz], U: [cb * rr * 0.62, -0.32 * rr, sb * rr * 0.62], V: [-sb * rr * 0.72, 0, cb * rr * 0.72], cell: 1, n: [cx, cy - 1, cz], ao: 0.82 });
    }
  }
  return cardsGeometry(cards);
}

/** 단풍: 둥근 덩어리마다 엇갈린 잎 판 셋 (mapleCrownGeometry 와 같은 씨앗) */
function mapleCards() {
  const r = rand(31), q = rand(77), cards = [];
  for (let i = 0; i < 12; i++) {
    const rad = 0.85 + r() * 0.5, a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.8 + r() * 1.3;
    const cx = Math.cos(a) * d, cy = 4.0 + r() * 2.2 - d * 0.35, cz = Math.sin(a) * d;
    for (let k = 0; k < 3; k++) {
      const yaw = q() * Math.PI, tilt = (q() - 0.5) * 1.2, s = rad * 1.15;
      const U = [Math.cos(yaw) * s, Math.sin(tilt) * s * 0.5, Math.sin(yaw) * s];
      const V = [-Math.sin(yaw) * Math.cos(tilt) * s * 0.6, Math.cos(tilt) * s, Math.cos(yaw) * Math.cos(tilt) * s * 0.6];
      cards.push({ c: [cx, cy, cz], U, V, cell: 2, n: [0, 4.2, 0], ao: 0.85 + (cy - 3.5) * 0.12 });
    }
  }
  return cardsGeometry(cards);
}

/** 대나무 잎: 줄기 꼭대기 쪽 늘어진 잎 판 (인스턴스 비례 x·z 0.45h, y h 를 되돌려 설계) */
function bambooCards() {
  const r = rand(7), cards = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r() * 0.5, y = 0.7 + r() * 0.22;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.13 / 0.45, h = 0.12; // 폭 ≈ 1.3m, 높이 ≈ 1.2m (h=10 일 때)
    cards.push({ c: [ca * w * 0.6, y, sa * w * 0.6], U: [-sa * w, 0, ca * w], V: [ca * w * 0.3, h, sa * w * 0.3], cell: 3, n: [0, y - 0.2, 0], ao: 0.9 + (y - 0.7) });
  }
  return cardsGeometry(cards);
}

/** 잎 카드 재질: 알파 자르기 (멀수록 문턱을 낮춰 밉맵에서 잎이 비어 보이지 않게), 바람·날씨는 원래 재질과 같은 값 */
function foliageMat(atlas, sway, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0, ...extra });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.fragmentShader = s.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `{ vec2 px = vMapUv * vec2(${atlas.image?.width || 2048}.0); float lod = max(0.0, log2(max(length(dFdx(px)), length(dFdy(px)))));
         diffuseColor.a *= 1.0 + lod * 0.28; }
       #include <alphatest_fragment>`
    );
  };
  mat.customProgramCacheKey = () => `foliage-card`;
  weatherable(mat, { snow: 0.9, wet: 0.4 });
  windSway(mat, sway);
  const depth = windSway(new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.42, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), sway);
  return { mat, depth };
}

/* ───── 원경 나무 (멀리서만 보이는 나무는 그림 한 장으로): 원기둥 빌보드 ───── */
// 칸 0 전나무 1 소나무 2 단풍 (impostor.ktx2, 가로 2048 = 칸 셋) — 칸 높이(1024px)가 나타내는 실제 높이(m, 나무 비례 1 기준)
const IMP = [
  { h: 15.6, cellW: 2048 / 3 / 1024 },
  { h: 11.2, cellW: 2048 / 3 / 1024 },
  { h: 7.8, cellW: 2048 / 3 / 1024 }
];

function impostorMesh(tex, items) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const cell = new Float32Array(items.length);
  const mesh = new THREE.InstancedMesh(geo, null, items.length);
  const o = new THREE.Object3D();
  items.forEach(({ x, y, z, s, kind }, i) => {
    o.position.set(x, y, z);
    o.scale.set(IMP[kind].h * IMP[kind].cellW * s, IMP[kind].h * s, 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    cell[i] = kind;
  });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1));
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.9 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((aCell + uv.x) / 3.0, 1.0 - uv.y);')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(vec3(0.0, 0.45, 1.0));')
      .replace(
        '#include <project_vertex>',
        `vec3 ic = instanceMatrix[3].xyz; vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.0);
         vec3 toCam = cameraPosition - ic; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
         vec3 right = vec3(toCam.z, 0.0, -toCam.x);
         vec3 wp = ic + right * position.x * sc.x + vec3(0.0, position.y * sc.y, 0.0);
         vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
         gl_Position = projectionMatrix * mvPosition;`
      );
  };
  mat.customProgramCacheKey = () => 'impostor-billboard';
  mesh.material = mat;
  mesh.frustumCulled = false;
  mesh.userData.noPick = true;
  return mesh;
}

/* ───── 산책로 소품: 상자 투영 UV (미터 단위) — 정적 병합 전에 ───── */
// 질감 한 장이 덮는 실제 크기(m). plank: 판 14장짜리 사진 → 판재 한 장(0.27m)에 판 하나가 오게
const PROP_TILE = { plank: 3.8, post: 2.4, granite: 1.6, mossy: 1.6 };
// 사진에 곱하는 색: 화강암은 조금 어둡게 (판재 밝기는 build.py 에서 아트 바이블 마루 색으로 고침)
const PROP_TINT = { plank: 0xffffff, post: 0xffffff, granite: 0xb4b0aa, mossy: 0xffffff };

function boxUV(mesh, tile, boardStep = 0) {
  const g = mesh.geometry.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  const sc = new THREE.Vector3();
  mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  const uv = new Float32Array(p.count * 2);
  const off = boardStep ? Math.floor(Math.random() * 14) * boardStep : 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * sc.x, y = p.getY(i) * sc.y, z = p.getZ(i) * sc.z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) [u, v] = [x, z];
    else if (ax >= az) [u, v] = [z, y];
    else [u, v] = [x, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile + off;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
}

/* ───── 본체 ───── */
class Outdoor {
  constructor(world) {
    this.world = world;
    this.low = world.quality === 'low';
    // 폰(좁은 화면·터치)은 1K 예산: 큰 아틀라스·원경 띠는 _lo
    this.small = this.low || matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.ready = { done: false };
    this.ridgeU = [];
    this.vista = null; // { spotId, mesh, u, k(0..1 나타남), want }
    this._seatT = 0;
    this._tex = new Map();
  }

  _ktx() {
    if (!this.ktx2) this.ktx2 = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(this.world.renderer);
    return this.ktx2;
  }

  tex(name, { repeat = true, srgb = true } = {}) {
    if (!this._tex.has(name)) {
      this._tex.set(
        name,
        this._ktx()
          .loadAsync(`${ASSETS}${name}.ktx2`)
          .then((t) => {
            t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = Math.min(8, this.world.renderer.capabilities.getMaxAnisotropy());
            t.needsUpdate = true;
            return t;
          })
      );
    }
    return this._tex.get(name);
  }

  /** 산책로 소품(trailProps.js 가 userData.trailProp 을 단 묶음)의 공용 재질을 복제본으로 바꾸고 UV 를 미터 단위로 */
  prepareProps() {
    const W = this.world;
    W.scene.updateMatrixWorld(true);
    const shared = sharedMats();
    this.propMats = {
      plank: xyNormals(weatherable(new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.85 }), { snow: 0.9, wet: 0.7 })),
      post: xyNormals(new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.88 })),
      granite: xyNormals(weatherable(new THREE.MeshStandardMaterial({ color: 0x9d9a94, roughness: 0.9 }), { snow: 1, wet: 1 })), // 사진 질감이 오면 색은 0xb4b0aa (밝은 화강암이 눈처럼 뜨지 않게)
      mossy: xyNormals(weatherable(new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.92 }), { snow: 1, wet: 1 }))
    };
    const kindOf = new Map([
      [shared.woodLight, 'plank'],
      [shared.woodDark, 'post'],
      [shared.granite, 'granite'],
      [shared.stoneDark, 'mossy']
    ]);
    let n = 0;
    W.scene.traverse((g) => {
      if (!g.userData.trailProp) return;
      g.traverse((o) => {
        const k = o.isMesh && !o.isInstancedMesh && kindOf.get(o.material);
        if (!k) return;
        boxUV(o, PROP_TILE[k], k === 'plank' ? 1 / 14 : 0);
        o.material = this.propMats[k];
        n++;
      });
    });
    this.propCount = n;
  }

  async load() {
    const W = this.world, sm = this.small ? '_lo' : '';
    const w = timeWeights(W.hour, W.env.night);
    const first = ['day', 'dusk', 'night'][w.indexOf(Math.max(...w))];
    // 먼저: 지금 시각의 원경 띠 + 지면 + 나무 + 소품 (첫 입장 예산), 그다음 다른 시각 띠
    await Promise.all([
      this._ridges(first),
      this._ground(),
      this._trees(sm),
      this._props()
    ]);
    this._ridgeWant = new Set([first]); // 다른 시각 띠는 그 시각이 다가올 때 받는다 (update) — 첫 입장 예산 밖
  }

  /* 지면 */
  async _ground() {
    const [col, nor] = await Promise.all([this.tex('ground_col'), this.low ? null : this.tex('ground_nor', { srgb: false })]);
    const mat = groundMaterial(col, nor, this.low);
    for (const m of this.world.terrain.ground) {
      splatGeometry(m.geometry);
      m.material = mat;
    }
  }

  /* 원경 띠 */
  async _ridges(first) {
    const sm = this.small ? '_lo' : '';
    this.ridgeMeshes = RIDGE_LAYERS.map((Lr) => {
      const u = photoUniforms();
      u.uEdge.value.set(0, 0, 0.02, 0.5);
      this.ridgeU.push({ u, Lr });
      return ridgeMesh(Lr, u);
    });
    const ts = await Promise.all(RIDGE_LAYERS.map((Lr) => this.tex(`ridge_${Lr.key}_${first}${sm}`, { repeat: true })));
    ts.forEach((t, i) => {
      t.wrapT = THREE.ClampToEdgeWrapping;
      const u = this.ridgeU[i].u;
      this.ridgeU[i].loaded = { [first]: t }; // 다른 시각이 오기 전까지는 이 그림 하나로 (_setPhoto)
    });
    for (const m of this.world.terrain.ridges) m.visible = false;
    this.ridgeMeshes.forEach((m) => this.world.scene.add(m));
  }

  async _ridgeVariant(v) {
    this._ridgeWant.add(v);
    const sm = this.small ? '_lo' : '';
    const ts = await Promise.all(RIDGE_LAYERS.map((Lr) => this.tex(`ridge_${Lr.key}_${v}${sm}`)));
    ts.forEach((t, i) => {
      t.wrapT = THREE.ClampToEdgeWrapping;
      this.ridgeU[i].loaded[v] = t;
    });
  }

  /* 나무 */
  async _trees(sm) {
    const V = this.world.veg;
    if (!V?.meshes) return;
    const [atlas, imp, bf, bfn, bp, bpn, bm, bmn] = await Promise.all([
      this.tex(`foliage${sm}`, { repeat: false }),
      this.tex(`impostor${sm}`, { repeat: false }),
      this.tex('bark_fir_col'),
      this.tex('bark_fir_nor', { srgb: false }),
      this.tex('bark_pine_col'),
      this.tex('bark_pine_nor', { srgb: false }),
      this.tex('bark_maple_col'),
      this.tex('bark_maple_nor', { srgb: false })
    ]);
    const M = V.meshes;
    const card = (inst, geo, sway) => {
      const { mat, depth } = foliageMat(atlas, sway);
      inst.geometry = geo;
      inst.material = mat;
      inst.customDepthMaterial = depth;
    };
    card(M.firF, firCards(), { strength: 0.03, height: 12 });
    M.firF.material.color.set(0xaab8a6); // 전나무는 사진 가지보다 짙고 푸르게 (아트 바이블 솔잎 진녹 #30402E 쪽)
    card(M.pineF, pineCards(), { strength: 0.035, height: 9 });
    card(M.mapleF, mapleCards(), { strength: 0.04, height: 7 });
    if (M.bambooLeaf) card(M.bambooLeaf, bambooCards(), { strength: 0.1, height: 1, flutter: 0.02 });
    // 단풍 인스턴스 색: 그림이 이미 붉으니 밝은 색 변주만 (홍·주황·노랑 느낌은 그림이 낸다)
    const tints = ['#ffffff', '#ffe2cc', '#fff0d0', '#ffd6c8', '#f4ffe0'].map((h) => new THREE.Color(h));
    const r = rand(5);
    for (let i = 0; i < M.mapleF.count; i++) M.mapleF.setColorAt(i, tints[Math.floor(r() * tints.length)]);
    if (M.mapleF.instanceColor) M.mapleF.instanceColor.needsUpdate = true;
    // 줄기: 나무껍질 (원기둥 UV: u 둘레, v 높이 / 소나무는 관 UV: u 길이, v 둘레 → 90° 돌림)
    const bark = (inst, map, nor, rx, ry, rotate = false, sway) => {
      for (const t of [map, nor]) {
        t.repeat.set(rx, ry);
        if (rotate) {
          t.center.set(0.5, 0.5);
          t.rotation = Math.PI / 2;
        }
      }
      let mat = xyNormals(new THREE.MeshStandardMaterial({ map, normalMap: nor, roughness: 0.95, metalness: 0 }));
      if (sway) mat = windSway(mat, sway);
      inst.material = mat;
    };
    bark(M.firT, bf, bfn, 2, 2.5);
    M.firT.material.color.set(0x9a8c7c); // 졸참나무 사진의 이끼·지의류가 멀리서 하얗게 뜨지 않게
    bark(M.pineT, bp, bpn, 1.2, 6, true, { strength: 0.03, height: 9 });
    bark(M.mapleT, bm, bmn, 1.5, 3.5);
    this._impostors(imp);
  }

  /** 산책로·마당·쉼터에서 먼 나무는 잎·줄기 인스턴스에서 빼고 그림 카드로 (정해 두고 바꾸지 않는다 — 위치·개수 그대로) */
  _impostors(tex) {
    const V = this.world.veg, M = V.meshes, spots = V.spots;
    const D = this.low ? 18 : 24; // 걷는 곳에서 이만큼(m) 넘게 떨어진 나무만 — 순환로가 숲 전체를 감싸서 대부분은 실제 나무로 남는다
    // 걷는 곳 표본점 → 8m 격자
    const pts = [];
    for (const P of PATHS) for (const p of P.pts) pts.push([p.x, p.z]);
    for (let z = -2; z <= 56; z += 1.5) pts.push([pathX(z), z]);
    for (const r of [L.courtyard, L.teahouseTerrace, L.hall]) for (let x = r.x0; x <= r.x1; x += 3) for (let z = r.z0; z <= r.z1; z += 3) pts.push([x, z]);
    for (const s of REST_SPOTS) pts.push([s.x, s.z]);
    const grid = new Map(), C = 8;
    for (const [x, z] of pts) {
      const k = `${Math.floor(x / C)},${Math.floor(z / C)}`;
      (grid.get(k) || grid.set(k, []).get(k)).push([x, z]);
    }
    const far = (x, z) => {
      const gx = Math.floor(x / C), gz = Math.floor(z / C), R = Math.ceil(D / C);
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const [px, pz] of grid.get(`${gx + i},${gz + j}`) || []) if ((px - x) ** 2 + (pz - z) ** 2 < D * D) return false;
      return true;
    };
    const items = [];
    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const kinds = [
      ['fir', M.firF, M.firT],
      ['pine', M.pineF, M.pineT],
      ['maple', M.mapleF, M.mapleT]
    ];
    kinds.forEach(([k, F, T], kind) => {
      const list = spots[k];
      const near = [], farIdx = [];
      list.forEach(([x, z], i) => (far(x, z) ? farIdx : near).push(i));
      if (!farIdx.length) return;
      // 가까운 나무를 앞으로 모으고 count 를 줄인다 (instanceMatrix 버퍼·최대 개수는 그대로)
      const mats = list.map((_, i) => (F.getMatrixAt(i, m4), m4.clone()));
      const tm = list.map((_, i) => (T.getMatrixAt(i, m4), m4.clone()));
      const cols = F.instanceColor ? list.map((_, i) => {
        const c = new THREE.Color();
        F.getColorAt(i, c);
        return c;
      }) : null;
      near.forEach((src, dst) => {
        F.setMatrixAt(dst, mats[src]);
        T.setMatrixAt(dst, tm[src]);
        if (cols) F.setColorAt(dst, cols[src]);
      });
      F.count = T.count = near.length;
      F.boundingSphere = T.boundingSphere = null;
      F.instanceMatrix.needsUpdate = T.instanceMatrix.needsUpdate = true;
      if (cols) F.instanceColor.needsUpdate = true;
      for (const i of farIdx) {
        mats[i].decompose(pos, q, sc);
        items.push({ x: pos.x, y: pos.y, z: pos.z, s: sc.y, kind });
      }
      (this.impostorStats ||= {})[k] = { near: near.length, far: farIdx.length };
    });
    if (!items.length) return;
    this.impostor = impostorMesh(tex, items);
    this.world.scene.add(this.impostor);
  }

  /* 산책로 소품 (+ terrain.js 의 길가·계곡 바위: 이끼 낀 돌 사진, 둥근 UV 그대로) */
  async _props() {
    const P = this.propMats;
    this.world.scene.traverse((o) => {
      if (!o.userData.rocks) return;
      const mat = xyNormals(weatherable(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), { snow: 1, wet: 1 }));
      this.tex('mossy_col').then(async (c) => {
        const n = await this.tex('mossy_nor', { srgb: false });
        const cc = c.clone(), nn = n.clone();
        for (const t of [cc, nn]) (t.repeat.set(2, 1), (t.needsUpdate = true));
        mat.map = cc;
        mat.normalMap = nn;
        o.material = mat;
      });
    });
    await Promise.all(
      Object.entries(P).map(async ([k, mat]) => {
        const [c, n] = await Promise.all([this.tex(`${k}_col`), this.tex(`${k}_nor`, { srgb: false })]);
        mat.map = c;
        mat.normalMap = n;
        mat.normalScale.set(0.9, 0.9);
        mat.color.set(PROP_TINT[k]);
        mat.needsUpdate = true;
      })
    );
  }

  /* 쉼터 경치: 지금 앉은 쉼터 (아바타 뿌리가 앉는 자리에 0.3m 안으로 0.8초 머물면) */
  _seatSpot(player) {
    const p = player.position;
    for (const s of REST_SPOTS) if ((s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 0.09) return s;
    return null;
  }

  async _openVista(spot) {
    const key = SPOT_VISTA[spot.id];
    if (!key) return;
    const W = this.world, sm = this.small ? '_lo' : '';
    const u = photoUniforms();
    u.uEdge.value.set(0.14, VISTAS[key].hz, 0.16, 0);
    u.uAlpha.value = 0;
    const eye = (W.temple?.trail?.spots.find((q) => q.id === spot.id)?.y ?? 0) + 0.8;
    const mesh = vistaMesh(spot, VISTAS[key], u, eye);
    mesh.position.set(spot.x, eye, spot.z);
    const v = (this.vista = { spotId: spot.id, mesh, u, k: 0, want: 1, loaded: {} });
    const w = timeWeights(W.hour, W.env.night);
    const order = ['day', 'dusk', 'night'].sort((a, b) => w[['day', 'dusk', 'night'].indexOf(b)] - w[['day', 'dusk', 'night'].indexOf(a)]);
    const name = (t) => `vista_${key}${t === 'day' ? '' : '_' + t}${sm}`;
    try {
      const t0 = await this.tex(name(order[0]), { repeat: false });
      if (this.vista !== v) return;
      v.loaded[order[0]] = t0;
      W.scene.add(mesh);
      for (const t of order.slice(1)) this.tex(name(t), { repeat: false }).then((tx) => (v.loaded[t] = tx), () => {});
    } catch (e) {
      console.warn('[outdoor] 쉼터 경치 못 받음', key, e);
    }
  }

  _closeVista() {
    if (this.vista) this.vista.want = 0;
  }

  /** 시각 그림 셋 중 받은 것만으로 섞는다 */
  _setPhoto(u, loaded, w) {
    const vs = ['day', 'dusk', 'night'];
    const have = vs.filter((v) => loaded[v]);
    if (!have.length) return;
    const ws = vs.map((v, i) => (loaded[v] ? w[i] : 0));
    let sum = ws.reduce((a, b) => a + b, 0);
    if (sum < 1e-3) {
      // 지금 시각 그림이 아직 없으면 가장 가까운 것 하나로
      ws[vs.indexOf(have[0])] = 1;
      sum = 1;
    }
    u.tDay.value = loaded.day || loaded[have[0]];
    u.tDusk.value = loaded.dusk || loaded[have[0]];
    u.tNight.value = loaded.night || loaded[have[0]];
    u.uW.value.set(ws[0] / sum, ws[1] / sum, ws[2] / sum);
  }

  update(dt, player) {
    const W = this.world;
    const w = timeWeights(W.hour, W.env.night);
    // 지평선 안개 색·흐림: applyEnv 가 정한 하늘·안개 색을 따른다
    const sky = W.skyMat.uniforms;
    const haze = W.scene.fog.color.clone().lerp(sky.uHorizon.value, 0.5);
    const overcast = Math.max(W.weather.rainU.uAmount.value, W.weather.snowU.uAmount.value * 0.8);
    // 밤엔 그림이 이미 어두우니 노출만 조금 맞춘다 (재서 정한 값은 보고서 참고)
    const gain = 1 - 0.12 * w[2];
    if (this._ridgeWant) ['day', 'dusk', 'night'].forEach((v, i) => w[i] > 0.001 && !this._ridgeWant.has(v) && this._ridgeVariant(v).catch((e) => console.warn('[outdoor] 원경 띠', v, e)));
    this.ridgeU.forEach(({ u, loaded }, i) => {
      if (!loaded) return;
      this._setPhoto(u, loaded, w);
      u.uHaze.value.copy(haze);
      u.uHazeK.value = Math.min(0.85, overcast * (0.55 + i * 0.15) + 0.04 * i);
      u.uGain.value = gain;
    });
    // 쉼터 경치
    const s = this._seatSpot(player);
    if (s && SPOT_VISTA[s.id]) {
      this._seatT += dt;
      if (this._seatT > 0.8 && this.vista?.spotId !== s.id) {
        if (this.vista) this._dropVista();
        this._openVista(s);
      } else if (this.vista?.spotId === s.id) this.vista.want = 1;
    } else {
      this._seatT = 0;
      this._closeVista();
    }
    const v = this.vista;
    if (v) {
      if (Object.keys(v.loaded).length) v.k += (v.want - v.k) * (1 - Math.exp(-dt * 1.6));
      this._setPhoto(v.u, v.loaded, w);
      v.u.uAlpha.value = smooth(0, 1, v.k) * (1 - overcast * 0.6);
      v.u.uHaze.value.copy(haze);
      v.u.uHazeK.value = overcast * 0.5;
      v.u.uGain.value = gain;
      if (v.want === 0 && v.k < 0.01) this._dropVista();
    }
  }

  _dropVista() {
    const v = this.vista;
    if (!v) return;
    v.mesh.removeFromParent();
    v.mesh.geometry.dispose();
    v.mesh.material.dispose();
    this.vista = null;
  }
}
