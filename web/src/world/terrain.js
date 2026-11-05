/**
 * 지형 · 원경 산세 · 계곡/연못 물 · 바위 · 박석길
 */
import * as THREE from 'three';
import {
  L,
  terrainHeight,
  pathX,
  pathY,
  streamZ,
  STREAM_WATER_Y,
  STREAM_HALF,
  fbm,
  noise2,
  smooth,
  clamp,
  addCircleCollider
} from './layout.js';
import { nearestTrail, trail, REST_SPOTS } from './trail.js';
import { groundDetailTexture, waterNormalTexture, graniteTextures } from './textures.js';
import { weatherable, envUniforms, mats } from './materials.js';

const C = (hex) => new THREE.Color(hex);
const COL = {
  moss: C('#4b5a2c'),
  mossDark: C('#36421f'),
  leaves: C('#7a5532'),
  leavesRed: C('#8a3f22'),
  dirt: C('#8c7656'),
  dirtDark: C('#6d5a41'),
  court: C('#cdbf9e'),
  courtEdge: C('#b4a582'),
  rock: C('#7a776c'),
  bed: C('#4a4840'),
  lawn: C('#5f6d34'),
  slopeGreen: C('#3e4f2a'),
  slopeHigh: C('#4a5a35')
};

function groundColor(x, z, h, slope, out) {
  const n = fbm(x * 0.08, z * 0.08, 3);
  const n2 = noise2(x * 0.5, z * 0.5);
  // 기본: 이끼 + 낙엽 (11월 산사)
  out.copy(COL.moss).lerp(COL.mossDark, clamp(0.5 + n, 0, 1));
  const leaf = smooth(-0.05, 0.35, fbm(x * 0.13 + 4, z * 0.13 - 2, 2));
  out.lerp(n2 > 0.1 ? COL.leavesRed : COL.leaves, leaf * 0.7);
  // 산비탈
  const hill = smooth(4, 14, h);
  out.lerp(COL.slopeHigh, hill * 0.6);
  out.lerp(COL.rock, smooth(0.55, 0.85, slope) * 0.85);

  // 숲길
  const dp = Math.abs(x - pathX(z));
  if (z > 5 && z < 50) {
    const pathMask = (1 - smooth(1.3, 2.4, dp + n2 * 0.4)) * smooth(52, 46, z);
    out.lerp(n2 > 0 ? COL.dirt : COL.dirtDark, pathMask);
  }
  // 순환 산책로 흙길
  const tr = nearestTrail(x, z);
  if (tr) out.lerp(n2 > 0 ? COL.dirt : COL.dirtDark, (1 - smooth(1.1, 2.1, tr.d + n2 * 0.35)) * 0.92);
  // 계곡 바닥
  const sd = Math.abs(z - streamZ(x));
  out.lerp(COL.bed, (1 - smooth(1.4, STREAM_HALF + 0.6, sd)) * 0.9);
  // 마당 마사토
  const c = L.courtyard;
  if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.05) {
    const edge = Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z);
    out.copy(COL.court).lerp(COL.courtEdge, (1 - smooth(0, 1.6, edge)) * 0.6 + n2 * 0.15);
  }
  // 다실 마당 잔디
  const t = L.teahouseTerrace;
  if (x > t.x0 - 1 && z < t.z1 + 1 && z > t.z0 - 1 && x < t.x1 + 1) {
    out.lerp(COL.lawn, 0.75 - n2 * 0.2);
  }
  const lk = L.teaLink;
  if (x > lk.x0 - 0.3 && x < lk.x1 + 0.6 && z > lk.z0 && z < lk.z1) out.lerp(COL.court, 0.7);
  // 연못 바닥
  const p = L.pond;
  const pd = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
  out.lerp(COL.bed, 1 - smooth(0.85, 1.05, pd));
  return out;
}

