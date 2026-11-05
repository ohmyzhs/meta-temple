/**
 * 대웅전 삼존 — 본존 석가모니불(항마촉지인)과 협시보살 두 분.
 *
 * 조각하듯 빚는다: 부위마다 부호거리함수(SDF)를 매끈하게 이어 붙이고(smin), 홈은 깎아 내고(smax),
 * 가사 주름은 표면을 살짝 밀어 올린다. 그 함수를 격자에서 재어 surface nets 로 메쉬를 뽑는다.
 *  - 머리·손은 촘촘한 격자(본존 머리 3.5mm), 몸·가사는 성긴 격자(11mm)로 따로 뽑아 겹친다.
 *  - 거친 격자(4칸)로 먼저 재고 표면 가까운 블록만 촘촘히 계산한다.
 *  - 법선은 함수의 기울기, 주름 사이 그늘(AO)은 법선 방향으로 몇 번 재어 꼭짓점 색에 굽는다
 *    (틈은 어둡고 붉은 옻칠빛, 나머지는 개금한 금빛).
 * 좌표: 원점 = 좌대 윗면 중심, +y 위, +z 정면(참배객 쪽), +x = 불상의 왼쪽.
 */
import * as THREE from 'three';

import { sculptData, smooth, HEAD_TILT, HEAD_PIVOT, HEAD_SCALE, HAIR_HEX } from './buddhaSculpt.js';

function curlGeometry() {
  const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - 0.24 * Math.pow(0.5 + 0.5 * Math.sin(a + y * 11), 2) * (1 - y * 0.4); // 소용돌이 홈
    p.setXYZ(i, x * k, y * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────── 연화대좌 ───────────── */
/**
 * 꽃잎 한 장: 밑동(원점)에서 위로 자라며 바깥(+z)으로 휜다. 가운데 능선·안쪽 겹꽃잎 테두리.
 * len 길이, wid 반폭, flare 바깥으로 젖히는 각, cup 오목함, tip 끝 말림
 */
function petalGeometry({ len, wid, flare, cup = 0.35, tip = 0.25, ridgeH = 0.006, rimH = 0.004, nu = 10, nv = 12 }) {
  const pos = [], col = [], idx = [];
  // 척추선
  const spine = [[0, 0, 0]];
  for (let j = 1; j <= nv; j++) {
    const v = j / nv;
    const th = flare * Math.pow(v, 1.3) + tip * Math.pow(smooth(0.72, 1, v), 2);
    const [py, pz] = spine[j - 1];
    spine.push([py + Math.cos(th) * (len / nv), pz + Math.sin(th) * (len / nv), th]);
  }
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const [sy, sz] = spine[j];
    const th = spine[j][2] ?? 0;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.98 + 0.02)), 0.62) * (1 - 0.2 * v) * (v > 0.97 ? 0.3 : 1);
    const ny = -Math.sin(th), nz = Math.cos(th); // 바깥 법선 (척추에 수직)
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      let off = -cup * (1 - u * u) * w; // 가운데가 안으로 오목
      off += ridgeH * Math.exp(-((u / 0.13) ** 2)) * Math.sin(Math.PI * v) ** 0.6; // 가운데 능선
      off += rimH * Math.exp(-(((Math.abs(u) - 0.7) / 0.09) ** 2)) * smooth(0.1, 0.3, v) * smooth(0.95, 0.75, v); // 겹꽃잎 테
      pos.push(u * w, sy + ny * off, sz + nz * off);
      const shade = (0.55 + 0.45 * Math.sqrt(v)) * (1 - 0.18 * (1 - u * u) * (1 - v));
      col.push(shade, shade, shade);
    }
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 꽃잎을 둥글게 한 바퀴 (y0 높이, r0 반경, 바깥을 향해) */
function petalRing(petal, count, r0, y0, rot0 = 0, down = false) {
  const geos = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < count; k++) {
    const a = rot0 + (k / count) * Math.PI * 2;
    e.set(0, a, down ? Math.PI : 0, 'YXZ'); // 엎은 꽃잎: z 축으로 뒤집어야 바깥을 향한 채 아래로 자란다
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.sin(a) * r0, y0, Math.cos(a) * r0), q, new THREE.Vector3(1, 1, 1));
    geos.push(petal.clone().applyMatrix4(m));
  }
  return mergeAll(geos);
}

