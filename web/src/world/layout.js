/**
 * 가람 배치 좌표 계약 (docs/02 §1).
 * 모든 월드 모듈이 이 파일 하나의 높이·영역·충돌 함수를 공유한다.
 * 단위 m, +Y 위, -Z 북쪽(산 쪽). 스폰은 (0, 0, 34) 일주문 남쪽.
 */
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { forestPathX, nearestTrail, setTrailProfile, crossingAt, crossingY, deckRise, deckRiseAt, DECK, trail, TRAIL_HALF, REST_SPOTS, inLookoutView, trailDistFar, fenceBarrier, FLOOR_REACH } from './trail.js';

const perlin = new ImprovedNoise();
export const noise2 = (x, z) => perlin.noise(x, 0.37, z);

export function fbm(x, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
export { clamp, smooth, lerp };

/* ───── 주요 좌표 ───── */
export const L = {
  forest: { zStart: 46, zEnd: 6.6 },
  gate: { x: 0, z: 27 },                     // 일주문
  bridge: { x: 0, halfLen: 3.6, halfWidth: 1.5, rise: 0.75 },
  courtyard: { x0: -18.6, x1: 18.6, z0: -15.4, z1: 4.6, y: 1.0 },
  courtStairs: { halfW: 2.2, z0: 4.6, z1: 7.0 },
  // 서쪽 마당 (계절 행사 예비 마당 — 짚불 태우기 등을 나중에 여기서, 지금은 벤치·돌·그늘 쉼터만 가장자리에)
  // 앞마당과 같은 높이. 앞마당 서쪽 담의 협문(westGate)과 대웅전 서쪽 옆마당(hallYard)으로 이어진다.
  westCourt: { x0: -33, x1: -19.6, z0: -33, z1: 4.6 },
  hallYard: { x0: -19.6, x1: -16.2, z0: -33, z1: -15.4 }, // x1 = 기단 서쪽 끝
  westGate: { z0: -12.9, z1: -9.9 },
  westReserve: { x: -26.3, z: -13, rx: 5, rz: 12 }, // 예비 마당 한가운데 비워 둘 타원 (소품·나무를 두지 않는다)
  pagoda: { x: 0, z: -5, radius: 4.5 },      // 탑돌이 반경 4.5m
  stoneLanternFront: { x: 0, z: -12.2 },
  bell: { x: 14.4, z: -12.0 },               // 범종각 (동쪽 담 통로를 비켜 둔다)
  brazier: { x: -12, z: -7 },                // 번뇌 소각 화로
  tileRack: { x: -16.2, z: -4.5 },           // 기와 불사대 (동쪽을 봄)
  lanternRows: { xs: [-9.5, -6.5, -3.5, 3.5, 6.5, 9.5], z0: 1.8, z1: -12.6, y: 5.6 },
  hallStairs: { halfW: 2.6, z0: -15.4, z1: -18.6 },
  stylobate: { x0: -16.2, x1: 16.2, z0: -41.4, z1: -18.6, y: 2.8 },
  // 대웅전: 정면 5칸 × 측면 3칸, 중층(아래·위 두 겹 지붕) — 사용자 2026-11-07 「천장 두 배 이상, 진짜 웅장하게」.
  // 22×13m·기둥 5m → 28.8×19m·기둥(=천장) 12m (실내 부피 약 4.6배). 앞(z1)·계단·도착점은 그대로, 뒤·옆·위로 키웠다.
  // 옆 한계: 서쪽 옆마당(hallYard) 폭 3.4m 를 남긴다. 뒤 한계: 산책로(z ≈ −48)까지 기단 뒤 6.6m.
  hall: {
    x0: -14.4, x1: 14.4, z0: -39.4, z1: -20.4, floorY: 3.0, colH: 12.0,
    skirtY: 6.4, // 아랫지붕(차양)이 벽에 붙는 높이 (마루에서) — 바깥은 두 층, 안은 한 덩어리로 트인 12m
    xs: [-14.4, -9.6, -3.8, 3.8, 9.6, 14.4],
    zs: [-39.4, -33.07, -26.73, -20.4]
  },
  altar: { z: -35.6 }, // 불단 중심 = 뒷벽 + 3.8
  teahouseTerrace: { x0: 17.6, x1: 33, z0: -19, z1: -1, y: 1.2 },
  teaLink: { x0: 17.2, x1: 20, z0: -9.6, z1: -2.6 },
  pond: { x: 23.6, z: -3.7, rx: 3.6, rz: 2.2, waterY: 0.92 },
  teahouse: { x: 27.2, z: -12.5, halfW: 2.6, halfD: 4.6 },    // 심검당 (서쪽을 봄, 긴 축은 z)
  teaSeat: { x: 23.75, z: -12.5, y: 1.72 },
  bamboo: { x0: 30.5, x1: 40, z0: -24, z1: 0 },
  bambooEast: { x0: 43, x1: 56, z0: -37, z1: -1 }, // 순환 산책로 동쪽 대숲
  spawn: { x: 0, z: 36 }
};

/** 경내 마당들 (모두 L.courtyard.y 높이): 앞마당 + 서쪽 마당 + 대웅전 서쪽 옆마당 */
export const COURTS = [L.courtyard, L.westCourt, L.hallYard];
export function inCourts(x, z, pad = 0) {
  return COURTS.some((r) => inRect(x, z, r.x0 - pad, r.x1 + pad, r.z0 - pad, r.z1 + pad));
}

/** 마당 마사토 면인가 (담 밑 0.3m 까지, 앞 석축 쪽은 0.05m) — terrain.js 바닥색 · real/outdoor.js 바닥 층이 같이 쓴다 */
export function onCourtGround(x, z) {
  return COURTS.some((r) => x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.05);
}

/** 마당 면에서 가장 가까운 담·석축·기단까지 거리 (가장자리를 살짝 어둡게). 마당끼리 트인 곳은 가장자리가 아니다 */
export function courtEdge(x, z) {
  const c = L.courtyard, wc = L.westCourt, hy = L.hallYard;
  if (z < c.z0) return Math.min(x - wc.x0, z - wc.z0, hy.x1 - x); // 서쪽 마당 북쪽 + 옆마당
  if (x >= c.x0 - 0.5) return Math.min(x - c.x0, c.x1 - x, c.z1 - z, x > hy.x1 ? z - c.z0 : Infinity);
  return Math.min(x - wc.x0, wc.z1 - z, c.x0 - 0.5 - x); // 서쪽 마당 남쪽: 앞마당과 사이 담까지
}

/* 숲길 중심선 — 완만한 S자 (식은 trail.js 에, 순환 산책로 갈림목이 같은 선을 쓴다) */
export function pathX(z) {
  return forestPathX(z);
}
L.bridge.x = pathX(15);
L.gate.x = pathX(L.gate.z);

/**
 * 지붕이 덮는 곳: 이 상자 안, 이 높이 아래로는 비·눈·낙엽이 들이치지 않고 바닥이 젖거나 눈이 쌓이지 않는다.
 * [x0, z0, x1, z1, y] — y 는 지붕 밑면 최저점(위로 쏜 광선으로 잰 값: 대웅전 8.19, 심검당 4.77, 범종각 5.35, 정자 4.28)에서 0.1m 뺀 값.
 * 상자는 처마 안쪽이라 처마 끝 바로 밖에는 비가 그대로 떨어진다.
 */
export const ROOF_COVERS = [
  [-16.9, -41.9, 16.9, -17.9, 8.28], // 대웅전 (중층 5×3칸: 기둥 줄에서 2.5m 밖까지, 밑면 최저 8.38 — 아랫지붕 옆 처마, 위로 쏜 광선)
  [23.2, -18.5, 31.2, -6.5, 4.67], // 심검당
  [11.0, -15.4, 17.8, -8.6, 5.25], // 범종각
  [25.95, -4.9, 29.55, -1.3, 4.18] // 연못 정자
];
/** GLSL: float roofCover(vec3 worldPos) → 지붕 밑이면 1 */
export const ROOF_COVER_GLSL = `float roofCover(vec3 p) {
  float c = 0.0;
${ROOF_COVERS.map(([x0, z0, x1, z1, y]) => `  c = max(c, step(${x0.toFixed(2)}, p.x) * step(p.x, ${x1.toFixed(2)}) * step(${z0.toFixed(2)}, p.z) * step(p.z, ${z1.toFixed(2)}) * step(p.y, ${y.toFixed(2)}));`).join('\n')}
  return c;
}`;

/* 숲길 높이 — 남쪽 0.0 → 마당 앞 0.5 */
export function pathY(z) {
  return 0.5 * clamp((46 - z) / 39.4, 0, 1);
}

/* 계곡 중심선 (동서로 흐름) */
export function streamZ(x) {
  return 15 + 1.5 * Math.sin(x * 0.085) + 0.7 * Math.sin(x * 0.21 + 0.6);
}
export const STREAM_WATER_Y = -0.55;
export const STREAM_HALF = 3.2;

/* 사찰 경내(평탄부) 바깥으로 갈수록 산이 솟는다 */
function coreDistance(x, z) {
  // 둥근 사각형 [-42,40]×[-40,58] — 서쪽·남쪽만 넓혀 순환 산책로(서쪽 굽이길·남서 데크)가 산자락 발치를 지나게
  const X0 = -42, X1 = 40, Z0 = -40, Z1 = 58, r = 14;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, hx = (X1 - X0) / 2, hz = (Z1 - Z0) / 2;
  const qx = Math.abs(x - cx) - (hx - r);
  const qz = Math.abs(z - cz) - (hz - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qz), 0) - r;
}

