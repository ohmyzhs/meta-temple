/**
 * 한국 전통 목조건축 절차적 빌더.
 *  - buildRoof: 앙곡(처마 끝 들림)·안허리곡·오목한 지붕면을 가진 맞배/우진각/팔작 지붕
 *  - buildHanok: 기둥(배흘림)·창방·평방·공포·창호·벽·지붕을 갖춘 전각
 *  - 석탑, 석등, 일주문, 범종각, 돌담
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mats } from './materials.js';
import { latticeTextures, plaqueImageTexture, plaqueTexture, plasterTexture } from './textures.js';
import { nightGlow } from './materials.js';

const V3 = THREE.Vector3;

/* ───────────────────────── 지붕 ───────────────────────── */

/**
 * 지붕 곡면. 원점 = 처마선 높이의 중심, 용마루는 +y 로 height.
 * opts: halfW(x, 처마 끝까지), halfD(z), height, type 'hip'|'gable'|'paljak',
 *       lift(추녀 들림), flare(안허리 바깥 휨), gableFrac(팔작 합각 비율), segs
 */
export function buildRoof(opts) {
  const {
    halfW,
    halfD,
    height,
    type = 'paljak',
    lift = 0.6,
    flare = 0.05,
    gableFrac = 0.42,
    segs = 40,
    thickness = 0.28,
    material,
    underMaterial,
    edgeMaterial,
    ridgeMaterial,
    tile = 0.55,
    ridges = true,
    shadows = true
  } = opts;
  const m = mats();
  const topMat = material || m.roofTop;
  const underMat = underMaterial || m.roofUnder;
  const edgeMat = edgeMaterial || m.roofEdge;
  const ridgeMat = ridgeMaterial || m.ridge;

  const Lr = type === 'gable' ? halfW : Math.max(halfW - halfD, 0);
  const span = type === 'gable' ? halfD : halfD;
  const xg = Lr + halfD * gableFrac; // 팔작 합각 위치

  const profile = (s) => height * ((1 - s) * 0.32 + 0.68 * (1 - s) * (1 - s));
  const thick = (s) => thickness * (0.55 + 0.9 * (1 - s));

  // s: 용마루(0) → 처마(1)
  function sAt(ax, az, side) {
    const nz = az / halfD;
    if (type === 'gable') return { s: nz, face: 0 };
    const nx = Lr < halfW ? Math.max((ax - Lr) / span, 0) : 0;
    if (type === 'paljak') {
      if (side === 'inner' || nx <= gableFrac) {
        if (ax <= xg && side !== 'outer') return { s: nz, face: 0 };
      }
    }
    return nx > nz ? { s: nx, face: 1 } : { s: nz, face: 0 };
  }

  function cornerLift(ax, az) {
    const dx = halfW - ax, dz = halfD - az;
    const d = Math.hypot(dx, dz) / Math.max(halfD, 0.5);
    return Math.exp(-d * d * 2.4);
  }

  function point(x, z, side) {
    const ax = Math.abs(x), az = Math.abs(z);
    const { s, face } = sAt(ax, az, side);
    const c = cornerLift(ax, az);
    const edgeT = type === 'gable' ? Math.pow(az / halfD, 3) * 0.25 : 0;
    const y = profile(s) + lift * c * s * s + lift * edgeT;
    const push = 1 + flare * c * s;
    return { x: x * push, y, z: z * push, s, face };
  }

  // 격자: 팔작은 ±xg 에 이중 열(합각 단차)
  const xs = [];
  for (let i = 0; i <= segs; i++) xs.push({ x: -halfW + (2 * halfW * i) / segs, side: null });
  if (type === 'paljak') {
    for (const sgn of [-1, 1]) {
      xs.push({ x: sgn * xg, side: 'inner' });
      xs.push({ x: sgn * (xg + 1e-3), side: 'outer' });
    }
  }
  // ±(xg+1e-3) 의 outer 열이 ±xg 의 inner 열 바깥에 온다 → 그 사이 사각형이 합각 단차
  xs.sort((a, b) => a.x - b.x);
  const zSegs = Math.max(8, Math.round((segs * halfD) / halfW));
  const zs = [];
  for (let j = 0; j <= zSegs; j++) zs.push(-halfD + (2 * halfD * j) / zSegs);

  const nX = xs.length, nZ = zs.length;
  const top = [], bot = [], uvT = [], uvB = [];
  for (let j = 0; j < nZ; j++) {
    for (let i = 0; i < nX; i++) {
      const xv = xs[i];
      const side = xv.side || (type === 'paljak' && Math.abs(xv.x) > xg ? 'outer' : null);
      const p = point(xv.x, zs[j], side);
      top.push(p.x, p.y, p.z);
      bot.push(p.x, p.y - thick(p.s), p.z);
      const slopeLen = p.s * halfD * 1.15;
      if (p.face === 0) uvT.push(p.x / tile, slopeLen / tile);
      else uvT.push(p.z / tile, slopeLen / tile);
      uvB.push((p.face === 0 ? p.x : p.z) / 1.2, p.s);
    }
  }
  const idx = [], idxB = [];
  for (let j = 0; j < nZ - 1; j++) {
    for (let i = 0; i < nX - 1; i++) {
      const a = j * nX + i, b = a + 1, c = a + nX, d = c + 1;
      idx.push(a, c, b, b, c, d);
      idxB.push(a, b, c, b, d, c);
    }
  }
  const mk = (pos, uv, ind) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ind);
    g.computeVertexNormals();
    return g;
  };
  const group = new THREE.Group();
  const topMesh = new THREE.Mesh(mk(top, uvT, idx), topMat);
  const botMesh = new THREE.Mesh(mk(bot, uvB, idxB), underMat);
  topMesh.castShadow = shadows;
  topMesh.receiveShadow = true;
  botMesh.receiveShadow = true;
  group.add(topMesh, botMesh);

  // 처마 테두리 띠
  const ring = [];
  for (let i = 0; i < nX; i++) ring.push(i);
  for (let j = 1; j < nZ; j++) ring.push(j * nX + nX - 1);
  for (let i = nX - 2; i >= 0; i--) ring.push((nZ - 1) * nX + i);
  for (let j = nZ - 2; j > 0; j--) ring.push(j * nX);
  const ePos = [], eIdx = [];
  ring.forEach((vi, k) => {
    ePos.push(top[vi * 3], top[vi * 3 + 1], top[vi * 3 + 2]);
    ePos.push(bot[vi * 3], bot[vi * 3 + 1], bot[vi * 3 + 2]);
    const n = ring.length;
    const a = k * 2, b = ((k + 1) % n) * 2;
    eIdx.push(a, a + 1, b, b, a + 1, b + 1);
  });
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
  eg.setIndex(eIdx);
  eg.computeVertexNormals();
  const edge = new THREE.Mesh(eg, edgeMat);
  group.add(edge);

  if (ridges) {
    const ridgeR = Math.max(0.06, height * 0.045);
    const tubes = [];
    const addTube = (pts, r) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      tubes.push(new THREE.TubeGeometry(curve, Math.max(6, pts.length * 3), r, 6, false));
    };
    // 용마루 (끝이 살짝 들림)
    const rx = type === 'paljak' ? xg : Lr;
    if (rx > 0.05) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const x = -rx + (2 * rx * k) / 10;
        const t = Math.abs(x) / rx;
        pts.push(new V3(x, height + ridgeR * 0.6 + 0.18 * height * 0.08 * Math.pow(t, 4) * 6, 0));
      }
      addTube(pts, ridgeR * 1.25);
      // 취두/치미
      for (const sg of [-1, 1]) {
        const cone = new THREE.ConeGeometry(ridgeR * 1.6, ridgeR * 5, 6);
        cone.rotateZ(sg * 0.5);
        cone.translate(sg * (rx + ridgeR * 0.5), height + ridgeR * 3.2, 0);
        tubes.push(cone);
      }
    }
    // 추녀마루 (합각/용마루 끝 → 처마 모서리)
    if (type !== 'gable') {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const pts = [];
          const t0 = type === 'paljak' ? gableFrac : 0;
          for (let k = 0; k <= 10; k++) {
            const t = t0 + ((1 - t0) * k) / 10;
            const ax = Lr + span * t, az = halfD * t;
            const p = point(sx * ax, sz * az, 'outer');
            pts.push(new V3(p.x, p.y + ridgeR * 0.7, p.z));
          }
          addTube(pts, ridgeR);
        }
      }
    }
    // 내림마루 (팔작 합각 가장자리, 맞배 박공)
    if (type === 'paljak' || type === 'gable') {
      const ex = type === 'paljak' ? xg : halfW;
      const zEnd = type === 'paljak' ? halfD * gableFrac : halfD;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const pts = [];
          for (let k = 0; k <= 8; k++) {
            const z = (sz * zEnd * k) / 8;
            const p = point(sx * ex, z, 'inner');
            pts.push(new V3(p.x, p.y + ridgeR * 0.6, p.z));
          }
          addTube(pts, ridgeR * 0.9);
        }
      }
    }
    const rg = mergeGeometries(tubes);
    const rm = new THREE.Mesh(rg, ridgeMat);
    rm.castShadow = shadows;
    group.add(rm);
  }

  // 합각벽 / 박공 (삼각 판)
  if (type === 'paljak' || type === 'gable') {
    const ex = type === 'paljak' ? xg + 0.01 : halfW * 0.985;
    const zEnd = type === 'paljak' ? halfD * gableFrac : halfD * 0.98;
    const baseY = type === 'paljak' ? point(ex + 0.01, 0, 'outer').y - 0.02 : 0;
    const shape = new THREE.Shape();
    shape.moveTo(-zEnd, baseY);
    for (let k = 0; k <= 12; k++) {
      const z = -zEnd + (2 * zEnd * k) / 12;
      const p = point(ex - 0.01, z, 'inner');
      shape.lineTo(z, p.y - (type === 'gable' ? thick(p.s) : 0.02));
    }
    shape.lineTo(zEnd, baseY);
    const sg = new THREE.ShapeGeometry(shape);
    const gm = m.woodDark;
    for (const sx of [-1, 1]) {
      const mesh = new THREE.Mesh(sg, gm);
      mesh.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      mesh.position.x = sx * ex;
      mesh.material.side = THREE.DoubleSide;
      group.add(mesh);
    }
  }

  group.userData.profileAt = (s) => profile(s);
  group.userData.thickAt = (s) => thick(s);
  group.userData.point = point;
  // 카메라 가림체 (templeScene 이 합치기 전에 모아 광선 검사·디더 투명에 쓴다)
  group.traverse((o) => o.isMesh && (o.userData.occluder = 'roof'));
  return group;
}