function mergeAll(geos) {
  // BufferGeometryUtils 없이 같은 속성끼리 이어 붙이기
  let nv = 0, ni = 0;
  for (const g of geos) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const names = Object.keys(geos[0].attributes);
  const out = new THREE.BufferGeometry();
  const arrs = {};
  for (const n of names) arrs[n] = new Float32Array(nv * geos[0].attributes[n].itemSize);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    for (const n of names) arrs[n].set(g.attributes[n].array, vo * g.attributes[n].itemSize);
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrs[n], geos[0].attributes[n].itemSize));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export const PED_H = 0.6;

function pedestalTexture() {
  // 하대·중대 옆면: 붉은 옻칠 바탕에 금테 안상(眼象) 한 칸 (팔각 한 면)
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6e1d12';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#c9963f';
  x.fillRect(0, 0, 256, 10);
  x.fillRect(0, 118, 256, 10);
  x.fillRect(0, 0, 8, 128);
  x.fillRect(248, 0, 8, 128);
  // 안상: 위가 꽃잎처럼 오목하게 파인 창
  x.beginPath();
  x.moveTo(40, 104);
  x.lineTo(40, 58);
  x.quadraticCurveTo(40, 34, 70, 36);
  x.quadraticCurveTo(92, 22, 110, 34);
  x.quadraticCurveTo(128, 14, 146, 34);
  x.quadraticCurveTo(164, 22, 186, 36);
  x.quadraticCurveTo(216, 34, 216, 58);
  x.lineTo(216, 104);
  x.closePath();
  x.lineWidth = 7;
  x.strokeStyle = '#d9a94c';
  x.stroke();
  x.fillStyle = '#2d1510';
  x.fill();
  // 안상 안의 구름 무늬
  x.strokeStyle = '#a8742f';
  x.lineWidth = 3;
  for (const [cx, cy] of [[96, 76], [160, 76]]) {
    x.beginPath();
    x.arc(cx, cy, 14, Math.PI * 0.2, Math.PI * 1.8);
    x.stroke();
    x.beginPath();
    x.arc(cx + 10, cy - 4, 7, Math.PI, Math.PI * 2.4);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(8, 1);
  t.anisotropy = 4;
  return t;
}

function buildPedestal(mat, paintMat, plain) {
  const g = new THREE.Group();
  // 하대 (팔각)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.1, 8), paintMat);
  base.position.y = 0.05;
  g.add(base);
  const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.03, 8), plain);
  baseTop.position.y = 0.115;
  g.add(baseTop);
  // 복련 (아래로 엎은 꽃잎)
  const down = petalGeometry({ len: 0.2, wid: 0.13, flare: 1.35, cup: 0.25, tip: 0.2, ridgeH: 0.005, rimH: 0.003 });
  const fukuren = new THREE.Mesh(petalRing(down, 16, 0.58, 0.215, Math.PI / 16, true), mat);
  g.add(fukuren);
  // 중대
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.12, 8), paintMat);
  mid.position.y = 0.25;
  g.add(mid);
  for (const [y, r] of [[0.19, 0.55], [0.315, 0.54]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.018, 32), plain);
    band.position.y = y;
    g.add(band);
  }
  // 앙련 (세 겹으로 피어오른 꽃잎)
  const rows = [
    { len: 0.4, wid: 0.19, flare: 1.15, count: 16, r: 0.5, y: 0.31, rot: 0 },
    { len: 0.34, wid: 0.165, flare: 0.8, count: 16, r: 0.44, y: 0.34, rot: Math.PI / 16 },
    { len: 0.28, wid: 0.135, flare: 0.5, count: 16, r: 0.37, y: 0.37, rot: 0 }
  ];
  for (const r of rows) {
    const p = petalGeometry({ len: r.len, wid: r.wid, flare: r.flare, cup: 0.32, tip: 0.35, ridgeH: 0.008, rimH: 0.005 });
    g.add(new THREE.Mesh(petalRing(p, r.count, r.r, r.y, r.rot), mat));
  }
  // 윗판 (연밥)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.56, 0.07, 48), plain);
  top.position.y = PED_H - 0.035;
  g.add(top);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/* ───────────── 광배 ───────────── */
