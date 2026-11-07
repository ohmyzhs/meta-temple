// 위치만 별도로 저장해 수행 기록과 다른 방문 기록을 덮어쓰지 않는다.
const KEY = 'meta_temple_last_position_v1';

export function readLastPosition(storage = localStorage) {
  try {
    const p = JSON.parse(storage.getItem(KEY) || 'null');
    return p && [p.x, p.z, p.heading].every(Number.isFinite) ? p : null;
  } catch { return null; }
}

export function writeLastPosition(p, storage = localStorage) {
  if (!p || ![p.x, p.z, p.heading].every(Number.isFinite)) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ x: p.x, z: p.z, heading: p.heading }));
    return true;
  } catch { return false; }
}
