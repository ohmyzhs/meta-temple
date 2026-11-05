/**
 * 대웅전 삼존 조각 — 순수 계산만 (THREE 없음: 워커에서 돈다). 조립은 buddha.js.
 *
 * 조각하듯 빚는다: 부위마다 부호거리함수(SDF)를 매끈하게 이어 붙이고(smin), 홈은 깎아 내고(smax),
 * 가사 주름은 표면을 살짝 밀어 올린다. 그 함수를 격자에서 재어 surface nets 로 메쉬를 뽑는다.
 *  - 머리·손은 촘촘한 격자(머리 4.2mm, 손 3.8mm), 몸·가사는 성긴 격자(12mm)로 따로 뽑아 겹친다. 보살은 ×1.25.
 *  - 거친 격자(4칸)로 먼저 재고 표면 가까운 블록만 촘촘히 계산한다.
 *  - 법선은 함수의 기울기, 주름 사이 그늘(AO)은 법선 방향으로 다섯 번 재어 꼭짓점 색에 굽는다
 *    (틈은 어둡고 붉은 옻칠빛, 나머지는 개금한 금빛).
 * 좌표: 원점 = 좌대 윗면 중심, +y 위, +z 정면(참배객 쪽), +x = 불상의 왼쪽.
 */
/* ───────────── SDF 기본 도형 ───────────── */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function sph(x, y, z, cx, cy, cz, r) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}
/** 타원체 (iq 근사) */
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
/** 반지름이 r1 → r2 로 변하는 캡슐 */
function cap(x, y, z, ax, ay, az, bx, by, bz, r1, r2 = r1) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp01((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}
/** y 축 둘레 고리 */
function torusY(x, y, z, cx, cy, cz, R, r) {
  const q = Math.hypot(x - cx, z - cz) - R;
  return Math.hypot(q, y - cy) - r;
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}
/** 꺾은선 관 (pts = [x,y,z, x,y,z, ...]). 둘레 상자 밖이면 상자까지 거리만 (하한값이라 안전) */
function tube(x, y, z, pts, r) {
  const bb = pts.bb || (pts.bb = boundsOf(pts));
  const ox = Math.max(bb[0] - x, x - bb[3], 0), oy = Math.max(bb[1] - y, y - bb[4], 0), oz = Math.max(bb[2] - z, z - bb[5], 0);
  const out = Math.sqrt(ox * ox + oy * oy + oz * oz) - r;
  if (out > 0.02) return out;
  let d = 1e9;
  for (let i = 0; i + 5 < pts.length; i += 3) {
    const v = cap(x, y, z, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5], r);
    if (v < d) d = v;
  }
  return d;
}
function boundsOf(p) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    b[k] = Math.min(b[k], p[i + k]);
    b[k + 3] = Math.max(b[k + 3], p[i + k]);
  }
  return b;
}
/** 제어점 → 매끈한 꺾은선 (Catmull-Rom) */
function spline(ctrl, per = 6) {
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      for (let c = 0; c < 3; c++) out.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
    }
  }
  out.push(...ctrl[ctrl.length - 1]);
  return out;
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** 주름 능선: 넓은 골, 좁은 등 */
const ridge = (t) => {
  const s = 0.5 + 0.5 * Math.sin(t);
  return s * s * s;
};

/* ───────────── surface nets 메셔 ───────────── */
/**
 * @param sdf (x,y,z) → 거리
 * @param b [x0,y0,z0,x1,y1,z1]
 * @param cell 격자 간격(m)
 * @returns { pos: Float32Array, nrm: Float32Array, idx: Uint32Array }
 */