/* ───────────────────────── 기둥·공포 ───────────────────────── */

export function columnGeometry(r = 0.24, h = 4) {
  // 배흘림: 아래 1/3 지점이 가장 굵다
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const bulge = 1 + 0.09 * Math.sin(Math.min(t / 0.36, 1) * Math.PI * 0.5) - 0.13 * Math.max(0, t - 0.36);
    pts.push(new THREE.Vector2(r * bulge, t * h));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  return g;
}

/** 공포 한 벌 (바깥쪽 +z 로 내민 살미·첨차) — 정점색으로 단청 */
let bracketGeo = null;
export function bracketGeometry() {
  if (bracketGeo) return bracketGeo;
  const parts = [];
  const colorOf = (hex) => new THREE.Color(hex);
  const add = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = colorOf(hex);
    const cols = [];
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(g);
  };
  add(0.34, 0.16, 0.34, 0, 0.08, 0, '#2d6a5a'); // 주두
  add(0.9, 0.12, 0.16, 0, 0.22, 0, '#2d6a5a'); // 첨차
  add(0.16, 0.12, 0.7, 0, 0.22, 0.12, '#3d8a76'); // 살미1
  add(0.28, 0.1, 0.24, 0, 0.33, 0.28, '#b5432c'); // 소로
  add(1.2, 0.12, 0.16, 0, 0.44, 0.1, '#2d6a5a');
  add(0.16, 0.12, 0.95, 0, 0.44, 0.3, '#3d8a76'); // 살미2
  add(0.24, 0.1, 0.22, -0.45, 0.33, 0, '#e1b54a');
  add(0.24, 0.1, 0.22, 0.45, 0.33, 0, '#e1b54a');
  add(0.14, 0.1, 0.4, 0, 0.56, 0.72, '#f1e7cf'); // 쇠서
  bracketGeo = mergeGeometries(parts);
  return bracketGeo;
}

