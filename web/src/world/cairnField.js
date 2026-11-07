/**
 * 길가 돌탑 (요구 8) — 산책로 곳곳의 돌탑을 InstancedMesh 하나로 그린다 (draw call 1 + 그림자 1).
 * 가까운 탑부터 일부만(core/cairns.js pickVisible), 탑마다 모양은 id 로 정해진 난수라 누구 화면에서나 같다.
 * 돌은 맵 돌담·장식 돌탑과 같은 재질(mats().stoneDark — 실사에서는 경내 실사 precinct.js 가 이끼 낀 돌 사진을 입힌다).
 * 사용자 2026-11-08 「맵 디자인의 돌담과 사람이 쌓은 돌담의 디자인이 많이 다르다」 — 전에는 따로 만든 화강암 무늬 재질이라 실사에서 다른 사진(화강암)이 입혀졌다.
 * 실사 돌 스캔으로 바꿀 때는 stoneGeometry() 만 갈아 끼우면 된다.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './layout.js';
import { pickVisible, roadsideList } from '../core/cairns.js';
import { ROADSIDE_GEO } from '../core/roadsideGeo.js';
import { mats } from './materials.js';

const LAYERS = 12; // 한 탑에 그리는 층 상한 (그 위로는 수만 센다)
const REFRESH_MOVE = 4; // 이만큼 걸으면 가까운 탑을 다시 고른다 (m)

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  let s = (h >>> 0) % 2147483646 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * 돌 하나 (반지름 1, 인스턴스가 납작하게 늘인다): 위아래가 평평해 포개지는 들돌, 옆은 낮은 주파수로 울퉁불퉁.
 * 음영은 매끈하게(맵 장식 돌탑처럼 — 면마다 꺾이면 팽이처럼 보였다), UV 는 면마다 상자 투영 — 맵 돌담(trailProps buildFences →
 * 실사 boxUV)처럼 사진 한 장이 1.6m 를 덮는 크기로 (밑돌 지름 0.6m ≈ 사진 0.37장). 일주문 옆 돌탑(temple.js Cairn)도 이것을 쓴다.
 */
