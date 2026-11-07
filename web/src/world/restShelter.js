/**
 * 비 오는 날의 휴식 (사용자 2026-11-07): 돗자리에 앉아 있는데 비가 오거나 날씨가 비로 바뀌면, 돗자리 위에 1인용 간이 캐노피를 친다.
 * 대나무 기둥 넷 + 광목 천 한 장(앞이 높고 뒤로 비스듬히 — 빗물이 뒤로 흐르게) + 앞 기둥의 당김줄. 기둥은 그 자리 땅에 박힌다.
 * 비가 그치거나 일어서면 걷는다. 내 화면에서만 (돗자리와 같이 — 실시간 동석은 자리·동작만 주고받는다).
 */
import * as THREE from 'three';
import { walkHeight } from './layout.js';

// 돗자리(1.0×1.5m, 앉는 사람은 +z 를 본다)보다 조금 넓게
const W = 0.72; // 가운데에서 기둥까지 (옆)
const FZ = 0.86, BZ = -0.86; // 앞·뒤 기둥
const FH = 1.38, BH = 1.0; // 앞·뒤 기둥 높이 (앉은 머리 위로 앞이 트이게)
const OVER = 0.1; // 천이 기둥 밖으로 나오는 만큼
const SAG = 0.05; // 천 가운데 처짐

export function buildRestShelter(scene, { onShow } = {}) {
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd9ccae, roughness: 0.92, side: THREE.DoubleSide });
  const hem = new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 0.9 }); // 천 가장자리 감침 — 안에서(1인칭) 볼 때 화면 위 띠처럼 튀지 않게 천과 같은 빛 (쪽빛은 띠로 보였다)
  const bamboo = new THREE.MeshStandardMaterial({ color: 0x9a7a45, roughness: 0.75 });
  const rope = new THREE.LineBasicMaterial({ color: 0x5b4a36 });
  const tarpGeo = new THREE.PlaneGeometry(1, 1, 6, 8);
  const tarp = new THREE.Mesh(tarpGeo, cloth);
  tarp.castShadow = true;
  tarp.receiveShadow = true;
  g.add(tarp);
  const poleGeo = new THREE.CylinderGeometry(0.018, 0.022, 1, 6);
  poleGeo.translate(0, 0.5, 0);
  const poles = [[W, FZ], [-W, FZ], [W, BZ], [-W, BZ]].map(([x, z]) => {
    const m = new THREE.Mesh(poleGeo, bamboo);
    m.position.set(x, 0, z);
    m.castShadow = true;
    g.add(m);
    return m;
  });
  const hems = [FZ, BZ].map(() => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + OVER), 0.02, 0.02), hem);
    g.add(m);
    return m;
  });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), rope);
  g.add(lines);
  let shownFor = null;

  /** 앉은 자리 s({x,z,ry}) 위에 친다 — 기둥 밑은 그 자리 땅 높이, 천은 네 기둥 끝을 잇는다 */
  function pitch(s) {
    const gy = walkHeight(s.x, s.z), c = Math.cos(s.ry), sn = Math.sin(s.ry);
    const ground = (lx, lz) => walkHeight(s.x + c * lx + sn * lz, s.z - sn * lx + c * lz) - gy;
    g.position.set(s.x, gy, s.z);
    g.rotation.set(0, s.ry, 0);
    // 기둥: 땅에서 끝까지
    const tops = poles.map((m, i) => {
      const base = ground(m.position.x, m.position.z);
      const h = i < 2 ? FH : BH;
      m.position.y = base;
      m.scale.set(1, h, 1);
      return base + h;
    });
    // 천: 뒤(아래 v=0) → 앞(v=1), 네 기둥 끝을 이어 겹선형으로 + 가운데 처짐, 기둥 밖으로 조금
    const P = tarpGeo.attributes.position;
    for (let k = 0; k < P.count; k++) {
      const u = P.getX(k) + 0.5, v = P.getY(k) + 0.5; // 0..1
      const x = -(W + OVER) + u * 2 * (W + OVER), z = BZ - OVER + v * (FZ - BZ + 2 * OVER);
      const a = (x + W) / (2 * W), b = (z - BZ) / (FZ - BZ);
      const yb = tops[3] + (tops[2] - tops[3]) * a, yf = tops[1] + (tops[0] - tops[1]) * a; // 뒤·앞 (오른쪽 +x 가 0·2번 기둥)
      const sag = SAG * Math.sin(Math.PI * Math.min(1, Math.max(0, a))) * Math.sin(Math.PI * Math.min(1, Math.max(0, b)));
      P.setXYZ(k, x, yb + (yf - yb) * b - sag, z);
    }
    P.needsUpdate = true;
    tarpGeo.computeVertexNormals();
    tarpGeo.computeBoundingSphere();
    hems[0].position.set(0, (tops[0] + tops[1]) / 2 - 0.01, FZ + OVER);
    hems[1].position.set(0, (tops[2] + tops[3]) / 2 - 0.01, BZ - OVER);
    // 당김줄: 앞 기둥 끝에서 앞·옆 땅의 말뚝으로
    const pts = [];
    for (const [i, sx] of [[0, 1], [1, -1]]) {
      const px = sx * W, pz = FZ, gx = sx * (W + 0.35), gz = FZ + 0.55;
      pts.push(px, tops[i], pz, gx, ground(gx, gz) + 0.02, gz);
    }
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    lines.geometry.computeBoundingSphere();
  }

  return {
    group: g,
    /** 지금 쳐야 할 자리 (돗자리에 앉았고 비가 오면 그 자리, 아니면 null) — 매 프레임 불러도 바뀔 때만 일한다 */
    sync(spot) {
      if (spot === shownFor) return;
      shownFor = spot;
      g.visible = !!spot;
      if (spot) {
        pitch(spot);
        onShow?.(spot);
      }
    },
    get shown() {
      return !!shownFor;
    }
  };
}

/** 이 자리에 캐노피를 쳐야 하나: 돗자리(쉼터 돗자리·휴식)에 앉아 있고 비가 올 때 — 칸이 차서 곁의 땅에 앉았으면 돗자리가 없으니 치지 않는다 */
export function shelterSpot(player, weather) {
  const seat = player?.seat;
  if (weather !== 'rain' || seat?.kind !== 'rest' || seat._ref?.kind !== 'mat' || seat._slot?.ground) return null;
  return seat._ref;
}