let bracketMat = null;
function bracketMaterial() {
  if (!bracketMat) bracketMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  return bracketMat;
}

/* ───────────────────────── 전각 ───────────────────────── */

/**
 * 전각 빌더. 정면은 +z.
 * opts: xs(기둥 x 좌표 배열), zs(기둥 z 좌표 배열), colH, colR, floorY(기둥 바닥 높이, 로컬),
 *       roof{type,overhang,height,lift}, front: 'open'|'doors'|'wall', sides/back: 'wall'|'doors'|'open',
 *       brackets(칸당 사이공포 수), plaque{text}
 */
export function buildHanok(opts) {
  const {
    xs,
    zs,
    colH = 3.6,
    colR = 0.22,
    roof = {},
    front = 'doors',
    back = 'wall',
    sides = 'wall',
    brackets = 1,
    plaque = null,
    beamH = 0.38,
    shadows = true
  } = opts;
  const m = mats();
  const g = new THREE.Group();
  const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1];
  const halfW = (x1 - x0) / 2, halfD = (z1 - z0) / 2;

  // 기둥 + 초석
  const colGeo = columnGeometry(colR, colH);
  const baseGeo = new THREE.CylinderGeometry(colR * 1.55, colR * 1.75, 0.22, 10);
  const cols = [];
  for (const x of xs) {
    for (const z of zs) {
      const perimeter = x === x0 || x === x1 || z === z0 || z === z1;
      if (!perimeter) continue;
      cols.push([x, z]);
    }
  }
  const colInst = new THREE.InstancedMesh(colGeo, m.column, cols.length);
  const baseInst = new THREE.InstancedMesh(baseGeo, m.granite, cols.length);
  const tmp = new THREE.Object3D();
  cols.forEach(([x, z], i) => {
    tmp.position.set(x, 0, z);
    tmp.updateMatrix();
    colInst.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, 0.05, z);
    tmp.updateMatrix();
    baseInst.setMatrixAt(i, tmp.matrix);
  });
  colInst.castShadow = shadows;
  colInst.receiveShadow = true;
  baseInst.receiveShadow = true;
  g.add(colInst, baseInst);
  g.userData.columns = cols;

  // 창방(단청 띠) + 평방
  const beam = (len, along, x, z, y, h, d) => {
    const geo = new THREE.BoxGeometry(along === 'x' ? len : d, h, along === 'x' ? d : len);
    const mat = [m.dancheong, m.dancheong, m.green, m.green, m.dancheong, m.dancheong];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    g.add(mesh);
  };
  const by = colH - beamH / 2;
  beam(x1 - x0 + 0.5, 'x', 0, z0, by, beamH, 0.26);
  beam(x1 - x0 + 0.5, 'x', 0, z1, by, beamH, 0.26);
  beam(z1 - z0 + 0.5, 'z', x0, (z0 + z1) / 2, by, beamH, 0.26);
  beam(z1 - z0 + 0.5, 'z', x1, (z0 + z1) / 2, by, beamH, 0.26);
  const py = colH + 0.09;
  beam(x1 - x0 + 0.7, 'x', 0, z0, py, 0.18, 0.34);
  beam(x1 - x0 + 0.7, 'x', 0, z1, py, 0.18, 0.34);
  beam(z1 - z0 + 0.7, 'z', x0, (z0 + z1) / 2, py, 0.18, 0.34);
  beam(z1 - z0 + 0.7, 'z', x1, (z0 + z1) / 2, py, 0.18, 0.34);

  // 공포 (주상 + 칸마다 사이공포)
  const bPos = [];
  const addRow = (arr, fixed, axis, sign) => {
    for (let i = 0; i < arr.length; i++) {
      bPos.push([axis, arr[i], fixed, sign]);
      if (i < arr.length - 1) {
        for (let k = 1; k <= brackets; k++) {
          bPos.push([axis, arr[i] + ((arr[i + 1] - arr[i]) * k) / (brackets + 1), fixed, sign]);
        }
      }
    }
  };
  addRow(xs, z1, 'x', 1);
  addRow(xs, z0, 'x', -1);
  addRow(zs, x1, 'z', 1);
  addRow(zs, x0, 'z', -1);
  const bInst = new THREE.InstancedMesh(bracketGeometry(), bracketMaterial(), bPos.length);
  const bScale = Math.min(1.25, Math.max(0.7, colH / 3.8));
  bPos.forEach(([axis, v, fixed, sign], i) => {
    if (axis === 'x') {
      tmp.position.set(v, colH + 0.18, fixed);
      tmp.rotation.set(0, sign > 0 ? 0 : Math.PI, 0);
    } else {
      tmp.position.set(fixed, colH + 0.18, v);
      tmp.rotation.set(0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    }
    tmp.scale.setScalar(bScale);
    tmp.updateMatrix();
    bInst.setMatrixAt(i, tmp.matrix);
  });
  bInst.castShadow = shadows;
  g.add(bInst);
  const bracketTop = colH + 0.18 + 0.62 * bScale;

  // 벽·창호
  const lat = latticeTextures();
  const doorMat = nightGlow(
    new THREE.MeshStandardMaterial({ map: lat.color, emissiveMap: lat.emissive, emissive: 0xffc98a, emissiveIntensity: 1.6, roughness: 0.9 }),
    1
  );
  const wallMat = m.plaster;
  const panelH = colH - beamH;
  // kind: 'open'|'doors'|'wall' 또는 칸별 배열
  const fillBays = (kinds, axis, coords, fixed, sign) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const kind = Array.isArray(kinds) ? kinds[i] : kinds;
      if (kind === 'open') continue;
      const a = coords[i] + colR * 0.8, b = coords[i + 1] - colR * 0.8;
      const w = b - a, mid = (a + b) / 2;
      const isDoor = kind === 'doors';
      const geo = new THREE.BoxGeometry(w, isDoor ? panelH - 0.25 : panelH, isDoor ? 0.08 : 0.16);
      const mat = isDoor ? [m.woodDark, m.woodDark, m.woodDark, m.woodDark, doorMat, doorMat] : wallMat;
      const mesh = new THREE.Mesh(geo, mat);
      const y = isDoor ? 0.25 + (panelH - 0.25) / 2 : panelH / 2;
      if (axis === 'x') mesh.position.set(mid, y, fixed);
      else {
        mesh.position.set(fixed, y, mid);
        mesh.rotation.y = Math.PI / 2;
      }
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.userData.occluder = 'wall';
      g.add(mesh);
      if (isDoor) {
        const sill = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.2), m.woodDark);
        sill.position.copy(mesh.position);
        sill.rotation.copy(mesh.rotation);
        sill.position.y = 0.125;
        g.add(sill);
      } else {
        // 벽 테두리 (인방)
        const frameMat = m.woodDark;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.2), frameMat);
        top.position.copy(mesh.position);
        top.rotation.copy(mesh.rotation);
        top.position.y = panelH * 0.62;
        g.add(top);
      }
    }
  };
  fillBays(front, 'x', xs, z1, 1);
  fillBays(back, 'x', xs, z0, -1);
  fillBays(sides, 'z', zs, x0, -1);
  fillBays(sides, 'z', zs, x1, 1);

  // 지붕
  const r = {
    type: 'paljak',
    overhang: 2,
    height: Math.max(2, halfD * 0.85),
    lift: 0.6,
    ...roof
  };
  const roofGroup = buildRoof({
    halfW: halfW + r.overhang,
    halfD: halfD + r.overhang,
    height: r.height,
    type: r.type,
    lift: r.lift,
    gableFrac: r.gableFrac ?? 0.42,
    segs: r.segs ?? 44,
    thickness: r.thickness ?? 0.3,
    material: r.material,
    underMaterial: r.underMaterial,
    shadows
  });
  // 기둥선에서의 지붕 밑면이 공포 위에 닿도록
  const sCol = halfD / (halfD + r.overhang);
  const yAtCol = roofGroup.userData.profileAt(sCol) - roofGroup.userData.thickAt(sCol);
  roofGroup.position.set((x0 + x1) / 2, bracketTop - yAtCol, (z0 + z1) / 2);
  g.add(roofGroup);
  g.userData.roofTop = roofGroup.position.y + r.height;
  g.userData.ceilingY = colH;

  // 현판
  if (plaque) {
    const pt = plaqueTexture(plaque.text, { vertical: plaque.vertical, w: plaque.vertical ? 180 : 512, h: plaque.vertical ? 420 : 160 });
    const pw = plaque.width || (plaque.vertical ? 0.62 : 2.2);
    const ph = plaque.vertical ? pw * (420 / 180) : pw * (160 / 512);
    const pm = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.08), [m.woodDark, m.woodDark, m.woodDark, m.woodDark, new THREE.MeshStandardMaterial({ map: pt, roughness: 0.6, metalness: 0.1 }), m.woodDark]);
    pm.position.set((x0 + x1) / 2, colH + 0.1 + ph * 0.25, z1 + 0.62);
    pm.rotation.x = -0.12;
    g.add(pm);
  }
  return g;
}

