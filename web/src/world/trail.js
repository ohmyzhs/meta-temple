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

export const J1 = { x: forestPathX(30), z: 30 }; // 일주문(z 27)과 숲길 석등 쌍(z 33) 사이에서 서쪽으로
export const J3 = { x: forestPathX(43), z: 43 }; // 남동 전나무숲을 돌아 산문 앞(스폰 z 36 남쪽) 숲길로 돌아온다
export const J2 = { x: forestPathX(8.0), z: 8.0 }; // 마당 갈림길 끝: 숲길 석등 쌍(z 9.6)과 마당 계단(z 7) 사이

/**
 * 계곡을 건너는 곳 둘: 서쪽 작은 나무다리, 동쪽 징검다리. 양 끝이 계곡 파임 밖(중심에서 4m)에 닿는다.
 * deckY: 걷는 면 높이(끝), rise: 가운데가 더 솟는 만큼.
 */
export const CROSSINGS = [
  { id: 'bridge', kind: 'bridge', x: -42, z0: 10.95, z1: 18.95, halfW: 0.85, deckY: 0.32, rise: 0.22 },
  { id: 'stones', kind: 'stones', x: 21.3, z0: 11.8, z1: 19.8, halfW: 0.75, deckY: 0.04, rise: 0 }
];
export const SMALL_BRIDGE = CROSSINGS[0];

/**
 * 산책로 조절점 (Catmull-Rom 으로 0.5m 간격 표본). 시계 반대 방향:
 * J1 → 남서 전나무숲 데크 → 서쪽 작은 나무다리 → 서쪽 산자락 우거진 숲(굽이길) → 뒷산 능선(전망 바위)
 * → 동쪽 대숲 → 계곡 북쪽 기슭 → 징검다리 → 남동 전나무숲 → J3
 */
export const TRAIL_CTRL = [
  [J1.x, J1.z],
  [-5, 30.6],
  [-11, 33],
  [-17, 38.5],
  [-22, 45],
  [-29, 51.5],
  [-38, 54.5],
  [-46.5, 52.5],
  [-51.5, 45.5],
  [-52.5, 36.5],
  [-50, 28],
  [-46, 22.6],
  [-42.6, 20.2],
  [-42, 18.4], // 나무다리 남단
  [-42, 11.5], // 나무다리 북단
  [-43.5, 8],
  [-48, 3.5],
  [-51, -3],
  [-46.5, -9],
  [-41.5, -14.5],
  [-44, -21],
  [-50, -25.5],
  [-50.5, -32.5],
  [-42.5, -38],
  [-35, -42.5],
  [-26, -46.5],
  [-15, -49.5],
  [-4, -51],
  [6, -51],
  [16, -49.5],
  [26, -46],
  [35, -41],
  [42, -35],
  [49, -29],
  [46.5, -21.5],
  [51, -14],
  [48.6, -6],
  [50.5, 1.5],
  [46, 7.5],
  [38, 8.6],
  [30, 8.2],
  [24, 9.4],
  [21.3, 12.3], // 징검다리 북단
  [21.3, 19.3], // 징검다리 남단
  [22.5, 23],
  [26, 28.5],
  [32.5, 30.5],
  [39, 34],
  [45, 39.5],
  [44.5, 47],
  [39, 51.5],
  [31, 50.5],
  [26, 53.8],
  [18, 54.3],
  [11, 51.5],
  [6.5, 46.5],
  [J3.x + 2.6, J3.z],
  [J3.x, J3.z]
];

/** 마당 갈림길: 계곡 북쪽 기슭 → 마당 계단 앞 숲길 */
export const COURT_BRANCH_CTRL = [
  [24, 9.4],
  [13, 8.6],
  [J2.x + 2.4, J2.z],
  [J2.x, J2.z]
];

