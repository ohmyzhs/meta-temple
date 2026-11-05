import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trail, teaBranch, nearestTrail, forestPathX, J1, J2, SMALL_BRIDGE, REST_SPOTS, TRAIL_HALF, onSmallBridge, inLookoutView } from './trail.js';

test('loop_joins_forest_path', () => {
  const a = trail.pts[0], b = trail.pts[trail.pts.length - 1];
  assert.ok(Math.abs(a.x - forestPathX(a.z)) < 0.05 && Math.abs(a.z - J1.z) < 0.05);
  assert.ok(Math.abs(b.x - forestPathX(b.z)) < 0.05 && Math.abs(b.z - J2.z) < 0.05);
  assert.ok(trail.length > 200, `loop length ${trail.length}`);
});

test('stays_inside_fine_terrain', () => {
  // 안쪽 지형 격자(x -42..62, z -56..58) 에서 4m 이상 안쪽 — 바깥 성긴 격자 위를 걷지 않게
  for (const p of [...trail.pts, ...teaBranch.pts]) {
    assert.ok(p.x > -38 && p.x < 58 && p.z > -52 && p.z < 54, `${p.x},${p.z}`);
  }
});

test('no_sharp_kinks', () => {
  // 표본 간격이 고르고(0.5m 안팎) 이웃 표본 방향이 25° 넘게 꺾이지 않는다
  for (let i = 1; i < trail.pts.length - 1; i++) {
    const a = trail.pts[i - 1], b = trail.pts[i], c = trail.pts[i + 1];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(d < 0.7, `gap ${d} at ${i}`);
    const t1 = Math.atan2(b.x - a.x, b.z - a.z), t2 = Math.atan2(c.x - b.x, c.z - b.z);
    const turn = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
    assert.ok(turn < 0.44, `turn ${turn} at ${i}`);
  }
});

test('bridge_straight', () => {
  const on = trail.pts.filter((p) => p.z > SMALL_BRIDGE.z0 && p.z < SMALL_BRIDGE.z1);
  assert.ok(on.length > 10);
  for (const p of on) assert.ok(Math.abs(p.x - SMALL_BRIDGE.x) < 0.3, `${p.x}`);
  assert.ok(on.every((p) => onSmallBridge(p.x, p.z)));
});

test('nearest_matches_bruteforce', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 500; k++) {
    const x = -40 + rnd() * 80, z = -55 + rnd() * 80;
    let best = Infinity;
    for (const P of [trail, teaBranch]) {
      for (let i = 0; i < P.pts.length - 1; i++) {
        const a = P.pts[i], b = P.pts[i + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(x - a.x - vx * u, z - a.z - vz * u));
      }
    }
    const n = nearestTrail(x, z);
    if (best < 6) assert.ok(n && Math.abs(n.d - best) < 1e-6, `${x},${z}: ${n?.d} vs ${best}`);
  }
});

test('rest_spots_reachable', () => {
  assert.equal(new Set(REST_SPOTS.map((s) => s.id)).size, REST_SPOTS.length);
  for (const k of ['bench', 'stump', 'mat', 'lookout', 'bridge', 'spring']) assert.ok(REST_SPOTS.some((s) => s.kind === k), k);
  for (const s of REST_SPOTS) {
    const n = nearestTrail(s.stand.x, s.stand.z);
    assert.ok(n && n.d <= TRAIL_HALF - 0.4, `${s.id} stand ${n?.d}`);
    assert.ok(Number.isFinite(s.ry) && s.label, s.id);
  }
});

test('lookout_view_open_toward_temple', () => {
  assert.ok(inLookoutView(3, -36)); // 내려다보는 쪽
  assert.ok(!inLookoutView(5, -60)); // 등 뒤
  assert.ok(!inLookoutView(30, -40)); // 옆
});