function naturalHeight(x, z) {
  const d = coreDistance(x, z);
  let h = 0.9 * fbm(x * 0.045, z * 0.045, 4) + 0.35 * fbm(x * 0.16 + 9, z * 0.16, 2);
  // 경내 밖으로 산자락
  const out = Math.max(d + 6, 0);
  h += out * 0.22 + Math.pow(out, 1.45) * 0.035 + out * 1.2 * Math.max(fbm(x * 0.02 + 3, z * 0.02 - 7, 3), -0.2);
  // 북쪽(대웅전 뒤) 주산은 더 높게
  const north = smooth(-26, -70, z);
  h += north * (12 + 10 * fbm(x * 0.03, z * 0.03 + 11, 3)) * smooth(60, 0, Math.abs(x - 4));
  return h;
}

function rectMask(x, z, x0, x1, z0, z1, fall) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dz = Math.max(z0 - z, 0, z - z1);
  const d = Math.hypot(dx, dz);
  return fall <= 0 ? (d === 0 ? 1 : 0) : 1 - smooth(0, fall, d);
}

/**
 * 지형 높이 (렌더·이동 공용). 계단은 경사로로 근사하고 계단 메쉬가 위를 덮는다.
 */
function forestBandAt(z) {
  return smooth(L.forest.zEnd - 6, L.forest.zEnd + 1, z) * (1 - smooth(52, 60, z));
}

