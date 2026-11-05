/**
 * 순환 산책로 (요구 5) — three 없이 도는 순수 기하. layout.js 가 높이·걷기·구역에 쓰고, 테스트가 그대로 읽는다.
 *
 * 숲길(pathX)의 두 갈림목을 잇는 열린 곡선이 산사를 한 바퀴 두른다. 숲길 구간과 합치면 고리가 된다:
 *   J1 일주문 안 숲길(z 22.5) → 계곡 남쪽 기슭 → 작은 나무다리 → 서쪽 산자락 → 뒷산 능선(전망 바위)
 *   → 대숲 → 심검당 뒤 → 계곡 북쪽 → J2 마당 계단 앞 숲길(z 8) → 숲길 → J1
 * 갈림길: 마당은 J2 바로 앞 계단으로, 다실은 대숲 구간에서 동쪽 마당으로 들어가는 짧은 길(TEA_BRANCH).
 * 단위 m, +x 동, -z 북 (layout.js 와 같은 좌표).
 */

/** 숲길 중심선 x(z) — layout.js 의 pathX 가 이것을 쓴다 (trail.js 는 three 없이 돌아야 해서 여기에 둔다) */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export function forestPathX(z) {
  if (z < 6.6) return 0;
  const t = smooth(6.6, 11.6, z);
  return t * (1.3 * Math.sin(z * 0.11) + 0.9 * Math.sin(z * 0.23 + 1.1) * smooth(30, 44, z));
}

export const J1 = { x: forestPathX(22.5), z: 22.5 };
export const J2 = { x: forestPathX(8.0), z: 8.0 }; // 숲길 석등 쌍(z 9.6)과 마당 계단(z 7) 사이

/** 작은 나무다리: 계곡(서쪽 x≈-28)을 남북으로 건넌다. 양 끝이 계곡 파임 밖(중심에서 4m)에 닿게 8m */
export const SMALL_BRIDGE = { x: -27.9, z0: 10.55, z1: 18.55, halfW: 0.85, deckY: 0.32, rise: 0.22 };

/** 산책로 조절점 (Catmull-Rom 으로 0.5m 간격 표본) */
export const TRAIL_CTRL = [
  [J1.x, J1.z],
  [-4, 21.9],
  [-11, 20.9],
  [-18, 20.1],
  [-24.2, 19.6],
  [-27.4, 19.3],
  [SMALL_BRIDGE.x, 18.0], // 다리 남단
  [SMALL_BRIDGE.x, 11.1], // 다리 북단
  [-28.6, 7.6],
  [-30.6, 1.0],
  [-31.6, -8],
  [-31.4, -17],
  [-30.2, -26],
  [-26.6, -35],
  [-19, -42.2],
  [-9, -47.2],
  [3, -49],
  [14, -47.6],
  [24, -43],
  [31.6, -36],
  [36.2, -27],
  [36.6, -17],
  [36.2, -7],
  [35.2, 1.5],
  [31.4, 6.4],
  [23.5, 9.2],
  [13, 8.6],
  [J2.x + 2.4, J2.z],
  [J2.x, J2.z]
];

/** 다실 갈림길: 대숲 구간 → 심검당 동쪽 마당(연못 정자 북쪽) */
export const TEA_BRANCH_CTRL = [
  [36.4, -9.5],
  [33.6, -9.2],
  [31.0, -8.8]
];

export const TRAIL_HALF = 1.5; // 걸을 수 있는 반폭
export const TRAIL_REACH = 8; // 지형을 산책로 높이로 다듬는 범위 (이보다 멀면 nearest 가 null)

/** 가운데 구심 Catmull-Rom 표본 — 꺾인 곳에서도 고리·튐이 없다 */
function sampleCurve(ctrl, step = 0.5) {
  const P = ctrl.map(([x, z]) => ({ x, z }));
  const ext = [
    { x: 2 * P[0].x - P[1].x, z: 2 * P[0].z - P[1].z },
    ...P,
    { x: 2 * P[P.length - 1].x - P[P.length - 2].x, z: 2 * P[P.length - 1].z - P[P.length - 2].z }
  ];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const td = (a, b) => Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)) || 1e-4;
    const t0 = 0, t1 = t0 + td(p0, p1), t2 = t1 + td(p1, p2), t3 = t2 + td(p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => ({ x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), z: ((tb - t) * a.z + (t - ta) * b.z) / (tb - ta) });
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push({ ...P[P.length - 1] });
  return out;
}

/**
 * 표본 점들로 만든 꺾은선 + 2m 격자 (가장 가까운 점 찾기가 지형 정점 수만큼 불리므로 격자로 좁힌다).
 * nearest(x,z) → { d, x, z, s, i, u } (s 는 시작에서 잰 길이) 또는 TRAIL_REACH 밖이면 null.
 */
