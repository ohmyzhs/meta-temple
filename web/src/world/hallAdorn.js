/**
 * 대웅전 장엄 — 중층으로 넓고 높아진 법당이 휑하지 않게 (사용자 2026-11-07 「더 화려하고 금빛, 단상 앞 사방에 촛불,
 * 단상도 시주함·공양미함 등 여러 개」). 대형 사찰 대웅전 차림을 따른다:
 *   수미단 앞 공양단(향로·쌍촛대·화병·과일 탑·마지), 양옆 촛불 공양대, 복전함·공양미함과 공양미 포대,
 *   뒤 바깥 칸에 신중단(서)·영단(동)과 탱화, 세 벽을 같은 높이로 두르는 천불벽 띠, 대중 위로 매단 연등.
 * 되풀이 물건(초·불꽃·과일·꽃·포대·위패·연등)은 InstancedMesh, 정적 물체는 공용 재질(mats())이라 batchStatic 이
 * 기존 묶음에 합친다. 조명은 더하지 않는다 — 촛불 빛은 바닥 glowDecals 와 블룸으로만.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { L, addBoxCollider } from './layout.js';
import { envUniforms, nightGlow } from './materials.js';
import { sumidanTexture, plaqueTexture, taenghwaTexture } from './textures.js';

const WALL = './assets/world/wall/';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function imageTex(file, { repeat = false, fallback = null, mat = null } = {}) {
  const t = new THREE.TextureLoader().load(WALL + file, undefined, undefined, () => {
    if (fallback && mat) {
      mat.map = fallback();
      mat.needsUpdate = true;
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 촛불: 초 몸통 + 깜박이는 불꽃 (불꽃 높이를 인스턴스마다 다른 위상으로 — 정점 셰이더, CPU 갱신 없음) */
function candleMeshes(list) {
  const cGeo = new THREE.CylinderGeometry(0.028, 0.03, 0.11, 8);
  cGeo.translate(0, 0.055, 0);
  const cMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.6, emissive: 0x6a3a10, emissiveIntensity: 0.35 });
  const fGeo = new THREE.SphereGeometry(0.02, 6, 4);
  fGeo.scale(1, 2.4, 1);
  fGeo.translate(0, 0.045, 0);
  const fMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.75, 0.62) }); // 1 넘는 밝기 → 블룸
  fMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = envUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float fi = float(gl_InstanceID);
      float fk = 0.8 + 0.2 * sin(uTime * 9.0 + fi * 1.7) * sin(uTime * 5.3 + fi * 0.61);
      transformed.y *= fk;
      transformed.x += sin(uTime * 3.1 + fi) * 0.08 * transformed.y;`
    );
  };
  const cm = new THREE.InstancedMesh(cGeo, cMat, list.length);
  const fm = new THREE.InstancedMesh(fGeo, fMat, list.length);
  const o = new THREE.Object3D();
  list.forEach(([x, y, z, s], i) => {
    o.position.set(x, y, z);
    o.scale.setScalar(s);
    o.updateMatrix();
    cm.setMatrixAt(i, o.matrix);
    o.position.y = y + 0.11 * s;
    o.scale.setScalar(0.6 + 0.45 * s);
    o.updateMatrix();
    fm.setMatrixAt(i, o.matrix);
  });
  cm.receiveShadow = true;
  return [cm, fm];
}

/** 같은 지오메트리를 인스턴스 색과 함께 여러 자리에 (과일·꽃·잎·잔) */
function instanced(geo, mat, items) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach(({ p, s = 1, sy = s, ry = 0, color }, i) => {
    o.position.set(...p);
    o.rotation.set(0, ry, 0);
    o.scale.set(s, sy, s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (color != null) mesh.setColorAt(i, c.set(color));
  });
  mesh.receiveShadow = true;
  return mesh;
}

const lathe = (pts, segs = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);

/**
 * @param m 공용 재질 mats()
 * @param tz,ty 공양단 가운데 z · 윗면 높이 (temple.js 의 향로·쌍촛대가 이 위에 선다)
 * @returns { glow: glowDecals 에 더할 바닥 빛 }
 */
export function buildHallAdorn(scene, m, { tz, ty }) {
  const h = L.hall, fy = h.floorY, z0 = h.z0;
  const glow = [];
  const candles = []; // [x, y, z, 크기]
  const fruits = [], blooms = [], leaves = [], cups = [], tablets = [], bags = [];
  const add = (mesh) => {
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const box = (w, hh, d, x, y, z, mat) => {
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat));
    b.position.set(x, y + hh / 2, z);
    return b;
  };
  const panelMat = (rep) => {
    const t = sumidanTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(rep, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
  };
  // 굽다리 접시에 쌓은 과일 탑
  const standGeo = lathe([[0, 0], [0.13, 0], [0.13, 0.02], [0.05, 0.05], [0.035, 0.17], [0.06, 0.2], [0.2, 0.215], [0.21, 0.24], [0, 0.24]]);
  const FRUIT = [['#c8321e', '#d9542a'], ['#e8a33a', '#f0b84a'], ['#c9b23a', '#b8a02e'], ['#9b2a3a', '#7a1e2e']];
  const fruitTower = (x, y, z, k, s = 1) => {
    const st = add(new THREE.Mesh(standGeo, m.gold));
    st.position.set(x, y, z);
    st.scale.setScalar(s);
    const r = 0.062 * s;
    const layers = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * 2.05 * r, Math.sin((i / 6) * Math.PI * 2) * 2.05 * r])];
    let yy = y + 0.24 * s + r;
    [layers, layers.slice(1, 4).map(([a, b]) => [a * 0.5, b * 0.5]), [[0, 0]]].forEach((ring, li) => {
      ring.forEach(([dx, dz], j) => fruits.push({ p: [x + dx, yy, z + dz], s: r / 0.062, color: FRUIT[k][(li + j) % 2] }));
      yy += r * 1.55;
    });
  };
  // 화병 꽃꽂이: 금 화병 + 연꽃·국화 송이 반구
  const vaseGeo = lathe([[0, 0], [0.12, 0], [0.16, 0.08], [0.17, 0.2], [0.11, 0.34], [0.07, 0.42], [0.1, 0.5], [0, 0.5]]);
  const BLOOM = ['#f4a3b5', '#f7e9e2', '#f0c84a', '#e86a7a', '#ffffff'];
  const vase = (x, y, z, s = 1, seed = 1) => {
    const v = add(new THREE.Mesh(vaseGeo, m.gold));
    v.position.set(x, y, z);
    v.scale.setScalar(s);
    let q = seed * 9301;
    const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    const cy = y + 0.62 * s, R = 0.36 * s;
    for (let i = 0; i < 34; i++) {
      const u = rnd() * Math.PI * 2, w = Math.acos(1 - rnd() * 1.1); // 위쪽 반구에 몰리게
      const p = [x + Math.sin(w) * Math.cos(u) * R, cy + Math.cos(w) * R * 0.9, z + Math.sin(w) * Math.sin(u) * R * 0.8];
      blooms.push({ p, s: s * (0.8 + rnd() * 0.5), sy: s * 0.7, color: BLOOM[Math.floor(rnd() * BLOOM.length)] });
    }
    for (let i = 0; i < 16; i++) {
      const u = rnd() * Math.PI * 2;
      leaves.push({ p: [x + Math.cos(u) * R * 0.75, cy - R * 0.25 + rnd() * R * 0.4, z + Math.sin(u) * R * 0.6], s: s * 1.1, sy: s * 0.45, ry: u, color: rnd() > 0.5 ? '#3f6b35' : '#567f3e' });
    }
  };

  /* ── 공양단: 수미단 앞 붉은 옻칠 긴 단 ── */
  const LW = 10.4, LD = 0.9, LH = ty - fy;
  {
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(LW, LH - 0.1, LD), [m.red, m.red, m.woodDark, m.red, panelMat(9), m.red]));
    b.position.set(0, fy + 0.04 + (LH - 0.1) / 2, tz);
    b.castShadow = true;
    box(LW + 0.12, 0.06, LD + 0.12, 0, ty - 0.06, tz, m.gold); // 윗면 금테
    box(LW + 0.1, 0.05, LD + 0.1, 0, fy, tz, m.woodDark); // 굽
    box(LW, 0.03, LD, 0, ty - 0.03, tz, m.red);
    addBoxCollider(-LW / 2 - 0.06, tz - LD / 2 - 0.06, LW / 2 + 0.06, tz + LD / 2 + 0.06);
    for (const [x, k] of [[-2.35, 0], [-0.8, 1], [0.8, 2], [2.35, 3]]) fruitTower(x, ty, tz - 0.15, k);
    for (const sx of [-1, 1]) vase(sx * 3.75, ty, tz - 0.12, 1.25, sx + 3);
    // 마지(밥) 그릇 · 다기 세 잔
    const bowl = add(new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.09, 0.03], [0.07, 0.07], [0.12, 0.09], [0.13, 0.17], [0.09, 0.24], [0.02, 0.27], [0.03, 0.3], [0, 0.3]]), m.gold));
    bowl.position.set(0, ty, tz - 0.32);
    for (const dx of [-0.42, 0.42]) cups.push({ p: [dx, ty, tz + 0.28], s: 1 }); // 가운데는 향로 자리
    // 앞 가장자리 촛불 줄
    for (let x = 1.9; x <= 4.95; x += 0.34) for (const sx of [-1, 1]) candles.push([sx * x, ty, tz + 0.33, 1]);
    glow.push({ x: 0, z: tz + 0.9, y: fy, r: 3.6, i: 0.55 });
  }

  /* ── 촛불 공양대: 공양단 양옆, 뒤로 갈수록 높아지는 네 단 ── */
  const RW = 2.7, RZ0 = tz - LD / 2 - 0.1; // 뒷면 = 수미단 앞면
  for (const sx of [-1, 1]) {
    const cx = sx * 7.55;
    for (let k = 0; k < 4; k++) {
      const zz = RZ0 + 1.1 - (k + 0.5) * 0.275, hh = 0.5 + k * 0.2;
      box(RW, hh - 0.03, 0.275, cx, fy, zz, k % 2 ? m.red : m.woodDark);
      box(RW + 0.04, 0.03, 0.29, cx, fy + hh - 0.03, zz, m.gold);
      for (let i = 0; i < 11; i++) candles.push([cx - RW / 2 + 0.14 + i * 0.242 + (k % 2) * 0.06, fy + hh, zz, 1]);
    }
    for (const dx of [-1, 1]) box(0.06, 1.25, 0.06, cx + dx * (RW / 2 + 0.02), fy, RZ0 + 0.05, m.gold); // 뒤 기둥
    box(RW + 0.1, 0.05, 0.08, cx, fy + 1.25, RZ0 + 0.05, m.gold);
    addBoxCollider(cx - RW / 2 - 0.06, RZ0 - 0.02, cx + RW / 2 + 0.06, RZ0 + 1.14);
    glow.push({ x: cx, z: RZ0 + 1.4, y: fy, r: 2.8, i: 0.7 });
  }

  /* ── 복전함 · 공양미함, 공양미 포대 ── */
  const chest = (x, z, text) => {
    const w = 0.96, hh = 0.7, d = 0.62;
    box(w, hh, d, x, fy, z, m.woodDark).castShadow = true;
    box(w + 0.04, 0.06, d + 0.04, x, fy + hh, z, m.red);
    for (const sx of [-1, 1]) box(0.05, hh + 0.04, d + 0.03, x + sx * (w / 2 - 0.02), fy, z, m.gold);
    box(w + 0.03, 0.045, d + 0.03, x, fy + 0.12, z, m.gold);
    box(0.36, 0.012, 0.05, x, fy + hh + 0.06, z, m.bronze); // 넣는 구멍
    const label = add(new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.22), new THREE.MeshStandardMaterial({ map: plaqueTexture(text, { w: 384, h: 132, bg: '#5a1410', fg: '#efcf74' }), roughness: 0.45 })));
    label.position.set(x, fy + hh * 0.62, z + d / 2 + 0.006);
    addBoxCollider(x - w / 2 - 0.03, z - d / 2 - 0.03, x + w / 2 + 0.03, z + d / 2 + 0.03);
  };
  const boxZ = tz + LD / 2 + 0.75;
  chest(-2.7, boxZ, '福田函');
  chest(2.7, boxZ, '供養米');
  const pile = (cx, cz, nx, nz, layers) => {
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < nx - l; i++)
        for (let j = 0; j < nz; j++) bags.push({ p: [cx + (i - (nx - l - 1) / 2) * 0.47, fy + 0.1 + l * 0.19, cz + (j - (nz - 1) / 2) * 0.33], ry: ((i * 7 + j * 3 + l) % 5 - 2) * 0.04 });
  };
  pile(3.95, boxZ, 3, 2, 2);
  addBoxCollider(3.2, boxZ - 0.38, 4.7, boxZ + 0.38);

  /* ── 신중단(서) · 영단(동): 뒤 바깥 칸 벽에 붙은 단, 위에 탱화 ── */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a120c, roughness: 0.5 });
  for (const [sx, img, kind] of [[-1, 'shinjung.webp', 'sinjung'], [1, 'gamro.webp', 'yeong']]) {
    const cx = sx * 12.0, SW = 3.6, SD = 1.35, zb = z0 + 0.1, zf = zb + SD;
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(SW, 0.96, SD), [m.red, m.red, m.woodDark, m.red, panelMat(3), m.red]));
    b.position.set(cx, fy + 0.04 + 0.48, zb + SD / 2);
    b.castShadow = true;
    box(SW + 0.1, 0.05, SD + 0.1, cx, fy, zb + SD / 2, m.woodDark);
    box(SW + 0.1, 0.05, SD + 0.08, cx, fy + 1.0, zb + SD / 2, m.gold);
    const top = fy + 1.05;
    box(SW - 0.4, 0.4, 0.55, cx, top, zb + 0.3, m.red); // 뒤 층 (위패·다기)
    box(SW - 0.34, 0.04, 0.6, cx, top + 0.4, zb + 0.3, m.gold);
    // 탱화
    const pw = 3.2, ph = 4.27, py = top + 0.45 + 0.25 + ph / 2;
    const pm = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    pm.map = imageTex(img, { fallback: () => taenghwaTexture('side'), mat: pm });
    const pic = add(new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), pm));
    pic.position.set(cx, py, z0 + 0.16);
    for (const [t, mat, zz, d] of [[0.16, frameMat, z0 + 0.17, 0.06], [0.04, m.gold, z0 + 0.195, 0.02]]) {
      box(pw + 2 * t, t, d, cx, py + ph / 2, zz, mat);
      box(pw + 2 * t, t, d, cx, py - ph / 2 - t, zz, mat);
      box(t, ph, d, cx - pw / 2 - t / 2, py - ph / 2, zz, mat);
      box(t, ph, d, cx + pw / 2 + t / 2, py - ph / 2, zz, mat);
    }
    // 앞 층: 쌍촛대(큰 초) · 작은 향로 · 과일 탑 · 화병 · 앞줄 촛불
    for (const dx of [-1.35, 1.35]) {
      box(0.05, 0.42, 0.05, cx + dx, top, zf - 0.32, m.gold);
      add(new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.04, 0.03], [0, 0.03]]), m.gold)).position.set(cx + dx, top, zf - 0.32);
      add(new THREE.Mesh(lathe([[0, 0], [0.09, 0], [0.1, 0.02], [0, 0.02]]), m.gold)).position.set(cx + dx, top + 0.42, zf - 0.32);
      candles.push([cx + dx, top + 0.44, zf - 0.32, 2.2]);
    }
    const burner = add(new THREE.Mesh(lathe([[0, 0], [0.1, 0], [0.16, 0.05], [0.17, 0.14], [0.14, 0.17], [0, 0.17]]), m.bronze));
    burner.position.set(cx, top, zf - 0.38);
    fruitTower(cx - 0.62, top, zf - 0.45, sx < 0 ? 0 : 1, 0.85);
    fruitTower(cx + 0.62, top, zf - 0.45, sx < 0 ? 2 : 3, 0.85);
    vase(cx - 1.55 * -sx, top + 0.44, zb + 0.3, 0.75, sx + 7);
    for (let i = 0; i < 9; i++) candles.push([cx - 1.45 + i * 0.3625, top, zf - 0.1, 1]);
    if (kind === 'yeong') {
      // 영단: 위패 두 줄
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) tablets.push({ p: [cx - 1.25 + i * 0.29 + sx * 0.12, top + 0.44, zb + 0.42 - r * 0.22], s: r ? 1.1 : 1 });
    } else {
      // 신중단: 다기 일곱 잔
      for (let i = 0; i < 7; i++) cups.push({ p: [cx - 1.0 + i * 0.3 + sx * 0.25, top + 0.44, zb + 0.38], s: 1 });
    }
    // 공양미 포대: 단 앞 바깥쪽
    pile(sx * 13.0, zf + 0.5, 4, 2, 3);
    addBoxCollider(Math.min(cx - SW / 2, sx * 13.0 - 0.95) - 0.05, zb - 0.1, Math.max(cx + SW / 2, sx * 13.0 + 0.95) + 0.05, zf + 0.05);
    addBoxCollider(sx * 13.0 - 0.98, zf, sx * 13.0 + 0.98, zf + 0.9);
    glow.push({ x: cx, z: zf + 0.8, y: fy, r: 2.4, i: 0.5 });
  }

  /* ── 천불벽: 양옆 벽은 옻칠 징두리(2.4m) 위로 창방 밑까지, 뒤 바깥 칸은 탱화 위 띠 (밤엔 인등처럼 은은히) ── */
  {
    const TW = 1.8, TH = 2.0; // 그림 한 장 = 감실 5×5 (가로 1.8m × 세로 2.0m)
    const tex = imageTex('cheonbul.webp', { repeat: true });
    const mat = nightGlow(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffd9a0, emissiveIntensity: 0.55, roughness: 0.6 }), 0.9);
    const band = (w, x, z, ry, yb, yt) => {
      const g = new THREE.PlaneGeometry(w, yt - yb);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / TW, (uv.getY(i) * (yt - yb)) / TH);
      const p = add(new THREE.Mesh(g, mat));
      p.position.set(x, (yb + yt) / 2, z);
      p.rotation.y = ry;
    };
    const lz = h.z1 - h.z0 - 0.9, zc = (h.z0 + h.z1) / 2;
    for (const [x, ry] of [[h.x0 + 0.13, Math.PI / 2], [h.x1 - 0.13, -Math.PI / 2]]) {
      band(lz, x, zc, ry, fy + 7.1, fy + 11.1); // 인방(6.9m) 위
      band(lz, x, zc, ry, fy + 2.45, fy + 6.85); // 인방 밑
      const sx = Math.sign(x);
      box(0.05, 2.45, lz, x + sx * 0.01, fy, zc, m.red); // 옻칠 징두리
      box(0.07, 0.06, lz, x - sx * 0.005, fy + 2.42, zc, m.gold);
    }
    for (const sx of [-1, 1]) band(h.xs[5] - h.xs[4] - 0.9, sx * (h.xs[4] + h.xs[5]) / 2, z0 + 0.22, 0, fy + 7.1, fy + 11.1);
  }

  /* ── 되풀이 물건 ── */
  for (const mesh of candleMeshes(candles)) scene.add(mesh);
  scene.add(instanced(new THREE.SphereGeometry(0.062, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.45 }), fruits));
  scene.add(instanced(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), blooms));
  scene.add(instanced(new THREE.SphereGeometry(0.06, 6, 4).scale(1.8, 1, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), leaves));
  scene.add(instanced(lathe([[0, 0], [0.035, 0], [0.03, 0.02], [0.045, 0.09], [0, 0.09]], 12), m.gold, cups));
  if (tablets.length) {
    const tt = canvasTex(64, 200, (g, w, hh) => {
      g.fillStyle = '#f1e6cf';
      g.fillRect(0, 0, w, hh);
      g.fillStyle = '#7a1a12';
      g.fillRect(0, 0, w, 26);
      g.strokeStyle = '#c79a3a';
      g.lineWidth = 5;
      g.strokeRect(3, 3, w - 6, hh - 6);
      g.fillStyle = '#2a201a';
      for (let y = 44; y < hh - 18; y += 16) g.fillRect(w / 2 - 5, y, 10, 10);
    });
    const tg = new THREE.BoxGeometry(0.12, 0.36, 0.025);
    tg.translate(0, 0.18, 0);
    scene.add(instanced(tg, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.7 }), tablets));
  }
  const bagTex = canvasTex(128, 96, (g, w, hh) => {
    g.fillStyle = '#d8cdb4';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#b8282a';
    g.fillRect(w * 0.3, hh * 0.22, w * 0.4, hh * 0.56);
    g.fillStyle = '#d8cdb4';
    g.font = 'bold 22px serif';
    g.textAlign = 'center';
    g.fillText('米', w / 2, hh * 0.6);
  });
  scene.add(instanced(new RoundedBoxGeometry(0.46, 0.19, 0.32, 2, 0.07), new THREE.MeshStandardMaterial({ map: bagTex, color: 0xc9bfa6, roughness: 0.95 }), bags)); // 흰 포대가 두부처럼 뜨지 않게 누른다
  return { glow };
}

/** 대중 위로 매단 연등 — 마당 연등과 같은 지오메트리·재질(밤 발광 포함, LanternSystem.update 가 uGlow 를 올린다) */
export function buildHallLanterns(scene, lanternMesh, quality) {
  const h = L.hall, fy = h.floorY;
  const ceil = fy + h.colH - 0.03;
  const rows = [-22.6, -24.2, -25.8, -27.4, -29.0, -30.6];
  const COLORS = ['#f4a3b5', '#f3a24a', '#e98a9a', '#79a9d9', '#f6c6a0', '#e9b84a', '#d97a9a']; // 흰 등은 밤에 가까이서 하얗게 번져 뺐다
  const S = 1.5;
  const items = [];
  const lines = [];
  rows.forEach((z, r) => {
    for (let i = 0; i < 12; i++) {
      if (quality === 'low' && (i + r) % 2) continue;
      const x = -11 + i * 2 + (r % 2 ? 0.5 : -0.5);
      const y = fy + 8.3 + (r % 2) * 0.55 + ((i * 5 + r * 3) % 4) * 0.08;
      items.push({ p: [x, y, z], s: S, color: COLORS[(i * 3 + r * 5) % COLORS.length], ry: i + r });
      lines.push(x, y + 0.51 * S, z, x, ceil, z);
    }
  });
  const mesh = instanced(lanternMesh.geometry, lanternMesh.material, items);
  mesh.receiveShadow = false;
  scene.add(mesh);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2018 })));
  return mesh;
}
