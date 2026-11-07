/**
 * 후원 연못 정원 (사용자 2026-11-07 「후원 다실 쪽 정자와 아주 작은 연못을 키운다 · 잉어·연꽃·작은 옹달샘」, 폭포 없음).
 * 연못 물·바닥은 terrain.js, 연꽃은 vegetation.js buildLotus 가 L.pond 를 따라 그린다. 여기서는
 *   정자(연못 동쪽 가에 반쯤 물 위로, 돌 주초) · 잉어(헤엄) · 옹달샘(돌 둘레 샘 + 연못으로 드는 실개울) · 연못가 석등.
 * 물소리는 새로 붙이지 않는다: soundEngine 의 'spring' 레이어가 이미 연못 한가운데(main.js emit.pond = L.pond)에서 나고,
 * 옹달샘은 같은 연못 정원 안(한가운데에서 7.5m)이다. 물길에서 가장 먼 산책로에서 물 레이어 출력 0 (tools/qa/no-water.mjs),
 * 연못 소리는 −60dB 밑에서만 켜지고 꺼진다 (tools/qa/sound-map.mjs) — 2026-11-08 확인.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, terrainHeight, addBoxCollider, addCircleCollider } from './layout.js';
import { buildHanok, buildStoneLantern } from './architecture.js';
import { waterMaterial } from './terrain.js';
import { rockGeo, mesh } from './trailProps.js';
import { REST_LABEL } from './trail.js';

const KOI_COLORS = ['#e8742a', '#f2ede4', '#e09a2c', '#c8371f', '#f4f0e8', '#d9561f', '#2e2b28', '#efb43c', '#e66a24', '#f5f1ea', '#cf4a20', '#e2a33a', '#e8742a', '#f2ede4'];

function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(0.065, 0.04, 0.21);
  const tail = new THREE.ConeGeometry(0.07, 0.14, 4);
  tail.scale(1, 1, 0.25);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -0.25);
  const fins = new THREE.ConeGeometry(0.035, 0.16, 3);
  fins.rotateZ(Math.PI / 2);
  fins.scale(1, 0.2, 1);
  fins.translate(0, -0.01, 0.05);
  const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), fins.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}

/** 연못 정원을 세운다. glowDecals: 석등 밤빛 바닥 목록(temple.js). 돌려주는 것: { koi, update(dt, t) } */
export function buildPondGarden(scene, m, glowDecals) {
  const p = L.pond, pv = L.pondPavilion, sp = L.pondSpring, ty = L.teahouseTerrace.y, h = pv.half;

  /* ── 정자: 3.2m 한 칸, 팔작지붕. 마루 윗면 = 다실 마당 + 0.35 (정자 명상 NPC 높이와 같다) ── */
  const g = new THREE.Group();
  const floorTop = ty + 0.35;
  g.add(mesh(new THREE.BoxGeometry(h * 2 + 0.5, 0.14, h * 2 + 0.5), m.woodLight, pv.x, floorTop - 0.07, pv.z));
  for (const lx of [-h, 0, h]) {
    for (const lz of [-h, 0, h]) {
      const x = pv.x + lx, z = pv.z + lz, gy = terrainHeight(x, z) - 0.1, top = floorTop - 0.14;
      g.add(mesh(new THREE.BoxGeometry(0.3, top - gy, 0.3), m.granite, x, (gy + top) / 2, z));
    }
  }
  const pav = buildHanok({
    xs: [-h, h],
    zs: [-h, h],
    colH: 2.6,
    colR: 0.14,
    front: 'open',
    back: 'open',
    sides: 'open',
    brackets: 1,
    roof: { type: 'paljak', overhang: 1.1, height: 1.7, lift: 0.45, segs: 28 }
  });
  pav.position.set(pv.x, floorTop, pv.z);
  g.add(pav);
  // 계자 난간 (북쪽 다실 쪽만 터서 오르내린다)
  const rail = new THREE.BoxGeometry(1, 0.05, 0.05), post = new THREE.BoxGeometry(0.06, 0.48, 0.06);
  const e = h + 0.2;
  for (const [ax, az, bx, bz] of [[-e, e, e, e], [-e, -e, -e, e], [e, -e, e, e], [-e, -e, -0.7, -e], [0.7, -e, e, -e]]) {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    for (const y of [0.2, 0.48]) {
      const r = mesh(rail, m.woodDark, pv.x + (ax + bx) / 2, floorTop + y, pv.z + (az + bz) / 2);
      r.rotation.y = yaw + Math.PI / 2;
      r.scale.x = len;
      g.add(r);
    }
    const n = Math.max(1, Math.round(len / 0.55));
    for (let k = 0; k <= n; k++) g.add(mesh(post, m.woodDark, pv.x + ax + ((bx - ax) * k) / n, floorTop + 0.24, pv.z + az + ((bz - az) * k) / n));
  }
  const step = mesh(new THREE.BoxGeometry(1.2, 0.18, 0.45), m.granite, pv.x, ty + 0.09, pv.z - e - 0.3);
  g.add(step);
  scene.add(g);
  addBoxCollider(pv.x - e - 0.05, pv.z - e - 0.05, pv.x + e + 0.05, pv.z + e + 0.05);
  // 오를 수 있는 자리: 북쪽 디딤돌로 올라 마루에 가부좌 (사용자 2026-11-08 「정자에 유저도 올라가 앉게」).
  // 산책로 쉼터와 같은 꼴(spot)로 temple.trail.spots 에 더해 앉기·일어서기·예불 듣기를 그대로 쓴다. 한가운데는 정자 명상 NPC 자리라 비운다
  const look = { x: p.x, z: p.z }, ry = Math.atan2(look.x - (pv.x - 1), look.z - pv.z);
  const stand = { x: pv.x, z: pv.z - e - 0.9 }; // 디딤돌 앞 (일어서면 여기)
  const seats = [[-1.0, -0.75], [-1.0, 0.75], [-1.0, 0], [0.85, -0.85], [0.85, 0.85]].map(([dx, dz], index) => ({ index, x: pv.x + dx, y: floorTop, z: pv.z + dz, ry, state: 'meditate', stand, occupant: null }));
  const spot = { id: 'pond_pavilion', name: '연못 정자', kind: 'pondpav', x: seats[0].x, z: seats[0].z, y: floorTop, ry, seatH: 0.35, stand, look: [look.x, look.z], vista: [look.x, look.z], listenPitch: 0.06, label: REST_LABEL.pondpav, occupant: null, _slots: seats };

  /* ── 옹달샘: 이끼 낀 돌 둘레 + 맑은 물 + 표주박, 실개울이 연못 남서 가로 흘러든다 ── */
  const sy = terrainHeight(sp.x, sp.z);
  const springWater = new THREE.Mesh(new THREE.CircleGeometry(sp.r + 0.08, 20).rotateX(-Math.PI / 2), waterMaterial(new THREE.Vector2(0.05, -0.04), 0.9, 1));
  springWater.position.set(sp.x, sy + 0.03, sp.z);
  springWater.renderOrder = 2;
  scene.add(springWater);
  const bed = mesh(new THREE.CircleGeometry(sp.r + 0.1, 20).rotateX(-Math.PI / 2), m.stoneDark, sp.x, sy + 0.005, sp.z, false);
  scene.add(bed);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = sp.r + 0.16 + (i % 3) * 0.04;
    const st = mesh(rockGeo(70 + i * 3.7, 0.35), i % 2 ? m.stoneDark : m.granite, sp.x + Math.cos(a) * r, sy + 0.02, sp.z + Math.sin(a) * r);
    const sc = 0.16 + ((i * 7) % 5) * 0.025;
    st.scale.set(sc * 1.3, sc * 0.8, sc);
    st.rotation.y = a;
    scene.add(st);
  }
  const gourd = mesh(new THREE.SphereGeometry(0.07, 8, 6), m.woodLight, sp.x + 0.62, sy + 0.12, sp.z - 0.32);
  gourd.scale.set(1, 0.6, 1.4);
  scene.add(gourd);
  // 실개울: 샘에서 연못 물가까지 (땅 위 2cm 를 따라가다 물높이 아래로 내려가는 곳에서 멈춘다)
  const dx = p.x - sp.x, dz = p.z - sp.z, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
  const pos = [], idx = [];
  for (let k = 0, d = sp.r; d < dl; d += 0.2, k++) {
    const wob = Math.sin(d * 2.4) * 0.18, w = 0.13 + 0.03 * Math.sin(d * 5);
    const cx = sp.x + ux * d - uz * wob, cz = sp.z + uz * d + ux * wob;
    const y = Math.max(terrainHeight(cx, cz) + 0.02, p.waterY + 0.005);
    pos.push(cx + uz * w, y, cz - ux * w, cx - uz * w, y, cz + ux * w);
    if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
    if (Math.hypot((cx - p.x) / p.rx, (cz - p.z) / p.rz) < 0.97) break;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const rill = new THREE.Mesh(rg, waterMaterial(new THREE.Vector2(ux * 0.16, uz * 0.16), 0.8, 1));
  rill.renderOrder = 2;
  scene.add(rill);

  /* ── 연못가 석등 (옹달샘 곁, 밤에 물에 비친다) ── */
  const lx = sp.x - 1.35, lz = sp.z - 0.2;
  const lan = buildStoneLantern(0.7);
  lan.position.set(lx, terrainHeight(lx, lz), lz);
  scene.add(lan);
  addCircleCollider(lx, lz, 0.4);
  glowDecals.push({ x: lx, z: lz, y: terrainHeight(lx, lz), r: 2.2, i: 0.5 });

  /* ── 잉어: 연못 동쪽 트인 물(연꽃은 서쪽 반)에서 고리를 그리며 천천히 헤엄친다 ── */
  const N = KOI_COLORS.length;
  const koi = new THREE.InstancedMesh(koiGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }), N);
  koi.frustumCulled = false; // 헤엄쳐 다녀 처음 잰 경계 구가 맞지 않는다
  koi.castShadow = false;
  koi.userData.noPick = true;
  const fish = KOI_COLORS.map((c, i) => {
    koi.setColorAt(i, new THREE.Color(c));
    return {
      cx: p.x + p.rx * 0.22 + Math.sin(i * 2.1) * 0.8,
      cz: p.z + Math.cos(i * 1.7) * 0.6,
      a: p.rx * (0.38 + 0.12 * Math.sin(i * 1.3)),
      b: p.rz * (0.4 + 0.12 * Math.cos(i * 0.9)),
      w: (0.09 + 0.03 * ((i * 7) % 4)) * (i % 3 ? 1 : -1),
      ph: i * 0.83,
      k: i * 1.9,
      s: 1.1 + 0.1 * (i % 4),
      y: p.waterY - 0.07 - 0.03 * (i % 3)
    };
  });
  const o = new THREE.Object3D();
  const at = (f, th) => ({ x: f.cx + f.a * Math.cos(th) + 0.3 * Math.cos(2.3 * th + f.k), z: f.cz + f.b * Math.sin(th) + 0.22 * Math.sin(1.7 * th + f.k) });
  const update = (dt, t) => {
    fish.forEach((f, i) => {
      const th = f.ph + t * f.w, q = at(f, th), q2 = at(f, th + 0.02 * Math.sign(f.w));
      o.position.set(q.x, f.y + 0.012 * Math.sin(t * 1.3 + f.k), q.z);
      o.rotation.set(0, Math.atan2(q2.x - q.x, q2.z - q.z) + 0.16 * Math.sin(t * 5.5 + f.k), 0);
      o.scale.setScalar(f.s);
      o.updateMatrix();
      koi.setMatrixAt(i, o.matrix);
    });
    koi.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  scene.add(koi);
  return { koi, update, spots: [spot] };
}