/**
 * 본존: 배 모양 거신광 (두광·신광·불꽃 테·화불). 보살: 둥근 두광.
 * 색·높이·금속 마스크를 같은 붓질로 세 장에 그리고, 높이는 노멀맵으로 바꾼다.
 */
function haloTextures(kind) {
  const W = kind === 'buddha' ? 1024 : 512;
  const H = kind === 'buddha' ? 1480 : 512;
  const layers = ['color', 'height', 'mr'].map(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  });
  const [cc, hc, mc] = layers.map((c) => c.getContext('2d'));
  const R = (s) => {
    let v = s >>> 0;
    return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  // 붓질 하나를 세 장에 함께: col 색, h 높이(0~1), metal 금속 여부
  const paint = (fn, col, h, metal) => {
    for (const [ctx, fill] of [[cc, col], [hc, `rgb(${h * 255 | 0},${h * 255 | 0},${h * 255 | 0})`], [mc, metal ? 'rgb(0,90,255)' : 'rgb(0,200,0)']]) {
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      fn(ctx);
    }
  };
  const ring = (cx, cy, r0, r1) => (x) => {
    x.beginPath();
    x.arc(cx, cy, r1, 0, Math.PI * 2);
    x.arc(cx, cy, r0, 0, Math.PI * 2, true);
    x.fill();
  };
  const disc = (cx, cy, r, sx = 1) => (x) => {
    x.beginPath();
    x.ellipse(cx, cy, r * sx, r, 0, 0, Math.PI * 2);
    x.fill();
  };
  // 불꽃 테: 바깥 윤곽을 따라 S 자 불꽃
  const flames = (pts, n, len, w, rnd) => (x) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = Math.floor(t * (pts.length - 1));
      const f = t * (pts.length - 1) - k;
      const p0 = pts[k], p1 = pts[Math.min(k + 1, pts.length - 1)];
      const px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f;
      const nx = p0[2] + (p1[2] - p0[2]) * f, ny = p0[3] + (p1[3] - p0[3]) * f;
      const L = len * (0.75 + rnd() * 0.5);
      const tx = -ny, ty = nx; // 접선
      x.beginPath();
      x.moveTo(px - tx * w, py - ty * w);
      x.bezierCurveTo(px + nx * L * 0.4 - tx * w * 1.4, py + ny * L * 0.4 - ty * w * 1.4, px + nx * L * 0.7 + tx * w * 0.8, py + ny * L * 0.7 + ty * w * 0.8, px + nx * L + tx * w * 1.6 - ny * 0, py + ny * L + ty * w * 1.6);
      x.bezierCurveTo(px + nx * L * 0.6 + tx * w * 0.6, py + ny * L * 0.6 + ty * w * 0.6, px + nx * L * 0.3 + tx * w * 1.6, py + ny * L * 0.3 + ty * w * 1.6, px + tx * w, py + ty * w);
      x.fill();
    }
  };
  const rnd = R(kind === 'buddha' ? 11 : 23);
  // 윤곽 (점, 바깥 법선)
  const outline = [];
  let headC, headR;
  if (kind === 'buddha') {
    // 배 모양: 아래 넓고 위로 뾰족 (뾰족한 꼭대기 = 보주형)
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const s = Math.sin(a), c = Math.cos(a);
      const top = c > 0 ? Math.pow(c, 1.0) : 0;
      const y = H * 0.56 - c * H * 0.43 - top * top * H * 0.06;
      const x = W / 2 + s * W * 0.42 * (1 - 0.28 * top * top) * (c < 0 ? 1 - 0.1 * c * c : 1);
      outline.push([x, y]);
    }
    for (let i = 0; i < outline.length; i++) {
      const p = outline[(i + 1) % outline.length], q = outline[(i - 1 + outline.length) % outline.length];
      const tx = p[0] - q[0], ty = p[1] - q[1], l = Math.hypot(tx, ty) || 1;
      outline[i].push(ty / l, -tx / l);
    }
    headC = [W / 2, H * 0.4];
    headR = W * 0.27;
  } else {
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * Math.PI * 2;
      outline.push([W / 2 + Math.cos(a) * W * 0.4, H / 2 + Math.sin(a) * H * 0.4, Math.cos(a), Math.sin(a)]);
    }
    headC = [W / 2, H / 2];
    headR = W * 0.3;
  }
  const shape = (x) => {
    x.beginPath();
    outline.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    x.fill();
  };
  // 바탕
  paint(flames(outline, kind === 'buddha' ? 46 : 26, W * (kind === 'buddha' ? 0.07 : 0.09), W * 0.024, rnd), '#d29a3f', 0.75, true);
  paint(shape, '#b9862f', 0.55, true);
  // 불꽃 테 안쪽 띠 (녹청에 금 불꽃)
  const inner = outline.map(([px, py, nx, ny]) => [px - nx * W * 0.06, py - ny * W * 0.06, nx, ny]);
  const innerShape = (x) => {
    x.beginPath();
    inner.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    x.fill();
  };
  paint(innerShape, '#1f4a3c', 0.35, false);
  paint(flames(inner.map(([px, py, nx, ny]) => [px - nx * W * 0.045, py - ny * W * 0.045, nx, ny]), kind === 'buddha' ? 60 : 30, W * 0.05, W * 0.014, rnd), '#d8a447', 0.62, true);
  const field = inner.map(([px, py, nx, ny]) => [px - nx * W * 0.055, py - ny * W * 0.055]);
  paint((x) => {
    x.beginPath();
    field.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    x.fill();
  }, '#7c2316', 0.3, false);
  if (kind === 'buddha') {
    // 신광 (몸을 두른 타원)
    const bc = [W / 2, H * 0.66];
    for (const [r, col, h, m] of [[0.37, '#c9963f', 0.6, true], [0.35, '#20453e', 0.32, false], [0.3, '#c9963f', 0.58, true], [0.285, '#8a2a18', 0.3, false]]) paint(disc(bc[0], bc[1], H * r * 0.82, 0.92 * (W / H) / 0.69), col, h, m);
    // 신광 안 빛살
    paint((x) => {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        x.save();
        x.translate(bc[0], bc[1]);
        x.scale(1.0, 1.32);
        x.rotate(a);
        x.fillRect(W * 0.08, -1.5, W * 0.26, 3);
        x.restore();
      }
    }, '#d6a54a', 0.5, true);
    // 화불: 테두리 띠 위 작은 좌불
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = 0.1 + (i / (n - 1)) * 0.8;
      const p = inner[Math.floor(t * (inner.length - 1))];
      const px = p[0] - p[2] * W * 0.03, py = p[1] - p[3] * W * 0.03;
      const s = W * 0.022;
      paint(disc(px, py - s * 0.6, s * 1.25), '#2b5e4c', 0.35, false);
      paint((x) => {
        x.beginPath();
        x.ellipse(px, py + s * 0.35, s * 0.95, s * 0.55, 0, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.ellipse(px, py - s * 0.15, s * 0.55, s * 0.6, 0, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.arc(px, py - s * 0.95, s * 0.36, 0, Math.PI * 2);
        x.fill();
      }, '#e0b45a', 0.85, true);
    }
  }
  // 두광: 연꽃 중심·동심 띠
  const [hx, hy] = headC;
  for (const [r, col, h, m] of [[1.0, '#cf9b42', 0.62, true], [0.93, '#234f42', 0.3, false], [0.8, '#c9963f', 0.6, true], [0.76, '#8e2b19', 0.3, false], [0.56, '#c9963f', 0.58, true], [0.52, '#1d3f4a', 0.28, false]]) paint(disc(hx, hy, headR * r), col, h, m);
  // 띠 안의 당초(덩굴) 무늬 — 작은 고리
  paint((x) => {
    x.lineWidth = W * 0.006;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      x.beginPath();
      x.arc(hx + Math.cos(a) * headR * 0.865, hy + Math.sin(a) * headR * 0.865, headR * 0.04, a, a + Math.PI * 1.5);
      x.stroke();
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + 0.1;
      x.beginPath();
      x.arc(hx + Math.cos(a) * headR * 0.66, hy + Math.sin(a) * headR * 0.66, headR * 0.035, 0, Math.PI * 2);
      x.fill();
    }
  }, '#e3b65c', 0.75, true);
  // 가운데 연꽃
  paint((x) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      x.save();
      x.translate(hx, hy);
      x.rotate(a);
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(headR * 0.18, headR * 0.25, 0, headR * 0.46);
      x.quadraticCurveTo(-headR * 0.18, headR * 0.25, 0, 0);
      x.fill();
      x.restore();
    }
  }, '#d9a84b', 0.7, true);
  const toTex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // 노멀맵
  const hd = hc.getImageData(0, 0, W, H).data;
  const nc = document.createElement('canvas');
  nc.width = W;
  nc.height = H;
  const nctx = nc.getContext('2d');
  const out = nctx.createImageData(W, H);
  const hv = (x, y) => hd[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (hv(x - 1, y) - hv(x + 1, y)) * 3, dy = (hv(x, y - 1) - hv(x, y + 1)) * 3;
      const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
      out.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  nctx.putImageData(out, 0, 0);
  return { color: toTex(layers[0], true), normal: toTex(nc, false), mr: toTex(layers[2], false), aspect: W / H };
}