function surfaceNets(sdf, b, cell) {
  const nx = Math.ceil((b[3] - b[0]) / cell) + 1, ny = Math.ceil((b[4] - b[1]) / cell) + 1, nz = Math.ceil((b[5] - b[2]) / cell) + 1;
  const sy = nx, sz = nx * ny;
  const f = new Float32Array(nx * ny * nz);
  const done = new Uint8Array(nx * ny * nz);
  // 1) 거친 격자
  const B = 4;
  const cx = Math.ceil((nx - 1) / B) + 1, cy = Math.ceil((ny - 1) / B) + 1, cz = Math.ceil((nz - 1) / B) + 1;
  const C = new Float32Array(cx * cy * cz);
  const gi = (i, n) => Math.min(i * B, n - 1);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) C[i + cx * (j + cy * k)] = sdf(b[0] + gi(i, nx) * cell, b[1] + gi(j, ny) * cell, b[2] + gi(k, nz) * cell);
  // 2) 표면 근처 블록만 촘촘히 (블록 대각선 ≈ 1.73·B·cell 보다 멀면 부호가 같다)
  const thr = B * cell * 1.8 + 0.004;
  const far = [];
  for (let bk = 0; bk < cz - 1; bk++)
    for (let bj = 0; bj < cy - 1; bj++)
      for (let bi = 0; bi < cx - 1; bi++) {
        let mn = 1e9;
        for (let c = 0; c < 8; c++) {
          const v = Math.abs(C[bi + (c & 1) + cx * (bj + ((c >> 1) & 1) + cy * (bk + (c >> 2)))]);
          if (v < mn) mn = v;
        }
        const i0 = bi * B, j0 = bj * B, k0 = bk * B;
        const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
        if (mn < thr) {
          for (let k = k0; k <= k1; k++)
            for (let j = j0; j <= j1; j++)
              for (let i = i0; i <= i1; i++) {
                const id = i + sy * j + sz * k;
                if (done[id] === 1) continue;
                f[id] = sdf(b[0] + i * cell, b[1] + j * cell, b[2] + k * cell);
                done[id] = 1;
              }
        } else far.push(i0, j0, k0, i1, j1, k1, C[bi + cx * (bj + cy * bk)]);
      }
  for (let q = 0; q < far.length; q += 7) {
    const v = far[q + 6];
    for (let k = far[q + 2]; k <= far[q + 5]; k++)
      for (let j = far[q + 1]; j <= far[q + 4]; j++)
        for (let i = far[q]; i <= far[q + 3]; i++) {
          const id = i + sy * j + sz * k;
          if (done[id] === 0) {
            f[id] = v;
            done[id] = 2;
          }
        }
  }
  // 3) 부호가 바뀌는 칸마다 꼭짓점 하나 (모서리 교점의 평균)
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const base = i + sy * j + sz * k;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = f[base + (c & 1) + sy * ((c >> 1) & 1) + sz * (c >> 2)];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e], c2 = EDGES[e + 1];
          const va = corner[a], vb = corner[c2];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          px += (a & 1) + ((c2 & 1) - (a & 1)) * t;
          py += ((a >> 1) & 1) + (((c2 >> 1) & 1) - ((a >> 1) & 1)) * t;
          pz += (a >> 2) + ((c2 >> 2) - (a >> 2)) * t;
          n++;
        }
        vid[base] = pos.length / 3;
        pos.push(b[0] + (i + px / n) * cell, b[1] + (j + py / n) * cell, b[2] + (k + pz / n) * cell);
      }
  // 4) 부호가 바뀌는 격자 모서리마다 사각형 하나 (둘레 네 칸의 꼭짓점)
  const idx = [];
  const quad = (a, b2, c, d, flip) => {
    if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b2);
    else idx.push(a, b2, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const id = i + sy * j + sz * k;
        const v0 = f[id] < 0;
        // x 모서리: (y,z) 평면의 네 칸
        if (v0 !== f[id + 1] < 0) quad(vid[id - sy - sz], vid[id - sz], vid[id], vid[id - sy], !v0);
        // y 모서리: (z,x)
        if (v0 !== f[id + sy] < 0) quad(vid[id - sz - 1], vid[id - 1], vid[id], vid[id - sz], !v0);
        // z 모서리: (x,y)
        if (v0 !== f[id + sz] < 0) quad(vid[id - 1 - sy], vid[id - sy], vid[id], vid[id - 1], !v0);
      }
  // 5) 기울기 법선 + 표면으로 한 번 끌어당기기
  const P = new Float32Array(pos);
  const N = new Float32Array(P.length);
  const e = cell * 0.5;
  for (let v = 0; v < P.length; v += 3) {
    const x = P[v], y = P[v + 1], z = P[v + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    const d = sdf(x, y, z);
    if (Math.abs(d) < cell) {
      P[v] = x - gx * d;
      P[v + 1] = y - gy * d;
      P[v + 2] = z - gz * d;
    }
    N[v] = gx;
    N[v + 1] = gy;
    N[v + 2] = gz;
  }
  return { pos: P, nrm: N, idx: new Uint32Array(idx) };
}

/** 법선 방향으로 다섯 번 재어 가려짐 정도 (0 = 깊은 틈, 1 = 트인 면) */
function bakeAO(P, N, sdf, scale = 1) {
  const H = [0.006, 0.016, 0.034, 0.06, 0.1].map((h) => h * scale);
  const ao = new Float32Array(P.length / 3);
  for (let v = 0, q = 0; v < P.length; v += 3, q++) {
    let occ = 0, w = 1;
    for (const h of H) {
      const d = sdf(P[v] + N[v] * h, P[v + 1] + N[v + 1] * h, P[v + 2] + N[v + 2] * h);
      occ += (w * Math.max(0, h - d)) / h;
      w *= 0.6;
    }
    ao[q] = clamp01(1 - occ * 0.75);
  }
  return ao;
}

/* ───────────── 색 ───────────── */
// sRGB 16진 → 선형 (꼭짓점 색은 선형으로 넣는다)
const lin = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
};
const C_GOLD = lin('#e9b95f');
const C_GOLD_HI = lin('#f6d38a');
const C_LACQUER = lin('#4a2110');
export const HAIR_HEX = '#22355a'; // 군청 (조금 밝혀 금빛 얼굴과의 대비를 누그러뜨림)
const C_HAIR = lin(HAIR_HEX);
const C_LIP = lin('#b8543a');
const _c = [0, 0, 0];
const mixInto = (o, a, b, t) => {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
};
const scaleInto = (o, k) => {
  o[0] *= k;
  o[1] *= k;
  o[2] *= k;
  return o;
};
function goldAt(ao, x, y, z) {
  // 금박 이음새처럼 아주 옅은 얼룩
  const n = 0.5 + 0.5 * Math.sin(x * 37 + Math.sin(y * 23) * 2) * Math.sin(z * 29 + y * 11);
  mixInto(_c, C_LACQUER, C_GOLD, smooth(0.18, 0.8, ao));
  mixInto(_c, _c, C_GOLD_HI, smooth(0.9, 1.0, ao) * 0.35 * n);
  return scaleInto(_c, 0.32 + 0.68 * ao);
}

