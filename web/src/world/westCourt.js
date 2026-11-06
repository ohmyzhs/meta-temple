/**
 * 서쪽 마당(예비 마당) + 대웅전 서쪽 옆마당 — 담·협문·앞 석축, 가장자리 쉼터(나무 벤치·평상·돌 의자)와 석등.
 * 한가운데(L.westReserve)는 계절 행사(짚불 태우기 등)를 열 자리로 비워 둔다 — 소품·나무를 그 안에 두지 않는다.
 * 쉼터는 산책로 쉼터와 같은 꼴(spot)이라 temple.trail.spots 에 더해 앉기·예불 듣기를 그대로 쓴다.
 */
import * as THREE from 'three';
import { L, terrainHeight, addBoxCollider, addCircleCollider } from './layout.js';
import { buildWall, buildRoof, buildStoneLantern } from './architecture.js';
import { mesh, rockGeo } from './trailProps.js';
import { REST_LABEL } from './trail.js';

/** 앉는 자리: (x, z) 앉는 곳, look 바라보는 곳. 모두 예비 마당 타원 밖, 담·나무를 등진다 */
const SEATS = [
  { id: 'wc_bench_w1', kind: 'woodbench', x: -32.0, z: -20.5, look: [-26, -20.5] },
  { id: 'wc_bench_w2', kind: 'woodbench', x: -32.0, z: -5.5, look: [-26, -5.5] },
  { id: 'wc_bench_e', kind: 'woodbench', x: -20.4, z: 2.0, look: [-27, 2.0] },
  { id: 'wc_bench_s', kind: 'woodbench', x: -26.3, z: 3.9, look: [-26.3, -12] },
  { id: 'wc_platform', kind: 'platform', x: -26.3, z: -31.0, look: [-26.3, -13] },
  { id: 'hy_platform', kind: 'platform', x: -16.4, z: -29.2, look: [-16.4, -15] },
  { id: 'wc_stone_1', kind: 'stone', x: -31.6, z: 1.0, look: [-26, -6], seed: 13 },
  { id: 'wc_stone_2', kind: 'stone', x: -29.4, z: 3.6, look: [-26, -8], seed: 17 },
  { id: 'wc_stone_3', kind: 'stone', x: -22.0, z: -31.8, look: [-25, -18], seed: 23 },
  { id: 'hy_stone', kind: 'stone', x: -14.4, z: -22.4, look: [-19, -22], seed: 29 }
];
const SEAT_H = { woodbench: 0.46, platform: 0.46, stone: 0.42 };
/** 석등 (밤에 마당 가장자리에 빛 웅덩이) */
const LAMPS = [[-32.0, -13.0], [-20.3, -8.4], [-14.3, -31.8]];

const BUILDERS = {
  /** 나무 벤치: 받침돌 둘 + 두꺼운 나무판 (등받이 없는 절집 벤치) */
  woodbench(m) {
    const g = new THREE.Group();
    for (const x of [-0.62, 0.62]) g.add(mesh(new THREE.BoxGeometry(0.34, 0.38, 0.4), m.granite, x, 0.19, 0));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.46), m.wood, 0, 0.42, 0));
    return g;
  },
  /** 평상: 앞 가장자리에 걸터앉는다 (판은 뒤로 1.4m) */
  platform(m) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.1, 1.4), m.woodLight, 0, 0.41, -0.5));
    for (const [x, z] of [[-1, 0.12], [1, 0.12], [-1, -1.12], [1, -1.12]]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), m.woodDark, x, 0.18, z));
    g.add(mesh(new THREE.BoxGeometry(2.24, 0.07, 0.08), m.woodDark, 0, 0.35, 0.2));
    g.add(mesh(new THREE.BoxGeometry(2.24, 0.07, 0.08), m.woodDark, 0, 0.35, -1.2));
    return g;
  },
  /** 돌 의자: 윗면이 평평한 자연석 */
  stone(m, s) {
    const g = new THREE.Group();
    const r = mesh(rockGeo(s.seed, 0.55), m.granite, 0, SEAT_H.stone - 0.55 * 0.42, 0);
    r.scale.set(0.44, 0.42, 0.38);
    g.add(r);
    return g;
  }
};

/**
 * 서쪽 마당을 세운다. 돌려주는 것: { spots (산책로 쉼터와 같은 꼴), glow: [{x,z,y,r,i}] }
 * 앞마당 서쪽 담(협문 포함)과 앞 석축은 temple.js _courtyard 가 세운다.
 */
