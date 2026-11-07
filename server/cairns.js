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

/* ───── 길가 (사용자 2026-11-08 「길바닥 아무 데나 쌓지 말고 근처 길가로」) ─────
 * 돌탑은 걷는 길 위가 아니라 길가에. 화면과 서버가 같은 자료(roadsideGeo.js, trail.js 에서 만든다)로 같은 답을 낸다 —
 * 나무·바위 충돌체처럼 화질에 따라 달라지는 것은 보지 않으므로 어느 기기에서나 같은 자리에 그려진다.
 * geo: { paths: [[x0,z0,x1,z1,…]…] 걷는 길 중심선, stream: [x,z,…] 계곡 중심선, discs: [x,z,r,…] 비워 둘 자리(석등·일주문·쉼터…),
 *        rects: [x0,x1,z0,z1,…] 비워 둘 사각형(앞마당·석축) }
 * 길에서 먼 탑(옛 길 자리에 남은 탑)은 옮기지 않는다 — 이 규칙은 비탈을 몰라, 가까운 길가가 가파른 산비탈(밑돌 0.7m 에 0.9m 높낮이)이면 더 나빠진다.
 * 거리는 실측 (tools/qa/cairn-roadside.mjs, 중심선에서): 다져진 흙길(지면 aTrod 0.5) 끝 순환로 1.39m(95%)·최대 1.53m, 숲길 1.79m,
 * 울타리 기둥 1.90m, 넘어 다닐 수 없는 울타리 띠 끝 2.45m (trail.js fenceBarrier). 그 밖에 밑돌(반지름 약 0.35m)을 놓는다.
 */
export const ROADSIDE = 2.8; // 길가 돌탑을 놓는 거리 (중심선에서)
export const ROADSIDE_MIN = 2.5; // 이보다 가까우면 길 위 (서버가 받을 때 다시 잰다 — 자료를 1m 로 솎아 몇 cm 어긋나도 그대로 두게 0.3m 여유)
export const ROADSIDE_REACH = 8; // 길을 따라 앞뒤로 이만큼까지 찾는다
export const STREAM_CLEAR = 3.4; // 계곡 중심선에서 (STREAM_HALF 3.2 + 0.2)

const LENS = new WeakMap();
function lens(p) {
  let S = LENS.get(p);
  if (!S) {
    S = [0];
    for (let i = 2; i < p.length; i += 2) S.push(S[S.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    LENS.set(p, S);
  }
  return S;
}

/** 꺾은선(납작한 [x,z,…])에서 가장 가까운 점 { d, i(마디), u, px, pz } */
function nearOn(p, x, z) {
  let best = null;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], vx = p[i + 2] - ax, vz = p[i + 3] - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1e-9)));
    const px = ax + vx * u, pz = az + vz * u, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, i: i / 2, u, px, pz };
  }
  return best;
}

/** 가장 가까운 걷는 길 { d, k(길 번호), i, u, px, pz } */
export function nearestPath(geo, x, z) {
  let best = null;
  geo.paths.forEach((p, k) => {
    const n = nearOn(p, x, z);
    if (n && (!best || n.d < best.d)) best = { ...n, k };
  });
  return best;
}

/** 길가 돌탑을 둘 수 있는 자리인가 (길 위·계곡·비워 둘 자리가 아니면) */
export function roadsideOk(x, z, geo) {
  const n = nearestPath(geo, x, z);
  if (n && n.d < ROADSIDE_MIN) return false;
  if (geo.stream && nearOn(geo.stream, x, z).d < STREAM_CLEAR) return false;
  const c = geo.discs || [];
  for (let i = 0; i < c.length; i += 3) if (Math.hypot(x - c[i], z - c[i + 1]) < c[i + 2]) return false;
  const q = geo.rects || [];
  for (let i = 0; i < q.length; i += 4) if (x >= q[i] && x <= q[i + 1] && z >= q[i + 2] && z <= q[i + 3]) return false;
  return true;
}