export function stoneGeometry(detail = 1) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const g = mergeVertices(base); // 꼭짓점을 나눠 써야 울퉁불퉁하게 밀어도 틈이 없고 음영이 매끈하다
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + 0.11 * Math.sin(v.x * 3.1 + v.z * 2.3 + 0.7) + 0.07 * Math.cos(v.z * 4.3 - v.x * 1.7) + 0.04 * Math.sin(v.y * 6));
    const cap = 0.6 + 0.06 * Math.sin(v.x * 2.7 - v.z * 1.9); // 위아래 납작한 면
    if (Math.abs(v.y) > cap) v.y = Math.sign(v.y) * (cap + (Math.abs(v.y) - cap) * 0.2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  const q = out.attributes.position, uv = new Float32Array(q.count * 2), k = 0.3 / 1.6, ky = 0.42; // 밑돌 반지름 0.3m · 높이 0.42배
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < q.count; f += 3) {
    a.fromBufferAttribute(q, f);
    b.fromBufferAttribute(q, f + 1);
    c.fromBufferAttribute(q, f + 2);
    const n = b.sub(a).cross(c.sub(a)); // 면 법선 (늘인 뒤 높이 비율로)
    const ax = Math.abs(n.x), ay = Math.abs(n.y) / ky, az = Math.abs(n.z);
    for (let j = f; j < f + 3; j++) {
      const x = q.getX(j) * k, y = q.getY(j) * k * ky, z = q.getZ(j) * k;
      const [u, w] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[j * 2] = u;
      uv[j * 2 + 1] = w;
    }
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export class CairnField {
  constructor(scene, quality = 'high') {
    this.max = quality === 'low' ? 20 : 36;
    this.mesh = new THREE.InstancedMesh(stoneGeometry(), mats().stoneDark, this.max * LAYERS);
    this.mesh.setColorAt(0, new THREE.Color()); // 돌마다 조금씩 다른 빛깔 (instanceColor)
    this.mesh.count = 0;
    this.mesh.castShadow = quality !== 'low';
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // 인스턴스가 지도 곳곳에 흩어져 있어 경계 구를 늘 다시 잴 바에야 끈다 (최대 432개)
    this.mesh.name = 'cairnField';
    scene.add(this.mesh);
    this.all = [];
    this.shown = [];
    this.at = { x: 1e9, z: 1e9 };
    this.falling = null;
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
    this._base = new Map(); // 자리 → 땅 높이
  }

  /**
   * 알려진 탑 전체 [{id,x,z,n}] (state.cairnList()). 길가 규칙 전에 길 위에 세운 옛 탑은 가까운 길가로 옮겨 그린다
   * (core/cairns.js roadsideList — DB 는 그대로, 서버와 같은 규칙이라 어느 기기에서나 같은 자리). 목록 자리가 그대로면 다시 재지 않는다.
   */
  setCairns(list) {
    const sig = list.map((c) => `${c.id}:${c.x}:${c.z}`).join('|');
    if (sig !== this._sig) {
      this._sig = sig;
      this._spot = new Map(roadsideList(list, ROADSIDE_GEO).map((c) => [c.id, { x: c.x, z: c.z }]));
    }
    this.all = list.map((c) => ({ ...c, ...this._spot.get(c.id) }));
    this._refresh(this.at.x, this.at.z);
  }

  get(id) {
    return this.all.find((c) => c.id === id) || null;
  }

  /** 탑 꼭대기 높이 (돌이 떨어질 자리) */
  _layout(c) {
    const r = seeded(c.id);
    const out = [];
    let y = 0;
    const n = Math.min(c.n, LAYERS);
    for (let k = 0; k < n; k++) {
      const s = Math.max(0.1, 0.3 - k * 0.018) * (0.9 + r() * 0.2);
      out.push({ x: (r() - 0.5) * 0.05, y: y + s * 0.36, z: (r() - 0.5) * 0.05, s, sz: s * (0.85 + r() * 0.3), ry: r() * 6.28, tilt: (r() - 0.5) * 0.12, tone: 0.86 + r() * 0.2 });
      y += s * 0.7;
    }
    return out;
  }

  _refresh(px, pz) {
    this.at = { x: px, z: pz };
    this.shown = pickVisible(this.all, px, pz, { max: this.max });
    if (this.pin && !this.shown.includes(this.pin)) this.shown[this.shown.length ? this.shown.length - 1 : 0] = this.pin; // 방금 돌을 얹은 탑은 늘 보이게
    const o = this._o;
    let i = 0;
    this.falling = null;
    for (const c of this.shown) {
      const bk = `${c.x},${c.z}`;
      if (!this._base.has(bk)) this._base.set(bk, terrainHeight(c.x, c.z) - 0.04);
      const by = this._base.get(bk);
      const stones = this._layout(c);
      stones.forEach((st, k) => {
        o.position.set(c.x + st.x, by + st.y, c.z + st.z);
        o.rotation.set(st.tilt, st.ry, st.tilt * 0.6);
        o.scale.set(st.s, st.s * 0.42, st.sz);
        if (this.drop?.id === c.id && k === stones.length - 1 && c.n <= LAYERS) {
          this.falling = { i, x: o.position.x, y: o.position.y, z: o.position.z, rot: o.rotation.clone(), scale: o.scale.clone(), h: 1.5, v: 0, onLand: this.drop.onLand };
          o.position.y += 1.5;
        }
        o.updateMatrix();
        this.mesh.setMatrixAt(i, o.matrix);
        this.mesh.setColorAt(i, this._c.setScalar(st.tone));
        i++;
      });
    }
    this.drop = null;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** 돌 하나 얹기 (새 탑이면 목록에 더한다). 떨어지는 소리는 onLand */
  addStone({ id, x, z }, onLand) {
    let c = this.get(id);
    if (c) c.n += 1;
    else this.all.push((c = { id, x, z, n: 1 }));
    this.pin = c;
    this.drop = { id, onLand: c.n > LAYERS ? null : onLand };
    this._refresh(this.at.x, this.at.z);
    if (c.n > LAYERS) onLand?.(); // 층 상한 위로는 보이는 변화 없이 소리만
    return c;
  }

  update(dt, px, pz) {
    if (Math.hypot(px - this.at.x, pz - this.at.z) > REFRESH_MOVE && !this.falling) this._refresh(px, pz);
    const f = this.falling;
    if (!f) return;
    f.v += 9.8 * dt;
    f.h = Math.max(0, f.h - f.v * dt);
    const o = this._o;
    o.position.set(f.x, f.y + f.h, f.z);
    o.rotation.copy(f.rot);
    o.scale.copy(f.scale);
    o.updateMatrix();
    this.mesh.setMatrixAt(f.i, o.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (f.h <= 0) {
      this.falling = null;
      f.onLand?.();
    }
  }
}
