import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  trail,
  courtBranch,
  teaBranch,
  PATHS,
  nearestTrail,
  forestPathX,
  J1,
  J2,
  J3,
  CROSSINGS,
  crossingAt,
  DECK,
  deckRise,
  DENSE_FOREST,
  REST_SPOTS,
  TRAIL_HALF,
  MAX_GRADE,
  setTrailProfile,
  inLookoutView
} from './trail.js';

// 높이 단면은 layout.js 가 지형으로 채운다 — 여기서는 가파른 가짜 산(북쪽으로 1m 에 0.6m)으로 상한이 지켜지는지 본다
setTrailProfile((x, z) => Math.max(0, -z - 20) * 0.6 + Math.sin(x * 0.3) * 2);

test('loop_joins_forest_path_and_is_about_twice_as_long', () => {
  const a = trail.pts[0], b = trail.pts[trail.pts.length - 1];
  assert.ok(Math.abs(a.x - forestPathX(a.z)) < 0.05 && Math.abs(a.z - J1.z) < 0.05);
  assert.ok(Math.abs(b.x - forestPathX(b.z)) < 0.05 && Math.abs(b.z - J3.z) < 0.05);
  const c = courtBranch.pts[courtBranch.pts.length - 1];
  assert.ok(Math.abs(c.x - forestPathX(c.z)) < 0.05 && Math.abs(c.z - J2.z) < 0.05);
  // 첫 판(순환로 227m + 숲길 12.7m ≈ 240m)의 두 배 가까이
  const loop = trail.length + (J3.z - J1.z);
  assert.ok(loop > 440, `loop ${loop}`);
  assert.ok(DECK.s1 - DECK.s0 >= 75, 'fir deck long');
  assert.ok(DENSE_FOREST.reduce((n, [s0, s1]) => n + s1 - s0, 0) >= 200, 'dense forest long');
});

test('stays_inside_fine_terrain', () => {
  // 안쪽 지형 격자(terrain.js IN: x -62..62, z -58..62) 에서 6.5m(지형 다듬는 폭) 이상 안쪽
  for (const P of PATHS) for (const p of P.pts) assert.ok(p.x > -55.5 && p.x < 55.5 && p.z > -51.5 && p.z < 55.5, `${p.x},${p.z}`);
});

test('no_sharp_kinks', () => {
  for (const P of PATHS) {
    for (let i = 1; i < P.pts.length - 1; i++) {
      const a = P.pts[i - 1], b = P.pts[i], c = P.pts[i + 1];
      assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 0.7, `gap at ${i}`);
      const t1 = Math.atan2(b.x - a.x, b.z - a.z), t2 = Math.atan2(c.x - b.x, c.z - b.z);
      assert.ok(Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) < 0.5, `turn at ${i}`);
    }
  }
});

test('grade_capped', () => {
  for (const P of PATHS) {
    for (let i = 1; i < P.pts.length; i++) {
      if (crossingAt(P.pts[i].x, P.pts[i].z, 0.3)) continue;
      const g = Math.abs(P.h[i] - P.h[i - 1]) / (P.s[i] - P.s[i - 1]);
      assert.ok(g <= MAX_GRADE + 1e-6, `grade ${g} at ${i}`);
    }
  }
});

test('crossings_straight_and_on_trail', () => {
  for (const c of CROSSINGS) {
    const on = trail.pts.filter((p) => crossingAt(p.x, p.z) === c);
    assert.ok(on.length > 10, c.id);
    for (const p of on) assert.ok(Math.abs(p.x - c.x) < 0.45, `${c.id} ${p.x}`);
    assert.ok(Math.min(...on.map((p) => p.z)) - c.z0 < 0.6 && c.z1 - Math.max(...on.map((p) => p.z)) < 0.6, `${c.id} spans`);
  }
});

test('deck_ramps', () => {
  assert.equal(deckRise(DECK.s0 - 1), 0);
  assert.equal(deckRise(DECK.s1 + 1), 0);
  assert.equal(deckRise((DECK.s0 + DECK.s1) / 2), DECK.rise);
  assert.ok(deckRise(DECK.s0 + DECK.ramp / 2) < DECK.rise * 0.6);
  assert.ok(!CROSSINGS.some((c) => { const p = trail.at(DECK.s1); return crossingAt(p.x, p.z, 1) === c; }), 'deck ends before the bridge');
});

test('nearest_matches_bruteforce', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 500; k++) {
    const x = -55 + rnd() * 110, z = -55 + rnd() * 110;
    let best = Infinity;
    for (const P of PATHS) {
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
    assert.ok(n && n.d <= (s.onDeck ? DECK.halfW - 0.4 : TRAIL_HALF - 0.4), `${s.id} stand ${n?.d}`);
    assert.ok(Number.isFinite(s.ry) && s.label, s.id);
  }
  // 데크 위 벤치는 데크 판 위에
  for (const s of REST_SPOTS.filter((q) => q.onDeck)) {
    const n = nearestTrail(s.x, s.z);
    assert.ok(n.path === trail && n.d < DECK.halfW && deckRise(n.s) === DECK.rise, s.id);
  }
});

test('lookout_view_open_toward_temple', () => {
  const l = REST_SPOTS.find((s) => s.id === 'lookout');
  const a = Math.atan2(l.vista[0] - l.x, l.vista[1] - l.z);
  assert.ok(inLookoutView(l.x + Math.sin(a) * 12, l.z + Math.cos(a) * 12)); // 내려다보는 쪽
  assert.ok(!inLookoutView(l.x - Math.sin(a) * 6, l.z - Math.cos(a) * 6)); // 등 뒤
});