/** 메쉬 결과 → 배열 (꼭짓점 색, 부위별 삼각형 묶음 groups=[첫 묶음 개수, 둘째 묶음 개수]) */
function toArrays(m, colorFn, groupFn) {
  const col = new Float32Array(m.pos.length);
  for (let v = 0, q = 0; v < m.pos.length; v += 3, q++) {
    const c = colorFn(q, m.pos[v], m.pos[v + 1], m.pos[v + 2]);
    col[v] = c[0];
    col[v + 1] = c[1];
    col[v + 2] = c[2];
  }
  let idx = m.idx, groups = null;
  if (groupFn) {
    const lists = [[], []];
    const I = m.idx, P = m.pos;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b2 = I[t + 1] * 3, c = I[t + 2] * 3;
      const k = groupFn((P[a] + P[b2] + P[c]) / 3, (P[a + 1] + P[b2 + 1] + P[c + 1]) / 3, (P[a + 2] + P[b2 + 2] + P[c + 2]) / 3);
      lists[k].push(I[t], I[t + 1], I[t + 2]);
    }
    idx = new Uint32Array(lists[0].length + lists[1].length);
    idx.set(lists[0]);
    idx.set(lists[1], lists[0].length);
    groups = [lists[0].length, lists[1].length];
  }
  return { pos: m.pos, nrm: m.nrm, col, idx, groups };
}

/* ───────────── 머리 ───────────── */
// 얼굴 선 (x ≥ 0 쪽, 좌우 대칭으로 쓴다)
const BROW = spline([[0.006, 1.468, 0.16], [0.036, 1.487, 0.157], [0.069, 1.487, 0.144], [0.101, 1.469, 0.116]]);
const EYE = spline([[0.019, 1.437, 0.158], [0.05, 1.4325, 0.1645], [0.074, 1.435, 0.158], [0.094, 1.443, 0.137]]);
const MOUTH = spline([[0, 1.3385, 0.1705], [0.018, 1.3395, 0.1665], [0.034, 1.3425, 0.155]]);
export const HEAD_TILT = 0.1; // 고개를 살짝 숙여 참배객을 내려다본다 (rad)
export const HEAD_PIVOT = [0, 1.25, 0];
export const HEAD_SCALE = 1.07; // 어깨에 비해 머리를 조금 크게 (한국 불상 비례)

function skull(x, y, z) {
  return ell(x, y, z, 0, 1.455, -0.015, 0.15, 0.18, 0.165);
}

