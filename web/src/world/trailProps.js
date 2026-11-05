/**
 * 순환 산책로의 소품 — 쉼터 6종(돌 쉼터·그루터기·돗자리·전망 바위·작은 다리·약수터)과 갈림목 석등.
 * 종류마다 빌더 하나(BUILDERS[kind])가 앉는 자리를 원점, 바라보는 쪽을 +z 로 둔 Group 을 돌려준다.
 * 실사 GLB 로 바꿀 때는 그 빌더만 갈아 끼우면 된다. 재질은 mats() 공용이라 batchStatic 이 기존 묶음에 합친다.
 */
import * as THREE from 'three';
import { terrainHeight, walkHeight, addCircleCollider, noise2 } from './layout.js';
import { trail, REST_SPOTS, SMALL_BRIDGE, smallBridgeY } from './trail.js';
import { buildStoneLantern } from './architecture.js';
import { mats } from './materials.js';

const mesh = (geo, mat, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
};

/** 울퉁불퉁한 돌 (윗면을 깎아 평평하게: flatTop 은 0..1 높이 비율) */
function rockGeo(seed, flatTop = 1) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * noise2(x * 1.6 + seed, z * 1.6 + y * 1.2) + 0.08 * noise2(x * 4 + seed, y * 4);
    x *= k;
    y *= k;
    z *= k;
    if (y > flatTop) y = flatTop + (y - flatTop) * 0.08;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** 돗자리 무늬: 짚 결 + 양끝 붉은·남색 띠 */
function matTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9b27a';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 3) {
    g.fillStyle = y % 6 ? 'rgba(120,95,50,0.35)' : 'rgba(255,240,200,0.25)';
    g.fillRect(0, y, 128, 1);
  }
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = 'rgba(90,70,35,0.25)';
    g.fillRect(x, 0, 1, 128);
  }
  for (const [y, col] of [[6, '#8e2f1f'], [12, '#2b3d5c'], [110, '#2b3d5c'], [116, '#8e2f1f']]) {
    g.fillStyle = col;
    g.fillRect(0, y, 128, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDERS = {
  /** 돌 쉼터: 받침돌 둘 + 긴 판석 (앉는 면 0.46m) */
  bench(m) {
    const g = new THREE.Group();
    for (const x of [-0.58, 0.58]) g.add(mesh(new THREE.BoxGeometry(0.3, 0.42, 0.36), m.granite, x, 0.19, 0));
    const top = new THREE.BoxGeometry(1.7, 0.1, 0.46, 1, 1, 1);
    g.add(mesh(top, m.granite, 0, 0.41, 0));
    const pebble = mesh(rockGeo(3, 0.3), m.stoneDark, 1.25, 0.05, -0.25);
    pebble.scale.set(0.28, 0.22, 0.24);
    g.add(pebble);
    return g;
  },
  /** 그루터기: 껍질 원기둥 + 나이테 윗면 + 뿌리 셋 */
  stump(m, spot) {
    const g = new THREE.Group();
    const h = spot.seatH;
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, h, 11), m.woodDark, 0, h / 2 - 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 11), m.woodLight, 0, h - 0.01, 0, false));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      const root = new THREE.ConeGeometry(0.12, 0.5, 6);
      root.rotateZ(Math.PI / 2 - 0.35);
      root.rotateY(a);
      root.translate(Math.cos(a) * 0.36, 0.06, -Math.sin(a) * 0.36);
      g.add(mesh(root, m.woodDark));
    }
    return g;
  },
  /** 전망 바위: 위가 평평한 큰 바위 (앉는 면 seatH) — 비탈 아래쪽으로 몸통이 내려간다 */
  lookout(m, spot, ground) {
    const g = new THREE.Group();
    const r = mesh(rockGeo(11, 0.62), m.granite, 0, spot.seatH - 0.62 * 1.15, -0.55); // 앉는 자리는 바위 앞머리 (내려다볼 때 바위가 덜 가리게)
    r.scale.set(1.35, 1.15, 1.25);
    g.add(r);
    const r2 = mesh(rockGeo(5, 0.4), m.stoneDark, -1.5, ground(-1.5, 0.9) - 0.1, 0.9);
    r2.scale.set(0.7, 0.55, 0.6);
    g.add(r2);
    return g;
  },
  /** 돗자리 자리: 납작한 디딤돌 하나 (돗자리는 앉을 때 따로 펴진다) */
  mat(m) {
    const g = new THREE.Group();
    const st = mesh(rockGeo(21, 0.15), m.stoneDark, 0.9, -0.08, -0.55);
    st.scale.set(0.32, 0.3, 0.26);
    g.add(st);
    return g;
  },
  /** 약수터: 뒤편 돌무더기 + 대나무 홈통 + 돌확(물) + 표주박, 앉는 돌 */
  spring(m, spot, ground) {
    const g = new THREE.Group();
    // 앉는 자리 바로 앞(+z 1.35m)에 돌확, 그 뒤 비탈에 돌무더기와 대나무 홈통 (비탈 높이에 맞춰 세운다)
    const by = ground(0, 1.35), ky = ground(0, 2.3);
    const back = mesh(rockGeo(31, 0.8), m.stoneDark, 0, ky - 0.25, 2.55);
    back.scale.set(1.15, 1.05, 0.75);
    g.add(back);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 12, 1, true), m.granite, 0, by + 0.1, 1.35));
    g.add(mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 14).rotateX(Math.PI / 2), m.granite, 0, by + 0.35, 1.35));
    g.add(mesh(new THREE.CircleGeometry(0.4, 14).rotateX(-Math.PI / 2), SPRING_WATER, 0, by + 0.3, 1.35, false));
    const pipe = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6);
    pipe.rotateX(Math.PI / 2 - 0.25);
    g.add(mesh(pipe, m.woodLight, 0, Math.max(by + 0.62, ky + 0.55), 1.75));
    const gourd = mesh(new THREE.SphereGeometry(0.07, 8, 6), m.woodLight, 0.36, by + 0.39, 1.18);
    gourd.scale.set(1, 0.6, 1.3);
    g.add(gourd);
    const seat = mesh(rockGeo(8, 0.5), m.stoneDark, 0, spot.seatH - 0.5 * 0.4, 0);
    seat.scale.set(0.42, 0.4, 0.36);
    g.add(seat);
    return g;
  },
  /** 작은 나무다리: 판재 + 양옆 보 + 난간 (다리 자체가 쉼터) */
  bridge(m) {
    const b = SMALL_BRIDGE;
    const g = new THREE.Group();
    const n = 18, len = b.z1 - b.z0;
    for (let i = 0; i < n; i++) {
      const z0 = b.z0 + (len * i) / n, z1 = b.z0 + (len * (i + 1)) / n;
      const y0 = smallBridgeY(z0), y1 = smallBridgeY(z1);
      const plank = mesh(new THREE.BoxGeometry(b.halfW * 2 + 0.1, 0.06, Math.hypot(z1 - z0, y1 - y0) - 0.03), m.woodLight, 0, (y0 + y1) / 2 - 0.03, (z0 + z1) / 2);
      plank.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      g.add(plank);
    }
    for (const sx of [-1, 1]) {
      const beamPts = [], railPts = [];
      for (let i = 0; i <= 12; i++) {
        const z = b.z0 + (len * i) / 12, y = smallBridgeY(z);
        beamPts.push(new THREE.Vector3(sx * (b.halfW - 0.05), y - 0.14, z));
        railPts.push(new THREE.Vector3(sx * (b.halfW + 0.02), y + 0.5, z)); // 낮은 난간: 앉아서 내다보는 눈높이(0.8m)보다 아래
      }
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beamPts), 12, 0.09, 5), m.woodDark));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 12, 0.04, 5), m.woodDark));
      for (let i = 0; i <= 4; i++) {
        const z = b.z0 + 0.15 + ((len - 0.3) * i) / 4, y = smallBridgeY(z);
        g.add(mesh(new THREE.BoxGeometry(0.09, 0.56, 0.09), m.woodDark, sx * (b.halfW + 0.02), y + 0.22, z));
      }
      // 물속 기둥 (가운데 둘)
      for (const z of [b.z0 + len * 0.36, b.z0 + len * 0.64]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), m.woodDark, sx * (b.halfW - 0.1), smallBridgeY(z) - 0.82, z));
    }
    for (const z of [b.z0 - 0.15, b.z1 + 0.15]) {
      const st = mesh(rockGeo(z, 0.3), m.granite, 0, b.deckY - 0.35, z);
      st.scale.set(1.2, 0.45, 0.5);
      g.add(st);
    }
    return g;
  }
};

let SPRING_WATER;

/**
 * 산책로 소품을 세운다. 돌려주는 것: { spots, seat(spot), showMat(spot), hideMat(), dynamic: [움직이는 루트], lanterns: [[x,z,y]] }
 */
