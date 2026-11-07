/**
 * 돌탑 자리 고르기 (사용자 2026-11-08 「돌쌓기를 길바닥 아무 데나 할 수 있는 거 수정 → 근처 길가로 옮겨서 쌓을 것」).
 * 길 위에서 쌓으려 하면 길 가운데·데크·계단·석등·일주문·쉼터 앞을 비켜 가장 가까운 길가 자리를 찾고, 캐릭터가 설 곳도 함께 정한다.
 * 길가 판정은 서버와 같은 규칙(core/cairns.js roadsideOk + core/roadsideGeo.js), 그 위에 이 기기의 땅·충돌체(canBuildCairn)를 더 본다.
 */
import { canBuildCairn } from './layout.js';
import { roadsideOk, roadsideCandidates, findJoinable, areaCount, AREA_CAP, GATE_ID } from '../core/cairns.js';
import { ROADSIDE_GEO } from '../core/roadsideGeo.js';

const r2 = (v) => Math.round(v * 100) / 100;
const MAX_WALK = 6; // 이보다 멀리 걸어가야 하면 길가 자리를 내지 않는다 (순환로 한가운데서 평균 2.2m — 평탄 부지 안처럼 길에서 먼 곳에서 끌려가지 않게)

/**
 * (x,z) = 몸 앞 0.9m. list = 알려진 탑(+일주문 돌탑, 길가로 옮겨 그린 자리). standOk(x,z) = 캐릭터가 설 수 있는 칸인가.
 * → { at: 돌을 얹을 자리, cairn: 얹을 탑(없으면 새 탑), stand: 걸어가 설 자리(null 이면 지금 자리에서), moved } 또는 null
 */
export function pickCairnSpot(x, z, list, standOk) {
  const here = findJoinable(list, x, z);
  if (here) return here.id === GATE_ID ? null : { at: { x: here.x, z: here.z }, cairn: here, stand: null, moved: false };
  if (roadsideOk(x, z, ROADSIDE_GEO) && canBuildCairn(x, z)) return areaCount(list, x, z) >= AREA_CAP ? null : { at: { x, z }, cairn: null, stand: null, moved: false };
  for (const c of roadsideCandidates(x, z, ROADSIDE_GEO)) {
    if (!roadsideOk(c.x, c.z, ROADSIDE_GEO) || !canBuildCairn(c.x, c.z)) continue;
    const j = findJoinable(list, c.x, c.z);
    if (j?.id === GATE_ID || (!j && areaCount(list, c.x, c.z) >= AREA_CAP)) continue;
    const at = j ? { x: j.x, z: j.z } : { x: r2(c.x), z: r2(c.z) };
    // 설 자리: 탑 바로 앞(0.9m, 길 쪽), 울타리 띠라 못 서면 길 가장자리(중심선에서 1.05m)
    const stand = [
      { x: at.x - c.nx * 0.9, z: at.z - c.nz * 0.9 },
      { x: c.px + c.nx * 1.05, z: c.pz + c.nz * 1.05 }
    ].find((q) => standOk(q.x, q.z));
    if (stand && Math.hypot(stand.x - x, stand.z - z) <= MAX_WALK) return { at, cairn: j || null, stand, moved: true };
  }
  return null;
}
