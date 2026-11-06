import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPathfinder, pathLength } from './pathfind.js';

// 가짜 지도: 20×20m, x = 0 에 남북으로 담 (z 6..7 에만 문)
const wall = (x, z) => !(Math.abs(x) < 0.6 && !(z > 6 && z < 7.4));
const pf = createPathfinder((x, z) => Math.abs(x) < 10 && Math.abs(z) < 10 && wall(x, z), { x0: -10, z0: -10, w: 20, h: 20 });

test('path_goes_through_the_gate', () => {
  const p = pf.find(-5, -5, 5, -5);
  assert.ok(p, 'found');
  assert.deepEqual(p[0], { x: -5, z: -5 });
  assert.deepEqual(p[p.length - 1], { x: 5, z: -5 });
  // 담을 넘는 구간은 문(z 6..7.4)을 지난다
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (Math.sign(a.x) !== Math.sign(b.x) && a.x * b.x < 0) {
      const t = a.x / (a.x - b.x), z = a.z + (b.z - a.z) * t;
      assert.ok(z > 5.9 && z < 7.5, `crosses at z ${z}`);
    }
  }
  assert.ok(pathLength(p) > 24 && pathLength(p) < 27, `length ${pathLength(p)}`); // 곧게 당겨져 문 아래 모서리까지 갔다 오는 길이 (≈ 2·√(5²+11.1²) = 24.4)
  assert.ok(p.length <= 5, `pulled to ${p.length} points`);
});

test('straight_when_open', () => {
  const p = pf.find(-8, -8, -2, 4);
  assert.equal(p.length, 2);
});

test('null_when_no_way', () => {
  const closed = createPathfinder((x, z) => Math.abs(x) > 0.6 && Math.abs(x) < 10 && Math.abs(z) < 10, { x0: -10, z0: -10, w: 20, h: 20 });
  assert.equal(closed.find(-5, 0, 5, 0), null);
});