/** 다실 갈림길: 동쪽 대숲 → 옛 대숲 사이 → 심검당 동쪽 마당(연못 정자 북쪽) */
export const TEA_BRANCH_CTRL = [
  [48.6, -8],
  [42, -9.5],
  [36.4, -9.6],
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
export const courtBranch = new Polyline(sampleCurve(COURT_BRANCH_CTRL));
export const teaBranch = new Polyline(sampleCurve(TEA_BRANCH_CTRL));
export const PATHS = [trail, courtBranch, teaBranch];

/** 한 바퀴 닫힌 고리: 순환로(J1 → J3) + 숲길(J3 → J1, 산문 앞). 자동 산책이 이 길을 따라 돈다 */
export const loop = (() => {
  const pts = [...trail.pts];
  for (let z = J3.z - 0.5; z > J1.z + 0.25; z -= 0.5) pts.push({ x: forestPathX(z), z });
  pts.push({ x: J1.x, z: J1.z });
  return new Polyline(pts);
})();

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

/** 건너는 곳 위인가 → 그 건너는 곳(아니면 null) */
export function crossingAt(x, z, pad = 0) {
  for (const c of CROSSINGS) if (Math.abs(x - c.x) <= c.halfW + pad && z >= c.z0 - pad && z <= c.z1 + pad) return c;
  return null;
}

/** 건너는 곳 위 걷는 높이 (나무다리는 가운데가 살짝 솟는다) */
export function crossingY(c, z) {
  const u = clamp((z - (c.z0 + c.z1) / 2) / ((c.z1 - c.z0) / 2), -1, 1);
  return c.deckY + c.rise * Math.cos((u * Math.PI) / 2);
}

/**
 * 전나무숲 데크: 순환로 s0..s1 구간은 땅에서 rise 만큼 떠 있는 나무 데크 (양 끝 ramp m 는 경사로).
 * 데크 위 걸을 수 있는 반폭은 halfW (판재 폭과 같다 — 판 밖 허공을 딛지 않게).
 */
export const DECK = { s0: 11, s1: 92, rise: 0.42, ramp: 2.5, halfW: 1.25 };
export function deckRise(s) {
  const d = DECK;
  if (s <= d.s0 || s >= d.s1) return 0;
  return d.rise * Math.min(1, (s - d.s0) / d.ramp, (d.s1 - s) / d.ramp);
}

/** 이 자리가 데크 위면 그 높이(땅 위로 얼마나), 아니면 0 — nearestTrail 결과로 */
export function deckRiseAt(nr) {
  return nr && nr.path === trail && nr.d <= DECK.halfW + 0.05 ? deckRise(nr.s) : 0;
}

/** 우거진 숲 구간 (나무를 빽빽이 심는 순환로 s 범위) — 데크 숲, 서쪽 굽이길, 남동 전나무숲 */
export const DENSE_FOREST = [
  [8, 95],
  [104, 168],
  [346, 436]
];

export const MAX_GRADE = 0.18; // 산책로 기울기 상한 (18%) — 넘는 곳은 비탈을 깎거나 북돋운다

export function setTrailProfile(heightFn) {
  PATHS.forEach((p) => p.setProfile(heightFn));
  for (const P of PATHS) {
    // 건너는 곳: 판 끝 높이에 길을 잇는다 (양쪽 6m 에 걸쳐 이어 붙임)
    const lock = new Array(P.pts.length).fill(false);
    for (const c of CROSSINGS) {
      const sOn = P.s.filter((_, i) => crossingAt(P.pts[i].x, P.pts[i].z, 0.3) === c);
      if (!sOn.length) continue;
      const s0 = Math.min(...sOn), s1 = Math.max(...sOn);
      P.h = P.h.map((h, i) => {
        const s = P.s[i];
        const d = s < s0 ? s0 - s : s > s1 ? s - s1 : 0;
        if (d === 0) lock[i] = true;
        const k = smooth(0, 6, d);
        return c.deckY * (1 - k) + h * k;
      });
    }
    // 기울기 상한: 앞뒤로 한 번씩 이웃과의 높이 차를 MAX_GRADE·거리 안으로 (다리 위는 그대로)
    const h = P.h;
    for (const dir of [1, -1]) {
      for (let k = dir > 0 ? 1 : h.length - 2; k >= 0 && k < h.length; k += dir) {
        if (lock[k]) continue;
        const j = k - dir, lim = MAX_GRADE * Math.abs(P.s[k] - P.s[j]);
        h[k] = clamp(h[k], h[j] - lim, h[j] + lim);
      }
    }
  }
}

/* ───── 길 중간의 쉼 (요구 5) ─────
 * s: 순환로 시작(J1)에서 잰 길이, side: 진행 방향의 오른쪽(+1)/왼쪽(-1), off: 중심선에서 떨어진 거리,
 * look: 앉아서 바라보는 곳, seatH: 땅에서 앉는 면까지 높이. 모양은 trailProps.js 의 같은 kind 빌더가 만든다.
 * 예불 듣기(1인칭)는 vista 쪽을(없으면 look 쪽을) listenPitch 만큼 내려다본다. view: 그 쪽으로 나무를 비우는 거리(m).
 */
const REST_DEFS = [
  { id: 'deck_bench', name: '전나무숲 데크', kind: 'bench', s: 38, side: -1, off: 0.85, look: [-24, 40], seatH: 0.46, onDeck: true, listenPitch: -0.06 },
  { id: 'bridge', name: '나무다리', kind: 'bridge', s: 98.8, side: 0, off: 0, look: [-20, 14.6] },
  { id: 'stump_a', name: '숲속 그루터기', kind: 'stump', s: 117, side: -1, off: 2.2, look: [-30, 0], seatH: 0.42, view: 14, listenPitch: -0.04 },
  { id: 'stump_b', name: '숲속 그루터기', kind: 'stump', s: 120.5, side: -1, off: 2.5, look: [-30, -4], seatH: 0.36, view: 14, listenPitch: -0.06 },
  { id: 'spring', name: '약수터', kind: 'spring', s: 147, side: -1, off: 2.3, look: [-60, -26], seatH: 0.36, vista: [-30, -12], view: 18, listenPitch: -0.03 },
  { id: 'lookout', name: '전망 바위', kind: 'lookout', s: 221, side: 1, off: 3.2, look: [6, -10], seatH: 0.95, view: 34, vista: [20, -6], listenPitch: 0.1 },
  { id: 'mat_ridge', name: '능선 돗자리', kind: 'mat', s: 241, side: 1, off: 2.4, look: [12, -10], seatH: 0.03, view: 24, listenPitch: 0.1 },
  { id: 'bench_bamboo', name: '대숲 쉼터', kind: 'bench', s: 282, side: 1, off: 2.1, look: [30, -14], seatH: 0.46, view: 22, listenPitch: 0.02 },
  { id: 'mat_stream', name: '계곡 돗자리', kind: 'mat', s: 322, side: -1, off: 2.4, look: [33, 16], seatH: 0.03 },
  { id: 'bench_stream', name: '징검다리 쉼터', kind: 'bench', s: 347, side: 1, off: 2.2, look: [10, 12], seatH: 0.46, view: 12 },
  { id: 'stump_c', name: '남쪽 숲 그루터기', kind: 'stump', s: 408, side: 1, off: 2.3, look: [12, 36], seatH: 0.4, view: 12, listenPitch: -0.05 }
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
  // 일어설 자리: 중심선에서 쉼터 쪽으로 0.5m (산책로 반폭 안). 데크 위 벤치는 벤치 맞은편 판 위로
  const so = d.onDeck ? -0.35 : Math.min(0.5, d.off);
  const stand = { x: c.x + n.x * d.side * so, z: c.z + n.z * d.side * so };
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

/* ───── 길과 바깥의 경계 (낮은 울타리·돌담) · 길 등 ─────
 * 걸을 수 있는 띠(TRAIL_HALF)와 몸 반지름(0.32m) 밖에 울타리를 세워 "여기까지가 길"을 보인다.
 * 갈림목·건너는 곳·데크(제 난간이 있다)·쉼터 입구·석등 자리·넓은 숲길(일주문 길)에는 세우지 않는다.
 */
export const FENCE_OFF = TRAIL_HALF + 0.4;
const FENCE_STEP = 2;
/** 돌담 구간 (순환로 s): 능선 비탈(깎은 언덕 쪽은 석축처럼)과 계곡 북쪽 기슭. 나머지는 나무 울타리 */
const STONE_RUNS = [
  [148, 256],
  [300, 330]
];

/** 진행 방향 오른쪽 법선 (P 위 s) */
function normalOn(P, s) {
  const a = P.at(s - 0.5), b = P.at(s + 0.5);
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return { x: -tz / l, z: tx / l };
}
function offsetOn(P, s, side, off) {
  const c = P.at(s), n = normalOn(P, s);
  return { x: c.x + n.x * side * off, z: c.z + n.z * side * off, s };
}

/** 갈림목·전망 자리 석등 (순환로 s, 오른쪽 2.3m) */
export const LANTERNS = [3, 93, 214, 288, 330, 344, 432].map((s) => offsetOn(trail, s, 1, 2.3));

/** 길 등: 순환로를 따라 약 20m 마다 좌우 번갈아 (밤길 표시). 데크 구간은 난간 바로 밖 */
export const PATH_LAMPS = (() => {
  const out = [];
  let side = -1;
  for (let s = 14; s < trail.length - 6; s += 20) {
    side = -side;
    const onDeck = s > DECK.s0 && s < DECK.s1;
    let p = offsetOn(trail, s, side, onDeck ? DECK.halfW + 0.55 : FENCE_OFF + 0.65);
    const busy = (q) => REST_SPOTS.some((r) => Math.hypot(r.x - q.x, r.z - q.z) < 3) || LANTERNS.some((l) => Math.hypot(l.x - q.x, l.z - q.z) < 4) || crossingAt(q.x, q.z, 3);
    if (busy(p)) p = offsetOn(trail, s, -side, onDeck ? DECK.halfW + 0.55 : FENCE_OFF + 0.65);
    if (busy(p)) continue;
    out.push(p);
  }
  return out;
})();

/**
 * 울타리 줄들: [{ style: 'wood'|'stone', path, side, pts: [{x,z,s}] }] — 기둥(돌담 마디) 자리가 FENCE_STEP 간격.
 * 연속으로 세울 수 있는 자리끼리 한 줄이 된다.
 */
export function fenceRuns() {
  const runs = [];
  const nearOther = (P, q) => PATHS.some((Q) => Q !== P && (Q.nearest(q.x, q.z)?.d ?? 99) < 2.6);
  const blocked = (P, q) => {
    if (q.s < 3 || q.s > P.length - 3) return true;
    if (crossingAt(q.x, q.z, 1.6)) return true;
    if (P === trail && q.s > DECK.s0 - 1.5 && q.s < DECK.s1 + 1.5) return true;
    if (REST_SPOTS.some((r) => Math.hypot(r.x - q.x, r.z - q.z) < 2.4)) return true;
    if (LANTERNS.some((l) => Math.hypot(l.x - q.x, l.z - q.z) < 1.0) || PATH_LAMPS.some((l) => Math.hypot(l.x - q.x, l.z - q.z) < 0.6)) return true;
    if (q.z > 5 && q.z < 47 && Math.abs(q.x - forestPathX(q.z)) < 6.5) return true; // 일주문 숲길 (넓은 길)
    if (nearOther(P, q)) return true;
    return (P.nearest(q.x, q.z)?.d ?? 0) < FENCE_OFF - 0.05; // 굽은 안쪽에서 길 쪽으로 파고드는 자리
  };
  for (const P of PATHS) {
    for (const side of [-1, 1]) {
      let cur = null;
      for (let s = 0; s <= P.length; s += FENCE_STEP) {
        const q = offsetOn(P, s, side, FENCE_OFF);
        const style = P === trail && STONE_RUNS.some(([a, b]) => s >= a && s <= b) ? 'stone' : 'wood';
        if (blocked(P, q)) {
          cur = null;
          continue;
        }
        if (!cur || cur.style !== style) {
          cur = { style, path: P, side, pts: cur && cur.style !== style ? [cur.pts[cur.pts.length - 1]] : [] };
          runs.push(cur);
        }
        cur.pts.push(q);
      }
    }
  }
  return runs.filter((r) => r.pts.length >= 2);
}
