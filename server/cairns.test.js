import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findJoinable, placeStone, pickVisible, parsePlace, AREA_CAP, JOIN_RADIUS, toRoadside, roadsideOk, roadsideList, nearestPath, ROADSIDE, ROADSIDE_MIN } from './cairns.js';
import { ROADSIDE_GEO as G } from './roadsideGeo.js';
import { buildGeo } from '../tools/roadside-geo.mjs';

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

/* ───── 길가 (사용자 2026-11-08 「길바닥 아무 데나 쌓지 말고 근처 길가로」) ───── */
test('roadside_geo_matches_trail', () => {
  // trail.js(길·석등·쉼터)를 고쳤으면: node tools/roadside-geo.mjs
  assert.deepEqual(G, buildGeo(), 'server/roadsideGeo.js 가 trail.js 와 다르다 — node tools/roadside-geo.mjs 로 다시 만들 것');
});

test('on_path_moves_to_nearest_roadside', () => {
  const p = G.paths[0];
  for (const i of [40, 150, 300]) {
    const x = p[2 * i], z = p[2 * i + 1];
    assert.equal(roadsideOk(x, z, G), false);
    const r = toRoadside(x, z, G);
    assert.equal(r.moved, true);
    assert.ok(roadsideOk(r.x, r.z, G));
    const d = nearestPath(G, r.x, r.z).d;
    assert.ok(d >= ROADSIDE_MIN && d < ROADSIDE + 1.3, `d ${d}`);
    assert.deepEqual(toRoadside(r.x, r.z, G), { x: r.x, z: r.z, moved: false }); // 두 번 옮기지 않는다
  }
});

test('forest_path_keeps_lanterns_and_gate_clear', () => {
  // 실서버의 옛 탑: 일주문 숲길 한가운데(스폰 앞 12층), 숲길 석등 쌍(z 33) 앞, 일주문 바로 앞
  for (const [x, z] of [[0, 35.1], [0, 33.1], [0.93, 26.08]]) {
    const r = toRoadside(x, z, G);
    assert.ok(r.moved && roadsideOk(r.x, r.z, G), `${x},${z}`);
  }
  assert.equal(roadsideOk(2.5 + G.paths[3][0], 33, G), false); // 석등 자리 (숲길 z 33 오른쪽 2.5m 근처)
});

test('far_slope_pulled_to_roadside', () => {
  // 옛 북쪽 길(z −50) 자리 — 길을 중턱으로 옮긴 뒤 13m 밖 비탈에 남은 탑
  const r = toRoadside(5.87, -50.05, G);
  assert.ok(r.moved && nearestPath(G, r.x, r.z).d <= 10);
});

test('roadside_list_spreads_moved_cairns', () => {
  const list = [C('c_a', 0, 35.1, 12), C('c_b', 0, 33.1, 4), C('c_c', 1.64, 34.58, 1), C('c_d', -3.29, 34.62)];
  const out = roadsideList(list, G);
  assert.deepEqual(out.map((c) => [c.id, c.n]), list.map((c) => [c.id, c.n]));
  assert.deepEqual(out[3], list[3]); // 이미 길가인 탑은 그대로
  for (const c of out) assert.ok(roadsideOk(c.x, c.z, G), c.id);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(Math.hypot(out[i].x - out[j].x, out[i].z - out[j].z) >= JOIN_RADIUS - 1e-9);
  assert.deepEqual(roadsideList(out, G), out); // 두 번 해도 같다
  assert.deepEqual(roadsideList([...list].reverse(), G).reverse(), out); // 받은 순서와 상관없이 같다
});