/** 자연 지형 + 숲길 회랑 (순환 산책로 높이 단면을 잴 바탕) */
function baseHeight(x, z) {
  const h = naturalHeight(x, z);
  // 숲길 회랑: 길 주변은 길 높이에 가깝게, 멀어질수록 자연 지형
  const dPath = Math.abs(x - pathX(z));
  const corridor = (1 - smooth(3, 16, dPath)) * forestBandAt(z);
  const forestY = pathY(z) + 0.18 * fbm(x * 0.2, z * 0.2, 2) * smooth(2.2, 5, dPath);
  return lerp(h, forestY, corridor);
}
setTrailProfile(baseHeight);

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  const forestBand = forestBandAt(z);

  // 1. 순환 산책로 회랑: 반폭 2m 까지 길 높이, 6.5m 에서 자연 지형
  const tr = nearestTrail(x, z);
  if (tr) h = lerp(h, tr.h + 0.12 * fbm(x * 0.2 + 5, z * 0.2, 2) * smooth(1.6, 3.5, tr.d), 1 - smooth(TRAIL_HALF + 0.5, 6.5, tr.d));

  // 2. 계곡
  const sd = Math.abs(z - streamZ(x));
  if (sd < STREAM_HALF + 2) {
    const carve = 1 - smooth(1.1, STREAM_HALF + 1.4, sd);
    const bed = STREAM_WATER_Y - 0.45 + 0.15 * noise2(x * 0.7, z * 0.7);
    h = lerp(h, Math.min(h, bed), carve);
  }

  // 3. 마당 석축 아래 완충 (z 4.6 → 8): 숲 높이로 정리
  const fore = rectMask(x, z, -22, 22, 4.6, 8.5, 2.5);
  h = lerp(h, pathY(z) + 0.02 * noise2(x, z), fore * forestBand);

  // 4. 마당 (석축으로 둘러싼 평탄면)
  const c = L.courtyard;
  const court = rectMask(x, z, c.x0, c.x1, c.z0, c.z1, 0);
  const courtSoft = rectMask(x, z, c.x0 - 1.2, c.x1 + 1.2, c.z0 - 1.2, c.z1, 3.5) * (z < c.z1 ? 1 : 0);
  h = lerp(h, Math.max(h, c.y + 0.2), courtSoft * 0.85);
  if (court) h = c.y;

  // 5. 마당 → 다실 연결부 & 다실 터
  const t = L.teahouseTerrace;
  const teaSoft = rectMask(x, z, t.x0, t.x1, t.z0, t.z1, 4);
  h = lerp(h, t.y, teaSoft);
  const link = L.teaLink;
  if (rectMask(x, z, link.x0, link.x1, link.z0, link.z1, 0)) h = lerp(c.y, t.y, smooth(link.x0, link.x1, x));

  // 6. 연못
  const p = L.pond;
  const pd = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
  if (pd < 1.35) h = lerp(h, p.waterY - 0.7, 1 - smooth(0.82, 1.18, pd));

  // 7. 대웅전 기단 & 뒤뜰
  const s = L.stylobate;
  // 서쪽은 옆마당(hallYard)이 기단에 붙으므로 돋운 뒤뜰을 기단 안쪽(+2.5m)에서부터 낮춘다 — 옆마당 북쪽 담 너머로 흙이 솟지 않게
  const back = rectMask(x, z, s.x0 + 2.5, s.x1 + 4, s.z0 - 5, s.z1, 4);
  h = lerp(h, Math.max(h, s.y + 0.3), back * smooth(s.z1, s.z0, z));
  if (rectMask(x, z, s.x0, s.x1, s.z0, s.z1, 0)) h = s.y;

  // 7b. 서쪽 마당·대웅전 옆마당: 앞마당 높이로 평평하게 (담 밑까지). 담 밖 낮은 땅은 둑처럼 완만히 돋운다
  const wc = L.westCourt, hy = L.hallYard;
  const bank = Math.max(rectMask(x, z, wc.x0 - 0.9, c.x0, wc.z0 - 0.9, wc.z1, 2.5) * (z < wc.z1 ? 1 : 0), rectMask(x, z, hy.x0, hy.x1, hy.z0 - 0.9, hy.z1, 2.5)); // 앞(남)은 석축이 맡는다
  if (bank > 0 && !(x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1)) h = lerp(h, Math.max(h, c.y - 0.08), bank);
  if (inRect(x, z, wc.x0 - 0.9, c.x0, wc.z0 - 0.9, wc.z1) || (x < hy.x1 && inRect(x, z, hy.x0, hy.x1, hy.z0 - 0.9, hy.z1))) h = c.y;

  // 8. 계단 경사로
  const cs = L.courtStairs;
  if (Math.abs(x) <= cs.halfW && z >= cs.z0 && z <= cs.z1) h = lerp(c.y, pathY(cs.z1), (z - cs.z0) / (cs.z1 - cs.z0));
  const hs = L.hallStairs;
  if (Math.abs(x) <= hs.halfW && z <= hs.z0 && z >= hs.z1) h = lerp(c.y, s.y, (hs.z0 - z) / (hs.z0 - hs.z1));

  return h;
}

