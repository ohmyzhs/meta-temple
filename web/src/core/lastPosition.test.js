import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLastPosition, writeLastPosition } from './lastPosition.js';

test('last position round trips without accepting invalid or inaccessible storage', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
  const pos = { x: 12.3, z: -4.5, heading: 1.2 };
  assert.equal(readLastPosition(storage), null);
  assert.equal(writeLastPosition(pos, storage), true);
  assert.deepEqual(readLastPosition(storage), pos);
  assert.equal(writeLastPosition({ ...pos, x: Infinity }, storage), false);
  assert.deepEqual(readLastPosition(storage), pos);
  assert.equal(readLastPosition({ getItem: () => '{' }), null);
  assert.equal(writeLastPosition(pos, { setItem: () => { throw Error('blocked'); } }), false);
});
