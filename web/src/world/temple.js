/**
 * 청연산사 경내 조립 — 전각·석조물·법당 내부·신행 소품, 그리고 상호작용 지점 등록.
 * 동적인 소품(연등, 돌탑, 화로, 범종, 향로, 기와대)은 각자 갱신 메서드를 가진다.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  L,
  terrainHeight,
  pathX,
  pathY,
  streamZ,
  STREAM_WATER_Y,
  addCircleCollider,
  addBoxCollider
} from './layout.js';
import { mats, envUniforms, nightGlow, weatherable } from './materials.js';
import {
  buildHanok,
  buildRoof,
  buildPagoda,
  buildStoneLantern,
  buildIljumun,
  buildBellPavilion,
  buildWall,
  buildStairs,
  columnGeometry
} from './architecture.js';
import { makeEmitter } from './effects.js';
import { buildBuddhaStatue } from './buddha.js';
import { buildTrailProps } from './trailProps.js';
import { buildWestCourt, buildWestGate } from './westCourt.js';
import { CairnField } from './cairnField.js';
import { taenghwaTexture, ceilingTexture, sumidanTexture, canopyTexture, valanceTexture, tileWishTexture, softDotTexture, latticeTextures, graniteTextures } from './textures.js';

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const shadowAll = (obj) => {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.castShadow || false;
      o.receiveShadow = true;
    }
  });
  return obj;
};

export class Temple {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.interactables = [];
    this.emitters = [];
    this.lightAnchors = {};
    this.glowDecals = [];
    this.m = mats();

    this._forest();
    this._courtyard();
    this._hall();
    this._teahouse();
    this.lanterns = new LanternSystem(scene);
    this.cairn = new Cairn(scene, this.cairnPos);
    // 순환 산책로: 쉼터·작은 다리·갈림목 석등, 그리고 길가 돌탑
    this.trail = buildTrailProps(scene);
    this.trail.lanterns.forEach(({ x, z, y, r, i }) => this.glowDecals.push({ x, z, y, r, i }));
    // 서쪽 마당(예비 마당): 담·석등·쉼터. 쉼터는 산책로 쉼터 목록에 더해 같은 방식으로 앉는다
    const west = buildWestCourt(scene, this.m);
    this.trail.spots.push(...west.spots);
    west.glow.forEach((d) => this.glowDecals.push(d));
    this.cairns = new CairnField(scene, quality);
    this._glowDecalsMesh();
  }

  /** 매 프레임 움직이거나 바뀌는 소품 — 정적 병합에서 제외 */
  dynamicRoots() {
    return new Set([
      this.bell.userData.bellPivot,
      this.bell.userData.ram,
      this.incense.group,
      this.cairn.group,
      ...this.trail.dynamic,
      ...this.votives
    ]);
  }

  addInteractable(def) {
    this.interactables.push(def);
    return def;
  }

  /* ───────── Zone 1: 일주문 · 숲길 · 계곡 · 석교 · 돌탑 ───────── */
  _forest() {
    const m = this.m;
    const gate = buildIljumun();
    gate.position.set(L.gate.x, pathY(L.gate.z) - 0.05, L.gate.z);
    this.scene.add(gate);
    gate.userData.columns.forEach(([x, z]) => addCircleCollider(L.gate.x + x, L.gate.z + z, 0.55));

    // 홍예 석교
    const b = L.bridge;
    const sz = streamZ(b.x);
    const deckY = pathY(sz);
    const shape = new THREE.Shape();
    const n = 24;
    shape.moveTo(-b.halfLen - 0.3, deckY - 1.3);
    for (let i = 0; i <= n; i++) {
      const u = -1 + (2 * i) / n;
      shape.lineTo(u * (b.halfLen + 0.3), deckY + b.rise * Math.cos((u * Math.PI) / 2) - 0.02);
    }
    shape.lineTo(b.halfLen + 0.3, deckY - 1.3);
    shape.lineTo(1.5, deckY - 1.3);
    shape.absarc(0, STREAM_WATER_Y - 0.3, 1.5, 0, Math.PI, false);
    shape.lineTo(-b.halfLen - 0.3, deckY - 1.3);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.halfWidth * 2, bevelEnabled: false });
    geo.translate(0, 0, -b.halfWidth);
    geo.rotateY(Math.PI / 2);
    const bridge = new THREE.Mesh(geo, m.granite);
    bridge.position.set(b.x, 0, sz);
    bridge.castShadow = true;
    bridge.receiveShadow = true;
    this.scene.add(bridge);
    // 난간 기둥과 돌난간
    const posts = [];
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= 6; i++) {
        const u = -1 + (2 * i) / 6;
        const y = deckY + b.rise * Math.cos((u * Math.PI) / 2);
        const pg = new THREE.BoxGeometry(0.18, 0.62, 0.18);
        pg.translate(b.x + sx * (b.halfWidth - 0.1), y + 0.3, sz + u * b.halfLen);
        posts.push(pg);
      }
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = -1 + (2 * i) / 12;
        pts.push(new THREE.Vector3(b.x + sx * (b.halfWidth - 0.1), deckY + b.rise * Math.cos((u * Math.PI) / 2) + 0.5, sz + u * b.halfLen));
      }
      posts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.06, 6, false));
    }
    const rail = new THREE.Mesh(mergeGeometries(posts.map((p) => p.toNonIndexed())), m.granite);
    rail.castShadow = true;
    this.scene.add(rail);

    // 숲길 석등 (쌍)
    [33, 20.5, 9.6].forEach((z) => {
      for (const sx of [-1, 1]) {
        const x = pathX(z) + sx * 2.5;
        const lan = buildStoneLantern(0.82);
        lan.position.set(x, terrainHeight(x, z), z);
        this.scene.add(lan);
        addCircleCollider(x, z, 0.5);
        this.glowDecals.push({ x, z, y: terrainHeight(x, z), r: 2.6, i: 0.55 });
      }
    });

    // 소원 돌탑 (메인) + 장식 돌탑
    const cz = 31;
    const cx = pathX(cz) + 3.3;
    this.cairnPos = new THREE.Vector3(cx, terrainHeight(cx, cz), cz);
    addCircleCollider(cx, cz, 0.75);
    this.addInteractable({
      id: 'stone_pagoda',
      label: '소원 돌탑에 돌 얹기',
      zone: 'FOREST',
      pos: this.cairnPos,
      radius: 3.2,
      approach: { x: cx - 1.35, z: cz, ry: Math.PI / 2 }
    });
    const deco = rand(12);
    [[pathX(23) - 3.4, 23], [pathX(12) + 3.2, 11.5], [pathX(40) - 3.1, 40]].forEach(([x, z]) => {
      const g = new THREE.Group();
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const s = 0.42 - i * 0.055;
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m.stoneDark);
        st.scale.set(s, s * 0.45, s * (0.85 + deco() * 0.3));
        st.rotation.y = deco() * 6;
        st.position.y = y + s * 0.4;
        st.castShadow = true;
        y += s * 0.78;
        g.add(st);
      }
      g.position.set(x, terrainHeight(x, z), z);
      this.scene.add(g);
    });
  }

  /* ───────── Zone 2: 마당 ───────── */
  _courtyard() {
    const m = this.m;
    const c = L.courtyard;
    // 앞 석축 (계단 자리 비움)
    const front = (x0, x1) => {
      let g = c.y - 0.35; // 앞 땅의 가장 낮은 곳보다 0.3m 더 묻는다 (서쪽 마당 앞은 숲길 쪽보다 낮다)
      for (let x = x0; x <= x1; x += 0.5) g = Math.min(g, terrainHeight(x, c.z1 + 0.75));
      const h = c.y + 0.12 - g + 0.3;
      const w = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 0.7), m.granite);
      w.position.set((x0 + x1) / 2, c.y + 0.12 - h / 2, c.z1 + 0.2);
      w.castShadow = true;
      w.receiveShadow = true;
      this.scene.add(w);
    };
    front(L.westCourt.x0 - 1.0, -L.courtStairs.halfW - 0.3);
    front(L.courtStairs.halfW + 0.3, c.x1 + 0.6);
    const cs = buildStairs(L.courtStairs.halfW * 2, 3, (c.y - pathY(L.courtStairs.z1)) / 3, (L.courtStairs.z1 - L.courtStairs.z0) / 3);
    cs.position.set(0, pathY(L.courtStairs.z1), L.courtStairs.z1);
    this.scene.add(cs);

    // 돌담 (동쪽은 다실 가는 길을 비움)
    const wallAt = (x, z0, z1) => {
      const w = buildWall(Math.abs(z1 - z0));
      w.rotation.y = Math.PI / 2;
      w.position.set(x, c.y, (z0 + z1) / 2);
      this.scene.add(w);
      addBoxCollider(x - 0.4, Math.min(z0, z1), x + 0.4, Math.max(z0, z1));
    };
    // 서쪽 담: 서쪽 마당과 사이, 협문 자리를 비우고 대웅전 옆마당 앞(c.z0)에서 끝난다
    wallAt(c.x0 - 0.5, c.z1 + 0.5, L.westGate.z1);
    wallAt(c.x0 - 0.5, L.westGate.z0, c.z0);
    buildWestGate(this.scene, m);
    wallAt(c.x1 + 0.5, c.z1 + 0.5, L.teaLink.z1);
    wallAt(c.x1 + 0.5, L.teaLink.z0, c.z0 - 2.5);
    // 담장 문 기둥
    for (const z of [L.teaLink.z1, L.teaLink.z0]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.1, 0.5), m.granite);
      p.position.set(c.x1 + 0.5, c.y + 1.05, z);
      p.castShadow = true;
      this.scene.add(p);
    }

    // 삼층석탑
    const pg = buildPagoda();
    pg.userData.realSlot = 'pagoda'; // 실사 세계(world/real)가 스캔으로 바꿔 끼우는 자리
    pg.position.set(L.pagoda.x, c.y, L.pagoda.z);
    this.scene.add(pg);
    addBoxCollider(L.pagoda.x - 1.75, L.pagoda.z - 1.75, L.pagoda.x + 1.75, L.pagoda.z + 1.75);
    this.addInteractable({
      id: 'circumambulate',
      label: '석탑 탑돌이',
      zone: 'COURTYARD',
      pos: new THREE.Vector3(L.pagoda.x, c.y, L.pagoda.z),
      radius: 5.4,
      approach: null
    });

    // 대웅전 앞 석등
    const sl = buildStoneLantern(1.25);
    sl.position.set(L.stoneLanternFront.x, c.y, L.stoneLanternFront.z);
    this.scene.add(sl);
    addCircleCollider(L.stoneLanternFront.x, L.stoneLanternFront.z, 0.8);
    this.lightAnchors.stoneLantern = new THREE.Vector3(L.stoneLanternFront.x, c.y + sl.userData.fireY, L.stoneLanternFront.z);
    this.glowDecals.push({ x: L.stoneLanternFront.x, z: L.stoneLanternFront.z, y: c.y, r: 3.4, i: 0.6 });

    // 범종각
    const bell = buildBellPavilion();
    bell.position.set(L.bell.x, c.y, L.bell.z);
    bell.rotation.y = Math.PI;
    this.scene.add(bell);
    this.bell = bell;
    this.bellAnim = { t: -1 };
    addBoxCollider(L.bell.x - 2.55, L.bell.z - 2.55, L.bell.x + 2.55, L.bell.z + 2.55);
    this.addInteractable({
      id: 'bell_strike',
      label: '범종 치기',
      zone: 'COURTYARD',
      pos: new THREE.Vector3(L.bell.x, c.y, L.bell.z),
      radius: 4.6,
      approach: { x: L.bell.x - 3.4, z: L.bell.z, ry: Math.PI / 2 }
    });

    // 번뇌 소각 화로
    const bz = new THREE.Group();
    const prof = [
      [0.0, 0.1],
      [0.5, 0.12],
      [0.72, 0.42],
      [0.78, 0.72],
      [0.84, 0.78],
      [0.8, 0.82],
      [0.7, 0.5],
      [0.0, 0.5]
    ].map(([r, y]) => new THREE.Vector2(r, y + 0.35));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), m.bronze);
    bowl.material.side = THREE.DoubleSide;
    bowl.castShadow = true;
    bz.add(bowl);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6), m.bronze);
      leg.position.set(Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5);
      bz.add(leg);
    }
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.66, 20), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff5a1a, emissiveIntensity: 1.4, roughness: 1 }));
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = 0.86;
    bz.add(coals);
    bz.position.set(L.brazier.x, c.y, L.brazier.z);
    this.scene.add(bz);
    addCircleCollider(L.brazier.x, L.brazier.z, 0.95);
    const fire = makeEmitter({ count: 46, spread: 0.18, rise: 1.1, life: 0.9, size: 0.55, grow: -0.5, color: '#ffb35c', opacity: 0.85, texture: 'flame', additive: true, drift: 0.1, seed: 3 });
    fire.position.set(L.brazier.x, c.y + 0.85, L.brazier.z);
    const smoke = makeEmitter({ count: 26, spread: 0.2, rise: 3.4, life: 5, size: 0.9, grow: 2.6, color: '#8a8580', opacity: 0.32, texture: 'smoke', drift: 0.5, seed: 4 });
    smoke.position.set(L.brazier.x, c.y + 1.4, L.brazier.z);
    const embers = makeEmitter({ count: 24, spread: 0.3, rise: 2.6, life: 2.2, size: 0.06, grow: 0, color: '#ffcf7a', opacity: 1, texture: 'dot', additive: true, drift: 0.6, seed: 5 });
    embers.position.set(L.brazier.x, c.y + 0.9, L.brazier.z);
    this.scene.add(fire, smoke, embers);
    this.brazier = { fire, smoke, embers, flare: 0, base: 0.55 };
    this.emitters.push(fire, smoke, embers);
    this.lightAnchors.brazier = new THREE.Vector3(L.brazier.x, c.y + 1.6, L.brazier.z);
    this.addInteractable({
      id: 'burn_worry',
      label: '번뇌 소각 화로',
      zone: 'COURTYARD',
      pos: new THREE.Vector3(L.brazier.x, c.y, L.brazier.z),
      radius: 3.6,
      approach: { x: L.brazier.x + 1.7, z: L.brazier.z, ry: -Math.PI / 2 }
    });

    // 기와 불사대
    this.tileRack = new TileRack(this.scene, new THREE.Vector3(L.tileRack.x, c.y, L.tileRack.z));
    addBoxCollider(L.tileRack.x - 0.7, L.tileRack.z - 3.3, L.tileRack.x + 0.7, L.tileRack.z + 3.3);
    this.addInteractable({
      id: 'wish_tile',
      label: '기와 불사',
      zone: 'COURTYARD',
      pos: new THREE.Vector3(L.tileRack.x, c.y, L.tileRack.z),
      radius: 3.4,
      approach: { x: L.tileRack.x + 1.8, z: L.tileRack.z, ry: -Math.PI / 2 }
    });

    // 연등 아래 (연등은 클릭으로 따로 연다)
    this.addInteractable({
      id: 'wish_lantern',
      label: '소원 연등 달기',
      zone: 'COURTYARD',
      pos: new THREE.Vector3(0, c.y, 3.4),
      radius: 2.2,
      approach: null
    });
    this.lightAnchors.lanternGlow = new THREE.Vector3(0, c.y + 4.2, -5.4);

    // 대웅전 계단 + 기단
    const hs = buildStairs(L.hallStairs.halfW * 2, 10, (L.stylobate.y - c.y) / 10, (L.hallStairs.z0 - L.hallStairs.z1) / 10);
    hs.position.set(0, c.y, L.hallStairs.z0);
    this.scene.add(hs);
    const s = L.stylobate;
    const base = new THREE.Mesh(new THREE.BoxGeometry(s.x1 - s.x0, s.y - c.y + 0.5, s.z1 - s.z0), m.granite);
    base.position.set(0, (s.y + c.y - 0.5) / 2 + 0.01, (s.z0 + s.z1) / 2);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    const capGeo = new THREE.BoxGeometry(s.x1 - s.x0 + 0.3, 0.16, s.z1 - s.z0 + 0.3);
    const cap = new THREE.Mesh(capGeo, m.granite);
    cap.position.set(0, s.y - 0.06, (s.z0 + s.z1) / 2);
    cap.receiveShadow = true;
    this.scene.add(cap);
  }

  /* ───────── Zone 3: 대웅전 ───────── */
  _hall() {
    const m = this.m;
    const h = L.hall;
    const fy = h.floorY;
    // 마루
    const fl = new THREE.Mesh(new THREE.BoxGeometry(h.x1 - h.x0 + 0.6, fy - L.stylobate.y + 0.02, h.z1 - h.z0 + 0.6), [m.woodDark, m.woodDark, m.floor, m.woodDark, m.woodDark, m.woodDark]);
    m.floor.map.repeat.set((h.x1 - h.x0 + 0.6) / 5.5, (h.z1 - h.z0 + 0.6) / 5.3); // 마루 널 한 장 폭이 예전(16m 법당 3×2)과 같게
    fl.position.set(0, (fy + L.stylobate.y) / 2, (h.z0 + h.z1) / 2);
    fl.receiveShadow = true;
    this.scene.add(fl);

    const colH = h.colH;
    const hall = buildHanok({
      xs: h.xs,
      zs: h.zs,
      colH,
      colR: 0.3,
      front: 'open',
      back: 'wall',
      sides: ['wall', 'wall', 'doors'],
      brackets: 2,
      roof: { type: 'paljak', overhang: 3.0, height: 5.6, lift: 0.95, gableFrac: 0.4, segs: 64 },
      plaque: { text: '大雄殿', width: 3.0 }
    });
    hall.position.y = fy;
    this.scene.add(hall);
    hall.userData.columns.forEach(([x, z]) => addCircleCollider(x, z, 0.38));
    // 벽 충돌 (정면은 기둥만)
    addBoxCollider(h.x0 - 0.15, h.z0 - 0.15, h.x1 + 0.15, h.z0 + 0.12);
    addBoxCollider(h.x0 - 0.15, h.z0, h.x0 + 0.12, h.z1);
    addBoxCollider(h.x1 - 0.12, h.z0, h.x1 + 0.15, h.z1);

    // 들어 올린 분합문 (정면 처마 밑)
    const lat = latticeTextures();
    const doorMat = nightGlow(new THREE.MeshStandardMaterial({ map: lat.color, emissiveMap: lat.emissive, emissive: 0xffc98a, emissiveIntensity: 1.2, roughness: 0.9, side: THREE.DoubleSide }), 0.8);
    h.xs.slice(1).map((b, i) => [(h.xs[i] + b) / 2, b - h.xs[i] - 0.6]).forEach(([x, w]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), doorMat);
      p.position.set(x, fy + colH - 0.62, h.z1 - 0.5);
      p.rotation.x = Math.PI / 2 - 0.08;
      this.scene.add(p);
    });

    // 우물천장
    const ct = ceilingTexture();
    ct.repeat.set(Math.round((h.x1 - h.x0) / 0.8), Math.round((h.z1 - h.z0) / 0.8)); // 우물 한 칸 ≈ 0.8m
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(h.x1 - h.x0, h.z1 - h.z0), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, fy + colH - 0.02, (h.z0 + h.z1) / 2);
    ceil.userData.occluder = 'ceiling'; // 카메라가 천장 위(다락)로 올라가지 않게
    this.scene.add(ceil);
    // 내부 고주: 둘째 줄(불단 앞) 가운데 세 칸 양끝 — 좌복 줄 뒤, 불단 옆
    const inner = new THREE.InstancedMesh(columnGeometry(0.28, colH), m.column, 2);
    const o = new THREE.Object3D();
    [[h.xs[1], h.zs[1]], [h.xs[4], h.zs[1]]].forEach(([x, z], i) => {
      o.position.set(x, fy, z);
      o.updateMatrix();
      inner.setMatrixAt(i, o.matrix);
      addCircleCollider(x, z, 0.35);
    });
    this.scene.add(inner);

    // 수미단
    const altarZ = L.altar.z;
    const tier = (w, hh, d, y, z, mat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
      b.position.set(0, y + hh / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
      return y + hh;
    };
    let ay = tier(12.4, 0.3, 2.5, fy, altarZ - 0.9, m.woodDark);
    // 가운데 단: 앞·옆에 모란·연꽃 판넬 (수미단)
    const panel = sumidanTexture().clone();
    panel.needsUpdate = true;
    panel.repeat.set(10, 1);
    const panelSide = sumidanTexture().clone();
    panelSide.needsUpdate = true;
    panelSide.repeat.set(2, 1);
    const pm = new THREE.MeshStandardMaterial({ map: panel, roughness: 0.55 });
    const pms = new THREE.MeshStandardMaterial({ map: panelSide, roughness: 0.55 });
    {
      const b = new THREE.Mesh(new THREE.BoxGeometry(12, 0.75, 2.2), [pms, pms, m.red, m.red, pm, m.red]);
      b.position.set(0, ay + 0.375, altarZ - 0.95);
      b.castShadow = b.receiveShadow = true;
      this.scene.add(b);
      ay += 0.75;
    }
    const trim = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.08, 2.3), m.gold);
    trim.position.set(0, ay - 0.06, altarZ - 0.95);
    this.scene.add(trim);
    ay = tier(12.3, 0.14, 2.4, ay, altarZ - 0.95, m.woodDark);
    addBoxCollider(-6.3, altarZ - 2.2, 6.3, altarZ + 0.4);

    // 삼존: 본존 석가모니불(항마촉지인)과 합장한 협시보살 (world/buddha.js 에서 조각)
    const buddha = buildBuddhaStatue('buddha', { quality: this.quality });
    buddha.scale.setScalar(0.95);
    buddha.userData.realSlot = 'buddha'; // 실사 세계(world/real)가 생성형 불상 사진으로 바꿔 끼우는 자리
    buddha.position.set(0, ay, altarZ - 1.0);
    this.scene.add(buddha);
    for (const sx of [-1, 1]) {
      const bod = buildBuddhaStatue('bodhisattva', { quality: this.quality });
      bod.scale.setScalar(0.78);
      bod.userData.realSlot = sx < 0 ? 'bodhiL' : 'bodhiR';
      bod.position.set(sx * 3.6, ay, altarZ - 0.9);
      this.scene.add(bod);
    }
    // 후불벽: 짙은 붉은 옻칠 판 위에 세 폭 탱화 (가운데 영산회상도, 양옆 보살회상도), 금테 액자
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a1610, roughness: 0.55, metalness: 0.05 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(h.x1 - h.x0 - 0.3, colH - 0.05), wallMat);
    back.position.set(0, fy + colH / 2, h.z0 + 0.1);
    this.scene.add(back);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a120c, roughness: 0.5 });
    const trimMat = m.gold;
    const bar = (cx, cy, bw, bh, mat, z, d) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), mat);
      b.position.set(cx, cy, z);
      this.scene.add(b);
    };
    const hang = (x, w, hgt, y, tex) => {
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }));
      pic.position.set(x, y, h.z0 + 0.14);
      this.scene.add(pic);
      // 짙은 나무 테 + 안쪽 금테
      for (const [t, mat, z, d] of [[0.09, frameMat, h.z0 + 0.15, 0.06], [0.022, trimMat, h.z0 + 0.175, 0.02]]) {
        bar(x, y + hgt / 2 + t / 2, w + 2 * t, t, mat, z, d);
        bar(x, y - hgt / 2 - t / 2, w + 2 * t, t, mat, z, d);
        bar(x - w / 2 - t / 2, y, t, hgt, mat, z, d);
        bar(x + w / 2 + t / 2, y, t, hgt, mat, z, d);
      }
    };
    const ty0 = fy + colH - 1.65; // 탱화 중심: 벽 위끝에서 1.65m 아래 (높아진 천장만큼 같이 올린다)
    hang(0, 3.7, 3.08, ty0, taenghwaTexture('center'));
    for (const sx of [-1, 1]) hang(sx * 3.65, 2.55, 2.75, ty0, taenghwaTexture('side'));

    // 닫집: 본존 위에 매단 작은 궁전 — 공포 세 층, 낙양 투각 띠, 금 테
    {
      const cy0 = fy + colH - 0.02; // 천장 밑면
      const cz = altarZ - 0.6, cw = 3.3, cd = 1.0;
      const dc = canopyTexture();
      const dcMat = new THREE.MeshStandardMaterial({ map: dc, roughness: 0.6 });
      const dcSide = dc.clone();
      dcSide.needsUpdate = true;
      dcSide.repeat.set(0.35, 1);
      const dcSideMat = new THREE.MeshStandardMaterial({ map: dcSide, roughness: 0.6 });
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f6e55, roughness: 0.6 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.3, 0.08, cd + 0.3), greenMat);
      top.position.set(0, cy0 - 0.04, cz);
      this.scene.add(top);
      let y = cy0 - 0.08;
      for (let k = 0; k < 2; k++) {
        const hh = 0.17, w = cw - k * 0.22, d = cd - k * 0.12;
        const band = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), [dcSideMat, dcSideMat, greenMat, greenMat, dcMat, dcSideMat]);
        band.position.set(0, y - hh / 2, cz);
        this.scene.add(band);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.025, d + 0.04), m.gold);
        rim.position.set(0, y - hh, cz);
        this.scene.add(rim);
        y -= hh + 0.02;
      }
      const vMat = new THREE.MeshStandardMaterial({ map: valanceTexture(), alphaTest: 0.5, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
      const vh = 0.22;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.3, vh), vMat);
      front.position.set(0, y - vh / 2, cz + 0.42);
      this.scene.add(front);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.3, vh), vMat);
        side.position.set(sx * ((cw - 0.3) / 2 + 0.005), y - vh / 2, cz);
        side.rotation.y = Math.PI / 2;
        this.scene.add(side);
      }
    }

    // 불단 앞 탁자: 향로 · 촛대 · 공양
    const tz = altarZ + 0.75;
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.62, 0.8), m.red);
    table.position.set(0, fy + 0.31, tz);
    table.castShadow = true;
    this.scene.add(table);
    addBoxCollider(-1.65, tz - 0.45, 1.65, tz + 0.45);
    const ty = fy + 0.62;
    const burner = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.22, 16), m.bronze);
    bowl.position.y = 0.17;
    burner.add(bowl);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.1, 5), m.bronze);
      leg.position.set(Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15);
      burner.add(leg);
    }
    burner.position.set(0, ty, tz);
    this.scene.add(burner);
    this.incense = { group: burner, sticks: [], top: new THREE.Vector3(0, ty + 0.28, tz), boost: 0 };
    const smoke = makeEmitter({ count: 34, spread: 0.02, rise: 2.4, life: 7, size: 0.18, grow: 4, color: '#d9d4cc', opacity: 0.4, texture: 'smoke', drift: 0.14, seed: 8 });
    smoke.position.set(0, ty + 0.38, tz);
    this.scene.add(smoke);
    this.incense.smoke = smoke;
    this.emitters.push(smoke);
    this._addIncenseStick();
    // 쌍촛대
    const candleFlames = [];
    for (const sx of [-1, 1]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.62, 10), m.gold);
      stand.position.set(sx * 1.15, ty + 0.31, tz);
      this.scene.add(stand);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.6, emissive: 0x553311, emissiveIntensity: 0.3 }));
      candle.position.set(sx * 1.15, ty + 0.77, tz);
      this.scene.add(candle);
      const flame = makeEmitter({ count: 5, spread: 0.004, rise: 0.06, life: 0.35, size: 0.12, grow: -0.3, color: '#ffd38a', opacity: 1, texture: 'flame', additive: true, drift: 0.0, seed: 10 + sx });
      flame.position.set(sx * 1.15, ty + 0.95, tz);
      this.scene.add(flame);
      candleFlames.push(flame);
      this.emitters.push(flame);
    }
    this.lightAnchors.candleL = new THREE.Vector3(-1.15, ty + 1.05, tz + 0.1);
    this.lightAnchors.candleR = new THREE.Vector3(1.15, ty + 1.05, tz + 0.1);
    this.lightAnchors.buddha = new THREE.Vector3(-2.6, fy + colH - 0.7, altarZ + 2.6); // 앞 왼쪽 위에서 비스듬히: 얼굴·가사 주름에 음영이 진다
    // 헌촉 — 작은 등촉 줄 (켤 때마다 하나씩)
    this.votives = [];
    const votiveGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8);
    for (let i = 0; i < 14; i++) {
      const x = -3.1 + (i % 7) * 1.03 + (i >= 7 ? 0.5 : 0);
      const z = altarZ - 0.05 + (i >= 7 ? -0.3 : 0);
      const vm = new THREE.Mesh(votiveGeo, new THREE.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0xffa040, emissiveIntensity: 0 }));
      vm.position.set(x, ay + 0.06, z);
      this.scene.add(vm);
      this.votives.push(vm);
    }
    // 공양물
    const fruitCol = [0xd9542a, 0xe8a33a, 0xc9b23a];
    for (const sx of [-0.6, 0.6]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.06, 14), m.gold);
      plate.position.set(sx, ty + 0.03, tz - 0.18);
      this.scene.add(plate);
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshStandardMaterial({ color: fruitCol[k % 3], roughness: 0.5 }));
        f.position.set(sx + (k % 2 ? 0.06 : -0.06), ty + 0.11 + (k > 1 ? 0.09 : 0), tz - 0.18 + (k % 2 ? 0.03 : -0.03));
        this.scene.add(f);
      }
    }
    this.addInteractable({
      id: 'incense',
      label: '향과 초 올리기 (헌향·헌촉)',
      zone: 'DAEUNGJEON',
      pos: new THREE.Vector3(0, fy, tz),
      radius: 2.6,
      approach: { x: 0, z: tz + 1.35, ry: Math.PI }
    });

    // 좌복 65개 (5줄 × 13, 1.5m 간격 — 예전 32석의 두 배). 가운데 줄(x 0)이 본존 정면
    this.cushions = [];
    const cg = new RoundedBoxGeometry(0.82, 0.13, 0.82, 2, 0.05);
    const cm = new THREE.MeshStandardMaterial({ roughness: 0.95, color: 0xffffff });
    const CUSHION = { cols: 13, rows: 5, step: 1.5 };
    const ci = new THREE.InstancedMesh(cg, cm, CUSHION.cols * CUSHION.rows);
    const tones = [new THREE.Color('#8f8a80'), new THREE.Color('#a8865a')];
    let k = 0;
    for (let r = 0; r < CUSHION.rows; r++) {
      const z = h.z1 - 1.3 - r * CUSHION.step;
      for (let i = 0; i < CUSHION.cols; i++) {
        const x = (i - (CUSHION.cols - 1) / 2) * CUSHION.step;
        o.position.set(x, fy + 0.065, z);
        o.rotation.set(0, 0, 0);
        o.updateMatrix();
        ci.setMatrixAt(k, o.matrix);
        ci.setColorAt(k, tones[(i + r) % 2]);
        this.cushions.push({ index: k, x, z, y: fy + 0.13, occupant: null });
        k++;
      }
    }
    ci.receiveShadow = true;
    this.scene.add(ci);
    this.cushionMesh = ci;
    this.addInteractable({
      id: 'practice_108',
      label: '좌복에 앉기 · 108배 · 염주',
      zone: 'DAEUNGJEON',
      pos: new THREE.Vector3(0, fy, h.z1 - 1.3 - 2 * CUSHION.step),
      radius: 0,
      cushion: true
    });

    // 사경 서안 (오른쪽 벽가)
    const desk = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.1), m.wood);
    top.position.y = 0.32;
    desk.add(top);
    for (const dz of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), m.wood);
      leg.position.set(0, 0.15, dz);
      desk.add(leg);
    }
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.62), new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 1 }));
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(-0.02, 0.348, 0.05);
    desk.add(paper);
    const ink = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.18), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }));
    ink.position.set(0.1, 0.36, -0.4);
    desk.add(ink);
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.24, 6), m.woodLight);
    brush.rotation.x = Math.PI / 2;
    brush.position.set(0.18, 0.36, 0.08);
    desk.add(brush);
    const dcush = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x7d6a54, roughness: 0.95 }));
    dcush.position.set(-0.75, 0.065, 0);
    desk.add(dcush);
    // 동쪽 끝 칸, 좌복 줄 뒤 (내부 고주와 동쪽 벽 사이)
    const dx = h.x1 - 0.8, dz = h.zs[1] - 0.6;
    desk.position.set(dx, fy, dz);
    this.scene.add(desk);
    addBoxCollider(dx - 0.3, dz - 0.6, dx + 0.3, dz + 0.6);
    this.sutraSeat = { x: dx - 0.75, z: dz, y: fy + 0.13, ry: Math.PI / 2 };
    this.addInteractable({
      id: 'sutra_copy',
      label: '사경 서안에 앉기',
      zone: 'DAEUNGJEON',
      pos: new THREE.Vector3(dx - 0.2, fy, dz),
      radius: 2.0,
      approach: { x: dx - 0.75, z: dz + 1.1, ry: Math.PI / 2 }
    });
  }

  _addIncenseStick() {
    const inc = this.incense;
    if (inc.sticks.length >= 9) {
      const old = inc.sticks.shift();
      inc.group.remove(old);
    }
    const st = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 4), new THREE.MeshStandardMaterial({ color: 0x8a5a3a }));
    stick.position.y = 0.17;
    st.add(stick);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    tip.position.y = 0.34;
    st.add(tip);
    const n = inc.sticks.length;
    st.position.set((n % 3 - 1) * 0.07, 0.24, (Math.floor(n / 3) - 1) * 0.06);
    st.rotation.set((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15);
    inc.group.add(st);
    inc.sticks.push(st);
  }

  offerIncense() {
    this._addIncenseStick();
    this.incense.boost = 1;
    const lit = this.votives.find((v) => v.material.emissiveIntensity === 0);
    if (lit) {
      lit.material.emissiveIntensity = 2.4;
      const fl = makeEmitter({ count: 3, spread: 0.002, rise: 0.04, life: 0.3, size: 0.07, grow: -0.3, color: '#ffd38a', opacity: 1, texture: 'flame', additive: true, drift: 0, seed: 40 + this.votives.indexOf(lit) });
      fl.position.copy(lit.position).add(new THREE.Vector3(0, 0.11, 0));
      this.scene.add(fl);
      this.emitters.push(fl);
    }
  }

  /* ───────── Zone 4: 후원 다실 · 연못 ───────── */
  _teahouse() {
    const m = this.m;
    const t = L.teahouse;
    const ty = L.teahouseTerrace.y;
    const base = new THREE.Mesh(new THREE.BoxGeometry(t.halfW * 2 + 0.8, 0.5, t.halfD * 2 + 0.8), m.granite);
    base.position.set(t.x, ty + 0.25, t.z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    const house = buildHanok({
      xs: [-t.halfD, -1.5, 1.5, t.halfD],
      zs: [-t.halfW, t.halfW],
      colH: 2.8,
      colR: 0.17,
      front: ['doors', 'open', 'doors'],
      back: 'wall',
      sides: 'wall',
      brackets: 0,
      roof: { type: 'paljak', overhang: 1.5, height: 2.3, lift: 0.5, gableFrac: 0.45, segs: 40 },
      plaque: { text: '尋劍堂', width: 1.5 }
    });
    house.rotation.y = -Math.PI / 2;
    house.position.set(t.x, ty + 0.5, t.z);
    this.scene.add(house);
    // 방 안 바닥과 등잔빛
    const roomFloor = new THREE.Mesh(new THREE.BoxGeometry(t.halfW * 2, 0.04, t.halfD * 2), m.floor);
    roomFloor.position.set(t.x, ty + 0.52, t.z);
    this.scene.add(roomFloor);
    // 툇마루
    const vx0 = t.x - t.halfW - 1.2, vx1 = t.x - t.halfW + 0.05;
    const ver = new THREE.Mesh(new THREE.BoxGeometry(vx1 - vx0, 0.1, t.halfD * 2 + 0.4), m.woodLight);
    ver.position.set((vx0 + vx1) / 2, ty + 0.47, t.z);
    ver.castShadow = true;
    ver.receiveShadow = true;
    this.scene.add(ver);
    for (const z of [t.z - t.halfD, t.z - 1.5, t.z + 1.5, t.z + t.halfD]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), m.woodDark);
      post.position.set(vx0 + 0.12, ty + 0.21, z);
      this.scene.add(post);
    }
    addBoxCollider(vx0 - 0.05, t.z - t.halfD - 0.6, t.x + t.halfW + 0.6, t.z + t.halfD + 0.6);

    // 찻상과 다구
    const tableX = (vx0 + vx1) / 2 + 0.05;
    const tbl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.8), m.wood);
    tbl.position.set(tableX, ty + 0.52 + 0.2, t.z);
    tbl.castShadow = true;
    this.scene.add(tbl);
    for (const dz of [-0.33, 0.33]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.04), m.wood);
      leg.position.set(tableX, ty + 0.52 + 0.09, t.z + dz);
      this.scene.add(leg);
    }
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.25, metalness: 0 });
    const cupGeo = new THREE.CylinderGeometry(0.045, 0.032, 0.06, 14, 1, true);
    for (const dz of [-0.2, 0.2]) {
      const cup = new THREE.Mesh(cupGeo, porcelain);
      cup.material.side = THREE.DoubleSide;
      cup.position.set(tableX - 0.12, ty + 0.78, t.z + dz);
      this.scene.add(cup);
    }
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), porcelain);
    pot.scale.set(1, 0.85, 1);
    pot.position.set(tableX + 0.08, ty + 0.83, t.z);
    this.scene.add(pot);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.1, 6), porcelain);
    spout.position.set(tableX - 0.0, ty + 0.85, t.z);
    spout.rotation.z = 1.0;
    this.scene.add(spout);
    // 무쇠 주전자 + 작은 화로
    const stove = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.2, 12), m.bronzeGreen);
    stove.position.set(vx0 + 0.3, ty + 0.62, t.z + 0.75);
    this.scene.add(stove);
    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ color: 0x252322, roughness: 0.55, metalness: 0.6 }));
    kettle.scale.set(1, 0.8, 1);
    kettle.position.set(vx0 + 0.3, ty + 0.82, t.z + 0.75);
    this.scene.add(kettle);
    const steam = makeEmitter({ count: 16, spread: 0.01, rise: 0.9, life: 2.6, size: 0.12, grow: 3, color: '#f4f1ea', opacity: 0.35, texture: 'smoke', drift: 0.12, seed: 21 });
    steam.position.set(vx0 + 0.3, ty + 0.95, t.z + 0.75);
    this.scene.add(steam);
    this.emitters.push(steam);
    this.teaSteam = makeEmitter({ count: 8, spread: 0.005, rise: 0.4, life: 2, size: 0.05, grow: 3, color: '#f4f1ea', opacity: 0.3, texture: 'smoke', drift: 0.05, seed: 22 });
    this.teaSteam.position.set(tableX - 0.12, ty + 0.82, t.z - 0.2);
    this.teaSteam.userData.uniforms.uIntensity.value = 0.3;
    this.scene.add(this.teaSteam);
    this.emitters.push(this.teaSteam);
    // 방석
    const cg = new RoundedBoxGeometry(0.6, 0.1, 0.6, 3, 0.04);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x6f5a8a, roughness: 0.95 });
    const s1 = new THREE.Mesh(cg, seatMat);
    s1.position.set(L.teaSeat.x, ty + 0.55, t.z);
    const s2 = new THREE.Mesh(cg, seatMat);
    s2.position.set(t.x - t.halfW + 0.45, ty + 0.57, t.z);
    this.scene.add(s1, s2);
    L.teaSeat.y = ty + 0.6;
    this.monkSeat = { x: t.x - t.halfW + 0.45, z: t.z, y: ty + 0.62, ry: -Math.PI / 2 };
    this.lightAnchors.teahouse = new THREE.Vector3(t.x - 0.4, ty + 2.0, t.z);
    this.addInteractable({
      id: 'tea_chat',
      label: '찻상 앞에 앉기 (선사 차담)',
      zone: 'TEAHOUSE',
      pos: new THREE.Vector3(tableX, ty, t.z),
      radius: 2.8,
      approach: { x: vx0 - 0.55, z: t.z, ry: Math.PI / 2 }
    });

    // 죽비 걸이
    const stand = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), m.woodDark);
    post.position.y = 0.6;
    stand.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), m.woodDark);
    arm.position.set(0.2, 1.15, 0);
    stand.add(arm);
    const jukbi = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.02), new THREE.MeshStandardMaterial({ color: 0xb59a5a, roughness: 0.6 }));
    jukbi.position.set(0.36, 0.84, 0);
    stand.add(jukbi);
    const jx = vx0 - 0.4, jz = t.z - t.halfD - 1.0;
    stand.position.set(jx, ty, jz);
    this.scene.add(stand);
    this.addInteractable({
      id: 'dharma_card',
      label: '오늘의 죽비 뽑기',
      zone: 'TEAHOUSE',
      pos: new THREE.Vector3(jx, ty, jz),
      radius: 2.0,
      approach: { x: jx - 0.9, z: jz, ry: Math.PI / 2 }
    });

    // 연못 정자
    const pav = buildHanok({
      xs: [-1, 1],
      zs: [-1, 1],
      colH: 2.4,
      colR: 0.13,
      front: 'open',
      back: 'open',
      sides: 'open',
      brackets: 0,
      roof: { type: 'paljak', overhang: 0.9, height: 1.5, lift: 0.4, segs: 24 }
    });
    const px = L.pond.x + L.pond.rx + 0.55, pz = L.pond.z + 0.6;
    const pbase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 2.5), m.woodLight);
    pbase.position.set(px, ty + 0.18, pz);
    pbase.receiveShadow = true;
    this.scene.add(pbase);
    pav.position.set(px, ty + 0.35, pz);
    this.scene.add(pav);
    addBoxCollider(px - 1.3, pz - 1.3, px + 1.3, pz + 1.3);
    // 연못가 석등
    const pl = buildStoneLantern(0.7);
    const plx = L.pond.x - L.pond.rx - 0.6, plz = L.pond.z - 2.4;
    pl.position.set(plx, terrainHeight(plx, plz), plz);
    this.scene.add(pl);
    addCircleCollider(plx, plz, 0.4);
    this.glowDecals.push({ x: plx, z: plz, y: terrainHeight(plx, plz), r: 2.2, i: 0.5 });
  }

  /** 석등 주변 바닥 빛 (가산, 밤에만) */
  _glowDecalsMesh() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0xffb466, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const inst = new THREE.InstancedMesh(geo, mat, this.glowDecals.length);
    const o = new THREE.Object3D();
    this.glowDecals.forEach((d, i) => {
      o.position.set(d.x, d.y + 0.05, d.z);
      o.scale.set(d.r * 2, 1, d.r * 2);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    });
    this.scene.add(inst);
    this.decalMesh = inst;
  }

  strikeBell(onImpact) {
    this.bellAnim = { t: 0, impacted: false, onImpact };
  }

  flareBrazier() {
    this.brazier.flare = 1;
  }

  update(dt, t, night) {
    // 범종: 당목이 뒤로 물러났다가 친다
    const ram = this.bell.userData.ram;
    const pivot = this.bell.userData.bellPivot;
    const ba = this.bellAnim;
    if (ba.t >= 0) {
      ba.t += dt;
      const pull = ba.t < 0.9 ? Math.sin((ba.t / 0.9) * Math.PI * 0.5) * 0.55 : 0;
      const swing = ba.t >= 0.9 ? Math.max(0, 0.55 - (ba.t - 0.9) * 4.5) : 0;
      ram.rotation.z = -(pull || swing) * (ba.t < 0.9 ? 1 : 1);
      if (ba.t >= 1.02 && !ba.impacted) {
        ba.impacted = true;
        ba.onImpact?.();
      }
      const sway = ba.impacted ? Math.sin((ba.t - 1.02) * 5) * 0.02 * Math.exp(-(ba.t - 1.02) * 0.6) : 0;
      pivot.rotation.z = sway;
      if (ba.t > 7) ba.t = -1;
    } else {
      ram.rotation.z = Math.sin(t * 0.6) * 0.01;
    }

    // 화로
    const br = this.brazier;
    br.flare = Math.max(0, br.flare - dt * 0.35);
    const fi = br.base + br.flare * 1.6;
    br.fire.userData.uniforms.uIntensity.value = fi;
    br.embers.userData.uniforms.uIntensity.value = 0.5 + br.flare * 1.5;
    br.smoke.userData.uniforms.uIntensity.value = 0.6 + br.flare;
    this.brazierLight = 1 + br.flare * 4;

    // 향 연기
    const inc = this.incense;
    inc.boost = Math.max(0, inc.boost - dt * 0.08);
    inc.smoke.userData.uniforms.uIntensity.value = 0.55 + inc.boost * 0.9;

    // 석등 바닥 빛
    this.decalMesh.material.opacity = night * 0.3;
    this.decalMesh.visible = night > 0.02;

    this.lanterns.update(dt, t, night);
    this.cairn.update(dt);
  }
}

