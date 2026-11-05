/**
 * 수목 — 전나무·소나무·단풍나무(11월)·대나무 숲·풀·연꽃. 전부 InstancedMesh + 바람 셰이더.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, terrainHeight, isClearForTree, addCircleCollider, pathX, noise2, streamZ } from './layout.js';
import { windSway, weatherable } from './materials.js';
import { bambooTexture } from './textures.js';
import { nearestTrail, trail, REST_SPOTS } from './trail.js';

const trailDist = (x, z) => nearestTrail(x, z)?.d ?? 99;

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 정점색을 칠한 지오메트리 (아래쪽 어둡게 = 간이 AO) */
function paint(geo, color, aoTop = 1, aoBottom = 0.55, jitter = 0.08, seed = 1) {
  const r = rand(seed);
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const c = new THREE.Color(color);
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / Math.max(max.y - min.y, 1e-3);
    const k = (aoBottom + (aoTop - aoBottom) * t) * (1 - jitter / 2 + r() * jitter);
    cols[i * 3] = c.r * k;
    cols[i * 3 + 1] = c.g * k;
    cols[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

function jitterVerts(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise2(x * 2.1 + seed, z * 2.1 + y * 1.3);
    p.setXYZ(i, x * (1 + n * amt), y + n * amt * 0.5, z * (1 + n * amt));
  }
  geo.computeVertexNormals();
  return geo;
}

/* 전나무: 층층이 쌓인 원뿔 */
function firGeometry() {
  const parts = [];
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 2.3 * (1 - t * 0.82);
    const h = 3.0 * (1 - t * 0.35);
    const cone = new THREE.ConeGeometry(r, h, 9, 1, true);
    cone.translate(0, 2.4 + i * 1.55 + h / 2, 0);
    cone.rotateY(i * 0.7);
    parts.push(jitterVerts(cone, 0.12, i));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  return paint(g, '#2c4a30', 1.15, 0.5, 0.1, 3);
}

/* 소나무: 굽은 줄기 + 납작한 솔잎 덩어리 */
function pineCrownGeometry() {
  const parts = [];
  const r = rand(17);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.SphereGeometry(1, 9, 6);
    s.scale(1.9 + r() * 0.8, 0.55 + r() * 0.2, 1.6 + r() * 0.6);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 1 + r() * 1.6;
    s.translate(Math.cos(a) * d + (i === 0 ? 0 : 0.6), 6.6 + i * 0.55 - (i > 3 ? 1.6 : 0) + r() * 0.5, Math.sin(a) * d);
    parts.push(jitterVerts(s, 0.18, i * 3).toNonIndexed());
  }
  return paint(mergeGeometries(parts), '#34502f', 1.2, 0.55, 0.12, 9);
}

function pineTrunkGeometry() {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * 2.4) * 0.7 + t * 0.6, t * 7.4, Math.sin(t * 1.7 + 1) * 0.35));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 12, 0.24, 7, false);
  // 위로 갈수록 가늘게
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / 7.4;
    const c = curve.getPoint(Math.min(Math.max(t, 0), 1));
    const k = 1 - t * 0.55;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, y, c.z + (p.getZ(i) - c.z) * k);
  }
  g.computeVertexNormals();
  return paint(g, '#5e4436', 1, 0.6, 0.1, 5);
}

function trunkGeometry(h = 3, r = 0.28) {
  const g = new THREE.CylinderGeometry(r * 0.55, r, h, 7);
  g.translate(0, h / 2, 0);
  return paint(g, '#4a3526', 1, 0.7, 0.05, 2);
}

/* 단풍나무: 둥근 수관 */
function mapleCrownGeometry() {
  const parts = [];
  const r = rand(31);
  for (let i = 0; i < 12; i++) {
    const s = new THREE.IcosahedronGeometry(0.85 + r() * 0.5, 1);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.8 + r() * 1.3;
    s.translate(Math.cos(a) * d, 4.0 + r() * 2.2 - d * 0.35, Math.sin(a) * d);
    parts.push(jitterVerts(s, 0.16, i).toNonIndexed());
  }
  return paint(mergeGeometries(parts), '#ffffff', 1.1, 0.55, 0.15, 13);
}

function foliageMaterial(sway) {
  return windSway(
    weatherable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: false }), { snow: 0.9, wet: 0.4 }),
    sway
  );
}

