/**
 * 가람 배치 좌표 계약 (docs/02 §1).
 * 모든 월드 모듈이 이 파일 하나의 높이·영역·충돌 함수를 공유한다.
 * 단위 m, +Y 위, -Z 북쪽(산 쪽). 스폰은 (0, 0, 34) 일주문 남쪽.
 */
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { forestPathX, nearestTrail, setTrailProfile, crossingAt, crossingY, deckRise, deckRiseAt, DECK, trail, TRAIL_HALF, REST_SPOTS, inLookoutView } from './trail.js';

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
  pagoda: { x: 0, z: -5, radius: 4.5 },      // 탑돌이 반경 4.5m
  stoneLanternFront: { x: 0, z: -12.2 },
  bell: { x: 14.4, z: -12.0 },               // 범종각 (동쪽 담 통로를 비켜 둔다)
  brazier: { x: -12, z: -7 },                // 번뇌 소각 화로
  tileRack: { x: -16.2, z: -4.5 },           // 기와 불사대 (동쪽을 봄)
  lanternRows: { xs: [-9.5, -6.5, -3.5, 3.5, 6.5, 9.5], z0: 1.8, z1: -12.6, y: 5.6 },
  hallStairs: { halfW: 2.6, z0: -15.4, z1: -18.6 },
  stylobate: { x0: -10.2, x1: 10.2, z0: -32.4, z1: -18.6, y: 2.8 },
  hall: { x0: -8, x1: 8, z0: -30.4, z1: -20.4, floorY: 3.0, height: 5.4 },
  altar: { z: -28.2 },
  teahouseTerrace: { x0: 17.6, x1: 33, z0: -19, z1: -1, y: 1.2 },
  teaLink: { x0: 17.2, x1: 20, z0: -9.6, z1: -2.6 },
  pond: { x: 23.6, z: -3.7, rx: 3.6, rz: 2.2, waterY: 0.92 },
  teahouse: { x: 27.2, z: -12.5, halfW: 2.6, halfD: 4.6 },    // 심검당 (서쪽을 봄, 긴 축은 z)
  teaSeat: { x: 23.75, z: -12.5, y: 1.72 },
  bamboo: { x0: 30.5, x1: 40, z0: -24, z1: 0 },
  bambooEast: { x0: 43, x1: 56, z0: -37, z1: -1 }, // 순환 산책로 동쪽 대숲
  spawn: { x: 0, z: 36 }
};

/* 숲길 중심선 — 완만한 S자 (식은 trail.js 에, 순환 산책로 갈림목이 같은 선을 쓴다) */
export function pathX(z) {
  return forestPathX(z);
}
L.bridge.x = pathX(15);
L.gate.x = pathX(L.gate.z);

/**
 * 지붕이 덮는 곳: 이 상자 안, 이 높이 아래로는 비·눈·낙엽이 들이치지 않고 바닥이 젖거나 눈이 쌓이지 않는다.
 * [x0, z0, x1, z1, y] — y 는 지붕 밑면 최저점(위로 쏜 광선으로 잰 값: 대웅전 7.54, 심검당 4.77, 범종각 5.35, 정자 4.28)에서 0.1m 뺀 값.
 * 상자는 처마 안쪽이라 처마 끝 바로 밖에는 비가 그대로 떨어진다.
 */
export const ROOF_COVERS = [
  [-10.5, -32.9, 10.5, -17.9, 7.44], // 대웅전
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
  const back = rectMask(x, z, s.x0 - 4, s.x1 + 4, s.z0 - 5, s.z1, 4);
  h = lerp(h, Math.max(h, s.y + 0.3), back * smooth(s.z1, s.z0, z));
  if (rectMask(x, z, s.x0, s.x1, s.z0, s.z1, 0)) h = s.y;

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
  if (!inRect(x, z, c.x0 - 0.5, c.x1 + 0.5, c.z0 - 3, c.z1 + 0.6) && !inRect(x, z, t.x0, t.x1, t.z0, t.z1) && (nearestTrail(x, z)?.d ?? 99) < 3) return 'FOREST';
  if (x > L.teahouseTerrace.x0 + 0.4 || (x > 16.5 && z < -2.6 && z > -9.6 && x > L.teaLink.x0 + 1.4)) return 'TEAHOUSE';
  if (z <= L.courtyard.z1 + 0.6) return 'COURTYARD';
  return 'FOREST';
}

function inRect(x, z, x0, x1, z0, z1) {
  return x >= x0 && x <= x1 && z >= z0 && z <= z1;
}

export function isWalkable(x, z) {
  // 순환 산책로 (계곡은 작은 나무다리로만 건넌다)
  const tr = nearestTrail(x, z);
  if (tr && tr.d <= TRAIL_HALF) {
    if (tr.path === trail && deckRise(tr.s) > 0 && tr.d > DECK.halfW) return false; // 데크 판 밖은 허공
    return Math.abs(z - streamZ(x)) >= 2.6 || !!crossingAt(x, z);
  }
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
export function addCircleCollider(x, z, r, h = COLLIDER_H) {
  colliders.push({ type: 'c', x, z, r, h });
}
export function addBoxCollider(x0, z0, x1, z1, h = COLLIDER_H) {
  colliders.push({ type: 'b', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h });
}

/** 반경 r 인 몸을 (x,z)로 옮길 때 충돌을 밀어낸 위치를 돌려준다 */
export function resolveCollisions(x, z, r = 0.32) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
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
  if (isWalkable(x, z)) return false;
  if ((nearestTrail(x, z)?.d ?? 99) < 3.4 + margin) return false;
  for (const s of REST_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 4 + margin) return false;
  if (inLookoutView(x, z)) return false;
  if (Math.abs(x - pathX(z)) < 4.2 + margin && z > 5 && z < 50) return false;
  if (Math.abs(z - streamZ(x)) < 2.6 && Math.abs(x) < 70) return false;
  const c = L.courtyard;
  if (inRect(x, z, c.x0 - 2.5 - margin, c.x1 + 2.5 + margin, c.z0 - 2 - margin, c.z1 + 1)) return false;
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