/* ───────────────────────── 석조물 ───────────────────────── */

/** 삼층석탑 (불국사 석가탑 비례를 단순화). 바닥 원점. */
export function buildPagoda() {
  const m = mats();
  const g = new THREE.Group();
  const box = (w, h, d, y, mat = m.granite) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = y + h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return y + h;
  };
  let y = 0;
  y = box(3.4, 0.25, 3.4, y);
  y = box(3.1, 0.6, 3.1, y); // 하층기단
  y = box(3.3, 0.16, 3.3, y); // 갑석
  y = box(2.4, 0.95, 2.4, y); // 상층기단
  // 우주 (모서리 기둥 표현)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), m.granite);
      p.position.set(sx * 1.17, y - 0.475, sz * 1.17);
      g.add(p);
    }
  }
  y = box(2.65, 0.16, 2.65, y);
  const stories = [
    [1.45, 1.15],
    [1.2, 0.55],
    [1.0, 0.48]
  ];
  stories.forEach(([w, h], i) => {
    y = box(w * 0.5, 0.08, w * 0.5, y - 0.001);
    y = box(w, h, w, y);
    // 층급받침
    y = box(w * 1.12, 0.08, w * 1.12, y);
    y = box(w * 1.3, 0.08, w * 1.3, y);
    y = box(w * 1.5, 0.07, w * 1.5, y);
    const hw = w * 1.15 + 0.15;
    const r = buildRoof({
      halfW: hw,
      halfD: hw,
      height: 0.32,
      type: 'hip',
      lift: 0.14,
      flare: 0.03,
      segs: 16,
      thickness: 0.13,
      material: m.granite,
      underMaterial: m.granite,
      edgeMaterial: m.granite,
      ridgeMaterial: m.granite,
      ridges: false
    });
    r.position.y = y + 0.13 * 1.45;
    g.add(r);
    y = r.position.y + 0.32;
  });
  // 상륜부
  y = box(0.42, 0.22, 0.42, y);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.granite);
  sph.position.y = y;
  g.add(sph);
  y += 0.18;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), m.bronzeGreen);
  rod.position.y = y + 0.65;
  g.add(rod);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.02, 0.035, 6, 14), m.granite);
    t.rotation.x = Math.PI / 2;
    t.position.y = y + 0.15 + i * 0.16;
    g.add(t);
  }
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), m.granite);
  jewel.position.y = y + 1.32;
  g.add(jewel);
  g.userData.height = y + 1.4;
  return g;
}