/* 걷는 높이 — 지형 + 다리 아치 + 산책로 건너는 곳(나무다리·징검다리) + 전나무숲 데크 + 법당 마루 */
export function walkHeight(x, z) {
  const cr = crossingAt(x, z, 0.05);
  if (cr) return crossingY(cr, z);
  const b = L.bridge;
  const sz = streamZ(x);
  if (Math.abs(x - b.x) <= b.halfWidth + 0.2 && Math.abs(z - sz) <= b.halfLen) {
    const u = (z - sz) / b.halfLen;
    const deckBase = pathY(sz);
    return deckBase + b.rise * Math.cos((u * Math.PI) / 2) + 0.05;
  }
  const hl = L.hall;
  if (x > hl.x0 && x < hl.x1 && z > hl.z0 && z < hl.z1) return hl.floorY;
  return terrainHeight(x, z) + deckRiseAt(nearestTrail(x, z));
}

/* ───── 이동 가능 영역 ───── */
export function zoneAt(x, z) {
  const hl = L.hall;
  if (x > hl.x0 - 0.2 && x < hl.x1 + 0.2 && z > hl.z0 && z < hl.z1 + 0.3) return 'DAEUNGJEON';
  // 순환 산책로는 마당·다실 마당 안으로 들어서기 전까지 어디든 숲길 (능선·대숲이 마당·다실로 잡히지 않게)
  const c = L.courtyard, t = L.teahouseTerrace;
  if (!inRect(x, z, c.x0 - 0.5, c.x1 + 0.5, c.z0 - 3, c.z1 + 0.6) && !inCourts(x, z, 0.6) && !inRect(x, z, t.x0, t.x1, t.z0, t.z1) && ((nearestTrail(x, z)?.d ?? 99) < 4.2 || onForestFloor(x, z))) return 'FOREST'; // 4.2: 길가 쉼터 자리, 그 밖은 열린 숲 바닥
  if (x > L.teahouseTerrace.x0 + 0.4 || (x > 16.5 && z < -2.6 && z > -9.6 && x > L.teaLink.x0 + 1.4)) return 'TEAHOUSE';
  if (z <= L.courtyard.z1 + 0.6) return 'COURTYARD';
  return 'FOREST';
}