export class Polyline {
  constructor(pts, reach = TRAIL_REACH, cell = 2) {
    this.pts = pts;
    this.reach = reach;
    this.cell = cell;
    this.s = [0];
    for (let i = 1; i < pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.length = this.s[this.s.length - 1];
    this.h = null; // setProfile 뒤 표본별 높이
    this.grid = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const gx0 = Math.floor((Math.min(a.x, b.x) - reach) / cell), gx1 = Math.floor((Math.max(a.x, b.x) + reach) / cell);
      const gz0 = Math.floor((Math.min(a.z, b.z) - reach) / cell), gz1 = Math.floor((Math.max(a.z, b.z) + reach) / cell);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const k = gx * 4096 + gz;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(i);
        }
      }
    }
  }

  nearest(x, z) {
    const list = this.grid.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    if (!list) return null;
    let best = null, bd = this.reach;
    for (const i of list) {
      const a = this.pts[i], b = this.pts[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const l2 = vx * vx + vz * vz || 1e-9;
      const u = clamp(((x - a.x) * vx + (z - a.z) * vz) / l2, 0, 1);
      const px = a.x + vx * u, pz = a.z + vz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        best = { d, x: px, z: pz, i, u };
      }
    }
    if (best) best.s = this.s[best.i] + (this.s[best.i + 1] - this.s[best.i]) * best.u;
    return best;
  }

  /** 이 길이(s)의 점 */
  at(s) {
    s = clamp(s, 0, this.length);
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = this.s[hi] - this.s[lo] || 1;
    const u = (s - this.s[lo]) / seg;
    const a = this.pts[lo], b = this.pts[hi];
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, h: this.h ? this.h[lo] + (this.h[hi] - this.h[lo]) * u : 0 };
  }

  /** 산책로 높이 단면: 표본마다 바탕 높이를 재고 ±win m 이동 평균으로 고른다 (오르막 기울기를 누그러뜨림) */
  setProfile(heightFn, win = 6) {
    const raw = this.pts.map((p) => heightFn(p.x, p.z));
    const n = raw.length;
    this.h = raw.map((_, i) => {
      let sum = 0, w = 0;
      for (let j = i; j >= 0 && this.s[i] - this.s[j] <= win; j--) {
        const k = 1 - (this.s[i] - this.s[j]) / (win + 0.01);
        sum += raw[j] * k;
        w += k;
      }
      for (let j = i + 1; j < n && this.s[j] - this.s[i] <= win; j++) {
        const k = 1 - (this.s[j] - this.s[i]) / (win + 0.01);
        sum += raw[j] * k;
        w += k;
      }
      return sum / w;
    });
  }

  heightAtNearest(nr) {
    return this.h[nr.i] + (this.h[nr.i + 1] - this.h[nr.i]) * nr.u;
  }

  /** s0 → s1 를 따라 걷는 경유점 (간격 step) */
  route(s0, s1, step = 3) {
    const out = [];
    const dir = s1 >= s0 ? 1 : -1;
    for (let s = s0 + dir * step; dir * (s1 - s) > step * 0.5; s += dir * step) out.push(this.at(s));
    out.push(this.at(s1));
    return out;
  }
}

export const trail = new Polyline(sampleCurve(TRAIL_CTRL));
export const teaBranch = new Polyline(sampleCurve(TEA_BRANCH_CTRL));
const PATHS = [trail, teaBranch];

/** 두 길(순환로·다실 갈림길) 중 가장 가까운 점 { d, h(높이 단면, setProfile 뒤), path, ... } */
export function nearestTrail(x, z) {
  let best = null;
  for (const p of PATHS) {
    const n = p.nearest(x, z);
    if (n && (!best || n.d < best.d)) {
      n.path = p;
      best = n;
    }
  }
  if (best && best.path.h) best.h = best.path.heightAtNearest(best);
  return best;
}

export function setTrailProfile(heightFn) {
  PATHS.forEach((p) => p.setProfile(heightFn));
  // 작은 다리: 판 끝 높이에 길을 잇는다 (양쪽 6m 에 걸쳐 이어 붙임)
  const sOn = trail.s.filter((_, i) => onSmallBridge(trail.pts[i].x, trail.pts[i].z, 0.3));
  const s0 = Math.min(...sOn), s1 = Math.max(...sOn);
  trail.h = trail.h.map((h, i) => {
    const s = trail.s[i];
    const d = s < s0 ? s0 - s : s > s1 ? s - s1 : 0;
    const k = smooth(0, 6, d);
    return SMALL_BRIDGE.deckY * (1 - k) + h * k;
  });
}

export function onSmallBridge(x, z, pad = 0) {
  const b = SMALL_BRIDGE;
  return Math.abs(x - b.x) <= b.halfW + pad && z >= b.z0 - pad && z <= b.z1 + pad;
}

/** 다리 위 걷는 높이 (가운데가 살짝 솟은 판재) */
export function smallBridgeY(z) {
  const b = SMALL_BRIDGE;
  const u = clamp((z - (b.z0 + b.z1) / 2) / ((b.z1 - b.z0) / 2), -1, 1);
  return b.deckY + b.rise * Math.cos((u * Math.PI) / 2);
}