export function buildTrailProps(scene) {
  const m = mats();
  SPRING_WATER ||= new THREE.MeshStandardMaterial({ color: 0x2e4a48, roughness: 0.06, metalness: 0.35 });
  const spots = REST_SPOTS.map((s) => ({ ...s, y: s.kind === 'bridge' ? smallBridgeY(s.z) : terrainHeight(s.x, s.z) + s.seatH, occupant: null }));

  for (const s of spots) {
    if (s.kind === 'bridge') {
      const g = BUILDERS.bridge(m);
      g.position.set(SMALL_BRIDGE.x, 0, 0);
      scene.add(g);
      continue;
    }
    const gy = terrainHeight(s.x, s.z);
    // 빌더가 쓰는 땅 높이: 쉼터 기준 (앞 lz, 옆 lx) 자리의 지형 높이 − 쉼터 땅 높이
    const ground = (lx, lz) => terrainHeight(s.x + Math.cos(s.ry) * lx + Math.sin(s.ry) * lz, s.z - Math.sin(s.ry) * lx + Math.cos(s.ry) * lz) - gy;
    const g = BUILDERS[s.kind](m, s, ground);
    g.position.set(s.x, gy, s.z);
    g.rotation.y = s.ry;
    scene.add(g);
    if (s.kind === 'bench') addCircleCollider(s.x + Math.sin(s.ry) * 0.05, s.z + Math.cos(s.ry) * 0.05, 0.5);
    else if (s.kind === 'stump') addCircleCollider(s.x, s.z, 0.38);
    else if (s.kind === 'lookout') addCircleCollider(s.x - Math.sin(s.ry) * 0.45, s.z - Math.cos(s.ry) * 0.45, 0.95);
    else if (s.kind === 'spring') addCircleCollider(s.x + Math.sin(s.ry) * 1.6, s.z + Math.cos(s.ry) * 1.6, 0.9);
  }

  // 돗자리: 말아 둔 것(쉴 때) ↔ 편 것(앉았을 때)
  const matSpots = spots.filter((s) => s.kind === 'mat');
  const matMat = new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.92 });
  const rollGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.95, 10);
  rollGeo.rotateZ(Math.PI / 2);
  const rolls = new THREE.InstancedMesh(rollGeo, matMat, matSpots.length);
  rolls.castShadow = true;
  rolls.receiveShadow = true;
  const o = new THREE.Object3D();
  const setRoll = (i, shown) => {
    const s = matSpots[i];
    o.position.set(s.x + Math.cos(s.ry) * 0.9, terrainHeight(s.x, s.z) + 0.09, s.z - Math.sin(s.ry) * 0.9);
    o.rotation.set(0, s.ry, 0);
    o.scale.setScalar(shown ? 1 : 0);
    o.updateMatrix();
    rolls.setMatrixAt(i, o.matrix);
    rolls.instanceMatrix.needsUpdate = true;
  };
  matSpots.forEach((_, i) => setRoll(i, true));
  scene.add(rolls);
  const flatGeo = new THREE.PlaneGeometry(1.0, 1.5, 1, 1);
  flatGeo.rotateX(-Math.PI / 2);
  const flat = mesh(flatGeo, matMat, 0, 0, 0, false);
  flat.visible = false;
  scene.add(flat);
  let shownMat = -1;

  // 갈림목·다리·전망 바위 석등 (밤길 표시) — 산책로 바깥쪽 2.3m
  const lanterns = [];
  for (const sAt of [3, 26, 116, 178, 212]) {
    const a = trail.at(sAt - 0.5), c = trail.at(sAt + 0.5), p = trail.at(sAt);
    const l = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    const x = p.x + ((c.z - a.z) / l) * 2.3, z = p.z - ((c.x - a.x) / l) * 2.3;
    const lan = buildStoneLantern(0.7);
    const y = terrainHeight(x, z);
    lan.position.set(x, y, z);
    scene.add(lan);
    addCircleCollider(x, z, 0.4);
    lanterns.push({ x, z, y });
  }

  return {
    spots,
    lanterns,
    dynamic: [rolls, flat],
    /** 이 쉼터에 앉는 자리 (cushionSeat 와 같은 꼴: occupant getter/setter, standAt) */
    seat(s) {
      return {
        x: s.x,
        y: s.y,
        z: s.z,
        ry: s.ry,
        kind: 'rest',
        spotId: s.id,
        standAt: { x: s.stand.x, z: s.stand.z },
        _ref: s,
        get occupant() {
          return s.occupant;
        },
        set occupant(v) {
          s.occupant = v;
        }
      };
    },
    showMat(s) {
      const i = matSpots.findIndex((q) => q.id === s.id);
      if (i < 0) return;
      this.hideMat();
      setRoll(i, false);
      flat.position.set(s.x, walkHeight(s.x, s.z) + 0.015, s.z);
      flat.rotation.y = s.ry;
      flat.visible = true;
      shownMat = i;
    },
    hideMat() {
      if (shownMat < 0) return;
      setRoll(shownMat, true);
      flat.visible = false;
      shownMat = -1;
    }
  };
}