export function buildVegetation(scene, quality) {
  const low = quality === 'low';
  const r = rand(9001);
  const spots = { fir: [], pine: [], maple: [] };

  // 숲길 양옆: 촘촘한 전나무 + 소나무
  const tryPlace = (x, z, kind, margin = 0) => {
    if (!isClearForTree(x, z, margin)) return false;
    for (const k of Object.keys(spots)) {
      for (const s of spots[k]) if (Math.hypot(s[0] - x, s[1] - z) < 2.6) return false;
    }
    spots[kind].push([x, z, 0.8 + r() * 0.5, r() * Math.PI * 2]);
    return true;
  };
  for (let i = 0; i < (low ? 380 : 900); i++) {
    const z = 6 + r() * 50;
    const side = r() > 0.5 ? 1 : -1;
    const x = pathX(z) + side * (4.6 + Math.pow(r(), 1.6) * 26);
    const near = Math.abs(x - pathX(z)) < 10;
    tryPlace(x, z, near && r() > 0.65 ? 'pine' : r() > 0.82 ? 'maple' : 'fir');
  }
  // 경내 둘레 산자락
  for (let i = 0; i < (low ? 450 : 1300); i++) {
    const x = -60 + r() * 130, z = -70 + r() * 125;
    const kind = r() > 0.7 ? 'pine' : r() > 0.72 ? 'maple' : 'fir';
    tryPlace(x, z, kind, 1);
  }
  // 마당·대웅전 근처 단풍 포인트
  [
    [-24.5, 1], [-25, -10], [-14, -21.5], [14, -22], [16.5, -24], [35, 2], [-27, -18], [7.5, 11.5], [-8, 12.5]
  ].forEach(([x, z]) => trailDist(x, z) > 3.4 && spots.maple.push([x, z, 1 + r() * 0.3, r() * 6]));

  const o = new THREE.Object3D();
  const place = (inst, list, i, yOff = 0) => {
    const [x, z, s, rot] = list[i];
    o.position.set(x, terrainHeight(x, z) - 0.1 + yOff, z);
    o.rotation.set(0, rot, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
  };

  // 전나무
  const firF = new THREE.InstancedMesh(firGeometry(), foliageMaterial({ strength: 0.03, height: 12 }), spots.fir.length);
  const firT = new THREE.InstancedMesh(trunkGeometry(3, 0.32), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), spots.fir.length);
  spots.fir.forEach((_, i) => {
    place(firF, spots.fir, i);
    place(firT, spots.fir, i);
  });
  // 소나무
  const pineF = new THREE.InstancedMesh(pineCrownGeometry(), foliageMaterial({ strength: 0.035, height: 9 }), spots.pine.length);
  const pineT = new THREE.InstancedMesh(pineTrunkGeometry(), windSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { strength: 0.03, height: 9 }), spots.pine.length);
  spots.pine.forEach((_, i) => {
    place(pineF, spots.pine, i);
    place(pineT, spots.pine, i);
  });
  // 단풍 (인스턴스 색: 홍·주황·노랑)
  const mapleF = new THREE.InstancedMesh(mapleCrownGeometry(), foliageMaterial({ strength: 0.04, height: 7 }), spots.maple.length);
  const mapleT = new THREE.InstancedMesh(trunkGeometry(4.5, 0.2), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), spots.maple.length);
  const palette = ['#b8361f', '#cf4a1c', '#d9781f', '#e0a12a', '#9c2a1e', '#c75a2a'].map((h) => new THREE.Color(h));
  spots.maple.forEach((_, i) => {
    place(mapleF, spots.maple, i);
    place(mapleT, spots.maple, i);
    mapleF.setColorAt(i, palette[Math.floor(r() * palette.length)]);
  });
  for (const m of [firF, firT, pineF, pineT, mapleF, mapleT]) {
    m.userData.noPick = true;
    m.castShadow = !low; // 저사양은 나무 그림자를 끈다 (그림자 패스 삼각형 절감)
    m.receiveShadow = true;
    scene.add(m);
  }
  // 길 가까운 나무만 충돌
  for (const k of ['fir', 'pine', 'maple']) {
    for (const [x, z, s] of spots[k]) if (Math.abs(x - pathX(z)) < 8 || z < 6 || trailDist(x, z) < 6) addCircleCollider(x, z, 0.45 * s);
  }

  buildBamboo(scene, low);
  buildGrass(scene, low);
  const lotus = buildLotus(scene);
  // 카메라가 수관 속으로 들어가지 않도록 쓰는 장애물 목록 [x, z, 수관 반경, 수관 아래, 수관 위]
  const crowns = [
    ...spots.fir.map(([x, z, s]) => [x, z, 1.9 * s, 2.2 * s, 12 * s]),
    ...spots.pine.map(([x, z, s]) => [x, z, 2.4 * s, 5.4 * s, 9.6 * s]),
    ...spots.maple.map(([x, z, s]) => [x, z, 2.3 * s, 2.6 * s, 7.4 * s])
  ];
  return { lotus, crowns, counts: { fir: spots.fir.length, pine: spots.pine.length, maple: spots.maple.length } };
}