/* ───── 길 중간의 쉼 (요구 5) ─────
 * s: 순환로 시작(J1)에서 잰 길이, side: 진행 방향의 오른쪽(+1)/왼쪽(-1), off: 중심선에서 떨어진 거리,
 * look: 앉아서 바라보는 곳, seatH: 땅에서 앉는 면까지 높이. 모양은 trailProps.js 의 같은 kind 빌더가 만든다.
 * 예불 듣기(1인칭)는 vista 쪽을(없으면 look 쪽을) listenPitch 만큼 내려다본다. view: 그 쪽으로 나무를 비우는 거리(m).
 */
const REST_DEFS = [
  { id: 'bench_stream', kind: 'bench', s: 14, side: 1, off: 2.3, look: [-13, 12.5], seatH: 0.46 },
  { id: 'bridge', kind: 'bridge', s: 34, side: 0, off: 0, look: [-18, 14.6] },
  { id: 'stump_a', kind: 'stump', s: 52, side: -1, off: 2.2, look: [-18, -4], seatH: 0.42, view: 16 },
  { id: 'stump_b', kind: 'stump', s: 55, side: -1, off: 2.5, look: [-18, -7], seatH: 0.36, view: 16 },
  { id: 'spring', kind: 'spring', s: 69, side: -1, off: 2.3, look: [-40, -20.5], seatH: 0.36, vista: [-12, -16], view: 18 },
  { id: 'lookout', kind: 'lookout', s: 121, side: 1, off: 3.2, look: [4, -10], seatH: 0.95, view: 34, vista: [17, -6], listenPitch: 0.1 },
  { id: 'mat_ridge', kind: 'mat', s: 134, side: 1, off: 2.4, look: [10, -10], seatH: 0.03, view: 22, listenPitch: 0.1 },
  { id: 'bench_bamboo', kind: 'bench', s: 172, side: -1, off: 2.1, look: [28, -15], seatH: 0.46, vista: [35, -40] },
  { id: 'mat_stream', kind: 'mat', s: 204, side: -1, off: 2.4, look: [25, 16], seatH: 0.03 }
];

export const REST_LABEL = {
  bench: '돌 쉼터에 앉기',
  stump: '그루터기에 앉기',
  mat: '돗자리 펴고 앉기',
  lookout: '전망 바위에 앉기',
  bridge: '다리에 걸터앉기',
  spring: '약수터에서 쉬기'
};

/** 앉았을 때 알림 */
export const REST_SIT_MSG = {
  bench: '🪨 돌 쉼터에 앉았습니다 · 움직이면 일어납니다',
  stump: '🪵 그루터기에 걸터앉았습니다 · 움직이면 일어납니다',
  mat: '🧺 돗자리를 펴고 앉았습니다 · 일어서면 걷힙니다',
  lookout: '⛰️ 전망 바위에 앉았습니다 · 산사가 한눈에 내려다보입니다',
  bridge: '🌉 작은 다리에 걸터앉았습니다 · 발아래로 계곡물이 흐릅니다',
  spring: '💧 약수 한 모금 — 약수터 돌에 앉아 숨을 고릅니다'
};

/** 진행 방향 오른쪽 법선 (+x 동, -z 북 좌표에서 위에서 보아 시계 방향으로 90°) */
function rightNormal(s) {
  const a = trail.at(s - 0.5), b = trail.at(s + 0.5);
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return { x: -tz / l, z: tx / l };
}

export const REST_SPOTS = REST_DEFS.map((d) => {
  const c = trail.at(d.s);
  const n = rightNormal(d.s);
  let x = c.x + n.x * d.side * d.off, z = c.z + n.z * d.side * d.off;
  if (d.kind === 'bridge') {
    // 다리 동쪽 난간 안쪽에 걸터앉는다 (난간이 낮아 앉은 눈높이보다 아래)
    x = SMALL_BRIDGE.x + SMALL_BRIDGE.halfW - 0.3;
    z = c.z;
  }
  // 일어설 자리: 중심선에서 쉼터 쪽으로 0.5m (산책로 반폭 안)
  const stand = { x: c.x + n.x * d.side * Math.min(0.5, d.off), z: c.z + n.z * d.side * Math.min(0.5, d.off) };
  const ry = Math.atan2(d.look[0] - x, d.look[1] - z);
  return { ...d, x, z, ry, stand, label: REST_LABEL[d.kind] };
});

/** 전망 바위·능선 돗자리에서 산사 쪽으로 열린 시야 (이 안에는 나무를 심지 않는다) */
export function inLookoutView(x, z) {
  for (const l of REST_SPOTS) {
    if (!l.view) continue;
    const dx = x - l.x, dz = z - l.z;
    if (dx * dx + dz * dz > l.view * l.view) continue;
    const a = l.vista ? Math.atan2(l.vista[0] - l.x, l.vista[1] - l.z) : l.ry;
    const vx = Math.sin(a), vz = Math.cos(a);
    const along = dx * vx + dz * vz;
    if (along > -2 && Math.abs(dx * vz - dz * vx) < 3 + Math.max(along, 0) * 0.55) return true;
  }
  return false;
}