/** 팔각 석등. 화사석 안의 불빛은 nightGlow 로 밤에 켜진다. 바닥 원점. */
let LANTERN_GLOW = null;
export function buildStoneLantern(scale = 1) {
  const m = mats();
  const g = new THREE.Group();
  const oct = (rt, rb, h, y, mat = m.granite) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat);
    mesh.position.y = y + h / 2;
    mesh.rotation.y = Math.PI / 8;
    mesh.castShadow = true;
    g.add(mesh);
    return y + h;
  };
  let y = 0;
  y = oct(0.62, 0.66, 0.16, y);
  y = oct(0.46, 0.56, 0.2, y); // 하대석 연꽃
  y = oct(0.13, 0.15, 0.95, y); // 간주석
  y = oct(0.5, 0.38, 0.2, y); // 상대석
  // 화사석: 네 기둥 + 발광 심지
  const fireY = y;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.48, 0.11), m.granite);
    p.position.set(Math.cos(a) * 0.25, y + 0.24, Math.sin(a) * 0.25);
    p.castShadow = true;
    g.add(p);
  }
  // 심지 재질은 석등끼리 하나 — 정적 병합이 석등마다 그리기 호출을 따로 만들지 않게
  LANTERN_GLOW ||= nightGlow(new THREE.MeshStandardMaterial({ color: 0x3a3022, emissive: 0xffb466, emissiveIntensity: 3.2, roughness: 1 }), 1);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 8), LANTERN_GLOW);
  glow.position.y = y + 0.24;
  g.add(glow);
  y += 0.48;
  // 옥개석
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.34, 8), m.granite);
  cap.position.y = y + 0.17;
  cap.rotation.y = Math.PI / 8;
  cap.castShadow = true;
  g.add(cap);
  y += 0.32;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.granite);
  bead.position.y = y + 0.08;
  g.add(bead);
  g.scale.setScalar(scale);
  g.userData.fireY = (fireY + 0.24) * scale;
  return g;
}

