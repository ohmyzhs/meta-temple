/**
 * 실시간 동석 관심 영역 (server.js 틱이 쓴다 — 서버를 띄우지 않고 시험할 수 있게 따로 둔다).
 * 이 거리(m) 안의 도반은 0.2초마다, 밖은 1초마다 — 지난번 보낸 뒤 바뀐 사람만 (새 클라이언트 v2, 'pv').
 * 화면 밖·카메라 뒤를 거르는 일은 클라이언트가 매 프레임 한다 (avatarManager _crowdLod) — 서버는 시선을 0.2초 늦게 알아,
 * 서버가 시야로 거르면 돌아볼 때 사람이 늦게 튀어나온다.
 */
export const NEAR = 40;

export const row = (p) => [p.sid, p.name, p.style, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.a, p.n];

/**
 * 받는 사람 p 에게 보낼 'pv' (v2): 지난번 보낸 뒤 바뀐 도반만 — NEAR 안은 매 틱, 밖은 1초(slow)마다.
 * ids(같은 방 사람 명단)는 드나듦이 있을 때만: 클라이언트는 이 명단으로만 지운다 (멀어서 안 온 사람을 지우지 않게)
 */
export function relevantUpdate(p, ready, slow, roster) {
  const peers = [];
  for (const q of ready) {
    if (q === p || p.sent.get(q.sid) === q.ver) continue;
    if (!slow && Math.hypot(q.x - p.x, q.z - p.z) > NEAR) continue;
    peers.push(row(q));
    p.sent.set(q.sid, q.ver);
  }
  const key = roster.join(',');
  const m = { t: 'pv', count: ready.length, peers };
  if (p.rosterKey !== key) {
    p.rosterKey = key;
    m.ids = roster.filter((s) => s !== p.sid);
    for (const sid of p.sent.keys()) if (!roster.includes(sid)) p.sent.delete(sid);
  }
  return peers.length || m.ids ? m : null;
}