/* ───────────────────────── 불상 ───────────────────────── */
/* ───────────────────────── 연등 ───────────────────────── */
class LanternSystem {
  constructor(scene) {
    this.scene = scene;
    const R = L.lanternRows;
    this.slots = [];
    const per = Math.floor((R.z0 - R.z1) / 0.95) + 1;
    const sag = 0.55;
    const ySag = (z) => {
      const mid = (R.z0 + R.z1) / 2, half = (R.z0 - R.z1) / 2 + 0.5;
      const u = (z - mid) / half;
      return -sag * (1 - u * u);
    };
    // 두 층: 아래 줄(5.6m) 먼저, 행을 번갈아 채운다
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < per; i++) {
        for (let r = 0; r < R.xs.length; r++) {
          const order = [2, 3, 1, 4, 0, 5][r];
          const x = R.xs[order] + (layer ? (order < 3 ? -0.0 : 0.0) : 0);
          const z = R.z0 - i * 0.95 - (layer ? 0.475 : 0);
          if (z < R.z1 - 0.01) continue;
          const y = L.courtyard.y + R.y + layer * 0.75 + ySag(z);
          this.slots.push(new THREE.Vector3(x, y - 0.32, z));
        }
      }
    }
    // 줄과 장대
    const m = mats();
    const linePts = [];
    for (let layer = 0; layer < 2; layer++) {
      for (const x of R.xs) {
        const n = 24;
        for (let k = 0; k < n; k++) {
          for (const kk of [k, k + 1]) {
            const z = R.z0 + 0.6 - ((R.z0 - R.z1 + 1.2) * kk) / n;
            linePts.push(x, L.courtyard.y + R.y + layer * 0.75 + ySag(z), z);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2018 })));
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, R.y + 1.2, 8);
    poleGeo.translate(0, (R.y + 1.2) / 2, 0);
    const poles = new THREE.InstancedMesh(poleGeo, m.woodDark, R.xs.length * 2);
    const o = new THREE.Object3D();
    let k = 0;
    for (const x of R.xs) {
      for (const z of [R.z0 + 0.6, R.z1 - 0.6]) {
        o.position.set(x, L.courtyard.y, z);
        o.updateMatrix();
        poles.setMatrixAt(k++, o.matrix);
        addCircleCollider(x, z, 0.2);
      }
    }
    poles.castShadow = true;
    this.scene.add(poles);

    // 연꽃등 지오메트리
    const parts = [];
    const core = new THREE.SphereGeometry(0.2, 12, 8);
    core.scale(1, 0.92, 1);
    parts.push(core);
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 10; i++) {
        const p = new THREE.SphereGeometry(0.075, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        p.scale(0.8, 1.6, 0.35);
        p.rotateX(0.5 - ring * 0.35);
        p.translate(0, 0, 0.19 - ring * 0.01);
        p.rotateY((i / 10) * Math.PI * 2 + ring * 0.3);
        p.translate(0, -0.12 + ring * 0.11, 0);
        parts.push(p);
      }
    }
    const tassel = new THREE.CylinderGeometry(0.012, 0.03, 0.26, 5);
    tassel.translate(0, -0.33, 0);
    const cap = new THREE.CylinderGeometry(0.05, 0.08, 0.06, 8);
    cap.translate(0, 0.2, 0);
    const string = new THREE.CylinderGeometry(0.004, 0.004, 0.3, 3);
    string.translate(0, 0.36, 0);
    const withColor = (geo, k) => {
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(k), 3));
      return geo.toNonIndexed ? geo.toNonIndexed() : geo;
    };
    const geo = mergeGeometries([
      ...parts.map((p) => withColor(p, 1)),
      withColor(tassel, 0.35),
      withColor(cap, 0.25),
      withColor(string, 0.1)
    ]);
    this.uGlow = { value: 0.4 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: 0x000000 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = this.uGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * uGlow * smoothstep(0.5, 0.9, vColor.r + vColor.g + vColor.b - 0.6);');
    };
    this.max = this.slots.length;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.list = [];
    this.anim = new Map(); // id → {from, t}
    this.hover = -1;
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  /** 연등 목록 반영 (가장 최근 것이 자리를 넘치면 오래된 것부터 빠진다) */
  sync(list) {
    const real = list.slice(-this.max);
    // 실제 사찰처럼 이름 없는 공양 연등이 빈 줄을 채운다 (클릭해도 열리지 않음)
    const fillTo = Math.min(this.max, Math.max(108, real.length));
    const pastel = ['#f4a3b5', '#f3a24a', '#f3ecdc', '#79a9d9', '#f6c6a0', '#e98a9a'];
    const filler = [];
    const fr = rand(808);
    for (let i = real.length; i < fillTo; i++) filler.push({ id: null, color: pastel[Math.floor(fr() * pastel.length)] });
    // 실제 연등은 아래층 가운데 줄부터, 공양 연등은 그 사이사이
    this.list = [...real, ...filler];
    this.mesh.count = this.list.length;
    this.list.forEach((l, i) => {
      this._c.set(l.color);
      this.mesh.setColorAt(i, this._c);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 새 연등을 손에서 떠올려 자리로 보낸다 */
  launch(id, from) {
    this.anim.set(id, { from: from.clone(), t: 0 });
  }

  slotOf(i) {
    return this.slots[i];
  }

  idAt(instanceId) {
    return this.list[instanceId]?.id;
  }

  update(dt, t, night) {
    this.uGlow.value = 0.35 + night * 1.6;
    const o = this._o;
    for (let i = 0; i < this.list.length; i++) {
      const l = this.list[i];
      const slot = this.slots[i];
      const a = l.id ? this.anim.get(l.id) : null;
      let s = this.hover === i ? 1.25 : 1;
      if (a) {
        a.t += dt / 3.6;
        const e = a.t >= 1 ? 1 : 1 - Math.pow(1 - a.t, 3);
        o.position.lerpVectors(a.from, slot, e);
        o.position.y += Math.sin(e * Math.PI) * 1.2;
        s *= 0.6 + 0.4 * e;
        if (a.t >= 1) this.anim.delete(l.id);
      } else {
        o.position.copy(slot);
      }
      const sw = Math.sin(t * 0.9 + i * 1.7) * 0.05 * (0.4 + envUniforms.uWind.value);
      o.rotation.set(sw, t * 0.05 + i, sw * 0.6);
      o.position.x += sw * 0.15;
      o.scale.setScalar(s);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ───────────────────────── 돌탑 ───────────────────────── */
class Cairn {
  constructor(scene, pos) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);
    this.top = 0;
    this.count = 0;
    this.r = rand(321);
    this.falling = [];
    this.geo = new THREE.IcosahedronGeometry(1, 2);
    const p = this.geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + 0.12 * Math.sin(v.x * 5 + v.z * 3));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    this.geo.computeVertexNormals();
    const gr = graniteTextures();
    this.mat = weatherable(new THREE.MeshStandardMaterial({ map: gr.color, color: 0xa29e94, roughness: 0.9 }), { snow: 1, wet: 1 });
    // 바닥 큰 돌
    for (let i = 0; i < 3; i++) this._place(0.55 - i * 0.05, true);
  }

  _place(size, instant) {
    const st = new THREE.Mesh(this.geo, this.mat);
    const s = size;
    st.scale.set(s, s * 0.42, s * (0.85 + this.r() * 0.3));
    st.rotation.y = this.r() * 6;
    const y = this.top + s * 0.36;
    st.position.set((this.r() - 0.5) * 0.06, instant ? y : y + 1.6, (this.r() - 0.5) * 0.06);
    st.castShadow = true;
    this.group.add(st);
    this.top += s * 0.72;
    this.count++;
    if (!instant) this.falling.push({ st, y, v: 0 });
    return st;
  }

  /** 기록된 돌 수만큼 쌓아 둔다 (너무 높아지지 않게 상한) */
  sync(n) {
    const want = Math.min(n, 16);
    while (this.count - 3 < want) {
      const k = this.count - 3;
      this._place(Math.max(0.12, 0.42 - k * 0.022), true);
    }
  }

  addStone(onLand) {
    const k = this.count - 3;
    if (k >= 16) {
      // 꼭대기는 그대로, 작은 돌만 옆에 얹는다
      const st = new THREE.Mesh(this.geo, this.mat);
      st.scale.set(0.1, 0.05, 0.1);
      const a = this.r() * 6;
      st.position.set(Math.cos(a) * 0.5, 1.6, Math.sin(a) * 0.5);
      this.group.add(st);
      this.falling.push({ st, y: 0.04, v: 0, onLand });
      return;
    }
    this._place(Math.max(0.12, 0.42 - k * 0.022), false);
    this.falling[this.falling.length - 1].onLand = onLand;
  }

  topWorld() {
    return this.group.position.clone().add(new THREE.Vector3(0, this.top, 0));
  }

  update(dt) {
    this.falling = this.falling.filter((f) => {
      f.v += 9.8 * dt;
      f.st.position.y -= f.v * dt;
      if (f.st.position.y <= f.y) {
        f.st.position.y = f.y;
        f.onLand?.();
        return false;
      }
      return true;
    });
  }
}

/* ───────────────────────── 기와 불사대 ───────────────────────── */
class TileRack {
  constructor(scene, pos) {
    const m = mats();
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);
    const len = 6.2;
    // 틀
    for (const z of [-len / 2, 0, len / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), m.woodDark);
      post.position.set(-0.25, 1.0, z);
      post.castShadow = true;
      this.group.add(post);
    }
    const shelfYs = [0.45, 1.05, 1.65];
    shelfYs.forEach((y) => {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, len), m.wood);
      sh.position.set(0, y, 0);
      sh.castShadow = true;
      sh.receiveShadow = true;
      this.group.add(sh);
    });
    const roof = buildRoof({ halfW: len / 2 + 0.4, halfD: 0.7, height: 0.45, type: 'gable', lift: 0.1, segs: 20, thickness: 0.1 });
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-0.1, 2.05, 0);
    this.group.add(roof);
    // 기와 형상 (살짝 휜 판)
    const tg = new THREE.CylinderGeometry(0.9, 0.9, 0.42, 12, 1, true, -0.28, 0.56);
    tg.rotateZ(Math.PI / 2);
    tg.rotateY(Math.PI / 2);
    tg.translate(0, 0, -0.9);
    this.tileGeo = new THREE.PlaneGeometry(0.34, 0.5);
    this.shelfYs = shelfYs;
    this.len = len;
    this.plain = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.6 });
    // 빈 자리 채움 기와
    const fill = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.5, 0.34), this.plain, 45);
    const o = new THREE.Object3D();
    let k = 0;
    shelfYs.forEach((y) => {
      for (let i = 0; i < 15; i++) {
        o.position.set(-0.12, y + 0.28, -len / 2 + 0.3 + i * 0.4);
        o.rotation.set(0, 0, -0.2);
        o.updateMatrix();
        fill.setMatrixAt(k++, o.matrix);
      }
    });
    this.group.add(fill);
    this.wishMeshes = [];
    this.group.rotation.y = 0; // 정면 +x
  }

  /** 최근 기와 15장을 앞줄에 붓글씨로 보여 준다 */
  sync(tiles) {
    this.wishMeshes.forEach((mm) => {
      this.group.remove(mm);
      mm.material.map?.dispose();
      mm.material.dispose();
    });
    this.wishMeshes = [];
    const recent = tiles.slice(-15).reverse();
    recent.forEach((t, i) => {
      const tex = tileWishTexture(t.wish, t.author);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, color: t.mine ? 0xfff1d0 : 0xffffff });
      const mm = new THREE.Mesh(this.tileGeo, mat);
      const row = Math.floor(i / 5), col = i % 5;
      mm.position.set(0.1, this.shelfYs[2 - row] + 0.3, -this.len / 2 + 0.75 + col * 1.2);
      mm.rotation.set(0, Math.PI / 2, 0);
      mm.rotateX(-0.2);
      this.group.add(mm);
      this.wishMeshes.push(mm);
    });
  }
}