/** 일주문 — 두 기둥 위 맞배지붕과 현판. 원점 = 문 중심 바닥, 길은 z 축 */
export function buildIljumun() {
  const m = mats();
  const g = new THREE.Group();
  const W = 2.0, colH = 4.3, colR = 0.33;
  const colGeo = columnGeometry(colR, colH);
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(colGeo, m.column);
    c.position.set(sx * W, 0, 0);
    c.castShadow = true;
    g.add(c);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(colR * 1.6, colR * 1.8, 0.35, 10), m.granite);
    base.position.set(sx * W, 0.1, 0);
    g.add(base);
    // 보조 버팀(작은 지지석)
  }
  const beamMat = [m.dancheong, m.dancheong, m.green, m.green, m.dancheong, m.dancheong];
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.4, 0.42, 0.36), beamMat);
  b1.position.y = colH - 0.21;
  b1.castShadow = true;
  g.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.7, 0.2, 0.5), m.green);
  b2.position.y = colH + 0.1;
  g.add(b2);
  b1.userData.occluder = b2.userData.occluder = 'beam'; // 카메라 팔이 들보·현판 바로 밑에 붙지 않게 (templeScene ARM)
  // 다포 공포 (앞뒤로)
  const n = 7;
  const bi = new THREE.InstancedMesh(bracketGeometry(), bracketMaterial(), n * 2);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    for (const side of [0, 1]) {
      tmp.position.set(-W - 0.6 + ((2 * W + 1.2) * i) / (n - 1), colH + 0.2, 0);
      tmp.rotation.set(0, side ? Math.PI : 0, 0);
      tmp.scale.setScalar(1.05);
      tmp.updateMatrix();
      bi.setMatrixAt(i * 2 + side, tmp.matrix);
    }
  }
  bi.castShadow = true;
  g.add(bi);
  const roof = buildRoof({ halfW: W + 1.9, halfD: 2.3, height: 1.9, type: 'gable', lift: 0.55, segs: 30, thickness: 0.3 });
  const sCol = 0.3 / 2.3;
  roof.position.y = colH + 0.2 + 0.65 - (roof.userData.profileAt(sCol) - roof.userData.thickAt(sCol)) - 0.15;
  g.add(roof);
  // 현판 (앞뒤)
  const pt = plaqueImageTexture('./assets/brand/logo-cal-v1.webp', { w: 640, h: 200 }); // 산문 현판 「清蓮山寺」 붓글씨 (2026-11-07, 대문 로고였던 것)
  const pmat = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.55, metalness: 0.1 });
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72), pmat);
    p.position.set(0, colH - 0.75, side * 0.21);
    p.rotation.y = side > 0 ? 0 : Math.PI;
    p.userData.occluder = 'beam';
    g.add(p);
  }
  g.userData.columns = [[-W, 0], [W, 0]];
  return g;
}