function inRect(x, z, x0, x1, z0, z1) {
  return x >= x0 && x <= x1 && z >= z0 && z <= z1;
}

/** 걸을 수 있는 땅: 길(엄격) + 산책로 둘레 숲 바닥 */
export function isWalkable(x, z) {
  return isOnPath(x, z) || onForestFloor(x, z);
}

const SLOPE = new Map(); // 1m 칸 → 걸을 만한가 (지형 기울기 45% 아래)
function gentle(x, z) {
  const gx = Math.floor(x), gz = Math.floor(z), k = gx * 4096 + gz;
  let v = SLOPE.get(k);
  if (v === undefined) {
    const cx = gx + 0.5, cz = gz + 0.5, e = 0.8;
    const hx = (terrainHeight(cx + e, cz) - terrainHeight(cx - e, cz)) / (2 * e);
    const hz = (terrainHeight(cx, cz + e) - terrainHeight(cx, cz - e)) / (2 * e);
    v = Math.hypot(hx, hz) < 0.45;
    SLOPE.set(k, v);
  }
  return v;
}

/**
 * 산책로 둘레 숲 바닥 (중간 방안): 길에서 FLOOR_REACH(10m) 안, 울타리 띠·계곡·대숲·경내(마당·다실 마당·법당 둘레)·가파른 비탈 밖.
 * 0.45m 지형 격자 안이라 발이 땅에 맞는다. 나무·큰 바위는 충돌체가 있다 (vegetation.js·terrain.js).
 */
export function onForestFloor(x, z) {
  if (x < -60 || x > 60 || z < -56 || z > 60) return false;
  if (trailDistFar(x, z) > FLOOR_REACH) return false;
  if (fenceBarrier(x, z)) return false;
  if (Math.abs(z - streamZ(x)) < 3.2) return false;
  for (const b of [L.bamboo, L.bambooEast]) if (inRect(x, z, b.x0 - 0.6, b.x1 + 0.6, b.z0 - 0.6, b.z1 + 0.6)) return false;
  const c = L.courtyard, t = L.teahouseTerrace, s = L.stylobate;
  if (inRect(x, z, c.x0 - 2.5, c.x1 + 2.5, c.z0 - 4, c.z1 + 3.5) || inCourts(x, z, 2.5)) return false;
  if (inRect(x, z, t.x0 - 1, t.x1 + 1, t.z0 - 5, t.z1 + 1)) return false;
  if (inRect(x, z, s.x0 - 4, s.x1 + 4, s.z0 - 6, s.z1)) return false;
  return gentle(x, z);
}