function buildHalo(kind) {
  const t = haloTextures(kind);
  const w = kind === 'buddha' ? 1.85 : 0.9;
  const h = w / t.aspect;
  const front = new THREE.MeshStandardMaterial({ map: t.color, normalMap: t.normal, metalnessMap: t.mr, roughnessMap: t.mr, metalness: 1, roughness: 1, alphaTest: 0.5 });
  front.normalScale.set(1.2, 1.2);
  const back = new THREE.MeshStandardMaterial({ map: t.color, color: 0x2a1508, roughness: 0.9, alphaTest: 0.5 });
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const a = new THREE.Mesh(geo, front);
  const b = new THREE.Mesh(geo, back);
  b.position.z = -0.03;
  b.rotation.y = Math.PI;
  const edge = new THREE.Mesh(geo, back);
  edge.position.z = -0.015;
  g.add(a, b, edge);
  g.userData.size = [w, h];
  return g;
}

/* ───────────── 보관·영락·계주 ───────────── */
function crownGroup(gold, gems) {
  const g = new THREE.Group();
  const bandMat = gold.clone();
  bandMat.side = THREE.DoubleSide;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.162, 0.045, 48, 1, true), bandMat);
  band.scale.set(0.95, 1, 1.03);
  band.position.set(0, 1.56, -0.012);
  g.add(band);
  // 불꽃 모양 관판
  const plate = (h, w) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.bezierCurveTo(-w * 0.62, h * 0.4, -w * 0.25, h * 0.55, 0, h);
    s.bezierCurveTo(w * 0.25, h * 0.55, w * 0.62, h * 0.4, w / 2, 0);
    s.lineTo(-w / 2, 0);
    const hole = new THREE.Path();
    hole.absarc(0, h * 0.36, w * 0.16, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 10 });
  };
  const plates = [[0, 0.17, 0.11], [0.75, 0.12, 0.085], [-0.75, 0.12, 0.085], [1.45, 0.08, 0.06], [-1.45, 0.08, 0.06]];
  plates.forEach(([a, h, w], i) => {
    const m = new THREE.Mesh(plate(h, w), gold);
    m.position.set(Math.sin(a) * 0.162, 1.578, -0.012 + Math.cos(a) * 0.168);
    m.rotation.y = a;
    m.rotation.x = -0.12;
    g.add(m);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.013 + (i ? 0 : 0.005), 12, 8), gems[i % gems.length]);
    gem.position.set(Math.sin(a) * 0.172, 1.578 + h * 0.36 * Math.cos(0.12), -0.012 + Math.cos(a) * 0.178);
    g.add(gem);
  });
  // 관대: 귀 뒤로 어깨까지 흘러내린 리본
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.16, 1.56, -0.05), new THREE.Vector3(s * 0.2, 1.45, -0.09), new THREE.Vector3(s * 0.23, 1.28, -0.08), new THREE.Vector3(s * 0.27, 1.1, -0.04)]);
    const rib = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.009, 6, false), gold);
    rib.scale.set(1, 1, 1);
    g.add(rib);
  }
  return g;
}