/** 범종각: 높은 석축 위 네 기둥, 팔작지붕, 범종과 당목. 원점 = 바닥 중앙 */
export function buildBellPavilion() {
  const m = mats();
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.55, 5.0), m.granite);
  base.position.y = 0.275;
  base.receiveShadow = true;
  base.castShadow = true;
  g.add(base);
  const hall = buildHanok({
    xs: [-1.9, 1.9],
    zs: [-1.9, 1.9],
    colH: 3.5,
    colR: 0.2,
    front: 'open',
    back: 'open',
    sides: 'open',
    brackets: 2,
    roof: { type: 'paljak', overhang: 1.6, height: 2.2, lift: 0.55, gableFrac: 0.45, segs: 28 }
  });
  hall.position.y = 0.55;
  g.add(hall);
  // 종
  const prof = [
    [0.0, 1.62],
    [0.32, 1.62],
    [0.5, 1.5],
    [0.56, 1.2],
    [0.6, 0.6],
    [0.7, 0.15],
    [0.74, 0.0],
    [0.68, 0.0]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bellGeo = new THREE.LatheGeometry(prof, 32);
  const bell = new THREE.Mesh(bellGeo, m.bronze);
  bell.material.side = THREE.DoubleSide;
  bell.castShadow = true;
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 0.55 + 3.45, 0);
  bell.position.y = -1.62 - 0.35;
  bellPivot.add(bell);
  // 용뉴
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 16, Math.PI), m.bronze);
  hook.position.y = -0.3;
  bellPivot.add(hook);
  // 띠 장식
  for (const yy of [0.12, 1.38]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(yy < 1 ? 0.69 : 0.55, 0.03, 6, 32), m.bronze);
    band.rotation.x = Math.PI / 2;
    band.position.y = -1.97 + yy;
    bellPivot.add(band);
  }
  g.add(bellPivot);
  // 당목 (줄에 매단 통나무)
  const ram = new THREE.Group();
  ram.position.set(1.15, 0.55 + 2.85, 0);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.5, 10), m.woodLight);
  log.rotation.z = Math.PI / 2;
  log.position.y = -0.9;
  log.position.x = 0.35;
  ram.add(log);
  for (const dx of [-0.2, 0.8]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), m.rope);
    rope.position.set(dx, -0.45, 0);
    ram.add(rope);
  }
  g.add(ram);
  g.userData.bellPivot = bellPivot;
  g.userData.ram = ram;
  g.userData.bellY = 0.55 + 3.45 - 1.0;
  return g;
}