/** 길만 (산책로 띠·숲길·경내) — 나무를 심지 않는 자리 판단에 쓴다 */
export function isOnPath(x, z) {
  // 순환 산책로 (계곡은 작은 나무다리로만 건넌다)
  const tr = nearestTrail(x, z);
  if (tr && tr.d <= TRAIL_HALF) {
    if (tr.path === trail && deckRise(tr.s) > 0 && tr.d > DECK.halfW) return false; // 데크 판 밖은 허공
    return Math.abs(z - streamZ(x)) >= 2.6 || !!crossingAt(x, z);
  }
  // 서쪽 마당·옆마당 (담에서 0.5m 안쪽, 기단 옆면에서 0.4m), 앞마당 서쪽 담의 협문 — 법당 계단 띠 판정보다 먼저
  const wc = L.westCourt, hy = L.hallYard, g = L.westGate;
  if (inRect(x, z, wc.x0 + 0.5, wc.x1, wc.z0 + 0.5, wc.z1)) return true;
  if (inRect(x, z, hy.x0, hy.x1 - 0.4, hy.z0 + 0.5, hy.z1 + 0.01)) return true;
  if (inRect(x, z, wc.x1 - 0.01, L.courtyard.x0 + 0.51, g.z0 + 0.3, g.z1 - 0.3)) return true;
  // 숲길 (계곡은 다리로만 건넌다)
  if (z > L.courtStairs.z1 - 0.2 && z < 47) {
    if (Math.abs(x - pathX(z)) > 6.5) return false;
    const sd = Math.abs(z - streamZ(x));
    if (sd < 2.3 && Math.abs(x - L.bridge.x) > L.bridge.halfWidth) return false;
    return true;
  }
  const cs = L.courtStairs;
  if (z >= cs.z0 - 0.01 && z <= cs.z1) return Math.abs(x) <= cs.halfW - 0.3;
  const c = L.courtyard;
  if (inRect(x, z, c.x0 + 0.5, c.x1 - 0.5, c.z0, c.z1)) return true;
  const hs = L.hallStairs;
  if (z < hs.z0 && z >= hs.z1) return Math.abs(x) <= hs.halfW - 0.3;
  const s = L.stylobate;
  if (inRect(x, z, s.x0 + 0.5, s.x1 - 0.5, s.z0 + 0.5, s.z1)) return true;
  const link = L.teaLink;
  if (inRect(x, z, link.x0, link.x1, link.z0 + 0.4, link.z1 - 0.4)) return true;
  const t = L.teahouseTerrace;
  if (inRect(x, z, t.x0, t.x1 - 1.5, t.z0 + 0.8, t.z1 - 0.6)) {
    const p = L.pond;
    if (Math.hypot((x - p.x) / (p.rx + 0.35), (z - p.z) / (p.rz + 0.35)) < 1) return false;
    return true;
  }
  return false;
}

/* ───── 충돌체 (원·축정렬 박스, 2D) ───── */
// h: 땅에서 잰 높이 — 걷기에는 쓰지 않고, 카메라 팔(templeScene ARM)이 이 높이 위로는 지나간다
export const COLLIDER_H = 2.5;
export const colliders = [];
// 4m 칸 격자: 칸마다 그 칸에 닿는 충돌체 (몸 반지름·카메라 여유 0.6m 포함). 숲 바닥을 열며 나무 충돌체가 수백 개 늘어 한 걸음마다 다 훑지 않게
const CGRID = new Map(), CCELL = 4, CPAD = 0.6;
function gridAdd(c, x0, z0, x1, z1) {
  for (let gx = Math.floor((x0 - CPAD) / CCELL); gx <= Math.floor((x1 + CPAD) / CCELL); gx++) {
    for (let gz = Math.floor((z0 - CPAD) / CCELL); gz <= Math.floor((z1 + CPAD) / CCELL); gz++) {
      const k = gx * 4096 + gz;
      if (!CGRID.has(k)) CGRID.set(k, []);
      CGRID.get(k).push(c);
    }
  }
}
/** (x,z) 칸에 닿는 충돌체들 (몸·카메라 반지름 0.6m 까지는 빠짐없이) */
export function collidersNear(x, z) {
  return CGRID.get(Math.floor(x / CCELL) * 4096 + Math.floor(z / CCELL)) || [];
}
/** 선분 근처 칸들의 충돌체 (중복 없이) — 카메라 팔(templeScene ARM)처럼 긴 선을 검사할 때. pad: 선 둘레로 더 볼 너비 */
export function collidersAlong(x0, z0, x1, z1, pad) {
  const out = new Set();
  const gx0 = Math.floor((Math.min(x0, x1) - pad) / CCELL), gx1 = Math.floor((Math.max(x0, x1) + pad) / CCELL);
  const gz0 = Math.floor((Math.min(z0, z1) - pad) / CCELL), gz1 = Math.floor((Math.max(z0, z1) + pad) / CCELL);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) for (const c of CGRID.get(gx * 4096 + gz) || []) out.add(c);
  return out;
}
export function addCircleCollider(x, z, r, h = COLLIDER_H) {
  const c = { type: 'c', x, z, r, h };
  colliders.push(c);
  gridAdd(c, x - r, z - r, x + r, z + r);
}
export function addBoxCollider(x0, z0, x1, z1, h = COLLIDER_H) {
  const c = { type: 'b', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h };
  colliders.push(c);
  gridAdd(c, c.x0, c.z0, c.x1, c.z1);
}

