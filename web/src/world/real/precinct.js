// 경내 실사 질감 (?world=real) — 전각 기와·서까래·처마·용마루·단청·뇌록/주홍 칠·흙벽·다듬은 화강암(기단·계단·석등·박석)·돌탑 돌·
// 담 아랫돌·청동(범종·화로·향로)·연등 한지·기와불사 채움 기와.
// templeScene.build() 가 정적 병합 바로 뒤에 부른다. 형상·위치·개수·병합(그리기 호출 수)은 그대로 두고 재질의 그림과 UV 만 바꾼다.
// 바깥 실사(outdoor.js)가 첫 입장 질감을 다 받은 뒤에 받기 시작하고, 받기 전·실패하면 절차적 그림 그대로.
// 에셋: web/assets/world/precinct/*.ktx2 (tools/precinct/build.py, 출처 credits.json) + 바깥 실사의 granite(돌탑 돌)·mossy(담 아랫돌) (같은 캐시)
import * as THREE from 'three';
import { mats } from '../materials.js';
import { plasterTexture, graniteTextures } from '../textures.js';
import { xyNormals } from './outdoor.js';

const ASSETS = './assets/world/precinct/';

// 질감 한 장이 덮는 크기(m) — 상자 투영 UV 를 이 크기로 나눈다
const TILE = { granite: 1.6, mossy: 1.6, plaster: 1.8, paint: 1.2, roofDark: 1.2 };
// 지붕 윗면 UV 는 architecture.js buildRoof 가 미터/0.55 로 만든다. 사진 한 장에 수키와 20줄(FFT 실측) → 한 줄 0.3m 가 되게 한 장 = 6m
const ROOF_REPEAT = 0.55 / 6;
// 단청 띠: 그림(2:1) 한 장이 부재 높이 h × DC_W·h 를 덮는다 — 그림 비율 그대로
const DC_W = 2;

/** 정적 병합 직후에 부른다: 바꿀 메쉬·재질을 지금 모아 두고, 질감이 오면 UV·그림을 한꺼번에 바꾼다 */
export function preparePrecinct(world) {
  const p = new Precinct(world);
  world.precinctReady = p.ready;
  p.collect();
  p.run().then(
    () => (p.ready.done = true),
    (e) => {
      console.warn('[precinct] 경내 실사 질감 실패, 절차적 그대로:', e);
      p.ready.done = true;
      p.ready.error = String(e);
    }
  );
  return p;
}

/* ───── UV ───── */

/** 세계 좌표 상자 투영 (삼각형마다 면 노멀의 큰 축으로) — 병합 메쉬는 이미 세계 좌표다 */
function boxUV(mesh, tile) {
  let g = mesh.geometry;
  g = g.index ? g.toNonIndexed() : g.clone();
  mesh.updateWorldMatrix(true, false);
  const M = mesh.matrixWorld;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i).applyMatrix4(M);
    b.fromBufferAttribute(p, i + 1).applyMatrix4(M);
    c.fromBufferAttribute(p, i + 2).applyMatrix4(M);
    n.subVectors(b, a).cross(e.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    [a, b, c].forEach((v, k) => {
      let u, w;
      if (ay >= ax && ay >= az) [u, w] = [v.x, v.z];
      else if (ax >= az) [u, w] = [v.z, v.y];
      else [u, w] = [v.x, v.y];
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = w / tile;
    });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
}

/**
 * 창방·평방(상자, 면 재질 [단청,단청,뇌록,뇌록,단청,단청]): 긴 면은 그림 한 장이 높이 h × DC_W·h 로 이어지고(꽃이 서게 v=아래→위),
 * 마구리도 같은 높이로, 위·아랫면(뇌록)은 미터 단위 칠 결.
 */
function beamUV(mesh) {
  const g = mesh.geometry.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, n = g.attributes.normal;
  const alongX = bb.max.x - bb.min.x >= bb.max.z - bb.min.z;
  const h = bb.max.y - bb.min.y;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - bb.min.x, y = p.getY(i) - bb.min.y, z = p.getZ(i) - bb.min.z;
    const along = alongX ? x : z, across = alongX ? z : x;
    const ny = Math.abs(n.getY(i)), nAlong = Math.abs(alongX ? n.getX(i) : n.getZ(i));
    let u, v;
    if (ny > 0.5) [u, v] = [across / TILE.paint, along / TILE.paint]; // 칠 아래 나무결(v)이 부재 길이로
    else if (nAlong > 0.5) [u, v] = [across / (DC_W * h), y / h]; // 마구리
    else [u, v] = [along / (DC_W * h), y / h];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
}

/* ───── 재질 조각 ───── */

