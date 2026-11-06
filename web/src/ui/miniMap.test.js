import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMarkers, pickMarker, VIEW } from './miniMap.js';
import { REST_SPOTS, PATHS } from '../world/trail.js';

const ZONES = [
  { id: 'FOREST', short: '숲길', spawn: { x: 0, z: 34 } },
  { id: 'COURTYARD', short: '앞마당', spawn: { x: 0, z: 3 } },
  { id: 'DAEUNGJEON', short: '법당', spawn: { x: 0, z: -21.2 } },
  { id: 'TEAHOUSE', short: '다실', spawn: { x: 19.2, z: -8.4 } }
];

test('markers_cover_zones_and_rest_spots', () => {
  const m = mapMarkers(ZONES);
  assert.equal(m.filter((k) => k.kind === 'zone').length, 4);
  const rest = m.filter((k) => k.kind === 'rest');
  // 그루터기 둘(3.5m 떨어짐)은 하나로, 나머지 쉼터는 모두 따로
  assert.equal(rest.length, REST_SPOTS.length - 1);
  for (const s of REST_SPOTS) assert.ok(rest.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 6), s.id);
  assert.ok(rest.every((k) => k.name));
});

test('every_marker_and_path_inside_the_map', () => {
  for (const k of mapMarkers(ZONES)) assert.ok(k.x > VIEW.x0 + 2 && k.x < VIEW.x0 + VIEW.w - 2 && k.z > VIEW.z0 + 2 && k.z < VIEW.z0 + VIEW.h - 2, k.id);
  for (const P of PATHS) for (const p of P.pts) assert.ok(p.x > VIEW.x0 && p.x < VIEW.x0 + VIEW.w && p.z > VIEW.z0 && p.z < VIEW.z0 + VIEW.h);
});

test('pick_nearest_within_8m', () => {
  const m = mapMarkers(ZONES);
  assert.equal(pickMarker(m, 0.5, 3.5).id, 'COURTYARD');
  const lookout = REST_SPOTS.find((s) => s.id === 'lookout');
  assert.equal(pickMarker(m, lookout.x + 2, lookout.z - 1).id, 'lookout');
  assert.equal(pickMarker(m, -57, 58), null); // 빈 곳
});