/** 돌담 + 기와 지붕 (x 축 방향, 길이 len). 원점 = 담 아래 중앙 */
let WALL_PLASTER = null;
export function buildWall(len, h = 1.55) {
  const m = mats();
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.BoxGeometry(len, h * 0.55, 0.62), m.stoneDark);
  stone.position.y = h * 0.275;
  stone.castShadow = true;
  stone.receiveShadow = true;
  g.add(stone);
  // 회벽 재질은 담끼리 하나 (담마다 새로 만들면 병합이 담 수만큼 그리기 호출을 남긴다)
  WALL_PLASTER ||= new THREE.MeshStandardMaterial({ map: plasterTexture(), color: 0xd9ccb0, roughness: 1 });
  const plaster = new THREE.Mesh(new THREE.BoxGeometry(len, h * 0.45, 0.5), WALL_PLASTER);
  plaster.position.y = h * 0.55 + h * 0.225;
  plaster.castShadow = true;
  g.add(plaster);
  const cap = buildRoof({ halfW: len / 2 + 0.2, halfD: 0.55, height: 0.32, type: 'gable', lift: 0.05, segs: Math.max(8, Math.round(len * 1.5)), thickness: 0.12, tile: 0.45 });
  cap.position.y = h;
  g.add(cap);
  stone.userData.occluder = plaster.userData.occluder = 'wall';
  cap.traverse((o) => o.isMesh && (o.userData.occluder = 'cap'));
  return g;
}

/** 석축 계단: x 폭 w, 단 수 n, 단 높이 rise, 단 깊이 run. 원점 = 첫 단 앞 아래, -z 방향으로 오른다 */
export function buildStairs(w, n, rise, run, withSides = true) {
  const m = mats();
  const g = new THREE.Group();
  const geos = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.BoxGeometry(w, rise * (i + 1), run);
    geo.translate(0, (rise * (i + 1)) / 2, -run * (i + 0.5));
    geos.push(geo);
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), m.granite);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  if (withSides) {
    // 소맷돌
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0, rise * 1.6);
      shape.lineTo(-run * n, rise * (n + 1.4));
      shape.lineTo(-run * n, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false });
      geo.rotateY(-Math.PI / 2);
      const side = new THREE.Mesh(geo, m.granite);
      side.position.x = sx * (w / 2) + (sx > 0 ? 0.32 : 0);
      side.castShadow = true;
      g.add(side);
    }
  }
  return g;
}