function necklace(gold, gem, beads) {
  // 가슴 위 U 자 구슬 줄 + 가운데 드리개 (자리는 조각에서 잰 값)
  const g = new THREE.Group();
  const n = beads.length / 4 - 1;
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), gold, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = beads[i * 4 + 3];
    im.setMatrixAt(i, m.compose(v.set(beads[i * 4], beads[i * 4 + 1], beads[i * 4 + 2]), q, sc.set(r, r, r)));
  }
  g.add(im);
  const k = n * 4;
  const drop = new THREE.Mesh(new THREE.SphereGeometry(beads[k + 3], 14, 10), gem);
  drop.scale.set(1, 1.3, 0.7);
  drop.position.set(beads[k], beads[k + 1], beads[k + 2]);
  g.add(drop);
  return g;
}

/* ───────────── 조립 ───────────── */
let shared = null;
function sharedMats() {
  if (shared) return shared;
  const gold = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.46, envMapIntensity: 0.3 }); // 너무 매끈하면 촛불 하이라이트가 하얗게 번진다
  const hair = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.62 });
  const curl = new THREE.MeshStandardMaterial({ color: HAIR_HEX, metalness: 0.15, roughness: 0.55 });
  const plainGold = new THREE.MeshStandardMaterial({ color: 0xd9a94f, metalness: 1, roughness: 0.32, envMapIntensity: 0.25 });
  const petalGold = new THREE.MeshStandardMaterial({ color: 0xe6b862, metalness: 1, roughness: 0.34, vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 0.25 });
  const paint = new THREE.MeshStandardMaterial({ map: pedestalTexture(), roughness: 0.6, metalness: 0.15 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.22, metalness: 0.1, emissive: 0x3a0604, emissiveIntensity: 0.6 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2c5aa0, roughness: 0.22, metalness: 0.1 });
  const green = new THREE.MeshStandardMaterial({ color: 0x2f8a64, roughness: 0.22, metalness: 0.1 });
  shared = { gold, hair, curl, plainGold, petalGold, paint, red, blue, green };
  return shared;
}