function buildBamboo(scene, low) {
  const r = rand(555);
  const b = L.bamboo;
  const n = low ? 260 : 460;
  const stalks = [];
  for (let i = 0; i < n; i++) {
    const x = b.x0 + r() * (b.x1 - b.x0), z = b.z0 + r() * (b.z1 - b.z0);
    const h = 7 + r() * 5, rot = r() * 6;
    if (trailDist(x, z) < 2.3 || REST_SPOTS.some((q) => Math.hypot(q.x - x, q.z - z) < 2.2)) continue; // 대숲 사이 산책로
    stalks.push([x, z, h, rot]);
  }
  // 다실 뒤 띠
  for (let i = 0; i < (low ? 60 : 110); i++) {
    stalks.push([20 + r() * 10, -19.5 - r() * 3.5, 6 + r() * 4, r() * 6]);
  }
  const stalkGeo = new THREE.CylinderGeometry(0.055, 0.07, 1, 6);
  stalkGeo.translate(0, 0.5, 0);
  const tex = bambooTexture();
  tex.repeat.set(1, 4);
  const stalkMat = windSway(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), { strength: 0.45, height: 1 });
  const stalkInst = new THREE.InstancedMesh(stalkGeo, stalkMat, stalks.length);
  // 잎: 위쪽에 얇은 잎 다발
  const leafParts = [];
  const lr = rand(7);
  for (let k = 0; k < 14; k++) {
    const leaf = new THREE.PlaneGeometry(0.09, 0.55);
    leaf.translate(0, 0.27, 0);
    leaf.rotateX(-1.1 + lr() * 0.6);
    leaf.rotateY(lr() * Math.PI * 2);
    leaf.translate(0, 0.62 + lr() * 0.35, 0);
    leafParts.push(leaf);
  }
  const leafGeo = paint(mergeGeometries(leafParts), '#5f8a3a', 1.15, 0.7, 0.2, 4);
  const leafMat = windSway(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 }), { strength: 0.1, height: 1, flutter: 0.02 });
  const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, stalks.length);
  const o = new THREE.Object3D();
  stalks.forEach(([x, z, h, rot], i) => {
    o.position.set(x, terrainHeight(x, z) - 0.05, z);
    o.rotation.set((r() - 0.5) * 0.08, rot, (r() - 0.5) * 0.08);
    o.scale.set(1, h, 1);
    o.updateMatrix();
    stalkInst.setMatrixAt(i, o.matrix);
    o.scale.set(h * 0.45, h, h * 0.45);
    o.updateMatrix();
    leafInst.setMatrixAt(i, o.matrix);
  });
  stalkInst.castShadow = !low;
  leafInst.castShadow = !low;
  stalkInst.userData.noPick = leafInst.userData.noPick = true;
  scene.add(stalkInst, leafInst);
}