export function buildWestCourt(scene, m) {
  const c = L.courtyard, wc = L.westCourt, s = L.stylobate;
  const y = c.y;
  const g = new THREE.Group();

  // 담: 서쪽·북쪽. 바깥 땅이 낮은 곳이 있어 담 밑에 화강암 받침을 깐다
  const plinth = (len, along, x, z) => {
    const b = mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.74, 0.7, along === 'x' ? 0.74 : len), m.granite, x, y - 0.3, z);
    g.add(b);
  };
  const wz = wc.z0 - 0.5, wx = wc.x0 - 0.5;
  {
    const len = wc.z1 + 0.5 - wz;
    const w = buildWall(len);
    w.rotation.y = Math.PI / 2;
    w.position.set(wx, y, (wc.z1 + 0.5 + wz) / 2);
    g.add(w);
    plinth(len, 'z', wx, (wc.z1 + 0.5 + wz) / 2);
    addBoxCollider(wx - 0.4, wz, wx + 0.4, wc.z1 + 0.5);
  }
  {
    const x0 = wx - 0.31, x1 = s.x0;
    const w = buildWall(x1 - x0);
    w.position.set((x0 + x1) / 2, y, wz);
    g.add(w);
    plinth(x1 - x0, 'x', (x0 + x1) / 2, wz);
    addBoxCollider(x0, wz - 0.4, x1, wz + 0.4);
  }

  // 쉼터
  const spots = SEATS.map((d) => {
    const ry = Math.atan2(d.look[0] - d.x, d.look[1] - d.z);
    const so = d.kind === 'platform' ? 0.68 : 0.62; // 일어설 자리: 앉는 곳 앞
    return {
      ...d,
      name: '서쪽 마당',
      ry,
      seatH: SEAT_H[d.kind],
      y: y + SEAT_H[d.kind],
      vista: d.look,
      listenPitch: -0.08, // 마당 바닥보다 담 너머 전각·산이 더 들어오게 (음수 = 조금 위로)
      stand: { x: d.x + Math.sin(ry) * so, z: d.z + Math.cos(ry) * so },
      label: REST_LABEL[d.kind],
      occupant: null
    };
  });
  const seats = new THREE.Group();
  seats.userData.trailProp = true; // 앉는 소품만: 바깥 실사(world/real/outdoor.js)가 산책로 쉼터처럼 나무·돌 사진 질감으로 바꿔 끼운다
  for (const sp of spots) {
    const o = BUILDERS[sp.kind](m, sp);
    o.position.set(sp.x, y, sp.z);
    o.rotation.y = sp.ry;
    seats.add(o);
    const alongX = Math.abs(Math.cos(sp.ry)) > 0.7; // 판 긴 쪽이 x 로 놓였나 (앞을 ±z 로 봄)
    if (sp.kind === 'woodbench') {
      const hx = alongX ? 0.92 : 0.25, hz = alongX ? 0.25 : 0.92;
      addBoxCollider(sp.x - hx, sp.z - hz, sp.x + hx, sp.z + hz);
    } else if (sp.kind === 'platform') {
      // 판 가운데는 앉는 곳에서 뒤로 0.5m
      const cx = sp.x - Math.sin(sp.ry) * 0.5, cz = sp.z - Math.cos(sp.ry) * 0.5;
      const hx = alongX ? 1.12 : 0.72, hz = alongX ? 0.72 : 1.12;
      addBoxCollider(cx - hx, cz - hz, cx + hx, cz + hz);
    } else addCircleCollider(sp.x, sp.z, 0.36);
  }

  // 석등
  const glow = [];
  for (const [x, z] of LAMPS) {
    const lan = buildStoneLantern(0.85);
    lan.position.set(x, terrainHeight(x, z), z);
    g.add(lan);
    addCircleCollider(x, z, 0.45);
    glow.push({ x, z, y, r: 2.8, i: 0.55 });
  }

  scene.add(g, seats); // 담·석등은 앞마당 담과 같은 재질 그대로
  return { spots, glow };
}

/** 앞마당 서쪽 담의 협문: 화강암 문기둥 둘 + 인방 + 작은 맞배지붕 (지붕 마루가 담을 따라 z 로) */
export function buildWestGate(scene, m) {
  const c = L.courtyard, gt = L.westGate;
  const x = c.x0 - 0.5, zc = (gt.z0 + gt.z1) / 2, span = gt.z1 - gt.z0;
  const g = new THREE.Group();
  for (const z of [gt.z0, gt.z1]) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 2.3, 0.5), m.granite, x, c.y + 1.15, z));
    addBoxCollider(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.24, span + 0.5), m.woodDark, x, c.y + 2.36, zc));
  const roof = buildRoof({ halfW: span / 2 + 0.75, halfD: 0.72, height: 0.55, type: 'gable', lift: 0.08, segs: 12, thickness: 0.12, tile: 0.45 });
  roof.rotation.y = Math.PI / 2;
  roof.position.set(x, c.y + 2.48, zc);
  g.add(roof);
  scene.add(g);
}
