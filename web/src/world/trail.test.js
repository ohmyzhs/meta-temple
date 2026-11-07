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
  gradeAt,
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
  // 안쪽 지형 격자(terrain.js IN: x -62..62, z -78..62) 에서 6.5m(지형 다듬는 폭) 이상 안쪽
  for (const P of PATHS) for (const p of P.pts) assert.ok(p.x > -55.5 && p.x < 55.5 && p.z > -71.5 && p.z < 55.5, `${p.x},${p.z}`);
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
      assert.ok(g <= Math.min(gradeAt(P.pts[i]), gradeAt(P.pts[i - 1])) + 1e-6, `grade ${g} at ${i}`);
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
  for (const k of ['bench', 'stump', 'rocks', 'pavilion', 'lookout', 'bridge', 'spring']) assert.ok(REST_SPOTS.some((s) => s.kind === k), k);
  assert.ok(!REST_SPOTS.some((s) => s.kind === 'mat'), '돗자리는 쉼터가 아니다 (휴식으로 아무 데나 편다)');
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

test('fences_mark_the_trail_edge', async () => {
  const { fenceRuns, FENCE_OFF, LANTERNS, PATH_LAMPS } = await import('./trail.js');
  const runs = fenceRuns();
  const posts = runs.flatMap((r) => r.pts);
  for (const p of posts) {
    // 걸을 수 있는 띠 + 몸 반지름 밖
    assert.ok(nearestTrail(p.x, p.z).d >= TRAIL_HALF + 0.32, `post in walk band ${p.x},${p.z}`);
    assert.ok(!REST_SPOTS.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 2.4), 'post at a rest spot');
    assert.ok(!crossingAt(p.x, p.z, 1), 'post on a crossing');
    assert.ok(!(Math.abs(p.x - forestPathX(p.z)) < 6.5 && p.z > 5 && p.z < 47), 'post on the gate path');
  }
  for (const r of runs.filter((q) => q.path === trail)) for (const p of r.pts) assert.ok(!(p.s > DECK.s0 && p.s < DECK.s1), 'post on the deck');
  // 순환로 양쪽 평균 60% 이상이 울타리·돌담
  const len = runs.filter((r) => r.path === trail).reduce((n, r) => n + (r.pts.at(-1).s - r.pts[0].s), 0) / 2;
  assert.ok(len / trail.length > 0.6, `coverage ${len / trail.length}`);
  assert.ok(runs.some((r) => r.style === 'stone') && runs.some((r) => r.style === 'wood'));
  assert.ok(PATH_LAMPS.length >= 18 && LANTERNS.length === 7);
  assert.ok(FENCE_OFF > TRAIL_HALF + 0.32);
});

test('rest_seats_close_enough_to_count_as_trail', () => {
  // layout.zoneAt 은 산책로 4.2m 안을 숲길로 본다 — 쉼터 앉는 자리가 모두 그 안이어야 앉았을 때 구역이 마당·다실로 바뀌지 않는다
  for (const s of REST_SPOTS) assert.ok(nearestTrail(s.x, s.z).d < 4.0, `${s.id} ${nearestTrail(s.x, s.z).d}`);
});

test('signposts_guide_the_loop', async () => {
  const { SIGNS, loop, fenceRuns, LANTERNS, PATH_LAMPS } = await import('./trail.js');
  assert.ok(SIGNS.length >= 14, `signs ${SIGNS.length}`);
  const posts = fenceRuns().flatMap((r) => r.pts);
  for (const g of SIGNS) {
    assert.ok(nearestTrail(g.x, g.z).d >= TRAIL_HALF + 0.32, `sign in walk band ${g.s}`);
    assert.ok(!REST_SPOTS.some((r) => Math.hypot(r.x - g.x, r.z - g.z) < 2.4), 'sign on a seat');
    assert.ok(!posts.some((p) => Math.hypot(p.x - g.x, p.z - g.z) < 0.5), 'sign on a fence post');
    assert.ok(g.boards.length >= 1 && g.boards.length <= 3);
    for (const b of g.boards) {
      assert.match(b.text, /^\S.* \d+m$/);
      assert.ok(Math.abs(Math.hypot(b.dx, b.dz) - 1) < 1e-6);
    }
  }
  // 쉼터마다 바로 앞에 이름을 단 이정표 (그루터기 둘은 하나)
  for (const r of REST_SPOTS) assert.ok(SIGNS.some((g) => g.boards.some((b) => b.text.startsWith(r.name))), r.id);
  // 이정표 사이가 70m 를 넘지 않는다 (고리를 따라)
  const ss = SIGNS.map((g) => g.s).sort((a, b) => a - b);
  for (let i = 1; i < ss.length; i++) assert.ok(ss[i] - ss[i - 1] < 70, `gap ${ss[i - 1]}→${ss[i]}`);
  assert.ok(loop.length > 440);
});

test('forest_floor_fences_block_and_gaps_open', async () => {
  const { fenceRuns, fenceBarrier, trailDistFar, FLOOR_REACH, FENCE_OFF } = await import('./trail.js');
  // 울타리 기둥과 길 사이(기둥에서 길 쪽 0.3m)는 막혀 있다
  let blocked = 0, total = 0;
  for (const r of fenceRuns()) {
    for (const p of r.pts.slice(1, -1)) {
      const n = r.path.nearest(p.x, p.z);
      const q = { x: p.x + ((n.x - p.x) / n.d) * 0.3, z: p.z + ((n.z - p.z) / n.d) * 0.3 };
      total++;
      if (fenceBarrier(q.x, q.z)) blocked++;
    }
  }
  assert.ok(blocked / total > 0.97, `barrier ${blocked}/${total}`);
  // 쉼터 입구(쉼터 앉는 자리 쪽)는 열려 있다
  for (const s of REST_SPOTS) assert.ok(!fenceBarrier(s.stand.x, s.stand.z), s.id);
  // 길 위는 막이 아니다
  for (let s = 0; s < trail.length; s += 7) { const p = trail.at(s); assert.ok(!fenceBarrier(p.x, p.z)); }
  // 먼 거리 질의 = 가까운 거리 질의 (8m 안), 12m 밖은 Infinity
  for (let s = 5; s < trail.length; s += 37) {
    const p = trail.at(s);
    assert.ok(Math.abs(trailDistFar(p.x + 3, p.z) - nearestTrail(p.x + 3, p.z).d) < 1e-6);
  }
  assert.equal(trailDistFar(200, 200), Infinity);
  assert.ok(FENCE_OFF < FLOOR_REACH);
});