function buildGrass(scene, low) {
  const r = rand(808);
  const tufts = [];
  const n = low ? 500 : 2200;
  // 순환 산책로 가장자리 풀
  for (let i = 0; i < (low ? 500 : 1400); i++) {
    const m = trail.at(r() * trail.length);
    const x = m.x + (r() - 0.5) * 9, z = m.z + (r() - 0.5) * 9;
    const d = trailDist(x, z);
    if (d < 1.6 || d > 4.5 || Math.abs(z - streamZ(x)) < 3 || REST_SPOTS.some((q) => Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
    tufts.push([x, z, 0.3 + r() * 0.36, r() * 6]);
  }
  const base = tufts.length;
  for (let i = 0; i < n * 3 && tufts.length - base < n; i++) {
    const x = -30 + r() * 70, z = -30 + r() * 80;
    const dp = Math.abs(x - pathX(z));
    const nearPath = z > 6 && dp > 1.8 && dp < 9;
    const teaLawn = x > L.teahouseTerrace.x0 && x < L.teahouseTerrace.x1 && z < L.teahouseTerrace.z1 && z > L.teahouseTerrace.z0;
    const bank = Math.abs(z - streamZ(x)) > 1.6 && Math.abs(z - streamZ(x)) < 4.5;
    if (!(nearPath || bank || teaLawn)) continue;
    if (trailDist(x, z) < 1.5) continue;
    if (teaLawn && Math.hypot((x - L.pond.x) / L.pond.rx, (z - L.pond.z) / L.pond.rz) < 1.15) continue;
    if (teaLawn && x > 24 && x < 30.5 && z < -7.4 && z > -17.6) continue;
    tufts.push([x, z, 0.32 + r() * 0.38, r() * 6]);
  }
  const parts = [];
  const gr = rand(3);
  for (let k = 0; k < 7; k++) {
    const blade = new THREE.PlaneGeometry(0.06, 0.5);
    blade.translate(0, 0.25, 0);
    blade.rotateX((gr() - 0.5) * 0.7);
    blade.rotateY(gr() * Math.PI);
    blade.translate((gr() - 0.5) * 0.2, 0, (gr() - 0.5) * 0.2);
    parts.push(blade);
  }
  const geo = paint(mergeGeometries(parts), '#5d6232', 1.1, 0.45, 0.25, 6);
  const mat = windSway(weatherable(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), { snow: 1, wet: 0.5 }), { strength: 0.3, height: 0.5 });
  const inst = new THREE.InstancedMesh(geo, mat, tufts.length);
  const o = new THREE.Object3D();
  tufts.forEach(([x, z, s, rot], i) => {
    o.position.set(x, terrainHeight(x, z), z);
    o.rotation.set(0, rot, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    inst.setMatrixAt(i, o.matrix);
  });
  inst.receiveShadow = true;
  inst.userData.noPick = true;
  scene.add(inst);
}

function buildLotus(scene) {
  const r = rand(66);
  const p = L.pond;
  const pads = [], flowers = [];
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.88;
    const x = p.x + Math.cos(a) * d * p.rx, z = p.z + Math.sin(a) * d * p.rz;
    pads.push([x, z, 0.35 + r() * 0.35, r() * 6]);
    if (r() > 0.6) flowers.push([x + 0.1, z, 0.8 + r() * 0.4, r() * 6]);
  }
  // 연잎: 노치가 있는 원판
  const padGeo = new THREE.CircleGeometry(1, 20, 0.2, Math.PI * 2 - 0.4);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = weatherable(new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.6, side: THREE.DoubleSide }), { snow: 1, wet: 0 });
  const padInst = new THREE.InstancedMesh(padGeo, padMat, pads.length);
  const o = new THREE.Object3D();
  pads.forEach(([x, z, s, rot], i) => {
    o.position.set(x, p.waterY + 0.02, z);
    o.rotation.set(0, rot, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    padInst.setMatrixAt(i, o.matrix);
  });
  padInst.receiveShadow = true;
  scene.add(padInst);
  // 연꽃: 꽃잎 두 겹
  const petals = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let k = 0; k < 8; k++) {
      const pg = new THREE.SphereGeometry(0.1, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      pg.scale(0.7, 1.8, 0.35);
      pg.rotateX(0.45 + ring * 0.35);
      pg.translate(0, 0, 0.06 + ring * 0.03);
      pg.rotateY((k / 8) * Math.PI * 2 + ring * 0.4);
      petals.push(pg);
    }
  }
  const flowerGeo = paint(mergeGeometries(petals), '#f2b3c4', 1.15, 0.75, 0.1, 2);
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x3a1018, emissiveIntensity: 0.4 });
  const flInst = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length);
  flowers.forEach(([x, z, s, rot], i) => {
    o.position.set(x, p.waterY + 0.12, z);
    o.rotation.set(0, rot, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    flInst.setMatrixAt(i, o.matrix);
  });
  flInst.castShadow = true;
  scene.add(flInst);
  return { pads: padInst, flowers: flInst };
}
