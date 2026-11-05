/**
 * 길가 돌탑 (요구 8) — 산책로 곳곳의 돌탑을 InstancedMesh 하나로 그린다 (draw call 1 + 그림자 1).
 * 가까운 탑부터 일부만(core/cairns.js pickVisible), 탑마다 모양은 id 로 정해진 난수라 누구 화면에서나 같다.
 * 실사 돌 스캔으로 바꿀 때는 stoneGeometry() 만 갈아 끼우면 된다.
 */
import * as THREE from 'three';
import { terrainHeight } from './layout.js';
import { pickVisible } from '../core/cairns.js';
import { graniteTextures } from './textures.js';
import { weatherable } from './materials.js';

const LAYERS = 12; // 한 탑에 그리는 층 상한 (그 위로는 수만 센다)
const REFRESH_MOVE = 4; // 이만큼 걸으면 가까운 탑을 다시 고른다 (m)

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  let s = (h >>> 0) % 2147483646 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function stoneGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(1 + 0.13 * Math.sin(v.x * 5 + v.z * 3) + 0.06 * Math.cos(v.y * 7));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class CairnField {
  constructor(scene, quality = 'high') {
    this.max = quality === 'low' ? 20 : 36;
    const gr = graniteTextures();
    const mat = weatherable(new THREE.MeshStandardMaterial({ map: gr.color, color: 0xa29e94, roughness: 0.9 }), { snow: 1, wet: 1 });
    this.mesh = new THREE.InstancedMesh(stoneGeometry(), mat, this.max * LAYERS);
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
    this._base = new Map(); // id → 땅 높이
  }

  /** 알려진 탑 전체 [{id,x,z,n}] (state.cairnList()) */
  setCairns(list) {
    this.all = list;
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
      out.push({ x: (r() - 0.5) * 0.05, y: y + s * 0.36, z: (r() - 0.5) * 0.05, s, sz: s * (0.85 + r() * 0.3), ry: r() * 6.28, tilt: (r() - 0.5) * 0.12 });
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
      if (!this._base.has(c.id)) this._base.set(c.id, terrainHeight(c.x, c.z) - 0.04);
      const by = this._base.get(c.id);
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
        i++;
      });
    }
    this.drop = null;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
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
