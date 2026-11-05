/**
 * 돌탑 어디서나 (요구 8) — 서버·화면 공용 규칙 (DOM·three 없음, web/src/core/cairns.js 는 이 파일로 가는 링크).
 *  - 돌을 올린 자리 1.5m 안에 돌탑이 있으면 그 탑에 한 층 더, 없으면 그 자리에 새 돌탑 1층.
 *  - 한 구역(반경 5m)에 돌탑이 이미 6개면 새 탑은 세우지 않는다 (가까운 탑에 얹도록).
 *  - 그릴 때는 가까운 탑부터, 8m 칸마다 6개, 모두 합쳐 max 개까지만.
 * 탑: { id, x, z, n } — n 은 층(돌) 수. 일주문 옆 처음 돌탑은 id 'gate' (서버에는 cairn_id 가 없는 옛 돌).
 */
export const JOIN_RADIUS = 1.5;
export const AREA_RADIUS = 5;
export const AREA_CAP = 6;
export const GATE_ID = 'gate';
export const CAIRN_ID_RE = /^c_[0-9a-f-]{36}$/;
export const MAP_LIMIT = 250; // 좌표 절댓값 상한 (m)

const d2 = (c, x, z) => (c.x - x) ** 2 + (c.z - z) ** 2;

/** (x,z) 에서 r 안의 가장 가까운 탑, 없으면 null */
export function findJoinable(cairns, x, z, r = JOIN_RADIUS) {
  let best = null, bd = r * r;
  for (const c of cairns) {
    const d = d2(c, x, z);
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function areaCount(cairns, x, z, r = AREA_RADIUS) {
  let n = 0;
  for (const c of cairns) if (d2(c, x, z) <= r * r) n++;
  return n;
}

/**
 * 돌 하나를 (x,z) 에 올릴 때 어느 탑에 얹는가.
 * → { id, x, z, isNew } (가까운 탑이면 그 탑의 자리) 또는 구역이 꽉 찼으면 { full: true }
 */
export function placeStone(cairns, x, z, newId) {
  const c = findJoinable(cairns, x, z);
  if (c) return { id: c.id, x: c.x, z: c.z, isNew: false };
  if (areaCount(cairns, x, z) >= AREA_CAP) return { full: true };
  return { id: newId, x, z, isNew: true };
}

/** 그릴 탑 고르기: 가까운 것부터, 칸(cell m)마다 perCell 개, 모두 max 개 */
export function pickVisible(cairns, px, pz, { max = 36, cell = 8, perCell = 6 } = {}) {
  const sorted = [...cairns].sort((a, b) => d2(a, px, pz) - d2(b, px, pz));
  const used = new Map();
  const out = [];
  for (const c of sorted) {
    if (out.length >= max) break;
    const k = `${Math.floor(c.x / cell)},${Math.floor(c.z / cell)}`;
    const n = used.get(k) || 0;
    if (n >= perCell) continue;
    used.set(k, n + 1);
    out.push(c);
  }
  return out;
}

/** 공개 요청의 자리 필드 검사: 없으면 { place: null }(옛 화면 → 일주문 돌탑), 틀리면 { error } */
export function parsePlace(body) {
  if (body.cairnId == null && body.x == null && body.z == null) return { place: null };
  const x = Number(body.x), z = Number(body.z);
  if (!CAIRN_ID_RE.test(String(body.cairnId || '')) || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) {
    return { error: 'bad cairn' };
  }
  return { place: { cairnId: body.cairnId, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 } };
}