/** 반경 r 인 몸을 (x,z)로 옮길 때 충돌을 밀어낸 위치를 돌려준다 */
export function resolveCollisions(x, z, r = 0.32) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of collidersNear(x, z)) {
      if (c.type === 'c') {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-5) {
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
        }
      } else {
        const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
        const dx = x - cx, dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-5) {
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // 박스 안쪽 — 가장 가까운 면으로
            const pushes = [x - c.x0, c.x1 - x, z - c.z0, c.z1 - z];
            const m = Math.min(...pushes);
            if (m === pushes[0]) x = c.x0 - r;
            else if (m === pushes[1]) x = c.x1 + r;
            else if (m === pushes[2]) z = c.z0 - r;
            else z = c.z1 + r;
          }
        }
      }
    }
  }
  return { x, z };
}

/** 이동 한 걸음: 막히면 축별로 미끄러진다 */
export function stepMove(x, z, nx, nz, r = 0.32) {
  const tryPos = (ax, az) => {
    const p = resolveCollisions(ax, az, r);
    return isWalkable(p.x, p.z) ? p : null;
  };
  return tryPos(nx, nz) || tryPos(nx, z) || tryPos(x, nz) || { x, z };
}

/* 나무 심기 금지 영역 */
export function isClearForTree(x, z, margin = 0) {
  if (isOnPath(x, z)) return false; // 열린 숲 바닥에는 나무를 그대로 심는다 (충돌체로 비켜 걷는다)
  if ((nearestTrail(x, z)?.d ?? 99) < 3.4 + margin) return false;
  for (const s of REST_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 4 + margin) return false;
  if (inLookoutView(x, z)) return false;
  if (Math.abs(x - pathX(z)) < 4.2 + margin && z > 5 && z < 50) return false;
  if (Math.abs(z - streamZ(x)) < 2.6 && Math.abs(x) < 70) return false;
  const c = L.courtyard;
  if (inRect(x, z, c.x0 - 2.5 - margin, c.x1 + 2.5 + margin, c.z0 - 2 - margin, c.z1 + 1)) return false;
  if (inCourts(x, z, 2.5 + margin)) return false;
  const s = L.stylobate;
  if (inRect(x, z, s.x0 - 3 - margin, s.x1 + 3 + margin, s.z0 - 3 - margin, s.z1 + 2)) return false;
  const t = L.teahouseTerrace;
  if (inRect(x, z, t.x0 - 1 - margin, t.x1 + margin, t.z0 - 2 - margin, t.z1 + 2 + margin)) return false;
  for (const b of [L.bamboo, L.bambooEast]) if (inRect(x, z, b.x0 - 1, b.x1 + 1, b.z0 - 1, b.z1 + 1)) return false;
  return true;
}

/**
 * 돌탑을 쌓을 수 있는 땅 (요구 8): 산문 밖(숲길·순환 산책로)의 걸을 수 있는 곳 가운데
 * 다리 위·쉼터 자리·석등·나무 같은 충돌체 바로 옆이 아닌 곳.
 */
export function canBuildCairn(x, z) {
  if (!isWalkable(x, z) || zoneAt(x, z) !== 'FOREST') return false;
  if (crossingAt(x, z, 0.5)) return false;
  const tr = nearestTrail(x, z);
  if (tr?.path === trail && tr.s > DECK.s0 - 1 && tr.s < DECK.s1 + 1) return false; // 데크 위 (돌탑이 판 밑에 묻힌다)
  const b = L.bridge;
  if (Math.abs(x - b.x) <= b.halfWidth + 0.5 && Math.abs(z - streamZ(x)) <= b.halfLen + 0.5) return false;
  for (const s of REST_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 1.8) return false;
  const p = resolveCollisions(x, z, 0.5);
  return Math.hypot(p.x - x, p.z - z) < 1e-3;
}