/** 조각은 무거우니(1~2초) 워커에서. 워커를 못 쓰면 메인 스레드에서 한다. 같은 종류는 한 번만 */
const jobs = new Map();
function sculptAsync(kind, quality) {
  const key = `${kind}|${quality}`;
  if (!jobs.has(key)) {
    jobs.set(
      key,
      new Promise((resolve) => {
        const local = () => resolve(sculptData(kind, quality));
        let w;
        try {
          w = new Worker(new URL('./buddhaWorker.js', import.meta.url), { type: 'module' });
        } catch {
          return local();
        }
        w.onmessage = (e) => {
          w.terminate();
          resolve(e.data);
        };
        w.onerror = (e) => {
          console.warn('[buddha] 워커 실패 — 메인 스레드에서 조각', e.message);
          w.terminate();
          local();
        };
        w.postMessage({ kind, quality });
      }).then(toGeometries)
    );
  }
  return jobs.get(key);
}

function geo(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  if (m.groups) {
    g.addGroup(0, m.groups[0], 0);
    g.addGroup(m.groups[0], m.groups[1], 1);
  }
  g.computeBoundingSphere();
  return g;
}

function toGeometries(d) {
  const n = d.curls.length / 7;
  const curls = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), nrm = new THREE.Vector3(), p = new THREE.Vector3();
  const r = 0.0108, sc = new THREE.Vector3(r, r, r);
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    p.set(d.curls[o], d.curls[o + 1], d.curls[o + 2]);
    nrm.set(d.curls[o + 3], d.curls[o + 4], d.curls[o + 5]);
    q.setFromUnitVectors(up, nrm).multiply(qz.setFromAxisAngle(up, d.curls[o + 6]));
    curls.push(new THREE.Matrix4().compose(p, q, sc));
  }
  return { head: geo(d.head), body: geo(d.body), hands: d.hands.map(geo), curls, beads: d.beads, jewelZ: d.jewelZ };
}

