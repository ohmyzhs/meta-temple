import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findJoinable, placeStone, pickVisible, parsePlace, AREA_CAP, JOIN_RADIUS } from './cairns.js';

const C = (id, x, z, n = 1) => ({ id, x, z, n });
const NEW = 'c_00000000-0000-0000-0000-000000000001';

test('joins_within_1_5m', () => {
  const cairns = [C('a', 0, 0, 3)];
  assert.deepEqual(placeStone(cairns, 1.0, 1.1, NEW), { id: 'a', x: 0, z: 0, isNew: false });
  assert.deepEqual(placeStone(cairns, JOIN_RADIUS, 0, NEW), { id: 'a', x: 0, z: 0, isNew: false }); // 경계 포함
});

test('new_when_farther', () => {
  const cairns = [C('a', 0, 0)];
  assert.deepEqual(placeStone(cairns, 1.2, 1.2, NEW), { id: NEW, x: 1.2, z: 1.2, isNew: true }); // 1.70m
  assert.deepEqual(placeStone([], 5, 5, NEW), { id: NEW, x: 5, z: 5, isNew: true });
});

test('nearest_of_two', () => {
  const cairns = [C('a', 0, 0), C('b', 2, 0)];
  assert.equal(findJoinable(cairns, 1.2, 0).id, 'b');
  assert.equal(findJoinable(cairns, 0.8, 0).id, 'a');
});

test('area_cap_blocks_new_but_not_join', () => {
  const ring = Array.from({ length: AREA_CAP }, (_, i) => C(`r${i}`, 3 * Math.cos(i), 3 * Math.sin(i)));
  assert.deepEqual(placeStone(ring, 0, 0, NEW), { full: true });
  assert.equal(placeStone(ring, ring[0].x + 0.5, ring[0].z, NEW).id, 'r0');
  assert.equal(placeStone(ring.slice(1), 0, 0, NEW).isNew, true);
});

test('visible_nearest_first_with_cell_cap', () => {
  const far = Array.from({ length: 50 }, (_, i) => C(`f${i}`, 97 + i * 0.05, 100)); // 한 칸에 몰린 50개
  const near = [C('n1', 1, 1), C('n2', -3, 2), C('n3', 10, -10)];
  const v = pickVisible([...far, ...near], 0, 0, { max: 10, cell: 8, perCell: 4 });
  assert.deepEqual(v.slice(0, 3).map((c) => c.id), ['n1', 'n2', 'n3']);
  assert.equal(v.filter((c) => c.id.startsWith('f')).length, 4); // 칸 상한
  assert.equal(pickVisible(far, 0, 0, { max: 3, perCell: 99 }).length, 3); // 전체 상한
});

test('parse_place', () => {
  assert.deepEqual(parsePlace({ wish: 'x' }), { place: null });
  assert.deepEqual(parsePlace({ cairnId: NEW, x: -12.3456, z: 20 }), { place: { cairnId: NEW, x: -12.35, z: 20 } });
  assert.equal(parsePlace({ cairnId: 'gate', x: 1, z: 1 }).error, 'bad cairn');
  assert.equal(parsePlace({ cairnId: NEW, x: 'a', z: 1 }).error, 'bad cairn');
  assert.equal(parsePlace({ cairnId: NEW, x: 1e6, z: 1 }).error, 'bad cairn');
  assert.equal(parsePlace({ cairnId: NEW, x: 1 }).error, 'bad cairn');
});