/** 인스턴스(박석·돌탑 돌·채움 기와)마다 질감 자리를 어긋나게: 같은 돌결이 줄줄이 반복되지 않게 */
function instanceJitter(mat) {
  if (mat.userData.iJit) return;
  mat.userData.iJit = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.() || '';
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.vertexShader = s.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
      {
        vec2 jit = fract(instanceMatrix[3].xz * vec2(0.6180, 0.4142) + instanceMatrix[0].xz * 0.37) * 4.0;
        #ifdef USE_MAP
          vMapUv += jit;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv += jit;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv += jit;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv += jit;
        #endif
      }
      #endif`
    );
  };
  mat.customProgramCacheKey = () => `${prevKey}-ijit`;
}

function xyOnce(mat) {
  if (mat.userData.xyn) return;
  mat.userData.xyn = true;
  xyNormals(mat);
}

/* ───── 본체 ───── */
class Precinct {
  constructor(world) {
    this.world = world;
    this.low = world.quality === 'low';
    this.ready = { done: false };
    this._tex = new Map();
  }

  /** 지금 장면에서 바꿀 재질(분류별)과 UV 를 다시 쓸 메쉬를 모은다 — 재질은 식별자로만 (복제하지 않는다) */
  collect() {
    const W = this.world, m = mats();
    const plasterMap = plasterTexture(), graniteMap = graniteTextures().color;
    const kind = new Map([
      [m.roofTop, 'roofTop'],
      [m.roofUnder, 'roofUnder'],
      [m.roofEdge, 'roofDark'],
      [m.ridge, 'roofDark'],
      [m.dancheong, 'dancheong'],
      [m.green, 'paint'],
      [m.red, 'paint'],
      [m.plaster, 'plaster'],
      [m.granite, 'granite'],
      [m.stoneDark, 'mossy'],
      [m.bronze, 'bronze'],
      [m.bronzeGreen, 'bronze']
    ]);
    const lantern = W.temple?.lanterns?.mesh?.material;
    if (lantern) kind.set(lantern, 'hanji');
    const plain = W.temple?.tileRack?.plain;
    if (plain) kind.set(plain, 'tile');
    const classify = (mat) => {
      if (kind.has(mat)) return kind.get(mat);
      if (!mat?.isMeshStandardMaterial) return null;
      if (mat.map === plasterMap) return 'plaster'; // 담장 회벽 (담마다 재질이 따로)
      if (mat.map === graniteMap) return mat.normalMap ? 'granite' : 'rock'; // 박석(노멀 있음, 다듬은 돌) · 돌탑 돌(자연석)
      return null;
    };
    const dyn = W.temple?.dynamicRoots?.() || new Set();
    const moving = (o) => {
      for (let q = o; q; q = q.parent) if (dyn.has(q)) return true;
      return false;
    };
    this.mats = new Map(); // material → 분류
    this.uvJobs = []; // [mesh, 'box'|'beam', tile]
    W.scene.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const ks = list.map(classify);
      if (!ks.some(Boolean)) return;
      list.forEach((mat, i) => ks[i] && this.mats.set(mat, ks[i]));
      if (o.isInstancedMesh || moving(o)) return;
      if (ks.includes('dancheong')) {
        if (o.geometry.type === 'BoxGeometry') this.uvJobs.push([o, 'beam']);
      } else if (ks.every((k) => k && TILE[k])) this.uvJobs.push([o, 'box', TILE[ks[0]]]);
    });
    this.stats = { mats: this.mats.size, uv: this.uvJobs.length };
  }

  _get(url, srgb) {
    if (!this._tex.has(url)) {
      const r = this.world.renderer;
      this._tex.set(
        url,
        this.world.outdoor._ktx().loadAsync(url).then((t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy());
          t.needsUpdate = true;
          return t;
        })
      );
    }
    return this._tex.get(url);
  }

  /** 이 분류의 [색, 노멀, ARM] — 저사양은 색만. granite·mossy 는 바깥 실사의 같은 사진(같은 캐시) */
  _set(k) {
    const O = this.world.outdoor;
    const out = { rock: 'granite', mossy: 'mossy' }[k];
    const name = { roofTop: 'roof', roofDark: 'roof', tile: 'roof', roofUnder: 'rafter', dancheong: 'dancheong', paint: 'paint', plaster: 'wall', granite: 'stone', bronze: 'bronze', hanji: 'hanji' }[k];
    const col = out ? O.tex(`${out}_col`) : this._get(`${ASSETS}${name}_col.ktx2`, true);
    const hasNor = !this.low && k !== 'tile' && (out || ['roof', 'rafter', 'paint', 'wall', 'stone', 'bronze'].includes(name));
    const nor = !hasNor ? null : out ? O.tex(`${out}_nor`, { srgb: false }) : this._get(`${ASSETS}${name}_nor.ktx2`, false);
    const arm = !this.low && ['roof', 'bronze'].includes(name) && k !== 'tile' ? this._get(`${ASSETS}${name}_arm.ktx2`, false) : null;
    return Promise.all([col, nor, arm]);
  }

  async run() {
    const W = this.world;
    // 바깥 실사(첫 입장 예산: 지면·나무·원경)가 다 받은 뒤에 — 경내 질감은 그다음
    while (!W.outdoorReady?.done) await new Promise((r) => setTimeout(r, 250));
    const kinds = [...new Set(this.mats.values())];
    const sets = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await this._set(k)])));
    // 받은 뒤에 한꺼번에: UV 다시 쓰기 → 그림 바꾸기 (그 사이에는 절차적 그림이 옛 UV 로 그대로)
    for (const [o, how, tile] of this.uvJobs) how === 'beam' ? beamUV(o) : boxUV(o, tile);
    for (const [mat, k] of this.mats) this._apply(mat, k, sets[k]);
  }

  _apply(mat, k, [col, nor, arm]) {
    const rep = (t, x, y = x) => {
      if (!t || (x === 1 && y === 1)) return t;
      const c = t.clone(); // 같은 이미지, 재질마다 반복만 다르게
      c.repeat.set(x, y);
      c.needsUpdate = true;
      return c;
    };
    const R = { roofTop: [ROOF_REPEAT, ROOF_REPEAT], bronze: [3, 1], hanji: [2, 1], tile: [0.08, 0.08] }[k] || [1, 1];
    mat.map = rep(col, ...R);
    mat.normalMap = rep(nor, ...R);
    if (nor) {
      // 다듬은 돌·칠·청동은 얕게 — 바위 사진 노멀을 그대로 쓰면 기단이 45% 어두워졌다(시험 화면 실측)
      const s = { roofTop: 1, roofDark: 0.8, roofUnder: 0.8, paint: 0.25, plaster: 0.9, granite: 0.6, rock: 0.7, mossy: 0.9, bronze: 0.5 }[k] ?? 0.8;
      mat.normalScale.set(s, s); // 초록 뒤집기는 xyNormal() 이 한다
      xyOnce(mat);
    }
    if (arm) {
      mat.roughnessMap = rep(arm, ...R); // G = 거칠기
      mat.aoMap = mat.roughnessMap; // R = 틈 그늘
      mat.aoMapIntensity = 0.8;
      if (k === 'bronze') mat.metalnessMap = mat.roughnessMap; // B = 금속성 (녹청은 0)
    }
    switch (k) {
      case 'roofTop':
        mat.color.set(0xffffff);
        mat.roughness = 1;
        break;
      case 'roofDark': // 처마 테두리·용마루: 기와면보다 조금 짙게
        mat.color.set(mat === mats().ridge ? 0xd8d8d8 : 0xbdbdbd);
        break;
      case 'roofUnder':
      case 'dancheong':
      case 'hanji':
        mat.color.set(0xffffff);
        break;
      case 'paint': // 뇌록·주홍 색은 그대로, 사진은 평균 0.95 의 칠한 나무 결
        break;
      case 'plaster': // 짚 섞인 흙벽 (아트 바이블) — 사진 색 그대로
        mat.color.set(0xffffff);
        break;
      case 'granite': // 다듬은 돌 사진은 절차적 화강암 바탕색 근처로 구웠다 — 공용 재질은 흰색, 박석은 제 색 그대로
      case 'rock':
        break;
      case 'mossy':
        mat.color.set(0xe2ded6);
        break;
      case 'bronze': // 거칠기·금속성은 ARM 그림이 정한다 (주물 0.5 · 녹청 0.85)
        mat.color.set(mat === mats().bronzeGreen ? 0xa9b8a2 : 0xffffff);
        mat.metalness = arm ? 1 : 0.6;
        mat.roughness = arm ? 1 : 0.55;
        break;
      case 'tile': // 채움 기와: 기와 사진 한 귀퉁이의 흙 결 — 옛 색(0x232427)만큼 짙게
        mat.color.set(0x8c8c8c);
        break;
    }
    if (k === 'granite' || k === 'rock' || k === 'tile' || k === 'mossy') instanceJitter(mat); // 인스턴스에서만 (#ifdef USE_INSTANCING) — mossy: 길가 돌탑(cairnField) 돌마다 사진 다른 자리
    mat.needsUpdate = true;
  }
}