/**
 * (x,z) 둘레의 길가 후보: 가장 가까운 길을 따라 앞뒤 reach m 안, 양쪽(선 쪽 먼저) ROADSIDE·+0.6·+1.2m.
 * (x,z) 에서 가까운 순. 각 후보 { x, z, px, pz(길 위 점), nx, nz(길에서 돌탑 쪽 단위 벡터), off }
 */
export function roadsideCandidates(x, z, geo, reach = ROADSIDE_REACH) {
  const n = nearestPath(geo, x, z);
  if (!n) return [];
  const p = geo.paths[n.k], S = lens(p), last = S.length - 1;
  const s0 = S[n.i] + (S[n.i + 1] - S[n.i]) * n.u;
  const at = (s) => {
    let i = 0;
    while (i < last - 1 && S[i + 1] < s) i++;
    const seg = S[i + 1] - S[i] || 1, u = (s - S[i]) / seg;
    const tx = p[2 * i + 2] - p[2 * i], tz = p[2 * i + 3] - p[2 * i + 1], l = Math.hypot(tx, tz) || 1;
    return { x: p[2 * i] + tx * u, z: p[2 * i + 1] + tz * u, nx: -tz / l, nz: tx / l };
  };
  const q = at(s0);
  const side0 = Math.sign((x - q.x) * q.nx + (z - q.z) * q.nz) || 1;
  const out = [];
  for (let ds = -reach; ds <= reach + 1e-9; ds += 0.5) {
    const s = s0 + ds;
    if (s < 0 || s > S[last]) continue;
    const c = at(s);
    for (const side of [side0, -side0]) {
      for (const off of [ROADSIDE, ROADSIDE + 0.6, ROADSIDE + 1.2]) {
        out.push({ x: c.x + c.nx * side * off, z: c.z + c.nz * side * off, px: c.x, pz: c.z, nx: c.nx * side, nz: c.nz * side, off });
      }
    }
  }
  const d2 = (c) => (c.x - x) ** 2 + (c.z - z) ** 2;
  return out.sort((a, b) => d2(a) - d2(b));
}

const r2 = (v) => Math.round(v * 100) / 100;

/** 길 위의 돌탑 자리 → 가장 가까운 길가 { x, z, moved }. 이미 길가면 그대로, 둘레에 길가가 없어도 그대로 */
export function toRoadside(x, z, geo) {
  if (roadsideOk(x, z, geo)) return { x, z, moved: false };
  for (const c of roadsideCandidates(x, z, geo)) {
    const at = { x: r2(c.x), z: r2(c.z) };
    if (roadsideOk(at.x, at.z, geo)) return { ...at, moved: true };
  }
  return { x, z, moved: false };
}

/**
 * 탑 목록 [{id,x,z,n}] 을 길가로: 이미 길가인 탑은 그대로, 길 위의 탑(길가 규칙 전의 옛 탑)만 가까운 길가로 옮긴다.
 * 옮긴 탑끼리·남은 탑과 JOIN_RADIUS 안으로 겹치지 않게 (id 순서로 자리를 잡아 어느 기기에서나 같다). DB 는 그대로 두고 그릴 때만.
 * fits(x,z): 화면이 더 보는 조건 (바위·나무 충돌체·비탈 — world/layout.js canBuildCairn). 맞는 후보가 없으면 규칙만으로 고른 자리.
 */
export function roadsideList(list, geo, fits = () => true) {
  const placed = [], moving = [];
  for (const c of list) (roadsideOk(c.x, c.z, geo) ? placed : moving).push(c);
  const free = (x, z) => placed.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 >= JOIN_RADIUS * JOIN_RADIUS);
  const at = new Map();
  for (const c of moving.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let q = null;
    for (const k of roadsideCandidates(c.x, c.z, geo)) {
      const p = { x: r2(k.x), z: r2(k.z) };
      if (roadsideOk(p.x, p.z, geo) && free(p.x, p.z) && fits(p.x, p.z)) {
        q = p;
        break;
      }
    }
    const m = { ...c, ...(q || toRoadside(c.x, c.z, geo)) };
    delete m.moved;
    placed.push(m);
    at.set(c, m);
  }
  return list.map((c) => at.get(c) || c);
}