/**
 * @param kind 'buddha' 본존 | 'bodhisattva' 협시보살
 * @returns THREE.Group — 원점 = 수미단 윗면(좌대 밑) 중심. 좌대·광배는 바로, 몸은 조각이 끝나면 들어온다.
 *          userData.ready = 몸까지 들어오면 풀리는 Promise
 */
export function buildBuddhaStatue(kind = 'buddha', { quality = 'high' } = {}) {
  const M = sharedMats();
  const g = new THREE.Group();
  g.add(buildPedestal(M.petalGold, M.paint, M.plainGold));
  const fig = new THREE.Group();
  fig.position.y = PED_H;
  g.add(fig);
  // 광배
  const halo = buildHalo(kind);
  if (kind === 'buddha') halo.position.set(0, PED_H * 0.55 + halo.userData.size[1] / 2, -0.44);
  else halo.position.set(0, PED_H + 1.47, -0.3);
  g.add(halo);
  // 머리는 목 아래를 중심으로 살짝 숙인다
  const headPivot = new THREE.Group();
  headPivot.position.set(HEAD_PIVOT[0], HEAD_PIVOT[1] - 0.025, HEAD_PIVOT[2]);
  headPivot.rotation.x = HEAD_TILT;
  headPivot.scale.setScalar(HEAD_SCALE);
  fig.add(headPivot);
  const headRoot = new THREE.Group();
  headRoot.position.set(-HEAD_PIVOT[0], -HEAD_PIVOT[1], -HEAD_PIVOT[2]);
  headPivot.add(headRoot);
  if (kind !== 'buddha') headRoot.add(crownGroup(M.plainGold, [M.red, M.blue, M.green]));
  const noBatch = (root) =>
    root.traverse((o) => {
      if (o.isMesh) o.userData.noBatch = true; // templeScene batchStatic 이 합치지 않게 (조각 메쉬는 크다)
    });
  noBatch(g);
  g.userData.ready = sculptAsync(kind, quality).then((s) => {
    const body = new THREE.Mesh(s.body, M.gold);
    body.castShadow = true;
    fig.add(body);
    s.hands.forEach((hg) => fig.add(new THREE.Mesh(hg, M.gold)));
    headRoot.add(new THREE.Mesh(s.head, [M.gold, M.hair]));
    if (kind === 'buddha') {
      const im = new THREE.InstancedMesh(curlGeometry(), M.curl, s.curls.length);
      s.curls.forEach((m, i) => im.setMatrixAt(i, m));
      headRoot.add(im);
      // 중간계주(이마 위 반달 보주)와 정상계주
      const mid = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.red);
      mid.scale.set(0.026, 0.022, 0.02);
      mid.position.set(0, 1.585, s.jewelZ + 0.006);
      mid.rotation.x = Math.PI / 2 - 0.45;
      headRoot.add(mid);
      const topJewel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.034, 16), M.red);
      topJewel.position.set(0, 1.735, -0.03);
      headRoot.add(topJewel);
      const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 20), M.plainGold);
      topRing.rotation.x = Math.PI / 2;
      topRing.position.set(0, 1.72, -0.03);
      headRoot.add(topRing);
      // 백호 수정
      const urna = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.05, metalness: 0.2, emissive: 0x6b5a30, emissiveIntensity: 0.5 }));
      urna.position.set(0, 1.494, 0.168);
      headRoot.add(urna);
    } else fig.add(necklace(M.plainGold, M.red, s.beads));
    noBatch(g);
    return g;
  });
  return g;
}