function headSDF(bodhi) {
  return (x, y, z) => {
    const X = Math.abs(x);
    let d = skull(x, y, z);
    d = smin(d, ell(x, y, z, 0, 1.383, 0.035, 0.13, 0.155, 0.135), 0.06);
    d = smin(d, ell(X, y, z, 0.072, 1.362, 0.084, 0.06, 0.062, 0.062), 0.05); // 풍만한 뺨
    d = smin(d, ell(x, y, z, 0, 1.296, 0.068, 0.08, 0.053, 0.066), 0.06); // 둥근 턱
    d = smin(d, sph(x, y, z, 0, 1.278, 0.118, 0.031), 0.045);
    d = smin(d, ell(x, y, z, 0, 1.505, 0.08, 0.104, 0.07, 0.092), 0.05); // 이마
    // 눈두덩 → 내려 뜬 눈꺼풀
    d = smax(d, -ell(X, y, z, 0.054, 1.449, 0.175, 0.044, 0.02, 0.03), 0.02);
    d = smin(d, ell(X, y, z, 0.054, 1.443, 0.15, 0.042, 0.016, 0.02), 0.012);
    // 콧마루로 이어지는 활 모양 눈썹 능선
    d = smin(d, tube(X, y, z, BROW, 0.0095), 0.018);
    // 코
    d = smin(d, cap(x, y, z, 0, 1.468, 0.153, 0, 1.392, 0.18, 0.012, 0.016), 0.022);
    d = smin(d, sph(x, y, z, 0, 1.389, 0.177, 0.019), 0.012);
    d = smin(d, sph(X, y, z, 0.018, 1.384, 0.165, 0.0125), 0.01);
    d = smax(d, -sph(X, y, z, 0.0105, 1.377, 0.172, 0.0045), 0.004);
    // 입술과 옅은 미소
    d = smin(d, ell(x, y, z, 0, 1.347, 0.153, 0.034, 0.01, 0.016), 0.008);
    d = smin(d, ell(x, y, z, 0, 1.33, 0.15, 0.027, 0.0115, 0.015), 0.008);
    d = smax(d, -tube(X, y, z, MOUTH, 0.0026), 0.004);
    // 눈선
    d = smax(d, -tube(X, y, z, EYE, 0.0034), 0.005);
    // 백호
    if (!bodhi) d = smin(d, sph(x, y, z, 0, 1.494, 0.159, 0.0075), 0.004);
    // 길게 늘어진 귀, 뚫린 귓불
    d = smin(d, ell(X, y, z, 0.146, 1.43, 0.0, 0.024, 0.074, 0.042), 0.03);
    d = smin(d, cap(X, y, z, 0.152, 1.38, 0.006, 0.161, 1.268, 0.018, 0.015, 0.021), 0.024);
    d = smax(d, -cap(X, y, z, 0.168, 1.322, 0.018, 0.168, 1.284, 0.021, 0.0055), 0.005);
    d = smax(d, -ell(X, y, z, 0.168, 1.44, 0.01, 0.011, 0.048, 0.024), 0.01);
    // 목과 삼도
    let n = cap(x, y, z, 0, 1.02, -0.02, 0, 1.3, -0.01, 0.086);
    n = smax(n, -torusY(x, y, z, 0, 1.17, -0.012, 0.092, 0.0042), 0.004);
    n = smax(n, -torusY(x, y, z, 0, 1.208, -0.012, 0.091, 0.0038), 0.004);
    d = smin(d, n, 0.05);
    if (!bodhi) {
      d = smin(d, ell(x, y, z, 0, 1.638, -0.03, 0.105, 0.085, 0.105), 0.045); // 육계
    } else {
      d = smin(d, ell(x, y, z, 0, 1.69, -0.035, 0.068, 0.115, 0.068), 0.05); // 높은 보계
      d = smin(d, torusY(x, y, z, 0, 1.64, -0.035, 0.066, 0.012), 0.01);
      // 어깨로 흘러내리는 머리채
      d = smin(d, cap(X, y, z, 0.128, 1.42, -0.075, 0.2, 1.13, -0.07, 0.022, 0.017), 0.03);
      // 빗어 넘긴 머리결
      if (y > 1.46 && skull(x, y, z) > -0.02) {
        const a = Math.atan2(x, z);
        d -= 0.0016 * (0.5 + 0.5 * Math.sin(a * 46 + y * 30)) * smooth(1.48, 1.52, y);
      }
    }
    return d;
  };
}

/** 머리카락 자리: 이마선 위, 두개골 위 (귀·보발 제외는 거리로 가린다) */
function hairline(x, y, z) {
  const th = Math.abs(Math.atan2(x, z));
  return 1.534 - 0.056 * smooth(0.5, 1.45, th) - 0.2 * smooth(1.75, 2.7, th);
}
/** 머리카락 정도 0~1: 이마선에서 1cm 남짓 걸쳐 금빛 살결이 군청 머리로 넘어간다 (칼같은 경계는 가면처럼 보인다) */
function hairWeight(bodhi) {
  return (x, y, z) => {
    if (bodhi && Math.abs(x) > 0.11 && y < 1.43 && y > 1.12 && z < -0.03) return 1; // 어깨로 내린 머리채
    if ((!bodhi && y > 1.58) || (bodhi && y > 1.6)) return 1; // 육계·보계
    if (skull(x, y, z) > 0.008) return 0; // 귀·얼굴은 두개골 밖
    const hl = hairline(x, y, z);
    return smooth(hl - 0.004, hl + 0.009, y);
  };
}
function isHair(bodhi) {
  return (x, y, z) => {
    if (y < hairline(x, y, z)) {
      // 보살은 어깨로 내린 머리채도 머리카락
      if (bodhi && Math.abs(x) > 0.11 && y < 1.43 && y > 1.12 && z < -0.03) return true;
      return false;
    }
    if (!bodhi && y > 1.58) return true; // 육계
    if (bodhi && y > 1.6) return true; // 보계
    return skull(x, y, z) < 0.008;
  };
}

/* ───────────── 몸·가사 ───────────── */
/** 앉은 자세는 같고 팔뚝·손 위치만 다르다 */
const POSE = {
  buddha: {
    // [팔꿈치 → 손목, 반지름]
    forearms: [
      [-0.425, 0.66, 0.03, -0.55, 0.405, 0.37, 0.084, 0.06],
      [0.425, 0.66, 0.03, 0.215, 0.408, 0.265, 0.084, 0.06]
    ],
    // 팔뚝 아래로 늘어진 소맷자락
    sleeves: [
      [-0.49, 0.5, 0.2, 0.065, 0.105, 0.14],
      [0.35, 0.49, 0.18, 0.075, 0.085, 0.115]
    ]
  },
  bodhi: {
    forearms: [
      [-0.425, 0.66, 0.03, -0.021, 0.77, 0.245, 0.082, 0.056],
      [0.425, 0.66, 0.03, 0.021, 0.77, 0.245, 0.082, 0.056]
    ],
    sleeves: [
      [-0.3, 0.6, 0.14, 0.05, 0.075, 0.075],
      [0.3, 0.6, 0.14, 0.05, 0.075, 0.075]
    ]
  }
};

