import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTier, decideTier, netReady, TIER } from './qualityTier.js';

const good = { okAvg: 16.7, slowAvg: 16.7, atCap: true, atFloor: true, ready: true };
const bad = { okAvg: 30, slowAvg: 30, atCap: true, atFloor: true, ready: true };

test('low_goes_high_only_when_ready_and_frames_ok', () => {
  const s = createTier('low');
  assert.equal(decideTier(s, { ...good, now: 0, ready: false }), null); // 자원·망 문이 닫혀 있다
  assert.equal(decideTier(s, { ...good, now: 0, okAvg: null }), null); // 6초 표본이 아직
  assert.equal(decideTier(s, { ...good, now: 0, okAvg: 19 }), null); // 넉넉하지 않다
  assert.equal(decideTier(s, { ...good, now: 0, atCap: false }), null); // 배율을 먼저 다 올린다
  assert.equal(decideTier(s, { ...good, now: 0 }), 'high');
  assert.equal(s.tier, 'high');
});

test('high_drops_only_after_pixel_ratio_reached_floor', () => {
  const s = createTier('high');
  assert.equal(decideTier(s, { ...bad, now: 0, atFloor: false }), null); // 배율부터 내린다
  assert.equal(decideTier(s, { ...bad, now: 0, slowAvg: 21 }), null); // 17.5~22 는 비워 둔 띠
  assert.equal(decideTier(s, { ...bad, now: 0 }), 'low');
});

test('backoff_doubles_then_stops_for_the_visit', () => {
  const s = createTier('low');
  let now = 0;
  const waits = [];
  for (let i = 0; i < TIER.maxDowns; i++) {
    assert.equal(decideTier(s, { ...good, now }), 'high');
    now += 5000;
    assert.equal(decideTier(s, { ...bad, now }), 'low');
    waits.push(s.noUpUntil - now);
    assert.equal(decideTier(s, { ...good, now: now + 1000 }), null); // 바로는 다시 안 올린다
    now = s.noUpUntil;
  }
  assert.deepEqual(waits.slice(0, 2), [120000, 240000]);
  assert.equal(waits[2], Infinity);
  assert.equal(decideTier(s, { ...good, now: 1e12 }), null);
});

test('forced_quality_never_changes', () => {
  for (const q of ['low', 'high']) {
    const s = createTier(q, { forced: true });
    assert.equal(decideTier(s, { ...good, now: 0 }), null);
    assert.equal(decideTier(s, { ...bad, now: 0 }), null);
    assert.equal(s.tier, q);
  }
});

test('net_gate', () => {
  assert.equal(netReady(undefined), true);
  assert.equal(netReady({ effectiveType: '4g' }), true);
  assert.equal(netReady({ effectiveType: '3g' }), false);
  assert.equal(netReady({ effectiveType: '4g', saveData: true }), false);
});
