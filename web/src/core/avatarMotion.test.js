import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMotion, fadeFor } from './avatarMotion.js';

const TRIAL = ['idle', 'idle_chasu', 'walk', 'walk_chasu', 'walk_gassho', 'bow_half', 'prostrate', 'sit'];
const hasOf = (list) => (n) => list.includes(n);
const has = hasOf(TRIAL);

test('경내에서는 차수, 숲길에서는 팔을 흔들며 걷는다', () => {
  assert.equal(pickMotion({ speed: 1.2, zone: 'COURTYARD', has }), 'walk_chasu');
  assert.equal(pickMotion({ speed: 1.2, zone: 'DAEUNGJEON', has }), 'walk_chasu');
  assert.equal(pickMotion({ speed: 1.2, zone: 'FOREST', has }), 'walk');
  assert.equal(pickMotion({ speed: 0, zone: 'COURTYARD', has }), 'idle_chasu');
  assert.equal(pickMotion({ speed: 0, zone: 'FOREST', has }), 'idle');
});

test('탑돌이는 합장하고 걷는다', () => {
  assert.equal(pickMotion({ state: 'circumambulate', speed: 0.95, zone: 'COURTYARD', has }), 'walk_gassho');
});

test('한 번짜리 동작이 걷기·상태보다 먼저', () => {
  assert.equal(pickMotion({ seq: 'prostrate', state: 'sit', speed: 0, has }), 'prostrate');
  assert.equal(pickMotion({ seq: 'bow_half', speed: 2, zone: 'FOREST', has }), 'bow_half');
});

test('기존 상태 이름은 모두 클립이 붙는다 (없는 클립은 가까운 것으로)', () => {
  for (const state of ['idle', 'sit', 'meditate', 'tea', 'circumambulate', 'lookUp', 'walk']) {
    assert.ok(TRIAL.includes(pickMotion({ state, has })), state);
  }
  assert.equal(pickMotion({ state: 'tea', has }), 'sit');
  assert.equal(pickMotion({ seq: 'incense', has }), 'bow_half');
  assert.equal(pickMotion({ state: 'lookUp', zone: 'COURTYARD', has }), 'idle');
});

test('모르는 상태(새 클라이언트가 보낸 이름)는 서 있는 동작으로', () => {
  assert.equal(pickMotion({ state: 'mala_future', zone: 'FOREST', has }), 'idle');
  assert.equal(pickMotion({ seq: 'unknown_once', state: 'idle', zone: 'FOREST', has }), 'idle');
});

test('클립이 하나도 없으면 null (절차식 아바타로 돌아간다)', () => {
  assert.equal(pickMotion({ state: 'sit', has: () => false }), null);
});

test('크로스페이드: 처음은 0, 앉고 서기는 더 길게', () => {
  assert.equal(fadeFor(null, 'idle'), 0);
  assert.ok(fadeFor('idle', 'sit') > fadeFor('idle', 'walk'));
  assert.ok(fadeFor('walk', 'walk_chasu') > 0);
  assert.equal(fadeFor('prostrate', 'sit'), fadeFor('idle', 'sit')); // 큰절은 서서 끝난다
});