/** 가사 밑의 몸 (주름·옷단 없이) — 옷단 자리를 표면 위에 얹을 때 쓴다 */
function torsoBase(x, y, z) {
  const X = Math.abs(x);
  let d = ell(x, y, z, 0, 0.9, -0.03, 0.3, 0.27, 0.19);
  d = smin(d, ell(X, y, z, 0.3, 0.995, -0.035, 0.11, 0.1, 0.11), 0.12);
  d = smin(d, ell(x, y, z, 0, 0.94, -0.11, 0.3, 0.24, 0.15), 0.1);
  d = smin(d, ell(x, y, z, 0, 0.64, 0.0, 0.28, 0.27, 0.2), 0.12);
  d = smin(d, ell(x, y, z, 0, 0.4, -0.05, 0.4, 0.22, 0.27), 0.12);
  return smin(d, cap(x, y, z, 0, 1.0, -0.03, 0, 1.13, -0.02, 0.08), 0.05);
}

/** 정면에서 들어가며 표면 z 찾기 */
function frontZ(fn, x, y, z0 = 0.7, z1 = -0.3) {
  let a = z0, b = z1;
  if (fn(x, y, a) < 0) return a;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (fn(x, y, m) < 0) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

function bodySDF(kind) {
  const pose = POSE[kind === 'buddha' ? 'buddha' : 'bodhi'];
  // 통견 목깃: 양 어깨에서 내려와 가슴 아래에서 만나는 U 자 옷단 (x ≥ 0 쪽)
  const hemCtrl = [[0.1, 1.11], [0.135, 1.04], [0.15, 0.95], [0.135, 0.85], [0.1, 0.74], [0.045, 0.655], [0.0, 0.63]];
  const HEM = spline(hemCtrl.map(([x, y]) => [x, y, frontZ(torsoBase, x, y) + 0.004]), 8);
  // 승각기 윗단 띠
  const BAND = spline([[0, 0.8], [0.06, 0.805], [0.115, 0.815]].map(([x, y]) => [x, y, frontZ(torsoBase, x, y) + 0.002]), 6);
  const knotZ = frontZ(torsoBase, 0, 0.785);
  // U 안쪽 반폭 (높이별)
  const uHalf = (y) => {
    if (y < 0.63 || y > 1.13) return 0;
    for (let i = 0; i < hemCtrl.length - 1; i++) {
      const [x0, y0] = hemCtrl[i], [x1, y1] = hemCtrl[i + 1];
      if (y <= y0 && y >= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  const SOLE = kind === 'buddha';
  return (x, y, z) => {
    const X = Math.abs(x);
    let d = torsoBase(x, y, z);
    // 팔
    for (const s of [-1, 1]) d = smin(d, cap(x, y, z, s * 0.33, 0.99, -0.035, s * 0.425, 0.66, 0.03, 0.078, 0.088), 0.07);
    for (const a of pose.forearms) d = smin(d, cap(x, y, z, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]), 0.05);
    for (const s of pose.sleeves) d = smin(d, ell(x, y, z, s[0], s[1], s[2], s[3], s[4], s[5]), 0.06);
    // 결가부좌
    d = smin(d, ell(x, y, z, 0, 0.17, 0.12, 0.74, 0.17, 0.4), 0.1);
    d = smin(d, ell(X, y, z, 0.64, 0.155, 0.33, 0.17, 0.15, 0.17), 0.09);
    d = smin(d, cap(x, y, z, -0.6, 0.2, 0.37, 0.3, 0.29, 0.44, 0.115, 0.095), 0.06); // 오른 정강이 (위)
    d = smin(d, cap(x, y, z, 0.6, 0.12, 0.37, -0.26, 0.13, 0.47, 0.11, 0.095), 0.06); // 왼 정강이 (아래)
    // 무릎 사이로 좌대 위에 흘러내린 천자락 (상현좌)
    d = smin(d, ell(x, y, z, 0, 0.035, 0.56, 0.3, 0.06, 0.12), 0.07);

    // 가사 두께: U 안(맨가슴·승각기)은 얇고 바깥은 한 겹 두껍다
    const uh = z > 0 ? uHalf(y) : 0;
    const robe = uh > 0 ? smooth(uh - 0.012, uh + 0.004, X) : 1;
    d -= 0.01 * robe + (1 - robe) * 0.004 * smooth(0.81, 0.795, y);

    // 옷주름
    let f = 0;
    const lap = smooth(0.4, 0.26, y) * smooth(0.12, 0.32, z) * (1 - smooth(0.42, 0.62, X));
    if (lap > 0) f += lap * ridge(Math.atan2(x, z + 0.25) * 42) * 0.01; // 무릎 사이 부채꼴
    const shin = smooth(0.44, 0.3, y) * smooth(0.34, 0.5, X) * smooth(0.05, 0.25, z);
    if (shin > 0) f += shin * ridge(Math.hypot(X - 0.66, z - 0.32) * 62) * 0.009; // 무릎 둘레 물결
    const chest = smooth(0.66, 0.74, y) * smooth(1.06, 0.95, y) * smooth(0.02, 0.1, z) * smooth(uHalf(y) + 0.01, uHalf(y) + 0.05, X) * (1 - smooth(0.3, 0.38, X));
    if (chest > 0) f += chest * ridge(Math.hypot(x * 1.15, (y - 1.2) * 1.0) * 70) * 0.008; // 가슴 U 자
    const arm = smooth(0.27, 0.36, X) * smooth(0.42, 0.55, y) * smooth(1.05, 0.95, y);
    if (arm > 0) f += arm * ridge((y * 0.9 + z * 0.55 + X * 0.35) * 52) * 0.009; // 팔 사선
    const belly = smooth(0.62, 0.52, y) * smooth(0.36, 0.44, y) * smooth(0.05, 0.15, z) * (1 - smooth(0.25, 0.4, X));
    if (belly > 0) f += belly * ridge((x * 1.6 - y * 1.0) * 55) * 0.007; // 배 아래 사선
    d -= f;

    // 목깃 옷단(말린 단)과 승각기 띠·매듭
    if (y > 0.6 && y < 1.15 && z > -0.05) {
      d = smin(d, tube(X, y, z, HEM, 0.015), 0.012);
      if (X < 0.13) {
        d = smin(d, tube(X, y, z, BAND, 0.0085), 0.006);
        d = smin(d, ell(X, y, z, 0.022, 0.787, knotZ + 0.012, 0.022, 0.012, 0.01), 0.006); // 매듭 고리
        d = smin(d, cap(x, y, z, 0.004, 0.778, knotZ + 0.014, 0.014, 0.71, knotZ + 0.006, 0.0065, 0.005), 0.005); // 늘어진 끈
        d = smin(d, cap(x, y, z, -0.004, 0.778, knotZ + 0.014, -0.012, 0.725, knotZ + 0.006, 0.006, 0.0045), 0.005);
      }
    }
    // 오른발 발바닥이 왼 허벅지 위로 (길상좌)
    if (SOLE && y > 0.22 && x > 0.18) {
      d = smin(d, cap(x, y, z, 0.27, 0.315, 0.43, 0.47, 0.335, 0.37, 0.046, 0.04), 0.03);
      for (let t = 0; t < 5; t++) d = smin(d, sph(x, y, z, 0.5 + 0.004 * t, 0.338, 0.342 + t * 0.016, 0.0145 - t * 0.0012), 0.006);
    }
    return d;
  };
}

/* ───────────── 손 ───────────── */
/**
 * 손목 o, 손가락 방향 F, 손바닥 방향 N (손바닥이 N 을 본다). 엄지 쪽 S = F×N (mirror 면 반대).
 * curl: 손가락 마디 굽힘(rad) [첫 마디, 끝 마디]
 */
function handSDF(o, F, Nn, { mirror = false, curl = [0.15, 0.2], spread = 0.06, thumb = [0.6, 0.55, 0.3] } = {}) {
  const f = norm3(F);
  const nd = dot3(Nn, f);
  const n = norm3([Nn[0] - f[0] * nd, Nn[1] - f[1] * nd, Nn[2] - f[2] * nd]);
  const s = cross3(f, n).map((c) => (mirror ? -c : c));
  const [ox, oy, oz] = o;
  const [fx, fy, fz] = f, [sx, sy, sz] = s, [nx, ny, nz] = n;
  // 손가락: [시작 v, 길이, 반지름]
  const FING = [
    [0.03, 0.086, 0.0098],
    [0.01, 0.094, 0.0101],
    [-0.01, 0.087, 0.0097],
    [-0.029, 0.07, 0.0088]
  ];
  const segs = FING.map(([v, L, r], i) => {
    const a1 = curl[0] * (1 + i * 0.12), a2 = a1 + curl[1];
    const sp = (i - 1.5) * spread * 0.5;
    const b = [0.094, v, 0];
    const m = [b[0] + Math.cos(a1) * L * 0.55, v + sp * L * 0.55, Math.sin(a1) * L * 0.55];
    const t = [m[0] + Math.cos(a2) * L * 0.45, m[1] + sp * L * 0.45, m[2] + Math.sin(a2) * L * 0.45];
    return [b, m, t, r];
  });
  const td = norm3(thumb);
  const tb = [0.022, 0.038, 0.006];
  const tm = [tb[0] + td[0] * 0.04, tb[1] + td[1] * 0.04, tb[2] + td[2] * 0.04];
  const tt = [tm[0] + td[0] * 0.036 + 0.012, tm[1] + td[1] * 0.03, tm[2] + td[2] * 0.036];
  return (x, y, z) => {
    const px = x - ox, py = y - oy, pz = z - oz;
    const u = px * fx + py * fy + pz * fz, v = px * sx + py * sy + pz * sz, w = px * nx + py * ny + pz * nz;
    if (u < -0.08 || u > 0.24 || Math.abs(v) > 0.11 || Math.abs(w) > 0.1) return Math.max(Math.abs(u - 0.08) - 0.16, Math.abs(v) - 0.11, Math.abs(w) - 0.1, 0.02);
    let d = ell(u, v, w, 0.05, 0, 0.002, 0.052, 0.045, 0.0165); // 손바닥
    d = smin(d, cap(u, v, w, -0.06, 0, 0, 0.012, 0, 0, 0.028, 0.03), 0.02); // 손목
    for (const [b, m, t, r] of segs) {
      d = smin(d, cap(u, v, w, b[0] - 0.01, b[1], b[2], m[0], m[1], m[2], r, r * 0.92), 0.012);
      d = smin(d, cap(u, v, w, m[0], m[1], m[2], t[0], t[1], t[2], r * 0.9, r * 0.78), 0.004);
    }
    d = smin(d, cap(u, v, w, tb[0], tb[1], tb[2], tm[0], tm[1], tm[2], 0.013, 0.011), 0.014);
    d = smin(d, cap(u, v, w, tm[0], tm[1], tm[2], tt[0], tt[1], tt[2], 0.0105, 0.009), 0.004);
    return d;
  };
}

function handsFor(kind) {
  if (kind === 'buddha') {
    const fa = POSE.buddha.forearms;
    return [
      // 오른손: 오른 무릎을 덮고 손끝이 땅을 가리킨다 (항마촉지인)
      { sdf: handSDF([fa[0][3], fa[0][4], fa[0][5]], [-0.04, -0.72, 0.69], [0.05, -0.69, -0.72], { curl: [0.08, 0.1], spread: 0.05 }), b: [-0.72, 0.16, 0.24, -0.4, 0.52, 0.62] },
      // 왼손: 무릎 위에 손바닥을 위로
      { sdf: handSDF([fa[1][3], fa[1][4], fa[1][5]], [-0.93, 0.02, 0.36], [0, 1, 0], { mirror: true, curl: [0.12, 0.18], spread: 0.04, thumb: [0.55, 0.65, 0.35] }), b: [-0.02, 0.33, 0.14, 0.3, 0.5, 0.42] }
    ];
  }
  const fa = POSE.bodhi.forearms;
  return [
    // 합장: 두 손바닥을 가슴 앞에 모은다
    { sdf: handSDF([fa[0][3], fa[0][4], fa[0][5]], [0, 0.9, 0.44], [1, 0, 0], { curl: [0.02, 0.02], spread: 0.0, thumb: [0.7, 0.1, 0.25] }), b: [-0.1, 0.68, 0.14, 0.004, 1.0, 0.42] },
    { sdf: handSDF([fa[1][3], fa[1][4], fa[1][5]], [0, 0.9, 0.44], [-1, 0, 0], { mirror: true, curl: [0.02, 0.02], spread: 0.0, thumb: [0.7, 0.1, 0.25] }), b: [-0.004, 0.68, 0.14, 0.1, 1.0, 0.42] }
  ];
}

/* ───────────── 나발 (달팽이 곱슬) ───────────── */
/** 머리 표면 위로 고르게 흩은 곱슬 자리 (피보나치 구 방향 → 표면까지 이분 탐색) */
function curlData(head, hair, spacing) {
  const C = [0, 1.47, -0.025];
  const R = 0.2;
  const total = Math.round(((4 * Math.PI * R * R) / (spacing * spacing * 0.866)) * 0.7);
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const yv = 1 - (i / (total - 1)) * 2;
    const rr = Math.sqrt(1 - yv * yv);
    const dx = Math.cos(ga * i) * rr, dy = yv, dz = Math.sin(ga * i) * rr;
    if (dy < -0.75) continue;
    let a = 0.02, b2 = 0.32;
    for (let k = 0; k < 30; k++) {
      const mid = (a + b2) / 2;
      if (head(C[0] + dx * mid, C[1] + dy * mid, C[2] + dz * mid) < 0) a = mid;
      else b2 = mid;
    }
    const px = C[0] + dx * a, py = C[1] + dy * a, pz = C[2] + dz * a;
    if (!hair(px, py, pz) || py < 1.45) continue;
    const e = 0.002;
    const nn = norm3([head(px + e, py, pz) - head(px - e, py, pz), head(px, py + e, pz) - head(px, py - e, pz), head(px, py, pz + e) - head(px, py, pz - e)]);
    out.push(px - nn[0] * 0.002, py - nn[1] * 0.002, pz - nn[2] * 0.002, nn[0], nn[1], nn[2], (i * 2.399) % (Math.PI * 2));
  }
  return new Float32Array(out);
}

/**
 * 조각 한 벌 → 옮기기 쉬운 배열만 (워커에서 돌려 메인 스레드로 넘긴다)
 */
export function sculptData(kind, quality) {
  // 격자 간격 배율: 저사양 ×1/0.6, 협시보살은 작고 멀어서 ×1.25
  const q = (quality === 'low' ? 1 / 0.6 : 1) * (kind === 'buddha' ? 1 : 1.25);
  const bodhi = kind !== 'buddha';
  const t0 = performance.now();
  const head = headSDF(bodhi);
  const body = bodySDF(kind);
  const hands = handsFor(kind);
  const hairOf = isHair(bodhi);
  const hairW = hairWeight(bodhi);
  // 기울인 머리: 머리 좌표 = R(-tilt)·(월드 - 중심)
  const ct = Math.cos(HEAD_TILT), st = Math.sin(HEAD_TILT);
  const [hx0, hy0, hz0] = HEAD_PIVOT;
  const headW = (x, y, z) => {
    const ly = (y - hy0) * ct + (z - hz0) * st + hy0;
    const lz = -(y - hy0) * st + (z - hz0) * ct + hz0;
    return head(x, ly, lz);
  };
  const handsW = (x, y, z) => {
    let d = 1e9;
    for (const h of hands) d = Math.min(d, h.sdf(x, y, z));
    return d;
  };
  const all = (x, y, z) => {
    let d = body(x, y, z);
    if (y > 0.95) d = Math.min(d, headW(x, y, z));
    if (y < 1.05) d = Math.min(d, handsW(x, y, z));
    return d;
  };
  // 머리 (머리 좌표계에서 뽑고 그룹째 기울인다)
  const tm = { start: performance.now() };
  const lap = (k) => (tm[k] = performance.now() - tm.start, (tm.start = performance.now()));
  const hm = surfaceNets(head, [bodhi ? -0.245 : -0.215, 1.0, -0.21, bodhi ? 0.245 : 0.215, bodhi ? 1.83 : 1.75, 0.215], 0.0042 * q);
  const allHeadLocal = (x, y, z) => {
    // 머리 AO: 몸은 월드 좌표로 바꿔 함께 잰다
    const wy = (y - hy0) * ct - (z - hz0) * st + hy0;
    const wz = (y - hy0) * st + (z - hz0) * ct + hz0;
    return Math.min(head(x, y, z), body(x, wy, wz));
  };
  lap('headMesh');
  const hao = bakeAO(hm.pos, hm.nrm, allHeadLocal, 0.8);
  lap('headAO');
  const headA = toArrays(
    hm,
    (i, x, y, z) => {
      const hw = hairW(x, y, z);
      if (hw > 0.999) return scaleInto(mixInto(_c, C_HAIR, C_HAIR, 0), 0.5 + 0.5 * hao[i]);
      const c = goldAt(hao[i], x, y, z);
      if (hw > 0) {
        const k = 0.5 + 0.5 * hao[i];
        return mixInto(c, c, [C_HAIR[0] * k, C_HAIR[1] * k, C_HAIR[2] * k], hw);
      }
      // 입술은 엷은 주칠
      const lip = smooth(0.012, 0.004, Math.hypot(x * 0.6, (y - 1.339) * 1.6)) * smooth(0.14, 0.16, z);
      return lip > 0 ? mixInto(c, c, C_LIP, lip * 0.45) : c;
    },
    (x, y, z) => (hairW(x, y, z) > 0.999 ? 1 : 0)
  );
  // 몸·가사
  const bm = surfaceNets(body, [-0.92, -0.04, -0.42, 0.92, 1.16, 0.72], 0.012 * q);
  lap('bodyMesh');
  const bao = bakeAO(bm.pos, bm.nrm, all, 1.7);
  lap('bodyAO');
  const bodyA = toArrays(bm, (i, x, y, z) => goldAt(bao[i], x, y, z));
  // 손
  const handA = hands.map((h) => {
    const m = surfaceNets(h.sdf, h.b, 0.0038 * q);
    const ao = bakeAO(m.pos, m.nrm, all, 0.7);
    return toArrays(m, (i, x, y, z) => goldAt(ao[i], x, y, z));
  });
  lap('hands');
  const curls = bodhi ? new Float32Array(0) : curlData(head, hairOf, 0.0215);
  lap('curls');
  // 보살 영락 구슬 자리 (가슴 위 U 자) · 본존 중간계주 깊이
  const beads = [];
  if (bodhi) {
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40 - 0.5) * Math.PI * 0.95;
      const x = Math.sin(a) * 0.14, y = 1.07 - Math.cos(a) * 0.2;
      beads.push(x, y, frontZ(body, x, y) + 0.008, i % 5 === 0 ? 0.011 : 0.0075);
    }
    beads.push(0, 0.85, frontZ(body, 0, 0.85) + 0.016, 0.018); // 가운데 드리개
  }
  const out = {
    kind,
    head: headA,
    body: bodyA,
    hands: handA,
    curls,
    beads: new Float32Array(beads),
    jewelZ: bodhi ? 0 : frontZ(head, 0, 1.585, 0.3, 0),
    ms: performance.now() - t0
  };
  const tris = (headA.idx.length + bodyA.idx.length + handA.reduce((s, h) => s + h.idx.length, 0)) / 3;
  console.info(`[buddha] ${kind} 조각 ${out.ms.toFixed(0)}ms · 삼각형 ${(tris / 1000).toFixed(0)}k · 나발 ${curls.length / 7} · ${Object.entries(tm).filter(([k]) => k !== 'start').map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ')}`);
  return out;
}

/** 워커 → 메인으로 넘길 때 복사하지 않고 옮길 버퍼들 */
export function transferables(d) {
  const t = [];
  for (const m of [d.head, d.body, ...d.hands]) t.push(m.pos.buffer, m.nrm.buffer, m.col.buffer, m.idx.buffer);
  t.push(d.curls.buffer, d.beads.buffer);
  return t;
}