function buildGroundMesh(x0, x1, z0, z1, res, holeFn) {
  const w = x1 - x0, d = z1 - z0;
  const nx = Math.round(w / res), nz = Math.round(d / res);
  const geo = new THREE.PlaneGeometry(w, d, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const e = 0.6;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = terrainHeight(x, z);
    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    const slope = 1 - 1 / Math.hypot(hx / (2 * e), hz / (2 * e), 1);
    if (holeFn && holeFn(x, z)) h -= 2.5;
    pos.setY(i, h);
    groundColor(x, z, h, slope * 2.2, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildTerrain(scene, quality) {
  const detail = groundDetailTexture();
  const mkMat = (rep) => {
    const map = detail.color.clone();
    map.repeat.set(rep, rep);
    map.needsUpdate = true;
    const nm = detail.normal.clone();
    nm.repeat.set(rep, rep);
    nm.needsUpdate = true;
    return weatherable(
      new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, metalness: 0 }),
      { snow: 1, wet: 1 }
    );
  };
  // 가까운 경내: 촘촘한 격자
  const IN = { x0: -62, x1: 62, z0: -58, z1: 62 }; // 순환 산책로(서쪽 x -51, 남쪽 z 52)와 그 둘레 6.5m 가 0.45m 격자 안에 들게
  const res = quality === 'low' ? 0.7 : 0.45;
  const inner = new THREE.Mesh(buildGroundMesh(IN.x0, IN.x1, IN.z0, IN.z1, res), mkMat(52));
  inner.receiveShadow = true;
  inner.name = 'ground';
  scene.add(inner);
  // 바깥 산자락: 성긴 격자, 안쪽은 아래로 숨김
  const hole = (x, z) => x > IN.x0 + 1 && x < IN.x1 - 1 && z > IN.z0 + 1 && z < IN.z1 - 1;
  const outer = new THREE.Mesh(buildGroundMesh(-190, 210, -210, 200, 3, hole), mkMat(140));
  outer.receiveShadow = true;
  scene.add(outer);

  const water = buildWater(scene);
  const ridges = buildRidges(scene);
  buildRocks(scene);
  buildFlagstones(scene);
  return { ground: [inner, outer], water, ridges };
}

/* ───── 물 (계곡·연못 공용 셰이더) ───── */
export const waterUniforms = {
  uTime: envUniforms.uTime,
  uNormal: { value: null },
  uSkyTop: { value: new THREE.Color('#7fa6c4') },
  uSkyHorizon: { value: new THREE.Color('#c9d6dc') },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
  uSunColor: { value: new THREE.Color('#fff2d8') },
  uDeep: { value: new THREE.Color('#1e3a36') },
  uNight: envUniforms.uNight,
  uRain: { value: 0 }
};

function waterMaterial(flow, scale) {
  waterUniforms.uNormal.value = waterNormalTexture();
  return new THREE.ShaderMaterial({
    uniforms: { ...waterUniforms, uFlow: { value: flow }, uScale: { value: scale }, ...THREE.UniformsLib.fog },
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uNormal; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uDeep; uniform vec2 uFlow; uniform float uScale;
      uniform float uNight; uniform float uRain;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vWorld.xz * uScale;
        vec3 n1 = texture2D(uNormal, uv + uFlow * uTime).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, uv * 1.7 - uFlow.yx * uTime * 0.7 + 0.37).xyz * 2.0 - 1.0;
        vec3 n = normalize(vec3(n1.x + n2.x, 6.0 - uRain * 3.0, n1.y + n2.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.5, 0.0, 1.0));
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 180.0) * (1.0 - uNight * 0.8);
        vec3 col = mix(uDeep, sky, 0.18 + fres * 0.75) + uSunColor * spec * 1.6;
        float alpha = mix(0.78, 0.95, fres);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
}

function buildWater(scene) {
  // 계곡: 중심선을 따라 띠
  const segs = 120, half = STREAM_HALF - 0.6;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const x = -48 + (96 * i) / segs;
    const zc = streamZ(x);
    pos.push(x, STREAM_WATER_Y, zc - half, x, STREAM_WATER_Y, zc + half);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const stream = new THREE.Mesh(g, waterMaterial(new THREE.Vector2(0.09, 0.012), 0.22));
  stream.renderOrder = 2;
  scene.add(stream);

  const p = L.pond;
  const pg = new THREE.CircleGeometry(1, 48);
  pg.rotateX(-Math.PI / 2);
  const pond = new THREE.Mesh(pg, waterMaterial(new THREE.Vector2(0.008, 0.005), 0.3));
  pond.scale.set(p.rx + 0.15, 1, p.rz + 0.15);
  pond.position.set(p.x, p.waterY, p.z);
  pond.renderOrder = 2;
  scene.add(pond);
  return { stream, pond };
}

/* ───── 원경 산세 (수묵 겹산) ───── */
export const ridgeUniforms = [];
function buildRidges(scene) {
  const layers = [
    { R: 175, H: 46, base: '#3f5040', seed: 1 },
    { R: 240, H: 70, base: '#5a6a68', seed: 2 },
    { R: 320, H: 96, base: '#7d8b90', seed: 3 }
  ];
  const meshes = [];
  layers.forEach((Lr, li) => {
    const n = 360;
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      const ridge = 0.5 + 0.5 * fbm(cx * 2.2 + Lr.seed * 7, cz * 2.2 - Lr.seed * 3, 5);
      const peaks = Math.pow(Math.abs(noise2(cx * 4 + Lr.seed, cz * 4)), 0.6);
      // 북쪽(-z)이 더 높게: 주산
      const north = 0.75 + 0.5 * smooth(0.2, -0.9, cz);
      const top = Lr.H * (0.25 + 0.75 * ridge * (0.6 + 0.4 * peaks)) * north;
      const r = Lr.R * (1 + 0.06 * noise2(cx * 3, cz * 3 + li));
      pos.push(cx * r, -30, cz * r, cx * r, top, cz * r);
      if (i < n) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const u = {
      uColor: { value: new THREE.Color(Lr.base) },
      uHorizon: { value: new THREE.Color('#c9d6dc') },
      uFade: { value: 0.25 + li * 0.25 },
      uTop: { value: Lr.H * 1.2 },
      uNight: envUniforms.uNight
    };
    ridgeUniforms.push({ u, base: new THREE.Color(Lr.base), li });
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.DoubleSide,
      depthWrite: true,
      vertexShader: `
        varying float vY;
        void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform vec3 uHorizon; uniform float uFade; uniform float uTop;
        varying float vY;
        void main() {
          float t = clamp(vY / uTop, 0.0, 1.0);
          float mist = 1.0 - smoothstep(-0.05, 0.55, t);
          vec3 c = mix(uColor, uHorizon, clamp(uFade + mist * 0.85, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(8, 0, -10);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  });
  return meshes;
}

/* ───── 바위 ───── */
function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const k = 1 + 0.28 * noise2(v.x * 1.7 + 3, v.z * 1.7 + v.y * 1.3) + 0.12 * noise2(v.x * 4, v.y * 4);
    v.multiplyScalar(k);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildRocks(scene) {
  const r = rand(4242);
  const items = [];
  // 계곡 양안
  for (let i = 0; i < 70; i++) {
    const x = -30 + r() * 60;
    const side = r() > 0.5 ? 1 : -1;
    const z = streamZ(x) + side * (1.6 + r() * 2.2);
    if (Math.abs(x - L.bridge.x) < 2.4) continue;
    items.push([x, z, 0.35 + r() * 0.75, true]);
  }
  // 물속 돌
  for (let i = 0; i < 26; i++) {
    const x = -26 + r() * 52;
    if (Math.abs(x - L.bridge.x) < 2) continue;
    items.push([x, streamZ(x) + (r() - 0.5) * 2, 0.25 + r() * 0.35, false]);
  }
  // 숲길 가장자리
  for (let i = 0; i < 46; i++) {
    const z = 8 + r() * 40;
    const side = r() > 0.5 ? 1 : -1;
    const x = pathX(z) + side * (2.4 + r() * 4);
    if (Math.abs(z - streamZ(x)) < 3) continue;
    items.push([x, z, 0.25 + r() * 0.6, false]);
  }
  // 산자락 큰 바위
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = 45 + r() * 50;
    items.push([8 + Math.cos(a) * d, Math.sin(a) * d, 1.2 + r() * 2.8, false]);
  }
  // 순환 산책로 가장자리 (충돌 없음 — 길을 막지 않게)
  for (let s = 3; s < trail.length - 3; s += 2.6 + r() * 3) {
    const a = trail.at(s - 0.5), c = trail.at(s + 0.5), m = trail.at(s);
    const l = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    const side = r() > 0.5 ? 1 : -1, off = 1.9 + r() * 1.4;
    const x = m.x - ((c.z - a.z) / l) * side * off, z = m.z + ((c.x - a.x) / l) * side * off;
    if (REST_SPOTS.some((q) => Math.hypot(q.x - x, q.z - z) < 2.6) || Math.abs(z - streamZ(x)) < 3.2) continue;
    if ((nearestTrail(x, z)?.d ?? 0) < 1.7) continue;
    items.push([x, z, 0.18 + r() * 0.42, false]);
  }
  // 연못 둘레
  const p = L.pond;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.2;
    items.push([p.x + Math.cos(a) * (p.rx + 0.35), p.z + Math.sin(a) * (p.rz + 0.35), 0.25 + r() * 0.3, false]);
  }
  // 산책로를 막는 큰 바위는 뺀다 (길가 작은 돌은 위에서 일부러 둔 것)
  const keep = items.filter(([x, z, s]) => (nearestTrail(x, z)?.d ?? 99) > (s < 0.45 ? 1.6 : Math.max(1.7, s * 0.9 + 1.3))); // 징검다리 줄·다리 밑에도 돌을 두지 않는다
  items.length = 0;
  items.push(...keep);
  const gr = graniteTextures();
  const mat = weatherable(new THREE.MeshStandardMaterial({ map: gr.color, normalMap: gr.normal, color: 0x9a978c, roughness: 0.9 }), { snow: 1, wet: 1 });
  const inst = new THREE.InstancedMesh(rockGeometry(), mat, items.length);
  const o = new THREE.Object3D();
  items.forEach(([x, z, s, collide], i) => {
    o.position.set(x, terrainHeight(x, z) - s * 0.15, z);
    o.rotation.set(r() * 0.4, r() * Math.PI * 2, r() * 0.4);
    o.scale.set(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5));
    o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
    if (collide && s > 0.6) addCircleCollider(x, z, s * 0.8);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.userData.rocks = true; // 바깥 실사(world/real/outdoor.js)가 사진 질감으로 바꿔 끼우는 바위
  scene.add(inst);
}

/* ───── 박석 (마당 동선) ───── */
function buildFlagstones(scene) {
  const r = rand(77);
  const slabs = [];
  const c = L.courtyard, pg = L.pagoda;
  // 계단 → 탑 둘레
  for (let z = c.z1 - 0.4; z > pg.z + pg.radius + 0.6; z -= 0.72) {
    for (let x = -1.5; x <= 1.5; x += 0.75) slabs.push([x + (r() - 0.5) * 0.06, z, 0]);
  }
  // 탑돌이 원
  const ringR = pg.radius;
  const nRing = 40;
  for (let i = 0; i < nRing; i++) {
    const a = (i / nRing) * Math.PI * 2;
    for (const dr of [-0.55, 0.15]) {
      slabs.push([pg.x + Math.cos(a) * (ringR + dr), pg.z + Math.sin(a) * (ringR + dr), a]);
    }
  }
  // 탑 → 대웅전 계단
  for (let z = pg.z - pg.radius - 0.6; z > c.z0 + 0.2; z -= 0.72) {
    for (let x = -1.5; x <= 1.5; x += 0.75) slabs.push([x + (r() - 0.5) * 0.06, z, 0]);
  }
  // 다실로 가는 디딤돌
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 17.6 + t * 5, z = -6 - t * 5.4 + Math.sin(t * 6) * 0.3;
    slabs.push([x, z, r() * 2, 'step']);
  }
  const geo = new THREE.BoxGeometry(0.7, 0.08, 0.66);
  const stepGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.12, 9);
  const gr = graniteTextures();
  const mat = weatherable(new THREE.MeshStandardMaterial({ map: gr.color, normalMap: gr.normal, color: 0xbab5a8, roughness: 0.8 }), { snow: 1, wet: 1 });
  const flat = slabs.filter((s) => s[3] !== 'step');
  const steps = slabs.filter((s) => s[3] === 'step');
  const inst = new THREE.InstancedMesh(geo, mat, flat.length);
  const o = new THREE.Object3D();
  flat.forEach(([x, z, a], i) => {
    o.position.set(x, terrainHeight(x, z) + 0.03, z);
    o.rotation.set(0, a + (r() - 0.5) * 0.05, 0);
    o.scale.set(0.95 + r() * 0.1, 1, 0.95 + r() * 0.1);
    o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
  });
  inst.receiveShadow = true;
  scene.add(inst);
  const si = new THREE.InstancedMesh(stepGeo, mat, steps.length);
  steps.forEach(([x, z, a], i) => {
    o.position.set(x, terrainHeight(x, z) + 0.04, z);
    o.rotation.set(0, a, 0);
    o.scale.set(1, 1, 0.85);
    o.updateMatrix();
    si.setMatrixAt(i, o.matrix);
  });
  si.receiveShadow = true;
  scene.add(si);
}
